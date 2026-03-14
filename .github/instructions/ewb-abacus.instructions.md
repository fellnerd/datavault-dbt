---
applyTo: 'models/**/ewb_*'
---
# EWB / Abacus — Quellsystem-spezifische Regeln

## Quellsystem
Abacus ERP der EWB (Energie Wasser Bern). Daten werden als Parquet-Dateien via ADF in den ADLS `stage-fs` Container geliefert.

## Parquet-Dateipfad
```
stage-fs/ewb/abacus/<MODUL>.<TABELLE>.<SUFFIX>.parquet
```
Beispiel: `FIBU.FHE.Main.parquet` → External Table `ext_ewb_fibu_fhe_main`

## Naming-Ableitung
Aus dem Parquet-Dateinamen `<MODUL>.<TABELLE>.<SUFFIX>.parquet` ergibt sich:
- External Table: `ext_ewb_<modul>_<tabelle>_<suffix>` (alles lowercase)
- Staging View: `ewb_<modul>_<tabelle>_<suffix>`
- Hash Key: `hk_<entity>` (abgeleitet vom Hub-Namen, z.B. `hk_buchungskopf` für `hub_buchungskopf`)
- Hash Diff: `hd_<entity>` (abgeleitet vom Hub-Namen, z.B. `hd_buchungskopf` für `hub_buchungskopf`)

## Abacus Module und Pilot-Tabellen (Phase 3)

### Finance
| Parquet-Datei | Business Key | Beschreibung |
|---------------|-------------|--------------|
| `FIBU.GL.E22.parquet` bis `E26` | KONTO + PERIODE | Hauptbucheinträge (Sachkonten-Journale) |
| `FIBU.FHE.Main.parquet` | RECNUM | Buchungsköpfe |
| `KRED.KBL.Main.parquet` | BELEGNR | Kreditorenbelege |
| `KRED.KVL.Main.parquet` | BELEGNR + ZAHLNR | Kreditorenzahlungen |
| `KRED.KBS.Main.parquet` | LIEFNR + KONTO | Kreditorensalden |

### Projects
| Parquet-Datei | Business Key | Beschreibung |
|---------------|-------------|--------------|
| `PROJ.NPO.Main.parquet` | PROJEKTNR | Projektpositionen |
| `PROJ.NTC.Main.parquet` | PROJEKTNR + POSITIONSNR | Tätigkeiten |
| `PROJ.NTB.Main.parquet` | PROJEKTNR + POSITIONSNR | Budgets |
| `PROJ.NSA.Main.parquet` | PROJEKTNR + SATZID | Stundenbuchungen |
| `PROJ.NTR.Main.parquet` | — | Leistungsarten |
| `PROJ.PST.Main.parquet` | PROJEKTNR | Projektstatus |
| `PROJ.PRT.Main.parquet` | PROJEKTNR | Projektteile |
| `LOHN.LEN.Main.parquet` | PERSONALNR | Mitarbeiterstamm |
| `LOHN.LTC.Main.parquet` | ABTEILUNGSNR | Abteilungen |
| `PUBL.ADR.Main.parquet` | ADRESSNR | Adressstamm |

## Typische Abacus-Spalten
| Spaltengruppe | Spalten | Typ | Hinweis |
|--------------|---------|-----|---------|
| System-Switches | SYSSW1–SYSSW4 | `BIT` | Abacus-interne Flags |
| App-Switches | APPSW1–APPSW10 | `BIT` | Anwendungsspezifische Flags |
| App-Nummern | APPNUM1–APPNUM6 | `DECIMAL(38,18)` | ⚠️ Nicht DECIMAL(38,10)! |
| App-Daten | APPDAT1–APPDAT2 | `DATE` | Anwendungsspezifische Daten |
| App-Strings | APPSTR1–APPSTR2 | `VARBINARY(8000)` | ⚠️ Nicht NVARCHAR! Binärdaten! |
| App-GUIDs | APPGUID1–APPGUID3 | `NVARCHAR(4000)` | GUIDs als Text |
| Audit | CREUSER, MUTUSER | `NVARCHAR(4000)` | Ersteller/Änderer |
| Audit-Datum | CREDAT, MUTDAT | `DATE` | Erstell-/Änderungsdatum |
| GUID | GUID, ENTERPRISE | `NVARCHAR(4000)` | Eindeutige Identifikatoren |

## Reserved Keywords (⚠️ Escaping Pflicht!)
Diese Abacus-Spalten sind SQL Server Reserved Keywords und **müssen** in eckige Klammern:
- `[PLAN]` — Finanzplan-Spalte
- `[LEVEL]` — Hierarchie-Ebene
- `[BEFORE]`, `[AFTER]` — Positionierung
- `[KEY]`, `[INDEX]` — Falls vorhanden

## Goldenes Referenz-Beispiel
```
models/staging/ewb_fibu_fhe_main.sql
```
Dieses Modell zeigt das korrekte Pattern für alle EWB Staging-Views:
- 5-Block-Struktur (Header, hashdiff_columns, source CTE, staged CTE, SELECT)
- T-SQL native HASHBYTES (kein automate_dv Hashing)
- Reserved Keywords korrekt escaped
- `dss_record_source` Default: `'ewb_abacus'`
- APPSTR als VARBINARY(8000) belassen, nicht in NVARCHAR konvertieren

## Adworks als Referenz-Pattern
EWB Staging-Views **müssen** exakt dem gleichen Pattern folgen wie die Adworks-Modelle:
- Gleiche 5-Block-Struktur (Header-Kommentar, hashdiff_columns, source CTE, staged CTE, SELECT)
- Gleiche Hash-Berechnung (T-SQL nativ, `CONVERT(CHAR(64), HASHBYTES(...), 2)`)
- Gleiche Metadata-Spalten (`dss_record_source`, `dss_load_date`, `dss_run_id`)
- Referenz: `models/staging/adworks_kunde.sql`

## Checkliste für neue EWB Staging-Modelle
1. ☐ Parquet-Schema abfragen (`get_parquet_schema` Macro)
2. ☐ Types korrigieren (DECIMAL 38,18 statt 38,10; VARBINARY 8000 für APPSTR)
3. ☐ Reserved Keywords identifizieren und escapen
4. ☐ `sources.yml` Eintrag unter `# ===== EWB / ABACUS =====`
5. ☐ Staging `.sql` mit 5-Block-Struktur erstellen
6. ☐ `_staging__models.yml` Eintrag mit `config.meta` (entity_type, source_type, business_keys)
7. ☐ `.vscode/entity-designer/<concept>_<entity>.json` für Extension-Kompatibilität
8. ☐ Deploy: `dbt run-operation stage_external_sources --target ewb-dev && dbt run --select <model> --target ewb-dev`
