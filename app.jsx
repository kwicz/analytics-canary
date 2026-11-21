/* global React, ReactDOM, window */
const { useState, useEffect } = React;
const { Icon, Setup, Running, Overview, GTMModule, GA4Module, BQModule, Report } = window;

const DEFAULT_TWEAKS = /*EDITMODE-BEGIN*/{
  "demoSeverity": "as-found",
  "sidebarCollapsed": false,
  "fastRun": true
}/*EDITMODE-END*/;

// ── Set your OAuth Client ID here once and it pre-fills for every teammate ──
const DEFAULT_CLIENT_ID = /*EDITMODE-BEGIN*/"279421537358-65oaafqicevvkt59bg910uv9n0l60o9h.apps.googleusercontent.com"/*EDITMODE-END*/;

async function runRealAudit(enabled, creds) {
  if (!creds.oauthToken) return null; // no credentials → demo mode

  const authResp = await fetch('/api/auth-oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: creds.oauthToken }),
  });
  const { sessionId, error: authError } = await authResp.json();
  if (authError) throw new Error(authError);

  // Run GTM + GA4 in parallel
  const [gtmResult, ga4Result] = await Promise.allSettled([
    enabled.gtm && creds.gtm ? fetch('/api/gtm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, containerId: creds.gtm, containerPath: creds.gtmPath || undefined }),
    }).then(r => r.json()) : null,

    enabled.ga4 && creds.ga4PropertyId ? fetch('/api/ga4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, propertyId: creds.ga4PropertyId }),
    }).then(r => r.json()) : null,
  ]);

  return {
    gtm: gtmResult.status === 'fulfilled' ? gtmResult.value : null,
    ga4: ga4Result.status === 'fulfilled' ? ga4Result.value : null,
    sessionId,
  };
}

