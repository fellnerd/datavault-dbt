# Power BI Plausibilitätscheck — Implementierungsplan v3

> **v3 — nach Tiefenanalyse via db-monitor + MCP (31.05.2026)**
> **Headline-Befund:** Ergebnis 2024 in `fakt_buchungen_v` = **769'761.89 CHF** — **EXAKT** identisch zu Finance001 ✅
> Aber: 3 kritische dbt-Bugs blockieren das Reporting.

---

## 0 — Tools-Klarstellung (warum kein Tabular Editor)

CalculationGroups können auf 3 Wegen angelegt werden:
1. **Tabular Editor** (klassisch, GUI)
2. **TMSL/XMLA-Script** (SSMS, PowerShell)
3. **MCP** `mcp_powerbi-model_calculation_group_operations` ← **wir nutzen das**

PBI Desktop GUI kann CGs nur nicht erstellen — alle drei Tools schreiben über denselben XMLA-Endpunkt. Tabular Editor war im Finance001-Modell auch nicht "im Modell verbaut" — wurde einmal verwendet, jetzt lebt die CG einfach im Modell.

**→ Wir brauchen KEIN Tabular Editor.** Ich lege CG, Measures, Calculated Tables und Relationships per MCP direkt an.

---

## 1 — Soll-Architektur (aus Finance001 reverse engineered)

### 1.1 Konten-Hierarchie (3 Ebenen)
| Ebene | Spalte | Beispiel |
|-------|--------|----------|
| L2 (Gruppe) | `Konto_L2` | `3 Ertrag`, `4 Aufwand`, `5 Personalaufwand` |
| L1 (Subgruppe) | `Konto_L1` | `30 Ertrag Netz`, `40 Aufwand Production` |
| Konto | `Konto` | `30150 Bezeichnung` |

Plus **Plug-Zeilen** im L2 für Summary Lines (`4x Bruttoergebnis`, `9x Ergebnis`, …) — kommen via M-Query `Konten-Plug`.

### 1.2 Scenarios (eine Tabelle, kombiniert)
Eine `Scenarios` Tabelle mit Spalten `Datum`, `KontoNr`, `Kostenstelle`, `Szenario`, `Betrag` — kombiniert was bei uns in `fakt_budget_v` + `fakt_forecast_v` getrennt liegt.

### 1.3 Relationships Finance001
| From | To | Active |
|------|----|--------|
| Scenarios → Konten[KontoNr] | M:1 | ✅ |
| Scenarios → Kostenstellen[KostenstelleNr] | M:1 | ✅ |
| Scenarios → Calendar[Date] | M:1 | ✅ |
| Buchungen → Konten[KontoNr] | M:1 | ✅ |
| Buchungen → Kostenstellen[KostenstelleNr] | M:1 | ✅ |
| Buchungen → Calendar[Date] | M:1 | ✅ |
| Calendar[Y-Month] → ActualForecast[Y-Month] | M:1 | ✅ |

### 1.4 Summary Lines CalculationGroup (12 Items)
Pro Plug-Zeile ein Item das Vorgänger-Gruppen aufsummiert:
| Item | Formel |
|------|--------|
| `4x Bruttoergebnis` | `3 + 4` |
| `5x Bruttoergebnis mit Personal` | `3 + 4 + 5` |
| `6ax EBITDA` | `+ 6a` |
| `6bx EBIT` | `+ 6b` |
| `7x Betriebsergebnis` | `+ 6c + 7` |
| `9x Ergebnis` | `+ 8` |

Plus 6 `%`-Varianten (relativ zu Ertrag).

### 1.5 Measures-Familie (29)
- **Without Summary Lines (10):** `Total Actuals`, `Total Budget`, `Total Forecast`, `Total Prev Year`, `Total Actuals (with Forecast)`, `Total Actuals vs Budget/Forecast/PY` (+%)
- **With Summary Lines (9):** `Actuals`, `Budget`, `Forecast`, `Prev Year`, `Actuals (with Forecast)`, `Actuals vs Budget/Forecast/PY` (+%)
- **Unformatted (4):** Same ohne Format-String — für interne Berechnungen

