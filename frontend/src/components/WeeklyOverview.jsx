import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { useState } from "react";
import dayjs from "dayjs";

function duration(seconds) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function hoursDecimal(seconds) {
  return seconds ? Math.round((seconds / 3600) * 10) / 10 : 0;
}

const TSSTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 6 }}>KW ab {label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

const HoursTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 6 }}>KW ab {label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{p.value}h</strong>
        </div>
      ))}
    </div>
  );
};

export default function WeeklyOverview({ weeks = 8 }) {
  const { data, loading, error } = useApi(`/api/weekly-summary?weeks=${weeks}`);
  const { data: reviews } = useApi("/api/week-reviews?count=3");

  if (loading) return <div className="card loading">Lade Wochenübersicht…</div>;
  if (error) return <div className="card error">Fehler: {error}</div>;

  const rows = data || [];

  // Compliance-Berechnung (nur Wochen mit Planung)
  const weeksWithPlan = rows.filter((w) => w.planned_tss > 0);
  const avgCompliance = weeksWithPlan.length
    ? Math.round(weeksWithPlan.reduce((sum, w) => sum + Math.min((w.actual_tss / w.planned_tss) * 100, 150), 0) / weeksWithPlan.length)
    : null;

  const chartData = [...rows].reverse().map((w) => ({
    week: dayjs(w.week).format("DD.MM"),
    "Plan TSS": w.planned_tss || 0,
    "Ist TSS": w.actual_tss || 0,
  }));

  const hoursData = [...rows].reverse().map((w) => ({
    week: dayjs(w.week).format("DD.MM"),
    "Stunden": hoursDecimal(w.actual_duration),
  }));

  const avgHours = hoursData.length
    ? Math.round((hoursData.reduce((s, d) => s + d["Stunden"], 0) / hoursData.length) * 10) / 10
    : 0;

  return (
    <>
      {/* Kennzahlen */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat-label">Ø Compliance ({weeks} Wochen)</div>
          <div className="stat-value" style={{
            color: avgCompliance == null ? "var(--text-muted)"
              : avgCompliance >= 90 ? "var(--green)"
              : avgCompliance >= 70 ? "var(--yellow)"
              : "var(--red)",
          }}>
            {avgCompliance != null ? `${avgCompliance}%` : "—"}
          </div>
          <div className="stat-sub">{weeksWithPlan.length} Wochen mit Plan</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ø Wochenstunden</div>
          <div className="stat-value">{avgHours}h</div>
          <div className="stat-sub">letzte {weeks} Wochen</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ø Wochen-TSS</div>
          <div className="stat-value">
            {rows.length ? Math.round(rows.reduce((s, w) => s + w.actual_tss, 0) / rows.length) : "—"}
          </div>
          <div className="stat-sub">tatsächlich</div>
        </div>
      </div>

      {/* TSS Balkendiagramm */}
      <div className="card">
        <div className="card-title">Trainingsbelastung — Geplant vs. Tatsächlich (TSS)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="week" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip content={<TSSTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12, color: "var(--text-muted)" }} />
            <Bar dataKey="Plan TSS" fill="#6b7280" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Ist TSS" fill="var(--accent)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stunden-Trend */}
      <div className="card">
        <div className="card-title">Wochenstunden — Trend</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={hoursData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="week" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
            <Tooltip content={<HoursTooltip />} />
            <ReferenceLine y={avgHours} stroke="var(--text-muted)" strokeDasharray="4 3"
              label={{ value: `Ø ${avgHours}h`, position: "right", fill: "var(--text-muted)", fontSize: 10 }} />
            <Line type="monotone" dataKey="Stunden" stroke="var(--blue)" strokeWidth={2} dot={{ fill: "var(--blue)", r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Detailtabelle */}
      <div className="card">
        <div className="card-title">Details pro Woche</div>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 380 }}>
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Woche</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Plan TSS</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Ist TSS</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Compliance</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Stunden</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Fahrten</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const compliance = w.planned_tss > 0
                ? Math.round((w.actual_tss / w.planned_tss) * 100)
                : null;
              const compColor = compliance == null ? "var(--text-muted)"
                : compliance >= 90 ? "var(--green)"
                : compliance >= 70 ? "var(--yellow)"
                : "var(--red)";
              return (
                <tr key={w.week} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px" }}>{dayjs(w.week).format("DD.MM.YY")}</td>
                  <td style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)" }}>{w.planned_tss || "—"}</td>
                  <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>{w.actual_tss}</td>
                  <td style={{ textAlign: "right", padding: "6px 8px", color: compColor, fontWeight: 600 }}>
                    {compliance != null ? `${compliance}%` : "—"}
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)" }}>
                    {hoursDecimal(w.actual_duration)}h
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)" }}>{w.rides}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}
