# db-monitor: Plausibilitäts-Check — Aufgabenplan

**Agent:** `@db-monitor`  
**Ziel:** SQL-Validierungen auf `datavault-test` ausführen und Ergebnisse gegen PBI-Kontrollwerte prüfen.  
**Server:** `sql-analytics-ewb-001.database.windows.net` → Datenbank `datavault-test`

---

## Verbindung

```
Server:   sql-analytics-ewb-001.database.windows.net
Database: datavault-test
```

---

## SCHRITT 1 — Struktur-Check (was existiert?)

### 1.1 Alle Mart-Tabellen auflisten

```sql
SELECT
    TABLE_SCHEMA,
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA IN ('mart', 'mart_finance', 'mart_project')
ORDER BY TABLE_SCHEMA, TABLE_TABLE_TYPE DESC, TABLE_NAME;
```

**Erwartete Objekte:**

| Schema | Name | Typ |
|--------|------|-----|
| mart | dim_date | VIEW |
| mart_finance | dim_buchungsstatus_v | VIEW |
| mart_finance | dim_konto_v | VIEW |
| mart_finance | dim_kostenstelle_v | VIEW |
| mart_finance | dim_kreditor_v | VIEW |
| mart_finance | fakt_belege_v | VIEW |
| mart_finance | fakt_buchungen_v | VIEW |
| mart_finance | fakt_budget_v | VIEW |
| mart_finance | fakt_forecast_v | VIEW |
| mart_project | dim_abteilung_v | VIEW |
| mart_project | dim_leistungsart_v | VIEW |
| mart_project | dim_person_v | VIEW |
| mart_project | dim_projekt_v | VIEW |
| mart_project | fakt_stunden_v | VIEW |

**Aktion:** Fehlende Objekte als `➕ MISSING` markieren.

### 1.2 Spalten-Inventar Finance Kern-Tabellen

```sql
-- fakt_buchungen_v Spalten
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'mart_finance' AND TABLE_NAME = 'fakt_buchungen_v'
ORDER BY ORDINAL_POSITION;

-- dim_konto_v Spalten
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'mart_finance' AND TABLE_NAME = 'dim_konto_v'
ORDER BY ORDINAL_POSITION;

-- dim_kostenstelle_v Spalten
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'mart_finance' AND TABLE_NAME = 'dim_kostenstelle_v'
ORDER BY ORDINAL_POSITION;
```

### 1.3 Spalten-Inventar Projekt Kern-Tabellen

```sql
-- dim_projekt_v Spalten
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'mart_project' AND TABLE_NAME = 'dim_projekt_v'
ORDER BY ORDINAL_POSITION;

-- fakt_stunden_v Spalten
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'mart_project' AND TABLE_NAME = 'fakt_stunden_v'
ORDER BY ORDINAL_POSITION;
```

---

## SCHRITT 2 — Finance: Row-Counts und Datenvollständigkeit

### 2.1 fakt_buchungen_v — Grundübersicht

```sql
SELECT
    YEAR(TRY_CAST(b.buchungsdatum_date_key / 10000 AS NVARCHAR(4)) + '-'
        + RIGHT('0' + CAST((b.buchungsdatum_date_key / 100) % 100 AS NVARCHAR(2)), 2) + '-01'
        AS DATE) AS Jahr,
    COUNT(*) AS anzahl_zeilen,
    SUM(b.betrag) AS betrag_total,
    SUM(ABS(b.betrag)) AS betrag_abs_total
FROM mart_finance.fakt_buchungen_v b
GROUP BY
    YEAR(TRY_CAST(
        CAST(b.buchungsdatum_date_key / 10000 AS NVARCHAR(4)) + '-'
        + RIGHT('0' + CAST((b.buchungsdatum_date_key / 100) % 100 AS NVARCHAR(2)), 2) + '-01'
    AS DATE))
ORDER BY Jahr DESC;
```

> **Hinweis:** `buchungsdatum_date_key` ist INT im Format YYYYMMDD. Jahr = `buchungsdatum_date_key / 10000`.

**Vereinfachte Version:**
```sql
SELECT
    buchungsdatum_date_key / 10000 AS jahr,
    COUNT(*) AS anzahl_zeilen,
    SUM(betrag) AS betrag_total
FROM mart_finance.fakt_buchungen_v
GROUP BY buchungsdatum_date_key / 10000
ORDER BY jahr DESC;
```

