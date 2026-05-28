/* global React, window */
const { useState, useMemo } = React;
const { Icon, Badge, TagStatus, Sparkline, CopyButton, highlightSQL, fmt, fmtFull, PctBar } = window;

/* =============================================================
   OVERVIEW
   ============================================================= */
const Overview = ({ onJump, runState }) => {
  const sev = { critical: window.findingsBy("critical"), warning: window.findingsBy("warning"), info: window.findingsBy("info") };

  // Dynamic BQ card data
  const bqCfg     = window.bqConfig || {};
  const bqIsLive  = !!(bqCfg.sessionId && bqCfg.projectId && bqCfg.datasetId);
  const bqSummary = window.bqAuditSummary || null;
  const bqTotal   = window.bqQueries ? window.bqQueries.length : 7;

  let bqTarget, bqStats;
  if (!bqIsLive) {
    bqTarget = "Demo data · no live connection";
    bqStats  = [
      { l: "SQL checks", v: bqTotal },
      { l: "Results",    v: "Demo" },
      { l: "Anomalies",  v: "—" },
    ];
  } else if (!bqSummary || bqSummary.queriesComplete === 0) {
    bqTarget = `${bqCfg.projectId}.${bqCfg.datasetId}`;
    bqStats  = [
      { l: "SQL checks",  v: bqTotal },
      { l: "Queries run", v: "Pending" },
      { l: "Anomalies",   v: "—" },
    ];
  } else {
    bqTarget = `${bqCfg.projectId}.${bqCfg.datasetId}`;
    const allDone = bqSummary.queriesComplete === bqTotal;
    bqStats = [
      { l: "SQL checks",   v: bqTotal },
      { l: "Queries done", v: `${bqSummary.queriesComplete}/${bqTotal}`, sev: allDone ? "ok" : undefined },
      { l: "Anomalies",    v: bqSummary.findingsCount, sev: bqSummary.findingsCount > 0 ? "warning" : "ok" },
    ];
  }

  // Dynamic "Modules Run" stat
  const ds = window.dataSource || {};
  const modulesRun   = (ds.gtm ? 1 : 0) + (ds.ga4 ? 1 : 0) + (ds.bq ? 1 : 0);
  const modulesLabel = [ds.gtm && "GTM", ds.ga4 && "GA4", ds.bq && "BQ"].filter(Boolean).join(" · ") || "GTM · GA4 · BQ";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Audit Overview</div>
          <h1>Stack health summary</h1>
          <p className="sub">Audit of <strong>{window.auditMeta.client}</strong> · {window.auditMeta.ranAt} · completed in {window.auditMeta.runDuration}</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onJump("report")}>
            <Icon name="fileText" size={14} /> View Report
          </button>
          <button className="btn btn-primary btn-sm" onClick={runState.rerun}>
            <Icon name="refresh" size={14} /> Re-run audit
          </button>
        </div>
      </div>

      {/* Severity grid */}
      <div className="section">
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Critical</div>
            <div className="stat-value crit">{sev.critical.length}</div>
            <div className="stat-sub">Blocks revenue measurement</div>
          </div>
          <div className="stat">
            <div className="stat-label">Warning</div>
            <div className="stat-value warn">{sev.warning.length}</div>
            <div className="stat-sub">Data quality at risk</div>
          </div>
          <div className="stat">
            <div className="stat-label">Info</div>
            <div className="stat-value">{sev.info.length}</div>
            <div className="stat-sub">Recommended cleanup</div>
          </div>
          <div className="stat">
            <div className="stat-label">Modules Run</div>
            <div className="stat-value">{modulesRun > 0 ? modulesRun : 2}<span style={{ color: "var(--fg-3)", fontSize: 18 }}>/3</span></div>
            <div className="stat-sub">{modulesRun > 0 ? modulesLabel : "GTM · GA4 · BQ"}</div>
          </div>
        </div>
      </div>

      {/* Critical findings */}
      <div className="section">
        <div className="section-title">Issues by severity</div>
        <div className="card flush">
          <div className="card-head">
            <h3 className="card-title">Findings</h3>
            <div className="card-sub">{window.findings.length} total · sorted by severity</div>
          </div>
          <div className="haircuts">
            {window.findings.map(f => (
              <div className="finding" key={f.id}>
                <div className="finding-meta">
                  <Badge severity={f.severity} />
                  <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
                    {f.module}
                  </div>
                </div>
                <div className="finding-body">
                  <div className="finding-title">{f.title}</div>
                  <div className="finding-desc">{f.desc}</div>
                  <div className="finding-fix">
                    <strong>Recommended fix</strong>{f.fix}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Module summary tiles */}
      <div className="section">
        <div className="section-title">Module results</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <ModuleSummaryCard
            num="01" name="GTM Container Audit"
            target={window.auditMeta.gtmContainer}
            stats={[
              { l: "Tags inspected", v: window.gtmCounts.total },
              { l: "Firing", v: window.gtmCounts.firing, sev: "ok" },
              { l: "Broken / misconfig", v: window.gtmCounts.broken, sev: "critical" },
            ]}
            onClick={() => onJump("gtm")}
          />
          <ModuleSummaryCard
            num="02" name="GA4 Event Audit"
            target={window.auditMeta.ga4Property}
            stats={[
              { l: "Events seen", v: window.ga4Events.filter(e => e.h30 > 0).length },
              { l: "Conversions tracked", v: window.ga4Conversions.length },
              { l: "Recommended missing", v: window.ga4MissingEvents.length, sev: "info" },
            ]}
            onClick={() => onJump("ga4")}
          />
          <ModuleSummaryCard
            num="03" name="BigQuery Deep Audit"
            target={bqTarget}
            stats={bqStats}
            onClick={() => onJump("bigquery")}
          />
        </div>
      </div>
    </>
  );
};

