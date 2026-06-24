# Raw Vault Implementierungsplan — EWB DV2.1

**Erstellt:** 12. März 2026 | **Aktualisiert:** 17. April 2026  
**Agenten:** synapse-validator + vault-architect + db-monitor + staging-engineer  
**Scope:** 19 Pilot-Tabellen (Finance + Projects) + 8 Sharepoint-Referenztabellen

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
| `hub_hauptbuch` | RECNUM ² | `RECNUM` | `ewb_fibu_gl` | `hk_hauptbuch` | P1 |
| `hub_kreditorenbeleg` | Belegnummer | `BELNR` | `ewb_kred_kbl_main` | `hk_kreditorenbeleg` | P2 ✅ |
| `hub_zahlung` | Beleg + Zahlnr | `BELEGNR\|\|ZAHLNR` | `ewb_kred_kvl_main` | `hk_zahlung` | P3 ✅ |
| `hub_kreditor` | Kreditoren-Nr | `KNR` | `ewb_kred_kbl_main` (Ghost Hub) | `hk_kreditor` | P2 ✅ |
| `hub_adresse` | Adressnummer | `INR` | `ewb_publ_adr_main` | `hk_adresse` | P1 |
| `hub_projekt` | Projektnummer | `PROJNR` | `ewb_proj_npo_main` | `hk_projekt` | P1 |
| ~~`hub_projekttaetigkeit`~~ | ~~Projekt + Positionsnr~~ | ~~`PRONR\|\|POSNR`~~ | ~~`ewb_proj_ntc_main`~~ | — | ~~P3~~ |
| `hub_zeiterfassung` ⁸ | Mitarbeiter + Tag | `EMPLNR\|\|PROJDAT` | `ewb_proj_ntc_main` | `hk_zeiterfassung` | P3 |
| `hub_projektsachkonto` ⁴ | Projekt + Code + Periode + Dataset | `PROJNR\|\|CODE\|\|PERIYEAR\|\|PERIMONTH\|\|GB\|\|DATASET` | `ewb_proj_nsa_main` | `hk_projektsachkonto` | P3 |
| `hub_person` | Personalnummer | `EMPL_NR` | `ewb_lohn_len_main` | `hk_person` | P1 |
| `hub_projektteil` | Projektteil-Nr | `RECNUM` | `ewb_proj_prt_main` | `hk_projektteil` | P3 ✅ |

