import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceArea,
} from "recharts";
import { useApi } from "../hooks/useApi";
import dayjs from "dayjs";

function rollingAvg(arr, window = 7) {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - window + 1), i + 1).filter((v) => v != null);
    if (!slice.length) return null;
    return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10;
  });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div style={{
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 14px", fontSize: 13, minWidth: 180,
    }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      {p?.hrv != null && <div style={{ color: "var(--green)", opacity: 0.5, marginBottom: 2 }}>HRV roh: {p.hrv} ms</div>}
      {p?.hrvAvg != null && <div style={{ color: "var(--green)", marginBottom: 2, fontWeight: 600 }}>HRV Ø7d: {p.hrvAvg} ms</div>}
      {p?.rhr != null && <div style={{ color: "#f97316", opacity: 0.5, marginBottom: 2 }}>RHR roh: {p.rhr} bpm</div>}
      {p?.rhrAvg != null && <div style={{ color: "#f97316", marginBottom: 2, fontWeight: 600 }}>RHR Ø7d: {p.rhrAvg} bpm</div>}
      {p?.atl != null && <div style={{ color: "var(--yellow)", marginTop: 4 }}>ATL: {p.atl}</div>}
    </div>
  );
};

export default function HRVOverlay({ days = 60 }) {
  const { data, loading, error } = useApi(`/api/wellness?days=${days}`);
  const { data: specialEvents } = useApi(`/api/special-events?days=${days}`);

  if (loading) return <div className="card loading">Lade HRV-Daten…</div>;
  if (error) return <div className="card error">Fehler: {error}</div>;

  const sorted = [...(data || [])].sort((a, b) => a.id.localeCompare(b.id));

  // Lookup rawDate → DD.MM für ReferenceArea-Matching
  // Nur Daten die wirklich im Array existieren sind als x1/x2 gültig
  const rawDates = sorted.map((d) => d.id); // ["2026-02-04", ...]
  const lastAvailableDate = rawDates[rawDates.length - 1] ?? dayjs().format("YYYY-MM-DD");

  function clampToChart(isoDate) {
    const clamped = isoDate > lastAvailableDate ? lastAvailableDate : isoDate;
    // Nächstliegenden vorhandenen Datenpunkt finden
    const match = rawDates.slice().reverse().find((d) => d <= clamped);
    return match ? dayjs(match).format("DD.MM") : null;
  }

  const hrvVals = sorted.map((d) => (d.hrvSDNN != null ? parseFloat(d.hrvSDNN.toFixed(0)) : null));
  const rhrVals = sorted.map((d) => d.restingHR ?? null);
  const hrvAvgs = rollingAvg(hrvVals);
  const rhrAvgs = rollingAvg(rhrVals);

  // Kein Filter: alle Tage bleiben im Array damit ReferenceArea x1/x2 matchen kann.
  // Tage ohne HRV/RHR (z.B. Krankheitstage) zeigen einfach null-Werte.
  const chartData = sorted.map((d, i) => ({
    date: dayjs(d.id).format("DD.MM"),
    rawDate: d.id,
    hrv: hrvVals[i],
    rhr: rhrVals[i],
    hrvAvg: hrvAvgs[i],
    rhrAvg: rhrAvgs[i],
    atl: d.atl != null ? parseFloat(d.atl.toFixed(1)) : null,
  }));

  const tickInterval = Math.max(1, Math.floor(chartData.length / 10));

  return (
    <div className="card">
      <div className="card-title">HRV & Resting HR — Erholung vs. Trainingslast</div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
        Dicke Linien = 7-Tage-Durchschnitt. HRV↓ + RHR↑ bei steigender Last = Warnsignal.
      </p>
      <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: "var(--green)" }}>— HRV (höher = besser)</span>
        <span style={{ color: "#f97316" }}>— RHR (niedriger = besser)</span>
        <span style={{ color: "var(--yellow)", opacity: 0.6 }}>▦ ATL Trainingslast</span>
        <span style={{ color: "var(--accent)", opacity: 0.8 }}>▦ Wettkampf</span>
        <span style={{ color: "var(--blue)", opacity: 0.8 }}>▦ Urlaub</span>
        <span style={{ color: "var(--red)", opacity: 0.8 }}>▦ Krank</span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 48, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            interval={tickInterval}
            tickLine={false}
          />
          <YAxis
            yAxisId="atl"
            orientation="left"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            label={{ value: "ATL", angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 10 }}
          />
          <YAxis
            yAxisId="hrv"
            orientation="right"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            label={{ value: "HRV / RHR", angle: 90, position: "insideRight", fill: "var(--text-muted)", fontSize: 10, dx: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Krankheits- und Urlaubsphasen */}
          {(specialEvents || []).map((ev) => {
            if (ev.start > lastAvailableDate) return null; // noch nicht begonnen
            const x1 = clampToChart(ev.start);
            const x2 = clampToChart(dayjs(ev.end).subtract(1, "day").format("YYYY-MM-DD"));
            if (!x1 || !x2) return null;
            const cfg = ev.category === "SICK"
              ? { fill: "var(--red)",    opacity: 0.15, icon: "🤒" }
              : ev.category === "RACE"
              ? { fill: "var(--accent)", opacity: 0.18, icon: "🏁" }
              : { fill: "var(--blue)",   opacity: 0.08, icon: "✈" };
            return (
              <ReferenceArea
                key={ev.start + ev.name}
                yAxisId="hrv"
                x1={x1}
                x2={x2}
                fill={cfg.fill}
                fillOpacity={cfg.opacity}
                label={{
                  value: `${cfg.icon} ${ev.name}`,
                  position: "insideTop",
                  fill: cfg.fill,
                  fontSize: 10,
                }}
              />
            );
          })}

          {/* ATL als Balken */}
          <Bar yAxisId="atl" dataKey="atl" fill="var(--yellow)" opacity={0.25} radius={[2, 2, 0, 0]} legendType="none" />

          {/* Rohe Werte – dünn und transparent */}
          <Line yAxisId="hrv" type="monotone" dataKey="hrv" stroke="var(--green)" strokeWidth={1} strokeOpacity={0.3} dot={false} connectNulls legendType="none" />
          <Line yAxisId="hrv" type="monotone" dataKey="rhr" stroke="#f97316" strokeWidth={1} strokeOpacity={0.3} dot={false} connectNulls legendType="none" />

          {/* 7-Tage-Durchschnitt – dick */}
          <Line yAxisId="hrv" type="monotone" dataKey="hrvAvg" name="HRV Ø7d" stroke="var(--green)" strokeWidth={2.5} dot={false} connectNulls />
          <Line yAxisId="hrv" type="monotone" dataKey="rhrAvg" name="RHR Ø7d" stroke="#f97316" strokeWidth={2.5} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
