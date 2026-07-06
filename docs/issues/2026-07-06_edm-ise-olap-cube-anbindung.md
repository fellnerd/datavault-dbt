# EDM / i-SE OLAP-Cube — Anbindung Energiedaten (Innosolv)

**Datum:** 6. Juli 2026  
**Von:** PPMC AG — Analytics Team (Daniel)  
**An:** EWB — Roger (Anfrage), Christian Vetsch (System Engineer)  
**Betreff:** Machbarkeit & Vorgehen zur Anbindung der Energiedaten (i-SE / OLAP-Cube)  
**Status:** 🟡 In Abklärung — Machbarkeit geklärt, Strategieentscheid & Detailabstimmung offen  
**Referenz:** [`docs/projektdokumentation.md` §0.7](../projektdokumentation.md)

---

## 1. Zusammenfassung

EWB (Bereich Energie) möchte die Daten aus dem **Energiedaten-Management (EDM)** anbinden. Quellsystem ist **i-SE der Firma Innosolv**; das **Zeitreihenmodul** ist seit Ende 2025 verfügbar. Die Auswertung erfolgt heute über einen von Innosolv betriebenen **OLAP-Cube**.

**Kurzfazit der Machbarkeitsprüfung (live in Azure `sub-ewbuchs-prd-01` verifiziert):**

- Die **relationalen i-SE-Daten sind bereits produktiv angebunden** (DB `EWBPROD`, Schemas Basis/Faktura/Objekt) — inkl. gelöster Windows-/AD-Authentifizierung über die bestehende Self-hosted Integration Runtime. Die **Login-/AD-Hürde von 2023 ist für den relationalen Weg damit gelöst.**
- Der **OLAP-Cube ist nicht angebunden.** Er ist ein **On-Premise SSAS Multidimensional** und hat **keinen nativen Connector in Azure Data Factory**.
- Die **hochauflösenden Zeitreihen sind aktuell nirgends in Azure gelandet** — sie liegen relational in `EWBPROD`, sind aber nicht Teil der heutigen Extraktion.
- Der von Innosolv genannte **On-premises Data Gateway** ist ein **Power-BI-Weg** (Live-Zugriff auf den Cube) und **umgeht die Data-Vault-Plattform** — geeignet als Quick Win, nicht als Integration.

**Empfehlung:** Die Zeitreihen **relational landen** (Weg B) und in der Plattform integrieren, statt den Cube anzubinden (Weg A). Ein gemeinsamer Termin mit Christian Vetsch dient dem Strategieentscheid.

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