> ¹ Klärungsbedarf → Offene Frage F1 — **GELÖST**: Composite BK `DKBELEGNUMMER||KTO` bestätigt  
> ² **BK-Korrektur (29.3.2026):** `DKBELEGNUMMER||KTO` war NICHT unique (62% Nullen, bis zu 96 Duplikate). `RECNUM` ist der einzig unique Identifier auf Zeilenebene. Staging-Quelle von `ewb_fibu_gl_e2x` auf `ewb_fibu_gl` geändert (Folder-Scan aller Jahresscheiben).
> ⁴ **Korrigiert (14.3.2026, erweitert 29.3.2026):** `PROJNR` in NSA = **ProjektNr** (97.5% Match zu NPO.PROJNR, datenbestätigt). DATASET ist fachlich relevant (10 Datasets mit unterschiedlichen Beträgen) und wurde am 29.3. zum Composite BK hinzugefügt. BK-Semantik: `ProjektNr||LeistungsartNr||Jahr||Monat||Geschäftsbereich||Dataset`.  
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
| `sat_buchungskopf` | `hub_buchungskopf` | STD | **20 Spalten** (getrimmt von 57) — PLAN, LEVEL, VARIANTE, TYP, REF_ID, ID, GUID, ENTERPRISE, Audit | `ewb_fibu_fhe_main` | P1 ✅ |
| `sat_hauptbuch` | `hub_hauptbuch` | STD | **34 Spalten** (getrimmt von 178, Synapse-aligned) — Core GL + MWST + Fremdwährung + Projekt + Konsolidierung | `ewb_fibu_gl` | P2 ✅ |
| `sat_kreditorenbeleg` | `hub_kreditorenbeleg` | STD | **33 Spalten** (getrimmt von 116, Synapse-aligned) — Beleg, Finanzen, Skonto, Projekt, Status, Audit | `ewb_kred_kbl_main` | P2 ✅ |
| `sat_zahlung` | `hub_zahlung` | STD | Zahlbetrag, Valuta, Zahlungsart, Konto, Status, ABACUS_USR_NAME, ABACUS_USR_FULL_NAME | `ewb_kred_kvl_main` | P3 ✅ |
| `sat_kreditor` | `hub_kreditor` | STD | ADRID (Kundenname/Adress-ID) | `ewb_kred_kbl_main` (Ghost Hub) | P2 ✅ |
| `sat_projekt` | `hub_projekt` | STD | ProjektName, Inaktiv, GruppeNr, StatusNr, Erstellt | `ewb_proj_npo_main` | P1 ✅ |
| ~~`sat_projekt_status`~~ | — | — | — | — | — | → **Entfällt:** PST = 7 stabile Lookup-Werte → nur `ref_projektstatus` |
| `sat_zeiterfassung` ⁸ | `hub_zeiterfassung` | STD | FROM1-TO10, ANZAHL (Stunden), USER_F | `ewb_proj_ntc_main` | P3 ✅ |
| `sat_projektsachkonto` | `hub_projektsachkonto` | STD | BUDGETINT, BETRAGINT, VORTRAGINT, BUDGETEXT, BETRAGEXT, VORTRAGEXT, AZBUTINT, AZBETINT, AZVORTINT, AZBUTEXT, AZBETEXT, AZVORTEXT | `ewb_proj_nsa_main` | P3 ✅ |
| `sat_person` | `hub_person` | STD | **20 Spalten (datenbasiert)** — Identität: EMPL_ID, LAST_NAME, FIRST_NAME, ABRV, BADGE_ID, BIRTHDAY, SEX, NATIONALITY, BIRTH_PLACE — Anstellung: HOME_DEPT_NR, ADR_INR, DATE_IN, DATE_OUT, TYPE, MUTATION_DATE, LPE_YEAR, LPE_MONTH — CH-SV: SOC_INSURANCE_NR — Compliance: RELEVANT_FOR_LOGIB, ZEMIS_NR | `ewb_lohn_len_main` | P1 ✅ |
| `sat_person_adresse` | `hub_adresse` | STD | Name, Vorname, Strasse, PLZ, Ort | `ewb_publ_adr_main` | P2 ✅ |
| `sat_projektteil` | `hub_projektteil` | STD | DATE, STAT1, STAT2, USER_F (4 Spalten) | `ewb_proj_prt_main` | P3 ✅ |

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
| ~~`link_buchungskopf_kreditorenbeleg`~~ | ~~`hub_buchungskopf` ↔ `hub_kreditorenbeleg`~~ | — | — | ❌ ENTFÄLLT (kein direkter FK) |
| `link_hauptbuch_buchungskopf` | `hub_hauptbuch` ↔ `hub_buchungskopf` | Nein | `ewb_fibu_gl` | P2 ✅ |
| `link_hauptbuch_projekt` | `hub_hauptbuch` ↔ `hub_projekt` | Nein | `ewb_fibu_gl` | P3 ✅ |
| `link_hauptbuch_kreditor` | `hub_hauptbuch` ↔ `hub_kreditor` | Nein | `ewb_fibu_gl` | P3 ✅ |
| `link_hauptbuch_konto` | `hub_hauptbuch` ↔ `hub_konto` | Nein | `ewb_fibu_gl` | P3 ✅ |
| `link_hauptbuch_kostenstelle` | `hub_hauptbuch` ↔ `hub_kostenstelle` | Nein | `ewb_fibu_gl` | P3 ✅ |
| `link_kreditorenbeleg_kreditor` | `hub_kreditorenbeleg` ↔ `hub_kreditor` | Nein | `ewb_kred_kbl_main` | P2 ✅ |
| `link_kreditorenbeleg_zahlung` ⁵ | `hub_kreditorenbeleg` ↔ `hub_zahlung` | Nein | `ewb_kred_kvl_main` | P3 ✅ |
| `link_projektsachkonto_projekt` ⁹ | `hub_projektsachkonto` ↔ `hub_projekt` | Nein | `ewb_proj_nsa_main` | P3 ✅ |
| `link_zeiterfassung_person` ¹⁰ | `hub_zeiterfassung` ↔ `hub_person` | Nein | `ewb_proj_ntc_main` | P3 ✅ |
| `link_projektteil_projekt` | `hub_projektteil` ↔ `hub_projekt` (PRT.PROJNR → NPO.PROJNR) | Nein | `ewb_proj_prt_main` | P3 ✅ |
| `link_person_adresse` | `hub_person` ↔ `hub_adresse` | Nein | `ewb_publ_adr_main` ¹¹ | P1 ✅ |

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

### Wave 1 — Stammdaten (keine FK-Abhängigkeiten, sofort deploybar) — ✅ DEPLOYED (28.3.2026)

**Staging:**
- `ewb_lohn_len_main` ✅
- `ewb_publ_adr_main` ✅
- `ewb_proj_npo_main` ✅
- `ewb_proj_ntr_main` ✅
- `ewb_proj_pst_main` ✅
- `ewb_proj_nsa_main` ✅
- `ewb_proj_ntc_main` ✅
- `ewb_lohn_ltc_main` ✅