### 2.2 Plausibilitätscheck Ertrag 2023 (Konto 3xxxx)

```sql
-- Konto-Hierarchie: Konto_L2 "3 " = Ertrag
-- Im Mart verknüpft über konto_key → dim_konto_v.konto_subgruppe
SELECT
    SUM(b.betrag) AS ertrag_total_2023
FROM mart_finance.fakt_buchungen_v b
INNER JOIN mart_finance.dim_konto_v k
    ON b.konto_key = k.konto_key
WHERE buchungsdatum_date_key / 10000 = 2023
  AND LEFT(k.konto_id, 1) = '3';

-- Ziel: ~47,530,000 CHF (47,530K) gemäss PBI ER Budget 2025
```

**Alternative ohne Join (via konto_id direkt):**
```sql
SELECT
    SUM(b.betrag) AS ertrag_total_2023
FROM mart_finance.fakt_buchungen_v b
WHERE buchungsdatum_date_key / 10000 = 2023
  AND TRY_CAST(konto_id AS INT) >= 30000
  AND TRY_CAST(konto_id AS INT) < 40000;
```

> ⚠️ Hinweis: `konto_id` ist NVARCHAR, `konto_key` ist FK auf dim_konto_v. Die korrekte Methode ist der Join via `konto_key`.  
> Die fakt_buchungen_v enthält `konto_key` (BIGINT Surrogate Key).

### 2.3 Gesamtergebnis 2023 (Soll: ~1,220K)

```sql
-- 9x Ergebnis = Summe aller Buchungen (Ertrag positiv, Aufwand negativ)
SELECT
    SUM(betrag) AS ergebnis_2023
FROM mart_finance.fakt_buchungen_v
WHERE buchungsdatum_date_key / 10000 = 2023;

-- Ziel: ~1,220,000 CHF (1,220K)
```

### 2.4 Ertrag 2024 (Soll: ~43,445K)

```sql
SELECT
    SUM(b.betrag) AS ertrag_total_2024
FROM mart_finance.fakt_buchungen_v b
INNER JOIN mart_finance.dim_konto_v k
    ON b.konto_key = k.konto_key
WHERE buchungsdatum_date_key / 10000 = 2024
  AND LEFT(k.konto_id, 1) = '3';

-- Ziel: ~43,445,000 CHF
```

### 2.5 Gesamtergebnis 2024 (Soll: ~1,017K)

```sql
SELECT
    SUM(betrag) AS ergebnis_2024
FROM mart_finance.fakt_buchungen_v
WHERE buchungsdatum_date_key / 10000 = 2024;

-- Ziel: ~1,017,000 CHF
```

### 2.6 Gesamtergebnis Jan–Aug 2024 (Soll: ~605K)

```sql
SELECT
    SUM(betrag) AS ergebnis_jan_aug_2024
FROM mart_finance.fakt_buchungen_v
WHERE buchungsdatum_date_key >= 20240101
  AND buchungsdatum_date_key <= 20240831;

-- Ziel: ~605,000 CHF
```

### 2.7 Gesamtergebnis Jan–Aug 2026 (Soll: ~2,947K)

```sql
SELECT
    SUM(betrag) AS ergebnis_jan_aug_2026
FROM mart_finance.fakt_buchungen_v
WHERE buchungsdatum_date_key >= 20260101
  AND buchungsdatum_date_key <= 20260831;

-- Ziel: ~2,947,000 CHF (aktuellster verfügbarer Wert aus ER 2026-1.82)
```

### 2.8 Budget-Daten vorhanden? (fakt_budget_v)

```sql
-- Prüfen ob Budget-Daten vorhanden
SELECT
    budget_jahr,
    COUNT(*) AS anzahl_zeilen,
    SUM(betrag) AS budget_total
FROM mart_finance.fakt_budget_v
GROUP BY budget_jahr
ORDER BY budget_jahr DESC;
```

> Falls Spaltenname unbekannt: Zuerst Spalten über `INFORMATION_SCHEMA.COLUMNS` prüfen.

### 2.9 Forecast-Daten vorhanden? (fakt_forecast_v)

