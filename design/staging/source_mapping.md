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

## 4b. i-SE / EDM — Energiedaten (Zeitreihegruppe 150 „ewb_Power BI")

Abweichender Ladeweg: **kein** Abacus-Muster, sondern ein CSV-Report-Export vom i-SE-Server.
Fachlicher Hintergrund: [`docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md`](../../docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md) §12

```
i-SE Server (Laufwerk D:, werktäglicher Report-Export ~08:45)
  └─ ise-export/drive-d/{lastgaenge,stammdaten}/ewb_PowerBI_LG_<yyyyMMddHHmmss>.csv
       └─ ADF CopyPipeline_Lastgaenge (CSV → Parquet, + 4 dss_-Metadatenspalten)
            └─ stage-fs/ewb/ise/{lastgaenge,stammdaten}/*.parquet
                 └─ Wildcard External Tables (lesen ALLE Dateien)
                      └─ Dedup-/Typisierungs-Views ──► automate_dv.stage() ──► vault_ise ──► mart_ise
```

### Mapping

| Quelle (CSV/Parquet) | External Table | Dedup-View | Staging (Hashes) | Vault-Objekte | Mart |
|---|---|---|---|---|---|
| `ewb/ise/stammdaten/` | `stg.ext_ise_stammdaten` | `stg.ise_zeitreihe_dedup` | `stg.ise_zeitreihe_main` | `hub_zeitreihe`, `hub_zeitreihegruppe`, `link_zeitreihe_gruppe`, `sat_zeitreihe__ise`, `sat_zeitreihe_gruppe__ise` | `dim_zeitreihe_v` |
| `ewb/ise/lastgaenge/` | `stg.ext_ise_lastgaenge` | `stg.ise_lastgang_dedup` | `stg.ise_lastgang_main` | `sat_lastgang_tl__ise` | `fakt_lastgang(_v)`, `fakt_lastgang_monat(_v)` |

### Besonderheiten dieses Ladewegs

| Thema | Detail |
|---|---|
| Wildcard External Table | Liest **alle** Exportdateien, nicht nur die neueste → Duplikate sind normal und müssen im Dedup-Layer aufgelöst werden |
| Rollierendes Exportfenster | Jede Tagesdatei enthält ~5 Tage; derselbe (Serie, Zeitpunkt) erscheint bis zu 5× |
| Wertrevisionen | 6'267 von 169'248 Zeitpunkten tragen mehr als einen Wert (Ersatz- → validierter Wert) → Lastgänge: „jüngster Export gewinnt" |
| Ordnungskriterium | **Export**-Zeitstempel aus `dss_source_filename` (je Datei eindeutig) — **nicht** `dss_stage_timestamp`, der ist über alle Dateien eines ADF-Laufs identisch |
| Stammdaten-Dedup | `DISTINCT` über die 18 Fachspalten mit `MIN()` auf die Metadaten. Würde man `dss_source_filename` mitselektieren, greift `DISTINCT` nicht mehr (410 statt 41 Zeilen) |
| `Category`-Auflösung | `ext_ise_lastgaenge.Category` = `Zeitreihe + '.' + Referenz + '.' + Einheit` → 1:1 auf `id_zeitreihe`, überwacht durch `assert_ise_lastgang_kategorie_aufloesbar` |
| Datumsformat | `Date` ist `VARCHAR(20)` als `dd.MM.yyyy HH:mm:ss` (Style 104) — ohne Konvertierung sortiert `MIN`/`MAX` lexikografisch (Tag vor Monat) |
| Zeitkonvention | Intervall-**ENDE**; im Mart über `intervall_start` aufgelöst, damit Monatssummen die Innosolv-Cube-Werte treffen |
| Typisierung | Alles kommt als Text; `ID_Zeitreihe` muss auf `INT` gecastet werden, `Reihenfolge` liefert das Float-Artefakt `'NaN'` |

---

## 5. Bekannte Besonderheiten

| Thema | Detail |
|---|---|
| FIBU.GL E22–E26 | 5 Jahresscheiben in einem Folder-Scan (`ewb_fibu_gl`). ADF: `PreserveHierarchy + leerer fileName`. ADF-Bug behoben 31.3.2026 (commit 9a46c031) |
| RECNUM-Duplikate | RECNUM ist unique innerhalb einer GL-Jahresscheibe, aber nicht über alle 5. 67k Duplikate in datavault-dev (known issue) |
| APPSTR-Spalten | `APPSTR1/APPSTR2` müssen als `VARBINARY(8000)` belassen werden (Binärdaten, nicht NVARCHAR) |
| Reserved Keywords | `[PLAN]`, `[LEVEL]`, `[BEFORE]`, `[AFTER]`, `[TYPE]`, `[STATUS]` müssen in eckige Klammern in SQL Server. In Staging via `_escape` derived column in automate_dv.stage() |
| Synapse-Bug | `Projekt.Stunden`: JOIN `PROJNR = LOHNNR` ist falsch (nur 2.5% Match). DV verwendet korrekten JOIN `PROJNR = PROJNR`. |
