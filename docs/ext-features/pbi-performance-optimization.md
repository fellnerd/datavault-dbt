# Power BI Performance Optimization — Implementierungsplan

> **Status:** Geplant (noch nicht umgesetzt)
> **Priorität:** Mittel — aktuell 16s per Drill, Ziel < 2s
> **Voraussetzung:** `fakt_buchungen` bereits als Table materialisiert (commit `9808745`)

---

## Ausgangslage

| Metrik | Aktuell | Ziel |
|--------|---------|------|
| DirectQuery Execute | 2–3s | ≤ 1s |
| DAX Execute | ~16s | < 2s |
| Total Drill | ~16s | < 2s |

**Ursachen (aus Performance-Log 14.06.2026):**
- `dim_konto` → DirectQuery (View, ca. 280 Zeilen)
- `dim_kostenstelle` → DirectQuery (View, ca. 50 Zeilen)
- `Total Actuals` / `Total Budget` / `Total Prev Year` / `Total Actuals (with Forecast)` → komplexe SWITCH+CALCULATE+REMOVEFILTERS Logik für 6 Summary-Zeilen → hohe DAX-Engine-Last

---

## Massnahme 1 — `dim_konto` und `dim_kostenstelle` materialisieren

### Motivation
DirectQuery auf Dimensions-Views erzwingt bei jedem Drill einen SQL-Roundtrip.
Mit Tabellen liegen die Daten im AS-Engine-Memory → kein SQL-Roundtrip nötig.

### Umsetzung

**Neue Dateien:**

`models/mart/finance/dim_konto.sql` — `materialized='table'`:
```sql
{{ config(materialized='table', as_columnstore=false, tags=['dimension']) }}
SELECT * FROM {{ ref('dim_konto_v') }}   -- oder SQL direkt kopieren
```
> ACHTUNG: Da `dim_konto_v` selbst ein View mit UNION ALL + Plug-Zeilen ist,
> muss die Logik direkt in `dim_konto.sql` — `dim_konto_v` wird zum Wrapper.

**Umstrukturierung:**
```
dim_konto.sql   → materialized='table'  (komplette Logik: UNION hub_konto + ref_konto + Plug-Zeilen)
dim_konto_v.sql → materialized='view'   (SELECT * FROM {{ ref('dim_konto') }})
```

**Analog für dim_kostenstelle:**
```
dim_kostenstelle.sql   → materialized='table'
dim_kostenstelle_v.sql → materialized='view' (Wrapper)
```

**Deploy:**
```bash
dbt run --select dim_konto dim_konto_v dim_kostenstelle dim_kostenstelle_v --target ewb-dev --full-refresh
dbt run --select dim_konto dim_konto_v dim_kostenstelle dim_kostenstelle_v --target ewb-test --full-refresh
```

**Erwarteter Effekt:** DirectQuery-Roundtrips für Dimensionen entfallen → ~5s Reduktion

---

## Massnahme 2 — Pre-aggregierte Summary-Tabelle `fakt_buchungen_summary`

### Motivation
Die DAX Measures (`Total Actuals`, `Total Budget` etc.) berechnen Summary-Zeilen
(4x Bruttoergebnis, 5x Bruttoergebnis mit Personal, ...) via SWITCH+CALCULATE+REMOVEFILTERS.
Jede Summary-Zeile summiert mehrere `konto_l2`-Gruppen — teuer im DAX-Engine (~13s).

### Konzept
Pre-aggregierte Tabelle mit Summen je `(konto_l2, buchungsdatum_date_key)`:

**Neue Datei:** `models/mart/finance/fakt_buchungen_summary.sql`:
```sql
{{ config(materialized='table', as_columnstore=false, tags=['fact']) }}

SELECT
    dk.konto_l2,
    b.buchungsdatum_date_key,
    SUM(b.betrag) AS betrag
FROM {{ ref('fakt_buchungen') }} b
JOIN {{ ref('dim_konto') }} dk ON b.konto_key = dk.konto_key
WHERE dk.konto_l2 IS NOT NULL
  AND dk.konto_key > 0   -- keine Plug-Zeilen
GROUP BY dk.konto_l2, b.buchungsdatum_date_key
```

### Vereinfachte Measures (neue Varianten — alte bleiben erhalten)

Statt SWITCH+CALCULATE in DAX:
```dax
-- Neu: Total Actuals Fast
Total Actuals Fast =
VAR L2 = SELECTEDVALUE('dim_konto'[konto_l2])
VAR IsSummary = L2 IN {"4x Bruttoergebnis","5x Bruttoergebnis mit Personal","6ax EBITDA","6bx EBIT","7x Betriebsergebnis","9x Ergebnis"}
RETURN
    IF(
        IsSummary,
        CALCULATE(
            SUM('fakt_buchungen_summary'[betrag]),
            REMOVEFILTERS('dim_konto'[konto_l2]),
            'dim_konto'[konto_l2] IN <entsprechende Gruppe>
        ),
        SUM('fakt_buchungen'[betrag])
    )
```

> **Wichtig:** Alte Measures (`Total Actuals`, `Total Budget` etc.) bleiben unverändert.
> Neue Measures bekommen Suffix ` Fast` und werden nach Validierung parallel im Visual getestet.

### Erwarteter Effekt
- DirectQuery auf `fakt_buchungen_summary` (aggregiert) statt auf `fakt_buchungen` (Zeilenebene)
- Weniger Zeilen → schnellerer SQL-Roundtrip
- Vereinfachte DAX-Logik → weniger Engine-Last
- Ziel: DAX-Zeit von ~13s auf < 2s

---

## Reihenfolge der Umsetzung

| Schritt | Massnahme | Aufwand | Erwartete Reduktion |
|---------|-----------|---------|-------------------|
| 1 | `dim_konto` + `dim_kostenstelle` materialisieren | 1h | ~3–5s |
| 2 | `fakt_buchungen_summary` anlegen | 2h | ~8–10s |
| 3 | Neue `*Fast` Measures anlegen + testen | 1h | validieren |
| 4 | Visual auf Fast-Measures umstellen | 0.5h | — |

**Gesamtaufwand:** ~4–5h
**Gesamtreduktion:** von ~16s auf < 2s

---

## Nicht umgesetzte Alternativen

| Alternative | Warum verworfen |
|-------------|----------------|
| Import-Modus (PBI) | Vom User explizit abgelehnt |
| Azure SQL Tier erhöhen | Keine Code-Änderung, aber Kosten |
| PBI Aggregations-Tabellen (Dual-Mode) | Komplex, hoher Aufwand |
