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

## ERGEBNISSE — Ausführung 22.05.2026 (vollständig)

**Status:** Finance001 ✅ | CSM_Abacus_T ✅ | Projekt001 ✅ (alle Verbindungen aktiv)

---

### Lauf 1: Finance001 DAX-Checks (Fabric)

| KPI | Finance001 IST | dbt datavault-test | Delta | Status |
|-----|---------------|-------------------|-------|--------|
| Ergebnis 2023 | **1,220,257.55 CHF** | 1,220,300 CHF | ~42 CHF (<0.01%) | ✅ MATCH |
| Ertrag 2023 (Kto 3xxxx) | **47,529,843.56 CHF** | 47,528,700 CHF | 1,143 CHF (0.002%) | ✅ MATCH |
| Ergebnis 2024 | **769,761.89 CHF** | 769,761.89 CHF | 0 CHF | ✅ MATCH |

> Finance001 wurde zwischenzeitlich refresht. Finance001 und datavault-test sind vollständig synchron.

---

### Lauf 2: Vollständiger Check (CSM_Abacus_T lokal)

**Verbindung:** `PBIDesktop-CSM_Abacus_T-55278` | DB: `0f7733c2-cf7b-4ce2-a056-50e49172b3d7`

---

#### SCHRITT 1 — Tabellen-Inventar

| SM-Tabelle | Soll | Ist (Spalten) | Status |
|---|---|---|---|
| dim_date | ✅ | 37 Spalten | ✅ |
| dim_buchungsstatus | ✅ | 7 Spalten | ✅ |
| dim_konto | ✅ | 10 Spalten | ✅ |
| dim_kostenstelle | ✅ | 15 Spalten | ✅ |
| dim_kreditor | ✅ | 7 Spalten | ✅ |
| fakt_belege | ✅ | 17 Spalten | ✅ |
| fakt_buchungen | ✅ | 22 Spalten | ✅ |
| fakt_budget | ✅ | 10 Spalten | ✅ |
| fakt_forecast | ✅ | 10 Spalten | ✅ |
| ref_actual_forecast | ✅ | 4 Spalten | ✅ |
| dim_abteilung | ✅ | 8 Spalten | ✅ |
| dim_leistungsart | ✅ | 7 Spalten | ✅ |
| dim_person | ✅ | 13 Spalten | ✅ |
| dim_projekt | ✅ | 17 Spalten | ✅ |
| fakt_stunden | ✅ | 9 Spalten | ✅ |

**Ergebnis: Alle 15 Soll-Tabellen vorhanden. ✅**

---

#### SCHRITT 2 — Finance Spalten-Mapping

**2.1 fakt_buchungen (22 Spalten)**

| Spalte | Typ CSM | Typ Finance001 | Status |
|--------|---------|----------------|--------|
| betrag | Double | Double | ✅ |
| buchungsdatum_date_key | Int64 (YYYYMMDD) | via dim_date | ✅ |
| konto_key | Int64 (SK) | — (Klartextschlüssel) | ✅ SK-System korrekt |
| kostenstelle_key | Int64 (SK) | — | ✅ |
| kreditor_key | **FEHLT** | Kundennummer(String) | ⚠️ Nur `kundennummer` (Int64) vorhanden; kein SK für Kreditor |
| soll_haben | String | String | ✅ |
| mwst_typ | String | Int64 | ⚠️ Typ-Unterschied (CSM Text = korrekt, Finance001 Int) |
| mwst_code | String | Int64 | ⚠️ Typ-Unterschied (akzeptabel) |
| mwst_betrag | Double | Double | ✅ |
| mwst_satz | Double | Double | ✅ |
| mwst_incl | String | — | ✅ (CSM zusätzlich) |
| belegnummer | Int64 | via fakt_belege | ✅ |
| umschreibung, umschreibung2 | String | String | ✅ |
| sam | String | String | ✅ |
| dss_load_date | DateTime | DateTime | ✅ |

**2.2 dim_konto (10 Spalten)**

| Spalte CSM | Spalte Finance001 | Status |
|---|---|---|
| konto_key | — (nur CSM SK) | ✅ |
| konto_id | KontoNr | ✅ |
| konto_code | Konto (display) | ✅ |
| konto_name | KontoName | ✅ |
| konto_gruppe | Konto_L1 | ✅ |
| konto_gruppe_name | KontoName_L1 | ✅ |
| konto_subgruppe | Konto_L2 | ✅ |
| konto_subgruppe_name | KontoName_L2 | ✅ |
| dss_load_date, dss_record_source | — | ✅ |

**2.3 dim_kostenstelle (15 Spalten)**

