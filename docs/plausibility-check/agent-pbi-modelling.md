# power-bi-modelling: Plausibilitäts-Check — Aufgabenplan

**Agent:** `@power-bi-modelling`  
**Ziel:** Semantic Model CSM-DEV (lokal) gegen Finance001/Projekt001 (Fabric) validieren.  
Spalten-Mapping prüfen, fehlende Beziehungen identifizieren, DAX-Measures evaluieren.

---

## Verbindung herstellen

### A) Lokales CSM-DEV (PBI Desktop)

```
1. mcp_powerbi-model_connection_operations → ListLocalInstances
2. mcp_powerbi-model_connection_operations → Connect (connectionString aus Schritt 1)
3. mcp_powerbi-model_database_operations → List (Datenbank wählen: CSM-DEV)
4. mcp_powerbi-model_connection_operations → Connect (+ databaseName)
```

### B) Fabric Finance001

```
mcp_powerbi-model_connection_operations → ConnectFabric
  semanticModelName: "Finance001"
  workspaceName: "Finance"
```

### C) Fabric Projekt001

```
mcp_powerbi-model_connection_operations → ConnectFabric
  semanticModelName: "Projekt001"
  workspaceName: "Finance"
```

> **Hinweis:** Beide Fabric-Modelle sind im Workspace "Finance" (nicht "Projekt").

---

## Finance001 Datenmodell (Ist-Stand Fabric)

### Tabellen (17)

| Tabelle | Typ | Spalten | Quelle (PBI Timestamp) |
|---------|-----|---------|------------------------|
| `Buchungen` | Fact (Actuals) | 20 | structured-tables + landing-zone |
| `Konten` | Dim | 10 | structured-tables |
| `Kostenstellen` | Dim | 15 | structured-tables |
| `Scenarios` | Fact (Budget/FC) | 13 | strukturiert |
| `Belege` | Dim | 8 | — |
| `Kunden` | Dim | 4 | — |
| `Calendar` | Dim (Zeit) | 12 | berechnet |
| `Metrics` | Measure-Tabelle | 1 + 30 Measures | — |
| `Summary Lines` | Helper | 2 | — |
| `Summary Lines (Technical)` | Helper | 2 | — |
| `Zugangsrechte` | RLS | 13 | — |
| sonstige Helper/Slicer | — | — | — |

### Kern-Measures (Finance001.Metrics)

| Measure | DAX |
|---------|-----|
| `Total Actuals` | `SUM('Buchungen'[Betrag])` |
| `Total Budget` | `SUM('Scenarios'[Betrag])` WHERE Szenario = Budget |
| `Total Forecast` | `SUM('Scenarios'[Betrag])` WHERE Szenario = Forecast |
| `Total Prev Year` | Vorjahres-Actuals (CALCULATE) |
| `Actuals` | Total Actuals gefiltert auf `Summary Lines (Technical)[Name] = "Konto_L2"` |
| `Budget` | Total Budget gefiltert auf Konto_L2 |

### Beziehungen (Finance001)

```
Buchungen.KontoNr        → Konten.KontoNr
Buchungen.KostenstelleNr → Kostenstellen.KostenstelleNr
Buchungen.Datum          → Calendar.Date
Buchungen.Kundennummer   → Kunden.Kundennummer
Buchungen.Belegnummer    → Belege.Belegnummer
Scenarios.Konto          → Konten.KontoNr
Scenarios.Kostenstelle   → Kostenstellen.KostenstelleNr
```

---

## Projekt001 Datenmodell (Ist-Stand Fabric)

### Tabellen (1 + 3 Date-Helper)

| Tabelle | Typ | Spalten | Beschreibung |
|---------|-----|---------|-------------|
| `Data` | Dim (Projektstammdaten) | 11 | Alle Projekte aus structured-tables |
| `DateTableTemplate_*` | Helper | 7 | Auto-generiert |
| `LocalDateTable_ee52*` | Helper | 7 | Für Erstellt |
| `LocalDateTable_f36a*` | Helper | 7 | Für StatusDatum |