const ModuleSummaryCard = ({ num, name, target, stats, onClick }) => (
  <div className="card" style={{ cursor: "pointer", padding: 0 }} onClick={onClick}
    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 6px rgb(0 0 0 / 0.08)"}
    onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>MODULE {num}</span>
        <Icon name="chevron" size={14} color="var(--fg-3)" />
      </div>
      <div style={{ fontWeight: 800, fontSize: 16, color: "var(--fg-1)", marginBottom: 4 }}>{name}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginBottom: 18 }}>{target}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {stats.map((s, i) => (
          <div key={i}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--fg-3)", marginBottom: 4 }}>{s.l}</div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600,
              color: s.sev === "critical" ? "#B5301F" : s.sev === "warning" ? "#8A5800" : s.sev === "ok" ? "#06624B" : "var(--fg-1)"
            }}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* =============================================================
   MODULE 1 — GTM CONTAINER AUDIT
   ============================================================= */
const GTMModule = () => {
  const [tab, setTab] = useState("tags");
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Module 01</div>
          <h1>GTM container audit</h1>
          <p className="sub">
            Container <code>{window.auditMeta.gtmContainer}</code> · published version 47 · {window.gtmTags.length} tags, {window.gtmTriggers.length} triggers, {window.gtmVariables.length} variables
          </p>
        </div>
        <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href="#" onClick={e => e.preventDefault()}>
          <Icon name="external" size={12} /> Open in GTM
        </a>
      </div>

      <div className="stat-grid section" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <div className="stat">
          <div className="stat-label">Total tags</div>
          <div className="stat-value">{window.gtmCounts.total}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Firing OK</div>
          <div className="stat-value ok">{window.gtmCounts.firing}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Broken</div>
          <div className="stat-value crit">{window.gtmCounts.broken}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Not firing</div>
          <div className="stat-value">{window.gtmCounts.notFiring}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Has issue</div>
          <div className="stat-value warn">{window.gtmCounts.warn}</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "tags" ? "active" : ""}`} onClick={() => setTab("tags")}>
          Tags <span className="tab-count">{window.gtmTags.length}</span>
        </button>
        <button className={`tab ${tab === "triggers" ? "active" : ""}`} onClick={() => setTab("triggers")}>
          Triggers <span className="tab-count">{window.gtmTriggers.length}</span>
        </button>
        <button className={`tab ${tab === "variables" ? "active" : ""}`} onClick={() => setTab("variables")}>
          Variables <span className="tab-count">{window.gtmVariables.length}</span>
        </button>
        <button className={`tab ${tab === "ga4" ? "active" : ""}`} onClick={() => setTab("ga4")}>
          GA4 config
        </button>
      </div>

      {tab === "tags" && <GTMTagsTable />}
      {tab === "triggers" && <GTMTriggersTable />}
      {tab === "variables" && <GTMVariablesTable />}
      {tab === "ga4" && <GTMGA4Config />}
    </>
  );
};

const GTMTagsTable = () => (
  <div className="card flush">
    <table className="tbl">
      <thead>
        <tr>
          <th style={{ width: 32 }}></th>
          <th>Tag</th>
          <th>Trigger</th>
          <th>Last fired</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {window.gtmTags.map((t, i) => {
          const bad = t.status === "broken" || t.status === "misconfig";
          return (
            <React.Fragment key={t.name}>
              <tr className={bad ? "tbl-row-critical" : ""}>
                <td><Icon name="tag" size={14} color="var(--fg-3)" /></td>
                <td>
                  <div className="name">{t.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginTop: 2 }}>{t.type}</div>
                </td>
                <td><span className="mono">{t.trigger}</span></td>
                <td><span className="mono" style={{ color: bad || t.lastFired === "never" ? "#B5301F" : "var(--fg-2)" }}>{t.lastFired}</span></td>
                <td><TagStatus status={t.status} /></td>
              </tr>
              {t.notes && (
                <tr className={bad ? "tbl-row-critical" : ""}>
                  <td></td>
                  <td colSpan="4" style={{ padding: "0 20px 14px", color: "var(--fg-2)", fontSize: 12.5, lineHeight: 1.55 }}>
                    <span style={{ display: "inline-block", marginRight: 6, color: bad ? "#B5301F" : "#8A5800" }}>↳</span>
                    {t.notes}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
);

const GTMTriggersTable = () => (
  <div className="card flush">
    <table className="tbl">
      <thead>
        <tr>
          <th>Trigger</th>
          <th>Type</th>
          <th>Tags wired</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {window.gtmTriggers.map(t => (
          <React.Fragment key={t.name}>
            <tr className={t.status === "broken" ? "tbl-row-critical" : ""}>
              <td><span className="name">{t.name}</span></td>
              <td><span className="mono">{t.type}</span></td>
              <td><span className="num">{t.tags}</span></td>
              <td>
                {t.status === "ok" && <Badge severity="ok" label="OK" />}
                {t.status === "broken" && <Badge severity="critical" label="Broken" />}
                {t.status === "stale" && <Badge severity="info" label="Stale" />}
              </td>
            </tr>
            {t.note && (
              <tr className={t.status === "broken" ? "tbl-row-critical" : ""}>
                <td colSpan="4" style={{ padding: "0 20px 14px", color: "var(--fg-2)", fontSize: 12.5 }}>
                  <span style={{ marginRight: 6, color: t.status === "broken" ? "#B5301F" : "#8A5800" }}>↳</span>{t.note}
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </div>
);

const GTMVariablesTable = () => (
  <div className="card flush">
    <table className="tbl">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Type</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {window.gtmVariables.map(v => (
          <React.Fragment key={v.name}>
            <tr className={v.status === "broken" ? "tbl-row-critical" : ""}>
              <td><span className="mono name">{v.name}</span></td>
              <td><span style={{ fontSize: 13 }}>{v.type}</span></td>
              <td>{v.status === "ok" ? <Badge severity="ok" label="Resolves" /> : <Badge severity="critical" label="Broken" />}</td>
            </tr>
            {v.note && (
              <tr className={v.status === "broken" ? "tbl-row-critical" : ""}>
                <td colSpan="3" style={{ padding: "0 20px 14px", color: "var(--fg-2)", fontSize: 12.5 }}>
                  <span style={{ marginRight: 6, color: "#B5301F" }}>↳</span>{v.note}
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </div>
);

const GTMGA4Config = () => (
  <div className="card">
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", rowGap: 16, columnGap: 24 }}>
      <div className="input-label">GA4 Config tag</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Badge severity="ok" label="Present & firing" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-2)" }}>GA4 Configuration · trigger: All Pages</span>
      </div>

      <div className="input-label">Measurement ID</div>
      <div className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-1)" }}>{window.auditMeta.ga4Property}</div>

      <div className="input-label">Sends conversions</div>
      <div style={{ fontSize: 13 }}>Enabled · 4 conversions configured upstream in GA4</div>

      <div className="input-label">Server-side enabled</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
        <Badge severity="muted" label="No" />
        <span style={{ color: "var(--fg-3)" }}>Out of scope for v1 audit</span>
      </div>

      <div className="input-label">Consent mode</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
        <Badge severity="info" label="Basic" />
        <span style={{ color: "var(--fg-3)" }}>Advanced consent mode not configured — see findings</span>
      </div>

      <div className="input-label">Enhanced measurement</div>
      <div style={{ fontSize: 13 }}>page_view, session_start, scroll, user_engagement → enabled · outbound_click, video_progress → disabled</div>
    </div>
  </div>
);

/* =============================================================
   MODULE 2 — GA4 EVENT AUDIT
   ============================================================= */
const GA4Module = () => {
  const [tab, setTab] = useState("events");
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Module 02</div>
          <h1>GA4 event audit</h1>
          <p className="sub">
            Property <code>{window.auditMeta.ga4Property}</code> · Last 30 days · {window.ga4Events.length} distinct event names
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <span className="badge muted"><span className="dot" />API rate · 91/1k</span>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "events" ? "active" : ""}`} onClick={() => setTab("events")}>
          Event health <span className="tab-count">{window.ga4Events.length}</span>
        </button>
        <button className={`tab ${tab === "conversions" ? "active" : ""}`} onClick={() => setTab("conversions")}>
          Conversions <span className="tab-count">{window.ga4Conversions.length}</span>
        </button>
        <button className={`tab ${tab === "missing" ? "active" : ""}`} onClick={() => setTab("missing")}>
          Recommended missing <span className="tab-count">{window.ga4MissingEvents.length}</span>
        </button>
      </div>

      {tab === "events" && <GA4EventsTable />}
      {tab === "conversions" && <GA4ConversionsTable />}
      {tab === "missing" && <GA4MissingTable />}
    </>
  );
};