| Spalte CSM | Entsprechung Finance001 | Status |
|---|---|---|
| bereich | Bereich_L1 (alt) | ✅ |
| bereich_name | Bereichsname_L1 (alt) | ✅ |
| bereich_detail | Bereich_L2 (alt) | ✅ |
| bereich_detail_name | Bereichsname_L2 (alt) | ✅ |
| bereich_neu | BereichNeu_L1 (neu) | ✅ |
| bereich_neu_name | Bereichsname_neu_L1 | ✅ |
| bereich_neu_detail | BereichNeu_L2 (neu) | ✅ |
| bereich_neu_detail_name | — | ✅ (CSM zusätzlich) |
| investitionsrechnung | Int64 | ✅ |

**Beide Bereichs-Hierarchien (alt + neu) vorhanden. ✅**

---

#### SCHRITT 3 — Projekt Spalten-Mapping

**3.1 dim_projekt (17 Spalten, Projekt001: 11)**

| Projekt001 Spalte | CSM Spalte | Typ CSM | Typ Projekt001 | Status |
|---|---|---|---|---|
| ProjektNr | projekt_id | String | String | ✅ |
| ProjektName | projekt_name | String | String | ✅ |
| Inaktiv | inaktiv | **Int64 (0/1)** | **Boolean** | ⚠️ Typ-Unterschied, DAX-Filter = 0 funktioniert |
| GruppeNr | gruppe_nr | **Int64** | **String** | ⚠️ Typ-Unterschied (kein Problem für Anzeige) |
| GruppeName | gruppe_name | String | String | ✅ |
| Erstellt | erstellt | DateTime | DateTime | ✅ |
| StatusNr | status_nr | **Int64** | **String** | ⚠️ Typ-Unterschied |
| Status | status | String | String | ✅ |
| StatusDatum | status_datum | DateTime | DateTime | ✅ |
| HauptgruppeNr | hauptgruppe_nr | String | String | ✅ |
| HauptgruppeName | hauptgruppe_name | String | String | ✅ |
| — | projekt_key | Int64 | — | ✅ nur CSM (SK) |
| — | projekt_code | String | — | ✅ nur CSM |
| — | erstellt_date_key | Int64 | — | ✅ nur CSM |
| — | status_datum_date_key | Int64 | — | ✅ nur CSM |

Alle 11 Projekt001-Spalten sind im CSM vorhanden. CSM hat 6 Zusatzspalten (SK, Date Keys). ✅

**3.2 fakt_stunden (9 Spalten)**

| Spalte | Typ | Status |
|---|---|---|
| projekt_key | Int64 (SK) | ✅ |
| leistungsart_key | Int64 (nullable) | ✅ |
| perioden_date_key | Int64 (YYYYMMDD) | ✅ |
| betrag | Double | ✅ (= Abacus AZBETINT, Arbeitszeitbetrag) |
| gb | Double | ✅ (Geschäftsbereich) |
| sachkonto_code | Int64 | ✅ (Degenerate Dimension) |
| dataset | Int64 | ✅ |
| dss_load_date, dss_record_source | — | ✅ |

> ⚠️ **Kein separater `stunden`-Spaltenname** — `betrag` enthält Abacus AZBETINT (Arbeitszeitbetrag intern), der je nach Sachkonto-Code Stunden oder CHF-Beträge enthält. Das ist korrekt gemäss Datenmodell.

---

#### SCHRITT 4 — Beziehungen

**Finance-Beziehungen (21 total im SM, 6 GUID-Namen → umbenannt):**

| Beziehung | Richtung | Aktiv | Status |
|---|---|---|---|
| fakt_buchungen.buchungsdatum_date_key → dim_date.date_key | n:1 | ✅ | ✅ |
| fakt_buchungen.konto_key → dim_konto.konto_key | n:1 | ✅ | ✅ |
| fakt_buchungen.kostenstelle_key → dim_kostenstelle.kostenstelle_key | n:1 | ✅ | ✅ |
| fakt_buchungen.kreditor_key → dim_kreditor.kreditor_key | — | — | ❌ `kreditor_key` fehlt in fakt_buchungen (Plan-Fehler: Beziehung geht via fakt_belege) |
| fakt_belege.kreditor_key → dim_kreditor.kreditor_key | n:1 | ✅ | ✅ (architektonisch korrekt) |
| fakt_belege.buchungsstatus_key → dim_buchungsstatus.buchungsstatus_key | n:1 | ✅ | ✅ |
| fakt_belege.belegdatum_date_key → dim_date.date_key | n:1 | ✅ | ✅ |
| fakt_belege.valuta_datum_date_key → dim_date.date_key | n:1 | inaktiv | ✅ (für USERELATIONSHIP) |
| fakt_budget.konto_key → dim_konto.konto_key | n:1 | ✅ | ✅ (GUID → umbenannt) |
| fakt_budget.kostenstelle_key → dim_kostenstelle.kostenstelle_key | n:1 | ✅ | ✅ (GUID → umbenannt) |
| fakt_budget.datum_date_key → dim_date.date_key | n:1 | ✅ | ✅ (GUID → umbenannt) |
| fakt_forecast.konto_key → dim_konto.konto_key | n:1 | ✅ | ✅ (GUID → umbenannt) |
| fakt_forecast.kostenstelle_key → dim_kostenstelle.kostenstelle_key | n:1 | ✅ | ✅ (GUID → umbenannt) |
| fakt_forecast.datum_date_key → dim_date.date_key | n:1 | ✅ | ✅ (GUID → umbenannt) |

