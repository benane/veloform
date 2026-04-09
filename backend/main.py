import asyncio
import re
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Body
from dotenv import load_dotenv
import intervals_client as icu
import strava_client as strava
import database as db
from datetime import date, timedelta

def extract_tag(text: str, tag: str) -> str | None:
    """Extrahiert Text zwischen ---TAG--- und ---/TAG--- Markierungen."""
    m = re.search(rf"---{tag}---\s*(.*?)\s*---/{tag}---", text or "", re.DOTALL)
    return m.group(1).strip() if m else None

load_dotenv()
db.init_db()

app = FastAPI(title="VeloForm API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/debug/events")
async def debug_events():
    """Zeigt die rohen Event-Felder der intervals.icu API – nur zum Debuggen."""
    data = await icu.get_events(days_back=3, days_forward=14)
    if not data:
        return {"count": 0, "sample": None}
    return {"count": len(data), "sample": data[0], "all_keys": list(data[0].keys())}


@app.get("/api/debug/streams/{activity_id}")
async def debug_streams(activity_id: str):
    data = await icu.get_activity_streams(activity_id)
    if isinstance(data, list):
        return {"format": "list", "count": len(data), "types": [s.get("type") for s in data], "sample_keys": list((data[0] or {}).keys()) if data else []}
    return {"format": "dict", "keys": list(data.keys()), "lengths": {k: len(v) for k, v in data.items() if isinstance(v, list)}}


@app.get("/api/debug/wellness")
async def debug_wellness():
    data = await icu.get_wellness(days=3)
    if not data:
        return {"count": 0, "sample": None}
    return {"count": len(data), "sample": data[-1], "all_keys": list(data[-1].keys())}


@app.get("/api/debug/athlete")
async def debug_athlete():
    data = await icu.get_athlete()
    return {"keys": list(data.keys()), "weight": data.get("weight"), "sample": data}


@app.get("/api/debug/strava-bikes")
async def debug_strava_bikes():
    try:
        bikes = await strava.get_athlete_bikes()
        return {"ok": True, "bikes": bikes}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/debug/strava-athlete")