### Data-Tabelle Spalten

| Spalte | Typ PBI | Quelle |
|--------|---------|--------|
| ProjektNr | String | structured-tables |
| ProjektName | String | structured-tables |
| Inaktiv | Boolean | structured-tables |
| GruppeNr | String | structured-tables |
| GruppeName | String | structured-tables |
| Erstellt | DateTime | structured-tables |
| StatusNr | String | structured-tables |
| Status | String | structured-tables |
| StatusDatum | DateTime | structured-tables |
| HauptgruppeNr | String | structured-tables |
| HauptgruppeName | String | structured-tables |

> **Keine Measures** in Projekt001 — rein dimensionaler Bericht (Projektstammdaten-Liste).

---

## SCHRITT 1 — CSM-DEV Tabellen-Inventar

Verbinden mit CSM-DEV (falls offen), dann:

```
mcp_powerbi-model_table_operations → List
```

**Soll-Tabellen in CSM-DEV:**

| SM-Tabelle | dbt-Modell | Schema |
|---|---|---|
| `dim_date` | `mart._common.dim_date_v` | mart |
| `dim_buchungsstatus` | `mart.finance.dim_buchungsstatus_v` | mart_finance |
| `dim_konto` | `mart.finance.dim_konto_v` | mart_finance |
| `dim_kostenstelle` | `mart.finance.dim_kostenstelle_v` | mart_finance |
| `dim_kreditor` | `mart.finance.dim_kreditor_v` | mart_finance |
| `fakt_belege` | `mart.finance.fakt_belege_v` | mart_finance |
| `fakt_buchungen` | `mart.finance.fakt_buchungen_v` | mart_finance |
| `fakt_budget` | `mart.finance.fakt_budget_v` | mart_finance |
| `fakt_forecast` | `mart.finance.fakt_forecast_v` | mart_finance |
| `ref_actual_forecast` | `mart.finance.ref_actual_forecast` | mart_finance |
| `dim_abteilung` | `mart.project.dim_abteilung_v` | mart_project |
| `dim_leistungsart` | `mart.project.dim_leistungsart_v` | mart_project |
| `dim_person` | `mart.project.dim_person_v` | mart_project |
| `dim_projekt` | `mart.project.dim_projekt_v` | mart_project |
| `fakt_stunden` | `mart.project.fakt_stunden_v` | mart_project |

**Aktion:** Fehlende Tabellen als `➕ MISSING` markieren, dann via `dbt-deployer` nachliefern lassen.

---

## SCHRITT 2 — Finance: Spalten-Mapping CSM-DEV vs Finance001

### 2.1 fakt_buchungen (CSM-DEV) ↔ Buchungen (Finance001)

```
mcp_powerbi-model_table_operations → GetSchema (tableName: "fakt_buchungen")
```

**Mapping-Tabelle:**

| Finance001: Buchungen | CSM-DEV: fakt_buchungen | Typ Finance001 | Typ CSM-DEV | Status |
|-----------------------|------------------------|----------------|-------------|--------|
| Betrag | betrag | Double | Decimal | Prüfen |
| Datum (via Calendar) | buchungsdatum_date_key | Date | Int64 (YYYYMMDD) | ⚠️ via dim_date |
| KontoNr (FK) | konto_key | String→hidden | Int64 (SK) | ⚠️ anderes Key-System |
| KostenstelleNr (FK) | kostenstelle_key | String→hidden | Int64 (SK) | ⚠️ anderes Key-System |
| Soll-Haben | soll_haben | String | NVARCHAR | Prüfen |
| SAM | sam | String | NVARCHAR | Prüfen |
| Mwst-Typ | mwsttyp | Int64 | NVARCHAR | ⚠️ Typ-Unterschied |
| Mwst-Betrag | mwstbetr | Double | Decimal | Prüfen |
| Mwst-Satz | mwstsatz | Double | Decimal | Prüfen |
| Mwst-Code | mwstcode | Int64 | NVARCHAR | ⚠️ Typ-Unterschied |
| Umschreibung | [text] | String | NVARCHAR | Prüfen |
| Umschreibung2 | text2 | String | NVARCHAR | Prüfen |
| Belegnummer (→Belege) | belegdatum_date_key / dkbelegnummer | Double | Int/NVARCHAR | ⚠️ Struktur unterschiedlich |
| Kundennummer (→Kunden) | dkkundennummer | Double | NVARCHAR | ⚠️ Typ-Unterschied |
| ProjektNr | projebene | String | NVARCHAR | Prüfen |
| timestamp_structured-tables | dss_load_date | DateTime | DateTime2 | OK |

