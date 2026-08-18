# EDM / i-SE OLAP-Cube — Anbindung Energiedaten (Innosolv)

**Datum:** 6. Juli 2026  
**Von:** PPMC AG — Analytics Team (Daniel)  
**An:** EWB — Roger (Anfrage), Christian Vetsch (System Engineer)  
**Betreff:** Machbarkeit & Vorgehen zur Anbindung der Energiedaten (i-SE / OLAP-Cube)  
**Status:** 🟢 Exploration abgeschlossen (Update 2026-08-15, §12) — Cube live abfragbar, Quelltabellen lokalisiert, **¼-h-Export bereits in der Landing Zone** und deterministisch mit Cube/Stammdaten verknüpfbar; Konsolidierungsentscheid (K1–K4) offen  
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

> ⚡ **Überholt durch §12 (2026-08-15):** Für die kuratierte Zeitreihegruppe `ewb_Power BI` (41 Serien) liegen die ¼-h-Werte **bereits als CSV-Export in der Landing Zone** — ohne Cassandra-Connector. Das Volumen dieser Gruppe beträgt ~3.2 Mio Werte statt der hier für *alle* Serien geschätzten ~69 Mrd. Die Einschätzung „signifikanter Aufwand / eigenes Architekturthema" gilt weiterhin für einen **Vollzugriff auf alle ~198k Serien**, nicht für den aktuellen Scope.

### 11.2 Nächste Schritte (aktuell)

| Schritt | Wer | Status |
|---|---|---|
| **Vor Aufwand für ¼h-Anbindung: Bedarf mit Fachbereich Energie klären** (reichen Monatswerte für die aktuellen Auswertungen, oder ist ¼h zwingend?) | EWB Roger / Fachbereich | ⬜ Offen — entscheidet ob 11.3 überhaupt nötig wird |
| Kontakt **Mario Lenherr** (Details zu Cassandra-Zugriff, Webservice-Dokumentation/API-Spec, Authentifizierung, exakte Historientiefe) | PPMC / EWB | ⬜ Anfragen |
| Termin Christian Vetsch: Vorgehen bestätigen — Monatsaggregate sofort, ¼h/Cassandra als separates Arbeitspaket nach Bedarfsklärung | PPMC + EWB | ⬜ Terminvorschläge versendet |
| Extraktion erweitern: `EWBPROD_dwh.DataMart_EVU.ZeitreihenData` (+ Stammdaten) → Landing Zone → Staging → Vault | PPMC Analytics | ⬜ Kann unabhängig von Cassandra-Frage starten |
| Test-Pipelines `Claude_Cube_Explore_TEST` / `Claude_SQL_Explore_TEST` in ADF: behalten oder löschen | PPMC Analytics | ⬜ Nach Projektabschluss aufräumen |

---

## 12. Exploration ¼h-Export vs. Cube/Stammdaten (2026-08-15)

**Anlass:** Seit dem Erstellen von §11 sind zwei External Tables in `datavault-dev` (Target `ewb-dev`) angebunden: `stg.ext_ise_lastgaenge` und `stg.ext_ise_stammdaten`. Die Werte in `ext_ise_lastgaenge.Category` ähnelten `ext_ise_stammdaten.Zeitreihe`, waren aber nicht identisch. Untersucht via ADF-Pipelines `Cube_Explore_TEST` (MDX/SSAS-DMV) und `SQL_Explore_TEST` (`EWBPROD`, `EWBPROD_dwh`) sowie direkte Abfragen der External Tables.

### 12.1 Herkunft der beiden External Tables

| Aspekt | Befund |
|---|---|
| Quelle | Täglicher **CSV-Export** `ewb_PowerBI_LG_<yyyyMMddHHmmss>.csv` auf Laufwerk D: des i-SE-Servers → Container `ise-export/drive-d/{lastgaenge,stammdaten}/` |
| Transport | ADF-Pipeline **`CopyPipeline_Lastgaenge`** (2 Copy-Activities, CSV → Parquet) → `stage-fs/ewb/ise/{lastgaenge,stammdaten}/` → Wildcard External Tables |
| Kadenz | Werktäglich ~08:45; zusätzlich ein Backfill-Lauf am 11.08.2026 13:28 (12.5 MB, Juli 2026) |
| Umfang | **41 Zeitreihen**, `Zeitschritt = 15` → **¼-h-Werte**; aktuell Juli 2026 + 01.–14.08.2026 |
| Auflösung | ¼-h-Raster (00:15 … 23:45), Intervall-**Ende**-Konvention |

