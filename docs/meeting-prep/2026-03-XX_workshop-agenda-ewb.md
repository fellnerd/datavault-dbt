# Workshop-Agenda — Data Vault Implementierung EWB

**Datum:** [TBD]  
**Teilnehmer:** PPMC AG (Analytics Team) + EWB (Fachverantwortliche)  
**Dauer:** ca. 90 Minuten  
**Ziel:** Status-Update, Design-Validierung, offene Entscheide einholen, nächste Schritte vereinbaren

---

## Agenda

| # | Thema | Dauer | Typ |
|---|-------|-------|-----|
| 1 | Status-Update & Highlights | 10 min | Präsentation |
| 2 | Live-Demo: ER-Diagramm & Golden Example | 15 min | Demo |
| 3 | Korrigierter Synapse-Bug (Projekt.Stunden) | 5 min | Information |
| 4 | Offene Entscheide (F4–F7) | 30 min | Workshop |
| 5 | Wave-Plan & nächste Schritte | 15 min | Diskussion |
| 6 | Fragen & Feedback | 15 min | Offen |

---

## 1. Status-Update & Highlights (10 min)

**Zeigen:**
- Implementierungsplan: 35 Vault-Objekte (10 Hubs, 11 Satellites, 12 Links, 3 Reference Tables)
- 19/19 External Tables konfiguriert, 1/19 Staging-Views implementiert
- Alle 7 Synapse structured-tables Views analysiert und Transformationslogik dokumentiert
- Wave-Plan: 3 Wellen (Stammdaten → Transaktionen → Projekt-Domain)

**Key Messages:**
- 3 von 4 offenen Fragen intern durch **Datenanalyse auf den Echtdaten** gelöst
- Composite Business Keys durch Datenanalyse validiert (nicht geraten)
- Wave 1 (Stammdaten) kann sofort starten — **kein Blocker**

---

## 2. Live-Demo (15 min)

### 2a. ER-Diagramm (`design/raw-vault/_common/er-diagram.mmd`)
- Mermaid-Rendering zeigen (VS Code oder mermaid.live)
- Hub-Satellite-Link-Beziehungen erklären
- Reference Tables hervorheben (NTR, PST, LTC)

### 2b. Golden Staging Example (`models/staging/ewb_fibu_fhe_main.sql`)
- 5-Block-Struktur erklären (Header → Hashdiff → Source CTE → Staged CTE → SELECT)
- Hash-Berechnung zeigen (SHA2_256 nativ, kein automate_dv)
- Metadata-Spalten (dss_load_date, dss_record_source, dss_run_id)
- Erklären: "Jede weitere Staging-View folgt exakt diesem Pattern"

### 2c. Implementierungsplan-Walkthrough
- Hub/Satellite-Zuordnung pro Abacus-Tabelle kurz zeigen
- Wave-Zuordnung erklären

---

## 3. Synapse-Bug — Projekt.Stunden (5 min)

**Kernaussage:** Wir haben einen Fehler in der bestehenden Synapse-View gefunden.

| | Synapse (alt) | Data Vault (neu) |
|---|---|---|
| Join | `NSA.PROJNR = ADR.LOHNNR` | `NSA.PROJNR = NPO.PROJNR` |
| Interpretation | PROJNR = PersonalNr | PROJNR = **ProjektNr** |
| Match-Rate | 2.5% (297 von 11.895) | **97.5%** (11.600 von 11.895) |
| Konsequenz | 97.5% der Stundendaten gehen verloren | Alle Daten korrekt zugeordnet |

> **Frage an EWB:** Ist euch aufgefallen, dass die Stundenzahlen in Power BI möglicherweise viel zu niedrig sind?

---

## 4. Offene Entscheide — Workshop-Teil (30 min)

### F4 — Sharepoint-Daten als Reference Tables (🔴 Kritisch, 15 min)

**Hintergrund:** 8 Sharepoint-Tabellen identifiziert. Zwei davon sind besonders wichtig:

