import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { useApi } from "../hooks/useApi";
import dayjs from "dayjs";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div style={{
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 14px", fontSize: 13,
    }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 6 }}>
        {label} {point?.projected && <span style={{ color: "var(--accent)", fontSize: 11 }}>Projektion</span>}
      </div>
      {payload
        .filter((p) => point?.projected || !p.dataKey.startsWith("p"))
        .map((p) =>
          p.value != null && (
            <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
              {p.name}: <strong>{p.value}</strong>
            </div>
          )
        )}
      {point?.tss > 0 && (
        <div style={{ color: "var(--text-muted)", marginTop: 4, fontSize: 12 }}>
          Geplant: {point.tss} TSS
        </div>
      )}
      {point?.races?.map((race) => (
        <div key={race.name} style={{
          marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)",
          color: RACE_COLORS[race.category] || "var(--red)", fontWeight: 600, fontSize: 12,
        }}>
          🏁 {race.name} <span style={{ fontWeight: 400, opacity: 0.7 }}>({race.category})</span>
        </div>
      ))}
    </div>
  );
};

const RACE_COLORS = { RACE_A: "var(--red)", RACE_B: "var(--yellow)", RACE_C: "var(--text-muted)" };

export default function CTLChart({ days = 90, projection = 14 }) {
  const { data, loading, error } = useApi(`/api/chart-data?days=${days}&projection=${projection}`);
  const { data: reviews } = useApi("/api/week-reviews?count=3");

  if (loading) return <div className="card loading">Lade Fitness-Daten…</div>;
  if (error) return <div className="card error">Fehler: {error}</div>;

  const historical = data?.historical || [];
  const projected = data?.projected || [];
  const races = data?.races || [];

  // Overlap: letzten historischen Punkt auch im Projektions-Array als Startpunkt
  const lastHist = historical[historical.length - 1];

  // Kombiniertes Array: historische Daten + Projektionspunkte
  // Separate Keys: ctl/atl/tsb für Vergangenheit, pctl/patl/ptsb für Zukunft
  // Race-Events nach Datum indexieren für Tooltip
  const raceByDate = {};
  for (const race of races) {
    if (!raceByDate[race.date]) raceByDate[race.date] = [];
    raceByDate[race.date].push(race);
  }

  const histPoints = historical.map((d) => ({
    date: dayjs(d.date).format("DD.MM"),
    rawDate: d.date,
    ctl: d.ctl, atl: d.atl, tsb: d.tsb,
    pctl: null, patl: null, ptsb: null,
    projected: false,
    races: raceByDate[d.date] || null,
  }));

  // Letzter historischer Punkt bekommt auch Projektionswerte → nahtlose Verbindung
  if (histPoints.length && lastHist) {
    histPoints[histPoints.length - 1].pctl = lastHist.ctl;
    histPoints[histPoints.length - 1].patl = lastHist.atl;
    histPoints[histPoints.length - 1].ptsb = lastHist.tsb;
  }

  const projPoints = projected.map((d) => ({
    date: dayjs(d.date).format("DD.MM"),
    rawDate: d.date,
    ctl: null, atl: null, tsb: null,
    pctl: d.ctl, patl: d.atl, ptsb: d.tsb,
    tss: d.tss,
    projected: true,
    races: raceByDate[d.date] || null,
  }));

  const chartData = [...histPoints, ...projPoints];
  const tickInterval = Math.max(1, Math.floor(chartData.length / 12));

  return (
    <div className="card">
      <div className="card-title">CTL / ATL / TSB — Fitness & Form</div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 15, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            interval={tickInterval}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            domain={[
              (dataMin) => Math.min(Math.floor(dataMin / 5) * 5, -28),
              "auto",
            ]}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12, color: "var(--text-muted)" }} /> */}

          {/* Zielkorridore – solide Linien */}
          <ReferenceLine y={0} stroke="var(--border)" />
          <ReferenceLine y={10}  stroke="var(--green)"  strokeOpacity={0.5} strokeWidth={1} />
          <ReferenceLine y={-10} stroke="var(--yellow)" strokeOpacity={0.5} strokeWidth={1} />
          <ReferenceLine y={-25} stroke="var(--red)"    strokeOpacity={0.5} strokeWidth={1} />

          {/* Heute-Linie */}
          <ReferenceLine
            x={dayjs().format("DD.MM")}
            stroke="var(--text-muted)"
            strokeDasharray="4 4"
            label={{ value: "Heute", position: "top", fill: "var(--text-muted)", fontSize: 10 }}
          />

          {/* Race-Events – nur vertikale Linie, kein Label */}
          {races.map((race) => {
            const color = RACE_COLORS[race.category] || "var(--red)";
            return (
              <ReferenceLine
                key={race.date + race.name}
                x={dayjs(race.date).format("DD.MM")}
                stroke={color}
                strokeWidth={race.category === "RACE_A" ? 2 : 1.5}
                strokeDasharray={race.category === "RACE_A" ? undefined : "4 3"}
              />
            );
          })}

          {/* Historische Linien (durchgezogen) */}
          <Line type="monotone" dataKey="ctl" name="CTL" stroke="#3b82f6" strokeWidth={0.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="atl" name="ATL" stroke="#eab308" strokeWidth={0.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="tsb" name="TSB" stroke="#06b6d4" strokeWidth={2} dot={false} connectNulls />

          {/* Projektions-Linien (gestrichelt) */}
          <Line type="monotone" dataKey="pctl" name="CTL (proj.)" stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="5 4" dot={false} connectNulls legendType="none" />
          <Line type="monotone" dataKey="patl" name="ATL (proj.)" stroke="#eab308" strokeWidth={0.5} strokeDasharray="5 4" dot={false} connectNulls legendType="none" />
          <Line type="monotone" dataKey="ptsb" name="TSB (proj.)" stroke="#06b6d4" strokeWidth={1} strokeDasharray="5 4" dot={false} connectNulls legendType="none" />
        </LineChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", gap: 20, marginTop: 0, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap", justifyContent: "center" }}>
        <span style={{ color: "var(--green)" }}>— &gt; +10: Frisch</span>
        <span style={{ color: "var(--yellow)" }}>— -10 bis 0: Trainingsblock</span>
        <span style={{ color: "var(--red)" }}>— &lt; -25: Überbelastung</span>
      </div>

      {/* Wochenreviews von Claude – inline wie Coach Notes */}
      {reviews?.map((r) => (
        <div key={r.date} style={{
          marginTop: 16, padding: "12px 14px",
          background: "var(--surface-2)", borderRadius: 10,
          borderLeft: "3px solid var(--accent)",
        }}>
          <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {r.name} · {dayjs(r.date).format("DD.MM.YYYY")}
          </div>
          {r.content.split("\n").filter((l) => l.trim()).map((line, i) => (
            <div key={i} style={{
              fontSize: 13, lineHeight: 1.6,
              color: line.startsWith("CTL") || line.startsWith("Ausblick") ? "var(--text)" : "var(--text-muted)",
              fontWeight: line.startsWith("KW") ? 600 : 400,
            }}>
              {line}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