> ⚡ Damit ist die zentrale Annahme aus §10/§11 zu relativieren: **¼-h-Lastgangwerte sind bereits in der Landing Zone** — nicht über Cassandra, sondern über einen von EWB eingerichteten Report-Export. Die Cassandra-Aussage von transformIT (§11) bleibt für den *direkten* Zugriff auf alle 198k Serien gültig.

### 12.2 `Category` ↔ Stammdaten — der Schlüssel ist deterministisch

`ext_ise_lastgaenge.Category` ist ein zusammengesetzter Text:

```
Category = Zeitreihe + '.' + Referenz + '.' + Einheit
```

Beispiele:
- `Verluste NE6.Elektrizitäts- und Wasserwerk der Stadt Buchs <Netz>.kWh`
- `Wirk Rücklieferung.CH1008401234510000000000000014073.kWh`
- `Wasser KEV Rücklieferung.Auswertungen.kWh`

**Verifiziert:** 41 von 41 `Category`-Werten matchen exakt gegen `ext_ise_stammdaten`; die Abbildung auf `ID_Zeitreihe` ist **1:1 bijektiv** (41 Category = 41 Composite Keys = 41 IDs). Kein Fuzzy-Matching nötig.

Der Grund für die „Ähnlichkeit ohne Identität": Die CSV-Spalte `Zeitreihe` enthält nicht den Serien-, sondern den **Typnamen** — sie entspricht `Techanl.ZEITREIHETYP.Bezeichnung` bzw. `VR_Zeitreihe.ZeitreiheTyp`. Die Serienidentität entsteht erst aus **Typ + Referenz**.

### 12.3 Stammdaten auf dem Cube — vorhanden, aber dünn und nicht namensreferenzierbar

| Ebene | Objekt | Inhalt |
|---|---|---|
| Cube (SSAS) | Dimension `[Zeitreihe]` | 19'206 Members; nur 3 Hierarchien: `Zeitreihe`, `ZeitreiheTyp` (85), `Ruecklieferung` (3). Einzige Member-Property: `ZeitreiheTyp` |
| Cube-Quelle | `EWBPROD_dwh.DataMart_EVU.VR_Zeitreihe` | 19'205 Zeilen: `Zeitreihe_ID`, `MeteringCode_ID`, `ID_ZeitreiheTyp`, `ZeitreiheTyp`, `Ruecklieferung_ID`, `Ruecklieferung` |
| Cube-Fakten | `DataMart_EVU.ZeitreihenData` | 19'295 Serien, Monatswerte `Summe`/`Minimum`/`Maximum`, 2024/03–2026/08 |

**Kernbefunde:**

