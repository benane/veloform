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
        <div style={{ color: p.sleepColor, marginBottom: 2 }}>
          Schlaf: <strong>{p.sleepH}h</strong>
        </div>
      )}
      {p?.hrv != null && (
        <div style={{ color: "#a78bfa", marginBottom: 2 }}>
          HRV: <strong>{p.hrv} ms</strong>
        </div>
      )}
      {p?.nextHrv != null && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
          HRV Folgetag: {p.nextHrv} ms
        </div>
      )}
    </div>
  );
};

export default function SleepChart({ days = 42 }) {
  const { data, loading, error } = useApi(`/api/wellness?days=${days}`);

  if (loading) return <div className="card loading">Lade Schlafdaten...</div>;
  if (error) return <div className="card error">Fehler: {error}</div>;

  const sorted = [...(data || [])]
    .filter((d) => d.sleepSecs != null)
    .sort((a, b) => a.id.localeCompare(b.id));

  const hrvByDate = Object.fromEntries(
    (data || []).map((d) => [d.id, d.hrvSDNN ?? null])
  );

  const chartData = sorted.map((d, i) => {
    const sleepH = Math.round((d.sleepSecs / 3600) * 10) / 10;
    const nextDate = sorted[i + 1]?.id;
    const nextHrv = nextDate ? (hrvByDate[nextDate] ? Math.round(hrvByDate[nextDate]) : null) : null;
    const hrv = d.hrvSDNN != null ? Math.round(d.hrvSDNN) : null;
    return {
      date: dayjs(d.id).format("DD.MM"),
      rawDate: d.id,
      sleepH,
      hrv,
      nextHrv,
      sleepColor: sleepH < 6.5 ? "var(--red)" : sleepH <= 7.5 ? "var(--yellow)" : "var(--green)",
    };
  });

  const sleepVals = chartData.map((d) => d.sleepH);
  const sleepAvgs = rollingAvg(sleepVals);
  const finalData = chartData.map((d, i) => ({ ...d, sleepAvg: sleepAvgs[i] }));

  const tickInterval = Math.max(1, Math.floor(chartData.length / 10));

  // Schlaf-HRV-Korrelation - drei Kategorien
  const shortSleepDays = finalData.filter((d) => d.sleepH < 6.5 && d.nextHrv != null);
  const okSleepDays    = finalData.filter((d) => d.sleepH >= 6.5 && d.sleepH <= 7.5 && d.nextHrv != null);
  const goodSleepDays  = finalData.filter((d) => d.sleepH > 7.5 && d.nextHrv != null);
  const avgHrv = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b.nextHrv, 0) / arr.length) : null;
  const avgHrvAfterShort = avgHrv(shortSleepDays);
  const avgHrvAfterOk    = avgHrv(okSleepDays);
  const avgHrvAfterGood  = avgHrv(goodSleepDays);

  const avgSleep = Math.round((sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length) * 10) / 10;

  return (
    <>
      <div className="card">
        <div className="card-title">Schlafdauer</div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={finalData} margin={{ top: 5, right: 40, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              interval={tickInterval}
              tickLine={false}
            />
            <YAxis
              yAxisId="sleep"
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v) => `${v}h`}
              domain={[(dataMin) => Math.max(0, Math.floor(dataMin - 1)), (dataMax) => Math.ceil(dataMax)]}
            />
            <YAxis
              yAxisId="hrv"
              orientation="right"
              tick={{ fill: "#a78bfa", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={36}
              domain={[(dataMin) => Math.max(0, Math.floor(dataMin * 0.9 / 10) * 10), (dataMax) => Math.ceil((dataMax + 10) / 10) * 10]}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine yAxisId="sleep" y={6.5} stroke="var(--red)" strokeDasharray="4 3" strokeOpacity={0.6}
              label={{ value: "6,5h", position: "insideLeft", fill: "var(--red)", fontSize: 10 }} />
            <ReferenceLine yAxisId="sleep" y={7.5} stroke="var(--green)" strokeDasharray="4 3" strokeOpacity={0.6}
              label={{ value: "7,5h", position: "insideLeft", fill: "var(--green)", fontSize: 10 }} />
            <Bar yAxisId="sleep" dataKey="sleepH" radius={[3, 3, 0, 0]} legendType="none">
              {finalData.map((d, i) => (
                <Cell key={i} fill={d.sleepColor} opacity={0.7} />
              ))}
            </Bar>
            <Line
              yAxisId="sleep"
              type="monotone" dataKey="sleepAvg" stroke="var(--text)"
              strokeWidth={1} dot={false} connectNulls legendType="none"
            />
            <Line
              yAxisId="hrv"
              type="monotone" dataKey="hrv" name="HRV"
              stroke="#a78bfa" strokeWidth={1.5} dot={false} connectNulls legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 11, color: "var(--text-muted)", justifyContent: "center" }}>
          <span style={{ color: "var(--text)" }}>&#8212; 7-Tage-Schnitt</span>
          <span style={{ color: "#a78bfa" }}>&#8212; HRV (ms)</span>
        </div>
      </div>

      {(avgHrvAfterShort != null || avgHrvAfterOk != null || avgHrvAfterGood != null) && (
        <div className="card">
          <div className="card-title">Schlaf &amp; HRV &#8212; Korrelation</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <div className="stat" style={{ flex: 1 }}>
              <div className="stat-label">Schnitt ({days} Tage)</div>
              <div className="stat-value" style={{ color: avgSleep > 7.5 ? "var(--green)" : avgSleep >= 6.5 ? "var(--yellow)" : "var(--red)" }}>
                {avgSleep}h
              </div>
            </div>
            {avgHrvAfterGood != null && (
              <div className="stat" style={{ flex: 1 }}>
                <div className="stat-label">HRV nach &gt; 7,5h</div>
                <div className="stat-value" style={{ color: "var(--green)" }}>{avgHrvAfterGood} ms</div>
                <div className="stat-sub">{goodSleepDays.length} Naechte</div>
              </div>
            )}
            {avgHrvAfterOk != null && (
              <div className="stat" style={{ flex: 1 }}>
                <div className="stat-label">HRV 6,5&#8211;7,5h</div>
                <div className="stat-value" style={{ color: "var(--yellow)" }}>{avgHrvAfterOk} ms</div>
                <div className="stat-sub">{okSleepDays.length} Naechte</div>
              </div>
            )}
            {avgHrvAfterShort != null && (
              <div className="stat" style={{ flex: 1 }}>
                <div className="stat-label">HRV nach &lt; 6,5h</div>
                <div className="stat-value" style={{ color: "var(--red)" }}>{avgHrvAfterShort} ms</div>
                <div className="stat-sub">{shortSleepDays.length} Naechte</div>
              </div>
            )}
            {avgHrvAfterGood != null && avgHrvAfterShort != null && (
              <div className="stat" style={{ flex: 1 }}>
                <div className="stat-label">HRV-Differenz</div>
                <div className="stat-value" style={{
                  color: avgHrvAfterGood > avgHrvAfterShort ? "var(--green)" : "var(--text-muted)"
                }}>
                  {avgHrvAfterGood > avgHrvAfterShort ? "+" : ""}
                  {avgHrvAfterGood - avgHrvAfterShort} ms
                </div>
                <div className="stat-sub">&gt;7,5h vs. &lt;6,5h</div>
              </div>
            )}
          </div>

          {shortSleepDays.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                Naechte unter 6,5h und HRV am Folgetag:
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
                          ? <span style={{ color: d.nextHrv < (avgHrvAfterGood || 60) ? "var(--red)" : "var(--green)" }}>{d.nextHrv} ms</span>
                          : "&#8212;"}
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