**Raw Vault:**
- Hubs: `hub_person` ✅, `hub_adresse` ✅, `hub_projekt` ✅, `hub_projektsachkonto` ✅, `hub_zeiterfassung` ✅
- Sats: `sat_person` ✅, `sat_person_adresse` ✅, `sat_adresse_kontakt` ✅, `sat_projekt` ✅, `sat_projektsachkonto` ✅, `sat_zeiterfassung` ✅
- Links: `link_adresse_person` ✅, `link_zeiterfassung_person` ✅, `link_projektsachkonto_projekt` ✅
- Reference Tables: `ref_leistungsart` (NTR) ✅, `ref_projektstatus` (PST) ✅, `ref_abteilung` (LTC) ✅

> **Deployed auf `datavault-dev`:** 27/27 Modelle erfolgreich (28.3.2026, 184s, 0 Fehler).  
> **Korrektur (28.3.2026):** `hub_kreditor` + `sat_kreditor` nach Wave 2 verschoben. `KRED.KBS` enthält keine Kreditoren-Stammdaten (kein LIEFNR, SALDO, KONTO) — ist eine Status-Konfigurationstabelle (STATID/STATDEF). `hub_kreditor` wird als Ghost Hub aus `KBL.KNR` abgeleitet.

### Wave 2 — Transaktionsobjekte — ✅ COMPLETE (29.3.2026)

**Voraussetzung:** Wave 1 deployed (F1 gelöst ✅ — BK korrigiert: RECNUM statt DKBELEGNUMMER||KTO)

**Staging:**
- `ewb_fibu_fhe_main` (bereits vorhanden ✅, Hashdiff getrimmt 57→20)
- `ewb_fibu_gl` ✅ (Folder-Scan aller Jahresscheiben E22-E26+, Hashdiff getrimmt 178→34)
- `ewb_kred_kbl_main` ✅ (Hashdiff getrimmt 116→33)
- `ewb_kred_kbs_main` ✅ (Status-Konfiguration → `ref_kred_buchungsstatus`)

**Raw Vault:**
- Hubs: `hub_buchungskopf` ✅, `hub_hauptbuch` ✅, `hub_kreditorenbeleg` ✅, `hub_kreditor` ✅ (Ghost Hub aus KBL.KNR)
- Sats: `sat_buchungskopf__abacus` ✅ (20 Spalten), `sat_hauptbuch__abacus` ✅ (34 Spalten), `sat_kreditorenbeleg__abacus` ✅ (33 Spalten), `sat_kreditor__abacus` ✅ (2 Spalten: ADRID, FADRINR)
- Links: `link_kreditorenbeleg_kreditor` ✅, `link_hauptbuch_buchungskopf` ✅
- Refs: `ref_kred_buchungsstatus` ✅ (16 Statuseinträge)
- Current Views: 4× `sat_*_current_v` ✅
- ~~`link_buchungskopf_kreditorenbeleg`~~ ❌ ENTFÄLLT

> **Column Trimming (29.3.2026):** Satellite-Payloads wurden Synapse-aligned getrimmt:
> - `sat_buchungskopf__abacus`: 57 → 20 Spalten (entfernt: APP*/SYS*-Reserve, Formatierung)
> - `sat_hauptbuch__abacus`: 178 → 34 Spalten (behalten: Core GL + MWST + FW + Projekt + Konsolidierung)
> - `sat_kreditorenbeleg__abacus`: 116 → 33 Spalten (behalten: Beleg/Status/Finanzen/Skonto/Projekt/Audit)
> - `sat_kreditor__abacus`: 2 Spalten (ADRID + FADRINR, beide 100% befüllt, 1:1 pro KNR)

> **Deployed auf `datavault-dev`:** 56/56 Tests PASS. Row Counts: hub_buchungskopf=60.377, hub_kreditorenbeleg=93.589, hub_kreditor=3.159, alle Sats/Links identisch.
>
> **⚠️ ADF Pipeline Fix (31.3.2026):** `Copy_FIBU_GL_Folder` hatte einen Bug: `cw_fileName: "*"` führte dazu, dass alle GL-Parquet-Dateien zu einer einzigen Datei gemerged wurden (hub_hauptbuch hatte nur 9.868 Zeilen statt 433.076). Fix: `PreserveHierarchy` + leerer fileName (Commit `9a46c031`). Nach Korrektur + Full DB Reset wurden alle GL-abhängigen Objekte korrekt befüllt:
> - hub_hauptbuch: **433.076** Zeilen (vorher 9.868 — Faktor 44×)
> - sat_hauptbuch__abacus: **943.844** Zeilen
> - link_hauptbuch_buchungskopf: **558.049** Zeilen
> - link_hauptbuch_konto: **871.726** Zeilen
> - hub_konto (Ghost): **517** Zeilen, hub_kostenstelle (Ghost): **145** Zeilen

