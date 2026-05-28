/* global React, window */
const { useState, useEffect, useCallback, useRef } = React;
const { Icon, Badge, CopyButton, highlightSQL, fmtFull, PctBar } = window;

/* =============================================================
   MODULE 3 — BIGQUERY LIVE AUDIT
   ============================================================= */

// ── BQ findings generator ─────────────────────────────────────────────────────
// Called after each live query completes; pushes into window.bqFindings.
// IDs are prefixed "bq-q-{queryId}" so they can be replaced on re-run.

function generateBQFindings(queryId, result) {
  const out = [];
  if (!result) return out;

  if (queryId === "funnel" && result.view_item > 0) {
    const { add_to_cart: atc, begin_checkout: bc, purchase: p } = result;
    // Impossible funnel: more purchases than checkouts
    if (p > 0 && bc > 0 && p > bc) {
      out.push({
        severity: "critical", module: "BQ", id: "bq-q-funnel-impossible",
        title: "More purchases than begin_checkout events — impossible funnel",
        desc: `${p.toLocaleString()} purchase events vs ${bc.toLocaleString()} begin_checkout events. A purchase cannot occur without a checkout — this confirms duplicate purchase event firing.`,
        fix: "Add a de-duplication condition to the purchase GTM tag (fire once per transaction_id). Check if the thank-you page fires the event on reload or browser back-navigation.",
      });
    }
    // Checkout > add_to_cart by more than 2× is a strong signal of ATC undercounting
    if (atc > 0 && bc > atc * 2) {
      out.push({
        severity: "warning", module: "BQ", id: "bq-q-funnel-atc",
        title: "Begin checkout significantly exceeds add_to_cart",
        desc: `${bc.toLocaleString()} begin_checkout vs ${atc.toLocaleString()} add_to_cart events — checkout is ${(bc / atc).toFixed(1)}× higher than cart adds. A healthy funnel has begin_checkout ≤ add_to_cart.`,
        fix: "Audit add_to_cart coverage: subscription flows, bundle products, gift cards, and any express-checkout paths (PayPal, Apple Pay) may bypass the standard cart step.",
      });
    }
  }

  if (queryId === "params" && result.purchase_events > 0) {
    const { purchase_events: tot, with_transaction_id: txid, with_items: items } = result;
    const txPct = (txid / tot) * 100;
    if (txPct < 50) {
      out.push({
        severity: "critical", module: "BQ", id: "bq-q-params-txid",
        title: `${txPct.toFixed(0)}% of purchase events are missing transaction_id`,
        desc: `Only ${txid.toLocaleString()} of ${tot.toLocaleString()} purchases have transaction_id. Without it GA4 cannot deduplicate repeat page loads — revenue is likely double-counted.`,
        fix: "Ensure transaction_id is populated for every checkout flow (including subscription, express checkout, and gift card purchases). Add a fallback DLV if multiple order schemas are in use.",
      });
    } else if (txPct < 90) {
      out.push({
        severity: "warning", module: "BQ", id: "bq-q-params-txid",
        title: `${(100 - txPct).toFixed(0)}% of purchase events missing transaction_id`,
        desc: `${txid.toLocaleString()} of ${tot.toLocaleString()} purchases have transaction_id. The gap risks duplicate conversion counting for some checkout flows.`,
        fix: "Identify which checkout paths don't push transaction_id to the data layer and add coverage before the purchase tag fires.",
      });
    }
    const itemsPct = (items / tot) * 100;
    if (itemsPct < 80) {
      out.push({
        severity: "warning", module: "BQ", id: "bq-q-params-items",
        title: `${(100 - itemsPct).toFixed(0)}% of purchase events have empty items array`,
        desc: `${items.toLocaleString()} of ${tot.toLocaleString()} purchase events include item-level data. Product revenue analysis is incomplete without items[].`,
        fix: "Ensure all checkout flows push an items[] array with item_id, item_name, and price before the purchase event fires — including subscription and express-checkout flows.",
      });
    }
  }

  if (queryId === "source" && result.sessions > 0) {
    const nullPct = Number(result.null_pct);
    if (nullPct > 15) {
      out.push({
        severity: "critical", module: "BQ", id: "bq-q-source-null",
        title: `${nullPct.toFixed(1)}% of sessions have no traffic source attribution`,
        desc: `${result.null_source.toLocaleString()} of ${result.sessions.toLocaleString()} sessions in the last 7 days have no source/medium. At ${nullPct.toFixed(1)}%, channel reporting significantly overstates direct traffic.`,
        fix: "Audit consent mode wait_for_update (≥ 500 ms). Confirm the GA4 config tag fires before any GA4 event tags on entry pages — especially on SPAs where navigation events fire before config initialises.",
      });
    } else if (nullPct > 5) {
      out.push({
        severity: "warning", module: "BQ", id: "bq-q-source-null",
        title: `${nullPct.toFixed(1)}% of sessions have NULL traffic source`,
        desc: `${result.null_source.toLocaleString()} of ${result.sessions.toLocaleString()} sessions lack attribution — above the ~5% healthy baseline. Direct traffic is likely inflated.`,
        fix: "Check consent mode wait_for_update and ensure the GA4 Configuration tag fires synchronously before all GA4 Event tags on entry pages.",
      });
    }
  }

  if (queryId === "dupes" && Array.isArray(result) && result.length > 0) {
    const severe = result.filter(r => r.distinct_schemas >= 3);
    const mild   = result.filter(r => r.distinct_schemas === 2);
    if (severe.length > 0) {
      out.push({
        severity: "warning", module: "BQ", id: "bq-q-dupes",
        title: `${severe.map(r => r.event_name).join(", ")} — inconsistent event schemas`,
        desc: `${severe.map(r => `${r.event_name} has ${r.distinct_schemas} distinct parameter schemas`).join("; ")}. Aggregates mixing schemas produce misleading averages in GA4 Explorations and Looker Studio.`,
        fix: "Standardize all firing surfaces to one schema per event. Use the GA4 ecommerce spec as the canonical reference. Annotate the migration date in GA4.",
      });
    } else if (mild.length > 0) {
      out.push({
        severity: "info", module: "BQ", id: "bq-q-dupes",
        title: `${mild.map(r => r.event_name).join(", ")} — minor schema variance`,
        desc: `${mild.map(r => r.event_name).join(", ")} ${mild.length === 1 ? "has" : "have"} 2 distinct parameter schemas. Minor variance may be intentional (e.g. optional params) but should be documented.`,
        fix: "Review whether schema differences are intentional. If not, standardize to a single parameter shape across all firing surfaces.",
      });
    }
  }

  if (queryId === "gaps" && result.flagged && result.flagged.length > 0) {
    for (const gap of result.flagged) {
      out.push({
        severity: "critical", module: "BQ", id: `bq-q-gaps-${gap.event_name}`,
        title: `${gap.event_name} — tracking gap detected (${gap.days_at_zero} day${gap.days_at_zero > 1 ? "s" : ""})`,
        desc: `The ${gap.event_name} event has recorded zero hits since ${gap.first_zero_day}. This is a confirmed data gap — no traffic drop naturally produces exactly zero hits across all days.`,
        fix: `Check the GTM tag for ${gap.event_name}: verify the trigger condition still matches the live site DOM, confirm via GTM Preview, and validate in GA4 DebugView.`,
      });
    }
  }

  if (queryId === "items" && result.purchase_events > 0) {
    const { purchase_events: tot, with_category: cat, no_items: noItems } = result;
    const noItemsPct = (noItems / tot) * 100;
    const catPct     = (cat    / tot) * 100;
    if (noItemsPct > 10) {
      out.push({
        severity: "warning", module: "BQ", id: "bq-q-items-empty",
        title: `${noItemsPct.toFixed(0)}% of purchases have an empty items array`,
        desc: `${noItems.toLocaleString()} of ${tot.toLocaleString()} purchase events have no item data. Product-level revenue analysis is impossible for these transactions.`,
        fix: "Ensure all checkout flows (subscription, express checkout, gift cards) push items[] to the data layer before the purchase event fires.",
      });
    }
    if (catPct < 60 && tot > 100) {
      out.push({
        severity: "info", module: "BQ", id: "bq-q-items-category",
        title: `Only ${catPct.toFixed(0)}% of purchases include item_category`,
        desc: `${cat.toLocaleString()} of ${tot.toLocaleString()} purchase events carry item_category data. Category-level revenue attribution in GA4 and BI reports will be incomplete.`,
        fix: "Populate item_category from your product catalog in the data layer push on every purchase event.",
      });
    }
  }

  return out;
}

