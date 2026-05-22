# Plausibilitäts-Check Ergebnisse — CLI Agents

**Datum:** 2026-05-22  
**Agents:** `db-monitor`, `synapse-validator`  
**Datenbank:** `datavault-test` (sql-analytics-ewb-001.database.windows.net)  
**Referenz:** PBI Finance001 / Projekt001 (Workspace "Finance") — Screenshots 2026-05-22  

> **Hinweis Synapse:** Direkter Synapse SQL Endpoint war nicht erreichbar — Vergleich erfolgte als Alternativ-Check gegen PBI-Kontrollwerte aus den Screenshots.

---

## Gesamt-Score

| Kategorie | ✅ PASS | ⚠️ WARN | ❌ FAIL |
|-----------|--------|--------|--------|
| Finance Beträge | 3 | 0 | 4 |
| Finance Struktur | 3 | 2 | 3 |
| Projekt | 4 | 1 | 2 |
| **Total** | **10** | **3** | **9** |

---

## ✅ Was stimmt (innerhalb ±1% Toleranz)

| Kennzahl | PBI Soll | Mart Ist | Abweichung | Status |
|---|---|---|---|---|
| Ertrag 2023 (Konto 3x) | ~47,530K CHF | 47,528,706 CHF | -0.003% | ✅ PASS |
| Gesamtergebnis 2023 | ~1,220K CHF | 1,220,258 CHF | +0.02% | ✅ PASS |
| Ertrag 2024 (Konto 3x) | ~43,445K CHF | 43,446,054 CHF | +0.002% | ✅ PASS |
| MwSt-Typ (kein Decimal-Bug) | INT-Werte | 0, 1, 2, 5 | OK | ✅ PASS |
| JOIN Buchungen → dim_konto | <1% orphan | 0.01% | OK | ✅ PASS |
| JOIN Buchungen → dim_kostenstelle | <1% orphan | 0.00% | OK | ✅ PASS |
| Alle 14 Mart-Views vorhanden | 14 | 14 | — | ✅ PASS |
| dim_projekt_v: projekt_id NULL | 0 | 0 | — | ✅ PASS |
| dim_projekt_v: UNKNOWN status | <10% | 0% | — | ✅ PASS |
| fakt_stunden → dim_projekt JOIN | <1% orphan | 0.00% | — | ✅ PASS |

---

## ❌ Bugs (9 FAILs)

---

### Bug #1 — `fakt_buchungen_v`: SAM='C' Gegenbuchungen nicht gefiltert

**Priorität:** 🔴 P1  
**Betroffen:** `models/mart/finance/fakt_buchungen_v.sql`  
**Symptom:** Gesamtergebnis 2024 = **769K statt ~1,017K → -24.3%** ❌

**Ursache:**  
Die View enthält Buchungen mit `SAM='C'` (Korrekturbuchungen). Diese werden von den laufenden PBI-Berichten implizit ausgeschlossen. Im Mart fehlt dieser Filter.

| SAM | 2024 Zeilen | 2024 Betrag | Auswirkung |
|-----|------------|-------------|------------|
| '' (blank) | 53,588 | +1,017,953 CHF | Normalbuchungen |
| 'S' | 362 | +459 CHF | Spezial-Buchungen |
| **'C'** | **1** | **-248,651 CHF** | **Gegenbuchung → zieht Ergebnis runter** |

Nach Ausschluss SAM='C': **1,018K CHF → ✅ +0.05% vs. PBI 1,017K**

Gleiches Problem Jan-Aug 2026: 17 SAM='C' Einträge → -629,397 CHF Abweichung.

**Diagnose-Query:**
```sql
SELECT buchungsdatum_date_key / 10000 AS jahr, sam, COUNT(*) AS zeilen, SUM(betrag) AS betrag
FROM mart_finance.fakt_buchungen_v
WHERE sam = 'C'
GROUP BY buchungsdatum_date_key / 10000, sam
ORDER BY jahr DESC;
```