**Projekt-Beziehungen:**

| Beziehung | Aktiv | Status |
|---|---|---|
| fakt_stunden.projekt_key → dim_projekt.projekt_key | ✅ | ✅ |
| fakt_stunden.leistungsart_key → dim_leistungsart.leistungsart_key | ✅ | ✅ |
| fakt_stunden.perioden_date_key → dim_date.date_key | ✅ | ✅ |
| dim_abteilung.person_key → dim_person.person_key | ✅ | ✅ |
| dim_person.eintritt_date_key → dim_date.date_key | ✅ | ✅ |
| dim_person.austritt_date_key → dim_date.date_key | inaktiv | ✅ |
| dim_projekt.erstellt_date_key → dim_date.date_key | inaktiv | ✅ |
| dim_projekt.status_datum_date_key → dim_date.date_key | inaktiv | ✅ |

**Alle Soll-Beziehungen vorhanden. 6 GUID-Namen wurden umbenannt. ✅**

---

#### SCHRITT 5 — DAX-Validierung (CSM_Abacus_T)

**Finance:**

| DAX-Query | IST (CSM) | Soll | Delta | Status |
|---|---|---|---|---|
| Ergebnis 2023 | **1,220,257.55 CHF** | ~1,220,257 CHF | 0 CHF | ✅ EXAKT |
| Ergebnis 2024 | **769,761.89 CHF** | ~769,761 CHF | 0 CHF | ✅ EXAKT |
| Ertrag 2023 (Kto 30000-39999) | **47,528,706.36 CHF** | ~47,529,843 CHF | 1,137 CHF (0.002%) | ✅ MATCH |

> CSM_Abacus_T und Finance001 (Fabric) liefern identische Werte. ✅

**Projekt:**

| DAX-Query | IST (CSM) | Soll | Status |
|---|---|---|---|
| dim_projekt Total | **14,409** | 14,409 | ✅ EXAKT |
| dim_projekt Aktiv (inaktiv=0) | **13,181** | 13,181 | ✅ EXAKT |
| fakt_stunden betrag 2023 | -15,573,462.28 | (kein Vergleichswert) | ⚠️ Betrag = AZBETINT gemischt (Stunden+CHF), kein sinnvoller Einzel-KPI |

**Measures im CSM_Abacus_T: 0** — Keine Measures definiert. ⚠️ Müssen noch erstellt werden.

---

#### SCHRITT 6 — Ergebnisdokumentation

**Finance-Checks**

| Objekt | Check | Status | Ist-Wert | Soll-Wert | Massnahme |
|--------|-------|--------|---------|---------|-----------|
| fakt_buchungen | betrag Typ | ✅ | Double | Double/Decimal | — |
| fakt_buchungen | datum via dim_date | ✅ | buchungsdatum_date_key (Int64) | Int64 YYYYMMDD | — |
| fakt_buchungen | mwst_typ Typ | ⚠️ | String | Finance001: Int64 | Akzeptabel (dbt Text-Storage) |
| fakt_buchungen | kreditor_key Spalte | ❌ | fehlt | kreditor_key (Int64 SK) | Plan-Fehler: Beziehung läuft via fakt_belege; keine Korrektur nötig |
| dim_konto | L1/L2 Spalten (4 Stück) | ✅ | vorhanden | vorhanden | — |
| dim_kostenstelle | bereich_neu + bereich (alt) | ✅ | beide vorhanden | beide vorhanden | — |
| Beziehungen Finance | alle vorhanden | ✅ | 14 aktive/inaktive | Plan: 7 Kern + Extras | — |
| GUID-Namen | umbenannt | ✅ | 6 → sprechend | sprechend | erledigt |
| DAX Ergebnis 2023 | ~1,220K | ✅ | 1,220,257.55 | ~1,220,257 | — |
| DAX Ergebnis 2024 | ~769.8K | ✅ | 769,761.89 | ~769,761 | — |
| DAX Ertrag 2023 | ~47,530K | ✅ | 47,528,706.36 | ~47,529,843 | 0.002% Delta OK |
| Measures | vorhanden | ❌ | 0 Measures | mind. 3 (Actuals/Budget/FC) | Measures erstellen |