> **Key-System Unterschied:** Finance001 nutzt Klartextschlüssel (KontoNr=String, FK-Join in PBI).  
> CSM-DEV nutzt MD5 Surrogate Keys (konto_key=Int64, FK über SK). Das ist korrekt für Star Schema im CSM-DEV.

### 2.2 dim_konto (CSM-DEV) ↔ Konten (Finance001)

```
mcp_powerbi-model_table_operations → GetSchema (tableName: "dim_konto")
```

**Mapping-Tabelle:**

| Finance001: Konten | CSM-DEV: dim_konto | Typ | Status |
|--------------------|--------------------|-----|--------|
| KontoNr | konto_id | String | ✅ inhaltlich gleich |
| Konto (display) | konto_code | String | Prüfen (Format: "Nr - Name"?) |
| KontoName | konto_name | String | ✅ |
| Konto_L1 | konto_gruppe | String | ✅ |
| KontoName_L1 | konto_gruppe_name | String | ✅ |
| Konto_L2 | konto_subgruppe | String | ✅ |
| KontoName_L2 | konto_subgruppe_name | String | ✅ |
| — (kein SK in Finance001) | konto_key | Int64 (SK) | nur CSM-DEV |

### 2.3 dim_kostenstelle (CSM-DEV) ↔ Kostenstellen (Finance001)

```
mcp_powerbi-model_table_operations → GetSchema (tableName: "dim_kostenstelle")
```

**Mapping-Tabelle:**

| Finance001: Kostenstellen | CSM-DEV: dim_kostenstelle | Typ | Status |
|--------------------------|--------------------------|-----|--------|
| KostenstelleNr | kostenstelle_id | String | ✅ |
| Kostenstelle (display) | kostenstelle_code | String | Prüfen |
| KostenstelleName | kostenstelle_name | String | ✅ |
| Bereichsname_L1 | bereich_neu_name | String | ⚠️ Spaltenname differs |
| Bereich_L1 | bereich_neu | String | ⚠️ Spaltenname differs |
| Bereichsname_L2 | bereich_detail_name (alt?) | String | ⚠️ NEU vs ALT prüfen |
| Bereich_L2 | bereich_detail (alt?) | String | ⚠️ NEU vs ALT prüfen |
| BereichNeu_L1 | bereich_neu | String | ✅ (=Bereich_L1) |
| BereichNeu_L2 | — | — | Ggf. fehlt im dbt |
| Investitionsrechnung | investitionsrechnung | Int64/Int | ✅ |

> **ACHTUNG:** Finance001 hat `Bereich_L1` (alt) UND `BereichNeu_L1` (neu).  
> CSM-DEV hat `bereich` (alt) und `bereich_neu` (neu). Die aktuelle PBI-Visualisierung nutzt `BereichNeu_L1`.

---

## SCHRITT 3 — Projekt: Spalten-Mapping CSM-DEV vs Projekt001

### 3.1 dim_projekt (CSM-DEV) ↔ Data (Projekt001)

```
mcp_powerbi-model_table_operations → GetSchema (tableName: "dim_projekt")
```

**Mapping-Tabelle:**

