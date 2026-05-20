# Source System Mapping — EWB Analytics Platform

**Stand:** 31. März 2026 | **Quellsystem:** Abacus ERP (EWB Energie Wasser Buchs)

---

## 1. Übersicht

### Parquet-Pfad-Konvention

```
ADLS stage-fs/ewb/abacus/<MODUL>.<TABELLE>.<SUFFIX>.parquet
    → External Table: stg.ext_ewb_<modul>_<tabelle>_<suffix>
    → Staging View:   stg.ewb_<modul>_<tabelle>_<suffix>
    → Hash Keys via automate_dv.stage() + custom overrides
```

### Layerübergänge

```
Abacus ERP
  └─ ADF Copy_LandingZone_to_LoadFS_ewb ──► ADLS landing-zone (Parquet, unveränderlich)
       └─ ADF Copy_Stage_ewb ──────────────► ADLS stage-fs (aktuelle Tagesscheibe + DSS-Spalten)
            └─ PolyBase External Tables ────► stg.ext_ewb_* (Azure SQL)
                 └─ automate_dv.stage() ────► stg.ewb_* (Staging Views, Hash Keys)
                      └─ automate_dv.hub/sat/link ► vault.hub_* / vault.sat_* / vault.link_*
                           └─ SQL Views ──────────► mart_finance.* / mart_project.*
```

---

## 2. Abacus-Quellen (14 Pilot-Tabellen)

### 2.1 Finance-Domain

| Parquet-Datei | External Table | Staging View | DV-Objekte | Business Key | Wave | Status |
|---|---|---|---|---|---|---|
| `FIBU.FHE.Main` | `stg.ext_ewb_fibu_fhe_main` | `stg.ewb_fibu_fhe_main` | `hub_buchungskopf`, `sat_buchungskopf__abacus` | `RECNUM` | 2 | ✅ |
| `FIBU.GL.E22–E26` | `stg.ext_ewb_fibu_gl` | `stg.ewb_fibu_gl` | `hub_hauptbuch`, `sat_hauptbuch__abacus`, `hub_konto`(G), `hub_kostenstelle`(G) | `RECNUM` | 2 | ✅ |
| `KRED.KBL.Main` | `stg.ext_ewb_kred_kbl_main` | `stg.ewb_kred_kbl_main` | `hub_kreditorenbeleg`, `sat_kreditorenbeleg__abacus`, `hub_kreditor`(G), `sat_kreditor__abacus` | `BELNR` / `KNR` | 2 | ✅ |
| `KRED.KVL.Main` | `stg.ext_ewb_kred_kvl_main` | `stg.ewb_kred_kvl_main` | `hub_zahlung`, `sat_zahlung__abacus`, `link_kreditorenbeleg_zahlung` | `DOCUMENTNR\|\|POSITIONNR\|\|ELEMENTTYP\|\|INR` | 3 | ✅ |
| `KRED.KBS.Main` | `stg.ext_ewb_kred_kbs_main` | `stg.ewb_kred_kbs_main` | `ref_kred_buchungsstatus` | `STATID` | 2 | ✅ |

> **(G) = Ghost Hub** — kein dediziertes Staging, wird via FK-Spalte aus anderem Staging abgeleitet

### 2.2 Project-Domain

| Parquet-Datei | External Table | Staging View | DV-Objekte | Business Key | Wave | Status |
|---|---|---|---|---|---|---|
| `PROJ.NPO.Main` | `stg.ext_ewb_proj_npo_main` | `stg.ewb_proj_npo_main` | `hub_projekt`, `sat_projekt__abacus` | `PROJNR` | 1 | ✅ |
| `PROJ.NSA.Main` | `stg.ext_ewb_proj_nsa_main` | `stg.ewb_proj_nsa_main` | `hub_projektsachkonto`, `sat_projektsachkonto__abacus`, `link_projektsachkonto_projekt` | `PROJNR\|\|CODE\|\|PERIYEAR\|\|PERIMONTH\|\|GB\|\|DATASET` | 1 | ✅ |
| `PROJ.NTC.Main` | `stg.ext_ewb_proj_ntc_main` | `stg.ewb_proj_ntc_main` | `hub_zeiterfassung`, `sat_zeiterfassung__abacus`, `link_zeiterfassung_person` | `EMPLNR\|\|PROJDAT` | 1 | ✅ |
| `PROJ.NTR.Main` | `stg.ext_ewb_proj_ntr_main` | `stg.ewb_proj_ntr_main` | `ref_leistungsart` | `NUMBER` | 1 | ✅ |
| `PROJ.PRT.Main` | `stg.ext_ewb_proj_prt_main` | `stg.ewb_proj_prt_main` | `hub_projektteil`, `sat_projektteil__abacus`, `link_projektteil_projekt` | `RECNUM` | 3 | ✅ |
| `PROJ.PST.Main` | `stg.ext_ewb_proj_pst_main` | `stg.ewb_proj_pst_main` | `ref_projektstatus` | `STATUS` | 1 | ✅ |

### 2.3 Personal-Domain

| Parquet-Datei | External Table | Staging View | DV-Objekte | Business Key | Wave | Status |
|---|---|---|---|---|---|---|
| `LOHN.LEN.Main` | `stg.ext_ewb_lohn_len_main` | `stg.ewb_lohn_len_main` | `hub_person`, `sat_person__abacus` | `EMPL_NR` | 1 | ✅ |
| `LOHN.LTC.Main` | `stg.ext_ewb_lohn_ltc_main` | `stg.ewb_lohn_ltc_main` | `ref_abteilung` | `NR` | 1 | ✅ |
| `PUBL.ADR.Main` | `stg.ext_ewb_publ_adr_main` | `stg.ewb_publ_adr_main` | `hub_adresse`, `sat_person_adresse__abacus`, `sat_adresse_kontakt__abacus`, `link_adresse_person` | `INR` | 1 | ✅ |