### 1.6 Plug-Zero-Logik (kritisch für Visual)
Damit Plug-Zeilen sichtbar bleiben auch wenn Wert BLANK ist:
```dax
IF (Calc = BLANK() && LEFT(SELECTEDVALUE('Konten'[Konto_L2]), 2) IN {"3 ","4 ","5 ","7 ","8 "}
                  || LEFT(SELECTEDVALUE('Konten'[Konto_L2]), 3) IN {"6a ","6b ","6c "},
    0, Calc)
```

### 1.7 Visual-Konfiguration (Zebra BI Tables)
| Bucket | Feld |
|--------|------|
| Category | `Konten[Konto_L2]`, `Konten[Konto_L1]`, `Konten[Konto]` |
| Values | `Total Actuals (with Forecast)` |
| Previous Year | `Total Prev Year` |
| Plan | `Total Budget` |

---

## 2 — IST-Zustand `datavault-test` (db-monitor 31.05.2026 18:30)

### 2.1 Werte stimmen ✅
| KPI 2024 | Wert | Erwartet (Finance001) | Δ |
|----------|-----:|----------------------:|--:|
| Ergebnis (`SUM betrag, gruppe IN 3..8`) | **769'761.89** | 769'761.89 | **0.00** ✅ |
| Ertrag (Gruppe 3) | 43'446'308.07 | 43'446'053.58 | +254.49 (~0.0006%) ✅ |
| Aufwand (Gruppe 4) | -20'261'218.27 | -20'261K | ≈0 ✅ |
| Personalaufwand (5) | -11'878'840.32 | -11'879K | ≈0 ✅ |

**Vorzeichen:** Ertrag positiv, Aufwand negativ → direkte Addition, kein `* -1` nötig.

### 2.2 Bugs in dbt-Models (3 kritische, deploy 5528 noch pending)
| # | Bug | Datei | Severity |
|---|-----|-------|----------|
| **B1** | `dim_konto_v.konto_gruppe / konto_gruppe_name / konto_subgruppe / konto_subgruppe_name` alle NULL (526/526 Zeilen) | `models/mart/finance/dim_konto_v.sql` | 🔴 Blocker |
| **B2** | `dim_konto_v.konto_code` und `konto_name` enthalten nur `konto_nr` als Decimal-String (`"10000.000000000000000000"`) statt echter Bezeichnungen | `models/mart/finance/dim_konto_v.sql` | 🔴 Blocker |
| **B3** | `fakt_budget_v.datum_date_key` und `fakt_forecast_v.datum_date_key` zu **100% NULL** → Time Intelligence kaputt | `models/mart/finance/fakt_budget_v.sql`, `fakt_forecast_v.sql` | 🔴 Blocker (unabhängig von Deploy 5528!) |

> **B3 ist neu entdeckt** und durch Deploy 5528 alleine NICHT gefixt — separater Bug.

### 2.3 OK ✅
| Punkt | Wert |
|-------|------|
| `fakt_buchungen_v` Vorzeichen + Werte | korrekt |
| Szenarios | exakt 1 Wert je Tabelle: `Budget`, `Forecast 1` |
| `dim_date_v` vorhanden | 37 Spalten |

### 2.4 Mapping-Anpassungen (englische Spaltennamen)
Unsere Mart hat englische Spalten — DAX muss gemappt werden:
| Finance001 | CSM (`dim_date_v`) |
|------------|--------------------|
| `Calendar[Date]` | `dim_date[full_date]` |
| `Calendar[Y-Month]` | `dim_date[year_month]` |
| `Calendar[Year]` | `dim_date[year]` |

`ref_actual_forecast` hat bereits `y_month` (lowercase) und `actual_forecast`.

---

## 3 — dbt-Fixes (vor Reporting nötig)