async def debug_strava_athlete():
    try:
        import httpx, os
        token = await strava._get_access_token()
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://www.strava.com/api/v3/athlete",
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
        return {"status": r.status_code, "data": r.json()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/debug/power-curves")
async def debug_power_curves():
    import httpx, os
    athlete_id = os.environ["INTERVALS_ATHLETE_ID"]
    auth = ("API_KEY", os.environ["INTERVALS_API_KEY"])
    results = {}
    async with httpx.AsyncClient() as client:
        for url in [
            f"https://intervals.icu/api/v1/athlete/{athlete_id}/power-curves.json",
            f"https://intervals.icu/api/v1/athlete/{athlete_id}/power-curves",
        ]:
            for params in [
                {"curves": "90d", "type": "Ride"},
                {"curves": "90d"},
                {},
            ]:
                key = f"{url.split('/')[-1]}?{'&'.join(f'{k}={v}' for k,v in params.items())}"
                try:
                    r = await client.get(url, params=params, auth=auth, timeout=15)
                    results[key] = {"status": r.status_code, "sample": r.json() if r.status_code == 200 else r.text[:200]}
                except Exception as e:
                    results[key] = {"error": str(e)}
    return results


@app.get("/api/last-workout")
async def last_workout():
    """
    Letztes abgeschlossenes Fahrrad-Workout mit Power/HR/Cadence-Zeitreihe.
    """
    try:
        activities = await icu.get_activities(days=14)
        rides = [
            a for a in activities
            if (a.get("type") or "").lower() in ("ride", "virtualride")
        ]
        if not rides:
            return None

        rides.sort(key=lambda a: a.get("start_date_local", ""), reverse=True)
        last = rides[0]
        activity_id = last.get("id")

        streams = await icu.get_activity_streams(str(activity_id))

        # Auf max. 300 Punkte downsamplen (je nach Länge der Aktivität)
        watts = streams.get("watts") or []
        hr    = streams.get("heartrate") or []
        cad   = streams.get("cadence") or []
        n = max(len(watts), len(hr), len(cad))

        step = max(1, n // 300)
        def sample(arr):
            return [arr[i] for i in range(0, len(arr), step)]

        return {
            "name": last.get("name"),
            "date": (last.get("start_date_local") or "")[:10],
            "type": last.get("type"),
            "duration": last.get("moving_time"),
            "tss": last.get("icu_training_load"),
            "avg_power": last.get("icu_average_watts"),
            "np": last.get("icu_weighted_avg_watts"),
            "avg_hr": last.get("average_heartrate"),
            "elevation": last.get("total_elevation_gain"),
            "interval_summary": last.get("interval_summary") or [],
            "coach_notes": extract_tag(last.get("description"), "COACH"),
            "streams": {
                "watts":     sample(watts),
                "heartrate": sample(hr),
                "cadence":   sample(cad),
                "step_secs": step,
            },
        }
    except Exception as ex:
        raise HTTPException(status_code=502, detail=str(ex))


@app.get("/api/week-reviews")
async def week_reviews(count: int = Query(default=4, ge=1, le=12)):
    """Letzten N Wochenreviews aus dem intervals.icu Kalender."""
    try:
        events = await icu.get_events(days_back=90, days_forward=0)
        reviews = []
        for e in events:
            name = e.get("name") or ""
            if "wochenreview" not in name.lower():
                continue
            content = extract_tag(e.get("description"), "WEEKREVIEW")
            if content:
                reviews.append({
                    "date": e.get("start_date_local", "")[:10],
                    "name": name,
                    "content": content,
                })
        reviews.sort(key=lambda r: r["date"], reverse=True)
        return reviews[:count]
    except Exception as ex:
        raise HTTPException(status_code=502, detail=str(ex))


@app.get("/api/special-events")
async def special_events(days: int = 180):
    """
    Gibt SICK- und HOLIDAY-Events zurück, für Markierungen im HRV-Chart.
    """
    try:
        data = await icu.get_events(days_back=days, days_forward=30)
        result = []
        for e in data:
            cat = (e.get("category") or "").upper()
            is_race = cat.startswith("RACE") or (e.get("type") or "").upper() == "RACE"
            if cat not in ("SICK", "HOLIDAY") and not is_race:
                continue
            start = e.get("start_date_local", "")[:10]
            end = e.get("end_date_local", start)[:10]
            if not start:
                continue
            result.append({
                "start": start,
                "end": end if end >= start else start,
                "name": e.get("name", cat.title()),
                "category": "RACE" if is_race else cat,
            })
        return result
    except Exception as ex:
        raise HTTPException(status_code=502, detail=str(ex))


@app.get("/api/debug/all-categories")
async def debug_all_categories():
    """Zeigt alle Event-Kategorien der letzten 180 Tage – zum Finden von Krankheits-Events."""
    data = await icu.get_events(days_back=180, days_forward=0)
    cats = {}
    for e in data:
        key = f"{e.get('category')} / {e.get('type')}"
        if key not in cats:
            cats[key] = {"count": 0, "example": e.get("name")}
        cats[key]["count"] += 1
    return cats


@app.get("/api/debug/activities")
async def debug_activities():
    """Zeigt die rohen Aktivitäts-Felder – nur zum Debuggen."""
    data = await icu.get_activities(days=7)
    if not data:
        return {"count": 0, "sample": None}
    return {"count": len(data), "sample": data[0], "all_keys": list(data[0].keys())}


@app.get("/api/power-curve")
async def power_curve(days: int = Query(default=90, ge=7, le=365)):
    """
    Power Curve: beste Wattzahl für Schlüssel-Dauern im angegebenen Zeitraum.
    Gibt gefilterte Datenpunkte für relevante Dauern zurück.
    """
    try:
        raw = await icu.get_power_curve(days)
        # Nur relevante Dauern (Sekunden)
        key_durations = [5, 10, 15, 20, 30, 60, 120, 180, 300, 360, 600, 720, 1200, 1800, 2400, 3600]
        by_secs = {item["secs"]: item for item in raw if item.get("watts")}
        result = []
        for secs in key_durations:
            # Nächstliegenden Wert finden (±2 Sekunden Toleranz)
            for delta in range(3):
                entry = by_secs.get(secs + delta) or by_secs.get(secs - delta)
                if entry:
                    result.append({
                        "secs": secs,
                        "watts": round(entry["watts"]),
                        "date": entry.get("date", "")[:10],
                        "name": entry.get("name"),
                    })
                    break
        return result
    except Exception as ex:
        raise HTTPException(status_code=502, detail=str(ex))


@app.get("/api/athlete")
async def athlete():
    try:
        d = await icu.get_athlete()
        name = d.get("name") or f"{d.get('firstname', '')} {d.get('lastname', '')}".strip() or None
        # Rad-Einstellungen aus sportSettings holen
        ride_settings = next(
            (s for s in (d.get("sportSettings") or [])
             if any(t in (s.get("types") or []) for t in ("Ride", "VirtualRide", "GravelRide"))),
            {}
        )
        try:
            bikes = await strava.get_athlete_bikes()
        except Exception:
            # Fallback auf intervals.icu falls Strava nicht konfiguriert
            bikes = [
                {"id": b.get("id"), "name": b.get("name"), "km": round((b.get("distance") or 0) / 1000), "primary": False}
                for b in (d.get("bikes") or [])
            ]
        return {
            "name": name,
            "ftp": ride_settings.get("ftp"),
            "weight": d.get("icu_weight") or d.get("weight"),
            "athleteMaxHr": ride_settings.get("max_hr"),
            "lthr": ride_settings.get("lthr"),
            "bikes": bikes,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/wellness")
async def wellness(days: int = Query(default=90, ge=7, le=365)):
    """
    Gibt CTL, ATL, TSB, HRV und weitere Wellness-Metriken zurück.
    """
    try:
        data = await icu.get_wellness(days)
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/activities")
async def activities(days: int = Query(default=90, ge=7, le=365)):
    """
    Gibt abgeschlossene Aktivitäten zurück (nur Cycling + Strength).
    """
    try:
        data = await icu.get_activities(days)
        # Nur relevante Felder zurückgeben
        relevant = []
        for a in data:
            sport = (a.get("type") or "").lower()
            if sport in ("ride", "virtualride", "weighttraining", "workout"):
                relevant.append({
                    "id": a.get("id"),
                    "date": a.get("start_date_local", "")[:10],
                    "name": a.get("name"),
                    "type": a.get("type"),
                    "duration": a.get("moving_time"),        # Sekunden
                    "distance": a.get("distance"),           # Meter
                    "tss": a.get("icu_training_load"),
                    "if": a.get("icu_intensity"),
                    "avg_power": a.get("average_watts"),
                    "np": a.get("icu_weighted_avg_watts"),
                    "avg_hr": a.get("average_heartrate"),
                    "elevation": a.get("total_elevation_gain"),
                })
        return relevant
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/events")
async def events(days_back: int = 14, days_forward: int = 30):
    """
    Gibt geplante Workouts zurück (Kalender-Events).
    """
    try:
        data = await icu.get_events(days_back, days_forward)
        planned = []
        for e in data:
            if e.get("type") in ("Ride", "VirtualRide", "WeightTraining", "Workout"):
                planned.append({
                    "id": e.get("id"),
                    "date": e.get("start_date_local", "")[:10],
                    "name": e.get("name"),
                    "type": e.get("type"),
                    "planned_tss": e.get("load"),
                    "planned_duration": e.get("moving_time"),
                    "description": e.get("description"),
                })
        return planned
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/form")
async def form():
    """
    Tagesstatus: CTL/ATL/TSB mit 7-Tage-Trend, HRV relativ zum 30-Tage-Baseline.
    """
    try:
        wellness = await icu.get_wellness(days=35)
        if not wellness:
            raise HTTPException(status_code=404, detail="Keine Wellness-Daten gefunden")

        wellness.sort(key=lambda x: x.get("id", ""), reverse=True)
        latest = wellness[0]

        ctl = latest.get("ctl")
        atl = latest.get("atl")
        tsb = round(ctl - atl, 1) if (ctl is not None and atl is not None) else None

        # Trends vs. vor 7 Tagen
        def trend(current, old):
            if current is None or old is None:
                return None
            return round(current - old, 1)

        w7 = wellness[7] if len(wellness) > 7 else None
        ctl_7d = w7.get("ctl") if w7 else None
        atl_7d = w7.get("atl") if w7 else None
        tsb_7d = round(ctl_7d - atl_7d, 1) if (ctl_7d and atl_7d) else None

        # HRV: heute vs. Ø7d vs. Ø30d
        hrv_all = [(w.get("hrvSDNN"), w.get("id")) for w in wellness if w.get("hrvSDNN") is not None]
        hrv_today = hrv_all[0][0] if hrv_all else None
        hrv_avg_7d = round(sum(v for v, _ in hrv_all[:7]) / len(hrv_all[:7]), 1) if len(hrv_all) >= 1 else None
        hrv_avg_30d = round(sum(v for v, _ in hrv_all) / len(hrv_all), 1) if hrv_all else None
        hrv_pct = round((hrv_today / hrv_avg_30d - 1) * 100, 1) if (hrv_today and hrv_avg_30d) else None

        if hrv_pct is None:
            hrv_signal = "unknown"
        elif hrv_pct >= 5:
            hrv_signal = "good"
        elif hrv_pct >= -5:
            hrv_signal = "neutral"
        elif hrv_pct >= -10:
            hrv_signal = "caution"
        else:
            hrv_signal = "warning"

        # Ampel-Logik
        status = "green"
        reasons = []
        suggestion = ""

        if tsb is not None:
            if tsb > 10:
                suggestion = f"Sehr frisch (TSB +{tsb}). Tapering oder zu wenig Reiz – intensives Training möglich."
            elif tsb >= 0:
                suggestion = f"Gute Form (TSB +{tsb}). Intensive Einheit oder Wettkampf machbar."
            elif tsb >= -15:
                suggestion = f"Normale Trainingsbelastung (TSB {tsb}). Volumen und Intensität planmäßig fortführen."
            elif tsb >= -25:
                status = "yellow"
                reasons.append(f"Hohe Belastung (TSB {tsb})")
                suggestion = "Intensität reduzieren, Erholung priorisieren."
            else:
                status = "red"
                reasons.append(f"Überbelastung (TSB {tsb})")
                suggestion = "Ruhetag oder sehr lockere Einheit. Kein intensives Training."

        if hrv_signal == "good":
            if not suggestion:
                suggestion = f"HRV {hrv_pct:+.0f}% über Monatsdurchschnitt – körperlich erholt."
            else:
                suggestion += f" HRV {hrv_pct:+.0f}% über Baseline: erholt."
        elif hrv_signal == "caution":
            if status == "green":
                status = "yellow"
            reasons.append(f"HRV {hrv_pct:.0f}% unter Monatsdurchschnitt")
            suggestion += " Intensität beobachten."
        elif hrv_signal == "warning":
            if status == "green":
                status = "yellow"
            reasons.append(f"HRV deutlich unter Baseline ({hrv_pct:.0f}%)")
            suggestion += " Intensive Einheiten heute vermeiden."

        return {
            "date": latest.get("id"),
            "status": status,
            "suggestion": suggestion,
            "reasons": reasons,
            "ctl": round(ctl, 1) if ctl else None,
            "atl": round(atl, 1) if atl else None,
            "tsb": tsb,
            "ctl_trend": trend(ctl, ctl_7d),
            "atl_trend": trend(atl, atl_7d),
            "tsb_trend": trend(tsb, tsb_7d),
            "hrv": round(hrv_today, 1) if hrv_today else None,
            "hrv_avg_7d": hrv_avg_7d,
            "hrv_avg_30d": hrv_avg_30d,
            "hrv_pct_vs_30d": hrv_pct,
            "hrv_signal": hrv_signal,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


def _build_workout(e: dict, weight) -> dict:
    intensity_pct = e.get("icu_intensity")
    if intensity_pct is None:
        intensity = "medium"
    elif intensity_pct < 65:
        intensity = "low"
    elif intensity_pct < 82:
        intensity = "medium"
    elif intensity_pct < 92:
        intensity = "high"
    else:
        intensity = "race"
    doc = e.get("workout_doc") or {}
    return {
        "name": e.get("name"),
        "date": e.get("start_date_local", "")[:10],
        "duration_minutes": round((e.get("moving_time") or 0) / 60),
        "intensity": intensity,
        "intensity_pct": round(intensity_pct) if intensity_pct else None,
        "tss": e.get("icu_training_load"),
        "weight": weight,
        "steps": doc.get("steps"),
        "zone_times": doc.get("zoneTimes"),
        "description": e.get("description"),
    }


@app.get("/api/next-workout")
async def next_workout(count: int = Query(default=3, ge=1, le=10)):
    """
    Gibt die nächsten N geplanten Fahrrad-Workouts zurück.
    """
    try:
        events_data, wellness_data = await asyncio.gather(
            icu.get_events(days_back=0, days_forward=60),
            icu.get_wellness(days=30),
        )

        today = date.today().isoformat()
        future_rides = sorted(
            [e for e in events_data
             if e.get("type") in ("Ride", "VirtualRide")
             and e.get("start_date_local", "")[:10] >= today],
            key=lambda e: e.get("start_date_local", ""),
        )

        if not future_rides:
            return []

        # Letztes abgeschlossenes Workout holen – wenn es vom selben Tag ist
        # wie das erste geplante Workout, dieses überspringen
        try:
            activities = await icu.get_activities(days=3)
            rides_done = [a for a in activities if (a.get("type") or "").lower() in ("ride", "virtualride")]
            if rides_done:
                rides_done.sort(key=lambda a: a.get("start_date_local", ""), reverse=True)
                last_done_date = rides_done[0].get("start_date_local", "")[:10]
                future_rides = [e for e in future_rides if e.get("start_date_local", "")[:10] != last_done_date]
        except Exception:
            pass

        wellness_data.sort(key=lambda x: x.get("id", ""), reverse=True)
        weight = next((w["weight"] for w in wellness_data if w.get("weight") is not None), None)

        return [_build_workout(e, weight) for e in future_rides[:count]]
    except Exception as ex:
        raise HTTPException(status_code=502, detail=str(ex))


@app.get("/api/chart-data")
async def chart_data(days: int = Query(default=90, ge=14, le=365), projection: int = Query(default=14, ge=7, le=42)):
    """
    Historische CTL/ATL/TSB-Daten + Projektion in die Zukunft + Race-Events.
    Die Projektion basiert auf geplanten Workouts im Kalender.
    """
    try:
        wellness, events = await asyncio.gather(
            icu.get_wellness(days),
            icu.get_events(days_back=0, days_forward=max(projection, 60)),
        )

        wellness.sort(key=lambda x: x.get("id", ""))

        historical = [
            {
                "date": w["id"],
                "ctl": round(w["ctl"], 1),
                "atl": round(w["atl"], 1),
                "tsb": round(w["ctl"] - w["atl"], 1),
            }
            for w in wellness
            if w.get("ctl") is not None and w.get("atl") is not None
        ]

        if not historical:
            return {"historical": [], "projected": [], "races": []}

        last = historical[-1]
        current_ctl = last["ctl"]
        current_atl = last["atl"]

        # Geplante TSS nach Datum gruppieren
        today = date.today()
        planned_tss: dict[str, float] = {}
        race_events = []

        for e in events:
            d = e.get("start_date_local", "")[:10]
            if not d:
                continue
            if (e.get("category") or "").startswith("RACE"):
                race_events.append({"date": d, "name": e.get("name", "Race"), "category": e.get("category")})
            elif e.get("type") in ("Ride", "VirtualRide"):
                planned_tss[d] = planned_tss.get(d, 0) + (e.get("icu_training_load") or 0)

        # CTL/ATL mit Exponential-Smoothing projizieren
        # CTL: Zeitkonstante 42 Tage, ATL: 7 Tage (klassisches PMC-Modell)
        projected = []
        for i in range(1, projection + 1):
            future_date = (today + timedelta(days=i)).isoformat()
            tss = planned_tss.get(future_date, 0)
            current_ctl = current_ctl + (tss - current_ctl) / 42
            current_atl = current_atl + (tss - current_atl) / 7
            projected.append({
                "date": future_date,
                "ctl": round(current_ctl, 1),
                "atl": round(current_atl, 1),
                "tsb": round(current_ctl - current_atl, 1),
                "tss": round(tss),
            })

        return {"historical": historical, "projected": projected, "races": race_events}
    except Exception as ex:
        raise HTTPException(status_code=502, detail=str(ex))


@app.get("/api/weekly-summary")
async def weekly_summary(weeks: int = Query(default=8, ge=1, le=52)):
    """
    Gibt eine Wochenübersicht zurück: geplante vs. tatsächliche TSS, Dauer.
    """
    try:
        # Nächste Woche nur ab Sonntag anzeigen (Wochentag 6 = Sonntag)
        today = date.today()
        days_forward = 14 if today.weekday() == 6 else 0
        days = weeks * 7 + 7
        activities_data = await icu.get_activities(days)
        events_data = await icu.get_events(days_back=days, days_forward=days_forward)

        def get_week_key(date_str: str) -> str:
            d = date.fromisoformat(date_str[:10])
            monday = d - timedelta(days=d.weekday())
            return monday.isoformat()

        # Tatsächliche Wochenwerte
        actual: dict[str, dict] = {}
        for a in activities_data:
            d = a.get("start_date_local", "")[:10]
            if not d:
                continue
            wk = get_week_key(d)
            if wk not in actual:
                actual[wk] = {"tss": 0, "duration": 0, "rides": 0}
            actual[wk]["tss"] += a.get("icu_training_load") or 0
            actual[wk]["duration"] += a.get("moving_time") or 0
            sport = (a.get("type") or "").lower()
            if sport in ("ride", "virtualride"):
                actual[wk]["rides"] += 1

        # Geplante Wochenwerte
        planned: dict[str, dict] = {}
        for e in events_data:
            if e.get("type") not in ("Ride", "VirtualRide", "WeightTraining", "Workout"):
                continue
            d = e.get("start_date_local", "")[:10]
            if not d:
                continue
            wk = get_week_key(d)
            if wk not in planned:
                planned[wk] = {"tss": 0, "duration": 0}
            planned[wk]["tss"] += e.get("icu_training_load") or 0
            planned[wk]["duration"] += e.get("moving_time") or 0

        # Zusammenführen
        all_weeks = sorted(set(list(actual.keys()) + list(planned.keys())), reverse=True)
        result = []
        for wk in all_weeks[:weeks]:
            a = actual.get(wk, {"tss": 0, "duration": 0, "rides": 0})
            p = planned.get(wk, {"tss": 0, "duration": 0})
            result.append({
                "week": wk,
                "actual_tss": round(a["tss"]),
                "planned_tss": round(p["tss"]),
                "actual_duration": a["duration"],
                "planned_duration": p["duration"],
                "rides": a["rides"],
            })

        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ---------------------------------------------------------------------------
# Wartung – Komponenten
# ---------------------------------------------------------------------------

COMPONENT_LABELS = {
    "chain":              "Kette",
    "cassette":           "Kassette",
    "brake_pads_front":   "Bremsbeläge vorne",
    "brake_pads_rear":    "Bremsbeläge hinten",
    "tire_front":         "Reifen vorne",
    "tire_rear":          "Reifen hinten",
    "brake_rotor_front":  "Bremsrotor vorne",
    "brake_rotor_rear":   "Bremsrotor hinten",
    "battery_powermeter": "Batterie Power Meter",
    "battery_di2":        "Batterie Shimano Di2",
    "battery_axs":        "Batterie SRAM AXS",
}

MAINTENANCE_LABELS = {
    "checked":       "Geprüft",
    "waxed":         "Gewachst",
    "lubricated":    "Geölt",
    "charged":       "Geladen",
    "cleaned":       "Gereinigt",
    "bearing_check": "Lager geprüft",
    "other":         "Sonstiges",
}


@app.get("/api/maintenance/components/{bike_id}")
async def get_components(bike_id: str):
    conn = db.get_db()
    rows = conn.execute(
        "SELECT * FROM components WHERE bike_id = ? ORDER BY is_installed DESC, installed_date DESC",
        (bike_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/maintenance/components")
async def add_component(data: dict = Body(...)):
    conn = db.get_db()
    cur = conn.execute(
        """INSERT INTO components
           (bike_id, type, brand, model, installed_date, installed_km, is_installed)
           VALUES (?, ?, ?, ?, ?, ?, 1)""",
        (data["bike_id"], data["type"], data.get("brand"), data.get("model"),
         data.get("installed_date"), data.get("installed_km")),
    )
    conn.commit()
    component_id = cur.lastrowid
    conn.close()
    return {"id": component_id}


@app.patch("/api/maintenance/components/{component_id}")
async def update_component(component_id: int, data: dict = Body(...)):
    conn = db.get_db()
    conn.execute(
        "UPDATE components SET brand=?, model=? WHERE id=?",
        (data.get("brand"), data.get("model"), component_id),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.patch("/api/maintenance/components/{component_id}/remove")
async def remove_component(component_id: int, data: dict = Body(...)):
    conn = db.get_db()
    conn.execute(
        "UPDATE components SET is_installed=0, removed_date=?, removed_km=? WHERE id=?",
        (data.get("removed_date"), data.get("removed_km"), component_id),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Wartung – Logs
# ---------------------------------------------------------------------------

@app.get("/api/maintenance/log/{bike_id}")
async def get_log(bike_id: str, limit: int = Query(default=50)):
    conn = db.get_db()
    rows = conn.execute(
        """SELECT l.*, c.type as component_type, c.brand, c.model
           FROM maintenance_log l
           LEFT JOIN components c ON c.id = l.component_id
           WHERE l.bike_id = ?
           ORDER BY l.date DESC LIMIT ?""",
        (bike_id, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/maintenance/log")
async def add_log(data: dict = Body(...)):
    conn = db.get_db()
    cur = conn.execute(
        """INSERT INTO maintenance_log
           (bike_id, component_id, action, maintenance_type, date, bike_km, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (data["bike_id"], data.get("component_id"), data["action"],
         data.get("maintenance_type"), data["date"], data.get("bike_km"), data.get("note")),
    )
    conn.commit()
    log_id = cur.lastrowid
    conn.close()
    return {"id": log_id}


# ---------------------------------------------------------------------------
# Wartung – Intervalle & Notifications
# ---------------------------------------------------------------------------

@app.get("/api/maintenance/intervals/{bike_id}")
async def get_intervals(bike_id: str):
    conn = db.get_db()
    rows = conn.execute(
        "SELECT * FROM service_intervals WHERE bike_id = ?", (bike_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.put("/api/maintenance/intervals")
async def upsert_interval(data: dict = Body(...)):
    conn = db.get_db()
    action_type = data.get("action_type", "replaced")
    conn.execute(
        """INSERT INTO service_intervals (bike_id, component_type, action_type, interval_km, interval_days)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(bike_id, component_type, action_type)
           DO UPDATE SET interval_km=excluded.interval_km, interval_days=excluded.interval_days""",
        (data["bike_id"], data["component_type"], action_type,
         data.get("interval_km"), data.get("interval_days")),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.delete("/api/maintenance/intervals/{interval_id}")
async def delete_interval(interval_id: int):
    conn = db.get_db()
    conn.execute("DELETE FROM service_intervals WHERE id=?", (interval_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.delete("/api/maintenance/log/{log_id}")
async def delete_log_entry(log_id: int):
    conn = db.get_db()
    conn.execute("DELETE FROM maintenance_log WHERE id=?", (log_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.delete("/api/maintenance/components/{component_id}")
async def delete_component(component_id: int):
    conn = db.get_db()
    # Log-Referenzen lösen, dann Komponente löschen
    conn.execute("UPDATE maintenance_log SET component_id=NULL WHERE component_id=?", (component_id,))
    conn.execute("DELETE FROM components WHERE id=?", (component_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# Mapping: interval action_type → welche Log-Einträge zählen als "erledigt"
_ACTION_TYPE_SQL = {
    "replaced": "l.action = 'replaced'",
    # alle anderen: matching maintenance_type ODER Ersatz durch replaced
    "default":  "l.action = 'replaced' OR (l.action = 'maintained' AND l.maintenance_type = ?)",
}


@app.get("/api/maintenance/alerts")
async def get_alerts():
    """
    Prüft alle Komponenten gegen ihre Serviceintervalle (inkl. action_type).
    """
    try:
        bikes = await strava.get_athlete_bikes()
        bike_km = {b["id"]: b["km"] for b in bikes}
    except Exception:
        bike_km = {}

    conn = db.get_db()
    intervals = conn.execute("SELECT * FROM service_intervals").fetchall()
    alerts = []

    ACTION_LABELS = {
        "replaced":      "Tauschen",
        "checked":       "Prüfen",
        "waxed":         "Wachsen",
        "lubricated":    "Ölen",
        "charged":       "Laden",
        "cleaned":       "Reinigen",
        "tubeless":      "Tubeless",
        "bearing_check": "Lager prüfen",
    }

    for iv in intervals:
        bike_id     = iv["bike_id"]
        ctype       = iv["component_type"]
        action_type = iv["action_type"] if "action_type" in iv.keys() else "replaced"
        interval_km = iv["interval_km"]
        current_km  = bike_km.get(bike_id, 0)

        if not interval_km:
            continue

        # Kein Alert wenn kein Teil dieses Typs aktuell eingebaut ist
        installed = conn.execute(
            "SELECT 1 FROM components WHERE bike_id=? AND type=? AND is_installed=1 LIMIT 1",
            (bike_id, ctype),
        ).fetchone()
        if not installed:
            continue

        if action_type == "replaced":
            last = conn.execute(
                """SELECT l.bike_km FROM maintenance_log l
                   JOIN components c ON c.id = l.component_id
                   WHERE l.bike_id = ? AND c.type = ? AND l.action = 'replaced'
                   ORDER BY l.date DESC LIMIT 1""",
                (bike_id, ctype),
            ).fetchone()
        else:
            last = conn.execute(
                """SELECT l.bike_km FROM maintenance_log l
                   LEFT JOIN components c ON c.id = l.component_id
                   WHERE l.bike_id = ? AND (c.type = ? OR l.component_id IS NULL)
                   AND (l.action = 'replaced' OR (l.action = 'maintained' AND l.maintenance_type = ?))
                   ORDER BY l.date DESC LIMIT 1""",
                (bike_id, ctype, action_type),
            ).fetchone()

        last_km  = last["bike_km"] if last else 0
        km_since = current_km - (last_km or 0)

        if km_since >= interval_km:
            action_label = ACTION_LABELS.get(action_type, action_type)
            alerts.append({
                "bike_id":     bike_id,
                "type":        ctype,
                "action_type": action_type,
                "label":       f"{COMPONENT_LABELS.get(ctype, ctype)} – {action_label}",
                "km_since":    km_since,
                "interval_km": interval_km,
                "overdue_km":  km_since - interval_km,
            })

    conn.close()
    return alerts


# ---------------------------------------------------------------------------
# Inventar
# ---------------------------------------------------------------------------

@app.get("/api/maintenance/inventory")
async def get_inventory():
    conn = db.get_db()
    rows = conn.execute("SELECT * FROM inventory ORDER BY type, brand").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/maintenance/inventory")
async def add_inventory(data: dict = Body(...)):
    conn = db.get_db()
    cur = conn.execute(
        "INSERT INTO inventory (type, brand, model, quantity, min_quantity) VALUES (?, ?, ?, ?, ?)",
        (data["type"], data.get("brand"), data.get("model"),
         data.get("quantity", 0), data.get("min_quantity", 1)),
    )
    conn.commit()
    item_id = cur.lastrowid
    conn.close()
    return {"id": item_id}


@app.patch("/api/maintenance/inventory/{item_id}")
async def update_inventory(item_id: int, data: dict = Body(...)):
    conn = db.get_db()
    conn.execute(
        "UPDATE inventory SET quantity=? WHERE id=?",
        (data["quantity"], item_id),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/maintenance/inventory/{item_id}/use")
async def use_inventory(item_id: int):
    """Reduziert den Bestand um 1 (beim Einbau eines Teils)."""
    conn = db.get_db()
    row = conn.execute("SELECT quantity FROM inventory WHERE id=?", (item_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Item nicht gefunden")
    new_qty = max(0, row["quantity"] - 1)
    conn.execute("UPDATE inventory SET quantity=? WHERE id=?", (new_qty, item_id))
    conn.commit()
    conn.close()
    return {"ok": True, "quantity": new_qty}


@app.delete("/api/maintenance/inventory/{item_id}")
async def delete_inventory(item_id: int):
    conn = db.get_db()
    conn.execute("DELETE FROM inventory WHERE id=?", (item_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
