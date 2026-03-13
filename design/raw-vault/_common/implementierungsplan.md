# Raw Vault Implementierungsplan — EWB DV2.1

**Erstellt:** 12. März 2026 | **Aktualisiert:** 13. März 2026  
**Agenten:** synapse-validator + vault-architect  
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
| Projekt.Stunden | **Hoch** — PROJNR = PersonalNr (⚠️), INNER JOIN ADR, Datum-Konstruktion | → Mart View |
| Projekt.Projekt | Mittel — 4-way LEFT JOIN inkl. 2× Sharepoint-Tabellen | → Mart View (Sharepoint = Enrichment) |
| Projekt.Abteilung | Niedrig — LEN + LTC mit `GROUP=1` Filter, DISTINCT | → Mart View |

Zusätzlich wurden **6 Sharepoint-Referenztabellen** identifiziert, die via `Manual Data landingzone`-Pipeline als Direktkopien (ohne Transformation) geladen werden: Budget, Konten, Kostenstellen, Zugangsrechte, Forecast, ActualForecast.

> **Fazit:** Die structured-tables Views enthalten erhebliche Business-Logik (Vorzeichen, Filter, Joins, Deduplizierung). Diese gehört in die **Mart-Schicht**, nicht ins Raw Vault. Das Raw Vault bildet die Abacus-Quellen 1:1 ab; die Mart Views replizieren dann die Synapse-Logik.

---

## 2. Hubs

| Hub | Business Key | Abacus-Spalte | Staging-Quelle | Hash Key | Priorität |
|---|---|---|---|---|---|
| `hub_buchungskopf` | Buchungsnummer | `RECNUM` | `ewb_fibu_fhe_main` | `hk_ewb_fibu_fhe` | P1 |
| `hub_hauptbuch` | Belegnr + Konto ¹ | `BELEGNR\|\|KONTO` | `ewb_fibu_gl_e2x` | `hk_ewb_fibu_gl` | P1 |
| `hub_kreditorenbeleg` | Belegnummer | `BELEGNR` | `ewb_kred_kbl_main` | `hk_ewb_kred_kbl` | P2 |
| `hub_zahlung` | Beleg + Zahlnr | `BELEGNR\|\|ZAHLNR` | `ewb_kred_kvl_main` | `hk_ewb_kred_kvl` | P3 |
| `hub_kreditor` | Lieferantennummer | `LIEFNR` | `ewb_kred_kbs_main` | `hk_ewb_kred_kbs` | P1 |
| `hub_adresse` | Adressnummer | `ADRESSNR` | `ewb_publ_adr_main` | `hk_ewb_publ_adr` | P1 |
| `hub_projekt` | Projektnummer | `PRONR` | `ewb_proj_npo_main` | `hk_ewb_proj_npo` | P1 |
| `hub_projekttaetigkeit` | Projekt + Positionsnr | `PRONR\|\|POSNR` | `ewb_proj_ntc_main` | `hk_ewb_proj_ntc` | P3 |
| `hub_stundenbuchung` | Perioden-Zeile ⁴ | `PROJNR\|\|CODE\|\|PERIYEAR\|\|PERIMONTH\|\|GB` | `ewb_proj_nsa_main` | `hk_ewb_proj_nsa` | P3 |
| `hub_leistungsart` ² | Leistungsart-Nr | `LEANR` | `ewb_proj_ntr_main` | `hk_ewb_proj_ntr` | P1 |
| `hub_person` | Personalnummer | `PERSNR` | `ewb_lohn_len_main` | `hk_ewb_lohn_len` | P1 |

> ¹ Klärungsbedarf → Offene Frage F1  
> ² Alternativ Reference Table → Offene Frage F3  
> ⁴ BK beinhaltet `PROJNR` — **ACHTUNG: `PROJNR` in NSA = PersonalNr (nicht ProjektNr!)** Synapse `Projekt.Stunden` castet `PROJNR` zu `PersonalNr` und joint via `PROJNR = LOHNNR` auf `PUBL.ADR`. BK-Semantik: `PersonalNr||LeistungsartNr||Jahr||Monat||Geschäftsbereich`. Siehe F2 (teilweise gelöst).