### 3.1 Fix B1+B2: `dim_konto_v` Enrichment + echte Namen
Joins gegen Reference-Tabellen ergänzen. Erwartete Struktur:
```sql
WITH base AS (
    SELECT
        hk.hk_konto,
        TRY_CAST(hk.kto AS INT) AS konto_nr
    FROM {{ ref('hub_konto') }} hk
),
sat AS (  -- aktueller Satellite-View
    SELECT hk_konto, name, gruppe, subgruppe
    FROM {{ ref('sat_konto_current_v') }}
),
ref_gruppe AS (  -- Reference View für Gruppen-Namen
    SELECT code, name
    FROM {{ ref('ref_konto_gruppe_v') }}
),
ref_subgruppe AS (
    SELECT code, name
    FROM {{ ref('ref_konto_subgruppe_v') }}
)
SELECT
    {{ surrogate_key('konto_nr') }} AS konto_key,
    CAST(b.konto_nr AS NVARCHAR(255))                AS konto_id,
    CAST(b.konto_nr AS NVARCHAR(255))                AS konto_code,
    COALESCE(s.name, CAST(b.konto_nr AS NVARCHAR(255))) AS konto_name,
    LEFT(CAST(b.konto_nr AS NVARCHAR(255)), 1)       AS konto_gruppe,
    rg.name                                          AS konto_gruppe_name,
    LEFT(CAST(b.konto_nr AS NVARCHAR(255)), 2)       AS konto_subgruppe,
    rsg.name                                         AS konto_subgruppe_name,
    -- für Power BI (Code+Name als Label, analog Finance001)
    CONCAT(LEFT(CAST(b.konto_nr AS NVARCHAR), 1), ' ', rg.name)  AS konto_l2,
    CONCAT(LEFT(CAST(b.konto_nr AS NVARCHAR), 2), ' ', rsg.name) AS konto_l1,
    CONCAT(CAST(b.konto_nr AS NVARCHAR), ' ', s.name)            AS konto_label,
    GETDATE() AS dss_load_date,
    'ewb_abacus' AS dss_record_source
FROM base b
LEFT JOIN sat s          ON b.hk_konto = s.hk_konto
LEFT JOIN ref_gruppe rg  ON LEFT(CAST(b.konto_nr AS NVARCHAR), 1) = rg.code
LEFT JOIN ref_subgruppe rsg ON LEFT(CAST(b.konto_nr AS NVARCHAR), 2) = rsg.code
```
> **TODO:** Prüfen welche Reference-Views/Satellites für Gruppen-Names existieren. Falls keine: Hard-Code Mapping in CTE:
> ```sql
> ref_gruppe AS (VALUES ('3','Ertrag'),('4','Aufwand'),('5','Personalaufwand'),('6','Übriger Betriebsaufwand'),('7','Umlagen'),('8','Ausserord. & Betriebsfr. Ergebnis')) AS r(code,name)
> ```

### 3.2 Fix B1.5: 6a/6b/6c-Subgruppen-Mapping
Finance001 unterscheidet `6a Übriger Betriebsaufwand`, `6b Abschreibungen`, `6c Finanzierung` — alle sind Gruppe `6`. Diese Unterscheidung kommt aus dem Subgruppen-Code:
- `60-65` → `6a Übriger Betriebsaufwand`
- `68` → `6b Abschreibungen`
- `69` → `6c Finanzierung`

Lösung: spezifische `konto_l2_extended`-Spalte in dbt:
```sql
,CASE
    WHEN LEFT(konto_nr,1) IN ('3','4','5','7','8') THEN CONCAT(LEFT(konto_nr,1), ' ', rg.name)
    WHEN LEFT(konto_nr,2) IN ('60','61','62','63','64','65') THEN '6a Übriger Betriebsaufwand'
    WHEN LEFT(konto_nr,2) = '68' THEN '6b Abschreibungen'
    WHEN LEFT(konto_nr,2) = '69' THEN '6c Finanzierung'
END AS konto_l2
```
> **TODO:** exakte Subgruppen-Ranges aus Finance001 verifizieren via `EVALUATE DISTINCT('Konten'[Konto_L1], 'Konten'[Konto_L2])`.

### 3.3 Fix B3: `datum_date_key` in Budget/Forecast
Wurzelursache prüfen — wahrscheinlich Type-Mismatch oder fehlende Join-Spalte im View:
```sql
-- AKTUELL VERMUTLICH:
,{{ surrogate_key('datum') }} AS datum_date_key  -- aber datum ist NULL?

-- ODER:
LEFT JOIN {{ ref('dim_date_v') }} d ON b.datum = d.full_date  -- aber kein Match?
```
**Sofort-Check (vor Fix):**
```sql
SELECT TOP 10 datum, datum_date_key, betrag FROM mart_finance.fakt_budget_v;
SELECT MIN(datum), MAX(datum), COUNT(*), COUNT(datum_date_key) FROM mart_finance.fakt_budget_v;
```
Dann entsprechenden Fix (Date-Format, Join-Type, etc.).

