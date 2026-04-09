import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
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
      borderRadius: 8, padding: "10px 14px", fontSize: 13,
    }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      {p?.sleepH != null && (
        <div style={{ color: p.sleepH < 7 ? "var(--red)" : "var(--green)", marginBottom: 2 }}>
          Schlaf: <strong>{p.sleepH}h</strong> {p.sleepH < 7 ? "⚠ unter 7h" : ""}
        </div>
      )}
      {p?.nextHrv != null && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
          HRV nächster Tag: {p.nextHrv} ms
        </div>
      )}
    </div>
  );
};

export default function SleepChart({ days = 42 }) {
  const { data, loading, error } = useApi(`/api/wellness?days=${days}`);

  if (loading) return <div className="card loading">Lade Schlafdaten…</div>;
  if (error) return <div className="card error">Fehler: {error}</div>;

  const sorted = [...(data || [])]
    .filter((d) => d.sleepSecs != null)
    .sort((a, b) => a.id.localeCompare(b.id));

  // HRV-Werte nach Datum indexieren für "nächster Tag"-Vergleich
  const hrvByDate = Object.fromEntries(
    (data || []).map((d) => [d.id, d.hrvSDNN ?? null])
  );

  const chartData = sorted.map((d, i) => {
    const sleepH = Math.round((d.sleepSecs / 3600) * 10) / 10;
    const nextDate = sorted[i + 1]?.id;
    const nextHrv = nextDate ? (hrvByDate[nextDate] ? Math.round(hrvByDate[nextDate]) : null) : null;
    return {
      date: dayjs(d.id).format("DD.MM"),
      rawDate: d.id,
      sleepH,
      nextHrv,
      shortSleep: sleepH < 7,
    };
  });

  const sleepVals = chartData.map((d) => d.sleepH);
  const sleepAvgs = rollingAvg(sleepVals);
  const finalData = chartData.map((d, i) => ({ ...d, sleepAvg: sleepAvgs[i] }));

  const tickInterval = Math.max(1, Math.floor(chartData.length / 10));

  // Schlechter-Schlaf-Korrelation
  const shortSleepDays = finalData.filter((d) => d.shortSleep && d.nextHrv != null);
  const normalSleepDays = finalData.filter((d) => !d.shortSleep && d.nextHrv != null);
  const avgHrvAfterShort = shortSleepDays.length
    ? Math.round(shortSleepDays.reduce((a, b) => a + b.nextHrv, 0) / shortSleepDays.length)
    : null;
  const avgHrvAfterNormal = normalSleepDays.length
    ? Math.round(normalSleepDays.reduce((a, b) => a + b.nextHrv, 0) / normalSleepDays.length)
    : null;

  const avgSleep = Math.round((sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length) * 10) / 10;

  return (
    <>
      <div className="card">
        <div className="card-title">Schlafdauer</div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          Rot = unter 7 Stunden. Linie = 7-Tage-Durchschnitt.
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={finalData} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              interval={tickInterval}
              tickLine={false}
            />
            <YAxis
              domain={[0, 10]}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v) => `${v}h`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={6} stroke="var(--red)" strokeDasharray="4 3" strokeOpacity={0.6}
              label={{ value: "6h", position: "right", fill: "var(--red)", fontSize: 10 }} />
            <ReferenceLine y={7} stroke="var(--yellow)" strokeDasharray="4 3" strokeOpacity={0.6}
              label={{ value: "7h", position: "right", fill: "var(--yellow)", fontSize: 10 }} />
            <ReferenceLine y={8} stroke="var(--green)" strokeDasharray="3 3" strokeOpacity={0.3}
              label={{ value: "8h", position: "right", fill: "var(--green)", fontSize: 10 }} />
            <Bar dataKey="sleepH" radius={[3, 3, 0, 0]} legendType="none">
              {finalData.map((d, i) => (
                <Cell key={i} fill={d.shortSleep ? "var(--red)" : "var(--accent)"} opacity={0.7} />
              ))}
            </Bar>
            <Line
              type="monotone" dataKey="sleepAvg" stroke="var(--text)"
              strokeWidth={2} dot={false} connectNulls legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Korrelation Schlaf → HRV */}
      {(avgHrvAfterShort || avgHrvAfterNormal) && (
        <div className="card">
          <div className="card-title">Schlaf & HRV — Korrelation</div>
          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <div className="stat" style={{ flex: 1 }}>
              <div className="stat-label">Ø Schlaf (letzte {days} Tage)</div>
              <div className="stat-value" style={{ color: avgSleep >= 7 ? "var(--green)" : "var(--red)" }}>
                {avgSleep}h
              </div>
            </div>
            {avgHrvAfterNormal && (
              <div className="stat" style={{ flex: 1 }}>
                <div className="stat-label">HRV nach ≥ 7h Schlaf</div>
                <div className="stat-value" style={{ color: "var(--green)" }}>{avgHrvAfterNormal} ms</div>
                <div className="stat-sub">{normalSleepDays.length} Nächte</div>
              </div>
            )}
            {avgHrvAfterShort && (
              <div className="stat" style={{ flex: 1 }}>
                <div className="stat-label">HRV nach &lt; 7h Schlaf</div>
                <div className="stat-value" style={{ color: "var(--red)" }}>{avgHrvAfterShort} ms</div>
                <div className="stat-sub">{shortSleepDays.length} Nächte</div>
              </div>
            )}
            {avgHrvAfterShort && avgHrvAfterNormal && (
              <div className="stat" style={{ flex: 1 }}>
                <div className="stat-label">HRV-Differenz</div>
                <div className="stat-value" style={{
                  color: avgHrvAfterNormal > avgHrvAfterShort ? "var(--green)" : "var(--text-muted)"
                }}>
                  {avgHrvAfterNormal > avgHrvAfterShort ? "+" : ""}
                  {avgHrvAfterNormal - avgHrvAfterShort} ms
                </div>
                <div className="stat-sub">besser mit mehr Schlaf</div>
              </div>
            )}
          </div>

          {/* Tabelle: schlechte Nächte */}
          {shortSleepDays.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                Nächte unter 7h und HRV am Folgetag:
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>Datum</th>
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>Schlaf</th>
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>HRV Folgetag</th>
                  </tr>
                </thead>
                <tbody>
                  {shortSleepDays.slice(-10).reverse().map((d) => (
                    <tr key={d.rawDate} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "5px 8px" }}>{dayjs(d.rawDate).format("DD.MM.YYYY")}</td>
                      <td style={{ textAlign: "right", padding: "5px 8px", color: "var(--red)" }}>{d.sleepH}h</td>
                      <td style={{ textAlign: "right", padding: "5px 8px" }}>
                        {d.nextHrv != null
                          ? <span style={{ color: d.nextHrv < (avgHrvAfterNormal || 60) ? "var(--red)" : "var(--green)" }}>{d.nextHrv} ms</span>
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </>
  );
}