| Tabelle | Warum wichtig | Unsere Empfehlung |
|---|---|---|
| `Konten` (Kontenplan) | Ohne diese: `hub_konto` hat nur Nummern, keine Bezeichnungen | ✅ Als `ref_konto` importieren |
| `Kostenstellen` | Ohne diese: `hub_kostenstelle` hat nur Nummern | ✅ Als `ref_kostenstelle` importieren |
| `Budget` / `Forecast` / `ActualForecast` | Planungsdaten für Finance-Reporting | ⚠️ Scope-Entscheid nötig |
| `KategorisierungProjekte` + `ProjekteKategorien` | Projekt-Gruppierung in Power BI | ⚠️ Scope-Entscheid nötig |
| `Zugangsrechte` | Berechtigungen | 🟡 Niedrig — ggf. später |

**Entscheid 1:** Sollen `Konten` + `Kostenstellen` als Reference Tables importiert werden?  
→ PPMC Empfehlung: **Ja** — löst Ghost-Record-Problem und ermöglicht Dimensionsbeschriftungen.

**Entscheid 2:** Sollen `Budget` / `Forecast` in den Pilot-Scope?  
→ PPMC Empfehlung: **Nein** — erst nach Wave 3, als separater Erweiterungs-Scope.

**Entscheid 3:** Können die Sharepoint-Daten via bestehende ADF-Pipeline auch in die `landing-zone` bereitgestellt werden?  
→ Aktuell kommen sie nur via Synapse `[Sharepoint].*` Schema — wir bräuchten Parquet-Dateien in `stage-fs`.

---

### F5 — PRT (Projektteile): Eigenständiger Hub oder nur Satellite? (🟠 Major, 5 min)

**Kontext:** `PROJ.PRT` hat 1.200+ Zeilen mit PROJNR + diversen Attributen.

| Option | Objekte | Vorteil |
|---|---|---|
| **A: Nur Satellite** (empfohlen) | `sat_projektteil` am `hub_projekt` + `link_projektteil_projekt` | Einfacher, PRT hat keinen eigenen stabilen BK |
| B: Eigenständiger Hub | `hub_projektteil` + `sat_projektteil` + `link_projektteil_projekt` | Formal korrekter, aber PROJNR ist bereits BK von `hub_projekt` |

→ PPMC Empfehlung: **Option A** — PRT beschreibt Attribute/Status von Projekten, kein eigenständiges Geschäftsobjekt.

**Frage an EWB:** Gibt es Fälle, wo PRT-Einträge unabhängig von Projekten referenziert werden?

---

### F6 — NTB (Budget): Vault oder Mart-only? (🟡 Medium, 5 min)

**Kontext:** `PROJ.NTB` hat 707.733 Zeilen mit Budget-Bezugsgrößen. Kein direkter FK zu NTC oder NSA.

| Option | Vorteil |
|---|---|
| **A: Mart-only** (empfohlen) | Kein zusätzlicher Vault-Scope; BEZ lässt sich im Mart mit PROJNR/KST matchen |
| B: Vault (hub_budget + sat_budget) | Historisierung möglich, aber bei täglichem Full-Refresh unklar ob nötig |

→ PPMC Empfehlung: **Option A** — Budget-Daten gehören zum Reporting, nicht zum operativen Datenbestand.

**Frage an EWB:** Braucht ihr eine historische Nachverfolgung von Budget-Änderungen (wann wurde was geändert)?

---

### F7 — GL Jahresscheiben: Union oder 5 separate Views? (🟡 Medium, 5 min)

**Kontext:** FIBU.GL kommt als 5 Parquet-Dateien (E22–E26, pro Geschäftsjahr).

| Option | Vorteil |
|---|---|
| **A: 5 separate Staging-Views** (empfohlen) | Granulare Steuerung; inkrementelles Laden pro Jahr möglich |
| B: 1 UNION ALL Staging-View | Einfacher, ein Hub-Load für alle Jahre |