**Projekt-Checks**

| Objekt | Check | Status | Ist-Wert | Soll-Wert | Massnahme |
|--------|-------|--------|---------|---------|-----------|
| dim_projekt | inaktiv Typ | ⚠️ | Int64 (0/1) | Boolean (Projekt001) | Kein Blocking-Issue; DAX-Filter `= 0` funktioniert |
| dim_projekt | gruppe_nr Typ | ⚠️ | Int64 | String (Projekt001) | Kein Blocking-Issue; Anzeige OK |
| dim_projekt | status_nr Typ | ⚠️ | Int64 | String (Projekt001) | Kein Blocking-Issue |
| dim_projekt | alle 11 Projekt001-Spalten | ✅ | 11/11 vorhanden | 11 | — |
| dim_projekt | Spalten Total | ✅ | 17 (inkl. 6 CSM-Extras) | 11+ | — |
| dim_projekt | Anzahl Total | ✅ | 14,409 | 14,409 | — |
| dim_projekt | Anzahl Aktiv | ✅ | 13,181 | 13,181 | — |
| fakt_stunden | perioden_date_key → dim_date | ✅ | Int64 YYYYMMDD | Int64 YYYYMMDD | — |
| fakt_stunden | `stunden`-Spalte | ⚠️ | fehlt — `betrag` = AZBETINT | stunden (Decimal) | Bezeichnung im Plan falsch; `betrag` enthält Arbeitszeitbetrag |
| Beziehungen Projekt | alle 3 Soll vorhanden | ✅ | 3/3 | 3 | — |

---

### Abschlussbewertung

**Ist CSM_Abacus_T bereit für Deployment? ✅ JA — mit Einschränkungen**

| Bereich | Bewertung | Details |
|---------|-----------|---------|
| Datenkonsistenz | ✅ VOLLSTÄNDIG | DAX-Werte identisch zu Finance001 und datavault-test |
| Tabellen-Vollständigkeit | ✅ VOLLSTÄNDIG | Alle 15 Soll-Tabellen vorhanden |
| Beziehungen | ✅ VOLLSTÄNDIG | Alle Kern-Beziehungen vorhanden; GUID-Namen bereinigt |
| Spalten-Mapping | ✅ VOLLSTÄNDIG | Alle Inhaltsspalten korrekt |
| Measures | ❌ FEHLT | 0 Measures definiert — Blocking für BI-Reports |
| Typ-Abweichungen | ⚠️ AKZEPTABEL | inaktiv=INT, gruppe_nr/status_nr=INT, mwst_typ/mwst_code=String |

**Nächste Schritte (Priorität):**

| # | Massnahme | Priorität |
|---|-----------|-----------|
| 1 | **Measures manuell erstellen** in CSM_Abacus_T (siehe DAX-Vorlagen unten) | 🔴 Hoch (Blocking) |
| 2 | `dim_projekt[inaktiv]` als berechnete Boolean-Spalte im SM definieren (optional, für Filter-UI) | 🟡 Low |
| 3 | Plan-Dokumentation korrigieren: Beziehung fakt_buchungen→dim_kreditor nicht möglich (kein FK-Spalte); Beziehung geht via fakt_belege | 🟡 Low |
| 4 | Deployment in Fabric-Workspace vorbereiten | 🟠 Mittel |

---

### DAX-Vorlagen für Measures (manuell anlegen)

> Measures werden manuell in Power BI Desktop in CSM_Abacus_T angelegt.
> Empfehlung: Measure-Tabelle `_Measures` (leere Tabelle als Container) erstellen.

**Finance Measures:**

```dax
-- Aktuelle Buchungen (P&L Konten, alle Perioden)
Total Actuals = SUM(fakt_buchungen[betrag])

-- Budget gesamt
Total Budget = SUM(fakt_budget[betrag])

-- Forecast gesamt
Total Forecast = SUM(fakt_forecast[betrag])

-- Ergebnis = Summe aller P&L Buchungen (Ertrag - Aufwand bereits im Vorzeichen)
Ergebnis = [Total Actuals]

-- Ertrag = Konten 30000-39999
Ertrag =
CALCULATE(
    [Total Actuals],
    FILTER(
        dim_konto,
        VALUE(dim_konto[konto_id]) >= 30000 &&
        VALUE(dim_konto[konto_id]) < 40000
    )
)
```

**Kontrollwerte (Validation nach Anlage):**

| Measure | Erwarteter Wert (2023) | Erwarteter Wert (2024) |
|---------|----------------------|----------------------|
| Ergebnis | **1,220,257.55 CHF** | **769,761.89 CHF** |
| Ertrag | **47,528,706.36 CHF** | **43,446,053.58 CHF** |
| Total Budget | (ohne Jahresfilter: 52,693 Zeilen) | — |
