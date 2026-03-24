# Raw Vault Implementierungsplan — EWB DV2.1

**Erstellt:** 12. März 2026 | **Aktualisiert:** 14. März 2026  
**Agenten:** synapse-validator + vault-architect + db-monitor  
**Scope:** 19 Pilot-Tabellen (Finance + Projects)

---

## 1. Grundlage: Synapse-Analyse

Die Synapse `structured-tables` Views dienen als Referenz. Alle DV-Objekte müssen am Ende dieselben Ergebnisse wie diese Views liefern.

| Synapse View | Zeilen | Abacus-Quellen |
|---|---:|---|
| Finance.Buchungen | 890.449 | FIBU.GL.E22–E26 |
| Finance.Belege | 287.784 | KRED.KBL + KRED.KVL |
| Finance.Kunden | 93.288 | KRED.KBL |
| Projekt.Personal | 502 | PUBL.ADR + LOHN.LEN |
| Projekt.Stunden | 63.755 | PROJ.NSA + PROJ.NTR + PUBL.ADR |
| Projekt.Projekt | 14.088 | PROJ.NPO |
| Projekt.Abteilung | 2.027 | LOHN.LEN + LOHN.LTC |
| **Total** | **1.351.893** | |

> **Architektur-Entscheidung:** Der neue Data Vault liest direkt aus `landing-zone` (via `stage-fs`), nicht aus `structured-tables`. Die DV-Schicht leitet die Transformationslogik eigenständig ab.

### 1b. Business-Logik-Extraktion (13. März 2026)

Aus der ADF-Pipeline `structured-tables Daily` (Orchestrator: Finance + Projekt + Manual Data → PowerBI Refresh) wurden die SQL-Transformationen aller 7 Views vollständig extrahiert (→ `docs/synapse-structured-tables-logic.md`).

**Kernerkenntnisse:**

| Synapse View | Transformations-Komplexität | DV-Zuordnung |
|---|---|---|
| Finance.Buchungen | **Hoch** — 4-way UNION ALL mit Vorzeichen-Logik, MWST-Anpassung, KTO/GKTO-Tausch | → Mart View |
| Finance.Belege | Mittel — LEFT JOIN KBL + KVL (`BELNR = DOCUMENTNR`) | → Link + Mart View |
| Finance.Kunden | Niedrig — Einfacher SELECT aus KBL, **kein DISTINCT** (denormalisiert) | → **Kein eigener Hub** — Stammdaten aus PUBL.ADR |
| Projekt.Personal | Mittel — ADR + LEN mit 3-stufiger Deduplizierung, Mitarbeiter-Filter | → Mart View (Filter = Business-Logik) |
| Projekt.Stunden | **Hoch** — ⚠️ Synapse-Fehler: `PROJNR = LOHNNR` Join ist falsch (nur 2.5% Match), PROJNR = ProjektNr (97.5% Match zu NPO) | → Mart View |
| Projekt.Projekt | Mittel — 4-way LEFT JOIN inkl. 2× Sharepoint-Tabellen | → Mart View (Sharepoint = Enrichment) |
| Projekt.Abteilung | Niedrig — LEN + LTC mit `GROUP=1` Filter, DISTINCT | → Mart View |

Zusätzlich wurden **6 Sharepoint-Referenztabellen** identifiziert, die via `Manual Data landingzone`-Pipeline als Direktkopien (ohne Transformation) geladen werden: Budget, Konten, Kostenstellen, Zugangsrechte, Forecast, ActualForecast.

> **Fazit:** Die structured-tables Views enthalten erhebliche Business-Logik (Vorzeichen, Filter, Joins, Deduplizierung). Diese gehört in die **Mart-Schicht**, nicht ins Raw Vault. Das Raw Vault bildet die Abacus-Quellen 1:1 ab; die Mart Views replizieren dann die Synapse-Logik.

---

## 2. Hubs

| Hub | Business Key | Abacus-Spalte | Staging-Quelle | Hash Key | Priorität |
|---|---|---|---|---|---|
| `hub_buchungskopf` | Buchungsnummer | `RECNUM` | `ewb_fibu_fhe_main` | `hk_buchungskopf` | P1 |
| `hub_hauptbuch` | Belegnr + Konto ¹ | `DKBELEGNUMMER\|\|KTO` | `ewb_fibu_gl_e2x` | `hk_hauptbuch` | P1 |
| `hub_kreditorenbeleg` | Belegnummer | `BELEGNR` | `ewb_kred_kbl_main` | `hk_kreditorenbeleg` | P2 |
| `hub_zahlung` | Beleg + Zahlnr | `BELEGNR\|\|ZAHLNR` | `ewb_kred_kvl_main` | `hk_zahlung` | P3 |
| `hub_kreditor` | Lieferantennummer | `LIEFNR` | `ewb_kred_kbs_main` | `hk_kreditor` | P1 |
| `hub_adresse` | Adressnummer | `INR` | `ewb_publ_adr_main` | `hk_adresse` | P1 |
| `hub_projekt` | Projektnummer | `PROJNR` | `ewb_proj_npo_main` | `hk_projekt` | P1 |
| ~~`hub_projekttaetigkeit`~~ | ~~Projekt + Positionsnr~~ | ~~`PRONR\|\|POSNR`~~ | ~~`ewb_proj_ntc_main`~~ | — | ~~P3~~ |
| `hub_zeiterfassung` ⁸ | Mitarbeiter + Tag | `EMPLNR\|\|PROJDAT` | `ewb_proj_ntc_main` | `hk_zeiterfassung` | P3 |
| `hub_projektsachkonto` ⁴ | Projekt + Code + Periode | `PROJNR\|\|CODE\|\|PERIYEAR\|\|PERIMONTH\|\|GB` | `ewb_proj_nsa_main` | `hk_projektsachkonto` | P3 |
| `hub_person` | Personalnummer | `EMPL_NR` | `ewb_lohn_len_main` | `hk_person` | P1 |

