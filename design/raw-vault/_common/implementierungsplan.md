# Raw Vault Implementierungsplan — EWB DV2.1

**Erstellt:** 12. März 2026  
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

---

## 2. Hubs

| Hub | Business Key | Abacus-Spalte | Staging-Quelle | Hash Key | Priorität |
|---|---|---|---|---|---|
| `hub_buchungskopf` | Buchungsnummer | `RECNUM` | `ewb_fibu_fhe_main` | `hk_ewb_fibu_fhe` | P1 |
| `hub_hauptbuch` | Belegnr + Konto ¹ | `BELEGNR\|\|KONTO` | `ewb_fibu_gl_e2x` | `hk_ewb_fibu_gl` | P1 |
| `hub_kreditorenbeleg` | Belegnummer | `BELEGNR` | `ewb_kred_kbl_main` | `hk_ewb_kred_kbl` | P2 |
| `hub_zahlung` | Beleg + Zahlnr | `BELEGNR\|\|ZAHLNR` | `ewb_kred_kvl_main` | `hk_ewb_kred_kvl` | P3 |
| `hub_kreditor` | Lieferantennummer | `LIEFNR` | `ewb_kred_kbs_main` | `hk_ewb_kred_kbs` | P1 |
| `hub_projekt` | Projektnummer | `PRONR` | `ewb_proj_npo_main` | `hk_ewb_proj_npo` | P1 |
| `hub_projekttaetigkeit` | Projekt + Positionsnr | `PRONR\|\|POSNR` | `ewb_proj_ntc_main` | `hk_ewb_proj_ntc` | P3 |
| `hub_stundenbuchung` | Perioden-Zeile ⁴ | `PROJNR\|\|CODE\|\|PERIYEAR\|\|PERIMONTH\|\|GB` | `ewb_proj_nsa_main` | `hk_ewb_proj_nsa` | P3 |
| `hub_leistungsart` ² | Leistungsart-Nr | `LEANR` | `ewb_proj_ntr_main` | `hk_ewb_proj_ntr` | P1 |
| `hub_person` | Personalnummer | `PERSNR` | `ewb_lohn_len_main` | `hk_ewb_lohn_len` | P1 |

> ¹ Klärungsbedarf → Offene Frage F1  
> ² Alternativ Reference Table → Offene Frage F3  
> ⁴ BK und Personenbezug ungeklärt → Offene Frage F2 (tatsächliche NSA-Spalten abgeklärt: Spaltename ist `PROJNR` nicht `PRONR`, kein `SATZID`, kein direktes Personalfeld)

**Ghost-Record-Hubs** (kein dedizierter Pilot-Source, werden über FK-Spalten der GL befüllt):
- `hub_konto` — BK aus `FIBU.GL.KONTNR`
- `hub_kostenstelle` — BK aus `FIBU.GL.KOSTNR`

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
| `link_stundenbuchung_projekt` | `hub_stundenbuchung` ↔ `hub_projekt` | Nein | `ewb_proj_nsa_main` | P3 |
| `link_stundenbuchung_person` | `hub_stundenbuchung` ↔ `hub_person` | Nein | `ewb_proj_nsa_main` | P3 |
| `link_stundenbuchung_leistungsart` | `hub_stundenbuchung` ↔ `hub_leistungsart` | Nein | `ewb_proj_nsa_main` | P3 |
| `link_projekttaetigkeit_projekt` | `hub_projekttaetigkeit` ↔ `hub_projekt` | Nein | `ewb_proj_ntc_main` | P3 |

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

**Voraussetzung:** Wave 1 deployed, Ghost-Record-Pattern für `hub_konto` / `hub_kostenstelle` geklärt (→ F1)

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

### F1 — FIBU.GL Business Key: Composite oder einfach?

In klassischer Buchführung ist `BELEGNR` der Belegidentifikator und `KONTO` eine Dimension. Zwei mögliche Modellierungen:

- **Option A** (aktueller Plan): `hub_hauptbuch` mit composite BK `BELEGNR||KONTO` — jede Buchungszeile ist eine eigene Hub-Instanz
- **Option B**: `hub_hauptbuch` mit BK=`BELEGNR` + eigener `hub_konto` mit BK=`KONTNR`

**Klärungsfrage:** Kann dieselbe `BELEGNR` auf mehreren Konten erscheinen (Soll/Haben-Buchung)? Falls ja → Option A. Falls nein → Option B ist sauberer.