const GA4EventsTable = () => (
  <div className="card flush">
    <table className="tbl">
      <thead>
        <tr>
          <th>Event name</th>
          <th style={{ textAlign: "right" }}>7-day hits</th>
          <th style={{ textAlign: "right" }}>30-day hits</th>
          <th>Trend (15 days)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {window.ga4Events.map(e => {
          const isCrit = e.status === "crit";
          return (
            <React.Fragment key={e.name}>
              <tr className={isCrit ? "tbl-row-critical" : ""}>
                <td>
                  <span className="mono name">{e.name}</span>
                  {e.conversion && <Badge severity="info" label="Conv" />}
                </td>
                <td><span className="num" style={{ color: e.h7 === 0 ? "#B5301F" : "var(--fg-1)" }}>{fmtFull(e.h7)}</span></td>
                <td><span className="num">{fmtFull(e.h30)}</span></td>
                <td><Sparkline data={e.spark} danger={isCrit} /></td>
                <td>
                  {e.status === "ok"   && <Badge severity="ok"       label="Healthy" />}
                  {e.status === "warn" && <Badge severity="warning"  label="Issue"   />}
                  {e.status === "crit" && <Badge severity="critical" label="Outage"  />}
                  {e.status === "info" && <Badge severity="info"     label="Missing" />}
                </td>
              </tr>
              {e.note && (
                <tr className={isCrit ? "tbl-row-critical" : ""}>
                  <td colSpan="5" style={{ padding: "0 20px 14px", color: "var(--fg-2)", fontSize: 12.5 }}>
                    <span style={{ marginRight: 6, color: isCrit ? "#B5301F" : "#8A5800" }}>↳</span>{e.note}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
);

const GA4ConversionsTable = () => (
  <div className="card flush">
    <table className="tbl">
      <thead>
        <tr>
          <th>Conversion event</th>
          <th style={{ textAlign: "right" }}>7-day hits</th>
          <th style={{ textAlign: "right" }}>Conversion rate</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {window.ga4Conversions.map(c => (
          <React.Fragment key={c.name}>
            <tr>
              <td><span className="mono name">{c.name}</span></td>
              <td><span className="num">{fmtFull(c.h7)}</span></td>
              <td><span className="num">{c.conversionRate}</span></td>
              <td>{c.status === "ok" ? <Badge severity="ok" /> : <Badge severity="warning" />}</td>
            </tr>
            {c.note && (
              <tr>
                <td colSpan="4" style={{ padding: "0 20px 14px", color: "var(--fg-2)", fontSize: 12.5 }}>
                  <span style={{ marginRight: 6, color: "#8A5800" }}>↳</span>{c.note}
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </div>
);

const GA4MissingTable = () => (
  <div className="card flush">
    <table className="tbl">
      <thead>
        <tr>
          <th>Recommended event</th>
          <th>Why it matters</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
        {window.ga4MissingEvents.map(e => (
          <tr key={e.name}>
            <td><span className="mono name">{e.name}</span></td>
            <td style={{ color: "var(--fg-2)" }}>{e.why}</td>
            <td><Badge severity="info" label="Missing" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

window.Overview = Overview;
window.GTMModule = GTMModule;
window.GA4Module = GA4Module;
