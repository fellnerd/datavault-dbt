# EDM / i-SE OLAP-Cube — Anbindung Energiedaten (Innosolv)

**Datum:** 6. Juli 2026  
**Von:** PPMC AG — Analytics Team (Daniel)  
**An:** EWB — Roger (Anfrage), Christian Vetsch (System Engineer)  
**Betreff:** Machbarkeit & Vorgehen zur Anbindung der Energiedaten (i-SE / OLAP-Cube)  
**Status:** 🟢 Exploration abgeschlossen (Update 2026-07-09, §10) — Cube live abfragbar, Quelltabellen lokalisiert; Strategieentscheid & Innosolv-Detailfrage (¼-h-Werte) offen  
**Referenz:** [`docs/projektdokumentation.md` §0.7 + §0.7.1](../projektdokumentation.md)

---

## 1. Zusammenfassung

EWB (Bereich Energie) möchte die Daten aus dem **Energiedaten-Management (EDM)** anbinden. Quellsystem ist **i-SE der Firma Innosolv**; das **Zeitreihenmodul** ist seit Ende 2025 verfügbar. Die Auswertung erfolgt heute über einen von Innosolv betriebenen **OLAP-Cube**.

**Kurzfazit der Machbarkeitsprüfung (live in Azure `sub-ewbuchs-prd-01` verifiziert):**

- Die **relationalen i-SE-Daten sind bereits produktiv angebunden** (DB `EWBPROD`, Schemas Basis/Faktura/Objekt) — inkl. gelöster Windows-/AD-Authentifizierung über die bestehende Self-hosted Integration Runtime. Die **Login-/AD-Hürde von 2023 ist für den relationalen Weg damit gelöst.**
- Der **OLAP-Cube ist nicht angebunden.** Er ist ein **On-Premise SSAS Multidimensional** und hat **keinen nativen Connector in Azure Data Factory**.
- Die **hochauflösenden Zeitreihen sind aktuell nirgends in Azure gelandet** — sie liegen relational in `EWBPROD`, sind aber nicht Teil der heutigen Extraktion.
- Der von Innosolv genannte **On-premises Data Gateway** ist ein **Power-BI-Weg** (Live-Zugriff auf den Cube) und **umgeht die Data-Vault-Plattform** — geeignet als Quick Win, nicht als Integration.

**Empfehlung:** Die Zeitreihen **relational landen** (Weg B) und in der Plattform integrieren, statt den Cube anzubinden (Weg A). Ein gemeinsamer Termin mit Christian Vetsch dient dem Strategieentscheid.

> ⚡ **Update 2026-07-09 (§10):** Der Cube ist inzwischen via SQL Linked Server **live abfragbar** (Weg C), die Cube-Quelltabellen wurden in `EWBPROD_dwh` **lokalisiert** und die meisten Abstimmungsfragen sind durch eigene Exploration **beantwortet**. Die Empfehlung konkretisiert sich: **Weg B aus `EWBPROD_dwh` (DataMart-Layer) landen** — Innosolvs Aufbereitungslogik ist dort bereits materialisiert. Details und verbleibende Fragen in §10.

---

## 2. Ausgangslage

| Punkt | Detail |
|---|---|
| Quellsystem | i-SE (Innosolv), Energiedaten-Management (EDM) |
| Neues Modul | Zeitreihenmodul, verfügbar seit Ende 2025 |
| Auswertung heute | OLAP-Cube (On-Prem SSAS Multidimensional), Innosolv-betrieben |
| Historie | Cube-Anbindung 2023 an unterschiedlichen Login-/AD-Anforderungen gescheitert |
| Innosolv-Rückmeldung (Juli 2026) | Für Power-BI-Zugriff aus der Cloud auf den On-Prem-Cube ist ein **On-premises Data Gateway** nötig; Konfiguration liegt ausserhalb Innosolv-Zuständigkeit |
| Auftrag aktuell | Machbarkeit klären, **noch keine** vertiefte Detailabklärung; Innosolv-Kontakt läuft parallel |

