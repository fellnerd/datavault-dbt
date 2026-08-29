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

- [ ] **Delta-Load-Strategie für i-SE-Lastgänge (`ext_ise_lastgaenge` → Vault)** - Der werktägliche i-SE-Export liefert ein rollierendes 5-Tage-Fenster; die Wildcard-External-Table liest alle Dateien. Aktuell: 279'456 Rohzeilen auf 169'248 eindeutige (Serie, Zeitpunkt)-Paare, davon **6'267 Paare mit mehr als einem Wert** — dieselbe ¼-Stunde kommt mit revidiertem Messwert erneut (Ersatz- → validierter Wert). Ein reines Anhängen würde doppelt zählen.
  - Ausgangslage & Messungen: `docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md` §12.7 / §12.12
  - Zu entscheiden: (a) Wie wird die Revision fachlich behandelt — jüngster Export gewinnt, oder jede Version als eigene Satellitenversion historisieren? (b) Wo wird abgeschnitten — HWM auf `dss_stage_timestamp`/`dss_export_datum` oder auf `messzeitpunkt`? (c) Braucht es eine PSA (`psa_ise_lastgang`) wie bei CDR, damit die External Table nicht bei jedem Lauf vollständig gelesen wird?
  - Rahmen: ~3.2 Mio ¼-h-Werte bei voller Historie der Gruppe 150 (Volumen unkritisch), aktuell 169k Zeilen
  - Vorläufig implementiert in `ise_lastgang_dedup`: „jüngster Export gewinnt" über den Export-Zeitstempel aus `dss_source_filename` — bewusst als Interim, ersetzt keinen Delta-Load-Entscheid

- [ ] **Dimensions-Snapshot-Strategie für i-SE-Zeitreihen-Stammdaten (`ext_ise_stammdaten`)** - Der Export legt werktäglich einen vollständigen Snapshot der Zeitreihegruppe 150 ab (bisher 10 identische Dateien → 410 Zeilen für 41 Serien). `ise_zeitreihe_dedup` reduziert per `DISTINCT` auf 41 Zeilen.
  - Offen: Sobald sich ein Stammdatenattribut ändert (z. B. `GueltigBis` wird gesetzt), liefert `DISTINCT` zwei Zeilen je `ID_Zeitreihe` und der Unique-Test auf `hk_zeitreihe` schlägt an. Dann muss entschieden werden, ob der Snapshot als SCD2 im Satelliten historisiert wird (Load Date = `dss_stage_timestamp`) oder auf den aktuellsten Stand reduziert bleibt.
  - Voraussetzung: `dss_stage_timestamp` in `ext_ise_stammdaten` befüllt (in `sources.yml` deklariert — ADF-seitige Umsetzung prüfen)
  - Bezug: `docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md` §12.11 / §12.12

- [ ] **i-SE-Lastgang-Ladekette orchestrieren (ADF)** - Die ¼-h-Anbindung läuft aktuell nur manuell: `CopyPipeline_Lastgaenge` hat **keinen Trigger** und ist **nicht** Teil von `Master_ewb_load` (das enthält nur `Copy_LandingZone_to_LoadFS_ewb` → `Copy_Stage_ewb` → Status-Logging). Die vorhandenen Trigger `dailyTrigger_landingzone_ISE` (→ `ISE_Prod_bulk_daily`, relationale i-SE-Extraktion) und `dailyTrigger_Master_ewb_load_prod` sind beide auf **Stopped**.
  - Zu klären: `CopyPipeline_Lastgaenge` in `Master_ewb_load` einhängen oder eigenen Trigger? Zeitfenster nach dem i-SE-Export (~08:45) und vor dem dbt-Lauf.
  - Die dbt-Seite ist bereits abgedeckt: `raw_vault/ise` trägt `+tags: [ise]`, der reguläre `dbt run` in `.gitlab-ci.yml` nimmt die Modelle ohne Zusatzkonfiguration mit.
  - Bezug: `docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md` §12.14