### F2 — PROJ.NSA: Business Key und Personenbezug

Abgeklärt via `sys.columns` auf `stg.ext_ewb_proj_nsa_main` (datavault-dev, 12. März 2026):

**Tatsächliche Spalten (27 total):**
`RECNUM, DATASET, CODE, PROJNR, GB, PERIYEAR, PERIMONTH, BUDGETINT, BETRAGINT, VORTRAGINT, BUDGETEXT, BETRAGEXT, VORTRAGEXT, RESERVE, RESERVE2, AZBUTINT, AZBETINT, AZVORTINT, AZBUTEXT, AZBETEXT, AZVORTEXT` + DSS-Metadaten

**Erkenntnisse:**
- Spalte **`PROJNR`** existiert ✅ — ProjektNr ist in NSA vorhanden, kein Datenproblem
- Spalte `PRONR` existiert **nicht** — war Fehlannahme aus Synapse-Analyse
- Spalte `SATZID` existiert **nicht**
- NSA ist eine **aggregierte Periodenauswertung** auf Ebene `PROJNR + CODE + PERIYEAR + PERIMONTH + GB` (keine Einzel-Stundenbuchungen pro Person/Tag)
- Kein direkt sichtbares Personalfeld — Synapse `Projekt.Stunden` joinned NSA mit PUBL.ADR über unbekanntes Feld

**Klärungsfragen für Meeting:**
1. Was bedeutet `CODE` in NSA — Mitarbeiterkürzel, Leistungsart (→ NTR), oder Kostenstelle?
2. Wie kommt der Personenbezug in NSA? Über welches Feld wird PUBL.ADR gejoint?
3. Ist `RECNUM` ein stabiler Business Key oder ein technischer Zähler ohne Semantik?
4. Falls kein Personenbezug ableitbar: `link_stundenbuchung_person` entfällt — akzeptabel?

### F3 — PROJ.NTR: Hub oder Reference Table?

Leistungsarten sind typischerweise stabile Lookup-Codes (<100 Einträge, selten geändert). Zwei Optionen:

- **Option A**: `ref_leistungsart` (dbt Seed / CSV) — einfacher, kein Hub-Hash-Join nötig
- **Option B**: `hub_leistungsart` + `sat_leistungsart` — nötig wenn Leistungsarten historisiert oder aus mehreren Systemen (z.B. IDMS) kommen sollen

**Klärungsfrage:** Werden Leistungsarten aus anderen Quellsystemen importiert? Ist Historisierung der Leistungsart-Bezeichnung relevant?

---

## 8. Kritische Lücken (Synapse vs. DV-Scope)

| # | Lücke | Impact | Empfehlung |
|---|---|---|---|
| 1 | `Projekt.Stunden` (Synapse) ohne ProjektNr | Synapse-Join-Logik unvollständig | Kein Problem im DV-Scope: `stg.ext_ewb_proj_nsa_main` enthält `PROJNR` direkt |
| 2 | `hub_konto` / `hub_kostenstelle` ohne Stammdaten-Quelle | Ghost Records ohne Beschreibung | `Finance.Konten` + `Finance.Kostenstellen` aus Synapse als Lookup-Quelle oder Sharepoint |
| 3 | Sharepoint-Daten in `Projekt.Projekt` | Hybride Quelle (Abacus + Sharepoint) | Separater `sat_projekt_sharepoint` mit `dss_record_source = 'ewb_sharepoint'` |
| 4 | Keine `Finance.Konten` / `Finance.Kostenstellen` im Pilot-Scope | Stammdaten für Dimensionen fehlen | Als Wave-2-Erweiterung hinzufügen |

---

## 9. Objektzählung (Zusammenfassung)

| Typ | Anzahl | Pilot-Priorität (P1/P2/P3) |
|---|---|---|
| Hubs | 10 (+2 Ghost) | 6×P1, 1×P2, 3×P3 |
| Satellites | 14 | 5×P1, 3×P2, 6×P3 |
| Links | 11 | 0×P1, 3×P2, 8×P3 |
| **Total Vault-Objekte** | **35** | |
| Staging-Views | 19 | 1 vorhanden, 18 ausstehend |

*EWB Analytics Platform | PPMC AG | Stand: 12. März 2026*
