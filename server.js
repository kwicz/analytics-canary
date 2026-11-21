import express from "express";
import { createSign, randomBytes } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));

// ── Request logging ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      console.log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

app.use(express.static(__dirname));

// ── Session store ────────────────────────────────────────────────────────────
const sessions = new Map(); // sessionId → { token, email, createdAt }

function cleanOldSessions() {
  const cutoff = Date.now() - 3600_000;
  for (const [id, s] of sessions) {
    if (s.createdAt < cutoff) sessions.delete(id);
  }
}

// Accept either a sessionId (from a previous /api/auth call) or a raw accessToken
function resolveToken(body, sessionMap) {
  if (body.sessionId) {
    const s = sessionMap.get(body.sessionId);
    return s ? s.token : null;
  }
  return body.accessToken || null;
}

// ── JWT / Google OAuth2 helpers ──────────────────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function mintGoogleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope:
        "https://www.googleapis.com/auth/tagmanager.readonly https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/bigquery.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const unsigned = `${header}.${claims}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const sig = b64url(sign.sign(sa.private_key));
  const jwt = `${unsigned}.${sig}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error_description || data.error || "Token exchange failed");
  }
  return data.access_token;
}

// ── POST /api/auth ────────────────────────────────────────────────────────────
app.post("/api/auth", async (req, res) => {
  try {
    cleanOldSessions();
    const { serviceAccount } = req.body;
    if (!serviceAccount) return res.status(400).json({ error: "serviceAccount required" });

    let sa;
    try {
      sa = typeof serviceAccount === "string" ? JSON.parse(serviceAccount) : serviceAccount;
    } catch {
      return res.status(400).json({ error: "Invalid JSON in serviceAccount" });
    }

    if (sa.type !== "service_account") {
      return res.status(400).json({ error: "serviceAccount.type must be 'service_account'" });
    }

    const token = await mintGoogleToken(sa);
    const sessionId = randomBytes(16).toString("hex");
    sessions.set(sessionId, { token, email: sa.client_email, createdAt: Date.now() });

    res.json({ sessionId, email: sa.client_email });
  } catch (err) {
    console.error("/api/auth error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth-oauth ──────────────────────────────────────────────────────
app.post("/api/auth-oauth", async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: "accessToken required" });

    // Validate the token with Google and get the associated email
    const infoResp = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    const info = await infoResp.json();
    if (!infoResp.ok || info.error) {
      return res.status(401).json({ error: `Invalid token: ${info.error_description || info.error || "unknown"}` });
    }

    const sessionId = randomBytes(16).toString("hex");
    sessions.set(sessionId, { token: accessToken, email: info.email, createdAt: Date.now() });
    res.json({ sessionId, email: info.email });
  } catch (err) {
    console.error("/api/auth-oauth error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/gtm-list ────────────────────────────────────────────────────────
// Returns all GTM accounts + containers the token can see
app.post("/api/gtm-list", async (req, res) => {
  try {
    const token = resolveToken(req.body, sessions);
    if (!token) return res.status(401).json({ error: "sessionId or accessToken required" });

    const base = "https://www.googleapis.com/tagmanager/v2";
    const accountsData = await gtmFetch(`${base}/accounts`, token);
    const accounts = accountsData.account || [];

    // Sequential (not parallel) to avoid burning GTM quota
    const result = [];
    for (const acct of accounts) {
      const containersData = await gtmFetch(`${base}/${acct.path}/containers`, token);
      result.push({
        accountId: acct.accountId,
        accountName: acct.name,
        containers: (containersData.container || []).map(c => ({
          publicId: c.publicId,
          name: c.name,
          path: c.path, // included so the audit can skip re-enumeration
        })),
      });
    }

    res.json({ accounts: result });
  } catch (err) {
    console.error("/api/gtm-list error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ga4-list ────────────────────────────────────────────────────────
// Returns all GA4 account summaries + properties the token can see
app.post("/api/ga4-list", async (req, res) => {
  try {
    const token = resolveToken(req.body, sessions);
    if (!token) return res.status(401).json({ error: "sessionId or accessToken required" });

    const r = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const txt = await r.text();
      let msg = txt;
      try { msg = JSON.parse(txt).error?.message || txt; } catch {}
      return res.status(r.status).json({ error: msg });
    }
    const data = await r.json();

    const accounts = (data.accountSummaries || []).map(acct => ({
      accountId: acct.account.replace("accounts/", ""),
      accountName: acct.displayName,
      properties: (acct.propertySummaries || [])
        .filter(p => p.propertyType !== "PROPERTY_TYPE_ROLLUP")
        .map(p => ({
          propertyId: p.property.replace("properties/", ""),
          name: p.displayName,
        })),
    }));

    res.json({ accounts });
  } catch (err) {
    console.error("/api/ga4-list error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bq-list ─────────────────────────────────────────────────────────
// Returns all GCP projects the token can see (for BigQuery paste-in labeling)
app.post("/api/bq-list", async (req, res) => {
  try {
    const token = resolveToken(req.body, sessions);
    if (!token) return res.status(401).json({ error: "sessionId or accessToken required" });

    const r = await fetch(
      "https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState%3AACTIVE",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) {
      const txt = await r.text();
      let msg = txt;
      try { msg = JSON.parse(txt).error?.message || txt; } catch {}
      return res.status(r.status).json({ error: msg });
    }
    const data = await r.json();
    const projects = (data.projects || []).map(p => ({
      projectId: p.projectId,
      name: p.name,
    }));
    res.json({ projects });
  } catch (err) {
    console.error("/api/bq-list error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bq-datasets ─────────────────────────────────────────────────────
// Lists all datasets in a GCP project
app.post("/api/bq-datasets", async (req, res) => {
  try {
    const token = resolveToken(req.body, sessions);
    if (!token) return res.status(401).json({ error: "sessionId or accessToken required" });
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const r = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/datasets`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) {
      const txt = await r.text();
      let msg = txt;
      try { msg = JSON.parse(txt).error?.message || txt; } catch {}
      return res.json({ error: msg });
    }
    const data = await r.json();
    const datasets = (data.datasets || []).map(d => ({
      id: d.datasetReference.datasetId,
      location: d.location,
    }));
    res.json({ datasets });
  } catch (err) {
    console.error("/api/bq-datasets error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bq-run ──────────────────────────────────────────────────────────
// Uses jobs.query (synchronous) + getQueryResults — both work with bigquery.readonly scope.
// jobs.insert requires the full bigquery scope, so we avoid it.
app.post("/api/bq-run", async (req, res) => {
  try {
    const token = resolveToken(req.body, sessions);
    if (!token) return res.status(401).json({ error: "sessionId or accessToken required" });
    const { projectId, sql } = req.body;
    if (!projectId || !sql) return res.status(400).json({ error: "projectId and sql required" });

    const parseRows = (rows, schema) => (rows || []).map(row => {
      const obj = {};
      row.f.forEach((cell, idx) => {
        const f = schema[idx];
        const v = cell.v;
        const numeric = ["INTEGER","INT64","FLOAT","FLOAT64","NUMERIC","BIGNUMERIC"].includes(f.type);
        obj[f.name] = numeric && v !== null ? Number(v) : v;
      });
      return obj;
    });

    // Submit via jobs.query (supports bigquery.readonly)
    const qRes = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 30000, maxResults: 2000 }),
      }
    );
    const initial = await qRes.json();
    if (!qRes.ok || initial.error) return res.json({ error: initial.error?.message || `BQ ${qRes.status}` });

    const jobId = initial.jobReference.jobId;
    const loc   = initial.jobReference.location || "US";
    let schema  = initial.schema?.fields || [];
    const allRows = parseRows(initial.rows, schema);
    let pageToken = initial.pageToken || null;

    // If not complete within the 30 s window, keep polling via getQueryResults
    if (!initial.jobComplete) {
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const url = new URL(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries/${jobId}`);
        url.searchParams.set("location", loc);
        url.searchParams.set("timeoutMs", "5000");
        url.searchParams.set("maxResults", "2000");
        const poll = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        if (poll.error) return res.json({ error: poll.error.message });
        if (!schema.length && poll.schema?.fields) schema = poll.schema.fields;
        allRows.push(...parseRows(poll.rows, schema));
        pageToken = poll.pageToken || null;
        if (poll.jobComplete) break;
        if (i === 59) return res.json({ error: "Query timed out after 120 seconds" });
      }
    }

    // Collect remaining pages
    while (pageToken) {
      const url = new URL(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries/${jobId}`);
      url.searchParams.set("location", loc);
      url.searchParams.set("maxResults", "2000");
      url.searchParams.set("pageToken", pageToken);
      const page = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      if (page.error) return res.json({ error: page.error.message });
      if (!schema.length && page.schema?.fields) schema = page.schema.fields;
      allRows.push(...parseRows(page.rows, schema));
      pageToken = page.pageToken || null;
    }

    return res.json({ rows: allRows });
  } catch (err) {
    console.error("/api/bq-run error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GTM helpers ───────────────────────────────────────────────────────────────
const GTM_TYPE_LABELS = {
  googtag: "Google tag (gtag)",
  gaawe: "Google Analytics: GA4 Event",
  gaawc: "Google Analytics: GA4 Configuration",
  html: "Custom HTML",
  ua: "Universal Analytics",
};

const GTM_TRIGGER_TYPE_LABELS = {
  PAGEVIEW: "Page View",
  CLICK: "Click",
  CUSTOM_EVENT: "Custom Event",
  ELEMENT_VISIBILITY: "Element Visibility",
};

const GTM_VAR_TYPE_LABELS = {
  v: "Data Layer Variable",
  j: "JavaScript Variable",
  k: "First-Party Cookie",
  c: "Constant",
  jsm: "Custom JavaScript",
};

const ALL_PAGES_TRIGGER_ID = "2147479553";

async function gtmFetch(url, token, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (r.status === 429) {
      if (attempt === retries) {
        throw new Error("GTM API 429: Quota exceeded — please wait 60 seconds and try again.");
      }
      // Honour Retry-After if present, otherwise back off exponentially (2s, 4s, 8s, 16s)
      const retryAfter = parseInt(r.headers.get("Retry-After") || "0", 10);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt + 1) * 1000;
      console.log(`GTM 429 on ${url} — waiting ${waitMs}ms before retry ${attempt + 1}/${retries}`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    if (!r.ok) {
      const txt = await r.text();
      let msg = txt.slice(0, 300);
      try { msg = JSON.parse(txt).error?.message || msg; } catch {}
      throw new Error(`GTM API ${r.status}: ${msg}`);
    }

    return r.json();
  }
}

function transformGTMVersion(version) {
  const triggerMap = {};
  for (const t of version.trigger || []) {
    triggerMap[t.triggerId] = t.name;
  }

  const gtmTags = (version.tag || []).map((tag) => {
    const paused = tag.paused === true;
    const firingIds = tag.firingTriggerId || [];
    const hasTrigger = firingIds.length > 0;

    const triggerNames = firingIds.map((id) =>
      id === ALL_PAGES_TRIGGER_ID ? "All Pages" : triggerMap[id] || id
    );

    let status = "firing";
    let notes = "";
    if (paused) {
      status = "notfiring";
      notes = "Tag is paused";
    } else if (!hasTrigger) {
      status = "notfiring";
      notes = "No firing trigger configured";
    }

    return {
      name: tag.name,
      type: GTM_TYPE_LABELS[tag.type] || tag.type,
      trigger: triggerNames.join(", ") || "—",
      status,
      lastFired: "—",
      notes,
    };
  });

  const gtmTriggers = (version.trigger || []).map((trig) => {
    const tagCount = (version.tag || []).filter(
      (t) => (t.firingTriggerId || []).includes(trig.triggerId)
    ).length;
    return {
      name: trig.name,
      type: GTM_TRIGGER_TYPE_LABELS[trig.type] || trig.type,
      tags: tagCount,
      status: "ok",
      note: "",
    };
  });

  const gtmVariables = (version.variable || []).map((v) => ({
    name: v.name,
    type: GTM_VAR_TYPE_LABELS[v.type] || v.type,
    status: "ok",
    note: "",
  }));

  // ── Smart findings ─────────────────────────────────────────────
  const findings = [];
  const rawTags = version.tag || [];

  // 1. Universal Analytics tags — dead since July 2023
  const uaTags = rawTags.filter((t) => t.type === "ua");
  if (uaTags.length > 0) {
    const names = uaTags.map((t) => t.name).join(", ");
    findings.push({
      severity: "critical",
      module: "GTM",
      id: "gtm-ua-tags",
      title: `${uaTags.length} Universal Analytics tag${uaTags.length > 1 ? "s" : ""} still active in container`,
      desc: `UA was sunset in July 2023 — these tags send no data but add parse overhead on every page: ${names}. They also make the container harder to audit.`,
      fix: "Delete the UA tags after confirming all their events have GA4 equivalents. Container version history retains them if rollback is ever needed.",
    });
    // Flag UA tags in the table
    for (const tag of gtmTags) {
      if (uaTags.find((r) => r.name === tag.name)) {
        tag.status = "warn";
        tag.notes = tag.notes || "Universal Analytics tag — UA is sunset, this fires nothing.";
      }
    }
  }

  // 2. GA4 Configuration tag count
  const ga4ConfigTags = rawTags.filter((t) => t.type === "gaawc");
  const ga4EventTags  = rawTags.filter((t) => t.type === "gaawe");
  if (ga4ConfigTags.length === 0 && ga4EventTags.length > 0) {
    findings.push({
      severity: "critical",
      module: "GTM",
      id: "gtm-no-ga4-config",
      title: "No GA4 Configuration tag found",
      desc: "The container has GA4 Event tags but no GA4 Configuration tag. Without a config tag specifying the Measurement ID, all GA4 events are silently dropped.",
      fix: "Add a GA4 Configuration tag with the correct Measurement ID, wired to the All Pages trigger (or DOM Ready if consent mode is active).",
    });
  } else if (ga4ConfigTags.length > 1) {
    const names = ga4ConfigTags.map((t) => t.name).join(", ");
    findings.push({
      severity: "warning",
      module: "GTM",
      id: "gtm-multiple-ga4-config",
      title: `${ga4ConfigTags.length} GA4 Configuration tags in the same container`,
      desc: `Each config tag fires its own page_view event — with ${ga4ConfigTags.length} config tags (${names}), every page load sends ${ga4ConfigTags.length} page_views and inflates session counts.`,
      fix: "Keep exactly one GA4 Configuration tag. Use a lookup table variable for the Measurement ID to handle staging vs. production environments.",
    });
    for (const tag of gtmTags) {
      if (ga4ConfigTags.find((r) => r.name === tag.name)) {
        tag.status = "warn";
        tag.notes = tag.notes || "Multiple GA4 Configuration tags — each fires a duplicate page_view.";
      }
    }
  }

  // 3. Triggers with no tags wired
  const unusedTriggers = gtmTriggers.filter((t) => t.tags === 0);
  if (unusedTriggers.length > 0) {
    const names = unusedTriggers.map((t) => t.name).join(", ");
    findings.push({
      severity: "info",
      module: "GTM",
      id: "gtm-unused-triggers",
      title: `${unusedTriggers.length} trigger${unusedTriggers.length > 1 ? "s" : ""} have no tags wired`,
      desc: `These triggers exist but nothing fires on them: ${names}. Dead triggers add clutter and occasionally get accidentally re-wired during edits.`,
      fix: "Confirm no tag will use these triggers in the near future, then delete them. Container history retains them.",
    });
    for (const t of unusedTriggers) t.status = "stale";
  }

  // Recompute counts after status mutations
  const firing    = gtmTags.filter((t) => t.status === "firing").length;
  const notFiring = gtmTags.filter((t) => t.status === "notfiring").length;
  const broken    = gtmTags.filter((t) => t.status === "broken" || t.status === "misconfig").length;
  const warn      = gtmTags.filter((t) => t.status === "warn").length;

  const gtmCounts = {
    total: gtmTags.length,
    firing,
    broken,
    notFiring,
    warn,
  };

  return { gtmTags, gtmTriggers, gtmVariables, gtmCounts, findings };
}

// ── POST /api/gtm ─────────────────────────────────────────────────────────────
app.post("/api/gtm", async (req, res) => {
  try {
    const { sessionId, containerId, containerPath: providedPath } = req.body;
    if (!sessionId || !containerId) {
      return res.status(400).json({ error: "sessionId and containerId required" });
    }

    const session = sessions.get(sessionId);
    if (!session) return res.status(401).json({ error: "Invalid or expired session" });

    const { token } = session;
    const base = "https://www.googleapis.com/tagmanager/v2";

    // If the client already knows the container path (from gtm-list), skip enumeration entirely
    let containerPath = providedPath || null;

    if (!containerPath) {
      // Fall back: search all accounts/containers (expensive — ~20 API calls for agency accounts)
      const accountsData = await gtmFetch(`${base}/accounts`, token);
      const accounts = accountsData.account || [];

      for (const acct of accounts) {
        const containersData = await gtmFetch(`${base}/${acct.path}/containers`, token);
        const containers = containersData.container || [];
        const match = containers.find((c) => c.publicId === containerId);
        if (match) {
          containerPath = match.path;
          break;
        }
      }
    }

    if (!containerPath) {
      return res.status(404).json({ error: `Container ${containerId} not found` });
    }

    const liveVersion = await gtmFetch(`${base}/${containerPath}/versions:live`, token);
    const result = transformGTMVersion(liveVersion);
    res.json(result);
  } catch (err) {
    console.error("/api/gtm error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GA4 helpers ───────────────────────────────────────────────────────────────
const ALWAYS_INCLUDE_EVENTS = [
  "view_promotion",
  "select_promotion",
  "remove_from_cart",
  "view_cart",
];

const MISSING_EVENTS_REASONS = {
  view_promotion: "Tracks whether promotional banners are driving engagement.",
  select_promotion: "Captures clicks on promotions — key for merchandising ROI.",
  remove_from_cart: "Monitors cart abandonment signals for funnel analysis.",
  view_cart: "Required for full ecommerce funnel (view → checkout → purchase).",
  view_item_list: "Shows which product lists drive discovery and revenue.",
};

const CONVERSION_EVENTS = new Set([
  "purchase",
  "begin_checkout",
  "sign_up",
  "generate_lead",
  "newsletter_signup",
]);

async function ga4Report(propertyId, token, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    let msg = txt.slice(0, 300);
    try { msg = JSON.parse(txt).error?.message || msg; } catch {}
    throw new Error(`GA4 API ${r.status}: ${msg}`);
  }
  return r.json();
}

function parseGA4Report(data) {
  const result = {};
  if (!data.rows) return result;
  for (const row of data.rows) {
    const name = row.dimensionValues[0].value;
    const count = parseInt(row.metricValues[0].value, 10) || 0;
    result[name] = (result[name] || 0) + count;
  }
  return result;
}

function parseGA4DailyReport(data) {
  // Returns { eventName: { YYYYMMDD: count } }
  const result = {};
  if (!data.rows) return result;
  for (const row of data.rows) {
    const name = row.dimensionValues[0].value;
    const date = row.dimensionValues[1].value;
    const count = parseInt(row.metricValues[0].value, 10) || 0;
    if (!result[name]) result[name] = {};
    result[name][date] = (result[name][date] || 0) + count;
  }
  return result;
}

function getLast15Days() {
  const dates = [];
  for (let i = 14; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}${m}${day}`);
  }
  return dates;
}

function buildSpark(eventName, dailyMap) {
  const dates = getLast15Days();
  const days = dailyMap[eventName] || {};
  const counts = dates.map((d) => days[d] || 0);
  const maxVal = Math.max(...counts, 1);
  return counts.map((c) => Math.round((c / maxVal) * 100));
}

function transformGA4(counts30, counts7, dailyMap) {
  const allNames = new Set([
    ...Object.keys(counts30),
    ...Object.keys(counts7),
    ...ALWAYS_INCLUDE_EVENTS,
  ]);

  const events = [];
  for (const name of allNames) {
    const h30 = counts30[name] || 0;
    const h7 = counts7[name] || 0;

    let status = "ok";
    let note = "";
    if (h7 === 0 && h30 > 0) {
      status = "crit";
      note = `No hits in last 7 days (had ${h30.toLocaleString()} in last 30).`;
    } else if (h7 < (h30 / 30) * 7 * 0.4) {
      if (h30 > 0) {
        status = "warn";
        note = `7-day volume is significantly below 30-day average.`;
      } else {
        status = "info";
        note = "Event not observed in last 30 days.";
      }
    } else if (h30 === 0) {
      status = "info";
      note = "Event not observed in last 30 days.";
    }

    events.push({
      name,
      h7,
      h30,
      conversion: false,
      status,
      spark: buildSpark(name, dailyMap),
      note,
    });
  }

  // Sort by h30 descending
  events.sort((a, b) => b.h30 - a.h30);

  const ga4MissingEvents = ["view_promotion", "select_promotion", "remove_from_cart", "view_cart", "view_item_list"]
    .filter((n) => (counts30[n] || 0) === 0)
    .map((n) => ({ name: n, why: MISSING_EVENTS_REASONS[n] || "" }));

  const ga4Conversions = events
    .filter((e) => CONVERSION_EVENTS.has(e.name) && e.h30 > 0)
    .map((e) => ({
      name: e.name,
      h7: e.h7,
      conversionRate: "—",
      status: e.status,
      note: e.note,
    }));

  const findings = [];
  for (const e of events) {
    if (e.status === "crit") {
      findings.push({
        severity: "critical",
        module: "GA4",
        id: `ga4-${e.name}`,
        title: `${e.name} — no hits in 7 days`,
        desc: `The event "${e.name}" had ${e.h30.toLocaleString()} hits in the last 30 days but zero in the last 7. This indicates a recent tracking outage.`,
        fix: `Check GTM tag for "${e.name}", verify the trigger is firing on the expected pages, and confirm the event appears in GA4 DebugView.`,
      });
    } else if (e.status === "warn") {
      findings.push({
        severity: "warning",
        module: "GA4",
        id: `ga4-${e.name}`,
        title: `${e.name} — below expected volume`,
        desc: `The event "${e.name}" is firing but at significantly lower volume than its 30-day baseline. This may indicate partial tag breakage.`,
        fix: `Audit the GTM trigger conditions for "${e.name}" and check for recent changes to page structure or URL patterns.`,
      });
    }
  }

  if (ga4MissingEvents.length > 0) {
    findings.push({
      severity: "info",
      module: "GA4",
      id: "ga4-missing-ecommerce",
      title: `Missing ecommerce events: ${ga4MissingEvents.map((e) => e.name).join(", ")}`,
      desc: `${ga4MissingEvents.length === 1 ? "This event has" : "These events have"} zero hits in the last 30 days, leaving gaps in ecommerce funnel reporting.`,
      fix: "Implement using the GA4 ecommerce data layer spec: https://developers.google.com/analytics/devguides/collection/ga4/ecommerce",
    });
  }

  // ── Funnel sanity checks ───────────────────────────────────────
  const purchaseCount      = counts30.purchase       || 0;
  const beginCheckoutCount = counts30.begin_checkout || 0;
  const addToCartCount     = counts30.add_to_cart    || 0;
  const pageViewCount      = counts30.page_view      || 0;
  const sessionStartCount  = counts30.session_start  || 0;

  // Impossible: more purchases than checkouts
  if (purchaseCount > 0 && beginCheckoutCount > 0 && purchaseCount > beginCheckoutCount) {
    findings.unshift({
      severity: "critical",
      module: "GA4",
      id: "ga4-funnel-impossible",
      title: "More purchases than begin_checkout events — impossible funnel",
      desc: `${purchaseCount.toLocaleString()} purchase events vs ${beginCheckoutCount.toLocaleString()} begin_checkout events in the last 30 days. A purchase cannot occur without a checkout — this confirms duplicate purchase event firing (e.g. tag fires on thank-you page refresh or back navigation).`,
      fix: "Add a de-duplication condition to the purchase tag (e.g. fire once per transaction_id). Check for thank-you page reloads or back-navigation that re-triggers the GTM dataLayer push.",
    });
  }

  // Double-firing signal: session_start significantly exceeds page_view
  if (pageViewCount > 1000 && sessionStartCount > pageViewCount * 1.25) {
    const ratio = (sessionStartCount / pageViewCount).toFixed(2);
    findings.push({
      severity: "warning",
      module: "GA4",
      id: "ga4-session-overflow",
      title: "Session starts exceed page views — possible GA4 double-firing",
      desc: `${sessionStartCount.toLocaleString()} session_start vs ${pageViewCount.toLocaleString()} page_view events (${ratio}× ratio). Normally sessions ≤ page views. This pattern usually means the GA4 config tag (or the entire GTM container) loads more than once per page.`,
      fix: "Audit the page source for duplicate GTM container snippets. Verify the GA4 Configuration tag has no extra firing conditions. Check for dynamically injected gtag.js calls from third-party scripts.",
    });
  }

  return { ga4Events: events, ga4MissingEvents, ga4Conversions, findings };
}

// ── POST /api/ga4 ─────────────────────────────────────────────────────────────
app.post("/api/ga4", async (req, res) => {
  try {
    const { sessionId, propertyId: rawId } = req.body;
    if (!sessionId || !rawId) {
      return res.status(400).json({ error: "sessionId and propertyId required" });
    }

    const session = sessions.get(sessionId);
    if (!session) return res.status(401).json({ error: "Invalid or expired session" });

    // Clean up property ID: strip G- prefix, properties/ prefix, non-digits
    const propertyId = String(rawId)
      .replace(/^G-/i, "")
      .replace(/^properties\//i, "")
      .replace(/\D/g, "");

    if (!propertyId) {
      return res.status(400).json({ error: "Could not parse a numeric property ID" });
    }

    const { token } = session;

    const [report30, report7, reportDaily] = await Promise.all([
      ga4Report(propertyId, token, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        limit: 200,
      }),
      ga4Report(propertyId, token, {
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        limit: 200,
      }),
      ga4Report(propertyId, token, {
        dateRanges: [{ startDate: "14daysAgo", endDate: "today" }],
        dimensions: [{ name: "eventName" }, { name: "date" }],
        metrics: [{ name: "eventCount" }],
        limit: 5000,
      }),
    ]);

    const counts30 = parseGA4Report(report30);
    const counts7 = parseGA4Report(report7);
    const dailyMap = parseGA4DailyReport(reportDaily);

    const result = transformGA4(counts30, counts7, dailyMap);
    res.json(result);
  } catch (err) {
    console.error("/api/ga4 error:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── Serve index.html for / ────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Analytics Canary running at http://localhost:${PORT}`);
});
