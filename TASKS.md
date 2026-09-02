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

- [ ] 🐞 **ISE Absatzstatistik: Temp-Ordner darf nicht mitgeladen werden** (IMPORTANT)
  - Verifiziert 2026-08-26: An der Quelle existiert `ise-export/drive-d/absatzstatistik/**Temp/**` mit `ewb_PowerBI_Absatz_20260821105321.csv`. In `stage-fs/ewb/ise/absatzstatistik/` liegen aktuell 11 Dateien — die Temp-Datei ist **nicht** darunter, es ist also noch nichts passiert.
  - Risiko: Die Copy-Activity arbeitet (wie bei den Lastgängen) mit `recursive: true` + `wildcardFileName: *`. Sobald der Temp-Ordner beim Lauf gefüllt ist, landet sein Inhalt als zusätzlicher Snapshot in der Wildcard-External-Table und verfälscht alle Summen.
  - Fix: In der Copy-Activity `recursive: false` setzen oder `wildcardFolderPath` auf den Zielordner einschränken.


- [ ] **Quellenentscheid Absatzstatistik: CSV-Export durch relationale Anbindung ablösen** - Der Abgleich mit dem Innosolv-OLAP-Cube ist erbracht: die Measure Group „Fakten Rechnungsstatistik" enthält dieselben Daten. `Basis` stimmt **stellengenau** (2025: 13'481'541'571.30 auf beiden Seiten; 2026: 7'204'943'425.90), die Beträge weichen um 4.70 bzw. 1.50 CHF ab — verursacht durch defekte Zeilen **im Export**, nicht im Cube.
  - **Empfehlung:** `EWBPROD_dwh.DataMart_EVU.RechnungFakten` relational landen (3'399'415 Zeilen, Historie **ab 2021** statt ab 2025) über das bestehende `ISE_Prod`-Muster — analog zum Vorgehen bei den Zeitreihen. Der Cube bleibt Prüf-/Abstimminstrument, nicht Massenextrakt (MDX-Aggregate laufen in Sekunden, ein zeilenweiser Extrakt von >1 Mio Zeilen via `OPENQUERY` ist ungetestet).
  - Der Cube liefert zusätzlich: Subjekt (Kunde), Vertrag, Objekt, Messpunkt, Konto-Kostenart, Kostenstelle 1/2/3, FibuBelegDatum, Mandant, MwSt-Code, Steuersatz, Währung, Gebiet, Kundenbetreuer.
  - **Zwei Fragen an Innosolv** (Mailentwurf liegt vor, noch nicht versendet):
    1. ZEV-/EVG-Zuordnung (`zev_evg_nummer`/`_rolle`, 2.8 % der Positionen): Dimension `[Energiegemeinschaft]` existiert im Cube, ist aber **nicht** an die Rechnungsstatistik angebunden — kann das ergänzt werden?
    2. Feld `gruppe` (13 Sparten-Werte: Strom Energie/Netznutzung/Abgaben/Messkosten, Wasser, Abwasser …): keine entsprechende Cube-Dimension gefunden — wird es im Export berechnet, und nach welcher Regel?
  - Nicht als Lücke: `verrechnungstyp_messart`, `marktprodukt`, `verbrauchergruppe` liegen als **Member Properties** vor (auf `[Verrechnungstyp]`, `[Tarif]`, `[Abnehmerkategorie]`); `id_leistkat` ist die Tarif-ID (200 Werte, 1:1 mit `tarif`); `termin_semester` ist aus dem Quartal ableitbar.