---

## 3. Sharepoint-Quellen (8 Tabellen)

Format: JSON → External Table mit `JsonAsCsvFormat` (Single `NVARCHAR(MAX)` Spalte) + `CROSS APPLY OPENJSON()` in Staging View.

| JSON-Quelle | External Table | Staging View | DV-Objekte | Verwendung |
|---|---|---|---|---|
| `Sharepoint/konten.json` | `stg.ext_ewb_sp_konten` | `stg.ewb_sp_konten` | `ref_konto` | Kontenplan (BK = Kontonummer) |
| `Sharepoint/kostenstellen.json` | `stg.ext_ewb_sp_kostenstellen` | `stg.ewb_sp_kostenstellen` | `ref_kostenstelle` | Kostenstellenplan |
| `Sharepoint/budget.json` | `stg.ext_ewb_sp_budget` | `stg.ewb_sp_budget` | (mart enrichment) | Projektbudgets für dim_projekt |
| `Sharepoint/forecast.json` | `stg.ext_ewb_sp_forecast` | `stg.ewb_sp_forecast` | (mart enrichment) | Forecasts für dim_projekt |
| `Sharepoint/actualforecast.json` | `stg.ext_ewb_sp_actualforecast` | `stg.ewb_sp_actualforecast` | (mart enrichment) | Actual vs. Forecast |
| `Sharepoint/zugangsrechte.json` | `stg.ext_ewb_sp_zugangsrechte` | `stg.ewb_sp_zugangsrechte` | (mart enrichment) | Zugriffssteuerung für Power BI |
| `Sharepoint/kategorisierungprojekte.json` | `stg.ext_ewb_sp_kategorisierungprojekte` | `stg.ewb_sp_kategorisierungprojekte` | (mart enrichment) | Projektkategorien für dim_projekt |
| `Sharepoint/projektekategorien.json` | `stg.ext_ewb_sp_projektekategorien` | `stg.ewb_sp_projektekategorien` | (mart enrichment) | Kategorie-Lookup für dim_projekt |

**Data Source:** `StageFileSystem` | `dss_record_source = 'ewb_sharepoint'`

---

## 4. Datenfluss-Kette

| Schritt | Von | Nach | Methode | Frequenz |
|---|---|---|---|---|
| 1. Rohdaten | Abacus ERP (SHIR: EWBSBI01) | `landing-zone/` | ADF bestehende Pipelines | Täglich |
| 2a. Historisierung | `landing-zone/` | `load-fs/ewb/abacus/historized/yyyy/MM/dd/{RunId}/` | ADF `Copy_LandingZone_to_LoadFS_ewb` | Täglich |
| 2b. Staging bereitstellen | `load-fs/{Datum}/{RunId}/` | `stage-fs/ewb/abacus/` (+ DSS-Spalten) | ADF `Copy_Stage_ewb` | Täglich |
| 3. External Tables | `stage-fs/ewb/abacus/*.parquet` | `stg.ext_ewb_*` | PolyBase / `dbt run-operation stage_external_sources` | Bei Bedarf |
| 4. Staging Views | `stg.ext_ewb_*` | `stg.ewb_*` | dbt `automate_dv.stage()` | dbt run |
| 5. Raw Vault | `stg.ewb_*` | `vault.hub_*`, `vault.sat_*`, `vault.link_*` | dbt `automate_dv.hub/sat/link` | dbt run |
| 6. Current Views | `vault.sat_*` | `vault.sat_*_current_v` | dbt `satellite_current_view()` | dbt run |
| 7. Mart | `vault.*_current_v` | `mart_finance.*`, `mart_project.*` | dbt SQL Views | dbt run |

### Hash-Berechnung (automate_dv + Custom Overrides)

- **Override 1** `sqlserver__cast_binary` → `CONVERT(CHAR(64), HASHBYTES('SHA2_256', ...), 2)` (hex-encoded, lesbar)
- **Override 2** `sqlserver__type_string` → `NVARCHAR` (Unicode-safe für CH-Zeichen)
- Config: `null_placeholder_string: '-1'`, `concat_string: '||'`, `hash_content_casing: DISABLED`

---

## 5. Bekannte Besonderheiten

| Thema | Detail |
|---|---|
| FIBU.GL E22–E26 | 5 Jahresscheiben in einem Folder-Scan (`ewb_fibu_gl`). ADF: `PreserveHierarchy + leerer fileName`. ADF-Bug behoben 31.3.2026 (commit 9a46c031) |
| RECNUM-Duplikate | RECNUM ist unique innerhalb einer GL-Jahresscheibe, aber nicht über alle 5. 67k Duplikate in datavault-dev (known issue) |
| APPSTR-Spalten | `APPSTR1/APPSTR2` müssen als `VARBINARY(8000)` belassen werden (Binärdaten, nicht NVARCHAR) |
| Reserved Keywords | `[PLAN]`, `[LEVEL]`, `[BEFORE]`, `[AFTER]`, `[TYPE]`, `[STATUS]` müssen in eckige Klammern in SQL Server. In Staging via `_escape` derived column in automate_dv.stage() |
| Synapse-Bug | `Projekt.Stunden`: JOIN `PROJNR = LOHNNR` ist falsch (nur 2.5% Match). DV verwendet korrekten JOIN `PROJNR = PROJNR`. |
