import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useApi } from "../hooks/useApi";
import dayjs from "dayjs";

function fmt(seconds) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "8px 12px", fontSize: 12,
    }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      {payload.map((p) => p.value != null && (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{Math.round(p.value)}</strong>
        </div>
      ))}
    </div>
  );
};

export default function LastWorkoutCard() {
  const { data: w, loading, error } = useApi("/api/last-workout");

  if (loading) return <div className="card loading">Lade letztes Workout…</div>;
  if (error)   return <div className="card error">Fehler: {error}</div>;
  if (!w)      return null;

  const { streams } = w;
  const stepSecs = streams?.step_secs || 1;

  // Zeitreihe aufbauen
  const len = Math.max(
    streams?.watts?.length || 0,
    streams?.heartrate?.length || 0,
    streams?.cadence?.length || 0,
  );

  const chartData = Array.from({ length: len }, (_, i) => {
    const secs = i * stepSecs;
    const min = Math.floor(secs / 60);
    const label = `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
    const watts = streams?.watts?.[i];
    const hr    = streams?.heartrate?.[i];
    const cad   = streams?.cadence?.[i];
    return {
      label,
      watts:    watts != null && watts > 0 ? watts : null,
      hr:       hr    != null && hr > 0    ? hr    : null,
      cadence:  cad   != null && cad > 0   ? cad   : null,
    };
  });

  const tickInterval = Math.max(1, Math.floor(len / 8));
  
  return (
    <div className="card">
      {/* Header */}
      <div className="card-title">Letztes Workout</div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{w.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>{dayjs(w.date).format("dd, DD.MM.YYYY")}</span>
          <span>{fmt(w.duration)}</span>
          {w.tss && <span>{w.tss} TSS</span>}
          {w.elevation > 0 && <span>{Math.round(w.elevation)} hm</span>}
        </div>
      </div>

      {/* Interval Summary */}
      {w.interval_summary?.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {w.interval_summary.map((s, i) => (
            <span key={i} style={{
              background: "var(--accent)", color: "#fff", borderRadius: 6,
              padding: "3px 10px", fontSize: 12, fontWeight: 600,
            }}>{s}</span>
          ))}
        </div>
      )}

      {/* Kennzahlen */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {w.avg_power && (
          <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 70 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Ø Power</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{Math.round(w.avg_power)}<span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 2 }}>W</span></div>
          </div>
        )}
        {w.np && (
          <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 70 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>NP</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{Math.round(w.np)}<span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 2 }}>W</span></div>
          </div>
        )}
        {w.avg_hr && (
          <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 70 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Ø HR</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{Math.round(w.avg_hr)}<span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 2 }}>bpm</span></div>
          </div>
        )}
      </div>

      {/* Chart */}
      {len > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 40, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              interval={tickInterval}
              tickLine={false}
            />
            {/* Power – links */}
            <YAxis
              yAxisId="power"
              orientation="left"
              tick={{ fill: "var(--accent)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              label={{ value: "W", angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 9 }}
              domain={[(dataMin) => Math.max(0, Math.floor(dataMin * 0.85 / 10) * 10), "auto"]}
            />
            {/* HR + Cadence – rechts */}
            <YAxis
              yAxisId="bio"
              orientation="right"
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={[(dataMin) => Math.max(0, Math.floor(dataMin * 0.9 / 10) * 10), "auto"]}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Power als gefüllte Fläche */}
            <Area
              yAxisId="power"
              type="monotone"
              dataKey="watts"
              name="Power"
              stroke="var(--accent)"
              fill="var(--accent)"
              fillOpacity={0.2}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            {/* HR als Linie */}
            <Line
              yAxisId="bio"
              type="monotone"
              dataKey="hr"
              name="HR"
              stroke="var(--red)"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            {/* Cadence als Linie */}
            <Line
              yAxisId="bio"
              type="monotone"
              dataKey="cadence"
              name="Cadence"
              stroke="var(--green)"
              strokeWidth={1}
              strokeOpacity={0.7}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
        <span style={{ color: "var(--accent)" }}>— Power (W)</span>
        <span style={{ color: "var(--red)" }}>— HR (bpm)</span>
        <span style={{ color: "var(--green)" }}>— Cadence (rpm)</span>
      </div>

      {/* Coach Notes */}
      {w.coach_notes && (
        <div style={{
          marginTop: 16, padding: "12px 14px",
          background: "var(--surface-2)", borderRadius: 10,
          borderLeft: "3px solid var(--accent)",
        }}>
          <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Coach
          </div>
          {w.coach_notes.split("\n").filter((l) => l.trim()).map((line, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.6, color: line.startsWith("Status") || line.startsWith("Nächstes") ? "var(--text)" : "var(--text-muted)" }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