---

## 3. Ist-Zustand (in Azure verifiziert)

| Komponente | Befund | Status |
|---|---|---|
| Relationale i-SE-Daten | **Eine DB `EWBPROD`** (`EWBSDB01\ISE`), Schemas `Basis`/`Faktura`/`Objekt`, **597 Tabellen**, in Landing Zone als Parquet | ✅ Produktiv gelandet |
| Extraktions-Pipeline | ADF `ISE_Prod_bulk_daily` — kopiert eine **fest kodierte Tabellen-Allowlist** (`createArray`) täglich | ✅ Aktiv |
| Linked Service | `ISE_Prod` (SqlServer, DB `EWBPROD`, **Windows-Auth** `INTRA\srv-analytics`, Secret in `analytics_keyvault001`) | ✅ AD/Login gelöst |
| Integration Runtime | Self-hosted `integrationruntime001` (Host EWBSBI01) | ✅ Aktiv |
| OLAP-Cube | On-Prem **SSAS Multidimensional** (Innosolv), **nicht** in Azure | ⬜ Nicht angebunden |
| Zeitreihen/Messwerte | In **keiner** der 597 gelandeten Tabellen (kein Zählpunkt/Zählwerk/Messwert/Lastgang); nur abrechnungsnaher `Faktura.VERBRAUCH` | ⬜ Nicht gelandet |
| Azure Analysis Services | `analysisservices001` (B1, **Paused**) | ℹ️ Separate/Legacy-Instanz — **nicht** der Innosolv-Cube |

### Wo liegen die Zeitreihen konkret?

- **OLAP-Cube:** aggregierter Auswerte-Layer auf einem **On-Prem-SSAS-Server** bei EWB (Innosolv-verwaltet) — kein primärer Datenspeicher, nicht in Azure.
- **Zeitreihen-Rohdaten:** liegen relational in der i-SE-DB **`EWBPROD`** (ein SSAS-Cube wird immer aus relationalen Quelltabellen gespeist). Sie sind aktuell **nicht auf der Extraktions-Allowlist** der Pipeline und daher nicht in Azure.
- **Einschränkung:** `EWBPROD` liegt on-prem hinter der SHIR und ist **von aussen nicht einsehbar** — die exakten Tabellen/das Schema des Zeitreihenmoduls sind erst nach Auskunft von Innosolv (oder einem gezielten Lookup) benennbar.

---

## 4. Technische Einordnung

### 4.1 Kein nativer OLAP-Connector in ADF
Azure Data Factory besitzt **keinen** Connector für OLAP-/SSAS-Cubes (weder Multidimensional noch Tabular). Eine direkte Cube-Extraktion wäre nur über Eigenbau-Wege möglich (Custom Activity / Azure Function mit MDX, ODBC-OLAP-Treiber, SSIS oder SQL-Linked-Server + OPENQUERY).

### 4.2 On-premises Data Gateway ≠ Integration Runtime
Der von Innosolv genannte **On-premises Data Gateway** ist **nicht** dasselbe wie unsere ADF-Integration-Runtime:

| | On-premises Data Gateway | Self-hosted Integration Runtime (bereits vorhanden) |
|---|---|---|
| Zweck | **Live-Abfrage** Power BI (Cloud) → On-Prem-Cube | **Datenbewegung/ETL** (ADF Copy) On-Prem → Cloud |
| SSAS Multidim. Live | ✅ Unterstützt & erforderlich | ❌ Nicht dafür vorgesehen |
| Ergebnis | Reporting auf dem Cube — **keine** Landung im Data Vault | Daten landen als Parquet → Vault → Mart |

→ Der Gateway-Weg liefert **Reporting auf dem Cube**, integriert die Daten aber **nicht** in die Plattform.

---

## 5. Zwei Strategien

