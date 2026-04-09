"""
SQLite-Datenbankschicht für das Wartungsfeature.
Die Datenbankdatei liegt im Backend-Verzeichnis (oder per DB_PATH konfigurierbar).
"""

import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", "veloform.db")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Ergebnisse als Dict-ähnliche Objekte
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Erstellt alle Tabellen falls sie noch nicht existieren. Führt Migrationen aus."""
    conn = get_db()

    # Kern-Tabellen
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS components (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            bike_id        TEXT    NOT NULL,
            type           TEXT    NOT NULL,
            brand          TEXT,
            model          TEXT,
            installed_date TEXT,
            installed_km   INTEGER,
            removed_date   TEXT,
            removed_km     INTEGER,
            is_installed   INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS maintenance_log (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            bike_id          TEXT    NOT NULL,
            component_id     INTEGER REFERENCES components(id) ON DELETE SET NULL,
            action           TEXT    NOT NULL,
            maintenance_type TEXT,
            date             TEXT    NOT NULL,
            bike_km          INTEGER,
            note             TEXT
        );

        CREATE TABLE IF NOT EXISTS inventory (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            type         TEXT    NOT NULL,
            brand        TEXT,
            model        TEXT,
            quantity     INTEGER NOT NULL DEFAULT 0,
            min_quantity INTEGER NOT NULL DEFAULT 1
        );
    """)

    # service_intervals: Migration auf action_type-Schema
    existing = conn.execute("PRAGMA table_info(service_intervals)").fetchall()
    col_names = [row[1] for row in existing]

    if not existing:
        # Frische Installation
        conn.executescript("""
            CREATE TABLE service_intervals (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                bike_id        TEXT    NOT NULL,
                component_type TEXT    NOT NULL,
                action_type    TEXT    NOT NULL DEFAULT 'replaced',
                interval_km    INTEGER,
                interval_days  INTEGER,
                UNIQUE(bike_id, component_type, action_type)
            );
        """)
    elif "action_type" not in col_names:
        # Migration: altes Schema → neues Schema (Daten bleiben erhalten als 'replaced')
        conn.executescript("""
            CREATE TABLE service_intervals_new (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                bike_id        TEXT    NOT NULL,
                component_type TEXT    NOT NULL,
                action_type    TEXT    NOT NULL DEFAULT 'replaced',
                interval_km    INTEGER,
                interval_days  INTEGER,
                UNIQUE(bike_id, component_type, action_type)
            );
            INSERT INTO service_intervals_new
                (bike_id, component_type, action_type, interval_km, interval_days)
            SELECT bike_id, component_type, 'replaced', interval_km, interval_days
            FROM service_intervals;
            DROP TABLE service_intervals;
            ALTER TABLE service_intervals_new RENAME TO service_intervals;
        """)

    conn.commit()
    conn.close()
