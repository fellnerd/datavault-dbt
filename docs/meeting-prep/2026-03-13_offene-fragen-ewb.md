# Offene Fragen — Data Vault Implementierung EWB

**Datum:** 13. März 2026 | **Aktualisiert:** 14. März 2026  
**Von:** PPMC AG — Analytics Team  
**An:** EWB — Fachverantwortliche  
**Betreff:** Status-Update und verbleibende Klärungspunkte

---

## Zusammenfassung

Wir haben die bestehenden Synapse structured-tables Pipelines analysiert und durch umfassende **Datenanalyse** auf den External Tables mehrere kritische Erkenntnisse gewonnen. Von den ursprünglich 4 offenen Fragen sind **3 intern gelöst** — es verbleibt **1 offener Punkt** (Sharepoint-Daten). Wave 1 (Stammdaten) kann sofort beginnen. Wave 2+3 sind ebenfalls nicht mehr blockiert.

---

## ~~Frage 1: FIBU.GL — Belegnummer-Eindeutigkeit~~ ✅ GELÖST

> **Ergebnis (Datenanalyse 13.03.2026):** Dieselbe `DKBELEGNUMMER` erscheint auf 2–5 verschiedenen Konten (29% aller Belegnummern). Composite BK `DKBELEGNUMMER||KTO` bestätigt. Wave 2 ist nicht mehr blockiert.

---

## ~~Frage 2: PROJ.NSA — PROJNR-Semantik~~ ✅ GELÖST

> **Ergebnis (Datenanalyse 14.03.2026):**
>
> | Test | Ergebnis |
> |---|---|
> | NSA.PROJNR → NPO.PROJNR (Projekte) | **97.5% Match** (11.600 von 11.895) |
> | NSA.PROJNR → ADR.LOHNNR (Personen) | **2.5% Match** (297 — Zufall) |
>
> **PROJNR in NSA = ProjektNr** (nicht PersonalNr wie in Synapse angenommen).
>
> Die Synapse-View `Projekt.Stunden` enthält einen **Fehler**: Der `INNER JOIN ADR ON PROJNR = LOHNNR` filtert 97.5% der Daten weg. Die DV-Implementierung korrigiert dies mit `NSA.PROJNR → NPO.PROJNR`.
>
> **Weitere Erkenntnisse:**
> - `PROJ.NTC` = Zeitstempelung (Stempeluhr) — EMPLNR + PROJDAT + 10 Zeitintervalle. KEINE Spalten PRONR/POSNR.
> - `PROJ.NTB` = Budget-Verwaltung — eigenständiges System (7 Programme, 359K Bezugsgrößen), kein FK zu NTC.
> - Hub-Redesign: ~~`hub_stundenbuchung`~~ → `hub_projektsachkonto`, ~~`hub_projekttaetigkeit`~~ → `hub_zeiterfassung`

---

## ~~Frage 3: Leistungsarten — Hub oder Referenztabelle?~~ ✅ GELÖST

> **Ergebnis (Datenanalyse 14.03.2026):** `PROJ.NTR` hat nur **29 einzigartige Leistungsarten** (NUMBER-Spalte) × 3 Datasets. Beispiele: "Normalzeit", "Überzeit ohne Zuschlag", "Bezug Ferien".
>
> → **Reference Table** `ref_leistungsart` (kleiner, stabiler Lookup — kein Hub nötig).
>
> Ebenfalls als Reference Table identifiziert:
> - `PROJ.PST` — 7 Projektstatus-Werte → `ref_projektstatus`
> - `LOHN.LTC` — 2.132 Abteilungen/Gruppen → `ref_abteilung`

---

## Frage 4: Sharepoint-Daten als Referenztabellen (⚠️ Offen — EWB-Entscheid nötig)

**Hintergrund:**
In den bestehenden Synapse-Pipelines haben wir 8 Sharepoint-Tabellen identifiziert, die als Referenzdaten verwendet werden:

| Sharepoint-Tabelle | Verwendung in Synapse | Relevanz für DV |
|---|---|---|
| `Konten` | Kontenplan-Beschriftungen | 🔴 Löst Ghost-Record-Problem für `hub_konto` |
| `Kostenstellen` | Kostenstellen-Namen | 🔴 Löst Ghost-Record-Problem für `hub_kostenstelle` |
| `Budget` | Budgetdaten | ⚠️ Finance-Reporting |
| `Forecast` / `ActualForecast` | Planungsdaten | ⚠️ Finance-Reporting |
| `KategorisierungProjekte` | Projekt→Kategorie-Zuordnung | ⚠️ Projekt-Gruppierung |
| `ProjekteKategorien` | Kategorie-Stammdaten | ⚠️ Projekt-Gruppierung |
| `Zugangsrechte` | Berechtigungen | 🟡 Ggf. für Row-Level Security |

**Konkrete Fragen:**
1. Sollen `Konten` und `Kostenstellen` als Reference Tables im Data Vault importiert werden? (Unsere Empfehlung: Ja — ermöglicht Dimensionsbeschriftungen in Mart-Views)
2. Sollen die Planungsdaten (Budget/Forecast) ebenfalls in den DV-Scope?
3. Können diese Sharepoint-Tabellen über die bestehende ADF-Pipeline in die `landing-zone` bereitgestellt werden? Aktuell werden sie nur via Synapse `[Sharepoint].*` Schema geladen.

---

## Erkenntnisse zur Information (keine Klärung nötig)

### ✅ Synapse-Bug in Projekt.Stunden identifiziert
Die bestehende Synapse-View `Projekt.Stunden` joint `NSA.PROJNR = ADR.LOHNNR` und interpretiert PROJNR als PersonalNr. Datenanalyse zeigt: Dies ist **falsch** — nur 2.5% der Werte matchen, 97.5% sind Projektnummern. Die DV-Implementierung korrigiert dies.

### ✅ NTC = Zeitstempelung, nicht Projekttätigkeiten
`PROJ.NTC` enthält **tägliche Zeitstempel** pro Mitarbeiter (FROM/TO-Intervalle, Stunden). Es gibt keine Projekt-Spalten. 100% der NTC.EMPLNR-Werte matchen LEN.EMPL_NR.

### ✅ Buchungen-Logik dokumentiert
Die komplexe Buchungslogik (4-facher UNION ALL mit Vorzeichen-Umkehr, MWST-Anpassung, KST-Ausschlussfilter) wurde vollständig extrahiert und wird im Mart Layer (`mart_finance.v_buchungen`) repliziert.

### ✅ Finance.Kunden ist kein Kundenstamm
Die Synapse-View `Finance.Kunden` extrahiert Kundennummern aus Kreditorenbelegen (KBL) — ohne DISTINCT. Dies ist keine valide Kundenstamm-Quelle. Im Data Vault verwenden wir stattdessen `PUBL.ADR` als Personen-/Kundenstamm.

---

## Nächste Schritte

| Schritt | Wer | Status |
|---|---|---|
| ~~Klärung F1~~ | — | ✅ Gelöst (Datenanalyse) |
| ~~Klärung F2~~ | — | ✅ Gelöst (Datenanalyse) |
| ~~Klärung F3~~ | — | ✅ Gelöst (Datenanalyse) |
| Klärung F4 (Sharepoint) | EWB Fachverantwortliche | ⚠️ Meeting |
| Wave 1 starten (Stammdaten) | PPMC Analytics | Sofort |
| Wave 2 starten (Transaktionen) | PPMC Analytics | Nach Wave 1 |
| Wave 3 starten (Projekt-Domain) | PPMC Analytics | Nach Wave 2 |
| Mart-Layer planen | PPMC + EWB | Nach Wave 2 |