**Fix:**
```sql
-- In fakt_buchungen_v.sql: SAM='C' aus allen UNION-Parts ausschliessen
WHERE sam <> 'C' OR sam IS NULL
```

> ⚠️ Rückfrage nötig: Sollen SAM='C' Einträge grundsätzlich aus dem Reporting ausgeschlossen werden oder ist das ein PBI-seitiger Filter?

---

### Bug #2 — `fakt_budget_v` + `fakt_forecast_v`: datum_date_key = NULL (100%)

**Priorität:** 🔴 P1  
**Betroffen:** `models/mart/finance/fakt_budget_v.sql`, `models/mart/finance/fakt_forecast_v.sql`  
**Symptom:** `datum_date_key` ist für **alle** Zeilen NULL → Zeitfilterung nach Jahr/Monat unmöglich

| View | Zeilen | datum_date_key NULL | Budget Total |
|------|--------|---------------------|-------------|
| fakt_budget_v | 52,693 | **100%** | 5,595,997 CHF |
| fakt_forecast_v | 13,163 | **100%** | 410,465 CHF |

**Ursache:**  
Das Quellsystem liefert Datumsfelder als **Excel-Seriennummern** (z.B. `44561`). `TRY_CAST(Datum AS DATE)` kann diese nicht parsen → NULL.

**Beweis:**
```sql
-- DATEADD(day, 44561 - 2, '1900-01-01') = 2022-01-31 ✅ korrekt
```

**Budget-Perioden nach korrekter Konvertierung:** 2025-01 bis 2026-12 (plausibel).

**Fix:**
```sql
-- In fakt_budget_v.sql und fakt_forecast_v.sql:
-- ALT (falsch):
TRY_CAST(b.Datum AS DATE) AS datum

-- NEU (korrekt):
CAST(DATEADD(day, TRY_CAST(b.Datum AS INT) - 2, '1900-01-01') AS INT) AS datum_date_key
-- Format YYYYMMDD: YEAR*10000 + MONTH*100 + DAY
```

**Vollständiger Ausdruck für date_key INT (YYYYMMDD):**
```sql
YEAR(DATEADD(day, TRY_CAST(b.Datum AS INT) - 2, '1900-01-01')) * 10000
+ MONTH(DATEADD(day, TRY_CAST(b.Datum AS INT) - 2, '1900-01-01')) * 100
+ DAY(DATEADD(day, TRY_CAST(b.Datum AS INT) - 2, '1900-01-01'))
AS datum_date_key
```

---

### Bug #3 — `fakt_stunden_v`: 25,328 Zeilen mit Jahr 1900

**Priorität:** 🟡 P2  
**Betroffen:** Projekt-Staging-Pipeline (wahrscheinlich `models/staging/ewb_proj_nsa_main.sql` o.ä.)  
**Symptom:** 12.5% der Stunden-Rows haben `perioden_date_key` in Jahr 1900 → -92,814K CHF Projektkosten falsch zeitlich zugeordnet

**Ursache:** Gleicher Excel-Seriennummer-Bug wie Bug #2, aber im Projekt-Staging.

**Diagnose-Query:**
```sql
SELECT TOP 10 fs.projekt_key, p.projekt_name, fs.perioden_date_key, fs.betrag
FROM mart_project.fakt_stunden_v fs
JOIN mart_project.dim_projekt_v p ON fs.projekt_key = p.projekt_key
WHERE fs.perioden_date_key < 19010101
ORDER BY ABS(fs.betrag) DESC;
```

**Fix:** Excel-Datum-Konvertierung im zugehörigen Staging-Modell prüfen und analog Bug #2 korrigieren.

---

### Bug #4 — `dim_projekt_v`: hauptgruppe_nr & gruppe_name = 100% NULL