| | **A) Power BI + On-premises Data Gateway** | **B) Relationale Landung (empfohlen)** |
|---|---|---|
| Prinzip | Power BI verbindet sich live via Gateway auf den On-Prem-Cube | Zeitreihen-Tabellen aus `EWBPROD` relational landen wie Basis/Faktura/Objekt → Vault → Mart |
| Data-Vault-Integration | ❌ Umgeht die Plattform (reines Live-Reporting) | ✅ Historisiert, integriert, quell-übergreifend |
| Connector / Auth | Zusätzlicher Gateway + Kerberos/SSO nötig | Bestehendes `ISE_Prod`-Muster (SHIR + Windows-Auth) wiederverwenden |
| Cube-/Auswertungslogik | 1:1 von Innosolv übernommen | Muss verstanden/nachgebaut werden (teils in `Basis_Aufbereitung*` vorhanden) |
| Aufwand | Gering (Infrastruktur/Gateway) | Mittel (Extraktion erweitern + Modellierung) |
| Abhängigkeit | Live-Verfügbarkeit On-Prem-Cube | Täglicher Batch, entkoppelt |
| Charakter | **Quick Win** für Reporting | **Strategisch**, architekturkonform (DV2.1) |

**Beides schliesst sich nicht aus:** A kann als Interim für schnelles Reporting dienen, während B die strategische Integration liefert.

---

## 6. Empfehlung

**Weg B — relationale Landung.** Die i-SE-Anbindung inkl. AD/Windows-Auth läuft bereits produktiv; die Zeitreihen liegen mit hoher Wahrscheinlichkeit relational in `EWBPROD` und lassen sich über die **bestehende, bewährte Pipeline** anbinden (relevante Tabellen auf die Allowlist setzen). Damit sind **weder Cube-Anbindung noch Gateway** für die Daten nötig, und die EDM-Daten werden historisiert und mit den übrigen EWB-Quellen integriert. Voraussetzung ist die Bestätigung, in welchen Tabellen/welchem Schema das Zeitreihenmodul die Daten hält.

---

## 7. Abzustimmende Punkte

### 7.1 Mit Innosolv (Kontakt läuft)

| # | Frage | Warum wichtig | Status |
|---|---|---|---|
| I-1 | In welcher i-SE-**Datenbank / welchem Schema** liegen die Zeitreihen-/Messwerte des Zeitreihenmoduls? (`EWBPROD`-Schema oder separate DB?) | Entscheidet, ob relationale Landung (Weg B) direkt möglich ist | ⬜ Offen |
| I-2 | **Granularität & Volumen** der Zeitreihen (Intervall ¼-h/h/Tag, Anzahl Zählpunkte, Historientiefe) | Dimensioniert Landung, Speicher & Ladefrequenz | ⬜ Offen |
| I-3 | Welche **Kennzahlen / Dimensionen / Berechnungslogik** enthält der Cube, die über die Rohtabellen hinausgehen? | Bestimmt Nachbau-Aufwand bei Weg B | ⬜ Offen |
| I-4 | Cube-Typ = **Multidimensional** bestätigt? Wie/wann wird der Cube prozessiert? | Bestätigt Einordnung; relevant für Aktualität | 🟡 Multidim. gemeldet, Details offen |

### 7.2 Mit EWB — Christian Vetsch (Infrastruktur / System Engineering)

| # | Punkt | Warum wichtig | Status |
|---|---|---|---|
| E-1 | Bei **Weg A**: On-premises Data Gateway bereitstellen (Windows-Server, ggf. Cluster/HA, Firewall zum SSAS, Kerberos/SSO) | Voraussetzung für Power-BI-Live-Zugriff auf den Cube | ⬜ Offen |
| E-2 | **AD-/Berechtigungskontext** für den Cube-Zugriff (das Thema von 2023): welches Konto / welche Delegation | Historischer Blocker; klärt Auth für Gateway | ⬜ Offen |
| E-3 | Bei **Weg B**: reicht das bestehende Dienstkonto `INTRA\srv-analytics` für **Lesezugriff auf die Zeitreihen-Tabellen** in `EWBPROD`? | Ermöglicht Wiederverwendung der vorhandenen Pipeline | ⬜ Offen |
| E-4 | **Host/Servername** des On-Prem-SSAS-Cubes | Netzwerk-/Einordnung, Gateway-Platzierung | ⬜ Offen |