- [ ] **Staging/Dedup für `ext_ise_absatzstatistik`** - Noch kein Staging-Modell vorhanden. Die Wildcard-External-Table liest **11 identische Vollsnapshots** (11'098'698 Zeilen = 11 × ~1'009'000) — der Export läuft zweimal täglich (03:00 und 05:00). Ohne Dedup sind **alle Summen um Faktor 11 zu hoch**.
  - Muster wie bei `ise_zeitreihe_dedup`: `DISTINCT` über die Fachspalten bzw. Auswahl des jüngsten Snapshots über den Export-Zeitstempel aus `dss_source_filename`.
  - Typisierung: alle Kennzahlen stehen als `NVARCHAR(4000)` in `sources.yml` → `TRY_CONVERT(decimal(19,4), …)`; Dezimaltrennzeichen `.`, kein Tausendertrennzeichen.
  - `statistikgruppe` ist in 100 % der Zeilen Leerstring → nicht ins Modell übernehmen.
  - ⚠ Entfällt vollständig, falls der Quellenentscheid auf die relationale Anbindung fällt — deshalb **erst nach** jenem Entscheid bauen.

- [ ] 🐞 **Datenqualität des Absatzstatistik-CSV-Exports** - Zwei Defekte der CSV→Parquet-Ingestion, die den Export als Quelle disqualifizieren:
  - **Umlaute irreversibel zerstört**: `Zählermiete` liegt als `Z�hlermiete` vor (Hex-Nachweis: echtes U+FFFD, kein Anzeigeproblem). Andere Tabellen derselben DB (`dim_konto.konto_name`) sind sauber.
  - **CSV-Quoting defekt**: 4'622 Zeilen (0.46 %) mit unmaskierten Anführungszeichen, z. B. `"Nat�rlich Rii-Seez Power"" Wasser/Solar Widnau"` → Spalten verrutschen. Das erklärt die 4.70/1.50 CHF Differenz zum Cube.
  - Beides tritt bei der relationalen Anbindung nicht auf → zusätzliches Argument für den Quellenentscheid oben.