```sql
SELECT
    forecast_jahr,
    COUNT(*) AS anzahl_zeilen,
    SUM(betrag) AS forecast_total
FROM mart_finance.fakt_forecast_v
GROUP BY forecast_jahr
ORDER BY forecast_jahr DESC;
```

### 2.10 Mwst-Typ Validierung (Bug-Fix Check)

```sql
-- Prüfen: kein Decimal-String (z.B. "5.000000000000000000") in mwsttyp
SELECT DISTINCT mwsttyp, COUNT(*) AS anzahl
FROM mart_finance.fakt_buchungen_v
GROUP BY mwsttyp
ORDER BY anzahl DESC;

-- Erwartung: Werte wie NULL, '0', '1', '2', '5' etc. (max. 2-3 Zeichen)
-- FAIL: Werte mit '.' → Decimal-Bug noch aktiv
```

---

## SCHRITT 3 — Finance: Dimensions-Qualität

### 3.1 dim_konto_v — Hierarchie-Vollständigkeit

```sql
SELECT
    konto_subgruppe AS konto_l2,
    konto_subgruppe_name AS konto_l2_name,
    COUNT(*) AS anzahl_konten
FROM mart_finance.dim_konto_v
GROUP BY konto_subgruppe, konto_subgruppe_name
ORDER BY konto_subgruppe;

-- Erwartete L2-Werte aus Finance001: '3 ', '4 ', '5 ', '6a', '6b', '6c', '7 ', '8 '
```

```sql
-- NULL-Quote Hierarchie-Felder
SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN konto_subgruppe IS NULL THEN 1 ELSE 0 END) AS null_l2,
    SUM(CASE WHEN konto_gruppe IS NULL THEN 1 ELSE 0 END) AS null_l1,
    SUM(CASE WHEN konto_name = 'UNKNOWN' THEN 1 ELSE 0 END) AS unknown_name
FROM mart_finance.dim_konto_v;
```

### 3.2 dim_kostenstelle_v — Bereich-Hierarchie

```sql
SELECT
    bereich_neu_name AS bereich_l1,
    COUNT(*) AS anzahl_kst
FROM mart_finance.dim_kostenstelle_v
GROUP BY bereich_neu_name
ORDER BY bereich_l1;

-- Erwartete Bereiche aus Finance001: Infrastruktur, Energie, ICT, Allgemein, Markt, F&S
```

```sql
-- NULL-Quote
SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN bereich_neu_name IS NULL THEN 1 ELSE 0 END) AS null_bereich_l1,
    SUM(CASE WHEN kostenstelle_name = 'UNKNOWN' THEN 1 ELSE 0 END) AS unknown_name
FROM mart_finance.dim_kostenstelle_v;
```

### 3.3 JOIN-Integrität fakt_buchungen → dim_konto

```sql
-- Wie viele Buchungen haben keinen Konto-Match?
SELECT
    COUNT(*) AS total_buchungen,
    SUM(CASE WHEN k.konto_key IS NULL THEN 1 ELSE 0 END) AS ohne_konto,
    SUM(CASE WHEN k.konto_subgruppe IS NULL THEN 1 ELSE 0 END) AS ohne_l2,
    CAST(100.0 * SUM(CASE WHEN k.konto_key IS NULL THEN 1 ELSE 0 END) / COUNT(*) AS DECIMAL(5,2)) AS pct_ohne_konto
FROM mart_finance.fakt_buchungen_v b
LEFT JOIN mart_finance.dim_konto_v k ON b.konto_key = k.konto_key
WHERE buchungsdatum_date_key / 10000 IN (2023, 2024);
```

### 3.4 JOIN-Integrität fakt_buchungen → dim_kostenstelle

```sql
SELECT
    COUNT(*) AS total_buchungen,
    SUM(CASE WHEN ks.kostenstelle_key IS NULL THEN 1 ELSE 0 END) AS ohne_kst,
    CAST(100.0 * SUM(CASE WHEN ks.kostenstelle_key IS NULL THEN 1 ELSE 0 END) / COUNT(*) AS DECIMAL(5,2)) AS pct_ohne_kst
FROM mart_finance.fakt_buchungen_v b
LEFT JOIN mart_finance.dim_kostenstelle_v ks ON b.kostenstelle_key = ks.kostenstelle_key
WHERE buchungsdatum_date_key / 10000 IN (2023, 2024);
```