1. **`VR_Zeitreihe.Zeitreihe_ID` ist identisch mit `ID_Zeitreihe` aus dem CSV-Export** — direkt referenzierbar, kein Mapping nötig (stichprobenartig für 8 IDs verifiziert, danach vollzählig gezählt).
2. **31 von 41** Serien liegen im Cube-DataMart. Die fehlenden 10 sind exakt die **lieferantenreferenzierten** Serien (Alpiq / EPAG / Primeo, `ReferenzTyp = 172`, `ReferenzID` 56/54/16) — `Gesamtlieferung LF lokal`, `Gesamtrücklieferung LF lokal`, `Gesamtlieferung minus Gesamtrücklieferung LF`, `… Lastgang gemessen`.
3. Über den **Cube allein** sind die Serien **nicht** referenzierbar: `MEMBER_CAPTION` ist nur der Typname und damit nicht eindeutig (19'206 Members auf 85 Typnamen). Für einen Join braucht es die relationale Ebene.
4. Die Cube-Dimension ist **deutlich ärmer** als `ext_ise_stammdaten`: es fehlen Einheit, Zeitschritt, Energieart, Standort, Bezügeranlage, Gültigkeiten und die Zeitreihegruppe.

### 12.4 Die vollständigen Stammdaten liegen relational in `EWBPROD.Techanl`

Der CSV-Stammdaten-Export ist ein **denormalisierter Join** dieser Tabellen — alle über das bestehende `ISE_Prod`/SHIR-Muster erreichbar. Jede Spalte des Exports liess sich auf ihre relationale Quelle zurückführen; die Referenzauflösung wurde stichprobenweise gegen die Exportwerte geprüft und stimmt exakt:

| Tabelle | Liefert | Volumen |
|---|---|---|
| `Techanl.ZEITREIHE` | `ID_Zeitreihe` (BK), `ID_ZeitreiheTyp`, `ReferenzTyp`/`ReferenzID`, `GueltigVon`/`GueltigBis`, `Kennung`, `ObisOutput`, `Beschreibung` | **203'378** — enthält **alle 41** Serien (auch die 10 im DWH fehlenden) |
| `Techanl.ZEITREIHETYP` | `Bezeichnung` (= CSV-Spalte `Zeitreihe`), `Einheit`, `Zeitschritt`, `Ruecklieferung`, `ObisOutput` | 274 |
| `Techanl.ZEITREIHEGRUPPE` / `…ZUORD` | Gruppenzuordnung inkl. `Reihenfolge`, `GueltigVon`/`GueltigBis` | **43 Gruppen** |
| `Techanl.METERINGCODE` | `Messpunktbezeichnung` = die `CH1008…`-Referenz (`ReferenzTyp = 19`) — **verifiziert** für ID 629/12083/13529 | — |
| `Techanl.MARKTPARTNER` | `Bezeichnung` = Referenz für Netz / Lieferant / „Auswertungen" (`ReferenzTyp = 172`) — **verifiziert**: 1 = `…Stadt Buchs <Netz>`, 16 = `EWB B2B Primeo <Lieferant>`, 54 = `EWB B2B EPAG <Lieferant>`, 56 = `EWB <Lieferant> <mit Bilanzgruppe> <Alpiq AG>`, 61 = `Auswertungen` | — |
| `Techanl.ZEITREIHEINFO` | `ZeitreihewertStart`/`-Ende`, `LueckeVon`/`-Bis`/`-Anzahl` je Serie | Metadaten zum Wertebereich |

**Die Auswahl der 41 Serien ist relational reproduzierbar:** Zeitreihegruppe **`ID = 150`, Bezeichnung `ewb_Power BI`** enthält **exakt 41** Zeitreihen — identisch mit dem Export (auch der Dateiname `ewb_PowerBI_LG_*` verweist darauf). Weitere Gruppen zeigen das Potenzial des Mechanismus, u. a. `ewb Tarif 2027 Haushalt mit Smartmeter` (6'187 Serien), `HKN` (673), `ewb Tarif 2027 Industrie N (NE7)` (69).

### 12.5 Kreuz-Check: Cube-Monatswerte = Aggregation derselben ¼-h-Serien

Vergleich Juli 2026, ¼-h-Summe aus `ext_ise_lastgaenge` gegen `DataMart_EVU.ZeitreihenData`:

| Serie | Cube `Minimum` / `Maximum` | ¼h `min` / `max` | Cube `Summe` | ¼h-Summe (2975 Werte) |
|---|---|---|---|---|
| 148746 Bruttolastgangsumme BLS/EN | 1039.052579 / 2565.812433 | **identisch** | 4'612'940.997 | 4'611'569.778 |
| 183741 Gesamteinspeisung Netz | 1089.176824 / 2669.596 | **identisch** | 4'796'003.635 | 4'794'572.536 |
| 150835 Wirk Rücklieferung CH…12181 | 410.4 / 3536.0 | **identisch** | 8'243'668.0 | 8'240'948.4 |

`Minimum`/`Maximum` stimmen **stellengenau** überein. Die `Summe` differiert jeweils um genau **ein Intervall**: der CSV-Export liefert 2'975 statt 2'976 Juli-Werte, weil der Wert `01.08. 00:00` (Intervall-Ende-Konvention) noch zum Juli gehört.

→ **Es handelt sich nicht um „ähnliche", sondern um dieselben Zeitreihen.** Cube = Monatsaggregat, CSV = ¼-h-Basis. Der Kreuz-Check taugt damit als dauerhafter Datenqualitätstest.

### 12.6 Historientiefe & Volumen der 41 Serien (`ZEITREIHEINFO`)

| Start der Werte | Serien | geschätzte ¼h-Werte |
|---|---|---|
| 2019 | 2 | 534'144 |
| 2024 | 14 | 1'284'864 |
| 2025 | 24 | 1'359'360 |
| 2026 | 1 | 21'600 |
| **Total** | **41** | **≈ 3.2 Mio** |

Ende der Werte durchgehend `2026-08-14`, **`LueckeAnzahl = 0`** für alle 41 Serien.

> Wichtige Korrektur zur Volumenschätzung in §11: Die dort genannten **~69 Mrd. Rohwerte** gelten für *alle* ~198k Serien über 10 Jahre. Für die kuratierte Gruppe `ewb_Power BI` sind es **~3.2 Mio Werte** — problemlos landbar. Die Frage „¼h ja/nein" ist damit **keine Architekturfrage mehr**, solange man beim Gruppen-Scope bleibt.

### 12.7 Datenqualitätsbefunde — vor jeder Modellierung zu lösen

| # | Befund | Beleg | Auswirkung |
|---|---|---|---|
| Q-1 | Wildcard-External-Table liest **alle** Export-Dateien → Duplikate | 279'456 Rohzeilen vs. 169'248 eindeutige (`Category`,`Date`)-Paare | Jede Summierung überzählt |
| Q-2 | Export ist ein **rollierendes 5-Tage-Fenster** | Duplikatsfaktor je Tag 1→5→1 (01.–14.08.); Juli dupfrei (nur Backfill-Datei) | Erwartetes Muster, nicht Fehler — braucht aber Dedup |
| Q-3 | **Werte werden nachträglich korrigiert** | **6'267** (`Category`,`Date`)-Paare mit mehr als einem `Value`; 14'785 Versionen; ausschliesslich in der Overlap-Zone 06.–13.08. | `SELECT DISTINCT` liefert **falsche** Ergebnisse — es braucht „letzter Export gewinnt" |
| Q-4 | External Table hat **keine Herkunftsspalte** (Dateiname / Export-Zeitstempel) | Spalten nur `Date`, `Category`, `Value` | Q-3 ist derzeit **nicht entscheidbar** → **Fix: `$$FILEPATH` als `additionalColumns` in `CopyPipeline_Lastgaenge` mitschreiben** |
| Q-5 | Stammdaten 10× dupliziert | 410 Zeilen = 41 Serien × 10 identische Snapshots | Dedup bzw. Snapshot-Handling nötig |
| Q-6 | `Date` als `VARCHAR(20)` im Format `dd.MM.yyyy HH:mm:ss` | `MIN`/`MAX` sortieren lexikografisch (Tag vor Monat) | Konvertierung (`CONVERT(datetime2, …, 104/113)`) im Staging zwingend |
| Q-7 | Am 15.08. existiert eine `stammdaten`-, aber keine `lastgaenge`-Datei | ADLS-Listing | Export-/Copy-Lücke mit EWB klären |
| Q-8 | `ext_ise_stammdaten.ID_Zeitreihe` ist als `NVARCHAR(4000)` typisiert | `sources.yml`; Quelle ist `int` | Für Hash-Keys/Joins auf `INT` casten (analog `TRY_CAST`-Muster der Finance-Domain) |

### 12.8 Konsolidierungsoptionen

| | Ansatz | Stammdatenquelle | Wertequelle | Aufwand | Bewertung |
|---|---|---|---|---|---|
| **K1** | **Nur CSV** — `Category` im Staging in `Zeitreihe`/`Referenz`/`Einheit` splitten und gegen `ext_ise_stammdaten` auf `ID_Zeitreihe` auflösen | `ext_ise_stammdaten` | `ext_ise_lastgaenge` | gering | Schnellster Weg zu einem lauffähigen Mart. Aber: Stammdaten bleiben ein 10×-duplizierter Flat-File-Snapshot ohne Historie, fix auf 41 Serien, abhängig vom Fortbestand des Exports |
| **K2** | **Stammdaten relational** aus `EWBPROD.Techanl` landen (`ZEITREIHE`, `ZEITREIHETYP`, `ZEITREIHEGRUPPE`, `ZEITREIHEGRUPPEZUORD`, `METERINGCODE`, `MARKTPARTNER`) — CSV liefert nur noch Werte | `EWBPROD.Techanl` | `ext_ise_lastgaenge` | mittel | **Empfehlung.** Echte, historisierbare Stammdaten für alle 203k Serien; Gruppenzugehörigkeit (inkl. Gültigkeit) wird zur *Daten*-, nicht mehr zur Exportfrage; Erweiterung auf weitere Gruppen ohne neuen Export möglich; `ext_ise_stammdaten` wird entbehrlich |
| **K3** | **Monatsaggregate ergänzen** aus `EWBPROD_dwh.DataMart_EVU.ZeitreihenData` (+ `VR_Zeitreihe`) | wie K2 | zusätzlich Cube-DataMart | + gering | Liefert Historie ab 2024/03 (¼h nur ab Juli 2026) und den permanenten Konsistenz-Check aus §12.5. Deckt nur 31 der 41 Serien ab |
| **K4** | **¼h-Vollhistorie** für Gruppe 150 nachladen (2019/2024/2025 → heute) | wie K2 | erweiterter Export **oder** Cassandra-Webservice | mittel | ~3.2 Mio Werte, keine Lücken. Einfachste Variante: EWB um einen einmaligen Backfill-Export über den vollen Zeitraum bitten (analog zur Backfill-Datei vom 11.08.) — kein Cassandra-Connector nötig |

**Empfohlene Reihenfolge:** K2 + K3 gemeinsam umsetzen (beide über die bestehende `ISE_Prod`-Allowlist), K4 als einmaligen Backfill anfordern. K1 nur, falls kurzfristig ein Ergebnis gebraucht wird — es ist in K2 vollständig aufgehoben.

### 12.9 Vault-Modellierungsskizze (DV 2.1)

```
hub_zeitreihe                    BK: ID_Zeitreihe (INT)
├── sat_zeitreihe__ise           Typ, Bezeichnung, Einheit, Zeitschritt,
│                                Rücklieferung, OBIS, Gültigkeit, Nutzung
├── link_zeitreihe_messpunkt     ReferenzTyp = 19  → hub_messpunkt (METERINGCODE)
├── link_zeitreihe_marktpartner  ReferenzTyp = 172 → hub_marktpartner
└── sat_zeitreihe_lastgang_ma__ise   Multi-Active, CDK = Zeitstempel (¼h)
                                     Payload: Value; Dedup „letzter Export gewinnt" (Q-3/Q-4)

hub_zeitreihegruppe              BK: ID_Zeitreihegruppe  (z. B. 150 = ewb_Power BI)
└── link_zeitreihe_gruppe + eff_sat   GueltigVon/GueltigBis, Reihenfolge
```

Monatsaggregate (K3) entweder als eigener Satellit am selben Hub (CDK = `Month_ID`) oder erst im Mart als Vergleichsfakt. Vor der ¼-h-Satellitenmodellierung ist **Q-4 zwingend zu lösen** — ohne Herkunfts-/Zeitstempelspalte lässt sich kein korrektes „latest wins" bilden.

### 12.10 Offene Punkte

| # | Punkt | Wer | Status |
|---|---|---|---|
| X-1 | Wer erstellt den Export `ewb_PowerBI_LG_*.csv` auf D:, mit welchem Job/Zeitplan, und wer pflegt die Zeitreihegruppe 150? (Mario Lenherr / Christian Vetsch) | PPMC / EWB | ⬜ Offen |
| X-2 | Einmaliger **Backfill-Export** über die volle Historie (ab 2019/2024/2025) für Gruppe 150 — Aufwand/Machbarkeit | EWB | ⬜ Anfragen |
| X-3 | `CopyPipeline_Lastgaenge` um `$$FILEPATH` (`additionalColumns`) erweitern → Q-4 | PPMC Analytics | ⬜ Umsetzbar ohne Abstimmung |
| X-4 | Lücke vom 15.08. (stammdaten ohne lastgaenge) prüfen — einmalig oder systematisch? | PPMC / EWB | ⬜ Offen |
| X-5 | `Techanl`-Tabellen auf die `ISE_Prod`-Allowlist setzen (K2) — Lesezugriff für `INTRA\srv-analytics` ist laut §10.3/E-3 bereits verifiziert | PPMC Analytics | ⬜ Nach Entscheid |
| X-6 | Fachlich klären: Werden auch die 10 lieferantenreferenzierten Serien im Cube-Kontext benötigt (sie fehlen dort)? | EWB Fachbereich | ⬜ Offen |

### 12.11 Umgesetzt: Staging (2026-08-15)

**Entscheid:** Nur ¼-h-Werte; Stammdaten aus dem CSV-Export (K1), `Techanl` (K2) zurückgestellt. Damit entfällt der Cube als Quelle vollständig.

Deployed auf Target `ewb-dev` (Schema `stg`), alle 25 Tests grün:

| Modell | Rolle |
|---|---|
| `ise_zeitreihe_dedup` | Dedup + Typisierung der Stammdaten; bildet `zeitreihe_key` (= `Category`). **410 → 41 Zeilen** |
| `ise_lastgang_dedup` | Zeitstempel-Parsing (Style 104, Intervall-Ende), Auflösung `Category` → `id_zeitreihe`, Dedup des rollierenden Fensters. **279'456 → 169'248 Zeilen** |
| `ise_zeitreihe_main` | `automate_dv.stage()` — `hk_zeitreihe`, `hk_zeitreihegruppe`, `hk_link_zeitreihe_gruppe`, `hd_zeitreihe__ise`, `hd_zeitreihe_gruppe` |
| `ise_lastgang_main` | `automate_dv.stage()` — `hk_zeitreihe`, `hd_zeitreihe_lastgang_ma` (CDK = `messzeitpunkt`) |
| `tests/assert_ise_lastgang_kategorie_aufloesbar.sql` | Wacht darüber, dass keine Lastgang-Kategorie ohne Stammsatz still verworfen wird |

**Validierung:** 41 eindeutige `hk_zeitreihe`, **0 Hash-Waisen** zwischen Fakt- und Stammdaten-Staging; Zeitraum 01.07.2026 00:15 – 14.08.2026 00:00. Der Kreuz-Check gegen den Cube reproduziert sich durch das Staging hindurch (Serie 148746, Juli: 2'975 Werte, Min 1039.052579 / Max 2565.812433 — stellengenau wie im Cube).

### 12.12 Q-3/Q-4 gelöst — Herkunftsspalten für die Lastgänge (2026-08-16)

`ext_ise_lastgaenge` führt jetzt drei Herkunftsspalten (`dss_source_filename`, `dss_record_source`, `dss_run_id`); die Parquet-Dateien wurden entsprechend neu geschrieben. Damit ist der Dedup **fachlich korrekt**:

- Der Dateiname trägt den Export-Zeitstempel (`ewb_PowerBI_LG_<yyyyMMddHHmmss>.csv`) und sortiert lexikografisch = chronologisch → `ROW_NUMBER … ORDER BY dss_export_datum DESC` implementiert echtes **„letzter Export gewinnt"**.
- `dss_load_date` ist nun der **Export-Zeitstempel** statt `GETDATE()` — die Satellitenhistorie bildet den tatsächlichen Datenstand ab.
- Lineage-Spalten laufen mit, gehören aber bewusst **nicht** in den Hashdiff (sonst erzeugt jeder Export eine Scheinversion).

Die Gewinner-Verteilung bestätigt das Exportmuster exakt:

| Datei | Gewinnende Zeilen | Bedeutung |
|---|---|---|
| `…20260814084605` (jüngste) | 19'680 = 41 × 480 | gesamtes 5-Tage-Fenster |
| `…20260811132829` (Backfill) | 122'016 = 41 × **2'976** | vollständiger Juli |
| 7 ältere Tagesdateien | je 3'936 = 41 × 96 | je genau ein noch nicht überschriebener Tag |
| **Summe** | **169'248** | = Anzahl eindeutiger (Serie, Zeitpunkt) |

Die 2'976 Intervalle des Backfills (statt 2'975) bestätigen die **Intervall-Ende-Konvention** unabhängig.

> ✅ **Bit-genaue Validierung gegen den Cube:** Mit korrekter Abgrenzung (`messzeitpunkt > '2026-07-01' AND <= '2026-08-01'`) ergibt die Juli-Summe für Serie 148746 **4'612'940.997043** — **exakt** der Wert aus `DataMart_EVU.ZeitreihenData`. Die in §12.5 beobachtete Differenz von 1'371.22 war ausschliesslich das Randintervall. Unser Staging reproduziert die Innosolv-Monatszahlen damit stellengenau.

### 12.13 Metadatenspalten auf beiden Tabellen, unterschiedliche Dedup-Regeln (2026-08-17)

`ext_ise_lastgaenge` **und** `ext_ise_stammdaten` führen inzwischen vier Metadatenspalten — `dss_source_filename`, `dss_record_source`, `dss_run_id`, `dss_stage_timestamp`. Per `dv-toolkit:db-monitor` gegen `ewb-dev` verifiziert: DB-Schema und `sources.yml` stimmen für beide Tabellen exakt überein, **0 NULLs** in allen vier Spalten, kein Neuerzeugen der External Tables nötig.

**Wichtige Unterscheidung der beiden Zeitstempel:**

| Spalte | Bedeutung | Distinct-Werte | Als Ordnungskriterium |
|---|---|---|---|
| `dss_stage_timestamp` | **ADF-Ladezeitpunkt** | **genau 1** je Tabelle (alle Dateien in einem Copy-Lauf, identische `dss_run_id`) | ❌ unbrauchbar |
| Export-Zeitstempel aus `dss_source_filename` | Zeitpunkt, zu dem **i-SE** den Stand geliefert hat | 9 (Lastgänge) bzw. 10 (Stammdaten) | ✅ einzig verwendbar |

Abgeleitet wird er über das Macro [`ise_export_timestamp`](../../macros/ise_export_timestamp.sql).

**Bewusst unterschiedliche Dedup-Regeln je Datencharakter:**

| | Lastgänge | Stammdaten |
|---|---|---|
| Charakter | Messwerte je Zeitpunkt, **werden revidiert** (6'267 von 169'248 Paaren tragen mehr als einen Wert — unverändert bestätigt) | Vollständige Snapshots desselben Stands, fachlich gleichwertig |
| Regel | **jüngster Export gewinnt** (`ORDER BY dss_export_datum DESC`) | **DISTINCT über die Fachspalten** (GROUP BY) |
| `dss_load_date` | Export-Zeitstempel des gewinnenden Exports | Export-Zeitstempel des **frühesten** Snapshots mit diesem Stand („gültig seit") |
| Kontrolle | `snapshot_treffer` = 10 je Serie belegt, dass alle 10 Snapshots identisch sind | |

> ⚠ Beim Einbau der Metadatenspalten in die Stammdaten-View ist eine Falle zu beachten: Nimmt man `dss_source_filename` einfach in die SELECT-Liste, greift `DISTINCT` **nicht mehr** — jede der 10 Snapshot-Zeilen trägt einen eigenen Dateinamen und bleibt stehen. Deshalb `GROUP BY` über die 18 Fachspalten mit `MIN()` auf die Metadaten.

**Neuer Wächter:** [`assert_ise_zeitreihe_snapshot_eindeutig.sql`](../../tests/assert_ise_zeitreihe_snapshot_eindeutig.sql) schlägt an, sobald ein Stammdatenattribut sich ändert und `DISTINCT` zwei Versionen je `ID_Zeitreihe` liefert. Der ROW_NUMBER-Guard in `ise_zeitreihe_dedup` hält dann zwar die Hub-Eindeutigkeit, verdeckt die Änderung aber — der Test macht sie sichtbar und stösst den Entscheid an. Stand 2026-08-17: 41 eindeutige Versionen, Test grün (28 ISE-Tests gesamt grün).

**Beide Dedup-Regeln sind Interim, kein Ladekonzept.** Die Entscheide sind als eigene Punkte in [`TASKS.md`](../../TASKS.md) erfasst: *Delta-Load-Strategie für i-SE-Lastgänge* (Revisionen verwerfen vs. historisieren, HWM-Kriterium, PSA ja/nein) und *Dimensions-Snapshot-Strategie für i-SE-Zeitreihen-Stammdaten* (SCD2 vs. aktueller Stand).

### 12.14 Umgesetzt: Raw Vault (2026-08-17)

Neue Domäne `models/raw_vault/ise/` → Schema **`vault_ise`** (Muster analog `telecom`/`vault_telecom`), Tag `ise` lädt Staging + Vault gemeinsam. Deployed auf `ewb-dev`, **66 Tests grün**.

| Objekt | Typ | Zeilen |
|---|---|---|
| `hub_zeitreihe` | Hub, BK `id_zeitreihe` | 41 |
| `hub_zeitreihegruppe` | Hub, BK `id_zeitreihegruppe` | 1 (Gruppe 150) |
| `link_zeitreihe_gruppe` | Link (M:N) | 41 |
| `sat_zeitreihe__ise` | SCD2-Satellit am Hub | 41 |
| `sat_zeitreihe_gruppe__ise` | SCD2-Satellit **am Link** | 41 |
| `sat_lastgang_tl__ise` | **Transaction Satellite**, Schlüssel (hk, `messzeitpunkt`) | 169'248 |
| `*_current_v` | Zugriffs-Views auf die beiden SCD2-Satelliten | — |

**Referenzielle Integrität:** 0 Waisen in allen vier geprüften Richtungen (MA-Sat → Hub, Link → beide Hubs, Link-Satellit → Link).

**Warum der Satellit am Link hängt:** Reihenfolge und Gültigkeit sind Eigenschaften der *Zuordnung*, nicht der Zeitreihe. Am Hub könnte eine Serie nicht gleichzeitig in mehreren Gruppen mit unterschiedlicher Sortierung liegen — und jedes Umsortieren in i-SE erzeugte eine neue Version der Zeitreihe selbst.

**End-to-End-Abgleich gegen den Cube** (Hub → MA-Sat → `sat_zeitreihe__ise_current_v`, Juli 2026, Abgrenzung `> 2026-07-01 AND <= 2026-08-01`):

| Serie | Vault | Cube (`ZeitreihenData`) |
|---|---|---|
| 148746 Bruttolastgangsumme BLS/EN | 4'612'940.997043 | 4'612'940.997043 ✓ |
| 150835 Wirk Rücklieferung | 8'243'668.0 | 8'243'668.0 ✓ |
| 183741 Gesamteinspeisung Netz | 4'796'003.635067 | 4'796'003.635064 (Δ 3·10⁻⁶) |

Die Abweichung bei 183741 liegt bei 3 Millionstel und ist Summierungsreihenfolge in `DECIMAL(38,18)`, kein Datenproblem.

**Umbau der Lastgang-Seite (gleicher Tag):** Zuerst als Multi-Active Satellite modelliert — das verdoppelte sich bei jedem Lauf. Ursache war nicht nur ein falsches Load Date, sondern die **Musterwahl**: Messwerte sind Fakten, keine Zustände. `automate_dv.ma_sat` vergleicht Mengen je Hash Key (`latest_records` = alle Sätze mit dem höchsten Load Date); bei zeilenweisen Load Dates schrumpfte die Vergleichsmenge auf 480 statt 4'128 Sätze, alles galt als neu.

Ersetzt durch einen **append-only Transaction Satellite** `sat_lastgang_tl__ise`, Schlüssel `(hk_zeitreihe, messzeitpunkt)`, Hashdiff nur über `wert`:

| | vorher (ma_sat) | jetzt (Transaction Sat) |
|---|---|---|
| Vergleich je Lauf | ganze Wertemenge je Serie (4'128, bei Vollhistorie ~78'000) | eine Zeile je Schlüssel |
| Load Date | Batch-Wert nötig | wieder je Zeile — präziser (welcher Export lieferte den Wert) |
| Revidierter Wert | neue Mengenversion | zusätzliche Version, alt/neu über `dss_load_date` unterscheidbar |
| Aktueller Stand | — | `sat_lastgang_tl__ise_current_v` |

**Performance** (169'248 Zeilen, inkrementeller Lauf ohne neue Daten):

| | |
|---|---|
| Anti-Join über den Quell-Zeitraum begrenzt + Index `(hk_zeitreihe, messzeitpunkt) INCLUDE (hd)` | Satellitenzugriff **16 ms** |
| Schranke aus der CTE `source_data` (doppelte Auswertung der Staging-Kette) | 51,7 s |
| Schranke direkt aus der External Table | **37,4 s** |
| Staging-View-Kette über die Parquet-Dateien (Einzelmessung) | **12'986 ms** |

→ Der Flaschenhals ist das wiederholte Lesen der Parquet-Dateien, nicht der Anti-Join. Weitere Optimierung heisst **PSA**, nicht mehr Indizes — das gehört zum offenen Delta-Load-Entscheid in TASKS.md.

Ausführlich in [`docs/LESSONS_LEARNED.md`](../LESSONS_LEARNED.md).

> 🔎 **Bestätigt sich weiterhin (X-4):** Für den Exportstand `20260815` liegt ein Stammdaten-Snapshot vor, aber **keine** Lastgang-Datei — 10 vs. 9 Dateien. Die Lücke ist damit nicht einmalig, sondern besteht fort.