### 3.4 Plug-Zeilen im `dim_konto_v`
Damit Summary-Lines im Visual sichtbar bleiben, müssen 6 Plug-Zeilen existieren:
```sql
UNION ALL
SELECT
    -1                          AS konto_key,
    NULL                        AS konto_id,
    NULL                        AS konto_code,
    NULL                        AS konto_name,
    NULL, NULL, NULL, NULL,
    '4x Bruttoergebnis'         AS konto_l2,
    NULL                        AS konto_l1,
    NULL                        AS konto_label,
    GETDATE(), 'plug'
UNION ALL SELECT -2,NULL,...,'5x Bruttoergebnis mit Personal',...
UNION ALL SELECT -3,NULL,...,'6ax EBITDA',...
UNION ALL SELECT -4,NULL,...,'6bx EBIT',...
UNION ALL SELECT -5,NULL,...,'7x Betriebsergebnis',...
UNION ALL SELECT -6,NULL,...,'9x Ergebnis',...
```

---

## 4 — Power BI Modell-Erweiterungen in CSM (per MCP)

### 4.1 Calculated Table `Scenarios`
```dax
Scenarios =
UNION (
    SELECTCOLUMNS('fakt_budget',
        "datum_date_key", 'fakt_budget'[datum_date_key],
        "konto_key", 'fakt_budget'[konto_key],
        "kostenstelle_key", 'fakt_budget'[kostenstelle_key],
        "Szenario", 'fakt_budget'[szenario],
        "Betrag", 'fakt_budget'[betrag]
    ),
    SELECTCOLUMNS('fakt_forecast',
        "datum_date_key", 'fakt_forecast'[datum_date_key],
        "konto_key", 'fakt_forecast'[konto_key],
        "kostenstelle_key", 'fakt_forecast'[kostenstelle_key],
        "Szenario", 'fakt_forecast'[szenario],
        "Betrag", 'fakt_forecast'[betrag]
    )
)
```
**Voraussetzung:** Bug B3 gefixt — sonst sind alle `datum_date_key` NULL.

### 4.2 Relationships (per MCP `relationship_operations: Create`)
| From | To | Cross |
|------|----|--------|
| `Scenarios[konto_key]` → `dim_konto[konto_key]` | OneDirection M:1 |
| `Scenarios[kostenstelle_key]` → `dim_kostenstelle[kostenstelle_key]` | OneDirection M:1 |
| `Scenarios[datum_date_key]` → `dim_date[date_key]` | OneDirection M:1 |
| `dim_date[year_month]` → `ref_actual_forecast[y_month]` | OneDirection M:1 |

### 4.3 Hierarchy `Konto Hierarchy` auf `dim_konto`
Levels: `konto_l2` → `konto_l1` → `konto_label`

### 4.4 Selector-Tabellen (Calculated)
```dax
'Budget Selector' = DATATABLE("Scenario", STRING, {{"Budget"}})
'Forecast Selector' = DATATABLE("Scenario", STRING, {{"Forecast 1"}})
'Actuals/Forecast Selector' = DATATABLE("Scenario", STRING, {{"Actuals"}, {"Actuals + Forecast 1"}})
```

### 4.5 Hilfstabelle `Summary Lines (Technical)`
```dax
'Summary Lines (Technical)' = DATATABLE("Name", STRING, {{"Konto_L2"}, {"Summary Line"}})
```

### 4.6 Measures (Tabelle `fakt_buchungen` oder neue `Metrics`)

