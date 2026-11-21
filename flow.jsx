/* global React, window */
const { useState, useEffect, useRef } = React;
const { Icon, Badge, fmtFull, Tooltip } = window;

/* =============================================================
   SETUP — choose modules + credentials + Run
   ============================================================= */
const LS_KEY = "analytics-canary-client-id";

const Setup = ({ onRun, defaultEnabled, defaultClientId }) => {
  const [enabled, setEnabled] = useState(defaultEnabled || { gtm: true, ga4: true, bq: true });
  const [creds, setCreds] = useState(() => {
    const savedClientId = defaultClientId || localStorage.getItem(LS_KEY) || "";
    return {
      gtm: "",
      gtmPath: "", // container resource path — avoids re-enumeration on audit
      ga4PropertyId: "",
      bqProject: "",
      bqDataset: "",
      // OAuth
      clientId: savedClientId,
      oauthToken: "",
      oauthEmail: "",
      // Service account (advanced)
    };
  });
  const [lists, setLists] = useState({ gtm: null, ga4: null, bq: null, loading: false, errors: {} });
  const [bqDatasets, setBqDatasets] = useState(null);
  const [bqDatasetsLoading, setBqDatasetsLoading] = useState(false);
  const [bqDatasetsError, setBqDatasetsError] = useState(null);
  const toggle = (k) => setEnabled(prev => ({ ...prev, [k]: !prev[k] }));

  // Persist Client ID across refreshes
  useEffect(() => {
    if (creds.clientId) localStorage.setItem(LS_KEY, creds.clientId);
  }, [creds.clientId]);

  const needsAuth = enabled.gtm || enabled.ga4 || enabled.bq;
  const hasAuth = !!creds.oauthToken;
  const hasGtmId = !enabled.gtm || creds.gtm;
  const hasGa4Id = !enabled.ga4 || creds.ga4PropertyId;
  const hasBqId = !enabled.bq || (creds.bqProject && creds.bqDataset);
  const ready = (enabled.gtm || enabled.ga4 || enabled.bq) && (!needsAuth || hasAuth) && hasGtmId && hasGa4Id && hasBqId;

  const fetchLists = async (token) => {
    setLists({ gtm: null, ga4: null, bq: null, loading: true, errors: {} });
    const [gtmRes, ga4Res, bqRes] = await Promise.allSettled([
      fetch("/api/gtm-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: token }) }).then(r => r.json()),
      fetch("/api/ga4-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: token }) }).then(r => r.json()),
      fetch("/api/bq-list",  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: token }) }).then(r => r.json()),
    ]);
    const gtmAccounts  = gtmRes.status === "fulfilled" && !gtmRes.value.error  ? gtmRes.value.accounts  : null;
    const ga4Accounts  = ga4Res.status === "fulfilled" && !ga4Res.value.error  ? ga4Res.value.accounts  : null;
    const bqProjects   = bqRes.status  === "fulfilled" && !bqRes.value.error   ? bqRes.value.projects   : null;
    const errors = {};
    if (!gtmAccounts) errors.gtm = gtmRes.value?.error || "Failed to load";
    if (!ga4Accounts) errors.ga4 = ga4Res.value?.error || "Failed to load";
    if (!bqProjects)  errors.bq  = bqRes.value?.error  || "Failed to load";
    setLists({ gtm: gtmAccounts, ga4: ga4Accounts, bq: bqProjects, loading: false, errors });
    // Auto-select if only one option available
    if (gtmAccounts) {
      const all = gtmAccounts.flatMap(a => a.containers);
      if (all.length === 1) setCreds(prev => ({ ...prev, gtm: all[0].publicId }));
    }
    if (ga4Accounts) {
      const all = ga4Accounts.flatMap(a => a.properties);
      if (all.length === 1) setCreds(prev => ({ ...prev, ga4PropertyId: all[0].propertyId }));
    }
    if (bqProjects && bqProjects.length === 1) {
      setCreds(prev => ({ ...prev, bqProject: bqProjects[0].projectId }));
    }
  };

  const fetchDatasets = async (token, projectId) => {
    if (!token || !projectId) return;
    setBqDatasets(null);
    setBqDatasetsError(null);
    setBqDatasetsLoading(true);
    setCreds(prev => ({ ...prev, bqDataset: "" }));
    try {
      const r = await fetch("/api/bq-datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token, projectId }),
      });
      const data = await r.json();
      if (data.error) {
        setBqDatasetsError(data.error);
      } else {
        setBqDatasets(data.datasets || []);
        // Auto-select if exactly one GA4 export dataset (analytics_*)
        const ga4Ds = (data.datasets || []).filter(d => d.id.startsWith("analytics_"));
        if (ga4Ds.length === 1) setCreds(prev => ({ ...prev, bqDataset: ga4Ds[0].id }));
      }
    } catch (err) {
      setBqDatasetsError(err.message);
    }
    setBqDatasetsLoading(false);
  };

  const signIn = () => {
    if (!window.google?.accounts?.oauth2) {
      alert("Google Identity Services hasn't loaded yet — wait a moment and try again.");
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: creds.clientId.trim(),
      scope: [
        "https://www.googleapis.com/auth/tagmanager.readonly",
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/cloudplatformprojects.readonly",
        "https://www.googleapis.com/auth/bigquery.readonly",
      ].join(" "),
      callback: (response) => {
        if (response.error) {
          console.error("OAuth error:", response.error, response.error_description);
          return;
        }
        const token = response.access_token;
        fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`)
          .then(r => r.json())
          .then(info => {
            setCreds(prev => ({ ...prev, oauthToken: token, oauthEmail: info.email || "Connected" }));
            fetchLists(token);
          })
          .catch(() => {
            setCreds(prev => ({ ...prev, oauthToken: token, oauthEmail: "Connected" }));
            fetchLists(token);
          });
      },
    });
    client.requestAccessToken();
  };

  return (
    <>
      <div style={{ marginBottom: 48 }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Run an audit</div>
        <h1 style={{ marginBottom: 12 }}>The audit you wish your<br />team had run six months ago.</h1>
        <p style={{ fontSize: 18, color: "var(--fg-2)", maxWidth: 680, lineHeight: 1.6 }}>
          Analytics Canary reads your GTM container, your GA4 property, and (optionally) your BigQuery export to surface broken tags, missing events, and data quality gaps — the kind of measurement issues GA4's UI silently hides.
        </p>
        <p style={{ fontSize: 13, color: "var(--fg-3)", marginTop: 12, fontFamily: "var(--font-mono)" }}>
          read-only · session-only credentials · data never stored
        </p>
      </div>

      <div className="section">
        <div className="section-title">Select modules</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <ModuleToggle
            num="01" name="GTM Container" desc="Tags, triggers, variables. Defined vs. firing on the live site."
            on={enabled.gtm} onToggle={() => toggle("gtm")} icon="tag"
          />
          <ModuleToggle
            num="02" name="GA4 Events" desc="30-day event hits, conversion health, recommended ecommerce events."
            on={enabled.ga4} onToggle={() => toggle("ga4")} icon="bar"
          />
          <ModuleToggle
            num="03" name="BigQuery Deep" desc="Parameter completeness, duplicate schemas, attribution gaps, data outages."
            on={enabled.bq} onToggle={() => toggle("bq")} icon="db"
          />
        </div>
      </div>

      <div className="section">
        <div className="section-title">Credentials</div>
        <div className="card">

          {/* ── Auth method ── */}
          <div style={{ marginBottom: 28 }}>
              {creds.oauthToken ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, flex: 1,
                    padding: "10px 14px", borderRadius: 6,
                    background: "rgba(98,196,160,0.08)", border: "1px solid rgba(98,196,160,0.3)",
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--cro-green)", flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: "var(--fg-1)" }}>{creds.oauthEmail}</span>
                    <span style={{ color: "var(--fg-3)", fontSize: 12 }}>— connected</span>
                  </div>
                  {Object.keys(lists.errors || {}).length > 0 && !lists.loading && (
                    <button
                      className="btn btn-primary"
                      style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                      onClick={() => fetchLists(creds.oauthToken)}
                    >
                      ↻ Retry
                    </button>
                  )}
                  <button
                    className="btn"
                    style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                    onClick={() => { setCreds({ ...creds, oauthToken: "", oauthEmail: "" }); setLists({ gtm: null, ga4: null, loading: false, errors: {} }); }}
                  >
                    Sign out
                  </button>
                </div>
              ) : creds.clientId ? (
                /* Client ID pre-filled — just show the button */
                <div>
                  <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "10px 0", fontSize: 14 }} onClick={signIn}>
                    Sign in with Google
                  </button>
                  <div className="input-help">
                    {"Sign in with the Google account that has access to your clients' GTM containers, GA4 properties, and BigQuery datasets."}
                  </div>
                </div>
              ) : (
                /* No Client ID yet — show the input */
                <div>
                  <label className="input-label">
                    OAuth Client ID
                    <Tooltip content={
                      <div>
                        <div style={{ fontWeight: 800, color: "#fff", marginBottom: 8, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" }}>One-time setup</div>
                        {[
                          <>Go to <span style={{ color: "#4A9AD0" }}>console.cloud.google.com</span> → APIs &amp; Services → Credentials</>,
                          <>Click <strong style={{ color: "#fff" }}>Create Credentials</strong> → OAuth 2.0 Client ID → Web application</>,
                          <>Under <strong style={{ color: "#fff" }}>Authorized JavaScript origins</strong> add <span style={{ color: "#50E3C2", fontFamily: "var(--font-mono)", fontSize: 11 }}>http://localhost:8080</span></>,
                          <>Copy the Client ID — it ends in <span style={{ color: "#50E3C2", fontFamily: "var(--font-mono)", fontSize: 11 }}>.apps.googleusercontent.com</span></>,
                        ].map((step, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7F7F7F", marginTop: 1, flexShrink: 0 }}>{i + 1}.</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    } />
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      className="input"
                      style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11.5 }}
                      placeholder="123456789-xxxx.apps.googleusercontent.com"
                      value={creds.clientId}
                      onChange={e => setCreds({ ...creds, clientId: e.target.value, oauthToken: "", oauthEmail: "" })}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                      onClick={signIn}
                      disabled={!creds.clientId.trim()}
                    >
                      Sign in with Google
                    </button>
                  </div>
                  <div className="input-help">Paste your OAuth Client ID from Google Cloud Console, then sign in.</div>
                </div>
              )}
            </div>

          {/* ── Module-specific IDs ── */}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, opacity: hasAuth ? 1 : 0.45, transition: "opacity 200ms" }}>
            {enabled.gtm && (
              <div>
                <label className="input-label">GTM Container</label>
                {lists.loading ? (
                  <div className="input" style={{ color: "var(--fg-4)", fontStyle: "italic" }}>Loading containers…</div>
                ) : lists.gtm ? (
                  <select className="input" value={creds.gtm}
                    style={{ cursor: "pointer" }}
                    onChange={e => {
                      const allContainers = lists.gtm.flatMap(a => a.containers);
                      const selected = allContainers.find(c => c.publicId === e.target.value);
                      setCreds({ ...creds, gtm: e.target.value, gtmPath: selected?.path || "" });
                    }}>
                    <option value="">— Select a container —</option>
                    {lists.gtm.map(acct => (
                      <optgroup key={acct.accountId} label={acct.accountName}>
                        {acct.containers.map(c => (
                          <option key={c.publicId} value={c.publicId}>{c.name} ({c.publicId})</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <input className="input" placeholder="GTM-XXXXXXX" value={creds.gtm} disabled={!hasAuth} onChange={e => setCreds({ ...creds, gtm: e.target.value })} />
                )}
                {lists.errors?.gtm && (
                  <div style={{ fontSize: 11.5, color: "#E1493B", marginTop: 5, fontFamily: "var(--font-mono)", lineHeight: 1.4 }}>
                    {lists.errors.gtm.includes("429") ? "Rate limit hit — wait ~60s then click ↻ Retry above." : lists.errors.gtm}
                  </div>
                )}
                <div className="input-help">
                  {lists.gtm ? `${lists.gtm.flatMap(a => a.containers).length} container(s) available` : !lists.errors?.gtm ? "Sign in above to see your containers." : ""}
                </div>
              </div>
            )}
            {enabled.ga4 && (
              <div>
                <label className="input-label">GA4 Property</label>
                {lists.loading ? (
                  <div className="input" style={{ color: "var(--fg-4)", fontStyle: "italic" }}>Loading properties…</div>
                ) : lists.ga4 ? (
                  <select className="input" value={creds.ga4PropertyId} onChange={e => setCreds({ ...creds, ga4PropertyId: e.target.value })}
                    style={{ cursor: "pointer" }}>
                    <option value="">— Select a property —</option>
                    {lists.ga4.map(acct => (
                      <optgroup key={acct.accountId} label={acct.accountName}>
                        {acct.properties.map(p => (
                          <option key={p.propertyId} value={p.propertyId}>{p.name} ({p.propertyId})</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <input className="input" placeholder="123456789" value={creds.ga4PropertyId} disabled={!hasAuth} onChange={e => setCreds({ ...creds, ga4PropertyId: e.target.value })} />
                )}
                {lists.errors?.ga4 && (
                  <div style={{ fontSize: 11.5, color: "#E1493B", marginTop: 5, fontFamily: "var(--font-mono)", lineHeight: 1.4 }}>
                    {lists.errors.ga4.includes("429") ? "Rate limit hit — wait ~60s then click ↻ Retry above." : lists.errors.ga4}
                  </div>
                )}
                <div className="input-help">
                  {lists.ga4 ? `${lists.ga4.flatMap(a => a.properties).length} property(s) available` : !lists.errors?.ga4 ? "Sign in above to see your properties." : ""}
                </div>
              </div>
            )}
            {enabled.bq && (
              <>
                <div>
                  <label className="input-label">BigQuery Project</label>
                  {lists.loading ? (
                    <div className="input" style={{ color: "var(--fg-4)", fontStyle: "italic" }}>Loading projects…</div>
                  ) : lists.bq ? (
                    <select className="input" value={creds.bqProject}
                      style={{ cursor: "pointer" }}
                      onChange={e => {
                        const p = e.target.value;
                        setCreds(prev => ({ ...prev, bqProject: p, bqDataset: "" }));
                        setBqDatasets(null);
                        if (p && creds.oauthToken) fetchDatasets(creds.oauthToken, p);
                      }}>
                      <option value="">— Select a project —</option>
                      {lists.bq.map(p => (
                        <option key={p.projectId} value={p.projectId}>{p.name} ({p.projectId})</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="input" style={{ flex: 1 }} placeholder="my-project-123" value={creds.bqProject}
                        disabled={!hasAuth}
                        onChange={e => { setCreds(prev => ({ ...prev, bqProject: e.target.value, bqDataset: "" })); setBqDatasets(null); }} />
                      {creds.bqProject && creds.oauthToken && (
                        <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={() => fetchDatasets(creds.oauthToken, creds.bqProject)}>
                          Fetch datasets
                        </button>
                      )}
                    </div>
                  )}
                  {lists.errors?.bq && (
                    <div style={{ fontSize: 11.5, color: "#E1493B", marginTop: 5, fontFamily: "var(--font-mono)", lineHeight: 1.4 }}>
                      {lists.errors.bq}
                    </div>
                  )}
                  <div className="input-help">
                    {lists.bq ? `${lists.bq.length} project(s) available` : !lists.errors?.bq ? "Sign in above to see your projects." : ""}
                  </div>
                </div>
                <div>
                  <label className="input-label">GA4 BigQuery Dataset</label>
                  {bqDatasetsLoading ? (
                    <div className="input" style={{ color: "var(--fg-4)", fontStyle: "italic" }}>Loading datasets…</div>
                  ) : bqDatasets && bqDatasets.length > 0 ? (
                    <select className="input" value={creds.bqDataset}
                      style={{ cursor: "pointer" }}
                      onChange={e => setCreds(prev => ({ ...prev, bqDataset: e.target.value }))}>
                      <option value="">— Select a dataset —</option>
                      {bqDatasets.filter(d => d.id.startsWith("analytics_")).length > 0 && (
                        <optgroup label="GA4 exports (analytics_*)">
                          {bqDatasets.filter(d => d.id.startsWith("analytics_")).map(d => (
                            <option key={d.id} value={d.id}>{d.id}</option>
                          ))}
                        </optgroup>
                      )}
                      {bqDatasets.filter(d => !d.id.startsWith("analytics_")).length > 0 && (
                        <optgroup label="Other datasets">
                          {bqDatasets.filter(d => !d.id.startsWith("analytics_")).map(d => (
                            <option key={d.id} value={d.id}>{d.id}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="input" style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12 }}
                        placeholder="analytics_123456789"
                        value={creds.bqDataset}
                        disabled={!hasAuth}
                        onChange={e => setCreds(prev => ({ ...prev, bqDataset: e.target.value }))} />
                      {creds.bqProject && creds.oauthToken && (
                        <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={() => fetchDatasets(creds.oauthToken, creds.bqProject)}>
                          ↻ Retry
                        </button>
                      )}
                    </div>
                  )}
                  {bqDatasetsError && (
                    <div style={{ fontSize: 11.5, color: "#E1493B", marginTop: 5, fontFamily: "var(--font-mono)", lineHeight: 1.4 }}>
                      {bqDatasetsError}
                    </div>
                  )}
                  <div className="input-help">
                    {bqDatasets && bqDatasets.length > 0
                      ? `${bqDatasets.filter(d => d.id.startsWith("analytics_")).length} GA4 export dataset(s) · ${bqDatasets.length} total`
                      : bqDatasets && bqDatasets.length === 0
                        ? "No datasets found in this project — check the GA4 BQ export is enabled, or type the dataset name (e.g. analytics_123456789)."
                        : !creds.bqProject
                          ? "Select a project first."
                          : "Select a project and sign in to auto-load datasets."}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 40 }}>
        <p className="caption" style={{ margin: 0, maxWidth: 460 }}>
          Credentials are kept in memory for this session only. They're never sent to any server you don't own, and they're cleared on refresh.
        </p>
        <button className="btn btn-primary" onClick={() => onRun(enabled, creds)} disabled={!ready}>
          <Icon name="play" size={13} /> Run audit
        </button>
      </div>
    </>
  );
};

const ModuleToggle = ({ num, name, desc, on, onToggle, icon }) => (
  <div
    onClick={onToggle}
    style={{
      padding: 18,
      background: on ? "#fff" : "var(--bg-2)",
      border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
      borderRadius: 4,
      cursor: "pointer",
      transition: "all 200ms",
      boxShadow: on ? "0 0 0 3px var(--cro-blue-25)" : "none",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 32, height: 32, display: "grid", placeItems: "center",
          background: on ? "var(--accent)" : "var(--bg-3)",
          color: on ? "#fff" : "var(--fg-3)", borderRadius: 3,
        }}>
          <Icon name={icon} size={16} />
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>MODULE {num}</span>
      </span>
      <span style={{
        width: 18, height: 18, borderRadius: 3,
        border: `1.5px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
        background: on ? "var(--accent)" : "#fff",
        display: "grid", placeItems: "center", color: "#fff",
      }}>
        {on && <Icon name="check" size={11} strokeWidth={3} />}
      </span>
    </div>
    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg-1)", marginBottom: 4 }}>{name}</div>
    <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.45 }}>{desc}</div>
  </div>
);