- [ ] **Verschneidung Absatzstatistik ↔ Abacus/FiBu und ↔ i-SE-Lastdaten** - Ergebnis der Analyse (dv-monitor, 2026-08-26): Es gibt **keinen Schlüssel-Verknüpfungspunkt** zwischen der Absatzstatistik und irgendeinem bestehenden Hub. Die Datei enthält ausser den i-SE-internen Dimensions-IDs keine Identifikator-Spalte — kein Kunde, kein Vertrag, kein Zählpunkt, keine Rechnungsnummer. Scheinbare Treffer gegen `hub_kreditor` (185/199) und `dv.hub_internet_service` (199/199) sind nachweislich Nummernkreis-Zufall (Trefferquote = Dichte des Zielnummernkreises); gegen `hub_konto` und `vault_ise.hub_zeitreihe` gibt es **null** Treffer.
  - **Fachlich sind es aber dieselben Geschäftsvorfälle**: Sparte Wasser 2025 stimmt auf **119 CHF** (0.004 %) mit den Abacus-Ertragskonten 30200+30250 überein, Strom Messkosten 2026 auf **21 CHF** (0.006 %). MWST-Quoten in der Datei sind exakt 8.1 % / 2.6 % → `rechpos_betrag` ist netto und direkt vergleichbar.
  - **Der Wert dahinter:** Die Fakturierung erreicht Abacus nur als Monats-Sammelbuchung „Debitoren-Rechnungen" (30100: 147 Buchungen / 9.3 Mio; 30150: 198 / 9.1 Mio) — `kundennummer` = 0 in **100 %** der Fälle, keine Belegnummer. Die Absatzstatistik ist die Detailauflösung genau dieser Umsätze und schliesst damit eine echte Lücke im Finanzreporting.
  - **Umsetzung:** Seed/Ref-Tabelle `gruppe`/`vertragsart`/`bereichsebene` → (`konto_nr`, `kostenstelle_nr`), analog `ref_konto_v`. Kandidaten aus der Analyse: KST 3910/3920 → Strom Energie · 3940/3961 → Strom ZEV · 3970 → E-Mobilität · 3980 → Abwasser · 4910/4920 → Netznutzung · 4280/5280 → Messkosten · 5900 → Wasser.
  - ⚡ **Nachtrag 2026-08-26 — die relationale Quelle liefert genau diese fehlenden Schlüssel.** `DataMart_EVU.RechnungFakten` hat 61 Spalten (der CSV-Export nur 34) und trägt je Rechnungsposition:
    - **`HBKonto_ID`** → `DataMart_EVU.Konto_Kostenart.Kontonummer` = die **Abacus-Kontonummer**. Überlappung mit `vault.hub_konto`: **144 von 153 (94.1 %)**. Signifikanz geprüft: `hub_konto` belegt 534 Werte im Bereich 10000…99981, also 0.59 % Dichte — bei Zufall wäre ~1 Treffer zu erwarten, beobachtet sind 144. **Echter Schlüssel, kein Nummernkreis-Zufall.** Die 9 Ausreisser (30155, 66090…66120) sind neuere Konten, die im Vault-Ladeumfang fehlen.
    - `Kostenstelle1/2/3_HBKonto_ID`, `Geschaeftsbereich_HBKonto_ID`, `FIBU_Belegdatum_ID` → die Kostenstellen-Zuordnung wird zum Datenfeld statt zur gepflegten Mapping-Tabelle.
    - **`MeteringCode_ID`** → derselbe Schlüssel wie `Techanl.ZEITREIHE.ReferenzID` bei `ReferenzTyp = 19`. Überlappung: **10'727 von 12'988 Messpunkten (82.6 %)** haben eine Zeitreihe → **direkter Join Absatzstatistik ↔ Lastgänge über den Messpunkt**. Im heutigen Vault-Umfang (41 Serien der Gruppe 150, davon 3 messpunktbezogen) treffen 88 Rechnungspositionen; der Join skaliert mit weiteren Zeitreihegruppen.
    - `Vertrag_ID` (56'724), `Subjekt_ID` (15'492), `Objekt_ID`, `Vertragspartner_ID` → Grundlage für Energiekunden-/Vertrags-Hubs, die es heute nicht gibt (`hub_kunde`/`hub_vertrag` stammen aus Compax/Telecom, nicht aus der Energieabrechnung).
    - Betragsabgleich 2025 auf Kontoebene: Konto 30150 „Ertrag Strom-Netznutzung" — RechnungFakten 6'006'588.17 vs. Abacus 6'006'872.03 (Δ 284 CHF = 0.005 %).
  - **Konsequenz:** Die Mapping-Tabelle wird nur gebraucht, falls der CSV-Export die Quelle bleibt. Bei der relationalen Anbindung entfällt sie — dann sind `link_rechnungsposition_konto` und `link_rechnungsposition_messpunkt` echte Vault-Links auf vorhandenen Schlüsseln. **Das ist das stärkste Argument für den Quellenentscheid oben.**
  - Nicht vergleichbar: `gruppe = 'Strom Abgaben'` (2025: 2'099'545.13) — Netzzuschlag/KEV läuft über Bilanzkonten, `fakt_buchungen` deckt nur die Erfolgsrechnung (30100…85010) ab.