```dax
-- Without Summary Lines
Total Actuals := SUM('fakt_buchungen'[betrag])

Total Budget :=
VAR Scenario = SELECTEDVALUE('Budget Selector'[Scenario], "Budget")
VAR Calc = CALCULATE(SUM('Scenarios'[Betrag]), 'Scenarios'[Szenario] = Scenario)
RETURN
    IF (
        Calc = BLANK () && (
            LEFT(SELECTEDVALUE('dim_konto'[konto_l2]), 2) IN {"3 ","4 ","5 ","7 ","8 "}
            || LEFT(SELECTEDVALUE('dim_konto'[konto_l2]), 3) IN {"6a ","6b ","6c "}
        ),
        0,
        Calc
    )

Total Forecast :=
VAR Scenario = SELECTEDVALUE('Forecast Selector'[Scenario], "Forecast 1")
RETURN CALCULATE(SUM('Scenarios'[Betrag]), 'Scenarios'[Szenario] = Scenario)

Total Prev Year :=
VAR Calc = CALCULATE([Total Actuals], SAMEPERIODLASTYEAR('dim_date'[full_date]))
RETURN
    IF (Calc = BLANK() && (
        LEFT(SELECTEDVALUE('dim_konto'[konto_l2]), 2) IN {"3 ","4 ","5 ","7 ","8 "}
        || LEFT(SELECTEDVALUE('dim_konto'[konto_l2]), 3) IN {"6a ","6b ","6c "}
    ), 0, Calc)

Total Actuals (with Forecast) :=
VAR Scenario = SELECTEDVALUE('Actuals/Forecast Selector'[Scenario], "Actuals")
VAR LastActualsDate =
    CALCULATE(MAX('dim_date'[full_date]),
        ALL('dim_date'),
        FILTER(ALL('ref_actual_forecast'), 'ref_actual_forecast'[actual_forecast] = "Actual"))
VAR YMonthCurr =
    CALCULATE(FIRSTNONBLANK('dim_date'[year_month], 0),
        FILTER(ALL('dim_date'), 'dim_date'[full_date] = LastActualsDate + 1))
VAR FirstDateOfMonthCurr =
    CALCULATE(FIRSTDATE('dim_date'[full_date]),
        FILTER(ALL('dim_date'), 'dim_date'[year_month] = YMonthCurr))
VAR Calc =
    IF ( Scenario = "Actuals",
        [Total Actuals],
        CALCULATE([Total Actuals], FILTER('dim_date', 'dim_date'[full_date] < FirstDateOfMonthCurr))
      + CALCULATE(SUM('Scenarios'[Betrag]),
            'Scenarios'[Szenario] = RIGHT(Scenario, LEN(Scenario) - LEN("Actuals + ")),
            FILTER('dim_date', 'dim_date'[full_date] >= FirstDateOfMonthCurr))
    )
RETURN
    IF (Calc = BLANK() && (
        LEFT(SELECTEDVALUE('dim_konto'[konto_l2]), 2) IN {"3 ","4 ","5 ","7 ","8 "}
        || LEFT(SELECTEDVALUE('dim_konto'[konto_l2]), 3) IN {"6a ","6b ","6c "}
    ), 0, Calc)

-- Vergleiche
Total Actuals vs Budget     := [Total Actuals] - [Total Budget]
Total Actuals vs Forecast   := [Total Actuals] - [Total Forecast]
Total Actuals vs Prev Year  := [Total Actuals] - [Total Prev Year]
Total Actuals vs Budget %   := DIVIDE([Total Actuals vs Budget], ABS([Total Budget]))
Total Actuals vs Forecast % := DIVIDE([Total Actuals vs Forecast], ABS([Total Forecast]))
Total Actuals vs Prev Year %:= DIVIDE([Total Actuals vs Prev Year], ABS([Total Prev Year]))
```

### 4.7 CalculationGroup `Summary Lines` (per MCP `calculation_group_operations: CreateGroup`)

Pseudo-Body für MCP-Call (12 Items):
```json
{
  "operation": "CreateGroup",
  "groupDefinitions": [{
    "name": "Summary Lines",
    "precedence": 100,
    "calculationItems": [
      {"name": "4x Bruttoergebnis", "ordinal": 1, "expression":
        "CALCULATE(SELECTEDMEASURE(), ALL('dim_konto'[konto_l2]), 'dim_konto'[konto_l2]=\"3 Ertrag\") + CALCULATE(SELECTEDMEASURE(), ALL('dim_konto'[konto_l2]), 'dim_konto'[konto_l2]=\"4 Aufwand\")"
      },
      {"name": "5x Bruttoergebnis mit Personal", "ordinal": 3, "expression": "... + 5 Personalaufwand"},
      {"name": "6ax EBITDA", "ordinal": 5, "expression": "... + 6a Übriger Betriebsaufwand"},
      {"name": "6bx EBIT", "ordinal": 7, "expression": "... + 6b Abschreibungen"},
      {"name": "7x Betriebsergebnis", "ordinal": 9, "expression": "... + 6c Finanzierung + 7 Umlagen"},
      {"name": "9x Ergebnis", "ordinal": 11, "expression": "... + 8 Ausserord. & Betriebsfr. Ergebnis"}
      /* + 6 %-Varianten ordinal 2,4,6,8,10,12 */
    ]
  }]
}
```