> **link_buchungskopf_kreditorenbeleg — ENTFÄLLT (29.3.2026):**
> Datenanalyse: `FHE.REF_ID` matcht nur 48 von 93.589 `KBL.BELNR` Werten (**0,08%**). `REF_ID` ist kein FK zu KBL.
> **Ergebnis:** Es gibt keinen direkten FK zwischen Buchungsköpfen (FHE) und Kreditorenbelegen (KBL) in Abacus.
> Die Verknüpfung läuft indirekt über Hauptbuch-Zeilen (GL): `GL.DKBELEGNUMMER → FHE.RECNUM` + `GL.DKKUNDENNUMMER → KBL.KNR`.
> → Beziehung wird im **Mart Layer** über GL-Joins aufgelöst, kein Raw Vault Link nötig.

### Wave 3 — Komplexe Links + Restliche Objekte — ✅ GL-OBJEKTE POPULATED (31.3.2026)

**Voraussetzung:** Wave 2 deployed ✅, ADF Pipeline Fix ✅ (GL-Daten korrekt geladen)

**Staging:**
- `ewb_fibu_gl` ✅ (erweitert um hk_link_hauptbuch_projekt, hk_link_hauptbuch_kreditor)
- `ewb_kred_kvl_main` ✅ (deployed)
- `ewb_proj_ntb_main` (ggf. Mart-Level)
- `ewb_proj_prt_main` ✅ (deployed)

**Raw Vault:**
- Hubs: `hub_zahlung` ✅, `hub_projektteil` ✅
- Sats: `sat_zahlung__abacus` ✅, `sat_projektteil__abacus` ✅
- Links: `link_hauptbuch_projekt` ✅, `link_hauptbuch_kreditor` ✅, `link_kreditorenbeleg_zahlung` ✅, `link_projektteil_projekt` ✅, `link_hauptbuch_konto` ✅, `link_hauptbuch_kostenstelle` ✅
- Current Views: `sat_projektteil__abacus_current_v` ✅, `sat_zahlung__abacus_current_v` ✅

> **Full DB Reset + Redeploy (31.3.2026):** Alle Objekte gedroppt und frisch aufgebaut nach ADF Pipeline Fix.
>
> **Row Counts (nach Reset):** hub_hauptbuch=433.076, hub_konto=517, hub_kostenstelle=145, sat_hauptbuch__abacus=943.844, link_hauptbuch_buchungskopf=558.049, link_hauptbuch_konto=871.726, fakt_buchungen=13.519.009
>
> **Zero-Count Links (erwartet):**
> - `link_hauptbuch_kostenstelle` = 0 Zeilen (KST ist NULL in GL-Quelle — Kostenstellen werden via GL.KOSTNR nicht als FK geführt)
> - `link_hauptbuch_kreditor` = 0 Zeilen (DKKUNDENNUMMER ist NULL in GL-Quelle)
> - `link_hauptbuch_projekt` = 0 Zeilen (PROJ ist NULL in GL-Quelle)
>
> **Tests (31.3.2026):** 415 PASS, 5 WARN, 1 ERROR
> - ❌ ERROR: `unique_ewb_fibu_gl_hk_hauptbuch` — 67k Duplikate, RECNUM nicht unique über Jahresscheiben hinweg (bekanntes Issue, BK-Korrektur erforderlich)
> - ⚠️ WARN: dim_date FK-Beziehungen (dim_date Range unvollständig) + konto_key Orphans

**Finance Mart (mart_finance):** ✅ DEPLOYED (31.3.2026)
- `dim_konto` ✅ (517 Zeilen), `dim_kostenstelle` ✅ (145 Zeilen), `dim_kreditor` ✅, `dim_buchungsstatus` ✅
- `fakt_belege` ✅, `fakt_buchungen` ✅ (**13.519.009 Zeilen** — 4-way UNION Synapse-Logik)

### Wave 4 — structured-tables Gap Close + Mart-Korrekturen — ✅ COMPLETE (15.4.2026)

**Voraussetzung:** Wave 3 deployed ✅, Synapse-Validator Gap-Analyse ✅

**Gap-Analyse (15.4.2026):** Vollständiger Abgleich aller 13 structured-tables gegen DV-Mart.
9/13 abgedeckt, 4 fehlend: Budget (52'693 Zeilen), Forecast (13'163), ActualForecast (24), Zugangsrechte (27).
1 unvollständig: dim_projekt (3 Sharepoint-Spalten fehlend).

**Mart-Korrekturen:**
- `dim_projekt` ✅ — Erweitert um 3 Sharepoint-Spalten: `gruppe_name` (via ewb_sp_kostenstellen), `hauptgruppe_nr` + `hauptgruppe_name` (via ewb_sp_kategorisierungprojekte + ewb_sp_projektekategorien). ~260/14'198 Projekte mit Hauptgruppe.
- `dim_person` ✅ — `NULLIF(abrv, '')` Fix für person_code Leerstring-Bug

**Neue Mart-Views (Sharepoint-Planungsdaten):**
- `fakt_budget` ✅ — Budget-Daten (Datum, Szenario, KST, Konto, Betrag). FK: dim_konto, dim_kostenstelle, dim_date.
- `fakt_forecast` ✅ — Forecast-Daten (identische Struktur wie Budget). FK: dim_konto, dim_kostenstelle, dim_date.
- `ref_actual_forecast` ✅ — Lookup: Monat → "Actual"/"Forecast" (24 Zeilen).

