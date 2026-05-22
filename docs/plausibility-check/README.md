# Plausibilitäts-Check: Structured-Tables (PBI) → datavault-test (dbt Mart)

**Erstellt:** 2026-05-22  
**Ziel:** Validieren, ob die Kennzahlen der aktuellen Power BI Finance/Projekt-Berichte  
aus dem dbt Mart Layer (`datavault-test`) reproduziert werden können.

---

## Ausgangslage

| Layer | Beschreibung | Zugriff |
|-------|-------------|---------|
| **Structured-Tables** (Quelle PBI) | Azure Synapse / ADLS Parquet Views — direkte Quelle der PBI-Berichte | Synapse SQL Endpoint |
| **Data Vault (datavault-test)** | dbt-transformierte Mart-Views auf Azure SQL | `sql-analytics-ewb-001.database.windows.net` |

Die PBI-Berichte lesen aktuell aus **Structured-Tables** (Synapse Views).  
Das Ziel ist, dieselben Werte via **Data Vault Mart** bereitzustellen.

---

## Semantische Modelle (PBI Fabric — Workspace "Finance")

| Modell | Komplexität | Tabellen | Measures | Beschreibung |
|--------|------------|----------|----------|-------------|
| **Finance001** | Hoch | 17 | 30 | Hauptbuch-ER, Budget, Forecast |
| **Projekt001** | Einfach | 1 (+ 3 Date) | 0 | Projektstammdaten-Liste |

---

## Domains

| Domain | PBI Modell | dbt Schema | Mart-Modelle |
|--------|-----------|------------|-------------|
| Finance | Finance001 | `mart_finance` | fakt_buchungen_v, dim_konto_v, dim_kostenstelle_v, fakt_budget_v, fakt_forecast_v, fakt_belege_v, dim_kreditor_v, dim_buchungsstatus_v |
| Projekt | Projekt001 | `mart_project` | dim_projekt_v, dim_person_v, dim_abteilung_v, dim_leistungsart_v, fakt_stunden_v |

---

## Agent-Verantwortlichkeiten

| Agent | Aufgabe | Datei |
|-------|---------|-------|
| `@db-monitor` | SQL-Validierungen gegen datavault-test, Zähler & Summen gegen PBI-Kontrollwerte | [agent-db-monitor.md](agent-db-monitor.md) |
| `@power-bi-modelling` | PBI Semantic Model validieren, Spalten-Mapping prüfen, CSM-DEV vs Finance001/Projekt001 | [agent-pbi-modelling.md](agent-pbi-modelling.md) |
| `@synapse-validator` | Structured-Tables Rohdaten mit Mart-Ergebnissen vergleichen | [agent-synapse-validator.md](agent-synapse-validator.md) |

---

## Kontrollwerte aus PBI-Berichten (Soll-Werte)

Diese Werte wurden direkt aus den laufenden PBI-Berichten entnommen (Screenshots 2026-05-22):

### Finance — Erfolgsrechnung

| Report | Konto-L2 | Jahr | Wert (CHF Tsd.) | Spalte |
|--------|----------|------|-----------------|--------|
| ER Budget 2025 | 3 Ertrag | 2023 Ist | **47,530** | Ist |
| ER Budget 2025 | 9x Ergebnis | 2023 Ist | **1,220** | Ist |
| ER Budget 2025 | 4x Brutttoergebnis | 2023 Ist | **23,851** | Ist |
| ER Budget 2025 | 3 Ertrag | 2024 Budget | 45,813 | Budget |
| ER Budget 2025 | 9x Ergebnis | 2025 Budget | 1,008 | Budget |
| ER Budget 2026 | 3 Ertrag | 2024 Ist | **43,445** | Ist |
| ER Budget 2026 | 9x Ergebnis | 2024 Ist | **1,017** | Ist |
| ER 2025 | 9x Ergebnis | Jan–Aug 2024 | **605** | Rechnung |
| ER 2026-1.82 | 9x Ergebnis | Jan–Aug 2026 | **2,947** | Rechnung |

### Projekt — Projektstammdaten

| Kennzahl | Erwartung |
|----------|-----------|
| Anzahl aktive Projekte (Inaktiv=FALSE) | Plausibel > 50 |
| Projekte mit Status "Aktiv" oder laufend | Mehrheit |
| Alle Projekte mit HauptgruppeNr | > 80% |

---

## Toleranz

| Typ | Toleranz |
|-----|----------|
| Betragssummen | ±1% (Rundung, FX) |
| Row-Counts | ±5% (Filterdifferenzen) |
| NULL-Quoten | < 10% bei Pflichtfeldern |

---

## Entscheidungskriterien

Nach dem Check wird für jedes Modell entschieden:

| Status | Bedeutung |
|--------|-----------|
| ✅ PASS | Wert aus datavault-test ≈ PBI-Wert (±Toleranz). Mart ist bereit für PBI-Anbindung. |
| ⚠️ WARN | Abweichung 1–10%. Ursache analysieren (Filter, Sign-Convention, NULL-Handling). |
| ❌ FAIL | Abweichung > 10% oder kritische Strukturlücke. Mart-Modell muss korrigiert werden. |
| ➕ MISSING | Tabelle/Spalte im Mart fehlt komplett. Neue dbt-Modelle notwendig. |

---

## Nächste Schritte nach dem Check

1. **db-monitor** → SQL-Validierungen ausführen, Ergebnisse in Tabellen eintragen
2. **power-bi-modelling** → CSM-DEV auf Finance001/Projekt001-Mapping prüfen
3. **synapse-validator** → Structured-Tables Rohdaten gegen dbt-Output vergleichen
4. **dbt-deployer** → Bei FAILs: Korrekturen deployen, Re-Test
5. **mart-architect** → Bei MISSING: fehlende dbt-Modelle erstellen
