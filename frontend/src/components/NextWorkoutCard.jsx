import { useState, useRef } from "react";
import { useApi } from "../hooks/useApi";
import dayjs from "dayjs";
import { calcCarbs, calcCarbsFromIF } from "../utils/fueling";

// Zonen-Farben passend zu intervals.icu
const ZONE_COLORS = [
  { max: 55,  color: "#009e80" }, // Z1 Recovery
  { max: 75,  color: "#009e00" }, // Z2 Endurance
  { max: 90,  color: "#ffcb0e" }, // Z3 Tempo / Sweet Spot
  { max: 105, color: "#ff7f0e" }, // Z4 Threshold
  { max: 120, color: "#dd0447" }, // Z5 VO2max
  { max: 150, color: "#6633cc" }, // Z6 Anaerob
  { max: 999, color: "#504861" }, // Z7 Neuromuskulär
];

function getZoneColor(pct) {
  return (ZONE_COLORS.find((z) => pct <= z.max) || ZONE_COLORS[6]).color;
}

// Verschachtelte Workout-Schritte in eine flache Liste auflösen
function flattenSteps(steps) {
  const result = [];
  for (const step of steps || []) {
    if (step.steps) {
      const reps = step.reps || 1;
      for (let i = 0; i < reps; i++) {
        result.push(...flattenSteps(step.steps));
      }
    } else {
      const lo = step.power?.value ?? 0;
      const hi = step.power?.value2;
      result.push({
        power: hi != null ? (lo + hi) / 2 : lo,
        duration: step.duration ?? 0,
      });
    }
  }
  return result;
}

function IntervalProfile({ steps, durationMinutes, ftp }) {
  const flat = flattenSteps(steps);
  if (!flat.length) return null;

  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const totalSec = flat.reduce((s, step) => s + step.duration, 0);
  const maxPower = Math.max(...flat.map((s) => s.power), 105);
  const H = 72;
  const W = 100;

  // Vorberechnen: Segmente mit Zeitstempeln
  let cursor = 0;
  const segments = flat.map((step) => {
    const seg = { ...step, start: cursor };
    cursor += step.duration;
    return seg;
  });

  const rects = segments.map((seg, i) => {
    const x = (seg.start / totalSec) * W;
    const w = (seg.duration / totalSec) * W;
    const barH = (seg.power / maxPower) * H;
    return (
      <rect
        key={i}
        x={x} y={H - barH}
        width={Math.max(w - 0.3, 0.1)} height={barH}
        fill={getZoneColor(seg.power)}
        opacity={0.85}
      />
    );
  });

  const ftpY = H - (100 / maxPower) * H;

  function handleMouseMove(e) {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const timeSec = xPct * totalSec;
    const seg = segments.find((s) => timeSec >= s.start && timeSec < s.start + s.duration);
    if (seg) {
      setTooltip({
        x: e.clientX - rect.left,
        power: seg.power,
        duration: Math.round(seg.duration / 60),
        color: getZoneColor(seg.power),
      });
    }
  }

  return (
    <div style={{ marginBottom: 12, position: "relative" }}>
      {tooltip && (
        <div style={{
          position: "absolute",
          left: Math.min(tooltip.x + 8, 180),
          top: -32,
          background: "var(--surface-2)",
          border: `1px solid ${tooltip.color}`,
          borderRadius: 6,
          padding: "3px 10px",
          fontSize: 12,
          fontWeight: 600,
          color: tooltip.color,
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 10,
        }}>
          {Math.round(tooltip.power)}% FTP{ftp ? ` · ${Math.round(tooltip.power / 100 * ftp)}W` : ""} · {tooltip.duration}min
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ display: "block", borderRadius: 6, overflow: "hidden", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <rect x={0} y={0} width={W} height={H} fill="var(--surface-2)" />
        {rects}
        <line x1={0} y1={ftpY} x2={W} y2={ftpY}
          stroke="rgba(255,255,255,0.2)" strokeWidth={0.4} strokeDasharray="1.5 1" />
      </svg>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, textAlign: "right" }}>
        {durationMinutes} Min · — FTP
      </div>
    </div>
  );
}

