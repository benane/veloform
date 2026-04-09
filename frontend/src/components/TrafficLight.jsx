import { useApi } from "../hooks/useApi";

const STATUS_CONFIG = {
  green:  { color: "var(--green)",  label: "Bereit" },
  yellow: { color: "var(--yellow)", label: "Vorsicht" },
  red:    { color: "var(--red)",    label: "Regeneration" },
};

const HRV_SIGNAL_COLOR = {
  good:    "var(--green)",
  neutral: "var(--text-muted)",
  caution: "var(--yellow)",
  warning: "var(--red)",
  unknown: "var(--text-muted)",
};

function tsbColor(tsb) {
  if (tsb == null) return "var(--text-muted)";
  if (tsb > 15)  return "var(--red)";
  if (tsb >= 5)  return "var(--green)";
  if (tsb >= -10) return "#84cc16"; // gelb-grün
  if (tsb >= -25) return "var(--yellow)";
  return "var(--red)";
}

function trendArrow(val) {
  if (val === null || val === undefined) return { symbol: "—", color: "var(--text-muted)" };
  if (val > 0.5)  return { symbol: `↑ +${val}`, color: "var(--green)" };
  if (val < -0.5) return { symbol: `↓ ${val}`,  color: "var(--red)" };
  return { symbol: "→ stabil", color: "var(--text-muted)" };
}

// Für ATL ist steigende Richtung eine Warnung, nicht positiv
function trendArrowATL(val) {
  if (val === null || val === undefined) return { symbol: "—", color: "var(--text-muted)" };
  if (val > 0.5)  return { symbol: `↑ +${val}`, color: "var(--yellow)" };
  if (val < -0.5) return { symbol: `↓ ${val}`,  color: "var(--green)" };
  return { symbol: "→ stabil", color: "var(--text-muted)" };
}

function MetricRow({ label, value, unit = "", trend, trendFn = trendArrow, hint = "" }) {
  const t = trend !== undefined ? trendFn(trend) : null;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "7px 0", borderBottom: "1px solid var(--border)",
    }}>
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
        {label}
        {hint && <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.6 }}>{hint}</span>}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontWeight: 600 }}>
          {value != null ? `${value}${unit}` : "—"}
        </span>
        {t && (
          <span style={{ fontSize: 11, color: t.color, minWidth: 60, textAlign: "right" }}>
            {t.symbol}
          </span>
        )}
      </span>
    </div>
  );
}

export default function TrafficLight() {
  const { data, loading, error } = useApi("/api/form");

  if (loading) return <div className="card loading">Lade Formstatus…</div>;
  if (error)   return <div className="card error">Fehler: {error}</div>;

  const cfg = STATUS_CONFIG[data.status] || STATUS_CONFIG.green;
  const hrvColor = HRV_SIGNAL_COLOR[data.hrv_signal] || "var(--text-muted)";
  const hrvPctStr = data.hrv_pct_vs_30d != null
    ? `${data.hrv_pct_vs_30d > 0 ? "+" : ""}${data.hrv_pct_vs_30d}% vs. Ø30d`
    : null;

  return (
    <div className="card">
      <div className="card-title">Tagesstatus</div>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

        {/* Ampel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
          {["green", "yellow", "red"].map((c) => (
            <div key={c} style={{
              width: 18, height: 18, borderRadius: "50%",
              background: data.status === c ? STATUS_CONFIG[c].color : "var(--surface-2)",
              border: `2px solid ${data.status === c ? STATUS_CONFIG[c].color : "var(--border)"}`,
              boxShadow: data.status === c ? `0 0 8px ${STATUS_CONFIG[c].color}60` : "none",
              transition: "all 0.3s",
            }} />
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {/* Status + TSB */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: cfg.color }}>
              {cfg.label}
            </div>
            {data.tsb != null && (
              <div style={{
                fontSize: 28, fontWeight: 800, lineHeight: 1,
                color: tsbColor(data.tsb),
                textShadow: `0 0 12px ${tsbColor(data.tsb)}50`,
              }}>
                {data.tsb > 0 ? `+${data.tsb}` : data.tsb}
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 3, opacity: 0.7 }}>TSB</span>
              </div>
            )}
          </div>
          {data.suggestion && (
            <div style={{
              fontSize: 13, color: "var(--text)", marginBottom: 14, lineHeight: 1.5,
              padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8,
              borderLeft: `3px solid ${cfg.color}`,
            }}>
              {data.suggestion}
            </div>
          )}

          {/* Warnhinweise */}
          {data.reasons?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {data.reasons.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--yellow)", marginBottom: 2 }}>⚠ {r}</div>
              ))}
            </div>
          )}

          {/* Metriken */}
          <MetricRow label="CTL" value={data.ctl} hint="Fitness" trend={data.ctl_trend} />
          <MetricRow label="ATL" value={data.atl} hint="Erschöpfung" trend={data.atl_trend} trendFn={trendArrowATL} />
          <MetricRow label="TSB" value={data.tsb} hint="Form" trend={data.tsb_trend} />

          {/* HRV-Block */}
          <div style={{ marginTop: 10 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "7px 0", borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>HRV heute</span>
              <span style={{ fontWeight: 600, color: hrvColor }}>
                {data.hrv != null ? `${data.hrv} ms` : "—"}
                {hrvPctStr && (
                  <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8, color: hrvColor }}>
                    {hrvPctStr}
                  </span>
                )}
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, padding: "6px 0", fontSize: 12, color: "var(--text-muted)" }}>
              <span>Ø7d: <strong style={{ color: "var(--text)" }}>{data.hrv_avg_7d ?? "—"} ms</strong></span>
              <span>Ø30d: <strong style={{ color: "var(--text)" }}>{data.hrv_avg_30d ?? "—"} ms</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