**Priorität:** 🟡 P2  
**Betroffen:** `models/mart/project/dim_projekt_v.sql` + zugehöriges Satellite  
**Symptom:** 14,409 von 14,409 Projekten haben NULL für `hauptgruppe_nr`, `hauptgruppe_name` und `gruppe_name`

| Feld | NULL-Quote | Status |
|------|-----------|--------|
| hauptgruppe_nr | 100% | ❌ |
| hauptgruppe_name | 100% | ❌ |
| gruppe_name | 100% | ❌ |
| gruppe_nr | 0% | ✅ (INT-Werte vorhanden: 6000, 1090, 6, …) |

`gruppe_nr` hat Werte, aber der zugehörige Name fehlt vollständig → JOIN-Problem im dbt-Modell oder fehlendes Satellite.

**Diagnose-Query:**
```sql
-- Im Staging vorhanden?
SELECT TOP 5 hauptgruppe_nr, hauptgruppe_name, gruppe_nr, gruppe_name
FROM stg.ewb_proj_nsa_main;
```

---

### Bug #5 — `dim_konto_v`: 119 GuV-Konten ohne L2-Mapping

**Priorität:** 🟡 P2  
**Betroffen:** `masterdata/` Kontenplan, `models/mart/finance/dim_konto_v.sql`  
**Symptom:** 0.87% der Buchungen in 2023+2024 können nicht nach Konto-L2 gruppiert werden

| Konto-Prefix | NULL L2 | Erwarteter L2-Wert |
|-------------|---------|-------------------|
| 6xxxx | 101 | `6a`, `6b` oder `6c` |
| 3xxxx | 1 | `3 Ertrag` |
| 4xxxx | 2 | `4 Aufwand` |
| 8xxxx | 1 | `8 Ausserord.` |
| 9xxxx | 14 | — |
| 1xxxx/2xxxx | 182 | korrekt (Bilanzkonten) |

**Impact auf PBI:** Konto_L2-Filter in Finance001 (`3 `, `4 `, `6a` etc.) wird für diese Konten keine Werte liefern.

**Fix:** Kontenplan-Masterdata (`masterdata/kontenplan.csv` o.ä.) um die fehlenden 6xxxx-Zuordnungen ergänzen.

---

### Bug #6 — Gesamtergebnis Jan-Aug 2024 (abhängig von Bug #1)

