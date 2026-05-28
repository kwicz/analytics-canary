/* global React, window */
const { useState, useEffect, useRef } = React;

/* ---------- Icons (inline SVG, Lucide-style 1.5px stroke) ---------- */
const Icon = ({ name, size = 16, color = "currentColor", strokeWidth = 1.5 }) => {
  const paths = {
    check:    <polyline points="20 6 9 17 4 12" />,
    x:        <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    alert:    <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></>,
    info:     <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
    circle:   <circle cx="12" cy="12" r="10" />,
    play:     <polygon points="5 3 19 12 5 21 5 3" />,
    pause:    <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>,
    refresh:  <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></>,
    copy:     <><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    print:    <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
    db:       <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>,
    tag:      <><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>,
    bar:      <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>,
    file:     <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
    chevron:  <polyline points="9 18 15 12 9 6" />,
    eye:      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
    sliders:  <><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
    lock:     <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0 }}>
      {paths[name]}
    </svg>
  );
};

/* ---------- Severity Badge ---------- */
const Badge = ({ severity, label, dotOnly }) => {
  const map = {
    critical: { cls: "critical", label: label || "Critical" },
    warning:  { cls: "warning",  label: label || "Warning"  },
    info:     { cls: "info",     label: label || "Info"     },
    ok:       { cls: "ok",       label: label || "OK"       },
    muted:    { cls: "muted",    label: label || "—"        },
  };
  const m = map[severity] || map.muted;
  if (dotOnly) {
    return <span className={`badge ${m.cls}`} style={{ padding: "3px 8px" }}><span className="dot" />{m.label}</span>;
  }
  return <span className={`badge ${m.cls}`}><span className="dot" />{m.label}</span>;
};

/* ---------- Status pill for tag rows ---------- */
const TagStatus = ({ status }) => {
  const map = {
    firing:    { sev: "ok",       label: "Firing"      },
    broken:    { sev: "critical", label: "Broken"      },
    misconfig: { sev: "critical", label: "Misconfigured" },
    notfiring: { sev: "muted",    label: "Not Firing"  },
    warn:      { sev: "warning",  label: "Issue"       },
  };
  const m = map[status] || map.muted;
  return <Badge severity={m.sev} label={m.label} />;
};

/* ---------- Sparkline ---------- */
const Sparkline = ({ data, width = 120, height = 28, color = "var(--accent)", danger }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const useColor = danger ? "#E1493B" : color;
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={useColor} strokeWidth="1.5" points={points} />
      {/* Highlight zero values */}
      {data.map((v, i) => v === 0 && (
        <circle key={i} cx={i * step} cy={height - 2} r="1.6" fill="#E1493B" />
      ))}
    </svg>
  );
};

/* ---------- Copy button ---------- */
const CopyButton = ({ text, label = "Copy" }) => {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    try {
      navigator.clipboard.writeText(text);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={onClick}>
      {copied ? "✓ Copied" : label}
    </button>
  );
};

/* ---------- Simple SQL highlighter ---------- */
const highlightSQL = (sql) => {
  const KW = /\b(SELECT|FROM|WHERE|AND|OR|AS|GROUP BY|ORDER BY|HAVING|IN|IS|NULL|NOT|BETWEEN|INTERVAL|JOIN|ON|CASE|WHEN|THEN|ELSE|END|WITH|LIMIT|UNNEST|ARRAY|DESC|ASC|UNION|ALL)\b/g;
  const FN = /\b(COUNT|COUNTIF|SUM|MIN|MAX|AVG|ROUND|DATE_SUB|CURRENT_DATE|FORMAT_DATE|PARSE_DATE|TO_JSON_STRING|ARRAY_LENGTH)\b/g;
  // tokenize line by line so comments are handled
  return sql.split("\n").map((line, i) => {
    if (/^\s*--/.test(line)) {
      return <div key={i}><span className="comment">{line}</span></div>;
    }
    // crude tokenize via replacements & dangerouslySetInnerHTML
    let html = line
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/'([^']*)'/g, '<span class="str">\'$1\'</span>')
      .replace(/`([^`]*)`/g, '<span class="str">`$1`</span>')
      .replace(KW, '<span class="kw">$1</span>')
      .replace(FN, '<span class="fn">$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
    return <div key={i} dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }} />;
  });
};

/* ---------- Number formatter ---------- */
const fmt = (n) => {
  if (n === null || n === undefined) return "—";
  if (typeof n !== "number") return n;
  if (n === 0) return "0";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2).replace(/\.0+$/, "") + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(n >= 10000 ? 0 : 1).replace(/\.0+$/, "") + "k";
  return n.toLocaleString();
};
const fmtFull = (n) => typeof n === "number" ? n.toLocaleString() : "—";

/* ---------- Bar (single percent) ---------- */
const PctBar = ({ pct, danger }) => (
  <div style={{
    background: "var(--bg-3)",
    borderRadius: 2,
    height: 6,
    width: 100,
    overflow: "hidden",
    display: "inline-block",
    verticalAlign: "middle",
  }}>
    <div style={{
      background: danger ? "#E1493B" : pct >= 80 ? "var(--cro-green)" : pct >= 60 ? "#E89C12" : "#E1493B",
      width: `${Math.max(0, Math.min(100, pct))}%`,
      height: "100%",
    }} />
  </div>
);

/* ---------- Tooltip ---------- */
const Tooltip = ({ content }) => {
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState(null);
  const ref = useRef(null);

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <span
        ref={ref}
        onMouseEnter={() => { setRect(ref.current?.getBoundingClientRect()); setShow(true); }}
        onMouseLeave={() => setShow(false)}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 14, height: 14, borderRadius: "50%",
          background: "var(--fg-4)", color: "var(--fg-2)",
          fontSize: 9, fontWeight: 800, cursor: "help",
          marginLeft: 5, fontFamily: "var(--font-sans)",
          letterSpacing: 0, textTransform: "none", flexShrink: 0,
          lineHeight: 1,
        }}
      >?</span>
      {show && rect && (
        <div style={{
          position: "fixed",
          top: rect.bottom + 8,
          left: Math.min(rect.left, window.innerWidth - 328),
          zIndex: 9999,
          background: "#1a1c1f",
          color: "#E6E6E6",
          borderRadius: 6,
          padding: "14px 16px",
          fontSize: 12.5,
          lineHeight: 1.65,
          width: 300,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)",
          pointerEvents: "none",
          fontFamily: "var(--font-sans)",
          fontWeight: 400,
          letterSpacing: 0,
          textTransform: "none",
        }}>
          {content}
        </div>
      )}
    </span>
  );
};

Object.assign(window, { Icon, Badge, TagStatus, Sparkline, CopyButton, highlightSQL, fmt, fmtFull, PctBar, Tooltip });
