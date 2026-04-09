import { useState, useEffect } from "react";
import dayjs from "dayjs";
import { calcCarbs, INTENSITY_LABELS } from "../utils/fueling";

function inputStyle() {
  return {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    background: "var(--surface-2)", border: "1px solid var(--border)",
    color: "var(--text)", fontSize: 14, outline: "none",
  };
}

export default function FuelingCalc() {
  const [weight, setWeight]       = useState(70);
  const [duration, setDuration]   = useState(60);
  const [intensity, setIntensity] = useState("medium");
  const [hadMeal, setHadMeal]     = useState(false);
  const [workout, setWorkout]     = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    fetch("/api/next-workout?count=1")
      .then((r) => r.json())
      .then((data) => {
        const first = Array.isArray(data) ? data[0] : data;
        if (first) {
          setWorkout(first);
          if (first.duration_minutes) setDuration(first.duration_minutes);
          if (first.intensity) setIntensity(first.intensity);
          if (first.weight) setWeight(Math.round(first.weight));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const withoutMeal = calcCarbs(duration, intensity, weight, false);
  const withMeal    = calcCarbs(duration, intensity, weight, true);
  const result      = hadMeal ? withMeal : withoutMeal;

  return (
    <div className="card">
      <div className="card-title">Ride Fueling Calculator</div>

      {/* Nächstes Workout */}
      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>Lade nächstes Workout…</div>
      ) : workout ? (
        <div style={{
          background: "var(--surface-2)", borderRadius: 8, padding: "10px 14px",
          marginBottom: 16, borderLeft: "3px solid var(--accent)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{workout.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {dayjs(workout.date).format("dd, DD.MM.YYYY")}
            {workout.intensity_pct && ` · IF ${workout.intensity_pct}%`}
            {workout.tss && ` · ${workout.tss} TSS`}
          </div>
        </div>
      ) : (
        <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
          Kein geplantes Ride in den nächsten 30 Tagen.
        </div>
      )}

      {/* Eingaben */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5 }}>Gewicht (kg)</label>
          <input type="number" value={weight} min={40} max={150}
            onChange={(e) => setWeight(Number(e.target.value))} style={inputStyle()} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5 }}>Dauer (Min)</label>
          <input type="number" value={duration} min={15} max={600} step={5}
            onChange={(e) => setDuration(Number(e.target.value))} style={inputStyle()} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5 }}>Intensität</label>
          <select value={intensity} onChange={(e) => setIntensity(e.target.value)} style={inputStyle()}>
            {Object.entries(INTENSITY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Intensitäts-Hinweis bei gemischten Einheiten */}
      {workout?.intensity_pct && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Aus IF {workout.intensity_pct}% abgeleitet. Bei gemischten Einheiten (z.B. SST + Threshold)
          liegt die Realität zwischen <strong>medium</strong> und <strong>high</strong> – passe manuell an.
        </div>
      )}

      {/* Mahlzeit Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { val: false, label: "Nüchtern / keine Mahlzeit (< 2–3h)" },
          { val: true,  label: "Mahlzeit vorher (< 2–3h)" },
        ].map(({ val, label }) => (
          <button key={String(val)} onClick={() => setHadMeal(val)} style={{
            flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, cursor: "pointer",
            background: hadMeal === val ? "var(--accent)" : "var(--surface-2)",
            color: hadMeal === val ? "#fff" : "var(--text-muted)",
            border: `1px solid ${hadMeal === val ? "var(--accent)" : "var(--border)"}`,
          }}>{label}</button>
        ))}
      </div>

      {/* Ergebnis */}
      <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: 20 }}>
        {result.carbs === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>{result.note}</div>
        ) : (
          <>
            <div style={{ fontSize: 36, fontWeight: 700, color: "var(--accent)", marginBottom: 4 }}>
              {result.carbs}g
              <span style={{ fontSize: 15, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
                Kohlenhydrate total · {result.ratePerHour}g/h
              </span>
            </div>

            {/* Vergleich mit/ohne Mahlzeit */}
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
              Ohne Mahlzeit: <strong style={{ color: "var(--text)" }}>{withoutMeal.carbs}g</strong>
              {"  ·  "}
              Mit Mahlzeit: <strong style={{ color: "var(--text)" }}>{withMeal.carbs}g</strong>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              {[
                { label: "Gels (~22g)",    value: result.gels },
                { label: "Riegel (~40g)",  value: result.bars },
                { label: "Bidons (~45g)",  value: result.bidons },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: "var(--surface)", borderRadius: 8,
                  padding: "10px 16px", flex: 1, textAlign: "center",
                }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>

            {result.note && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                {result.note}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