// ── Plain-English interpretation per result ───────────────────────────────────

function getInterpretation(queryId, result) {
  if (!result) return null;

  if (queryId === "funnel" && result.view_item > 0) {
    const { view_item: vi, add_to_cart: atc, begin_checkout: bc, purchase: p } = result;
    const s1 = vi  > 0 ? `${((atc / vi)  * 100).toFixed(1)}%` : "—";
    let s2;
    if (atc > 0) {
      s2 = bc > atc
        ? `${(bc / atc).toFixed(1)}× ⚠ (checkout > cart)`
        : `${((bc / atc) * 100).toFixed(1)}%`;
    } else { s2 = "— (add_to_cart at 0)"; }
    const s3 = bc > 0 ? `${((p / bc) * 100).toFixed(1)}%` : "—";
    return `view→cart: ${s1} · cart→checkout: ${s2} · checkout→purchase: ${s3}`;
  }

  if (queryId === "params" && result.purchase_events > 0) {
    const pct = ((result.with_transaction_id / result.purchase_events) * 100).toFixed(1);
    if (pct >= 95) return `All parameters well-populated — ${pct}% transaction_id coverage.`;
    const missing = (100 - pct).toFixed(1);
    return `${missing}% of purchases are missing transaction_id — revenue deduplication is unreliable.`;
  }

  if (queryId === "source" && result.sessions > 0) {
    const pct = Number(result.null_pct);
    if (pct <= 5) return `Attribution healthy — ${pct.toFixed(1)}% null source is within the < 5% norm.`;
    return `${pct.toFixed(1)}% null source is ${(pct / 5).toFixed(1)}× the healthy norm of 5%. Direct traffic is inflated.`;
  }

  if (queryId === "dupes") {
    if (!Array.isArray(result) || result.length === 0)
      return "No schema inconsistencies — all events have a consistent parameter shape.";
    return `${result.length} event${result.length > 1 ? "s" : ""} with inconsistent schemas. Aggregates mixing schemas produce misleading averages.`;
  }

  if (queryId === "gaps") {
    if (!result.flagged || result.flagged.length === 0)
      return "No data gaps — all critical events have continuous coverage over the last 30 days.";
    return result.summary;
  }

  if (queryId === "experiment") {
    if (!Array.isArray(result) || result.length === 0) return null;
    const contaminated = result.filter(r => r.assignments > 0 && (r.post_engagement_assignments / r.assignments) > 0.15);
    if (contaminated.length > 0)
      return `${contaminated.length} variant${contaminated.length > 1 ? "s" : ""} with > 15% post-engagement assignments — exposure purity may be compromised.`;
    return `${result.length} experiment variant${result.length > 1 ? "s" : ""} found. Assignment timing looks clean.`;
  }

  if (queryId === "items" && result.purchase_events > 0) {
    const vals = [result.with_item_id, result.with_item_name, result.with_price, result.with_category];
    const keys = ["item_id", "item_name", "price", "item_category"];
    const minVal = Math.min(...vals);
    const minPct = ((minVal / result.purchase_events) * 100).toFixed(0);
    if (minPct >= 90) return "Item data looks complete — all key fields are well-populated.";
    const weakest = keys[vals.indexOf(minVal)];
    return `${weakest} is the weakest field at ${minPct}% coverage. Product-level analysis will be incomplete.`;
  }

  return null;
}