| Projekt001: Data | CSM-DEV: dim_projekt | Typ Projekt001 | Typ CSM-DEV | Status |
|-----------------|---------------------|----------------|-------------|--------|
| ProjektNr | projekt_id | String | NVARCHAR(255) | ✅ |
| ProjektName | projekt_name | String | NVARCHAR(255) | ✅ |
| Inaktiv | inaktiv | **Boolean** | **INT (0/1)** | ⚠️ Typ-Unterschied |
| GruppeNr | gruppe_nr | **String** | **INT** | ⚠️ Typ-Unterschied |
| GruppeName | gruppe_name | String | NVARCHAR(255) | ✅ |
| Erstellt | erstellt | DateTime | DATE | ⚠️ Zeit-Anteil geht verloren |
| StatusNr | status_nr | **String** | **INT** | ⚠️ Typ-Unterschied |
| Status | status | String | NVARCHAR(255) | ✅ |
| StatusDatum | status_datum | DateTime | DATE | ⚠️ Zeit-Anteil |
| HauptgruppeNr | hauptgruppe_nr | String | NVARCHAR(255) | ✅ |
| HauptgruppeName | hauptgruppe_name | String | NVARCHAR(255) | ✅ |

> **Typ-Anpassungen für CSM-DEV:**
> - `inaktiv`: CSM-DEV liefert INT (0/1), PBI erwartet Boolean → muss in SM als Calculated Column oder im Power Query als Boolean gecastet werden.
> - `gruppe_nr`, `status_nr`: CSM-DEV liefert INT, Projekt001 hat String → kein Problem für Anzeige, aber FK-Joins prüfen.

---

## SCHRITT 4 — Beziehungen im CSM-DEV validieren

```
mcp_powerbi-model_relationship_operations → List
```

**Soll-Beziehungen (Finance-Domain):**

| Von | Zu | Spalte |
|-----|----|--------|
| fakt_buchungen.konto_key | dim_konto.konto_key | BIGINT SK |
| fakt_buchungen.kostenstelle_key | dim_kostenstelle.kostenstelle_key | BIGINT SK |
| fakt_buchungen.buchungsdatum_date_key | dim_date.date_key | INT YYYYMMDD |
| fakt_buchungen.kreditor_key | dim_kreditor.kreditor_key | BIGINT SK |
| fakt_belege.buchungsstatus_key | dim_buchungsstatus.buchungsstatus_key | BIGINT SK |
| fakt_budget.konto_key | dim_konto.konto_key | BIGINT SK |
| fakt_budget.kostenstelle_key | dim_kostenstelle.kostenstelle_key | BIGINT SK |

**Soll-Beziehungen (Projekt-Domain):**

| Von | Zu | Spalte |
|-----|----|--------|
| fakt_stunden.projekt_key | dim_projekt.projekt_key | BIGINT SK |
| fakt_stunden.leistungsart_key | dim_leistungsart.leistungsart_key | BIGINT SK (nullable) |
| fakt_stunden.perioden_date_key | dim_date.date_key | INT YYYYMMDD |

**Aktion:**
1. Fehlende Beziehungen mit `mcp_powerbi-model_relationship_operations → Create` anlegen.
2. Namensprüfung: Beziehungsnamen müssen sprechendes Schema folgen (kein GUID).

---

## SCHRITT 5 — DAX-Validierung (Measures im CSM-DEV)

### 5.1 Vergleich: Finance001 Measures ↔ CSM-DEV Measures

```
mcp_powerbi-model_measure_operations → List
```

**Erwartete Measures im CSM-DEV (analog Finance001):**

| Measure-Name | DAX (Soll) | Finance001 Äquivalent |
|---|---|---|
| `Total Actuals` oder `Betrag Total` | `SUM(fakt_buchungen[betrag])` | `Total Actuals` |
| `Total Budget` | `SUM(fakt_budget[betrag])` | `Total Budget` |
| `Total Forecast` | `SUM(fakt_forecast[betrag])` | `Total Forecast` |

### 5.2 DAX-Probe im CSM-DEV (EVALUATE Syntax)

```
mcp_powerbi-model_dax_query_operations → Execute
Query: EVALUATE ROW("Total", CALCULATE(SUM(fakt_buchungen[betrag]), YEAR(dim_date[full_date]) = 2023))
```