**Priorität:** 🔴 P1 (abhängig von Bug #1-Fix)  
**Symptom:** Jan-Aug 2024 Ergebnis = **355K statt ~605K → -41.3%** (SAM='C' eingeschlossen)  
**Nach Bug #1-Fix:** 604K → ✅ -0.19%

---

### Bug #7 — Gesamtergebnis Jan-Aug 2026 (abhängig von Bug #1)

**Priorität:** 🔴 P1 (abhängig von Bug #1-Fix)  
**Symptom:** Jan-Aug 2026 Ergebnis = **2,393K statt ~2,947K → -18.8%** (SAM='C' eingeschlossen)  
**Nach Bug #1-Fix:** 2,964K → ✅ +0.57%

---

### Bug #8 — Gesamtergebnis 2024 (abhängig von Bug #1)

**Priorität:** 🔴 P1 (abhängig von Bug #1-Fix)  
**Symptom:** Gesamtergebnis 2024 = **769K statt ~1,017K → -24.3%** (SAM='C' eingeschlossen)  
**Nach Bug #1-Fix:** 1,018K → ✅ +0.05%

---

### Bug #9 — Konto L2 Vollständigkeit (GuV-Konten)

**Priorität:** 🟡 P2 (= Bug #5, Wiederholung in Ergebnistabelle)  
**Symptom:** Konto L2 Vollständigkeit = **65.4%** statt erwarteten >90%  
**Ursache:** Gleich wie Bug #5 — 119 GuV-Konten ohne L2-Mapping

---

## ⚠️ Warnings

| # | Beschreibung | Status |
|---|---|---|
| W1 | Konto L2: `x Hilfskonten` als 9. Gruppe vorhanden (Finance001 hat 8) — ggf. intentional | ⚠️ WARN |
| W2 | KST Bereichsnamen weichen von Erwartung ab: `Overhead` statt `Allgemein`, `IT` statt `ICT` — ggf. neue Nomenklatur | ⚠️ WARN |
| W3 | fakt_stunden Leistungsart-Coverage: 88.73% ohne (erwartet ~83%) — Trend überwachen | ⚠️ WARN |
| W4 | dim_kostenstelle: 6/145 KST ohne bereich_neu_name (4.1%) | ⚠️ WARN |

---

## Strukturelle Befunde (keine Bugs, aber relevant)

| Befund | Detail |
|--------|--------|
| `dim_date` als TABLE vorhanden | Zusätzlich `dim_date_v` als VIEW — beide aktiv |
| Deprecated Views ohne `_v`-Suffix | `dim_buchungsstatus`, `dim_konto`, `fakt_buchungen` etc. — Altlasten, können entfernt werden |
| SAM-Werte in fakt_buchungen | '', 'S', 'C' — Bedeutung und Filterlogik dokumentieren |
| 4x UNION-ALL Logik | Anzahl Zeilen im Mart = ~2× Structured-Tables (by design) ✅ |
| projekt_id Format | NVARCHAR mit Dezimal-Darstellung (z.B. `1000000.000000000000000000`) — JOIN-Kompatibilität mit PBI prüfen |

---

## Empfohlene Fix-Reihenfolge

| Prio | Bug | Datei | Impact |
|------|-----|-------|--------|
| 🔴 **P1** | Bug #1: SAM='C' Filter | `fakt_buchungen_v.sql` | 3 KPIs FAIL → PASS |
| 🔴 **P1** | Bug #2: Excel-Datum Budget | `fakt_budget_v.sql` | Budget/Forecast zeitlos |
| 🔴 **P1** | Bug #2: Excel-Datum Forecast | `fakt_forecast_v.sql` | Budget/Forecast zeitlos |
| 🟡 **P2** | Bug #3: Excel-Datum Stunden | Projekt-Staging | 12.5% Stunden falsch |
| 🟡 **P2** | Bug #4: Projekt Hierarchie NULL | `dim_projekt_v.sql` + Satellite | HauptgruppeNr fehlt |
| 🟡 **P2** | Bug #5: Konto L2 Mapping | `masterdata/` Kontenplan | 119 GuV-Konten ohne L2 |
| 🟢 **P3** | W2: KST Bereichsnamen prüfen | `dim_kostenstelle_v.sql` | Alignment mit Finance001 |

---

## Offene Fragen (Klärung erforderlich)

1. **SAM='C'**: Sollen diese Einträge grundsätzlich aus dem Reporting ausgeschlossen werden? Oder ist das ein PBI-seitiger Filter in Finance001 der im Mart repliziert werden muss?
2. **KST-Bereiche**: Sind `Overhead`, `IT`, `Kommunikationsnetze` etc. die offiziellen neuen Bereichsnamen — oder Abweichungen die korrigiert werden müssen?
3. **Synapse-Zugang**: Für direkten Structured-Tables vs. Mart Vergleich muss der Synapse SQL Endpoint in `profiles.yml` konfiguriert werden.

---

## Nächste Schritte

Nach Klärung der offenen Fragen (insbesondere SAM='C'):

```bash
# 1. Fixes in dev branch implementieren
# 2. dbt-deployer auf datavault-test deployen
dbt run --select mart_finance.fakt_buchungen_v mart_finance.fakt_budget_v mart_finance.fakt_forecast_v --target ewb-test

# 3. Re-Test der KPIs
dbt test --select mart_finance --target ewb-test

# 4. PBI CSM_Abacus_T gegen datavault-test verbinden und visuell prüfen
```