- [ ] **Bilanz-Seed + Materialisierung für `dim_zeitreihe` (i-SE)** - Ohne Klassifizierungsattribute lässt sich die Zebra-BI-Bilanztabelle auf Seite 1 des ISE-Berichts nicht bauen: Zebra braucht je Zeile eine Sortierposition und ein „Category Class"-Zeichen (`=` Result, `-` Invert, `/` Skip). `dim_zeitreihe` kennt heute nur Typ/Referenz/Einheit. Muster ist 1:1 die Erfolgsrechnung (`seeds/seed_konto_pl_stufen.csv`, `models/business_vault/konto_pl_stufen_v.sql`, negative Plug-Keys).
  - **5a Seed** — CSV mit 41 Zeilen je `zeitreihe_id`: `serien_kategorie`, `flussrichtung`, `netzebene`, `bilanz_position`, `bilanz_zeilentyp`, `bilanz_sort`; Business-Vault-View darauf.
  - **5b Plug-Zeilen** — 2 Dimensionszeilen für die Zwischensummen `= Gesamteinspeisung Netz` und `= Bruttolastgangsumme BLS/EN` (keine echten Serien, negative Keys analog `-41`/`-51`). Grain von `dim_zeitreihe` wächst 41 → 43; Tests (`unique`/`not_null` auf `zeitreihe_key`, `relationships` von den Fakten) vor dem Commit prüfen — die Fakten referenzieren weiterhin nur die 41 echten Serien.
  - **5c Materialisierung** — `dim_zeitreihe_v` ist eine View mit 4 Joins (zwei davon auf `*_current_v` über SCD2-Satelliten) und wird bei jeder DirectQuery-Abfrage neu gerechnet; mit Seed-Join und UNION wird sie schwerer. Aufteilen in `dim_zeitreihe` (table) + dünne Wrapper-View, wie `fakt_lastgang`/`fakt_lastgang_v` und laut `docs/LESSONS_LEARNED.md` §1.
  - **Wer liefert was:** Die 16 Netzbilanz-Serien folgen zwingend aus den gegen die Daten verifizierten Bilanzgleichungen A1/A3/A4/A6 (Plan §3) — **keine fachliche Freigabe nötig**, liefern wir. Lieferant (10) und Messpunkt (3) sind eindeutig. **Offen für den Fachbereich:** nur die 12 PV-/Wasser-Serien (`Auswertungen`) — dort gibt es Nahduplikate (`PV KEV Rücklieferung` vs. `EWB PV KEV Rücklieferung`), die überschneidungsfreie Teilmenge ist unklar. Diese Serien kommen in der Bilanztabelle **nicht** vor, blockieren also nur die PV/Wasser-Aufschlüsselung auf Seite 3.
  - Blockiert: Seite 1 des ISE-Berichts und das Measure `Bilanz Zeilentyp` (Ordner `06 Zebra-Steuerung`). Seite 2 ist unabhängig davon startklar.
  - Plan: `docs/power-bi/ise-lastgang-report-plan.md` §2.5 / §6 (Schritt 5)

- [ ] **Information Mart für die i-SE-Energiedaten** - Auf `vault_ise` existiert noch kein konsumierbarer Layer. Benötigt: Faktentabelle auf `sat_lastgang_tl__ise_current_v` (materialisiert, **nicht** als View — `ROW_NUMBER` über die volle Historie ist für DirectQuery zu teuer) plus Dimension aus `sat_zeitreihe__ise_current_v`.
  - Monatsabgrenzung zwingend `> Monatsanfang AND <= Folgemonatsanfang` (Intervall-ENDE-Konvention), sonst weichen die Summen von den Innosolv-Cube-Werten ab.
  - Offen: Aggregationsebene für Power BI (¼h, Stunde, Tag?) — hängt am Bedarf des Fachbereichs (G-3).

## Waiting On

## Someday

## Done
