import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useApi } from "../hooks/useApi";
import dayjs from "dayjs";

// Schlüssel-Dauern mit lesbaren Labels
const DURATIONS = [
  { secs: 5,    label: "5s" },
  { secs: 10,   label: "10s" },
  { secs: 15,   label: "15s" },
  { secs: 20,   label: "20s" },
  { secs: 30,   label: "30s" },
  { secs: 60,   label: "1m" },
  { secs: 120,  label: "2m" },
  { secs: 180,  label: "3m" },
  { secs: 300,  label: "5m" },
  { secs: 360,  label: "6m" },
  { secs: 600,  label: "10m" },
  { secs: 720,  label: "12m" },
  { secs: 1200, label: "20m" },
  { secs: 1800, label: "30m" },
  { secs: 2400, label: "40m" },
  { secs: 3600, label: "60m" },
];

const PERIOD_OPTIONS = [
  { days: 30,  label: "30 Tage" },
  { days: 90,  label: "90 Tage" },
  { days: 180, label: "6 Monate" },
  { days: 365, label: "1 Jahr" },
];

// Tabellenzeilen für "Kerndauern"
const TABLE_DURATIONS = [
  { secs: 5,    label: "5s",   desc: "Sprint / Neuromuskulär" },
  { secs: 30,   label: "30s",  desc: "Anaerob" },
  { secs: 60,   label: "1 min",desc: "VO2max kurz" },
  { secs: 300,  label: "5 min",desc: "VO2max" },
  { secs: 1200, label: "20 min",desc: "Threshold (FTP-Proxy)" },
  { secs: 3600, label: "60 min",desc: "Ausdauer" },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "8px 14px", fontSize: 13,
    }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      {payload.map((p) => p.value && (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{p.value}W</strong>
        </div>
      ))}
    </div>
  );
};

function PowerCurveChart({ days, compareDays }) {
  const { data: curve1 } = useApi(`/api/power-curve?days=${days}`);
  const { data: curve2 } = useApi(compareDays ? `/api/power-curve?days=${compareDays}` : null);

  const labelMap = Object.fromEntries(DURATIONS.map((d) => [d.secs, d.label]));

  // Beide Kurven in ein gemeinsames Array mergen
  const merged = DURATIONS.map(({ secs, label }) => {
    const p1 = curve1?.find((d) => d.secs === secs);
    const p2 = curve2?.find((d) => d.secs === secs);
    return {
      label,
      current: p1?.watts ?? null,
      compare: p2?.watts ?? null,
    };
  }).filter((d) => d.current || d.compare);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={merged} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}W`} />
        <Tooltip content={<CustomTooltip />} />
        {compareDays && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8, color: "var(--text-muted)" }} />}
        <Line
          type="monotone" dataKey="current"
          name={`Letzte ${days} Tage`}
          stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--accent)" }} connectNulls
        />
        {compareDays && (
          <Line
            type="monotone" dataKey="compare"
            name={`Letzte ${compareDays} Tage`}
            stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function BestEffortsTable({ days, weight }) {
  const { data: curve } = useApi(`/api/power-curve?days=${days}`);
  const [tooltip, setTooltip] = useState(null);

  if (!curve) return null;

  const byDuration = Object.fromEntries(curve.map((d) => [d.secs, d]));

  return (
    <div style={{ position: "relative" }}>
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 12,
          top: tooltip.y - 10,
          background: "var(--surface-2)",
          border: "1px solid var(--accent)",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--accent)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 100,
        }}>
          {tooltip.name}
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ color: "var(--text-muted)", fontSize: 11 }}>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Dauer</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Energiesystem</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Watt</th>
            {weight && <th style={{ textAlign: "right", padding: "4px 8px" }}>W/kg</th>}
            <th style={{ textAlign: "right", padding: "4px 8px" }}>Datum</th>
          </tr>
        </thead>
        <tbody>
          {TABLE_DURATIONS.map(({ secs, label, desc }) => {
            const entry = byDuration[secs];
            return (
              <tr
                key={secs}
                style={{ borderTop: "1px solid var(--border)", cursor: entry?.name ? "default" : undefined }}
                onMouseMove={entry?.name ? (e) => setTooltip({ x: e.clientX, y: e.clientY, name: entry.name }) : undefined}
                onMouseLeave={() => setTooltip(null)}
              >
                <td style={{ padding: "7px 8px", fontWeight: 600 }}>{label}</td>
                <td style={{ padding: "7px 8px", color: "var(--text-muted)", fontSize: 12 }}>{desc}</td>
                <td style={{ textAlign: "right", padding: "7px 8px", fontWeight: 700 }}>
                  {entry ? `${entry.watts}W` : "—"}
                </td>
                {weight && (
                  <td style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-muted)" }}>
                    {entry ? (entry.watts / weight).toFixed(2) : "—"}
                  </td>
                )}
                <td style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                  {entry?.date ? dayjs(entry.date).format("DD.MM.YY") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AthletePage() {
  const { data: athlete } = useApi("/api/athlete");
  const [days, setDays] = useState(90);
  const [compare, setCompare] = useState(false);

  const ftp = athlete?.ftp;
  const weight = athlete?.weight;
  const ftpPerKg = ftp && weight ? (ftp / weight).toFixed(2) : null;
  const compareDays = compare ? 365 : null;

  return (
    <>
      {/* Athleten-Stammdaten */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat-label">FTP</div>
          <div className="stat-value">{ftp ?? "—"}<span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 4 }}>W</span></div>
          {ftpPerKg && <div className="stat-sub">{ftpPerKg} W/kg</div>}
        </div>
        <div className="stat">
          <div className="stat-label">Gewicht</div>
          <div className="stat-value">{weight ? weight.toFixed(1) : "—"}<span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 4 }}>kg</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Max HR</div>
          <div className="stat-value">{athlete?.athleteMaxHr ?? "—"}<span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 4 }}>bpm</span></div>
          {athlete?.lthr && <div className="stat-sub">LTHR {athlete.lthr} bpm</div>}
        </div>
        <div className="stat">
          <div className="stat-label">Athlet</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{athlete?.name ?? "—"}</div>
        </div>
      </div>

      {/* Fahrräder */}
      {athlete?.bikes?.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Fahrräder</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {athlete.bikes.map((bike) => (
              <div key={bike.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{bike.name}</div>
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  {bike.km.toLocaleString("de-AT")} km
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Power Curve */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Power Curve</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Zeitraum-Auswahl */}
            <div style={{ display: "flex", gap: 4 }}>
              {PERIOD_OPTIONS.map((p) => (
                <button key={p.days} onClick={() => setDays(p.days)} style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                  background: days === p.days ? "var(--accent)" : "var(--surface-2)",
                  color: days === p.days ? "#fff" : "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}>
                  {p.label}
                </button>
              ))}
            </div>
            {/* Vergleich toggle */}
            <button onClick={() => setCompare((c) => !c)} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
              background: compare ? "var(--surface-2)" : "var(--surface-2)",
              color: compare ? "var(--text)" : "var(--text-muted)",
              border: `1px solid ${compare ? "var(--accent)" : "var(--border)"}`,
            }}>
              vs. 1 Jahr
            </button>
          </div>
        </div>
        <PowerCurveChart days={days} compareDays={compareDays} />
      </div>

      {/* Best Efforts Tabelle */}
      <div className="card">
        <div className="card-title">Bestleistungen — letzte {PERIOD_OPTIONS.find((p) => p.days === days)?.label}</div>
        <BestEffortsTable days={days} weight={weight} />
      </div>
    </>
  );
}