---

## 5 — Phasenplan + Verantwortlichkeit

| Phase | Aktion | Wer | Status |
|-------|--------|-----|--------|
| **0** | `ci:validate` (5523) + `deploy:test` (5528) | CI | ⏳ läuft |
| **1** | CSM Refresh | User | ⏸ |
| **2** | Re-Validierung Bug B1/B2 — sind Spalten nach Deploy gefüllt? | Agent (db-monitor) | ⏸ |
| **3a** | Fix Bug B1+B2 in `dim_konto_v` (Joins + Ref-Mapping) | vault-architect/mart-architect | ⏸ |
| **3b** | Fix Bug B3 in `fakt_budget_v` + `fakt_forecast_v` (datum_date_key) | mart-architect | ⏸ |
| **3c** | Plug-Zeilen in `dim_konto_v` ergänzen | mart-architect | ⏸ |
| **3d** | dbt deploy (3a-3c) auf test | dbt-deployer | ⏸ |
| **4** | CSM Refresh + Werte-Validierung | User + Agent | ⏸ |
| **5a** | `Scenarios` Calculated Table per MCP | Agent | ⏸ |
| **5b** | Relationships per MCP | Agent | ⏸ |
| **5c** | Selector-Tabellen + Summary Lines (Technical) per MCP | Agent | ⏸ |
| **5d** | Hierarchy `Konto Hierarchy` per MCP | Agent | ⏸ |
| **5e** | Measures (10) per MCP | Agent | ⏸ |
| **5f** | CalculationGroup `Summary Lines` per MCP | Agent | ⏸ |
| **6** | Report-Seite "Plausibilitätscheck GuV" mit Zebra BI Tables | User | ⏸ |
| **7** | Side-by-side Vergleich Finance001 ↔ CSM | Agent + User | ⏸ |

> **Phase 3a-c kann parallel ohne 5528-Wartetraum starten** — die Bugs sind klar, der Refresh würde sie nicht beheben.

---

## 6 — Quick Wins JETZT machbar (parallel zum Deploy)

1. **Bug-Triage 3a/3b/3c starten** — Untersuchung der dbt-Models, ggf. Fix-PR vorbereiten
2. **Subagent `vault-architect` und `mart-architect` beauftragen** für 3a und 3b
3. **MCP-Calls für Phase 5a-5f vorbereiten** (Templates fertig, können sofort gegen CSM gefahren werden sobald Modell stabil ist)

---

## 7 — Side-by-side Zielwerte (für Phase 7)

| Zeile | Finance001 2024 | CSM 2024 erwartet | Δ-Toleranz |
|-------|----------------:|------------------:|-----------:|
| 3 Ertrag | 43'445K | 43'446K | ≤ 1K (0.002%) |
| 4 Aufwand | -20'261K | -20'261K | ≤ 1K |
| 4x Bruttoergebnis | 23'184K | ~23'185K | ≤ 1K |
| 5 Personalaufwand | -11'879K | -11'879K | ≤ 1K |
| 5x Bruttoergebnis m. Personal | 11'305K | ~11'305K | ≤ 1K |
| 6ax EBITDA | 7'113K | TBD | ≤ 1K |
| 6bx EBIT | 1'223K | TBD | ≤ 1K |
| 7x Betriebsergebnis | 1'052K | TBD | ≤ 1K |
| 9x Ergebnis | **1'017K** | **769'761.89** ❓ | Δ -247K?? |

> ⚠️ **Diskrepanz im Ergebnis:** Finance001-Screenshot zeigt `9x Ergebnis 2024 = 1'017K`, unser SUM(betrag, gruppe 3..8) = `769'761.89`. Im Finance001 Screenshot ist die Spalte "Rechnung" 2024 = 1'017K, "Vorjahr" 2023 = 1'220K. Unsere Werte stimmen aber genau mit den 2024-Zahlen aus der Konversationszusammenfassung überein (769'761.89 = "Ergebnis 2024"). → **Wir müssen klären welches der echte 9x Ergebnis-Wert in Finance001 ist** (DAX-Test in Phase 7).