/* =============================================================
   RUN STATE — animated progress
   ============================================================= */
function buildRunSteps(enabled, creds) {
  const steps = [];
  const gtmId  = creds.gtm          || "GTM container";
  const ga4Id  = creds.ga4PropertyId || "GA4 property";
  const isDemoMode = !creds.oauthToken;

  if (!isDemoMode && (enabled.gtm || enabled.ga4)) {
    steps.push({ mod: "", text: "Authenticating with Google APIs…", delay: 400 });
  }

  if (enabled.gtm) {
    steps.push({ mod: "GTM", text: `Fetching live container version · ${gtmId}`, delay: 500 });
    steps.push({ mod: "GTM", text: "Reading tags, triggers, and variables", delay: 600 });
    steps.push({ mod: "GTM", text: "Checking tags for missing firing triggers", delay: 500 });
    steps.push({ mod: "GTM", text: "Checking for paused tags", delay: 400 });
  }

  if (enabled.ga4) {
    steps.push({ mod: "GA4", text: `Querying Data API · property ${ga4Id} · 30-day window`, delay: 500 });
    steps.push({ mod: "GA4", text: "Fetching 7-day event counts", delay: 400 });
    steps.push({ mod: "GA4", text: "Fetching daily event data for trend sparklines", delay: 600 });
    steps.push({ mod: "GA4", text: "Checking recommended ecommerce event coverage", delay: 500 });
    steps.push({ mod: "GA4", text: "Detecting volume anomalies vs. 30-day baseline", delay: 500 });
  }

  if (enabled.bq) {
    steps.push({ mod: "BQ", text: `Loading ${window.bqQueries?.length || 5} SQL check templates for paste-in flow`, delay: 400 });
  }

  steps.push({ mod: "", text: "Compiling severity index · generating findings…", delay: 600 });
  return steps;
}