**Out of Scope:**
- `Finance.Zugangsrechte` — Operativ/RLS (27 Zeilen), nicht analytisch. Staging vorhanden falls später nötig.
- `PROJ.NTB.Main` — Abacus-internes Budgetsystem. Kein Synapse-View nutzt es.

> **Entscheidung:** Budget/Forecast als Mart-Level Views (nicht Raw Vault) — Sharepoint-Daten ohne Historisierungsbedarf. Quellen sind die bestehenden `ewb_sp_*` Staging-Views.

---

## 6. Staging-Reihenfolge (19 Views)

| Rang | Staging-View | Begründung |
|---|---|---|
| 1 | `ewb_lohn_len_main` | `hub_person` — meiste FK-Konsumenten, Wave-1-Basis |
| 2 | `ewb_publ_adr_main` | `sat_person_adresse` — keine eigene Dep., Integration mit LEN |
| 3 | `ewb_proj_npo_main` | `hub_projekt` — zentrale Entity Projekt-Domain |
| 4 | `ewb_proj_ntr_main` | `ref_leistungsart` — 29 Leistungsarten als Reference Table |
| 5 | ~~`ewb_kred_kbs_main`~~ | ~~`hub_kreditor`~~ — **Verschoben nach Wave 2**: KBS ist Status-Konfiguration, nicht Kreditoren-Stammdaten |
| 6 | `ewb_fibu_fhe_main` | `hub_buchungskopf` — bereits als Goldbeispiel vorhanden ✅ |
| 7 | `ewb_kred_kbl_main` ✅ | `hub_kreditorenbeleg` ✅ + `hub_kreditor` ✅ (Ghost Hub) + `sat_kreditorenbeleg` ✅ + `sat_kreditor` ✅ |
| 8 | `ewb_fibu_gl` ✅ | FIBU.GL — Folder-Scan aller Jahresscheiben E22-E26+ → `hub_hauptbuch` ✅ + `sat_hauptbuch__abacus` ✅ |
| 13 | `ewb_kred_kvl_main` | `hub_zahlung` — FK zu KBL (Dep. #7) |
| 14 | `ewb_proj_pst_main` | `ref_projektstatus` — 7 Statuswerte als Reference Table |
| 15 | `ewb_proj_prt_main` | `sat_projektteil` — Projektstatus-Historie, FK zu NPO |
| 16 | `ewb_proj_ntc_main` | `hub_zeiterfassung` — Zeitstempelung pro Mitarbeiter/Tag |
| 17 | `ewb_proj_ntb_main` | Budget-Verwaltung — keine direkte NTC-Beziehung, ggf. Mart-Level |
| 18 | `ewb_proj_nsa_main` | `hub_projektsachkonto` — Projekt-Buchhaltung per Periode |
| 19 | `ewb_lohn_ltc_main` | `ref_abteilung` — Abteilungen/Gruppen als Reference Table |

---

## 7. Offene Design-Fragen (vor Implementierungsstart klären)

### F1 — FIBU.GL Business Key: Composite oder einfach? — **GELÖST** ✅ (BK-Korrektur 29.3.2026)

**Ergebnis (13. März 2026 — Datenanalyse `stg.ext_ewb_fibu_gl_e25`):**

Dieselbe `DKBELEGNUMMER` erscheint auf **mehreren Konten** (Soll/Haben-Buchung). Datenbeleg:

| Typ | Belegnummern | Zeilen |
|---|---:|---:|
| Eindeutig (1 KTO) | 6.800 | 6.800 |
| Mehrfach (2+ KTO) | 2.784 | 14.906 |

29% aller Belegnummern erscheinen auf 2–5 verschiedenen Konten (z.B. Beleg 204188 → 22 Zeilen auf 5 Konten).

~~**→ Option A bestätigt:** Composite BK `DKBELEGNUMMER||KTO` ist zwingend.~~

**→ BK-Korrektur (29.3.2026):** Auch `DKBELEGNUMMER||KTO` ist **NICHT unique** (62% Nullen, bis zu 96 Duplikate). `RECNUM` ist der einzig unique Identifier auf GL-Zeilenebene. `DKBELEGNUMMER` und `KTO` bleiben als FK-Hash-Keys (`hk_buchungskopf` bzw. `hk_konto`) für Links erhalten, sind aber nicht mehr Teil des Business Key.

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

### F4 — Sharepoint-Datenquellen: Reference Tables oder Mart-Level? ✅ GELÖST

**Status (30.3.2026):** Sharepoint-Integration komplett umgesetzt:
- **Pipeline:** ADF `Copy_LandingZone_to_LoadFS_ewb` (JSON copy) → `Copy_Stage_ewb` (Binary copy) → stage-fs/ewb/sharepoint/
- **External Tables:** 8× `stg.ext_ewb_sp_*_json` (JsonAsCsvFormat + OPENJSON)
- **Staging Views:** 8× `stg.ewb_sp_*` (OPENJSON-Pattern, dss_record_source='ewb_sharepoint')
- **Reference Tables:** `vault.ref_konto` (254 Konten), `vault.ref_kostenstelle` (151 Kostenstellen)
- **Ghost Hubs:** `vault.hub_konto` (GL.KTO), `vault.hub_kostenstelle` (GL.KST)
- **Links:** `vault.link_hauptbuch_konto`, `vault.link_hauptbuch_kostenstelle`

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
| 2 | `hub_konto` / `hub_kostenstelle` ohne Stammdaten-Quelle | Ghost Records ohne Beschreibung | **GELÖST** ✅ | Ghost Hubs aus GL + `ref_konto` / `ref_kostenstelle` aus Sharepoint implementiert (30.3.2026) |
| 3 | Sharepoint-Daten in `Projekt.Projekt` | Hybride Quelle (Abacus + Sharepoint) | Offen | Separater `sat_projekt_sharepoint` mit `dss_record_source = 'ewb_sharepoint'` |
| 4 | ~~Keine `Finance.Konten` / `Finance.Kostenstellen` im Pilot-Scope~~ | ~~Stammdaten für Dimensionen fehlen~~ | **GELÖST** ✅ | Konten + Kostenstellen sind als Sharepoint-Referenztabellen verfügbar — Import als Reference Tables empfohlen |
| 5 | ~~`PROJNR`-Semantik unterscheidet sich zwischen Tabellen~~ | ~~Verwechslungsgefahr~~ | **GELÖST** ✅ | **Keine Kollision!** `PROJNR` = ProjektNr in ALLEN Tabellen (NPO, NSA). Synapse-Interpretation als PersonalNr war **falsch**. |
| 6 | **NTC ≠ Projekttätigkeiten** | Hub-Redesign nötig | **NEU → GELÖST** ✅ | NTC = Zeitstempelung (EMPLNR+PROJDAT). Kein PRONR/POSNR. → `hub_zeiterfassung` statt `hub_projekttaetigkeit` |
| 7 | **NTB ohne NTC-Bezug** | Budget-Zuordnung unklar | **NEU** | NTB hat eigenes Schema (PRG+BEZ), kein FK zu NTC. Budget-Verknüpfung ggf. über BEZ→NPO.PROJNR im Mart |

---

## 9. Objektzählung (Zusammenfassung)

| Typ | Anzahl | Pilot-Priorität (P1/P2/P3) |
|---|---|---|
| Hubs | 14 (+2 Ghost: konto, kostenstelle) **+1 IDMS: idms_address** | 5×P1, 1×P2, 3×P3, 2×Ghost, 1×IDMS ✅ |
| Satellites | 12 **+1 IDMS: sat_idms_address__idms** | 4×P1, 2×P2, 6×P3, 1×IDMS ✅ |
| Links | 11 | 1×P1, 3×P2, 7×P3 ✅ (link_buchungskopf_kreditorenbeleg entfernt — 0.08% FK-Match) |
| **Total Vault-Objekte** | **36** | |
| Marts Finance | 9 | ✅ Wave 3 + Wave 4 (Budget/Forecast/ActualForecast) |
| Marts Project | 5 | ✅ Wave 1 + Wave 4 (dim_projekt erweitert) |
| Marts Common | 2 | ✅ (dim_date, dim_date_helper) |
| Reference Tables | 6 (NTR, PST, LTC, KBS, Konto, Kostenstelle) | 4×Abacus + 2×Sharepoint ✅ |
| Staging-Views | 14 Abacus + 8 Sharepoint = 22 | ✅ COMPLETE |
| Current Views | 12 | ✅ COMPLETE |

**Implementierungsstand (17. Juni 2026):**
- Staging Abacus: **14/15** — `ewb_fibu_fhe_main` ✅, `ewb_fibu_gl` ✅ (5 Jahresscheiben), `ewb_lohn_len_main` ✅, `ewb_publ_adr_main` ✅, `ewb_proj_npo_main` ✅, `ewb_proj_nsa_main` ✅, `ewb_proj_ntc_main` ✅, `ewb_proj_ntr_main` ✅, `ewb_proj_pst_main` ✅, `ewb_proj_prt_main` ✅, `ewb_lohn_ltc_main` ✅, `ewb_kred_kbl_main` ✅, `ewb_kred_kvl_main` ✅, `ewb_kred_kbs_main` ✅ — Fehlend: `ewb_proj_ntb_main` (out of scope, Abacus-Budget ohne Synapse-View)
- Staging Sharepoint: **8/8** — `ewb_sp_konten` ✅, `ewb_sp_kostenstellen` ✅, `ewb_sp_budget` ✅, `ewb_sp_forecast` ✅, `ewb_sp_actualforecast` ✅, `ewb_sp_zugangsrechte` ✅, `ewb_sp_kategorisierungprojekte` ✅, `ewb_sp_projektekategorien` ✅
- **Vault: 36/36** Objekte implementiert — 13 Hubs (+2 Ghost), 12 Sats (+12 current_v), 11 Links
- **IDMS Wave (17.6.2026):** `hub_idms_address` + `sat_idms_address__idms` + `sat_idms_address_current_v` — Staging `idms_address_main` deployed
- Mart: **16/16** Views implementiert — Projekt-Domain ✅, Finance-Domain ✅, Common ✅
- Reference Tables: **6/6** implementiert — `ref_leistungsart` ✅, `ref_projektstatus` ✅, `ref_abteilung` ✅, `ref_kred_buchungsstatus` ✅, `ref_konto` ✅, `ref_kostenstelle` ✅
- **Wave 1: ✅ COMPLETE** — Deployed auf `datavault-dev` (28.3.2026, 27/27 OK)
- **Wave 2: ✅ COMPLETE** — Hub/Sat Buchungskopf + Hauptbuch + Kreditorenbeleg + Kreditor (29.3.2026). Row Counts korrigiert nach ADF Fix (31.3.2026)
- **Wave 3: ✅ GL-OBJEKTE POPULATED** — Full DB Reset + Redeploy (31.3.2026). Alle GL-abhängigen Links + Finance Mart deployed. hub_hauptbuch=433.076, sat_hauptbuch=943.844, fakt_buchungen=13.519.009
- **Wave 4: ✅ COMPLETE** — Budget/Forecast/ActualForecast Mart-Views + dim_projekt Sharepoint-Erweiterung + dim_person Fix (15.4.2026)
- **CI/CD + Performance (8.4.2026):** GitHub Actions + ACA aktiviert. PSA-Layer (`psa_ewb_fibu_gl`) + `ewb_fibu_gl` als Staging TABLE → sat_hauptbuch 869s→102s. ACA: Consumption, 2 vCPU, 4 Gi, Timeout 7200s. ER-Diagramm-Korrekturen abgeschlossen.
- **KRED-Fix + Full-Refresh (17.4.2026):** Staging `ewb_kred_kbl_main` komplett überarbeitet — Hash Keys korrigiert (hk_kred_kbl → hk_kreditorenbeleg/hk_kreditor/hk_link_kreditorenbeleg_kreditor). `sat_kred_kbl__abacus` (defektes Duplikat in raw_vault/ewb/, Schema `dv`) gelöscht. Full-Refresh auf datavault-dev: **95/95 PASS, 0 ERROR, 455/460 Tests (5 WARN)**. GitLab CI/CD Pipeline konfiguriert (6 Deploy-Jobs inkl. full-refresh).
- **ADF-Validierung (17.4.2026):** Alle 23 ADF-Pipelines matchen 1:1 mit dbt External Tables. 12/12 structured-tables Views als Mart-Views deployed. 120 DB-Objekte über 5 Schemas.
- **Bekannte Issues:** 5 WARN bei Referential-Integrity Tests (Budget/Forecast-Konto/KST-Keys ohne Match in Dimensionen — fachliche Lücke in Sharepoint-Daten)

### 9b. Infrastruktur-Status (DB: datavault-dev)

| Komponente | Soll | Ist | Status |
|---|---|---|---|
| Schema `stg` | ✅ | ✅ | OK |
| Schema `vault` | ✅ | ✅ | OK |
| Schema `mart_finance` | ✅ | ✅ | OK (erstellt 31.3.2026) |
| Schema `mart_project` | ✅ | ✅ | OK (erstellt 29.3.2026) |
| External Data Source `StageFileSystem` | ✅ | ✅ | OK |
| External Tables (EWB) | 19 | 19 | OK ✅ |
| Staging Views (EWB) | 22 | 22 | ✅ 100% (14 Abacus + 8 Sharepoint) |
| ~~Schema `vault_ewb`~~ | — | Gelöscht ✅ | War stale |
| ~~Schema `mart_ewb`~~ | — | Gelöscht ✅ | War stale |
| Ordner `models/raw_vault/_common/hubs/` | ✅ | ✅ | Angelegt ✅ |
| Ordner `models/raw_vault/_common/satellites/` | ✅ | ✅ | Angelegt ✅ |
| Ordner `models/raw_vault/_common/links/` | ✅ | ✅ | Angelegt ✅ |
| Ordner `models/mart/finance/` | ✅ | ✅ | Angelegt ✅ |
| Ordner `models/mart/project/` | ✅ | ✅ | Angelegt ✅ |

---

## 10. Mart Layer — Star Schema (structured-tables Replika)

Die 7 Synapse `structured-tables` Views werden als **Star Schema** im Mart-Layer repliziert:
- **Dimensionen** (`dim_*`) mit INT Surrogate Keys
- **Faktentabellen** (`fakt_*`) mit FK-Beziehungen zu Dimensionen
- Business-Logik 1:1 aus Synapse übernommen, dokumentierte Korrekturen angewandt

### 10a. Projekt-Domain (DEPLOYED ✅)

| Mart-Objekt | Typ | Synapse-Äquivalent | Zeilen | Status |
|---|---|---|---|---|
| `mart_project.dim_person` | Dimension | [Projekt].[Personal] + [Abteilung] | 502 | ✅ DEPLOYED |
| `mart_project.dim_projekt` | Dimension | [Projekt].[Projekt] | 14.168 | ✅ DEPLOYED |
| `mart_project.dim_leistungsart` | Dimension | (NTR Lookup) | 15 | ✅ DEPLOYED |
| `mart._common.dim_date` | Dimension | (generiert) | 5.844 | ✅ DEPLOYED |
| `mart_project.fakt_stunden` | Fakt | [Projekt].[Stunden] | 199.206 | ✅ DEPLOYED |

**Star-Schema FK-Beziehungen:**
```
fakt_stunden.ProjektNr      → dim_projekt.ProjektNr       (100% Match ✅)
fakt_stunden.LeistungsartNr → dim_leistungsart.LeistungsartNr (11.2% Match — WARN)
fakt_stunden.DatumKey       → dim_date.date_key            (WARN: Daten vor 2020)
```

**Validierung gegen Synapse (2026-03-29):**
- dim_person: ✅ Korrekt, erweitert um Abteilungs-Attribute
- dim_projekt: ✅ Korrekt, erweitert um Sharepoint-Spalten (GruppeName, HauptgruppeNr, HauptgruppeName)
- fakt_stunden: ⚠️ PROJNR-Korrektur bestätigt (ProjektNr statt PersonalNr)
- LeistungsartNr: NSA.CODE = Sachkonto (389 Werte), nicht 1:1 NTR (15 Werte) — entspricht Synapse LEFT JOIN Verhalten

### 10b. Finance-Domain ✅ (Wave 3 komplett, GL populated 31.3.2026)

| Synapse View | Mart-Modell | Zeilen | Status |
|---|---|---|---|
| Finance.Buchungen | `mart_finance.fakt_buchungen` | **13.519.009** | ✅ Wave 3: 4-way UNION, Links statt Staging-Join, konto_key + kostenstelle_key FK |
| Finance.Belege | `mart_finance.fakt_belege` | — | ✅ Wave 2 deployed |
| Finance.Kunden | `mart_finance.dim_kreditor` | — | ✅ Ghost Hub Dimension |
| — | `mart_finance.dim_konto` | **517** | ✅ Wave 3: Ghost Hub + Sharepoint Kontenplan-Hierarchie |
| — | `mart_finance.dim_kostenstelle` | **145** | ✅ Wave 3: Ghost Hub + Sharepoint Kostenstellenplan-Hierarchie |
| — | `mart_finance.dim_buchungsstatus` | — | ✅ Referenz-Dimension |
| Finance.Budget | `mart_finance.fakt_budget` | **52'693** | ✅ Wave 4: Sharepoint-Planungsdaten, FK dim_konto + dim_kostenstelle + dim_date |
| Finance.Forecast | `mart_finance.fakt_forecast` | **13'163** | ✅ Wave 4: Sharepoint-Planungsdaten, identische Struktur wie Budget |
| Finance.ActualForecast | `mart_finance.ref_actual_forecast` | **24** | ✅ Wave 4: Lookup Monat → Actual/Forecast |
| Finance.Zugangsrechte | — | 27 | ⚪ Out of scope (operativ/RLS, Staging vorhanden) |

### 10c. Kritische Business-Regeln (zu konservieren)

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

### 11c. Entscheidung ✅ (Wave 4, 15.4.2026)

**Umgesetzt — Option A für Stammdaten, Option B für Planungsdaten:**
- **Konten + Kostenstellen:** `ref_konto` + `ref_kostenstelle` als Reference Tables im DV ✅ (Wave 3)
- **Budget + Forecast + ActualForecast:** Mart-Level Views (`fakt_budget`, `fakt_forecast`, `ref_actual_forecast`) ✅ (Wave 4)
- **KategorisierungProjekte + ProjekteKategorien:** Mart-Level JOINs in `dim_projekt` ✅ (Wave 4)
- **Zugangsrechte:** Out of scope (operativ/RLS, Staging `ewb_sp_zugangsrechte` vorhanden)

*EWB Analytics Platform | PPMC AG | Stand: 17. April 2026 — CI/CD aktiv (GitLab + ACA), KRED-Fix deployed, Full-Refresh validiert. 12/12 structured-tables abgedeckt. 95 Modelle, 460 Tests. ADF 23/23 Pipelines matched.*