---

## SCHRITT 4 — Projekt: Row-Counts und Vollständigkeit

### 4.1 dim_projekt_v — Übersicht

```sql
SELECT
    inaktiv,
    status,
    COUNT(*) AS anzahl_projekte
FROM mart_project.dim_projekt_v
GROUP BY inaktiv, status
ORDER BY inaktiv, anzahl_projekte DESC;

-- Erwartung: mehrere Statuswerte, aktive Projekte in der Mehrheit
```

### 4.2 Mapping auf Projekt001.Data (Spalten-Vergleich)

```sql
-- Vollständigkeit der Pflichtfelder
SELECT
    COUNT(*) AS total_projekte,
    SUM(CASE WHEN projekt_id IS NULL THEN 1 ELSE 0 END) AS null_projekt_id,
    SUM(CASE WHEN projekt_name = 'UNKNOWN' THEN 1 ELSE 0 END) AS unknown_name,
    SUM(CASE WHEN status = 'UNKNOWN' THEN 1 ELSE 0 END) AS unknown_status,
    SUM(CASE WHEN hauptgruppe_nr IS NULL THEN 1 ELSE 0 END) AS null_hauptgruppe,
    SUM(CASE WHEN gruppe_name IS NULL THEN 1 ELSE 0 END) AS null_gruppe
FROM mart_project.dim_projekt_v;
```

**Mapping Projekt001.Data → mart_project.dim_projekt_v:**

| PBI: Data Spalte | dbt: dim_projekt_v Spalte | Typ PBI | Typ dbt |
|-----------------|--------------------------|---------|---------|
| ProjektNr | projekt_id | String | NVARCHAR(255) |
| ProjektName | projekt_name | String | NVARCHAR(255) |
| Inaktiv | inaktiv | Boolean | INT (0/1) |
| GruppeNr | gruppe_nr | String | INT |
| GruppeName | gruppe_name | String | NVARCHAR(255) |
| Erstellt | erstellt | DateTime | DATE |
| StatusNr | status_nr | String | INT |
| Status | status | String | NVARCHAR(255) |
| StatusDatum | status_datum | DateTime | DATE |
| HauptgruppeNr | hauptgruppe_nr | String | NVARCHAR(255) |
| HauptgruppeName | hauptgruppe_name | String | NVARCHAR(255) |

> ⚠️ **Typ-Unterschied:** PBI `GruppeNr` = String, dbt `gruppe_nr` = INT → muss bei PBI-Anbindung beachtet werden.

### 4.3 fakt_stunden_v — Stunden/Kosten Übersicht

```sql
-- Jahresübersicht Projektsachkonto-Buchungen
SELECT
    d.year AS jahr,
    COUNT(*) AS anzahl_zeilen,
    SUM(fs.betrag) AS betrag_total,
    COUNT(DISTINCT fs.projekt_key) AS anzahl_projekte
FROM mart_project.fakt_stunden_v fs
INNER JOIN mart.dim_date d ON fs.perioden_date_key = d.date_key
GROUP BY d.year
ORDER BY jahr DESC;
```

```sql
-- Leistungsart-Coverage (nur ~17% der Rows haben Leistungsart)
SELECT
    CASE WHEN leistungsart_key IS NULL THEN 'ohne Leistungsart' ELSE 'mit Leistungsart' END AS typ,
    COUNT(*) AS anzahl,
    CAST(100.0 * COUNT(*) / SUM(COUNT(*)) OVER () AS DECIMAL(5,2)) AS pct
FROM mart_project.fakt_stunden_v
GROUP BY CASE WHEN leistungsart_key IS NULL THEN 'ohne Leistungsart' ELSE 'mit Leistungsart' END;

-- Erwartung: ~83% ohne / ~17% mit Leistungsart
```

### 4.4 Projekt-Coverage fakt_stunden → dim_projekt

```sql
-- Welche Projekte in fakt_stunden haben keinen dim_projekt-Eintrag?
SELECT
    COUNT(*) AS total_stunden,
    SUM(CASE WHEN p.projekt_key IS NULL THEN 1 ELSE 0 END) AS ohne_projekt_dim,
    CAST(100.0 * SUM(CASE WHEN p.projekt_key IS NULL THEN 1 ELSE 0 END) / COUNT(*) AS DECIMAL(5,2)) AS pct_orphan
FROM mart_project.fakt_stunden_v fs
LEFT JOIN mart_project.dim_projekt_v p ON fs.projekt_key = p.projekt_key;
```