### 7.3 Intern / Gemeinsamer Entscheid (PPMC + EWB)

| # | Punkt | Warum wichtig | Status |
|---|---|---|---|
| G-1 | **Strategieentscheid**: Weg A (Quick Win), Weg B (Integration) oder A als Interim + B strategisch | Bestimmt das gesamte weitere Vorgehen | ⬜ Meeting |
| G-2 | **Scope & Priorität**: EDM als Teil des aktuellen DV-Scopes/einer Phase oder separates Arbeitspaket? | Planung, Ressourcen, Bezug zu §0.7 | ⬜ Meeting |
| G-3 | **Reporting-Anforderungen** des Bereichs Energie (welche Auswertungen konkret?) | Klärt, ob die Cube-Logik 1:1 benötigt wird | ⬜ Meeting |

---

## 8. Offene Fragen & Risiken

- **Einsicht:** `EWBPROD` ist on-prem hinter der SHIR — exakte Zeitreihen-Tabellen erst nach Innosolv-Auskunft oder gezieltem Lookup bestimmbar (I-1).
- **Volumen:** Hochauflösende Zeitreihen können gross werden → Azure-SQL-Ziel, Incremental-Strategie und Tier-Limits (`as_columnstore=false`) prüfen.
- **Nachbau (Weg B):** Enthält der Cube proprietäre Innosolv-Berechnungen, entsteht Aufwand, diese im Vault/Mart nachzubilden (I-3).
- **Abhängigkeit (Weg A):** Live-Reporting hängt an der Verfügbarkeit des On-Prem-Cubes; keine Historisierung, keine Integration mit anderen Quellen.

---

## 9. Nächste Schritte

| Schritt | Wer | Status |
|---|---|---|
| Termin mit Christian Vetsch (Strategieentscheid A/B) — 2–3 Vorschläge gesendet | PPMC + EWB | ⬜ Terminvorschläge versendet |
| Zeitreihen-Speicherort in `EWBPROD` klären (I-1) | EWB / Innosolv | ⬜ Offen |
| Granularität & Volumen erheben (I-2) | Innosolv | ⬜ Offen |
| Bei Weg B: Zeitreihen-Tabellen zu `ISE_Prod`-Extraktion ergänzen → Staging → Vault | PPMC Analytics | ⬜ Nach Klärung I-1/E-3 |
| Bei Weg A: On-premises Data Gateway einrichten + erste Tests | EWB (Christian Vetsch) | ⬜ Nach Entscheid G-1 |

---

### Terminvorschläge (Meeting mit Christian Vetsch, je ca. 1 Std.)

- Donnerstag, 09.07.2026, 10:00–11:00 Uhr
- Dienstag, 14.07.2026, 14:00–15:00 Uhr
- Mittwoch, 15.07.2026, 09:00–10:00 Uhr

> Terminvorschläge vor Versand gegen den eigenen Kalender prüfen.

---

## 10. Update 2026-07-09 — Cube-Durchstich & explorative Untersuchung

Der Cube ist seit heute über einen **SQL Linked Server** (`ISAG_CUBE`, MSOLAP) auf `EWBSDB01\ISE` per MDX abfragbar — gekapselt in `Schnittstelle.dbo.usp_QueryCube` und via bestehendem ADF-Muster (`ISE_Prod`-Linked-Service + SHIR) end-to-end verifiziert. Technische Details: [`projektdokumentation.md` §0.7.1](../projektdokumentation.md). Auf dieser Basis wurde der Cube und sein relationales Umfeld **explorativ untersucht** (via isolierte ADF-Test-Pipelines `Claude_Cube_Explore_TEST` / `Claude_SQL_Explore_TEST`). Ergebnisse:

### 10.1 Was der Cube enthält (SSAS-DB `ISAG`, Cube `ISAG`)

