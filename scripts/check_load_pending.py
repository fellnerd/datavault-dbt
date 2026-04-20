#!/usr/bin/env python3
"""
Prüft ob ein neuer ADF-Load vorliegt, der noch nicht von dbt verarbeitet wurde.

Liest vault.load_status_pending_v und gibt dbt_run_pending aus.

Exit Codes:
  0 — dbt_run_pending = 1 → dbt run nötig
  2 — dbt_run_pending = 0 → kein Run nötig
  1 — Fehler (Verbindung, View nicht vorhanden, etc.)
"""
import os
import sys
import pyodbc

user     = os.environ['DBT_EWB_SQL_USER']
password = os.environ['DBT_EWB_SQL_PASSWORD']
database = os.environ.get('DBT_DATABASE', 'datavault-test')

conn_str = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=tcp:sql-analytics-ewb-001.database.windows.net;"
    f"DATABASE={database};"
    f"UID={user};"
    f"PWD={password};"
    "Encrypt=yes;TrustServerCertificate=yes"
)

try:
    conn = pyodbc.connect(conn_str, timeout=30)
    row = conn.cursor().execute(
        "SELECT dbt_run_pending FROM vault.load_status_pending_v"
    ).fetchone()
    pending = int(row[0]) if row else 0
    print(f"[load_status_pending_v] database={database} dbt_run_pending={pending}")
    sys.exit(0 if pending == 1 else 2)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