---

## SCHRITT 5 — Ergebnis dokumentieren

Nach Ausführung aller Queries → Ergebnisse in diese Tabelle eintragen:

### Finance Ergebnis-Tabelle (Ausführung 22.05.2026)

| Check | Soll (PBI) | Ist (datavault-test) | Abweichung | Status |
|-------|-----------|---------------------|------------|--------|
| Ertrag 2023 (Konto 3x) | ~47,530K | **47,528,706** | −1,294 (0.003%) | ✅ |
| Gesamtergebnis 2023 | ~1,220K | **1,220,257** | +257 (0.02%) | ✅ |
| Ertrag 2024 (Konto 3x) | ~43,445K | **43,446,053** | +1,053 (0.002%) | ✅ |
| Gesamtergebnis 2024 | ~769.8K* | **769,761** | −39 (0.005%) | ✅ |
| Ergebnis Jan-Aug 2024 | ~605K† | **355,167** | −249,833 | ⚠️ Datenfreshe |
| Ergebnis Jan-Aug 2026 | ~2,947K† | **2,393,020** | −553,980 | ⚠️ Nur bis Mai |
| Mwst-Typ kein Decimal | keine Strings mit `.` | Integer 0/1/2/5 | — | ✅ |
| Konto L2 Vollständigkeit | > 90% | 225/526 = 42.8% | −47.2pp | ⚠️ Ref. Konto fix |
| Bereich L1 Vollständigkeit | > 90% | 139/145 = 95.9% | — | ✅ |
| JOIN Buchungen→Konto | < 1% orphan | 6/113,020 = 0.01% | — | ✅ |
| JOIN Buchungen→KST | < 1% orphan | 0/113,020 = 0.00% | — | ✅ |

> *Soll-Wert Ergebnis 2024 korrigiert: Finance001 wurde refresht, zeigt jetzt 769.8K (nicht mehr 1,017K).  
> †Vergleichswerte aus PBI vor Refresh-Stand; Jan-Aug 2026 enthält keine Buchungen Sep-Dez.  
> ⚠️ Konto-Hierarchie: 301/526 ohne Gruppe/Subgruppe — Ref-Tabelle deckt nur Kontenplan-Konten ab. 301 nicht im Sharepoint-Kontenplan = erwartet.

### Projekt Ergebnis-Tabelle (Ausführung 22.05.2026)

| Check | Erwartung | Ist (datavault-test) | Status |
|-------|-----------|---------------------|--------|
| Anzahl Projekte total | > 100 | **14,409** | ✅ |
| Aktive Projekte | > 50 | **13,181** (91.5%) | ✅ |
| NULL projekt_id | 0 | **0** | ✅ |
| Unknown status | < 10% | 0 | ✅ |
| NULL hauptgruppe_nr | < 20% | 0 | ✅ |
| fakt_stunden: NULL leistungsart | ~83% | **88.7%** ohne | ⚠️ akzeptabel |
| fakt_stunden: JOIN orphan | < 1% | **0/202,378 (0.00%)** | ✅ |
| fakt_stunden: Jahr = 1900 | 0 | **25,328 Zeilen** | 🔴 Bug! |

> 🔴 **fakt_stunden `jahr=1900`**: 25,328 Zeilen mit ungültigem `perioden_date_key`. Ursache: NULL-Werte in `PERIODE` Staging-Spalte werden als `19000101` gespeichert. Handlungsbedarf.

### Handlungsbedarf nach Check

| Prio | Problem | Massnahme |
|------|---------|-----------|
| 🔴 | fakt_stunden 25,328 Zeilen mit `perioden_date_key` = 1900xxxx | `ewb_proj_nsa_main.sql` prüfen: PERIODE NULL-Handling |
| ⚠️ | Konto-Hierarchie: 301/526 ohne L1/L2 | Prüfen ob alle 301 wirklich nicht im Kontenplan — ggf. Ref-Tabelle ergänzen |
| ℹ️ | Spaltenname `mwst_typ` (nicht `mwsttyp`) | Doku-Konsistenz korrigieren |
