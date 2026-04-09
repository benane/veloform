"""
Wrapper für die intervals.icu API.
Dokumentation: https://forum.intervals.icu/t/api-access-to-intervals-icu/609
"""

import httpx
import os
from datetime import date, timedelta

BASE_URL = "https://intervals.icu/api/v1"


def _auth() -> tuple[str, str]:
    """Basic Auth: Benutzername ist immer 'API_KEY', Passwort ist der API Key."""
    return ("API_KEY", os.environ["INTERVALS_API_KEY"])


def _athlete_id() -> str:
    return os.environ["INTERVALS_ATHLETE_ID"]


async def get_wellness(days: int = 90) -> list[dict]:
    """
    Holt Wellness-Daten: CTL, ATL, TSB, HRV, Gewicht, etc.
    """
    oldest = (date.today() - timedelta(days=days)).isoformat()
    newest = date.today().isoformat()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/athlete/{_athlete_id()}/wellness",
            params={"oldest": oldest, "newest": newest},
            auth=_auth(),
            timeout=30,
        )
        response.raise_for_status()
        return response.json()


async def get_activities(days: int = 90) -> list[dict]:
    """
    Holt abgeschlossene Aktivitäten (tatsächlich durchgeführte Workouts).
    """
    oldest = (date.today() - timedelta(days=days)).isoformat()
    newest = date.today().isoformat()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/athlete/{_athlete_id()}/activities",
            params={"oldest": oldest, "newest": newest},
            auth=_auth(),
            timeout=30,
        )
        response.raise_for_status()
        return response.json()


async def get_events(days_back: int = 14, days_forward: int = 30) -> list[dict]:
    """
    Holt geplante Workouts (Events im Kalender), inkl. Zukunft.
    """
    oldest = (date.today() - timedelta(days=days_back)).isoformat()
    newest = (date.today() + timedelta(days=days_forward)).isoformat()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/athlete/{_athlete_id()}/events",
            params={"oldest": oldest, "newest": newest},
            auth=_auth(),
            timeout=30,
        )
        response.raise_for_status()
        return response.json()


async def get_power_curve(days: int = 90) -> list[dict]:
    """
    Beste Leistungswerte (Power Curve) für einen Zeitraum.
    Gibt eine Liste mit {secs, watts, date} zurück.
    """
    curve_id = "1y" if days >= 365 else f"{days}d"
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/athlete/{_athlete_id()}/power-curves",
            params={"curves": curve_id, "type": "Ride"},
            auth=_auth(),
            timeout=30,
        )
        response.raise_for_status()
        raw = response.json()

    curve = (raw.get("list") or [{}])[0]
    activities = raw.get("activities") or {}

    secs_list = curve.get("secs") or []
    watts_list = curve.get("values") or curve.get("watts") or []
    act_ids    = curve.get("activity_id") or []

    result = []
    for i, secs in enumerate(secs_list):
        watts = watts_list[i] if i < len(watts_list) else None
        if not watts:
            continue
        act_id = act_ids[i] if i < len(act_ids) else None
        act    = activities.get(act_id) or {}
        date   = (act.get("start_date_local") or "")[:10]
        result.append({"secs": secs, "watts": round(watts), "date": date, "name": act.get("name")})

    return result


async def get_activity_streams(activity_id: str) -> dict:
    """
    Holt Zeitreihen-Daten für eine Aktivität.
    intervals.icu gibt entweder ein Dict {type: [values]} oder eine Liste [{type, data}] zurück.
    Wir normalisieren immer zu einem Dict.
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/activity/{activity_id}/streams",
            auth=_auth(),
            timeout=60,
        )
        response.raise_for_status()
        raw = response.json()

    # Normalisieren: Liste → Dict
    if isinstance(raw, list):
        return {item["type"]: item.get("data", []) for item in raw if "type" in item}
    return raw


async def get_athlete() -> dict:
    """
    Holt Athleten-Stammdaten (Name, Gewicht, FTP, etc.).
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/athlete/{_athlete_id()}",
            auth=_auth(),
            timeout=30,
        )
        response.raise_for_status()
        return response.json()