// ── Result processing ─────────────────────────────────────────────────────────

function processGapsResult(rows) {
  // rows: [{ day: "2024-01-01", event_name: "purchase", hits: 1234 }, ...]
  // Days with zero hits are absent from BQ results, so we detect gaps by
  // comparing present days against the expected 30-day window.
  const byEvent = {};
  for (const row of rows) {
    if (!byEvent[row.event_name]) byEvent[row.event_name] = new Set();
    if (row.day) byEvent[row.event_name].add(row.day);
  }

  // Build expected date range (last 30 days, ISO strings)
  const expected = [];
  for (let i = 30; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    expected.push(d.toISOString().split("T")[0]);
  }

  const events = Object.keys(byEvent);
  if (events.length === 0) return { summary: "No event data returned.", flagged: [] };

  const flagged = [];
  for (const event of events) {
    const present = byEvent[event];
    const missing = expected.filter(d => !present.has(d));
    if (missing.length > 0) {
      flagged.push({ event_name: event, first_zero_day: missing[0], days_at_zero: missing.length });
    }
  }

  if (flagged.length === 0) return { summary: "No data gaps detected in the last 30 days.", flagged: [] };
  const summary = flagged
    .map(f => `${f.event_name}: ${f.days_at_zero} day(s) at zero from ${f.first_zero_day}`)
    .join("; ") + ".";
  return { summary, flagged };
}

function processResult(queryId, rows) {
  if (!rows || rows.length === 0) {
    if (queryId === "gaps")     return { summary: "No event data returned.", flagged: [] };
    if (queryId === "params")   return {};
    if (queryId === "source")   return {};
    if (queryId === "funnel")   return {};
    if (queryId === "items")    return {};
    return [];
  }
  if (queryId === "params")     return rows[0];
  if (queryId === "source")     return rows[0];
  if (queryId === "funnel")     return rows[0];
  if (queryId === "items")      return rows[0];
  if (queryId === "dupes")      return rows;
  if (queryId === "experiment") return rows;
  if (queryId === "gaps")       return processGapsResult(rows);
  return rows;
}

// ── Main component ────────────────────────────────────────────────────────────