| Aspekt | Befund |
|---|---|
| Prozessierung | **Täglich nachts** (letzter Lauf: 2026-07-08 22:55) — Daten sind tagesaktuell |
| Measure Groups | 12 — u. a. Rechnungsstatistik (Beträge inkl./exkl. MwSt), Basis Helper (Verbrauch kWh/m³, Blindstrom, Leistungsspitzen), Vertragsbestand, Messpunktbestand, Gerät, Endverbraucher ElCom, **Fakten Zeitreihen** |
| Dimensionen | 94 (inkl. Role-Playing) — u. a. Vertrag (161k), Subjekt (54k), Objekt (72k), Gerät (36k), Messpunkt (22k, mit Bezügeranlage/Vertragspartner), Tarif, Netzbetreiber, Energielieferant, Bilanzgruppe, Energiegemeinschaft |
| Zeit-Dimensionen | `Zeit` (31 Jahre, Tag-Ebene, inkl. **Hydro-Jahr/Quartal/Monat**-Hierarchien), `ZeitMessen` (Kalender bis Tag-Ebene) |
| **Fakten Zeitreihen** | 14 Dimensionen (Zeitreihe, ZeitMessen, Messpunkt, Netzbetreiber, Energielieferant, Bilanzgruppe, Energiegemeinschaft, …); Measures `Summe`/`Maximum`/`Minimum` |
| Zeitreihen-Inhalt | **18'647 Serien in 82 aktiven Typen**: Lastgang-Summen (BLS), PV-/Rücklieferung, Netzebenen NE5/NE6/NE7, Energiegemeinschaften (EG/LEG), Netzverluste, OSTRAL, virtueller Kundenpool, EV/VNB |
| Zeitreihen-Historie | **2024–2026** (Daten ab 2024/03) |
| Zeitreihen-Granularität | **Monat** (Quelle ist monatlich; s. 10.2) — keine ¼-h- oder Tageswerte im Cube |

### 10.2 Wo die Daten relational liegen (Kernbefund)

Der Cube wird aus der **DWH-Datenbank `EWBPROD_dwh`** gespeist (Schema `DataMart_EVU`, 120 Tabellen/Views — Innosolvs aufbereiteter DataMart-Layer):

| Objekt | Inhalt | Volumen |
|---|---|---|
| `DataMart_EVU.ZeitreihenData` | **Zeitreihen-Fakten**: `ID_Zeitreihe`, `Month_ID` (Monat!), `Summe`, `Minimum`, `Maximum` | 486k Zeilen, 18'728 Serien, 2024/03–2026/07 |
| `DataMart_EVU.VR_Zeitreihe` / `VR_ZeitreihenFakten` | Views für Cube-Dimension/-Fakten | — |
| `DataMart_EVU.MesspunktData`, `VertragsbestandData`, `FactGeraet`, `BasisHelperData`, … | Übrige Cube-Quellen (Dimensionen + Fakten) | 0.5–3.3M Zeilen |

Die **Rohdaten des Zeitreihenmoduls** liegen in `EWBPROD`, Schema **`Techanl`** (nicht auf der heutigen Extraktions-Allowlist): `ZEITREIHE` (198k Serien-Stammdaten inkl. OBIS-Kennung), `ZEITREIHETYP` (274), `MESSWERT` (2.9M — klassische Zählerablesungen), `ZEITREIHEINFO` (Werte-Zeitraum/Lücken je Serie) sowie die **Formel-Engine** (`ZEITREIHEFORMEL*` — Innosolvs Berechnungslogik).

**Verifiziert per Direktabfrage von `Techanl.MESSWERT` (2026-07-09, Daniel):** `MESSWERT` enthält **keine** hochauflösenden Werte, sondern klassische periodische Zählerablesungen:

| Kennzahl | Wert |
|---|---|
| Zeilen gesamt | 2'926'148 |
| Unterschiedliche Zähler (`ID_Instzaehlwerk`) | 256'346 |
| Werte pro Zähler (Durchschnitt über 27 Jahre, 1999–2026) | **~11,4** |
| Zeitstempel-Muster (Stichprobe) | Unregelmässig (z. B. 14:30, 14:27, 14:25 Uhr) — kein ¼h-Raster |