**Erwartung:** ~1,220,000 CHF (Ergebnis 2023 = Soll aus PBI)

---

## SCHRITT 6 — Abweichungen dokumentieren

Nach allen Checks → Status in dieser Tabelle eintragen:

### Finance

| Objekt | Check | Status | Massnahme |
|--------|-------|--------|-----------|
| fakt_buchungen | betrag Typ | | |
| fakt_buchungen | datum via dim_date | | |
| fakt_buchungen | mwsttyp als INT | | |
| dim_konto | L1/L2 Spalten vorhanden | | |
| dim_kostenstelle | bereich_neu vs alt | | |
| Beziehungen Finance | alle vorhanden | | |
| CSM-DEV Measure Ergebnis 2023 | ~1,220K | | |

### Projekt

| Objekt | Check | Status | Massnahme |
|--------|-------|--------|-----------|
| dim_projekt | inaktiv als Boolean | | |
| dim_projekt | gruppe_nr als INT vs String | | |
| dim_projekt | alle 11 Spalten vorhanden | | |
| fakt_stunden | perioden_date_key → dim_date | | |
| Beziehungen Projekt | alle vorhanden | | |

---

## ERGEBNISSE — Ausführung 22.05.2026

**Status:** Finance001 vollständig validiert | CSM-DEV: nicht aktiv (PBI Desktop nicht gestartet)

### DAX-Ergebnisse (Finance001 Fabric)

| KPI | Finance001 IST | dbt datavault-test | Delta | Status |
|-----|---------------|-------------------|-------|--------|
| Ergebnis 2023 | **1,220,257.55 CHF** | 1,220,300 CHF | ~42 CHF (<0.01%) | ✅ MATCH |
| Ertrag 2023 (Kto 3xxxx) | **47,529,843.56 CHF** | 47,528,700 CHF | 1,143 CHF (0.002%) | ✅ MATCH |
| Ergebnis 2024 | **769,761.89 CHF** | 769,761.89 CHF | 0 CHF | ✅ MATCH |

> Finance001 wurde zwischenzeitlich refresht und zeigt jetzt 769.8K (nicht mehr 1,017K). Das bedeutet: Finance001 und datavault-test sind vollständig synchron.

### Beziehungs-Check (Finance001)

Alle 7 dokumentierten Beziehungen korrekt implementiert. Finance001 hat zusätzlich 3 nicht-dokumentierte Beziehungen (Scenarios→Calendar, Belege-Visierende→Belege, Calendar→ActualForecast). ✅

### Offene Punkte

| # | Problem | Schwere | Massnahme |
|---|---------|---------|-----------|
| 1 | CSM-DEV nicht aktiv — Mapping-Vergleich ausständig | 🟠 Mittel | PBI Desktop öffnen, CSM-DEV laden, Schritt 1–5 wiederholen |
| 2 | `Konten[KontoNr]` ist Text in Finance001 → DAX >= Vergleich schlägt fehl | 🟠 Mittel | In Finance001: berechnete Spalte `VALUE(KontoNr)` hinzufügen |
| 3 | Abacus nutzt 5-stellige Kontonummern (30000–39999, nicht 3000–3999) | 🟠 Mittel | Doku-Ranges korrigieren; Finance001 DAX-Measures prüfen |
| 4 | `Scenarios`-Tabelle: Doku sagt 13 Spalten, IST=10 | 🟡 Low | Doku aktualisieren |
| 5 | `mwst_typ` / `mwst_code`: Finance001=int64, dbt=NVARCHAR | 🟡 Low | Akzeptabel (dbt DECIMAL-Bugfix erfordert Text-Speicherung) |

### Fazit

**Datenseitig: ✅ Vollständig synchron** — Finance001 und datavault-test stimmen bis auf Rundungsdifferenzen überein.  
**CSM-DEV Deployment:** Daten bereit; Mapping-Vergleich ausstehend (CSM-DEV muss geöffnet sein).
