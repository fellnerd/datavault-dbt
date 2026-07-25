# Tasks

## Active

- [ ] **Summary-Lines-Monatstabelle für Power BI Performance bauen** - dbt-Tabelle `mart_finance.fakt_pl_summary_monat`, ersetzt langsame DirectQuery-Berechnung der Calculation Group "Summary Lines"
  - Plan: `docs/ext-features/pbi-summary-lines-monatstabelle-plan.md`
  - Nächster Schritt: Vorjahr-Measure-Definition im CSM_Abacus-Modell prüfen (Zeitintelligenz vs. eigene Quelle)
  - Danach: Tabelle bauen (Szenarien Rechnung/Budget/Forecast, ab Jahr 2026), gegen Calculation-Group-Werte verifizieren

- [ ] **`dim_person_v` von Live-Parquet-Zugriff lösen (Satellite-Lücke M1 schließen)** - Power BI erhielt Fehler "External table ... not accessible" beim Laden von dim_person — Ursache: `dim_person_v` → `ewb_publ_adr_main` (Staging-View) → `stg.ext_ewb_publ_adr_main` (External Table auf rohe Parquet-Datei), alle 3 Ebenen nicht materialisiert → jede Power-BI-Abfrage liest live die Parquet-Datei aus ADLS, transient fehleranfällig (Datei-Lock bei gleichzeitigem Synapse-Ladejob)
  - Bereits dokumentierte Lücke: `docs/synapse-validation-report.md`, Gap **M1** — `sat_person_adresse__abacus` speichert nur NAME/VORNAME als Payload, nicht die Filter-Spalten `LOHNJN`/`GESPERRT`, die `dim_person_v` für den "aktive Mitarbeiter"-Filter braucht. Deshalb greift `dim_person_v` direkt auf die rohe Staging-View statt auf eine Satellite zu.
  - **Sauberer Fix (empfohlen, Vault-Änderung):**
    1. `sat_person_adresse__abacus` (models/raw_vault/_common/satellites/) um `LOHNJN`, `GESPERRT` als Payload-Spalten erweitern (neuer Hashdiff — historische Neuverarbeitung beachten)
    2. `dim_person_v.sql` `aktive_adressen`-CTE umbauen: Filter aus `sat_person_adresse__abacus_current_v` statt aus `ewb_publ_adr_main` lesen
    3. Damit entfällt die Live-Parquet-Abhängigkeit strukturell, nicht nur kaschiert
  - **Quick-Fix-Alternative (nur Übergang):** `ewb_publ_adr_main` als Tabelle materialisieren (wie bei `dim_konto`/`dim_konto_v` heute) — behebt das Symptom, friert aber den Workaround ein statt die Vault-Lücke zu schliessen
  - Siehe auch `docs/synapse-validation-report.md` Empfehlung #9 ("sat_person_adresse um LOHNJN, GESPERRT erweitern")

## Waiting On

## Someday

## Done