const App = () => {
  // global state
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [enabled, setEnabled] = useState({ gtm: true, ga4: true, bq: true });
  const [view, setView] = useState("setup"); // setup | overview | gtm | ga4 | bigquery | report
  const [tweaks, setTweaks] = window.useTweaks(DEFAULT_TWEAKS);
  const [auditPromise, setAuditPromise] = useState(null);
  const [dataSource, setDataSource] = useState(null); // null | { gtm: bool, ga4: bool }
  const [auditErrors, setAuditErrors] = useState([]); // [{module, message}]
  const lastCreds   = React.useRef(null);
  const lastEnabled = React.useRef(null);

  // RUN flow
  const onRun = (en, creds) => {
    setEnabled(en);
    setPhase("running");
    setView("running");
    setAuditErrors([]);
    lastCreds.current   = creds;
    lastEnabled.current = en;
    const promise = runRealAudit(en, creds).catch(err => {
      console.error('Audit error:', err);
      return { _fatalError: err.message };
    });
    setAuditPromise(promise);
  };
  const onRunDone = (realData) => {
    const creds = lastCreds.current || {};
    const src = { gtm: false, ga4: false, bq: false };
    const errors = [];
    if (realData && realData._fatalError) {
      errors.push({ module: "Auth", message: realData._fatalError });
    } else if (realData) {
      const liveFindings = [];
      if (realData.gtm && !realData.gtm.error) {
        window.gtmTags = realData.gtm.gtmTags;
        window.gtmTriggers = realData.gtm.gtmTriggers;
        window.gtmVariables = realData.gtm.gtmVariables;
        window.gtmCounts = realData.gtm.gtmCounts;
        if (realData.gtm.findings) liveFindings.push(...realData.gtm.findings);
        src.gtm = true;
      } else if (realData.gtm && realData.gtm.error) {
        errors.push({ module: "GTM", message: realData.gtm.error });
      }
      if (realData.ga4 && !realData.ga4.error) {
        window.ga4Events = realData.ga4.ga4Events;
        window.ga4MissingEvents = realData.ga4.ga4MissingEvents;
        window.ga4Conversions = realData.ga4.ga4Conversions;
        if (realData.ga4.findings) liveFindings.push(...realData.ga4.findings);
        src.ga4 = true;
      } else if (realData.ga4 && realData.ga4.error) {
        errors.push({ module: "GA4", message: realData.ga4.error });
      }
      // Replace demo findings with live API findings (window.findingsBy reads from window.findings dynamically)
      if (liveFindings.length > 0) {
        window.findings = liveFindings;
      }
    }
    // Store BQ config so the BQ module can make live queries
    const bqSessionId = (realData && realData.sessionId) || null;
    if (creds.bqProject && creds.bqDataset && bqSessionId) src.bq = true;
    window.bqConfig = {
      projectId: creds.bqProject || null,
      datasetId: creds.bqDataset || null,
      sessionId: bqSessionId,
    };

    // Update auditMeta with real IDs + timestamp
    const now = new Date();
    const ranAt = now.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    window.auditMeta = {
      ...window.auditMeta,
      gtmContainer: creds.gtm || window.auditMeta.gtmContainer,
      ga4Property: creds.ga4PropertyId || window.auditMeta.ga4Property,
      bqDataset: creds.bqProject && creds.bqDataset ? `${creds.bqProject}.${creds.bqDataset}` : "",
      ranAt,
      client: (src.gtm || src.ga4)
        ? (creds.gtm || `property ${creds.ga4PropertyId}`)
        : src.bq
          ? `${creds.bqProject}`
          : window.auditMeta.client,
    };
    // Expose dataSource on window so modules can read which data is live
    window.dataSource = src;
    setAuditErrors(errors);
    setDataSource(src.gtm || src.ga4 || src.bq ? src : null);
    setPhase("done");
    // Route to BQ page directly if no API modules were enabled — the overview
    // would just show stale demo data with no explanation.
    const lastEn = lastEnabled.current || {};
    const apiModulesEnabled = lastEn.gtm || lastEn.ga4;
    setView(apiModulesEnabled ? "overview" : "bigquery");
  };
  const rerun = () => {
    setPhase("idle");
    setView("setup");
  };

  // Sidebar nav items (only visible after audit is done)
  const navItems = [
    { id: "overview", label: "Overview",         icon: "activity", dot: phase === "done" ? "ok" : "idle", num: "—"  },
    { id: "gtm",      label: "GTM Container",    icon: "tag",      dot: phase === "done" ? "issues" : "idle", num: "01" },
    { id: "ga4",      label: "GA4 Events",       icon: "bar",      dot: phase === "done" ? "issues" : "idle", num: "02" },
    { id: "bigquery", label: "BigQuery",         icon: "db",       dot: phase === "done" ? "warn" : "idle", num: "03" },
    { id: "report",   label: "Report",           icon: "fileText", dot: phase === "done" ? "ok" : "idle", num: "—"  },
  ];

  return (
    <div className="app">
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-brand" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="favicon.svg" alt="Analytics Canary" style={{ height: 28, width: 28, borderRadius: 6, display: "block", flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 500, letterSpacing: 0, color: "var(--fg-1)" }}>Analytics Canary</span>
        </div>
        <div className="topbar-meta">
          {phase === "done" && (
            <>
              {dataSource ? (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                  letterSpacing: 0.8, textTransform: "uppercase",
                  color: "var(--cro-green)",
                  padding: "2px 8px", borderRadius: 4,
                  background: "rgba(98,196,160,0.10)", border: "1px solid rgba(98,196,160,0.25)",
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cro-green)", flexShrink: 0 }} />
                  Live · {[dataSource.gtm && "GTM", dataSource.ga4 && "GA4", dataSource.bq && "BQ"].filter(Boolean).join(" + ")}
                </span>
              ) : (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                  letterSpacing: 0.8, textTransform: "uppercase",
                  color: "var(--fg-3)",
                  padding: "2px 8px", borderRadius: 4,
                  background: "var(--bg-2)", border: "1px solid var(--border)",
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--fg-4)", flexShrink: 0 }} />
                  Demo
                </span>
              )}
              <span className="topbar-target">
                <span className="dot" />
                <span>{window.auditMeta.client}</span>
              </span>
            </>
          )}

        </div>
      </div>

      {/* BODY */}
      <div className="body">
        {/* SIDEBAR — hidden during initial setup, appears after first audit */}
        {phase !== "idle" && (
        <aside className="sidebar">
          <div>
            <div className="sidebar-section-label">Workflow</div>
            <div
              className={`nav-item ${view === "setup" ? "active" : ""}`}
              onClick={() => phase !== "running" && setView("setup")}
              style={{ opacity: phase === "running" ? 0.4 : 1, pointerEvents: phase === "running" ? "none" : "auto" }}
            >
              <span className="nav-num">↳</span>
              <span className="nav-label">Setup</span>
              {phase === "done" && <span className="nav-dot ok" />}
            </div>
            {phase === "running" && (
              <div className="nav-item active">
                <span className="nav-num">→</span>
                <span className="nav-label">Running…</span>
                <span className="nav-dot running" />
              </div>
            )}
          </div>

          <div>
            <div className="sidebar-section-label">Modules</div>
            {navItems.slice(0, 4).map(it => {
              const disabled = phase !== "done";
              return (
                <div
                  key={it.id}
                  className={`nav-item ${view === it.id ? "active" : ""} ${disabled ? "disabled" : ""}`}
                  onClick={() => !disabled && setView(it.id)}
                >
                  <span className="nav-num">{it.num}</span>
                  <span className="nav-label">{it.label}</span>
                  <span className={`nav-dot ${it.dot}`} />
                </div>
              );
            })}
          </div>

          <div>
            <div className="sidebar-section-label">Output</div>
            <div
              className={`nav-item ${view === "report" ? "active" : ""} ${phase !== "done" ? "disabled" : ""}`}
              onClick={() => phase === "done" && setView("report")}
            >
              <span className="nav-num">↳</span>
              <span className="nav-label">Findings report</span>
              <span className={`nav-dot ${phase === "done" ? "ok" : "idle"}`} />
            </div>
          </div>

          <div style={{ marginTop: "auto", padding: "16px 8px", borderTop: "1px solid var(--border)" }}>
            <div className="sidebar-section-label" style={{ marginBottom: 4 }}>Status</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", lineHeight: 1.6 }}>
              {phase === "idle" && "Ready to audit"}
              {phase === "running" && "Running…"}
              {phase === "done" && (
                <>
                  Last run<br />
                  <span style={{ color: "var(--fg-2)" }}>{window.auditMeta.ranAt}</span>
                </>
              )}
            </div>
          </div>
        </aside>
        )}

        {/* MAIN */}
        <main className="main">
          <div className="main-inner">
            {view === "setup" && <Setup onRun={onRun} defaultEnabled={enabled} defaultClientId={DEFAULT_CLIENT_ID} />}
            {view === "running" && <Running enabled={enabled} creds={lastCreds.current} onDone={onRunDone} auditPromise={auditPromise} />}
            {view === "overview" && phase === "done" && (
              <>
                {auditErrors.length > 0 && (
                  <div style={{
                    marginBottom: 24, padding: "14px 18px",
                    background: "rgba(225,73,59,0.08)", border: "1px solid rgba(225,73,59,0.3)",
                    borderRadius: 6,
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#E1493B", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
                      API errors — showing demo data
                    </div>
                    {auditErrors.map((e, i) => (
                      <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-2)", marginBottom: 4 }}>
                        <span style={{ color: "#E1493B", marginRight: 8 }}>[{e.module}]</span>{e.message}
                      </div>
                    ))}
                    <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 8 }}>
                      Make sure the signed-in account has been added as a Viewer on the GTM container (Admin → User Management) and GA4 property (Admin → Property Access Management).
                    </div>
                  </div>
                )}
                <Overview onJump={setView} runState={{ rerun }} />
              </>
            )}
            {view === "gtm" && phase === "done" && <GTMModule />}
            {view === "ga4" && phase === "done" && <GA4Module />}
            {view === "bigquery" && phase === "done" && <BQModule />}
            {view === "report" && phase === "done" && <Report />}
          </div>
        </main>
      </div>

      {/* Tweaks panel */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection title="Demo">
          <window.TweakButton onClick={() => {
            setPhase("done");
            setView("overview");
          }} label="Jump to results (skip setup)" />
          <window.TweakButton onClick={() => {
            setPhase("idle");
            setView("setup");
          }} label="Reset to setup" />
          <window.TweakButton onClick={() => {
            setPhase("done");
            setView("report");
          }} label="Show report directly" />
        </window.TweakSection>
        <window.TweakSection title="Behavior">
          <window.TweakToggle
            label="Fast run (skip animation)"
            value={tweaks.fastRun}
            onChange={(v) => setTweaks("fastRun", v)}
          />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
};

window.App = App;

// Mount
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
