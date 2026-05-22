# Power BI Finance — Plausibilitäts-Check gegen Data Vault Mart

**Erstellt:** 2026-05-22  
**Ziel:** Überprüfen ob `datavault-test` die Mindestanforderungen der 4 Finance-Reports erfüllt  
**Semantic Model:** `Finance001` (Workspace: Finance, ID: `d5571409-9182-48d0-b3e3-edec0936cc5f`)  
**MCP-Verbindung:** ✅ erfolgreich via `ConnectFabric`

---

## 1. Finance001 — Datenmodell (Ist-Stand)

### 1.1 Tabellen (17 total)

| Tabelle | Spalten | Typ | Quelle (laut timestamps) |
|---------|---------|-----|--------------------------|
| `Buchungen` | 20 | Fact (Actuals) | structured-tables + landing-zone |
| `Konten` | 10 | Dim (Konten-Hierarchie) | structured-tables |
| `Kostenstellen` | 15 | Dim (KST-Hierarchie) | structured-tables |
| `Scenarios` | 13 | Fact (Budget/Forecast) | strukturiert |
| `Belege` | 8 | Dim (Dokumente) | — |
| `Kunden` | 4 | Dim (Kunden) | — |
| `Calendar` | 12 + 1 Hierarchie | Dim (Zeit) | berechnet |
| `Metrics` | 1 + **30 Measures** | Measure Table | — |
| `Summary Lines` | 2 | Helper | — |
| `Summary Lines (Technical)` | 2 | Helper | — |
| `Forecast Selector` | 1 | Slicer | — |
| `Budget Selector` | 1 | Slicer | — |
| `Actuals/Forecast Selector` | 1 | Slicer | — |
| `ActualForecast` | 2 | Helper | — |
| `Zugangsrechte` | 13 | RLS | — |
| `Belege-Visierende` | 6 | Dim | — |
| `Calendar - MonthsOnly` | 2 | Helper | — |

### 1.2 Schlüssel-Beziehungen (`Buchungen` als Zentrum)

```
Buchungen.KontoNr        → Konten.KontoNr
Buchungen.KostenstelleNr → Kostenstellen.KostenstelleNr
Buchungen.Datum          → Calendar.Date
Buchungen.Kundennummer   → Kunden.Kundennummer
Buchungen.Belegnummer    → Belege.Belegnummer
Scenarios.Konto          → Konten.KontoNr
Scenarios.Kostenstelle   → Kostenstellen.KostenstelleNr
```

### 1.3 Kern-Measures

| Measure | DAX |
|---------|-----|
| `Total Actuals` | `SUM('Buchungen'[Betrag])` |
| `Total Budget` | `SUM('Scenarios'[Betrag]) WHERE Szenario = Budget (via Budget Selector)` |
| `Total Forecast` | `SUM('Scenarios'[Betrag]) WHERE Szenario = Forecast (via Forecast Selector)` |
| `Total Prev Year` | Vorjahr-Actuals (CALCULATE mit Jahres-Filter) |
| `Actuals` / `Budget` / `Forecast` / `Prev Year` | Wrapper: filtern auf `Summary Lines (Technical)[Name] = "Konto_L2"` |

### 1.4 Konten-Dimension (`Konten`)

```
KontoNr     → Leaf-Konto (z.B. "3010")
Konto_L1    → Stufe 1 (z.B. "30")         → = "Konto Niveau 1" im Report-Filter
Konto_L2    → Stufe 2 (z.B. "3 ")         → = "Konto Niveau 2" im Report-Filter
Konto       → Display: "Nr - Name"
```

**P&L-Struktur via Konto_L2:**
- `3 ` = Ertrag
- `4 ` = Aufwand Material/Produktion
- `5 ` = Personalaufwand
- `6a` = Übriger Betriebsaufwand
- `6b` = Abschreibungen
- `6c` = Finanzierung
- `7 ` = Umlagen
- `8 ` = Ausserord. Ergebnis
- `9x` = Ergebnis (Subtotal via Summary Lines)

### 1.5 Kostenstellen-Dimension (`Kostenstellen`)