→ ¼h-Lastgangdaten hätten allein **35'040 Werte pro Zähler und Jahr**; 11,4 Werte in 27 Jahren entsprechen klassischen (Fern-)Ablesungen, nicht Intervall-Messungen.

> ❗ **Bestätigt (nicht nur vermutet): Hochauflösende Werte (¼-h/h) liegen nicht auf `EWBSDB01\ISE`** — geprüft in `EWBPROD` (inkl. direkter Abfrage der rohesten Kandidatentabelle `Techanl.MESSWERT`, s. o.) und `EWBPROD_dwh` (nur Monatsaggregate); die Instanz hat nur `EWBPROD`/`_dms`/`_dwh`/`Schnittstelle`. Die Lastgang-Werte (Cube-Zeitreihentypen wie „Bruttolastgangsumme BLS/EN" beziehen sich explizit auf Lastgang) müssen in einem **separaten System** liegen — passend dazu, dass das Ausgangsticket „EDM — Energiedaten-Management" als eigenständiges System neben i-SE nennt. **Präzisierte Frage an Innosolv ist damit nicht mehr optional, sondern zwingend** (s. 10.4).

### 10.3 Beantwortete Abstimmungsfragen (aus §7)

| # | Frage | Antwort (verifiziert 2026-07-09) |
|---|---|---|
| I-1 | Wo liegen die Zeitreihen? | **Beantwortet:** Monatsaggregate in `EWBPROD_dwh.DataMart_EVU.ZeitreihenData`; Stammdaten/Formeln in `EWBPROD.Techanl`. **Bestätigt (nicht nur vermutet):** ¼-h-Rohwerte liegen nicht auf dieser Instanz — `Techanl.MESSWERT` direkt geprüft: nur ~11,4 Werte/Zähler über 27 Jahre → klassische Ablesungen, keine Intervalldaten |
| I-2 | Granularität & Volumen | **Monat** × 18'728 Serien × ~2.5 Jahre = 486k Zeilen (trivial landbar). Historie ab 2024/03 |
| I-3 | Kennzahlen/Dimensionen/Logik des Cubes | **Beantwortet:** vollständige Bus-Matrix, Measures und 82 Zeitreihen-Typen dokumentiert (Exploration); Aufbereitungslogik liegt materialisiert in `EWBPROD_dwh` |
| I-4 | Cube-Typ & Prozessierung | **Beantwortet:** SSAS Multidimensional, tägliche Prozessierung ~22:55 |
| E-2 | AD-/Berechtigungskontext Cube | **Gelöst** für Weg C: Linked-Server-Zugriff über SQL-Dienstkonto `srv_isag@intra.ewbuchs.ch` (kein Kerberos-Doppel-Hop) |
| E-3 | Reicht `INTRA\srv-analytics` für Lesezugriff? | **Ja, verifiziert** — sowohl für `EWBPROD_dwh.DataMart_EVU` als auch für `EWBPROD.Techanl` (Tabellenstruktur- und Row-Count-Queries liefen über denselben Account produktiv). Keine zusätzliche Freigabe nötig |
| E-4 | Host des SSAS-Cubes | **Beantwortet:** `EWBSDB01\ISE` (SSAS-Instanz auf demselben Host wie die SQL-Instanz), Version 16.0.43.252 |

### 10.4 Konkretisierter Vorschlag

**Empfohlenes Vorgehen — „B aus dem DWH" (statt aus Rohtabellen):**

1. **Landung aus `EWBPROD_dwh.DataMart_EVU`** über das bestehende `ISE_Prod`-Muster (Allowlist erweitern, `dbName`-Parameter existiert bereits): `ZeitreihenData` + Zeitreihen-Stammdaten (`EWBPROD.Techanl.ZEITREIHE`/`ZEITREIHETYP` oder `VR_Zeitreihe`) + ggf. `MesspunktData`. **Vorteil:** Innosolvs Aufbereitungslogik ist hier bereits materialisiert — kein Nachbau der Cube-Logik nötig (entkräftet das Haupt-Risiko von Weg B). Volumen unkritisch (486k Zeilen). Zeitfenster: nach dem nächtlichen DWH-Rebuild (~23:00), vor dem Morgen-Load.
2. **Vault-Modellierung (DV2.1):** `hub_zeitreihe` (BK: `ID_Zeitreihe` bzw. Kennung), `sat_zeitreihe__ise` (Typ, OBIS, Beschreibung), `link_zeitreihe_messpunkt`, Monatswerte als Multi-Active-Satellite (CDK = Monat) oder direkt als Fakt im Mart — Detailentscheid in der Modellierungsphase.
3. **Weg C (Linked Server/MDX) als Ergänzung behalten** für Ad-hoc-Analysen und für Kennzahlen, deren Logik nur im Cube existiert (z. B. Time-Intelligence-Berechnungen, `Umsatz pro Kunde`) — Infrastruktur steht und kostet nichts.
4. **Weg A (Power BI Gateway) entfällt** — kein Bedarf mehr, da C das Live-Szenario abdeckt und B die Integration liefert.
5. **An Innosolv (präzisiert):** „Wo werden die hochauflösenden Zeitreihenwerte (¼-h/h) gespeichert? Auf `EWBSDB01\ISE` finden sich nur Monatsaggregate (`DataMart_EVU.ZeitreihenData`) und Stammdaten (`Techanl.ZEITREIHE*`), aber keine Werte-Tabelle." Falls EWB ¼-h-Auflösung für Analysen braucht (Frage G-3 an den Fachbereich!), muss der Zugang dazu separat geklärt werden.

### 10.5 Nächste Schritte (Stand vor Antwort transformIT — historisch, s. §11 für aktuellen Stand)

| Schritt | Wer | Status |
|---|---|---|
| Fachbereich Energie: Reichen **Monatswerte** (Summe/Min/Max je Serie) oder werden ¼-h-Werte benötigt? (schärft G-3) | EWB Roger / Fachbereich | ⬜ Vor Termin klären |
| ~~Präzisierte ¼-h-Frage an Innosolv~~ | PPMC / EWB | ✅ Beantwortet — s. §11 |
| Termin Christian Vetsch: Vorgehen bestätigen (B aus DWH + C als Ergänzung) | PPMC + EWB | ⬜ Terminvorschläge versendet |
| Extraktion erweitern: `EWBPROD_dwh.DataMart_EVU.ZeitreihenData` (+ Stammdaten) → Landing Zone → Staging → Vault | PPMC Analytics | ⬜ Nach Termin |
| Test-Pipelines `Claude_Cube_Explore_TEST` / `Claude_SQL_Explore_TEST` in ADF: behalten (Exploration) oder löschen | PPMC Analytics | ⬜ Nach Projektabschluss aufräumen |

---

## 11. Antwort transformIT AG (Hanspeter Zürcher) — ¼h-Lastgangwerte, 2026-07-23

**Kontext:** Auf unsere Rückfrage (E-Mail an Hanspeter Zürcher, s. §10.4 Punkt 5) zum Speicherort der hochauflösenden Zeitreihenwerte kam folgende Antwort:

| Frage | Antwort |
|---|---|
| Speicherort | **Nicht** in der relationalen SQL-Server-Datenbank — separat in einer **Cassandra-Datenbank (NoSQL)** |
| Granularität | **¼-Stunden-Werte je Messpunkt** |
| Historientiefe | Bei EWB soweit bekannt bis zu **10 Jahre** zurück importiert — Details bei **Mario Lenherr** |
| Volumen | ~18'000 Messpunkte mit Zeitreihen, im Schnitt **~11 Zeitreihen je Messpunkt** |
| Zugriffsweg | Empfohlen: **Webservices** (kein direkter DB-/Treiber-Zugriff) |

**Eigene Einordnung / Kreuz-Check:** 18'000 × 11 ≈ **198'000 Zeitreihen** — das deckt sich fast exakt mit den **198'338 Zeilen**, die wir bereits in `EWBPROD.Techanl.ZEITREIHE` gefunden hatten (§10.2). Das bestätigt: Die Zeitreihen-**Stammdaten** (Definition, OBIS-Kennung) liegen im SQL Server, die **Werte** selbst ausschliesslich in Cassandra — konsistent mit `ZEITREIHEINFO`, das nur Metadaten zum Wertebereich referenziert, aber keine Werte enthält.

**Grobe Volumenschätzung (worst case, volle Historie, alle Serien):**

$$198'000 \text{ Serien} \times \left(10 \text{ Jahre} \times 365 \times 96 \text{ Werte/Tag}\right) \approx 198'000 \times 350'400 \approx \mathbf{69 \text{ Mrd. Rohwerte}}$$

Das ist eine **völlig andere Grössenordnung** als die 486'000 Zeilen Monatsaggregate aus `EWBPROD_dwh` — eine 1:1-Landung der vollen ¼h-Historie ins Data Vault wäre (falls überhaupt gewünscht) ein eigenes, deutlich grösseres Architekturthema (Inkrementallogik, Partitionierung, ggf. selektive Historientiefe/Aggregation statt Vollimport).

### 11.1 Auswirkung auf die Strategie

Die Empfehlung aus §10.4 (**Monatsaggregate aus `EWBPROD_dwh` relational landen**) bleibt davon **unberührt** — das ist unabhängig von Cassandra und weiterhin der pragmatische erste Schritt. Die ¼h-Rohdaten sind ein **separates, grösseres Arbeitspaket**:

| | Monatsaggregate (bestehende Empfehlung) | ¼h-Lastgang (neu, Cassandra) |
|---|---|---|
| Quelle | `EWBPROD_dwh.DataMart_EVU.ZeitreihenData` | Cassandra via Webservice |
| Zugriffsmuster | Relational, analog bestehendem `ISE_Prod`-Muster | Neuer Connector/API-Client nötig — **kein natives ADF-Cassandra-Muster bei uns etabliert** |
| Volumen | 486k Zeilen — trivial | ~69 Mrd. Rohwerte (worst case) — braucht Konzept (Zeitfenster, Aggregation, Inkrementallogik) |
| Aufwand | Gering, sofort umsetzbar | Signifikant — eigenes Architektur-/Aufwandsthema |
| Empfehlung | **Sofort umsetzen** | **Erst nach Klärung des tatsächlichen Bedarfs** (G-3: braucht der Fachbereich wirklich ¼h, oder reichen die Monatswerte, die wir schon haben?) |

### 11.2 Nächste Schritte (aktuell)

| Schritt | Wer | Status |
|---|---|---|
| **Vor Aufwand für ¼h-Anbindung: Bedarf mit Fachbereich Energie klären** (reichen Monatswerte für die aktuellen Auswertungen, oder ist ¼h zwingend?) | EWB Roger / Fachbereich | ⬜ Offen — entscheidet ob 11.3 überhaupt nötig wird |
| Kontakt **Mario Lenherr** (Details zu Cassandra-Zugriff, Webservice-Dokumentation/API-Spec, Authentifizierung, exakte Historientiefe) | PPMC / EWB | ⬜ Anfragen |
| Termin Christian Vetsch: Vorgehen bestätigen — Monatsaggregate sofort, ¼h/Cassandra als separates Arbeitspaket nach Bedarfsklärung | PPMC + EWB | ⬜ Terminvorschläge versendet |
| Extraktion erweitern: `EWBPROD_dwh.DataMart_EVU.ZeitreihenData` (+ Stammdaten) → Landing Zone → Staging → Vault | PPMC Analytics | ⬜ Kann unabhängig von Cassandra-Frage starten |
| Test-Pipelines `Claude_Cube_Explore_TEST` / `Claude_SQL_Explore_TEST` in ADF: behalten oder löschen | PPMC Analytics | ⬜ Nach Projektabschluss aufräumen |
