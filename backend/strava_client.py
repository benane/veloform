"""
Wrapper für die Strava API.
Dokumentation: https://developers.strava.com/docs/reference/

Strava nutzt OAuth 2.0 – Access Tokens laufen alle 6 Stunden ab.
Der Refresh Token ist dauerhaft gültig und wird genutzt um automatisch
neue Access Tokens zu holen.
"""

import httpx
import os
import time

BASE_URL = "https://www.strava.com/api/v3"

# Einfacher In-Memory-Cache für den Access Token
_token_cache: dict = {"access_token": None, "expires_at": 0}

# Cache für Bike-Daten (1 Stunde TTL – km ändert sich nicht sekundengenau)
_bikes_cache: dict = {"bikes": None, "expires_at": 0}
BIKES_TTL = 3600  # Sekunden


async def _get_access_token() -> str:
    """
    Gibt einen gültigen Access Token zurück.
    Holt automatisch einen neuen wenn der alte abgelaufen ist.
    """
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["access_token"]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id":     os.environ["STRAVA_CLIENT_ID"],
                "client_secret": os.environ["STRAVA_CLIENT_SECRET"],
                "refresh_token": os.environ["STRAVA_REFRESH_TOKEN"],
                "grant_type":    "refresh_token",
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"]   = data["expires_at"]
    return _token_cache["access_token"]


async def get_athlete_bikes() -> list[dict]:
    """
    Holt Fahrrad-Details via GET /gear/{id}.
    IDs werden aus STRAVA_BIKE_IDS (kommagetrennt) gelesen.
    Ergebnis wird 1 Stunde gecacht um Strava Rate-Limits zu vermeiden.
    """
    if _bikes_cache["bikes"] is not None and time.time() < _bikes_cache["expires_at"]:
        return _bikes_cache["bikes"]

    ids_raw = os.environ.get("STRAVA_BIKE_IDS", "")
    gear_ids = [i.strip() for i in ids_raw.split(",") if i.strip()]
    if not gear_ids:
        return []

    token = await _get_access_token()
    headers = {"Authorization": f"Bearer {token}"}

    bikes = []
    async with httpx.AsyncClient() as client:
        for gear_id in gear_ids:
            if not gear_id.startswith("b"):
                gear_id = f"b{gear_id}"
            r = await client.get(f"{BASE_URL}/gear/{gear_id}", headers=headers, timeout=15)
            r.raise_for_status()
            d = r.json()
            brand = d.get("brand_name") or ""
            model = d.get("model_name") or ""
            full_name = f"{brand} {model}".strip() if (brand or model) else d.get("name")
            bikes.append({
                "id":   d.get("id"),
                "name": full_name,
                "km":   round((d.get("distance") or 0) / 1000),
            })

    _bikes_cache["bikes"] = bikes
    _bikes_cache["expires_at"] = time.time() + BIKES_TTL
    return bikes