- [ ] **Innosolv fragen: Lieferantenserien fehlen komplett im DataMart** - Die zehn lieferantenreferenzierten Zeitreihen der Gruppe 150 (`150812`, `150814`–`150816`, `150823`–`150825`, `150828`–`150830`; `ReferenzTyp = 172`, `ReferenzID` 16 Primeo / 54 EPAG / 56 Alpiq) fehlen **vollständig** in `EWBPROD_dwh.DataMart_EVU` — verifiziert 2026-08-30 gegen `ZeitreihenData`, `VR_ZeitreihenFakten` und `VR_Zeitreihe`: **0 Treffer in allen drei**.
  - **Es fehlen nicht einzelne Serien, sondern die ganze Kategorie:** Die Serientypen 9 (Gesamtlieferung LF lokal), 10 (Gesamtrücklieferung LF lokal), 48 (Saldo) und 49 (Lastgang gemessen) haben **null Instanzen im gesamten DataMart**. Einzige „Gesamtlieferung"-Serie dort ist Typ 10037 `Gesamtlieferung fremde Lieferanten` (= 185779, `Auswertungen`-referenziert).
  - **Gegenbeleg für die Anfrage:** In `EWBPROD.Techanl.ZEITREIHE` sind alle zehn aktiv (`GueltigBis` NULL); `ZEITREIHEINFO` weist Werte von **01.01.2025 bis 28.08.2026** aus. Die Daten existieren im Quellsystem. (`LueckeAnzahl` ist dort NULL statt 0 — bei der Anfrage miterwähnen, nicht als „lückenlos" verkaufen.)
  - **Nicht rekonstruierbar:** Alpiq/EPAG/Primeo erscheinen im DWH als `Energielieferant_Marktpartner_ID` auf ~14'000 Messpunkt-Serien, aber die Summen passen nicht (Primeo 1'886'542 statt 1'434'539; EPAG 1'345'356 statt 1'045'282). Ein Nachbau bräuchte Innosolvs Formel-Engine.
  - **Auswirkung:** Die **ENERGIE-Bilanz** benötigt sechs dieser zehn Serien (Grundversorgung, 2× B2B, 3× Marktbeschaffung) und ist damit **nicht** über das DWH baubar — sie hängt am ¼h-Backfill (X-2). Die **NETZ-Bilanz** ist nicht betroffen: alle 9 Serien im DWH, 2024/03–2026/08 lückenlos.
  - Belege & Abfragen: `docs/ise-dwh-pruefabfragen.md`

- [ ] **i-SE: restliche Explorationswege prüfen (abgebrochen 2026-08-30)** - Die Suche wurde nach drei Activity-Timeouts abgebrochen. Ungeprüft geblieben:
  - `EWBPROD_dms` — einzige nicht durchsuchte Nutzdatenbank der Instanz (Abfrage lief 311 s ins Timeout; braucht eine schlankere Formulierung)
  - **Formel-Engine** `Techanl.ZEITREIHEFORMEL` / `ZEITREIHEFORMELPARAMETER` / `ZEITREIHEFORMELSQL` — zeigt, **wie** die zehn Serien berechnet werden und aus welchen Komponenten. Potenziell der Weg, sie doch zu rekonstruieren.
  - **Export-Konfiguration** `Techanl.ZEITREIHENAUSTAUSCHEXPORT` / `…EXPORTKONFIG` (21 bzw. 24 Spalten) — beantwortet vermutlich **X-1** (wer erstellt `ewb_PowerBI_LG_*.csv`, mit welchem Job/Zeitplan, welcher Scope).
  - **Cube via MDX** (`Cube_Explore_TEST` → `usp_QueryCube`) — die Dimension `[Zeitreihe]` hat 19'206 Members; prüfen, ob 150812 & Co. dort existieren, obwohl sie im DWH-Fakt fehlen.
  - ⚠ **Vor der Fortsetzung:** nicht nachts, nicht parallel, und ein Zeitfenster mit EWB abstimmen. Die Timeouts traten unmittelbar nach einer breiten `INFORMATION_SCHEMA`-Abfrage auf `EWBPROD_dms` auf (01:50 Uhr) — ein Zusammenhang ist wahrscheinlich.

## Waiting On

## Someday

## Done

- [x] **Information Mart für die i-SE-Energiedaten** (2026-08-17) - `mart_ise` mit `dim_zeitreihe_v`, `fakt_lastgang(_v)` und `fakt_lastgang_monat(_v)` gebaut und verifiziert. Die Intervall-ENDE-Konvention wird im Mart über `intervall_start` aufgelöst; Monatssummen treffen die Innosolv-Cube-Werte stellengenau. Offen bleibt nur die Aggregationsebene für Power BI (hängt am Fachbereichsbedarf, G-3).