const BQModule = () => {
  const cfg = window.bqConfig || {};
  const isLive = !!(cfg.sessionId && cfg.projectId && cfg.datasetId);
  const tableRef = isLive ? `${cfg.projectId}.${cfg.datasetId}` : null;

  const [queryStates, setQueryStates] = useState({});   // id → "idle"|"running"|"done"|"error"
  const [parsedResults, setParsedResults] = useState({});
  const [queryErrors, setQueryErrors] = useState({});
  const [showSQL, setShowSQL] = useState({});
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const completedRef = useRef(new Set());

  // Dupes drill-down
  const [expandedDupe, setExpandedDupe] = useState(null);       // event_name | null
  const [dupeDetails, setDupeDetails] = useState({});           // event_name → "loading"|[variants]|{error}

  const EXCLUDED_KEYS = [
    'ga_session_id','ga_session_number','page_location','page_title','page_referrer',
    'engaged_session_event','engagement_time_msec','session_engaged','entrances',
    'percent_scrolled','link_url','link_domain','link_classes','link_id','link_text',
    'outbound','file_name','file_extension','video_current_time','video_duration',
    'video_percent','video_provider','video_title','video_url','campaign','source',
    'medium','term','content','gclid','debug_mode','ignore_referrer',
    'firebase_event_origin','screen_resolution','language','synthetic_bundle',
  ];

  const fetchDupeDetail = useCallback(async (eventName, mockVariants) => {
    // Toggle collapse
    if (expandedDupe === eventName) { setExpandedDupe(null); return; }
    setExpandedDupe(eventName);

    // Demo mode — use pre-baked schema variants
    if (!isLive) {
      setDupeDetails(prev => ({ ...prev, [eventName]: mockVariants || [] }));
      return;
    }

    if (dupeDetails[eventName] && dupeDetails[eventName] !== "loading") return; // already fetched
    setDupeDetails(prev => ({ ...prev, [eventName]: "loading" }));

    const exclusionList = EXCLUDED_KEYS.map(k => `'${k}'`).join(",");
    const sql = `
SELECT
  TO_JSON_STRING(
    ARRAY(
      SELECT key FROM UNNEST(event_params)
      WHERE key NOT IN (${exclusionList})
      ORDER BY key
    )
  ) AS param_schema,
  COUNT(*) AS event_count
FROM \`${tableRef}.events_*\`
WHERE _TABLE_SUFFIX BETWEEN
  FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY))
  AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  AND event_name = '${eventName.replace(/'/g, "\\'")}'
GROUP BY param_schema
ORDER BY event_count DESC
LIMIT 20;`;

    try {
      const r = await fetch("/api/bq-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: cfg.sessionId, projectId: cfg.projectId, sql }),
      });
      const data = await r.json();
      if (data.error) {
        setDupeDetails(prev => ({ ...prev, [eventName]: { error: data.error } }));
        return;
      }
      const variants = (data.rows || []).map(row => ({
        params: JSON.parse(row.param_schema || "[]"),
        event_count: Number(row.event_count),
      }));
      setDupeDetails(prev => ({ ...prev, [eventName]: variants }));
    } catch (err) {
      setDupeDetails(prev => ({ ...prev, [eventName]: { error: err.message } }));
    }
  }, [isLive, tableRef, cfg.sessionId, cfg.projectId, expandedDupe, dupeDetails, EXCLUDED_KEYS]);

  const done       = window.bqQueries.filter(q => queryStates[q.id] === "done").length;
  const anyRunning = Object.values(queryStates).some(s => s === "running");

  // Keep window.bqAuditSummary in sync with local state for the Overview card
  useEffect(() => {
    window.bqAuditSummary = {
      isLive,
      queriesComplete: completedRef.current.size,
      queriesTotal: window.bqQueries.length,
      findingsCount: (window.bqFindings || []).length,
      target: tableRef || null,
    };
  }, [queryStates, isLive, tableRef]);

  const runQuery = useCallback(async (queryId) => {
    if (!isLive) return;
    const q = window.bqQueries.find(x => x.id === queryId);
    if (!q) return;

    const sql = q.sql.replace(/\{\{BQ_TABLE\}\}/g, tableRef);
    setQueryStates(prev => ({ ...prev, [queryId]: "running" }));
    setQueryErrors(prev => ({ ...prev, [queryId]: null }));

    try {
      const r = await fetch("/api/bq-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: cfg.sessionId, projectId: cfg.projectId, sql }),
      });
      const data = await r.json();
      if (data.error) {
        setQueryErrors(prev => ({ ...prev, [queryId]: data.error }));
        setQueryStates(prev => ({ ...prev, [queryId]: "error" }));
        return;
      }
      const processed = processResult(queryId, data.rows);
      setParsedResults(prev => ({ ...prev, [queryId]: processed }));
      setQueryStates(prev => ({ ...prev, [queryId]: "done" }));

      // Generate findings and update window globals
      const newFindings = generateBQFindings(queryId, processed);
      window.bqFindings = [
        ...(window.bqFindings || []).filter(f => !f.id.startsWith(`bq-q-${queryId}`)),
        ...newFindings,
      ];
      completedRef.current.add(queryId);
      window.bqAuditSummary = {
        isLive: true,
        queriesComplete: completedRef.current.size,
        queriesTotal: window.bqQueries.length,
        findingsCount: (window.bqFindings || []).length,
        target: tableRef,
      };
    } catch (err) {
      setQueryErrors(prev => ({ ...prev, [queryId]: err.message }));
      setQueryStates(prev => ({ ...prev, [queryId]: "error" }));
    }
  }, [isLive, tableRef, cfg.sessionId, cfg.projectId]);

  const runAll = useCallback(() => {
    window.bqQueries.forEach(q => {
      if (queryStates[q.id] !== "done" && queryStates[q.id] !== "running") {
        runQuery(q.id);
      }
    });
  }, [runQuery, queryStates]);

  // Auto-run all queries when navigating to this page in live mode
  useEffect(() => {
    if (isLive && !hasAutoRun) {
      setHasAutoRun(true);
      window.bqQueries.forEach(q => runQuery(q.id));
    }
  }, [isLive, hasAutoRun, runQuery]);

  return (
    <>
      {/* Page header */}
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Module 03</div>
          <h1>BigQuery deep audit</h1>
          <p className="sub">
            {isLive
              ? <><code>{tableRef}</code> · {window.bqQueries.length} SQL checks</>
              : <>{window.bqQueries.length} SQL checks · demo data</>
            }
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          {isLive && (
            <button className="btn btn-primary" onClick={runAll} disabled={anyRunning}>
              {anyRunning
                ? <><Spinner /> Running…</>
                : <><Icon name="play" size={12} /> Re-run all</>
              }
            </button>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "var(--fg-3)", marginBottom: 4 }}>
              Progress
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-1)" }}>
              {done} / {window.bqQueries.length} complete
            </div>
            <div className="bq-progress" style={{ width: 180 }}>
              {window.bqQueries.map(q => (
                <div key={q.id} className={`step ${queryStates[q.id] === "done" ? "done" : ""}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Demo-mode notice */}
      {!isLive && (
        <div className="card" style={{ background: "var(--bg-2)", borderColor: "var(--border)", marginBottom: 24, padding: "16px 20px" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ marginTop: 2 }}><Icon name="info" size={18} color="var(--accent)" /></div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--fg-2)" }}>
              <strong style={{ color: "var(--fg-1)" }}>Demo mode — showing mock results.</strong>{" "}
              To run live queries, go back to Setup, sign in with Google, and select a BigQuery project and dataset.
            </div>
          </div>
        </div>
      )}

      {/* Query cards */}
      <div className="section">
        {window.bqQueries.map((q, i) => {
          const state = isLive ? (queryStates[q.id] || "idle") : "demo";
          const result = parsedResults[q.id] ?? (state === "demo" ? q.mockResult : null);
          const err = queryErrors[q.id];
          const sqlVisible = showSQL[q.id];
          const displaySQL = q.sql.replace(/\{\{BQ_TABLE\}\}/g, tableRef || "your-project.your-dataset");

          return (
            <div key={q.id} className="card flush" style={{ marginBottom: 16 }}>
              {/* Card header */}
              <div className="card-head">
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginBottom: 4 }}>
                    Q{(i + 1).toString().padStart(2, "0")}
                  </div>
                  <h3 className="card-title">{q.title}</h3>
                  <div style={{ fontSize: 12.5, color: "var(--fg-2)", marginTop: 4, fontWeight: 400, textTransform: "none", letterSpacing: 0, maxWidth: 700, lineHeight: 1.5 }}>
                    {q.why}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                  <QueryStatusBadge state={state} />
                  <div style={{ display: "flex", gap: 8 }}>
                    {state === "error" && (
                      <button className="btn btn-ghost btn-sm" onClick={() => runQuery(q.id)}>
                        ↻ Retry
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowSQL(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                    >
                      <Icon name="code" size={11} /> {sqlVisible ? "Hide SQL" : "Show SQL"}
                    </button>
                    <CopyButton text={displaySQL} label="Copy SQL" />
                  </div>
                </div>
              </div>

              {/* SQL panel (toggle) */}
              {sqlVisible && (
                <div style={{ padding: "0 20px 16px" }}>
                  <div className="codeblock">
                    <CopyButton text={displaySQL} label="Copy" />
                    {highlightSQL(displaySQL)}
                  </div>
                </div>
              )}

              {/* Running state */}
              {state === "running" && (
                <div style={{ padding: "20px", display: "flex", alignItems: "center", gap: 10, color: "var(--fg-3)", fontSize: 13, borderTop: "1px solid var(--divider)" }}>
                  <Spinner />
                  Querying BigQuery — this may take 10–30 seconds…
                </div>
              )}

              {/* Error state */}
              {err && (
                <div style={{ margin: "0 20px 16px", padding: "10px 14px", background: "#FCE7E4", color: "#B5301F", fontSize: 12, borderRadius: 4, lineHeight: 1.5 }}>
                  <strong>Error:</strong> {err}
                </div>
              )}

              {/* Results */}
              {result != null && state !== "running" && (
                <div style={{ borderTop: "1px solid var(--divider)", background: "var(--bg-2)" }}>
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="card-title" style={{ fontSize: 12 }}>Results</span>
                      {(() => {
                        const interp = getInterpretation(q.id, result);
                        return interp ? (
                          <span style={{ fontSize: 12, color: "var(--fg-2)", fontStyle: "italic" }}>{interp}</span>
                        ) : null;
                      })()}
                    </div>
                    <Badge severity={state === "demo" ? "info" : "ok"} label={state === "demo" ? "Demo data" : "Live"} />
                  </div>
                  <div style={{ padding: 20 }}>
                    <BQResultView
                      queryId={q.id}
                      result={result}
                      dupeExtra={q.id === "dupes" ? { expandedDupe, fetchDupeDetail, dupeDetails } : undefined}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};

// ── Status badge ──────────────────────────────────────────────────────────────

const Spinner = () => (
  <span style={{
    display: "inline-block", width: 12, height: 12, flexShrink: 0,
    border: "2px solid var(--border)", borderTopColor: "var(--accent)",
    borderRadius: "50%", animation: "spin 0.65s linear infinite",
  }} />
);

const QueryStatusBadge = ({ state }) => {
  if (state === "idle")    return <Badge severity="neutral" label="Pending" />;
  if (state === "running") return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--accent)" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", opacity: 0.85 }} />
      Running
    </span>
  );
  if (state === "done")    return <Badge severity="ok"       label="Complete" />;
  if (state === "error")   return <Badge severity="critical" label="Error" />;
  if (state === "demo")    return <Badge severity="info"     label="Demo" />;
  return null;
};

// ── Per-query result renderers ────────────────────────────────────────────────

const BQResultView = ({ queryId, result, dupeExtra }) => {
  if (queryId === "funnel")     return <BQFunnelResult r={result} />;
  if (queryId === "params")     return <BQParamsResult r={result} />;
  if (queryId === "dupes")      return <BQDupesResult r={result} extra={dupeExtra} />;
  if (queryId === "source")     return <BQSourceResult r={result} />;
  if (queryId === "experiment") return <BQExperimentResult r={result} />;
  if (queryId === "gaps")       return <BQGapsResult r={result} />;
  if (queryId === "items")      return <BQItemsResult r={result} />;
  return <pre style={{ fontSize: 12 }}>{JSON.stringify(result, null, 2)}</pre>;
};

const BQParamsResult = ({ r }) => {
  const rows = [
    { p: "transaction_id", v: r.with_transaction_id, total: r.purchase_events, required: true },
    { p: "value",          v: r.with_value,          total: r.purchase_events, required: true },
    { p: "currency",       v: r.with_currency,       total: r.purchase_events, required: true },
    { p: "items[]",        v: r.with_items,          total: r.purchase_events, required: true },
  ];
  return (
    <>
      <div style={{ display: "flex", gap: 24, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--fg-3)", fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
            Purchase events (30d)
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, color: "var(--fg-1)", marginTop: 4 }}>{fmtFull(r.purchase_events)}</div>
        </div>
      </div>
      <table className="tbl" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4 }}>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Populated</th>
            <th style={{ width: 220 }}>Coverage</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const pct = (row.v / row.total) * 100;
            const bad = pct < 70;
            const ok  = pct >= 95;
            return (
              <tr key={row.p}>
                <td><span className="mono name">{row.p}</span></td>
                <td><span className="num">{fmtFull(row.v)} / {fmtFull(row.total)}</span></td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <PctBar pct={pct} />
                    <span className="num" style={{ minWidth: 50, textAlign: "right" }}>{pct.toFixed(1)}%</span>
                  </div>
                </td>
                <td>{bad ? <Badge severity="critical" /> : ok ? <Badge severity="ok" /> : <Badge severity="warning" />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
};

const BQDupesResult = ({ r, extra }) => {
  const rows = Array.isArray(r) ? r : [];
  const { expandedDupe, fetchDupeDetail, dupeDetails } = extra || {};
  return (
    <table className="tbl" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4 }}>
      <thead>
        <tr>
          <th>Event name</th>
          <th style={{ textAlign: "right" }}>Distinct schemas</th>
          <th style={{ textAlign: "right" }}>Event count</th>
          <th>Severity</th>
          <th style={{ width: 80 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const isOpen   = expandedDupe === row.event_name;
          const detail   = dupeDetails  && dupeDetails[row.event_name];
          const loading  = detail === "loading";
          const variants = Array.isArray(detail) ? detail : null;
          const detailErr = detail && detail.error ? detail.error : null;
          return (
            <React.Fragment key={row.event_name}>
              <tr
                style={{ cursor: fetchDupeDetail ? "pointer" : "default", background: isOpen ? "var(--bg-2)" : undefined }}
                onClick={() => fetchDupeDetail && fetchDupeDetail(row.event_name, row.schemaVariants)}
              >
                <td><span className="mono name">{row.event_name}</span></td>
                <td><span className="num">{row.distinct_schemas}</span></td>
                <td><span className="num">{fmtFull(row.event_count)}</span></td>
                <td>{row.distinct_schemas >= 3 ? <Badge severity="warning" /> : <Badge severity="info" />}</td>
                <td style={{ textAlign: "right", paddingRight: 16 }}>
                  {fetchDupeDetail && (
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 11,
                      color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4,
                    }}>
                      {loading ? <Spinner /> : (isOpen ? "▲ Hide" : "▼ Inspect")}
                    </span>
                  )}
                </td>
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan="5" style={{ padding: "0 0 0 0", background: "var(--bg-2)" }}>
                    <div style={{ padding: "16px 20px 20px", borderTop: "1px solid var(--divider)" }}>
                      {loading && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-3)", fontSize: 13 }}>
                          <Spinner /> Fetching schema variants from BigQuery…
                        </div>
                      )}
                      {detailErr && (
                        <div style={{ color: "#B5301F", fontSize: 12, padding: "8px 12px", background: "#FCE7E4", borderRadius: 4 }}>
                          <strong>Error:</strong> {detailErr}
                        </div>
                      )}
                      {variants && <BQSchemaDiff variants={variants} eventName={row.event_name} />}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
};

// Color-coded schema diff across variants of the same event
const BQSchemaDiff = ({ variants, eventName }) => {
  if (!variants || variants.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--fg-3)" }}>No schema variant data available.</div>;
  }

  // Union of all param keys across every variant
  const allKeys = [...new Set(variants.flatMap(v => v.params || []))].sort();
  // Keys present in EVERY variant (the stable baseline)
  const universalKeys = new Set(allKeys.filter(k => variants.every(v => (v.params || []).includes(k))));
  // Keys missing from at least one variant (the inconsistencies we care about)
  const inconsistentKeys = new Set(allKeys.filter(k => !universalKeys.has(k)));
  const hasInconsistencies = inconsistentKeys.size > 0;
  const total = variants.reduce((s, v) => s + v.event_count, 0) || 1;

  // Chip style helpers — defined once so the legend and the chips share the exact same styles
  const chipBase = { fontFamily: "var(--font-mono)", fontSize: 11, padding: "2px 8px", borderRadius: 3 };
  const chipUniversal = { ...chipBase, background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg-3)" };
  const chipInconsistent = { ...chipBase, background: "rgba(138,88,0,0.08)", border: "1px solid rgba(138,88,0,0.28)", color: "#8A5800", fontWeight: 600 };
  const chipMissing = { ...chipBase, border: "1.5px dashed rgba(181,48,31,0.4)", color: "rgba(181,48,31,0.55)", textDecoration: "line-through" };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "var(--fg-3)" }}>
          Schema variants for <span style={{ color: "var(--fg-1)" }}>{eventName}</span>
          {" "}<span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· {variants.length} distinct shapes</span>
        </div>
      </div>

      {/* Key — shown above variants so it's read first */}
      {hasInconsistencies && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 16,
          padding: "10px 14px", marginBottom: 14, borderRadius: 5,
          background: "var(--bg-2)", border: "1px solid var(--border)",
          fontSize: 12, color: "var(--fg-2)",
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "var(--fg-4)", alignSelf: "center", marginRight: 4 }}>Key</span>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={chipUniversal}>param</span>
            Present in <strong>all</strong> variants — consistent baseline
          </span>
          <span style={{ color: "var(--fg-4)" }}>·</span>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={chipInconsistent}>param</span>
            Present in <strong>some</strong> variants only — schema inconsistency
          </span>
          <span style={{ color: "var(--fg-4)" }}>·</span>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={chipMissing}>param</span>
            <strong>Missing</strong> from this variant — expected but absent
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {variants.map((variant, i) => {
          const paramSet  = new Set(variant.params || []);
          const sharePct  = ((variant.event_count / total) * 100).toFixed(1);
          const isMinority = variant.event_count / total < 0.15;

          return (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              padding: "12px 14px", borderRadius: 6,
              background: isMinority ? "rgba(225,73,59,0.04)" : "#fff",
              border: isMinority ? "1px solid rgba(225,73,59,0.15)" : "1px solid var(--border)",
            }}>
              {/* Variant label */}
              <div style={{ flexShrink: 0, width: 110 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginBottom: 3 }}>
                  Variant {i + 1}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: isMinority ? "#B5301F" : "var(--fg-1)", fontWeight: 600 }}>
                  {fmtFull(variant.event_count)}
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 1 }}>{sharePct}% of events</div>
              </div>

              {/* Parameter chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, flex: 1 }}>
                {allKeys.map(k => {
                  const present    = paramSet.has(k);
                  const isUniversal = universalKeys.has(k);
                  const style = !present ? chipMissing : isUniversal ? chipUniversal : chipInconsistent;
                  return <span key={k} style={style}>{k}</span>;
                })}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

const BQSourceResult = ({ r }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
    <div className="stat" style={{ background: "#fff" }}>
      <div className="stat-label">Sessions (7d)</div>
      <div className="stat-value">{fmtFull(r.sessions)}</div>
    </div>
    <div className="stat" style={{ background: "#fff" }}>
      <div className="stat-label">Null source</div>
      <div className="stat-value warn">{fmtFull(r.null_source)}</div>
    </div>
    <div className="stat" style={{ background: "#fff" }}>
      <div className="stat-label">Null %</div>
      <div className="stat-value warn">{r.null_pct != null ? Number(r.null_pct).toFixed(1) : "—"}%</div>
      <div className="stat-sub">Healthy norm is &lt; 5%</div>
    </div>
  </div>
);

const BQExperimentResult = ({ r }) => {
  const rows = Array.isArray(r) ? r : [];
  if (rows.length === 0) {
    return (
      <div style={{ padding: 14, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--fg-3)", fontSize: 13, lineHeight: 1.5 }}>
        <strong style={{ color: "var(--fg-2)", display: "block", marginBottom: 4 }}>No experiment events found</strong>
        This property has no <code>experiment_impression</code> events in the last 30 days.
        This check is only relevant if you're using a testing tool that fires this event (e.g. Optimizely, Convert, or a custom implementation).
      </div>
    );
  }
  return (
    <table className="tbl" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4 }}>
      <thead>
        <tr>
          <th>Experiment</th>
          <th>Variant</th>
          <th style={{ textAlign: "right" }}>Total assignments</th>
          <th style={{ textAlign: "right" }}>Post-engagement</th>
          <th style={{ textAlign: "right" }}>Pre-engagement %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const prePct = ((row.assignments - row.post_engagement_assignments) / row.assignments) * 100;
          return (
            <tr key={i}>
              <td><span className="mono name">{row.experiment_id}</span></td>
              <td><span className="mono">{row.variant_id}</span></td>
              <td><span className="num">{fmtFull(row.assignments)}</span></td>
              <td><span className="num">{fmtFull(row.post_engagement_assignments)}</span></td>
              <td><span className="num" style={{ color: prePct < 90 ? "#8A5800" : "#06624B" }}>{prePct.toFixed(1)}%</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const BQFunnelResult = ({ r }) => {
  if (!r || r.view_item == null) return null;
  const steps = [
    { name: "view_item",       count: r.view_item },
    { name: "add_to_cart",     count: r.add_to_cart },
    { name: "begin_checkout",  count: r.begin_checkout },
    { name: "purchase",        count: r.purchase },
  ];
  const top = steps[0].count || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {steps.map((step, i) => {
        const pct       = (step.count / top) * 100;
        const prevCount = i > 0 ? steps[i - 1].count : null;
        const dropPct   = prevCount !== null && prevCount > 0 ? (step.count / prevCount) * 100 : null;
        const anomaly   = prevCount !== null && step.count > prevCount; // impossible
        const barColor  = anomaly ? "#E1493B"
          : pct > 50 ? "#62C4A0"
          : pct > 20 ? "var(--accent)"
          : "#E1493B";
        return (
          <div key={step.name}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--fg-1)", fontWeight: 700 }}>{step.name}</span>
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <span className="num" style={{ fontSize: 14 }}>{fmtFull(step.count)}</span>
                {dropPct !== null && (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 130, textAlign: "right",
                    color: anomaly ? "#B5301F" : dropPct < 30 ? "#8A5800" : "#06624B",
                  }}>
                    {anomaly
                      ? "⚠ exceeds previous step"
                      : `${dropPct.toFixed(1)}% of previous step`}
                  </span>
                )}
              </div>
            </div>
            <div style={{ height: 10, background: "var(--border)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, borderRadius: 5, background: barColor, transition: "width 0.5s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const BQItemsResult = ({ r }) => {
  if (!r || r.purchase_events == null) return null;
  const rows = [
    { p: "item_id",       v: r.with_item_id,   total: r.purchase_events, required: true  },
    { p: "item_name",     v: r.with_item_name,  total: r.purchase_events, required: true  },
    { p: "price",         v: r.with_price,      total: r.purchase_events, required: true  },
    { p: "item_category", v: r.with_category,   total: r.purchase_events, required: false },
  ];
  return (
    <>
      <div style={{ display: "flex", gap: 28, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--fg-3)", fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>Purchase events (30d)</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, color: "var(--fg-1)", marginTop: 4 }}>{fmtFull(r.purchase_events)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--fg-3)", fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>No items array</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, color: r.no_items > 0 ? "#8A5800" : "#06624B", marginTop: 4 }}>{fmtFull(r.no_items)}</div>
        </div>
      </div>
      <table className="tbl" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4 }}>
        <thead>
          <tr>
            <th>Item field</th>
            <th>Populated</th>
            <th style={{ width: 220 }}>Coverage</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const pct = row.total > 0 ? (row.v / row.total) * 100 : 0;
            const sev = pct >= 95 ? "ok" : pct >= 70 ? "warning" : row.required ? "critical" : "warning";
            return (
              <tr key={row.p}>
                <td><span className="mono name">{row.p}</span></td>
                <td><span className="num">{fmtFull(row.v)} / {fmtFull(row.total)}</span></td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <PctBar pct={pct} />
                    <span className="num" style={{ minWidth: 50, textAlign: "right" }}>{pct.toFixed(1)}%</span>
                  </div>
                </td>
                <td><Badge severity={sev} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
};

const BQGapsResult = ({ r }) => {
  if (!r.flagged || r.flagged.length === 0) {
    return (
      <div style={{ padding: 14, background: "rgba(6,98,75,0.06)", border: "1px solid rgba(6,98,75,0.2)", borderRadius: 4, color: "#06624B", fontSize: 13 }}>
        <strong style={{ display: "block", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.8, marginBottom: 4 }}>No gaps detected</strong>
        {r.summary}
      </div>
    );
  }
  return (
    <div>
      <div style={{ padding: 14, background: "#FCE7E4", border: "1px solid #F2A095", borderRadius: 4, color: "#B5301F", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
        <strong style={{ display: "block", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.8, marginBottom: 4 }}>Data gap detected</strong>
        {r.summary}
      </div>
      <table className="tbl" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4 }}>
        <thead>
          <tr>
            <th>Event</th>
            <th>First zero day</th>
            <th>Days at zero</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {r.flagged.map((row, i) => (
            <tr key={i} className="tbl-row-critical">
              <td><span className="mono name">{row.event_name}</span></td>
              <td><span className="mono">{row.first_zero_day}</span></td>
              <td><span className="num">{row.days_at_zero}</span></td>
              <td><Badge severity="critical" label="Outage" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

window.BQModule = BQModule;