```
KostenstelleNr    → Leaf-KST
Kostenstelle      → Display: "Nr - Name"
Bereich_L2        → Subbereich (z.B. "6.1 Kommunikationsnetze")
Bereichsname_L2   → Name Subbereich
Bereich_L1        → Bereich (z.B. "6")
Bereichsname_L1   → Name Bereich (= "Infrastruktur", "Energie", "ICT", etc.)
```

**Bereich-Struktur:**
- Infrastruktur
- Energie
- ICT
- Allgemein
- Markt
- F&S (Finanzen & Services)

---

## 2. Report-Übersicht (4 analysierte Reports)

| Report | ID | Seiten | Spalten | Letzter Abschluss |
|--------|----|--------|---------|-------------------|
| Erfolgsrechnung - Budget 2025 | `37b03e9b` | 2 (ER, Konto pro KST) | 2023 Ist / 2024 Budget / 2025 Budget | — |
| Erfolgsrechnung 2025 | `fa68566b` | 11 | Vorjahr / Budget / Rechnung / Δ | Dezember 2024 |
| Erfolgsrechnung 2026 - 1.82 | `ec58c0f9` | 11 | Vorjahr / Budget / Rechnung / Δ | März 2026 |
| Erfolgsrechnung-Budget 2026 | `b9edd601` | 2 (ER, Konto pro KST) | 2024 Ist / 2025 Budget / 2026 Budget | — |

### Gemeinsame Filter aller Reports
- `Bereich` (= Bereichsname_L1)
- `Subbereich` (= Bereichsname_L2)
- `Kostenstelle`

### Zusätzliche Filter (nur ER-Reports mit Rechnung/Forecast)
- `Konto Niveau 2` (= Konto_L2)
- `Konto Niveau 1` (= Konto_L1)
- `Konto`
- Monatsselektor (Period Slider)
- Rechnung/Forecast Selektor (Actuals / Forecast)

### Wichtige Belegzahlen (zur Validierung)

| Report | Kennzahl | 2023 Ist | 2024/2025 Basis | Budget |
|--------|---------|----------|-----------------|--------|
| ER Budget 2025 | 3 Ertrag Total | 47,530K | 45,813K | 43,330K |
| ER Budget 2025 | 9x Ergebnis | 1,220K | 808K | 1,008K |
| ER Budget 2025 | 4x Brutttoergebnis | 23,851K | 23,608K | 24,641K |
| ER Budget 2026 | 3 Ertrag Total | 43,445K (2024 Ist) | 43,330K (2025B) | 41,589K |
| ER Budget 2026 | 9x Ergebnis | 1,017K (2024 Ist) | 1,008K (2025B) | 1,449K |
| ER 2025 | 9x Ergebnis (Jan-Aug 2024) | 605K (Rechnung) | 208K (Budget) | — |
| ER 2026-1.82 | 9x Ergebnis (Jan-Aug 2026) | 2,947K (Rechnung) | 966K (Budget) | — |

---

## 3. Mapping: Finance001 → dbt Mart (`datavault-test`)

### 3.1 Buchungen (Actuals)

| PBI: `Buchungen` Spalte | dbt: `mart_finance.fakt_buchungen_v` | Status |
|-------------------------|--------------------------------------|--------|
| Betrag | `betrag` | ✅ vorhanden |
| Datum | `datum` | ✅ vorhanden |
| KontoNr | `konto_nr` | Prüfen |
| KostenstelleNr | `kst_nr` | Prüfen |
| Soll-Haben | `soll_haben` | Prüfen |
| SAM | `sam` | Prüfen |
| Mwst-Typ (INT!) | `mwsttyp` (war DECIMAL → jetzt via TRY_CAST INT) | ✅ gefixt |
| Mwst-Betrag | `mwstbetr` | Prüfen |
| Mwst-Satz | `mwstsatz` | Prüfen |
| Umschreibung / Umschreibung2 | Prüfen | Prüfen |
| Belegnummer | `belegnr` | Prüfen |
| Kundennummer | `kdnr` | Prüfen |
| ProjektNr | `proj` | Prüfen |

### 3.2 Konten-Dimension

| PBI: `Konten` Spalte | dbt: Entsprechung | Status |
|----------------------|-------------------|--------|
| KontoNr | `konto_nr` (aus Buchungen-Join) | Prüfen |
| KontoName | Konto-Stammdaten | ❓ kein dbt-Modell bekannt |
| Konto_L1 | Konto-Hierarchie L1 | ❓ |
| Konto_L2 | Konto-Hierarchie L2 | ❓ |