> ¹ Klärungsbedarf → Offene Frage F1 — **GELÖST**: Composite BK `DKBELEGNUMMER||KTO` bestätigt  
> ⁴ **Korrigiert (14.3.2026):** `PROJNR` in NSA = **ProjektNr** (97.5% Match zu NPO.PROJNR, datenbestätigt). Die Synapse-View `Projekt.Stunden` benennt dies fälschlicherweise als "PersonalNr" und joint `PROJNR = LOHNNR` (nur 2.5% Match — Synapse-Bug). BK-Semantik: `ProjektNr||LeistungsartNr||Jahr||Monat||Geschäftsbereich`.  
> ⁸ **NEU (14.3.2026):** NTC ist **Zeitstempelung** (Stempeluhr), nicht Projekttätigkeiten. Tatsächliche Spalten: `RECNUM, DATASET, EMPLNR, PROJDAT, FROM1-TO10, ANZAHL`. Es gibt KEINE Spalten `PRONR` oder `POSNR`. Ein Eintrag = ein Arbeitstag pro Mitarbeiter mit bis zu 10 Zeitintervallen.

**Hinweis `hub_person`** (korrigiert): BK-Spalte in LEN heisst `EMPL_NR` (nicht `PERSNR`).

**Hinweis `hub_adresse`** (neu): `PUBL.ADR` ist die zentrale Stammdaten-Quelle für Personen, Kunden und Adressen. Die Synapse-View `Finance.Kunden` extrahiert KNR/ADRID direkt aus `KRED.KBL` (Transaktionsdaten, kein DISTINCT) — das ist **keine valide Stammdaten-Quelle**. Kundeninformationen sollen im DV aus `hub_adresse` / `sat_adresse` kommen, nicht aus einem dedizierten "hub_kunde" basierend auf KBL.

**Hinweis `hub_leistungsart`** → entfällt: NTR hat nur **29 einzigartige Leistungsarten** (NUMBER-Spalte) × 3 Datasets. → **Reference Table** `ref_leistungsart` (siehe F3, gelöst).