→ PPMC Empfehlung: **Option A** — ermöglicht selektives Re-Processing einzelner Jahre.

**Frage an EWB:** Kommen die Parquet-Dateien jährlich dazu (E27, E28...) oder werden die alten überschrieben?

---

## 5. Wave-Plan & nächste Schritte (15 min)

### Geplante Waves

| Wave | Inhalt | Abhängigkeit | Umfang |
|------|--------|--------------|--------|
| **Wave 1** | Stammdaten: Person, Adresse, Projekt, Kreditor + 3 Ref Tables | Keine | 5 Staging + 4 Hubs + 4 Sats + 1 Link + 3 Refs |
| **Wave 2** | Transaktionen: Buchungsköpfe, Hauptbuch, Kreditorenbelege | Wave 1 | 7 Staging + 3 Hubs + 3 Sats + 3 Links |
| **Wave 3** | Projekt-Domain + Zahlungen: Zeiterfassung, Projektsachkonto | Wave 2 | 5 Staging + 3 Hubs + 4 Sats + 8 Links |
| **Mart** | 7 Views (Finance + Projekt) — Synapse-Logik replizieren | Wave 2+ | 7 Mart Views |

### Sofort startbar nach Workshop
- Wave 1 hat **keine Blocker** — Implementierung kann sofort beginnen
- Pro Staging-View: ~30 min (automatisiert via Staging-Engineer Agent)
- Pro Hub/Satellite: ~15 min (automatisiert via Vault-Architect Agent)

### Erwartete Ergebnisse nach Wave 1
- 4 Hubs mit Stammdaten (Person, Adresse, Projekt, Kreditor) live auf `datavault-dev`
- Erste Mart-Abfragen möglich (z.B. Personalliste, Projektliste)
- Validierbar gegen bestehende Synapse-Views

---

## 6. Vorbereitete Fragen an EWB

### Must-Have (blockierend für Scope)

1. **Sharepoint → landing-zone:** Kann die ADF-Pipeline so erweitert werden, dass `Konten` und `Kostenstellen` (Parquet) auch in `stage-fs` landen? Wer ist dafür zuständig?

2. **Stundendaten in Power BI:** Ist euch aufgefallen, dass `Projekt.Stunden` vermutlich nur ~2.5% der tatsächlichen Stundendaten zeigt? (Synapse-Bug)

3. **GL Jahresscheiben:** Kommen neue E27, E28-Dateien jährlich dazu, oder werden bestehende überschrieben?

### Nice-to-Have (nicht blockierend)

4. **PRT-Nutzung:** Werden Projektteile (PRT) eigenständig referenziert, oder sind sie immer einem Projekt zugeordnet?

5. **Budget-Historisierung:** Braucht ihr eine Nachverfolgung, welche Budget-Werte sich wann geändert haben?

6. **Weitere Quellsysteme:** Sind für die nächsten 6 Monate weitere Quellsysteme geplant (IDMS, ISE, ServiceNow)? Falls ja, beeinflusst das die Schema-Planung.

7. **Power BI Refresh-Fenster:** Gibt es ein definiertes Zeitfenster, in dem die Daten aktualisiert sein müssen? (Beeinflusst dbt-Scheduling)

---

## Mitbringen / Vorbereiten

### PPMC
- [ ] Laptop mit VS Code (ER-Diagramm, Staging-Code)
- [ ] Zugang zu `datavault-dev` für Live-Abfragen
- [ ] Dieses Dokument ausgedruckt / geteilt

### EWB (falls möglich)
- [ ] Zugang zu ADF-Pipeline-Konfiguration (für Sharepoint-Frage)
- [ ] Power BI Report "Projekt.Stunden" zum Vergleich
- [ ] Feedback zu bisherigen Datenqualitäts-Problemen

---

*Erstellt: 15. März 2026 | PPMC AG — Analytics Team*