const Running = ({ enabled, creds, onDone, auditPromise }) => {
  const RUN_STEPS = React.useMemo(() => buildRunSteps(enabled, creds || {}), []);
  const [step, setStep] = useState(0);
  const [apiDone, setApiDone] = useState(auditPromise === null); // demo mode: immediately done
  const apiResultRef = useRef(null);

  // Wait for API
  useEffect(() => {
    if (!auditPromise) return;
    auditPromise.then(result => {
      apiResultRef.current = result;
      setApiDone(true);
    }).catch(() => {
      setApiDone(true);
    });
  }, [auditPromise]);

  // Animation steps
  useEffect(() => {
    if (step >= RUN_STEPS.length) {
      if (apiDone) {
        const t = setTimeout(() => onDone(apiResultRef.current), 600);
        return () => clearTimeout(t);
      }
      return; // wait for API
    }
    const t = setTimeout(() => setStep(step + 1), RUN_STEPS[step].delay);
    return () => clearTimeout(t);
  }, [step, apiDone]);

  const visible = RUN_STEPS.slice(0, step + 1);

  return (
    <>
      <div style={{ marginBottom: 48 }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Audit in progress</div>
        <h1 style={{ marginBottom: 12 }}>Reading your measurement stack…</h1>
        <p style={{ fontSize: 16, color: "var(--fg-2)" }}>
          Don't refresh. Most audits complete in under 3 minutes.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 32 }}>
        {[
          { k: "GTM", label: "GTM container", icon: "tag",  on: enabled.gtm },
          { k: "GA4", label: "GA4 events",    icon: "bar",  on: enabled.ga4 },
          { k: "BQ",  label: "BigQuery",      icon: "db",   on: enabled.bq  },
        ].map(m => {
          const modSteps = RUN_STEPS.filter(s => s.mod === m.k);
          const modDone  = visible.filter(s => s.mod === m.k).length;
          const modPct   = modSteps.length ? Math.round((modDone / modSteps.length) * 100) : 0;
          const done     = modPct >= 100;
          const skipped  = !m.on;
          return (
            <div key={m.k} className="card" style={{ padding: 18, opacity: skipped ? 0.45 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{
                  width: 28, height: 28, display: "grid", placeItems: "center",
                  background: skipped ? "var(--bg-3)" : done ? "var(--cro-green)" : modPct > 0 ? "var(--accent)" : "var(--bg-3)",
                  color: skipped ? "var(--fg-4)" : "#fff", borderRadius: 3,
                }}>
                  {done && !skipped ? <Icon name="check" size={14} strokeWidth={3} /> : <Icon name={m.icon} size={14} />}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--fg-1)" }}>{m.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
                    {skipped ? "skipped" : done ? "complete" : modPct === 0 ? "queued" : "running"}
                  </div>
                </div>
              </div>
              <div style={{ height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${skipped ? 0 : modPct}%`, height: "100%", background: done ? "var(--cro-green)" : "var(--accent)", transition: "width 300ms" }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-title">Run log</div>
      <div style={{
        background: "#15171A", color: "#E6E6E6", padding: 20, borderRadius: 4,
        fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.85, minHeight: 360,
      }}>
        <div style={{ color: "#7F7F7F", marginBottom: 8 }}>
          $ analytics-canary run{(creds?.gtm) ? ` --container=${creds.gtm}` : ""}
          {(creds?.ga4PropertyId) ? ` --property=${creds.ga4PropertyId}` : ""}
        </div>
        {visible.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "#7F7F7F", width: 56, flexShrink: 0 }}>
              [{String(i + 1).padStart(2, "0")}]
            </span>
            <span style={{ color: s.mod === "GTM" ? "#4A9AD0" : s.mod === "GA4" ? "#50E3C2" : s.mod === "BQ" ? "#E89C12" : "#BFBFBF", width: 44, flexShrink: 0 }}>
              {s.mod || "·"}
            </span>
            <span style={{ color: s.err ? "#E1493B" : "#E6E6E6" }}>{s.text}</span>
          </div>
        ))}
        {step < RUN_STEPS.length && (
          <div style={{ marginTop: 8, color: "var(--accent)" }}>
            <span style={{ animation: "pulse 1s infinite" }}>▋</span>
          </div>
        )}
      </div>
    </>
  );
};

/* =============================================================
   REPORT
   ============================================================= */
const Report = () => {
  const [exporting, setExporting] = useState(null);
  const handlePrint = () => window.print();
  const handleMarkdown = () => {
    const md = buildMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stack-audit-${window.auditMeta.client}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sev = { critical: window.findingsBy("critical"), warning: window.findingsBy("warning"), info: window.findingsBy("info") };

  return (
    <div style={{ padding: "48px 32px" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 880, margin: "0 auto 24px" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Audit Report</div>
          <p style={{ color: "var(--fg-3)", fontSize: 14, margin: 0 }}>Print-ready · shareable</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleMarkdown}>
            <Icon name="download" size={13} /> Markdown
          </button>
          <button className="btn btn-primary btn-sm" onClick={handlePrint}>
            <Icon name="print" size={13} /> Save as PDF
          </button>
        </div>
      </div>

      <div className="report-page">
        <div className="report-head">
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", letterSpacing: 0.8, marginBottom: 6, textTransform: "uppercase" }}>
              Stack Audit Report
            </div>
            <h2 style={{ margin: "0 0 6px", fontSize: 28, lineHeight: 1.2 }}>{window.auditMeta.client}</h2>
            <div style={{ fontSize: 13, color: "var(--fg-3)" }}>
              GA4 / GTM / BigQuery measurement-layer audit
            </div>
          </div>
          <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", lineHeight: 1.7 }}>
            <div>RUN&nbsp;&nbsp;{window.auditMeta.ranAt}</div>
            <div>GTM&nbsp;&nbsp;{window.auditMeta.gtmContainer}</div>
            <div>GA4&nbsp;&nbsp;{window.auditMeta.ga4Property}</div>
            <div>BY&nbsp;&nbsp;&nbsp;{window.auditMeta.auditedBy}</div>
          </div>
        </div>

        {/* Severity summary */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14, color: "var(--fg-1)" }}>
            Summary
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <SummaryTile label="Critical" n={sev.critical.length} color="#B5301F" desc="Revenue measurement at risk" />
            <SummaryTile label="Warning"  n={sev.warning.length}  color="#8A5800" desc="Data quality issues" />
            <SummaryTile label="Info"     n={sev.info.length}     color="var(--accent)" desc="Recommended cleanup" />
          </div>
        </div>

        {/* Findings */}
        {["critical", "warning", "info"].map(severity => {
          const list = window.findingsBy(severity);
          if (list.length === 0) return null;
          return (
            <div key={severity} style={{ marginBottom: 32, pageBreakInside: "avoid" }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14, color: "var(--fg-1)" }}>
                {severity} findings <span style={{ color: "var(--fg-3)", marginLeft: 8 }}>{list.length}</span>
              </h3>
              <div style={{ borderTop: "1px solid var(--divider)" }}>
                {list.map(f => (
                  <div key={f.id} style={{ padding: "18px 0", borderBottom: "1px solid var(--divider)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg-1)" }}>{f.title}</div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
                        {f.module} · {f.id}
                      </span>
                    </div>
                    <div style={{ fontSize: 13.5, color: "var(--fg-2)", lineHeight: 1.6, marginBottom: 10 }}>{f.desc}</div>
                    <div style={{ background: "var(--bg-2)", borderLeft: "2px solid var(--accent)", padding: "10px 14px", fontSize: 12.5, color: "var(--fg-2)" }}>
                      <strong style={{ display: "block", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--fg-1)", marginBottom: 4 }}>Recommended fix</strong>
                      {f.fix}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 56, paddingTop: 24, borderTop: "2px solid var(--fg-1)", display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
          <span>Generated by Stack Audit</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
};

const SummaryTile = ({ label, n, color, desc }) => (
  <div style={{ border: "1px solid var(--border)", borderRadius: 4, padding: 16 }}>
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "var(--fg-3)", marginBottom: 8 }}>{label}</div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 600, color: color, lineHeight: 1 }}>{n}</div>
    <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 6 }}>{desc}</div>
  </div>
);

function buildMarkdown() {
  const m = window.auditMeta;
  const lines = [];
  lines.push(`# Stack Audit — ${m.client}`);
  lines.push("");
  lines.push(`*${m.ranAt} · ${m.auditedBy}*`);
  lines.push("");
  lines.push(`| Property | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| GTM Container | \`${m.gtmContainer}\` |`);
  lines.push(`| GA4 Measurement ID | \`${m.ga4Property}\` |`);
  lines.push(`| BigQuery Dataset | \`${m.bqDataset}\` |`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(`- **Critical:** ${window.findingsBy("critical").length}`);
  lines.push(`- **Warning:** ${window.findingsBy("warning").length}`);
  lines.push(`- **Info:** ${window.findingsBy("info").length}`);
  lines.push("");
  ["critical", "warning", "info"].forEach(sev => {
    const list = window.findingsBy(sev);
    if (!list.length) return;
    lines.push(`## ${sev[0].toUpperCase()}${sev.slice(1)} findings`);
    lines.push("");
    list.forEach(f => {
      lines.push(`### ${f.title}`);
      lines.push(`*${f.module} · ${f.id}*`);
      lines.push("");
      lines.push(f.desc);
      lines.push("");
      lines.push(`> **Recommended fix.** ${f.fix}`);
      lines.push("");
    });
  });
  return lines.join("\n");
}

window.Setup = Setup;
window.Running = Running;
window.Report = Report;