**Ghost-Record-Hubs** (kein dedizierter Pilot-Source, werden über FK-Spalten der GL befüllt):
- `hub_konto` — BK aus `FIBU.GL.KONTNR` (Stammdaten via Sharepoint `Finance.Konten` verfügbar → Lücke #4 gelöst)
- `hub_kostenstelle` — BK aus `FIBU.GL.KOSTNR` (Stammdaten via Sharepoint `Finance.Kostenstellen` verfügbar → Lücke #4 gelöst)

---

## 3. Satellites

| Satellite | Hub | Typ | Hauptpayload | Staging-Quelle | Priorität |
|---|---|---|---|---|---|
| `sat_buchungskopf` | `hub_buchungskopf` | STD | PLAN, LEVEL, VARIANTE, TYP, REF_ID | `ewb_fibu_fhe_main` | P1 |
| `sat_hauptbuch` | `hub_hauptbuch` | STD | DATE, SH, SAM, BETRAG, GKTO, KST, KST2, WAEHR, MWSTBETR, MWSTTYP, MWSTCODE, MWSTINCL, MWSTSATZ, TEXT, TEXT2, DKKUNDENNUMMER, PROJEBENE | `ewb_fibu_gl_e2x` | P2 |
| `sat_kreditorenbeleg` | `hub_kreditorenbeleg` | STD | KNR, ADRID, Umschreibung3, Betrag, Belegdatum | `ewb_kred_kbl_main` | P2 |
| `sat_zahlung` | `hub_zahlung` | STD | Zahlbetrag, Valuta, Zahlungsart, Konto, Status, ABACUS_USR_NAME, ABACUS_USR_FULL_NAME | `ewb_kred_kvl_main` | P3 |
| `sat_kreditor` | `hub_kreditor` | STD | Saldo, Konto, Währung, Periode | `ewb_kred_kbs_main` | P1 |
| `sat_projekt` | `hub_projekt` | STD | ProjektName, Inaktiv, GruppeNr, StatusNr, Erstellt | `ewb_proj_npo_main` | P1 |
| ~~`sat_projekt_status`~~ | — | — | — | — | — | → **Entfällt:** PST = 7 stabile Lookup-Werte → nur `ref_projektstatus` |
| `sat_zeiterfassung` ⁸ | `hub_zeiterfassung` | STD | FROM1-TO10, ANZAHL (Stunden), USER_F | `ewb_proj_ntc_main` | P3 |
| `sat_projektsachkonto` | `hub_projektsachkonto` | STD | BUDGETINT, BETRAGINT, VORTRAGINT, BUDGETEXT, BETRAGEXT, VORTRAGEXT, AZBUTINT, AZBETINT, AZVORTINT, AZBUTEXT, AZBETEXT, AZVORTEXT | `ewb_proj_nsa_main` | P3 |
| `sat_person` | `hub_person` | STD | **20 Spalten (datenbasiert)** — Identität: EMPL_ID, LAST_NAME, FIRST_NAME, ABRV, BADGE_ID, BIRTHDAY, SEX, NATIONALITY, BIRTH_PLACE — Anstellung: HOME_DEPT_NR, ADR_INR, DATE_IN, DATE_OUT, TYPE, MUTATION_DATE, LPE_YEAR, LPE_MONTH — CH-SV: SOC_INSURANCE_NR — Compliance: RELEVANT_FOR_LOGIB, ZEMIS_NR | `ewb_lohn_len_main` | P1 |
| `sat_person_adresse` | `hub_adresse` | STD | Name, Vorname, Strasse, PLZ, Ort | `ewb_publ_adr_main` | P2 |
| `sat_projektteil` | `hub_projekt` | STD | Status (STAT1/STAT2), Datum | `ewb_proj_prt_main` | P3 |

> ⁸ NTC = Zeitstempelung. Payload = 10 Zeitintervalle pro Tag (FROM1/TO1 bis FROM10/TO10) plus ANZAHL (Gesamtstunden). NTB (Budget) hat **keinen direkten Bezug** zu NTC — NTB ist eine separate Budget-Verwaltung (7 Programme, 359K Bezugsgrößen).
>
> Entfallen gegenüber Vorversion:
> - ~~`sat_projekttaetigkeit`~~ — NTC hat keine Projekt-Spalten (PRONR/POSNR existieren nicht)
> - ~~`sat_leistungsart`~~ — NTR wird Reference Table
> - ~~`sat_person_lohnklasse` (MA SAT)~~ — LTC ist kein Lohnklassen-System; LTC enthält 109 verschiedene Gruppen (Abteilungen, Perioden, etc.) mit 2132 Einträgen. Zu klären ob als Reference Table oder MA SAT.

---

## 4. Links

| Link | Beteiligte Hubs | DC-Sat | Staging-Quelle | Priorität |
|---|---|---|---|---|
| `link_buchungskopf_kreditorenbeleg` | `hub_buchungskopf` ↔ `hub_kreditorenbeleg` | Nein | `ewb_fibu_fhe_main` | P2 |
| `link_hauptbuch_buchungskopf` | `hub_hauptbuch` ↔ `hub_buchungskopf` | Nein | `ewb_fibu_gl_e2x` | P2 |
| `link_hauptbuch_projekt` | `hub_hauptbuch` ↔ `hub_projekt` | Nein | `ewb_fibu_gl_e2x` | P3 |
| `link_hauptbuch_kreditor` | `hub_hauptbuch` ↔ `hub_kreditor` | Nein | `ewb_fibu_gl_e2x` | P3 |
| `link_hauptbuch_konto` | `hub_hauptbuch` ↔ `hub_konto` | Nein | `ewb_fibu_gl_e2x` | P3 |
| `link_hauptbuch_kostenstelle` | `hub_hauptbuch` ↔ `hub_kostenstelle` | Nein | `ewb_fibu_gl_e2x` | P3 |
| `link_kreditorenbeleg_kreditor` | `hub_kreditorenbeleg` ↔ `hub_kreditor` | Nein | `ewb_kred_kbl_main` | P2 |
| `link_kreditorenbeleg_zahlung` ⁵ | `hub_kreditorenbeleg` ↔ `hub_zahlung` | Nein | `ewb_kred_kvl_main` | P3 |
| `link_projektsachkonto_projekt` ⁹ | `hub_projektsachkonto` ↔ `hub_projekt` | Nein | `ewb_proj_nsa_main` | P3 |
| `link_zeiterfassung_person` ¹⁰ | `hub_zeiterfassung` ↔ `hub_person` | Nein | `ewb_proj_ntc_main` | P3 |
| `link_projektteil_projekt` | `hub_projekt` (PRT.PROJNR → NPO.PROJNR) | Nein | `ewb_proj_prt_main` | P3 |
| `link_person_adresse` | `hub_person` ↔ `hub_adresse` | Nein | `ewb_publ_adr_main` ¹¹ | P1 |

> ⁵ **Aus Synapse `Finance.Belege` abgeleitet:** `KBL.BELNR = KVL.DOCUMENTNR`. Dieser JOIN bildet die natürliche Beziehung Beleg↔Zahlung ab.  
> ⁹ **NEU (14.3.2026):** `NSA.PROJNR = NPO.PROJNR` — Datenanalyse bestätigt: 97.5% (11.600 von 11.895 distinkten PROJNR-Werten) matchen direkt auf Projekte. Projektzuordnung ist direkt aus NSA ableitbar. `NSA.CODE = NTR.RECNUM` (70% Match) für Leistungsart-Bezug — im Mart via `ref_leistungsart` aufgelöst.  
> ¹⁰ **NEU (14.3.2026):** `NTC.EMPLNR = LEN.EMPL_NR` — 100% Match (206 von 206 NTC-Mitarbeitern). NTC = tägliche Zeitstempelung pro Mitarbeiter.
> ¹¹ **NEU (15.3.2026):** `ADR.LOHNNR = LEN.EMPL_NR` — Synapse `Projekt.Personal` nutzt diesen JOIN. Link verbindet Mitarbeiter mit ihrer Adresse. Staging-Quelle: `ewb_publ_adr_main` (hat beide Schlüssel: `INR` für hk_adresse, `LOHNNR` für hk_person).
>
> Entfallen gegenüber Vorversion:
> - ~~`link_stundenbuchung_person`~~ — NSA hat **keine** Mitarbeiter-Spalte. Der Synapse-Join `PROJNR = LOHNNR` ist ein Fehler (nur 2.5% Match).
> - ~~`link_stundenbuchung_leistungsart`~~ — NSA.CODE→NTR wird im Mart via Reference Table aufgelöst, kein Hub-Link nötig.
> - ~~`link_projekttaetigkeit_projekt`~~ — NTC hat keine Projekt-Spalten.

---

## 5. Implementierungs-Wellen

### Wave 1 — Stammdaten (keine FK-Abhängigkeiten, sofort deploybar)

**Staging:**
- `ewb_lohn_len_main`
- `ewb_publ_adr_main`
- `ewb_proj_npo_main`
- `ewb_proj_ntr_main`
- `ewb_kred_kbs_main`

**Raw Vault:**
- Hubs: `hub_person`, `hub_adresse`, `hub_projekt`, `hub_kreditor`
- Sats: `sat_person`, `sat_person_adresse`, `sat_projekt`, `sat_kreditor`
- Links: `link_person_adresse`
- Reference Tables: `ref_leistungsart` (NTR), `ref_projektstatus` (PST), `ref_abteilung` (LTC)

### Wave 2 — Transaktionsobjekte

**Voraussetzung:** Wave 1 deployed (F1 gelöst ✅ — Composite BK `DKBELEGNUMMER||KTO` bestätigt)

**Staging:**
- `ewb_fibu_fhe_main` (bereits vorhanden ✅)
- `ewb_kred_kbl_main`
- `ewb_fibu_gl_e22` bis `ewb_fibu_gl_e26` (Union oder 5 Views)

**Raw Vault:**
- Hubs: `hub_buchungskopf`, `hub_hauptbuch`, `hub_kreditorenbeleg`
- Sats: `sat_buchungskopf`, `sat_hauptbuch`, `sat_kreditorenbeleg`
- Links: `link_buchungskopf_kreditorenbeleg`, `link_hauptbuch_buchungskopf`, `link_kreditorenbeleg_kreditor`

### Wave 3 — Komplexe Links + Projekt-Domain

**Voraussetzung:** Wave 2 deployed

**Staging:**
- `ewb_kred_kvl_main`
- `ewb_proj_ntc_main`
- `ewb_proj_ntb_main` (ggf. Mart-Level)
- `ewb_proj_nsa_main`
- `ewb_proj_prt_main`

**Raw Vault:**
- Hubs: `hub_zahlung`, `hub_zeiterfassung`, `hub_projektsachkonto`
- Sats: `sat_zahlung`, `sat_zeiterfassung`, `sat_projektsachkonto`, `sat_projektteil`
- Links: `link_kreditorenbeleg_zahlung`, `link_projektsachkonto_projekt`, `link_zeiterfassung_person`, `link_projektteil_projekt` + alle GL-Dimension-Links

---

## 6. Staging-Reihenfolge (19 Views)

| Rang | Staging-View | Begründung |
|---|---|---|
| 1 | `ewb_lohn_len_main` | `hub_person` — meiste FK-Konsumenten, Wave-1-Basis |
| 2 | `ewb_publ_adr_main` | `sat_person_adresse` — keine eigene Dep., Integration mit LEN |
| 3 | `ewb_proj_npo_main` | `hub_projekt` — zentrale Entity Projekt-Domain |
| 4 | `ewb_proj_ntr_main` | `ref_leistungsart` — 29 Leistungsarten als Reference Table |
| 5 | `ewb_kred_kbs_main` | `hub_kreditor` — benötigt von KBL und GL |
| 6 | `ewb_fibu_fhe_main` | `hub_buchungskopf` — bereits als Goldbeispiel vorhanden ✅ |
| 7 | `ewb_kred_kbl_main` | `hub_kreditorenbeleg` — FK zu Kreditor (Dep. Wave 1) |
| 8 | `ewb_fibu_gl_e22` | FIBU.GL — Jahresscheibe 2022 |
| 9 | `ewb_fibu_gl_e23` | FIBU.GL — Jahresscheibe 2023 |
| 10 | `ewb_fibu_gl_e24` | FIBU.GL — Jahresscheibe 2024 |
| 11 | `ewb_fibu_gl_e25` | FIBU.GL — Jahresscheibe 2025 |
| 12 | `ewb_fibu_gl_e26` | FIBU.GL — Jahresscheibe 2026 |
| 13 | `ewb_kred_kvl_main` | `hub_zahlung` — FK zu KBL (Dep. #7) |
| 14 | `ewb_proj_pst_main` | `ref_projektstatus` — 7 Statuswerte als Reference Table |
| 15 | `ewb_proj_prt_main` | `sat_projektteil` — Projektstatus-Historie, FK zu NPO |
| 16 | `ewb_proj_ntc_main` | `hub_zeiterfassung` — Zeitstempelung pro Mitarbeiter/Tag |
| 17 | `ewb_proj_ntb_main` | Budget-Verwaltung — keine direkte NTC-Beziehung, ggf. Mart-Level |
| 18 | `ewb_proj_nsa_main` | `hub_projektsachkonto` — Projekt-Buchhaltung per Periode |
| 19 | `ewb_lohn_ltc_main` | `ref_abteilung` — Abteilungen/Gruppen als Reference Table |

---

## 7. Offene Design-Fragen (vor Implementierungsstart klären)

### F1 — FIBU.GL Business Key: Composite oder einfach? — **GELÖST** ✅

**Ergebnis (13. März 2026 — Datenanalyse `stg.ext_ewb_fibu_gl_e25`):**

Dieselbe `DKBELEGNUMMER` erscheint auf **mehreren Konten** (Soll/Haben-Buchung). Datenbeleg:

| Typ | Belegnummern | Zeilen |
|---|---:|---:|
| Eindeutig (1 KTO) | 6.800 | 6.800 |
| Mehrfach (2+ KTO) | 2.784 | 14.906 |

29% aller Belegnummern erscheinen auf 2–5 verschiedenen Konten (z.B. Beleg 204188 → 22 Zeilen auf 5 Konten).

**→ Option A bestätigt:** Composite BK `DKBELEGNUMMER||KTO` ist zwingend. Jede Buchungszeile ist eine eigene Hub-Instanz.

> Hinweis: Spaltenname im Parquet ist `DKBELEGNUMMER` (nicht `BELEGNR` wie in Synapse-Views).

### F2 — PROJ.NSA: PROJNR-Semantik und Tabellenstruktur — **GELÖST** ✅

**Ergebnis (14. März 2026 — Datenanalyse):**

| Test | Ergebnis |
|---|---|
| NSA.PROJNR → NPO.PROJNR | **97.5%** Match (11.600 von 11.895 distinkten Werten) |
| NSA.PROJNR → ADR.LOHNNR | **2.5%** Match (297 Werte — zufällige Überlappung) |
| NSA.CODE → NTR.RECNUM | 70% Match (273 von 388 Codes) |

**→ PROJNR in NSA = ProjektNr** (nicht PersonalNr!)

Die Synapse-View `Projekt.Stunden` enthält einen **Fehler**: `INNER JOIN ADR ON PROJNR = LOHNNR` filtert 97.5% der Daten weg. Die DV-Implementierung korrigiert dies.

**NSA-Struktur (277.834 Zeilen):**
- BK: `PROJNR||CODE||PERIYEAR||PERIMONTH||GB` = Projekt × Leistungsart × Periode × Geschäftsbereich
- Semantik: **Projektsachkonto** (Budget/Ist-Vergleich pro Projekt und Periode), NICHT Stundenbuchung
- Keine Mitarbeiter-Spalte vorhanden → kein `link_projektsachkonto_person` möglich
- Hub umbenannt: ~~`hub_stundenbuchung`~~ → `hub_projektsachkonto`

**NTC-Struktur (Zeitstempelung — 34 Spalten):**
- Tatsächliche Spalten: `RECNUM, DATASET, EMPLNR, PROJDAT, FROM1-TO10, ANZAHL, USER_F, MUTDAT, VARDATA`
- **KEINE** Spalten `PRONR` oder `POSNR` vorhanden!
- BK: `EMPLNR||PROJDAT` (ein Eintrag pro Mitarbeiter pro Tag)
- NTC.EMPLNR → LEN.EMPL_NR: **100%** Match (206 Mitarbeiter)
- Hub umbenannt: ~~`hub_projekttaetigkeit`~~ → `hub_zeiterfassung`

**NTB-Struktur (Budget — 7 Spalten):**
- Spalten: `RECNUM, PRG, BEZ, LETZTMALS, USER_F, TEXT, VARDATA`
- 707.733 Zeilen, 7 Programme (PRG), 359.382 Bezugsgrößen (BEZ)
- Kein direkter Bezug zu NTC — eigenständiges Budget-System
- BEZ = Kostenstellennummern/Projektnummern

### F3 — PROJ.NTR: Hub oder Reference Table? — **GELÖST** ✅

**Ergebnis (14. März 2026 — Datenanalyse):**

| Metrik | Wert |
|---|---|
| Total Zeilen | 1.000 |
| Distinkte NUMBER-Werte | **29** |
| Distinkte DATASET-Werte | 3 |
| Spalten | RECNUM, DATASET, NUMBER, DESCRIPTION, TYPE, CONDITION, VARIANT, NEXTVARIANT, INAKTIV, VISUM, RULESETTYPE |

Beispieldaten: "Normalzeit", "Überzeit ohne Zuschlag", "Bezug Überzeit", "Bezug Ferien"

**→ Reference Table** `ref_leistungsart` empfohlen:
- Nur 29 echte Leistungsarten — kleiner Lookup
- Kein Historisierungsbedarf (stabile Codes)
- Im Mart: `NSA.CODE = NTR.RECNUM` (via NUMBER als fachlicher Schlüssel)
- Implementierung: dbt Seed oder External Table mit View

**PST ebenfalls Reference Table** (7 Einträge = Projektstatus-Lookup):
- `ref_projektstatus` mit Werten wie "Aktiv", "zum Fakturieren"

**LTC als Reference Table** (Abteilungen + Gruppen):
- 2.132 Zeilen, 109 Gruppen, 663 NRs
- GROUP=1 = Abteilungen (für Mart-Filter relevant)
- `ref_abteilung` mit `GROUP=1` Filter für Mart `v_abteilung`

### F4 — Sharepoint-Datenquellen: Reference Tables oder Mart-Level?

Via `Manual Data landingzone`-Pipeline werden 6 Sharepoint-Tabellen als Direktkopien (ohne Transformation) nach `structured-tables/Finance/` geladen. Zusätzlich nutzt `Projekt.Projekt` 2 weitere Sharepoint-Tabellen (`KategorisierungProjekte`, `ProjekteKategorien`) im JOIN.

**Relevante Tabellen:**
- `Sharepoint.Konten` — Kontenplan (löst Lücke #4 für `hub_konto`)
- `Sharepoint.Kostenstellen` — Kostenstellenstamm (löst Lücke #4 für `hub_kostenstelle`)
- `Sharepoint.Budget` / `Sharepoint.Forecast` / `Sharepoint.ActualForecast` — Planungsdaten
- `Sharepoint.Zugangsrechte` — Berechtigungen
- `Sharepoint.KategorisierungProjekte` + `Sharepoint.ProjekteKategorien` — Projekt-Kategorisierung

**Klärungsfragen:**
1. Sollen Konten + Kostenstellen als **Reference Tables** im DV importiert werden? (empfohlen — löst Ghost-Record-Problem)
2. Sollen die 2 Kategorisierungs-Tabellen in den DV-Scope? Oder nur als Mart-Level-Enrichment beibehalten?
3. Wird eine `landing-zone`-Bereitstellung der Sharepoint-Daten eingerichtet? Aktuell kommen sie nur via Synapse `[Sharepoint].*` Schema.

---

## 8. Kritische Lücken (Synapse vs. DV-Scope)

| # | Lücke | Impact | Status | Empfehlung |
|---|---|---|---|---|
| 1 | ~~`Projekt.Stunden` (Synapse) ohne ProjektNr~~ | ~~Synapse-Join-Logik unvollständig~~ | **GELÖST** ✅ | `PROJNR` = **ProjektNr** (97.5% Match zu NPO). Synapse-View `PROJNR = LOHNNR` ist fehlerhaft. |
| 2 | `hub_konto` / `hub_kostenstelle` ohne Stammdaten-Quelle | Ghost Records ohne Beschreibung | Geklärt ✅ | Sharepoint `Finance.Konten` + `Finance.Kostenstellen` als Reference Tables importieren (→ F4) |
| 3 | Sharepoint-Daten in `Projekt.Projekt` | Hybride Quelle (Abacus + Sharepoint) | Offen | Separater `sat_projekt_sharepoint` mit `dss_record_source = 'ewb_sharepoint'` |
| 4 | ~~Keine `Finance.Konten` / `Finance.Kostenstellen` im Pilot-Scope~~ | ~~Stammdaten für Dimensionen fehlen~~ | **GELÖST** ✅ | Konten + Kostenstellen sind als Sharepoint-Referenztabellen verfügbar — Import als Reference Tables empfohlen |
| 5 | ~~`PROJNR`-Semantik unterscheidet sich zwischen Tabellen~~ | ~~Verwechslungsgefahr~~ | **GELÖST** ✅ | **Keine Kollision!** `PROJNR` = ProjektNr in ALLEN Tabellen (NPO, NSA). Synapse-Interpretation als PersonalNr war **falsch**. |
| 6 | **NTC ≠ Projekttätigkeiten** | Hub-Redesign nötig | **NEU → GELÖST** ✅ | NTC = Zeitstempelung (EMPLNR+PROJDAT). Kein PRONR/POSNR. → `hub_zeiterfassung` statt `hub_projekttaetigkeit` |
| 7 | **NTB ohne NTC-Bezug** | Budget-Zuordnung unklar | **NEU** | NTB hat eigenes Schema (PRG+BEZ), kein FK zu NTC. Budget-Verknüpfung ggf. über BEZ→NPO.PROJNR im Mart |

---

## 9. Objektzählung (Zusammenfassung)

| Typ | Anzahl | Pilot-Priorität (P1/P2/P3) |
|---|---|---|
| Hubs | 10 (+2 Ghost) | 5×P1, 1×P2, 1×P3 (+2 Ghost) |
| Satellites | 11 | 4×P1, 2×P2, 5×P3 |
| Links | 12 | 1×P1, 3×P2, 8×P3 |
| **Total Vault-Objekte** | **35** | |
| Reference Tables | 3 (NTR, PST, LTC) | + bis zu 8 Sharepoint |
| Staging-Views | 19 | 1 vorhanden, 18 ausstehend |
| Mart Views | 7 | geplant (structured-tables Replika) |

**Implementierungsstand (14. März 2026):**
- Staging: **1/19** implementiert (`ewb_fibu_fhe_main` ✅), 19/19 External Tables in `sources.yml` konfiguriert ✅
- Vault: **0/32** Objekte implementiert
- Mart: **0/7** Views implementiert
- Reference Tables: **0/3** implementiert
- Wave 1 kann **sofort starten** — keine Blocker

### 9b. Infrastruktur-Status (DB: datavault-dev)

| Komponente | Soll | Ist | Status |
|---|---|---|---|
| Schema `stg` | ✅ | ✅ | OK |
| Schema `vault` | ✅ | ✅ | OK |
| Schema `mart_finance` | ✅ | ⏳ | Wird bei erstem `dbt run` erstellt |
| Schema `mart_project` | ✅ | ⏳ | Wird bei erstem `dbt run` erstellt |
| External Data Source `StageFileSystem` | ✅ | ✅ | OK |
| External Tables (EWB) | 19 | 19 | OK ✅ |
| Staging Views (EWB) | 19 | 1 | 🟠 5% |
| ~~Schema `vault_ewb`~~ | — | Gelöscht ✅ | War stale |
| ~~Schema `mart_ewb`~~ | — | Gelöscht ✅ | War stale |
| Ordner `models/raw_vault/_common/hubs/` | ✅ | ✅ | Angelegt ✅ |
| Ordner `models/raw_vault/_common/satellites/` | ✅ | ✅ | Angelegt ✅ |
| Ordner `models/raw_vault/_common/links/` | ✅ | ✅ | Angelegt ✅ |
| Ordner `models/mart/finance/` | ✅ | ✅ | Angelegt ✅ |
| Ordner `models/mart/project/` | ✅ | ✅ | Angelegt ✅ |

---

## 10. Mart Views (structured-tables Replika)

Die 7 Synapse `structured-tables` Views werden als Mart Views auf dem Raw Vault repliziert. Die Business-Logik wird dabei 1:1 aus den Synapse-SQL-Transformationen übernommen.

### 10a. Übersicht

| Synapse View | Mart-Modell | Quell-Vault-Objekte | Business-Logik |
|---|---|---|---|
| Finance.Buchungen | `mart_finance.v_buchungen` | `hub_hauptbuch` + `sat_hauptbuch` + `hub_konto` + `hub_kostenstelle` | 4-way UNION ALL, Vorzeichen-Flip, MWST-Anpassung, KST-Filter |
| Finance.Belege | `mart_finance.v_belege` | `hub_kreditorenbeleg` + `sat_kreditorenbeleg` + `link_kreditorenbeleg_zahlung` | JOIN KBL + KVL via BELNR/DOCUMENTNR |
| Finance.Kunden | `mart_finance.v_kunden` | `hub_adresse` + `sat_person_adresse` (bevorzugt), alternativ `hub_kreditor` + `sat_kreditorenbeleg` | Denorm aus KBL — besser über PUBL.ADR auflösen |
| Projekt.Personal | `mart_project.v_personal` | `hub_person` + `sat_person` + `hub_adresse` + `sat_person_adresse` | ADR+LEN, Mitarbeiter-Filter (`LOHNJN=1, GESPERRT=0`), Initialen-Dedup |
| Projekt.Stunden | `mart_project.v_stunden` | `hub_projektsachkonto` + `sat_projektsachkonto` + `link_projektsachkonto_projekt` + `ref_leistungsart` | ⚠️ Synapse-Logik KORRIGIERT: NSA.PROJNR→NPO.PROJNR (Projekt), CODE→NTR (Leistungsart), Datum aus PERIYEAR/PERIMONTH |
| Projekt.Projekt | `mart_project.v_projekt` | `hub_projekt` + `sat_projekt` + `ref_projektstatus` + ref_tables | NPO+PST(Dedup)+Sharepoint-Kategorien (2 Tabellen) |
| Projekt.Abteilung | `mart_project.v_abteilung` | `hub_person` + `sat_person` + `ref_abteilung` | LEN+LTC, `GROUP=1` Filter, MUTATION_DATE |

### 10b. Kritische Business-Regeln (zu konservieren)

**Finance.Buchungen — Vorzeichen-Logik:**
```
Part 1: SH='S', Perspektive KTO  → Betrag NEGATIV (mit MWST-Anpassung), KST=KST, KTO=KTO
Part 2: SH='S', Perspektive GKTO → Betrag POSITIV,                     KST=KST2, KTO=GKTO
Part 3: SH='H', Perspektive KTO  → Betrag POSITIV,                     KST=KST, KTO=KTO
Part 4: SH='H', Perspektive GKTO → Betrag NEGATIV,                     KST=KST2, KTO=GKTO
```

**Finance.Buchungen — MWST-Anpassung:**
```sql
CASE WHEN MWSTTYP = '5' OR MWSTINCL = 'E'
    THEN BETRAG                 -- Netto (Vorsteuer oder inklusiv Typ E)
    ELSE BETRAG + MWSTBETR      -- Brutto = Netto + MWST
END
```

**Finance.Buchungen — Filter:**
- `SAM <> '#'` — Sammelbuchungen ausschliessen
- `KST NOT IN (2990, 3990, 4990, 5990, 6990, 7990)` — Konsolidierungs-Kostenstellen
- `KTO > 30000 AND KTO < 90000` — Nur Erfolgsrechnungs-Konten (P&L)

**Projekt.Personal — Mitarbeiter-Filter + Initialen-Deduplizierung:**
- `LOHNJN = '1'` — Ist Lohnempfänger
- `GESPERRT = '0'` — Nicht gesperrt
- `LOHNNR <> 0` — Gültige Personalnummer
- Deduplizierung über `ABRV` (Initialen):
  ```sql
  ROW_NUMBER() OVER (PARTITION BY ABRV ORDER BY MUTDAT DESC) = 1
  ```
  → Bei mehrfachen Einträgen pro Kürzel wird nur der zuletzt mutierte behalten.

**Projekt.Stunden — ⚠️ KORREKTUR gegenüber Synapse:**
- Synapse joint `NSA.PROJNR = ADR.LOHNNR` und nennt PROJNR "PersonalNr" — **FEHLER** (nur 2.5% Match)
- DV-Korrektur: `NSA.PROJNR = NPO.PROJNR` für Projektzuordnung (97.5% Match)
- Synapse-Filter `AZBETINT <> 0` → Mart-Logik beibehalten

**Projekt.Stunden — Datum-Konstruktion:**
```sql
DATEFROMPARTS(
    CASE WHEN COALESCE(PERIYEAR, 1900) = 0 THEN 1900 ELSE COALESCE(PERIYEAR, 1900) END,
    CASE WHEN COALESCE(PERIMONTH, 1) = 0 THEN 1 ELSE COALESCE(PERIMONTH, 1) END, 1)
```

**Projekt.Projekt — Status-Dedup:** `LEN(TRIM(BEZEICHN)) > 2` für sinnvolle Statusbezeichnungen

**Projekt.Abteilung — Abteilungs-Filter:** `LTC.GROUP = 1` (nur Abteilungstyp, keine anderen Gruppierungen)

---

## 11. Sharepoint Reference Tables

Aus der `Manual Data landingzone`-Pipeline und den Projekt-Views wurden **8 Sharepoint-Tabellen** identifiziert. Diese stammen aus dem Synapse `[Sharepoint].*` Schema und sind **nicht Teil des Abacus `landing-zone` Scopes**.

### 11a. Direktkopien (ohne Transformation)

| Sharepoint-Tabelle | structured-tables Pfad | Beschreibung | DV-Relevanz |
|---|---|---|---|
| `Sharepoint.Budget` | `Finance/Budget/Main.parquet` | Budget-Daten (manuell gepflegt) | Planungsdaten für Mart |
| `Sharepoint.Konten` | `Finance/Konten/Main.parquet` | Kontenplan | **Hoch** — löst Ghost-Record-Problem `hub_konto` |
| `Sharepoint.Kostenstellen` | `Finance/Kostenstellen/Main.parquet` | Kostenstellenstamm | **Hoch** — löst Ghost-Record-Problem `hub_kostenstelle` |
| `Sharepoint.Zugangsrechte` | `Finance/Zugangsrechte/Main.parquet` | Berechtigungen | Gering — operativ, nicht analytisch |
| `Sharepoint.Forecast` | `Finance/Forecast/Main.parquet` | Finanz-Forecast | Planungsdaten für Mart |
| `Sharepoint.ActualForecast` | `Finance/ActualForecast/Main.parquet` | Actual vs. Forecast | Planungsdaten für Mart |

### 11b. Projekt-Enrichment (via JOIN in Synapse-Views)

| Sharepoint-Tabelle | Verwendet in | JOIN-Logik | Beschreibung |
|---|---|---|---|
| `Sharepoint.KategorisierungProjekte` | `Projekt.Projekt` | `NPO.PROJNR = KategorisierungProjekte.Projektnummer` | Projektnummer → Kategorie-Zuordnung |
| `Sharepoint.ProjekteKategorien` | `Projekt.Projekt` | `KategorisierungProjekte.KategorieNr = ProjekteKategorien.KategorieNr` | Kategorie-Nr → Kategorie-Name (Hauptgruppe) |

### 11c. Entscheidung ausstehend (→ F4)

**Option A — Reference Tables im DV:**
- Konten + Kostenstellen als `ref_konto` / `ref_kostenstelle` importieren (dbt Seed oder External Table)
- Vorteile: Ghost-Record-Problem gelöst, Stammdaten im DV verfügbar
- `dss_record_source = 'ewb_sharepoint'`

**Option B — Mart-Level JOIN:**
- Sharepoint-Tabellen nur in Mart Views als Lookup-Quellen verwenden
- Vorteile: Kein zusätzlicher DV-Scope, einfachere Architektur
- Nachteil: Keine Historisierung der Referenzdaten

> **Empfehlung:** Option A für Konten + Kostenstellen (kritische Dimensionen), Option B für Budget/Forecast/Kategorien (Planungs- und Enrichment-Daten).

*EWB Analytics Platform | PPMC AG | Stand: 14. März 2026*
