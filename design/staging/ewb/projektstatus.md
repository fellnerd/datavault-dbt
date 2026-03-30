# EWB Projektstatus — Data Vault 2.1

> Letzte Aktualisierung: Juli 2025

---

## 1. Gesamtübersicht

- **Architektur:** Data Vault 2.1 auf Azure SQL für EWB (Energie Wasser Bern)
- **Transformation:** dbt Core mit automate_dv Macros
- **Quellsysteme:** Abacus ERP (Parquet via ADF) + Sharepoint Listen (JSON via ADF)
- **Targets:**
  - `datavault-dev` — Entwicklung
  - `datavault-test` — Test
  - `datavault` — Produktion
- **Server:** `sql-analytics-ewb-001.database.windows.net`

---

## 2. Implementierungsstand (Zahlen)

| Kennzahl | Wert |
|----------|------|
| **dbt-Modelle deployed** | 87 |
| **Tests gesamt** | 421 |
| Tests PASS | 415 |
| Tests WARN | 5 |
| Tests ERROR | 1 |
| **Hubs** | 13 |
| **Satellites** | 12 |
| **Links** | 11 |
| **Reference Tables** | 6 |
| **Mart-Domains** | 2 (Finance: 6 Objekte, Project: 5 Objekte) |

---

## 3. Staging Layer

### Abacus Parquet External Tables (14)

Module: FIBU, KRED, PROJ, LOHN, PUBL

### Sharepoint JSON External Tables (8)

Konten, Kostenstellen, Budget, Forecast, etc.

### Staging Views (23)

Alle Staging Views verwenden das `automate_dv.stage()` YAML Metadata Pattern mit Custom Hash Overrides (`CHAR(64)`, `NVARCHAR`).

---

## 4. Raw Vault — Objektübersicht

### Hubs (13)

| Hub | Rows | Source |
|-----|------|--------|
| hub_hauptbuch | 433.076 | FIBU.GL (RECNUM) |
| hub_buchungskopf | 60.377 | FIBU.FHE |
| hub_konto | 517 | FIBU.GL (Ghost Hub, KTO) |
| hub_kostenstelle | 145 | FIBU.GL (Ghost Hub, KST) |
| hub_kreditor | 3.159 | KRED.KBL |
| hub_kreditorenbeleg | 93.589 | KRED.KBL |
| hub_zahlung | 283.094 | KRED.KVL |
| hub_person | 518 | LOHN.LEN |
| hub_adresse | 57.006 | PUBL.ADR |
| hub_projekt | 14.168 | PROJ.NPO |
| hub_projektsachkonto | 279.964 | PROJ.NSA |
| hub_projektteil | 8.124 | PROJ.PRT |
| hub_zeiterfassung | 107.971 | PROJ.NTC |

### Satellites (12)

Jeder Hub hat mind. einen Satellite mit `dss_is_current`-Flag und `sat_*_current_v` View.

### Links (11)

| Link | Rows | Note |
|------|------|------|
| link_hauptbuch_buchungskopf | 558.049 | GL→FHE |
| link_hauptbuch_konto | 871.726 | GL→Konto |
| link_hauptbuch_kostenstelle | 0 | KST=NULL in GL |
| link_hauptbuch_kreditor | 0 | DKKUNDENNUMMER=NULL in GL |
| link_hauptbuch_projekt | 0 | PROJ=NULL in GL |
| link_kreditorenbeleg_kreditor | 93.589 | KBL→Kreditor |
| link_kreditorenbeleg_zahlung | 283.094 | KBL→KVL |
| link_zeiterfassung_person | 107.971 | NTC→Person |
| link_projektsachkonto_projekt | 279.964 | NSA→Projekt |
| link_projektteil_projekt | 8.124 | PRT→Projekt |
| link_adresse_person | 57.006 | ADR→Person |

### Reference Tables (6)

| Ref | Rows | Source |
|-----|------|--------|
| ref_konto | 254 | Sharepoint Konten |
| ref_kostenstelle | 151 | Sharepoint Kostenstellen |
| ref_abteilung | 46 | LOHN.LTC |
| ref_leistungsart | 15 | PROJ.NTR |
| ref_projektstatus | variabel | PROJ.PST |
| ref_kred_buchungsstatus | 16 | KRED.KBS |

---

## 5. Mart Layer

### Finance Mart (`mart_finance`)

| Objekt | Rows | Beschreibung |
|--------|------|-------------|
| fakt_buchungen | 13.519.009 | GL 4-Way Doppik (Soll/Haben × direkt/Gegen) |
| fakt_belege | 93.589 | Kreditoren-Belege |
| dim_konto | 517 | Kontenplan mit Sharepoint L1/L2 Hierarchie |
| dim_kostenstelle | 145 | Kostenstellen mit Bereich-Hierarchie |
| dim_kreditor | 3.159 | Kreditoren-Stamm |
| dim_buchungsstatus | 16 | Status-Referenz |

### Project Mart (`mart_project`)

| Objekt | Rows | Beschreibung |
|--------|------|-------------|
| fakt_stunden | 199.209 | Stundenbuchungen |
| dim_person | 502 | Mitarbeiter (LOHN.LEN) |
| dim_projekt | 14.168 | Projekte (PROJ.NPO) |
| dim_leistungsart | 15 | Leistungsarten (PROJ.NTR) |
| dim_taetigkeit | ~108.000 | Tätigkeiten (PROJ.NTC) |

---

## 6. ADF Pipelines

- **`Copy_LandingZone_to_LoadFS_ewb`:** Abacus Parquet + Sharepoint JSON → load-fs
  - **Fix:** `Copy_FIBU_GL_Folder` — PreserveHierarchy + empty fileName (Bug: merged all GL files into one)
- **`Copy_Stage_ewb`:** load-fs → stage-fs (Parquet bulk + JSON binary copy)

---

## 7. Bekannte Issues

| # | Issue | Beschreibung |
|---|-------|-------------|
| 1 | **GL RECNUM-Duplikate** | hk_hauptbuch uniqueness test FAIL (67k Dupes über Jahresscheiben) |
| 2 | **3 leere Links** | KST, DKKUNDENNUMMER, PROJ sind NULL in FIBU.GL → link_hauptbuch_kostenstelle/kreditor/projekt = 0 Rows |
| 3 | **dim_date FK-Warnings** | Datumsbereich in dim_date noch unvollständig |
| 4 | **konto_key Orphans** | 12.476 fakt_buchungen Rows ohne Match in dim_konto (KTO-Werte nicht im Sharepoint Kontenplan) |
| 5 | **leistungsart_key Orphans** | 199k fakt_stunden ohne dim_leistungsart Match |

---

## 8. Nächste Schritte

- [ ] GL RECNUM-Uniqueness klären (dss_source_file_name in BK aufnehmen?)
- [ ] dim_date erweitern (vollständiger Datumsbereich)
- [ ] Pipeline-Deployment auf ewb-test
- [ ] Sharepoint External Tables auf ewb-test + ewb erstellen (JsonAsCsvFormat)
- [ ] sat_projekt_sharepoint (Hybrid: Abacus + Sharepoint Projektdaten)