**Hinweis `hub_adresse`** (neu): `PUBL.ADR` ist die zentrale Stammdaten-Quelle für Personen, Kunden und Adressen. Die Synapse-View `Finance.Kunden` extrahiert KNR/ADRID direkt aus `KRED.KBL` (Transaktionsdaten, kein DISTINCT) — das ist **keine valide Stammdaten-Quelle**. Kundeninformationen sollen im DV aus `hub_adresse` / `sat_adresse` kommen, nicht aus einem dedizierten "hub_kunde" basierend auf KBL.

**Ghost-Record-Hubs** (kein dedizierter Pilot-Source, werden über FK-Spalten der GL befüllt):
- `hub_konto` — BK aus `FIBU.GL.KONTNR` (Stammdaten via Sharepoint `Finance.Konten` verfügbar → Lücke #4 gelöst)
- `hub_kostenstelle` — BK aus `FIBU.GL.KOSTNR` (Stammdaten via Sharepoint `Finance.Kostenstellen` verfügbar → Lücke #4 gelöst)

---

## 3. Satellites

| Satellite | Hub | Typ | Hauptpayload | Staging-Quelle | Priorität |
|---|---|---|---|---|---|
| `sat_buchungskopf` | `hub_buchungskopf` | STD | PLAN, LEVEL, VARIANTE, TYP, REF_ID | `ewb_fibu_fhe_main` | P1 |
| `sat_hauptbuch` | `hub_hauptbuch` | STD | Betrag, Periode, Währung, Buchungstext, Belegdatum | `ewb_fibu_gl_e2x` | P2 |
| `sat_kreditorenbeleg` | `hub_kreditorenbeleg` | STD | Umschreibung3, Visierende-ID, Visierende, Betrag, Belegdatum | `ewb_kred_kbl_main` | P2 |
| `sat_zahlung` | `hub_zahlung` | STD | Zahlbetrag, Valuta, Zahlungsart, Konto, Status | `ewb_kred_kvl_main` | P3 |
| `sat_kreditor` | `hub_kreditor` | STD | Saldo, Konto, Währung, Periode | `ewb_kred_kbs_main` | P1 |
| `sat_projekt` | `hub_projekt` | STD | ProjektName, Inaktiv, GruppeNr, StatusNr, Erstellt | `ewb_proj_npo_main` | P1 |
| `sat_projekt_status` | `hub_projekt` | STD | Status, StatusDatum, Beschreibung | `ewb_proj_pst_main` | P3 |
| `sat_projekttaetigkeit` | `hub_projekttaetigkeit` | STD | Bezeichnung, Budget, IstStunden, Geplant | `ewb_proj_ntc_main` + `ewb_proj_ntb_main` | P3 |
| `sat_stundenbuchung` | `hub_stundenbuchung` | STD | Datum, Stunden, Beschreibung, Verrechenbar | `ewb_proj_nsa_main` | P3 |
| `sat_leistungsart` | `hub_leistungsart` | STD | Bezeichnung, Einheit, Aktiv | `ewb_proj_ntr_main` | P1 |
| `sat_person` | `hub_person` | STD | Initialen, AbteilungNr, CREDAT, MUTDAT | `ewb_lohn_len_main` | P1 |
| `sat_person_adresse` | `hub_person` | STD | Name, Vorname, Strasse, PLZ, Ort | `ewb_publ_adr_main` | P2 |
| `sat_person_lohnklasse` | `hub_person` | MA ³ | KlasseNr, Bezeichnung, Stufe, GültigAb | `ewb_lohn_ltc_main` | P3 |
| `sat_projektteil` | `hub_projekt` | STD | Teilname, Status, Reihenfolge | `ewb_proj_prt_main` | P3 |

> ³ MA Sat wenn mehrere Lohnklassen gleichzeitig gültig; sonst STD mit History

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
| `link_stundenbuchung_person` ⁶ | `hub_stundenbuchung` ↔ `hub_person` | Nein | `ewb_proj_nsa_main` | P3 |
| `link_stundenbuchung_projekt` ⁷ | `hub_stundenbuchung` ↔ `hub_projekt` | Nein | `ewb_proj_nsa_main` | P3 |
| `link_stundenbuchung_leistungsart` | `hub_stundenbuchung` ↔ `hub_leistungsart` | Nein | `ewb_proj_nsa_main` | P3 |
| `link_projekttaetigkeit_projekt` | `hub_projekttaetigkeit` ↔ `hub_projekt` | Nein | `ewb_proj_ntc_main` | P3 |

> ⁵ **Neu (13.3.2026):** Aus Synapse `Finance.Belege` abgeleitet: `KBL.BELNR = KVL.DOCUMENTNR`. Dieser JOIN bildet die natürliche Beziehung Beleg↔Zahlung ab.  
> ⁶ **Bestätigt (13.3.2026):** `NSA.PROJNR = ADR.LOHNNR` — Synapse `Projekt.Stunden` joint NSA mit PUBL.ADR via `PROJNR = LOHNNR` (INNER JOIN). Da `PROJNR` in NSA die PersonalNr speichert, ist dieser Link direkt ableitbar. FK: `NSA.PROJNR` → `ADR.LOHNNR` → `hub_person`.  
> ⁷ **Klärungsbedarf:** Da `PROJNR` in NSA die PersonalNr ist (nicht ProjektNr), ist ein direkter `link_stundenbuchung_projekt` aus NSA allein **nicht möglich**. Projektzuordnung könnte ggf. über `PROJ.NTC` oder eine andere Quelle erfolgen — noch zu klären.

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
- Hubs: `hub_person`, `hub_projekt`, `hub_leistungsart`, `hub_kreditor`
- Sats: `sat_person`, `sat_person_adresse`, `sat_projekt`, `sat_leistungsart`, `sat_kreditor`

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

**Voraussetzung:** Wave 2 deployed, Design-Frage F2 (NSA Business Key) geklärt

**Staging:**
- `ewb_kred_kvl_main`
- `ewb_proj_ntc_main`, `ewb_proj_ntb_main`
- `ewb_proj_nsa_main`
- `ewb_proj_pst_main`, `ewb_proj_prt_main`
- `ewb_lohn_ltc_main`

**Raw Vault:**
- Hubs: `hub_zahlung`, `hub_projekttaetigkeit`, `hub_stundenbuchung`
- Sats: alle verbleibenden Sats
- Links: alle GL-Dimension-Links + alle NSA-Links (3×)

---

## 6. Staging-Reihenfolge (19 Views)

| Rang | Staging-View | Begründung |
|---|---|---|
| 1 | `ewb_lohn_len_main` | `hub_person` — meiste FK-Konsumenten, Wave-1-Basis |
| 2 | `ewb_publ_adr_main` | `sat_person_adresse` — keine eigene Dep., Integration mit LEN |
| 3 | `ewb_proj_npo_main` | `hub_projekt` — zentrale Entity Projekt-Domain |
| 4 | `ewb_proj_ntr_main` | `hub_leistungsart` — kleine Lookup-Tabelle, früh deploybar |
| 5 | `ewb_kred_kbs_main` | `hub_kreditor` — benötigt von KBL und GL |
| 6 | `ewb_fibu_fhe_main` | `hub_buchungskopf` — bereits als Goldbeispiel vorhanden ✅ |
| 7 | `ewb_kred_kbl_main` | `hub_kreditorenbeleg` — FK zu Kreditor (Dep. Wave 1) |
| 8 | `ewb_fibu_gl_e22` | FIBU.GL — Jahresscheibe 2022 |
| 9 | `ewb_fibu_gl_e23` | FIBU.GL — Jahresscheibe 2023 |
| 10 | `ewb_fibu_gl_e24` | FIBU.GL — Jahresscheibe 2024 |
| 11 | `ewb_fibu_gl_e25` | FIBU.GL — Jahresscheibe 2025 |
| 12 | `ewb_fibu_gl_e26` | FIBU.GL — Jahresscheibe 2026 |
| 13 | `ewb_kred_kvl_main` | `hub_zahlung` — FK zu KBL (Dep. #7) |
| 14 | `ewb_proj_pst_main` | `sat_projekt_status` — einfache Sat-Erweiterung |
| 15 | `ewb_proj_prt_main` | `sat_projektteil` — wie PST, kein eigener Hub |
| 16 | `ewb_proj_ntc_main` | `hub_projekttaetigkeit` — composite BK, FK zu Projekt |
| 17 | `ewb_proj_ntb_main` | `sat_projekttaetigkeit` Ergänzung (Budget-Payload) |
| 18 | `ewb_proj_nsa_main` | Stundenbuchungen — 3 FK-Links erst nach Wave 1+2 |
| 19 | `ewb_lohn_ltc_main` | `sat_person_lohnklasse` (MA SAT) — aufwändigstes Pattern |

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

### F2 — PROJ.NSA: Business Key und Personenbezug — **TEILWEISE GELÖST** ✅

Abgeklärt via `sys.columns` auf `stg.ext_ewb_proj_nsa_main` (datavault-dev, 12. März 2026):

**Tatsächliche Spalten (27 total):**
`RECNUM, DATASET, CODE, PROJNR, GB, PERIYEAR, PERIMONTH, BUDGETINT, BETRAGINT, VORTRAGINT, BUDGETEXT, BETRAGEXT, VORTRAGEXT, RESERVE, RESERVE2, AZBUTINT, AZBETINT, AZVORTINT, AZBUTEXT, AZBETEXT, AZVORTEXT` + DSS-Metadaten

**Gelöst (13. März 2026 — Synapse-Analyse):**
- **`PROJNR` = PersonalNr (nicht ProjektNr!)** — Synapse `Projekt.Stunden` castet `CAST(T1.[PROJNR] as int) AS [PersonalNr]`
- **Personenbezug bestätigt:** `NSA.PROJNR = ADR.LOHNNR` (INNER JOIN in Synapse) → `link_stundenbuchung_person` ist möglich ✅
- **`CODE` = LeistungsartNr** — Join `NSA.CODE = NTR.RECNUM` bestätigt → `link_stundenbuchung_leistungsart` ist möglich ✅
- **BK-Semantik revidiert:** `PersonalNr||LeistungsartNr||Jahr||Monat||Geschäftsbereich`
- **Filter:** Synapse filtert `AZBETINT <> 0` (nur Zeilen mit Betrag) — dies ist Mart-Logik

**Verbleibend offen:**
1. Woher kommt die Projektzuordnung? `PROJNR` ist PersonalNr, nicht ProjektNr → `link_stundenbuchung_projekt` kann NICHT direkt aus NSA abgeleitet werden. Mögliche Quelle: `PROJ.NTC` (Tätigkeiten pro Projekt)?
2. Ist `RECNUM` ein stabiler Business Key oder ein technischer Zähler?
3. ⚠️ **Naming-Kollision:** `PROJNR` bedeutet in `PROJ.NPO` die Projektnummer, in `PROJ.NSA` aber die Personalnummer — Verwechslungsgefahr bei der Modellierung!

### F3 — PROJ.NTR: Hub oder Reference Table?

Leistungsarten sind typischerweise stabile Lookup-Codes (<100 Einträge, selten geändert). Zwei Optionen:

- **Option A**: `ref_leistungsart` (dbt Seed / CSV) — einfacher, kein Hub-Hash-Join nötig
- **Option B**: `hub_leistungsart` + `sat_leistungsart` — nötig wenn Leistungsarten historisiert oder aus mehreren Systemen (z.B. IDMS) kommen sollen

**Klärungsfrage:** Werden Leistungsarten aus anderen Quellsystemen importiert? Ist Historisierung der Leistungsart-Bezeichnung relevant?

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
| 1 | `Projekt.Stunden` (Synapse) ohne ProjektNr | Synapse-Join-Logik unvollständig | Geklärt ✅ | `PROJNR` = PersonalNr, Projekt-Link braucht andere Quelle |
| 2 | `hub_konto` / `hub_kostenstelle` ohne Stammdaten-Quelle | Ghost Records ohne Beschreibung | Geklärt ✅ | Sharepoint `Finance.Konten` + `Finance.Kostenstellen` als Reference Tables importieren (→ F4) |
| 3 | Sharepoint-Daten in `Projekt.Projekt` | Hybride Quelle (Abacus + Sharepoint) | Offen | Separater `sat_projekt_sharepoint` mit `dss_record_source = 'ewb_sharepoint'` |
| 4 | ~~Keine `Finance.Konten` / `Finance.Kostenstellen` im Pilot-Scope~~ | ~~Stammdaten für Dimensionen fehlen~~ | **GELÖST** ✅ | Konten + Kostenstellen sind als Sharepoint-Referenztabellen verfügbar — Import als Reference Tables empfohlen |
| 5 | **`PROJNR`-Semantik unterscheidet sich zwischen Tabellen** | Verwechslungsgefahr bei Modellierung | **NEU** | In `PROJ.NPO` = ProjektNr, in `PROJ.NSA` = PersonalNr. Staging-Views müssen dies dokumentieren. Alias-Vergabe in Staging empfohlen: `PROJNR AS PERSONALNR` in NSA |

---

## 9. Objektzählung (Zusammenfassung)

| Typ | Anzahl | Pilot-Priorität (P1/P2/P3) |
|---|---|---|
| Hubs | 11 (+2 Ghost) | 7×P1, 1×P2, 3×P3 |
| Satellites | 14 | 5×P1, 3×P2, 6×P3 |
| Links | 12 | 0×P1, 3×P2, 9×P3 |
| **Total Vault-Objekte** | **37** | |
| Staging-Views | 19 | 1 vorhanden, 18 ausstehend |
| Mart Views | 7 | geplant (structured-tables Replika) |
| Reference Tables | bis zu 8 | Sharepoint-Daten (Entscheid ausstehend → F4) |

**Implementierungsstand (13. März 2026):**
- Staging: **1/19** implementiert (`ewb_fibu_fhe_main` ✅), 19/19 External Tables in `sources.yml` konfiguriert ✅
- Vault: **0/37** Objekte implementiert
- Wave 1 kann **sofort starten** — keine Blocker

---

## 10. Mart Views (structured-tables Replika)

Die 7 Synapse `structured-tables` Views werden als Mart Views auf dem Raw Vault repliziert. Die Business-Logik wird dabei 1:1 aus den Synapse-SQL-Transformationen übernommen.

### 10a. Übersicht

| Synapse View | Mart-Modell | Quell-Vault-Objekte | Business-Logik |
|---|---|---|---|
| Finance.Buchungen | `mart.v_fibu_buchungen` | `hub_hauptbuch` + `sat_hauptbuch` + `hub_konto` + `hub_kostenstelle` | 4-way UNION ALL, Vorzeichen-Flip, MWST-Anpassung, KST-Filter |
| Finance.Belege | `mart.v_kred_belege` | `hub_kreditorenbeleg` + `sat_kreditorenbeleg` + `link_kreditorenbeleg_zahlung` | JOIN KBL + KVL via BELNR/DOCUMENTNR |
| Finance.Kunden | `mart.v_kred_kunden` | `hub_adresse` + `sat_adresse` (bevorzugt), alternativ `hub_kreditor` + `sat_kreditorenbeleg` | Denorm aus KBL — besser über PUBL.ADR auflösen |
| Projekt.Personal | `mart.v_personal` | `hub_person` + `sat_person` + `hub_adresse` + `sat_adresse` | ADR+LEN, Mitarbeiter-Filter (`LOHNJN=1, GESPERRT=0`), Initialen-Dedup |
| Projekt.Stunden | `mart.v_stunden` | `hub_stundenbuchung` + `sat_stundenbuchung` + `link_stundenbuchung_person` + `link_stundenbuchung_leistungsart` | NSA+NTR+ADR, Datum-Konstruktion aus PERIYEAR/PERIMONTH, AZBETINT≠0 Filter |
| Projekt.Projekt | `mart.v_projekt` | `hub_projekt` + `sat_projekt` + `sat_projekt_status` + ref_tables | NPO+PST(Dedup)+Sharepoint-Kategorien (2 Tabellen) |
| Projekt.Abteilung | `mart.v_abteilung` | `hub_person` + `sat_person` + ref_abteilung | LEN+LTC, `GROUP=1` Filter, MUTATION_DATE |

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

**Projekt.Personal — Mitarbeiter-Filter:**
- `LOHNJN = '1'` — Ist Lohnempfänger
- `GESPERRT = '0'` — Nicht gesperrt
- `LOHNNR <> 0` — Gültige Personalnummer

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

*EWB Analytics Platform | PPMC AG | Stand: 13. März 2026*