> **GAP:** Konten-Stammdaten + Hierarchie fehlen wahrscheinlich im dbt Mart.  
> Source: structured-tables (separate Parquet-Datei?)

### 3.3 Kostenstellen-Dimension

| PBI: `Kostenstellen` Spalte | dbt: Entsprechung | Status |
|-----------------------------|-------------------|--------|
| KostenstelleNr | `kst_nr` | Prüfen |
| KostenstelleName | KST-Stammdaten | ❓ |
| Bereich_L1 / Bereichsname_L1 | Bereich-Hierarchie | ❓ |
| Bereich_L2 / Bereichsname_L2 | Subbereich-Hierarchie | ❓ |

> **GAP:** KST-Stammdaten + Bereich-Hierarchie fehlen wahrscheinlich im dbt Mart.

### 3.4 Scenarios (Budget/Forecast)

| PBI: `Scenarios` Spalte | dbt: Entsprechung | Status |
|-------------------------|-------------------|--------|
| Betrag | `betrag` | ❓ fakt_budget? |
| Szenario | `szenario` | ❓ |
| Konto | Kontonummer | ❓ |
| Kostenstelle | KST-Nummer | ❓ |

> **GAP:** Budget/Forecast-Daten unklar im dbt Mart — fakt_budget existiert?

---

## 4. Validierungs-Checkliste für `db-monitor`

### 4.1 Tabellen-Existenz prüfen

```sql
-- Prüfen welche Mart-Tabellen in datavault-test existieren
SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA LIKE 'mart%'
ORDER BY TABLE_SCHEMA, TABLE_NAME;
```

### 4.2 Kern-KPI: Total Buchungen Betrag (alle Jahre)

```sql
-- Sollte ~= Total Actuals in Finance001
SELECT 
    YEAR(datum) AS Jahr,
    SUM(betrag) AS total_betrag,
    COUNT(*) AS anzahl_buchungen
FROM mart_finance.fakt_buchungen_v
GROUP BY YEAR(datum)
ORDER BY Jahr DESC;
```

**Erwartete Kontrollwerte (aus PBI Budget 2025 Report, gesamte Firma):**
- 2023 Ist Ertrag (Konto_L2 = "3 "): ~47,530K
- 2023 Ist Aufwand (Konto_L2 = "4 " bis "8 "): ~-46,310K (= Ergebnis 1,220K)

### 4.3 Plausibilitätscheck Ertrag 2023

```sql
-- Konto 3xxx = Ertrag, 2023
SELECT 
    SUM(b.betrag) AS ertrag_total
FROM mart_finance.fakt_buchungen_v b
WHERE LEFT(CAST(b.konto_nr AS NVARCHAR(20)), 1) = '3'
  AND YEAR(b.datum) = 2023;
-- Erwartung: ~47,530,000 CHF (= 47,530K)
```

### 4.4 Plausibilitätscheck Gesamtergebnis 2023

```sql
-- 9x Ergebnis = Summe aller Buchungen 2023 (mit Sign-Convention)
-- Im PBI: 9x Ergebnis 2023 = 1,220K
SELECT 
    SUM(betrag) AS ergebnis_total
FROM mart_finance.fakt_buchungen_v
WHERE YEAR(datum) = 2023;
-- Erwartung: ~1,220,000 CHF (= 1,220K)
```

> **Hinweis zu Sign-Convention:** PBI `SUM(Buchungen[Betrag])` = direkte Summe.
> Positive Werte = Ertrag (Haben-Buchungen), negative = Aufwand (Soll-Buchungen).
> Die fakt_buchungen_v UNION ALL Logik muss dies korrekt abbilden.

### 4.5 Verfügbarkeit Konten-Hierarchie

```sql
-- Prüfen ob dim_konto / ähnliche Tabelle existiert
SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%konto%' OR TABLE_NAME LIKE '%kst%' OR TABLE_NAME LIKE '%kostenstell%'
ORDER BY TABLE_NAME;
```

### 4.6 Verfügbarkeit Budget-Daten

