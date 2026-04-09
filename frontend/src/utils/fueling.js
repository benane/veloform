// g Kohlenhydrate pro Stunde pro kg Körpergewicht
export const CARB_RATE_PER_KG = { low: 0.43, medium: 0.71, high: 0.86, race: 1.07 };
export const BASE_FACTOR = 0.85;

/**
 * Präzise Berechnung direkt aus IF (Intensity Factor).
 * Formel: carbs = BASE_FACTOR * weightKg * IF * durationHours
 * IF wird als Prozentwert übergeben (z.B. 75 für 75%).
 */
export function calcCarbsFromIF(durationMin, intensityPct, weightKg) {
  if (!durationMin || !intensityPct || !weightKg) return null;
  if (durationMin < 45) return { carbs: 0, note: "Unter 45 Minuten: kein Fueling nötig." };

  const hours = durationMin / 60;
  const IF    = intensityPct / 100;
  const carbs = Math.round(BASE_FACTOR * weightKg * IF * hours);

  return {
    carbs,
    ratePerHour: Math.round(carbs / hours),
    gels:  Math.round(carbs / 22),
    bars:  Math.round(carbs / 40),
    bidons:  Math.round(carbs / 45),
  };
}

export const INTENSITY_LABELS = {
  low:    "Locker (Z1–Z2, IF < 65%)",
  medium: "Moderat (Z3, Sweet Spot)",
  high:   "Intensiv (Z4, Threshold)",
  race:   "Wettkampf / Z5+",
};

export function calcCarbs(durationMin, intensity, weightKg, hadMeal) {
  if (durationMin < 45)
    return { carbs: 0, note: "Unter 45 Minuten: kein Fueling nötig." };
  if (durationMin < 75 && intensity === "low")
    return { carbs: 0, note: "Lockere Einheit unter 75 Min: Nüchterntraining möglich." };

  const hours = durationMin / 60;
  const ratePerHour = Math.round(CARB_RATE_PER_KG[intensity] * weightKg);
  const mealFactor  = hadMeal ? 0.75 : 1.0;
  const carbs       = Math.round(ratePerHour * hours * mealFactor);

  const notes = [];
  if (intensity === "race" && ratePerHour > 60)
    notes.push("Über 60g/h: Glucose + Fructose Mix (2:1) für maximale Aufnahme.");
  if (durationMin >= 180)
    notes.push("Lange Einheit: alle 20–30 Min regelmäßig essen.");
  if (hadMeal)
    notes.push("Mit Mahlzeit: 75% weniger Fueling nötig.");

  return {
    carbs,
    ratePerHour,
    gels:  Math.round(carbs / 22),
    bars:  Math.round(carbs / 40),
    bidons:  Math.round(carbs / 45),
    note:  notes.join(" "),
  };
}