function ZoneBar({ zoneTimes }) {
  if (!zoneTimes?.length) return null;

  const sweetSpot = zoneTimes.find((z) => z.id === "SS" || (z.name || "").toLowerCase().includes("sweet"));
  const zones = zoneTimes.filter((z) => z !== sweetSpot);

  const total = zones.reduce((s, z) => s + z.secs, 0);
  if (!total) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1 }}>
        {zones.filter((z) => z.secs > 0).map((z) => (
          <div key={z.id} style={{ flex: z.secs / total, background: z.color || getZoneColor(z.max), minWidth: 1 }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {zones.filter((z) => z.secs > 30).map((z) => (
            <span key={z.id} style={{ fontSize: 10, color: "var(--text-muted)" }}>
              <span style={{ color: z.color, fontWeight: 600 }}>{z.name}</span>{" "}
              {Math.round(z.secs / 60)}m
            </span>
          ))}
        </div>
        {sweetSpot?.secs > 30 && (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            <span style={{ color: "#ffcb0e", fontWeight: 600 }}>SS</span>{" "}
            {Math.round(sweetSpot.secs / 60)}m
          </span>
        )}
      </div>
    </div>
  );
}

const INTENSITY_LABEL = {
  low: "Locker (Z1–Z2)",
  medium: "Moderat (Z3 / Sweet Spot)",
  high: "Intensiv (Z4, Near FTP)",
  race: "Wettkampf / Z5+",
};

export default function NextWorkoutCard() {
  const { data, loading, error } = useApi("/api/next-workout?count=3");
  const { data: athlete } = useApi("/api/athlete");
  const [idx, setIdx] = useState(0);
  const ftp = athlete?.ftp;

  if (loading) return <div className="card loading">Lade nächste Workouts…</div>;
  if (error)   return <div className="card error">Fehler: {error}</div>;
  if (!data?.length) return (
    <div className="card">
      <div className="card-title">Nächstes Workout</div>
      <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Kein geplantes Ride in den nächsten 60 Tagen.</div>
    </div>
  );

  const total = data.length;
  const w = data[idx];
  const weight = athlete?.weight ?? 70;
  const fueling = w.intensity_pct
    ? calcCarbsFromIF(w.duration_minutes, w.intensity_pct, weight)
    : calcCarbs(w.duration_minutes, w.intensity, weight, false);

  const navBtn = (label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} style={{
      background: "none", border: "none", cursor: disabled ? "default" : "pointer",
      color: disabled ? "var(--border)" : "var(--text-muted)",
      fontSize: 16, padding: "0 4px", lineHeight: 1,
      transition: "color 0.15s",
    }}
    onMouseEnter={(e) => { if (!disabled) e.target.style.color = "var(--text)"; }}
    onMouseLeave={(e) => { e.target.style.color = disabled ? "var(--border)" : "var(--text-muted)"; }}
    >
      {label}
    </button>
  );

  return (
    <div className="card">
      {/* Header mit Navigation */}
      <div className="card-title">Nächste Workouts</div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{w.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>{dayjs(w.date).format("dd, DD.MM.YYYY")}</span>
            <span>{w.duration_minutes} Min</span>
            {w.tss && <span>{w.tss} TSS</span>}
            {w.intensity_pct && <span>IF {w.intensity_pct}%</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8, flexShrink: 0 }}>
          {navBtn("‹", () => setIdx(i => i - 1), idx === 0)}
          <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 30, textAlign: "center" }}>
            {idx + 1}/{total}
          </span>
          {navBtn("›", () => setIdx(i => i + 1), idx === total - 1)}
        </div>
      </div>

      {/* Intervall-Profil */}
      {w.steps ? (
        <>
          <IntervalProfile steps={w.steps} durationMinutes={w.duration_minutes} ftp={ftp} />
          <ZoneBar zoneTimes={w.zone_times} />
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          {INTENSITY_LABEL[w.intensity]}
        </div>
      )}

      {/* Fueling-Empfehlung */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Fueling
        </div>
        {fueling.carbs === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{fueling.note}</div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <span style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)" }}>{fueling.carbs}g</span>
              <span style={{ fontSize: 24, color: "var(--text-muted)", marginLeft: 8 }}>{Math.round(fueling.carbs * 0.75)}g</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Gels</div>
                <div style={{ fontWeight: 700 }}>{fueling.gels}</div>
              </div>
              <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Bidons</div>
                <div style={{ fontWeight: 700 }}>{fueling.bidons}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