```sql
-- Prüfen ob fakt_budget existiert
SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%budget%' OR TABLE_NAME LIKE '%szenario%' OR TABLE_NAME LIKE '%scenario%'
ORDER BY TABLE_NAME;
```

### 4.7 Mwst-Typ Validierung (der Bug-Fix)

```sql
-- Prüfen ob mwsttyp korrekt als INT/String vorliegt (kein Decimal)
SELECT 
    mwsttyp,
    COUNT(*) AS anzahl
FROM mart_finance.fakt_buchungen_v
GROUP BY mwsttyp
ORDER BY anzahl DESC;
-- Erwartung: Werte wie 0, 1, 2, 5 etc. (INTEGER) — NICHT "0.000...000" (DECIMAL)
```

---

## 5. Checkliste für `power-bi-modelling` Agent

### 5.1 Tabellen im Semantic Model vs. dbt

| PBI Tabelle | dbt Pendant | Aktion |
|-------------|-------------|--------|
| `Buchungen` | `mart_finance.fakt_buchungen_v` | Spaltenabgleich |
| `Konten` | `mart_finance.dim_konto_v` (?) | **Prüfen/Erstellen** |
| `Kostenstellen` | `mart_finance.dim_kst_v` (?) | **Prüfen/Erstellen** |
| `Scenarios` | `mart_finance.fakt_budget_v` (?) | **Prüfen/Erstellen** |
| `Calendar` | Standard-Kalender | ggf. aus dbt generieren |

### 5.2 Spalten-Mapping Buchungen

PBI-Spalte → dbt-Spalte (zu verifizieren):
- `Betrag` → `betrag`
- `Datum` → `datum`
- `KontoNr` (String in PBI, Key zu Konten) → muss exakt übereinstimmen
- `KostenstelleNr` (String in PBI, Key zu Kostenstellen) → muss exakt übereinstimmen
- `Soll-Haben` → `soll_haben`
- `Mwst-Typ` (Int64 in PBI) → `mwsttyp` (jetzt INT via TRY_CAST ✅)
- `Mwst-Code` (Int64 in PBI) → `mwstsatz` oder neues Feld
- `Belegnummer` (Double → hidden) → `belegnr`
- `Kundennummer` (Double → hidden) → `kdnr`

---

## 6. Bekannte Lücken / Next Steps

| Priorität | Lücke | Beschreibung |
|-----------|-------|--------------|
| P1 | `dim_konto_v` fehlt | Konto-Stammdaten + 2-stufige Hierarchie (L1/L2) fehlen im dbt Mart |
| P1 | `dim_kst_v` fehlt | KST-Stammdaten + Bereich-Hierarchie (L1/L2) fehlen im dbt Mart |
| P1 | `fakt_budget_v` fehlt | Budget/Forecast-Daten (Scenarios) fehlen im dbt Mart |
| P2 | Spalten-Alignment | Genaue Spaltennamen/Typen zwischen PBI-Source (structured-tables) und `fakt_buchungen_v` verifizieren |
| P2 | Sign-Convention | Vorzeichen-Logik in `fakt_buchungen_v` vs. PBI `SUM(Buchungen[Betrag])` validieren |
| P3 | `dim_beleg_v` | Belege-Stammdaten für Belegansicht-Reports |
| P3 | `dim_kunden_v` | Kunden-Stammdaten |

---

## 7. Screenshots (aufgenommen 2026-05-22)

| Datei | Inhalt |
|-------|--------|
| `pbi-er-budget-2025-seite1.png` | ER Budget 2025 — P&L Seite (2023 Ist / 2024B / 2025B + Waterfall) |
| `pbi-er-budget-2025-seite2.png` | ER Budget 2025 — Konto pro KST (Bereich-Hierarchie) |
| `pbi-er-2025-seite1.png` | ER 2025 — ER Total (Vorjahr / Budget / Rechnung, Jan-Aug 2024) |
| `pbi-er-2026-182-seite1.png` | ER 2026-1.82 — ER Total (Jan-Aug 2026, Bereich-Filter: no blank/Hilfskst) |
| `pbi-er-budget-2026-seite1.png` | ER Budget 2026 — Konto pro KST (2024 Ist / 2025B / 2026B) |
| `pbi-er-budget-2026-ER-seite.png` | ER Budget 2026 — P&L Seite |
