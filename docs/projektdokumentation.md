# EWB Analytics Platform — Projektdokumentation

| | |
|---|---|
| **Kunde** | EWB Energie Wasser Bern |
| **Projekt** | EWB Analytics Platform (Data Vault 2.1) |
| **Erstellt** | 27. Februar 2026 |
| **Stand** | 15. April 2026 |
| **Verfasser** | PPMC AG |

---

## 1. Projektziel

Aufbau einer modernen, skalierbaren Datenplattform auf Basis des **Data Vault 2.1**-Standards im EWB Azure-Tenant. Alle relevanten Quellsysteme (Abacus ERP, IDMS, ISE u.a.) werden täglich in eine zentrale Datenbasis geladen, historisch gesichert und für Power BI-Berichte bereitgestellt.

Der gewählte Ansatz stellt sicher, dass Rohdaten unveränderlich erhalten bleiben, jede Transformation nachvollziehbar und testbar ist, und die Plattform schrittweise um weitere Domänen erweiterbar bleibt.

---

## 2. Phasenübersicht

| Phase | Bezeichnung | Status |
|---|---|---|
| 1 | Analyse der bestehenden Azure-Umgebung | Abgeschlossen |
| 2 | Infrastruktur: SQL Server + Datenbankinitialisierung | Abgeschlossen |
| 3 | Raw Vault: Staging, Hubs, Satellites, Links | Abgeschlossen (Wave 1+2+3 deployed ✅) |
| 4 | Orchestrierung & Automatisierung (ADF → dbt) | In Bearbeitung (ADF Pipelines aktiv, GitHub Actions ausstehend) |
| 5 | Reporting Layer & Power BI | Abgeschlossen (Projekt-Domain + Finance-Domain deployed ✅) |

---

## 3. Phase 1 — Analyse der bestehenden Azure-Umgebung

### 3.1 Ergebnisübersicht

| Bereich | Ergebnis |
|---|---|
| Azure Data Factory Pipelines | 26 Pipelines vollständig inventarisiert |
| Angebundene Quellsysteme | 9 Systeme (Abacus, IDMS, ISE, SharePoint, ServiceNow, Messerli, Starface u.a.) |
| Synapse Serverless SQL Pool | 2 Datenbanken mit 900+ virtuellen Tabellen kartiert |
| ADLS Gen2 Container | 4 Container identifiziert und in Architektur eingeordnet |

---

### 3.2 Bestehende Datenarchitektur

```
Quellsysteme (Abacus ERP, IDMS, ISE, ServiceNow, ...)
        │
        ▼  täglich via Azure Data Factory (SHIR: EWBSBI01)
  landing-zone        Rohdaten als Parquet-Dateien
        │             1:1 aus Quellsystem, unverändert
        ▼  SQL-Transformation (ADF Finance- & Projekt-Pipelines)
  structured-tables   vorverarbeitete Tabellen (Finance, Projekte)
        │
        ▼
   Power BI
```

**`landing-zone`** ist der primäre Eingangspuffer: Alle Quelldaten landen hier täglich als Parquet-Dateien in ihrem Originalzustand. Die Views im Synapse Serverless SQL Pool sind reine Abfrage-Wrapper — keine physischen Tabellen.

**`structured-tables`** enthält transformierte und zusammengeführte Tabellen für das heutige Power BI-Reporting (mit Filtern, Joins und Business-Logik). Diese Schicht bleibt für das bestehende Reporting aktiv, dient aber **nicht** als Quelle für den neuen Data Vault.

---

### 3.3 Quellsysteme und Ladehäufigkeit

| Quellsystem | Inhalt | Ladehäufigkeit |
|---|---|---|
| Abacus ERP | FIBU, KRED, DEBI, PROJ, LOHN, ADRE | Täglich |
| IDMS | Internet-/Kabelkunden-Vertragsmanagement | Täglich |
| ISE Kernsystem | Kundenstamm, Objekte, Faktura (~600 Tabellen) | Täglich |
| SharePoint | Budget, Forecast, Kostenstellen, Zugangsrechte | Täglich (WebHook) |
| ServiceNow | CRM-Kundenanfragen | Täglich |
| Messerli | Fakturierung | Laufend |
| Starface | Telefonie-Rohdaten (CDR) | Laufend |

---

### 3.4 Datenpipeline-Inventar (26 Pipelines)

| Pipeline | Typ | Ziel | Betrieb |
|---|---|---|---|
| FIBU_GL_daily | Landing | `landing-zone/FIBU/GL` (E22–E26) | Täglich |
| FIBU_GL_monthly | Landing | `landing-zone/FIBU/GL` (E21) | Monatlich |
| FIBU_daily | Landing | `landing-zone/FIBU/FHE` | Täglich |
| KRED | Landing | `landing-zone/KRED/*` (22 Tabellen) | Täglich |
| DEBI | Landing | `landing-zone/DEBI/*` | Täglich |
| ADRE | Landing | `landing-zone/ADRE/*` | Täglich |
| LOHN | Landing | `landing-zone/LOHN/*` | Täglich |
| PROJ | Landing | `landing-zone/PROJ/*` (23 Tabellen) | Täglich |
| PUBL | Landing | `landing-zone/PUBL/*` | Täglich |
| SHOP | Landing | `landing-zone/SHOP/*` | Täglich |
| IDMS_bulk_daily | Landing | `landing-zone/IDMS/*` | Täglich |
| ISE_Prod_bulk_daily | Landing | `landing-zone/ISE_Prod_*` (~600 Tabellen) | Täglich |
| Messerli | Landing | `landing-zone/Messerli/*` | Laufend |
| ServiceNowProdV2 | Landing | `landing-zone/ServiceNowProd/*` | Täglich |
| starface / starface_Users | Landing | `landing-zone/starface/*` | Laufend |
| Manual Data Sharepoint_daily | Landing (WebHook) | `landing-zone/Sharepoint/*` | Täglich |
| Manual Data landingzone | Transform (Copy) | `structured-tables/Finance/*` | Orchestriert |
| Finance | Transform (SQL) | `structured-tables/Finance/Buchungen, Belege, Kunden` | Orchestriert |
| Projekt | Transform (SQL) | `structured-tables/Projekt/*` | Orchestriert |
| **structured-tables Daily** | **Master-Orchestrator** | ruft Finance, Manual Data, Projekt auf | Täglich |
| FIBU_GL_full-manually, FIBU_full-manually, IDMS_manual_run | Manuell | landing-zone | Bei Bedarf |
| IDMS_SOAP_Test, z_test_* | Test | — | Inaktiv |

---

### 3.5 Pilot-Scope: Finance & Projects

**Finance:**

| Tabelle | Inhalt |
|---|---|
| FIBU.GL (E22–E26) | Hauptbucheinträge (Sachkonten-Journale) |
| FIBU.FHE | Buchungsköpfe |
| KRED.KBL | Kreditorenbelege |
| KRED.KVL | Kreditorenzahlungen |
| KRED.KBS | Kreditoren-Buchungsstatus (Status-Konfiguration) |

**Projects:**

| Tabelle | Inhalt |
|---|---|
| PROJ.NPO | Projektpositionen |
| PROJ.NTC / NTCA / NTCE / NTB | Zeitstempelung, Budgets |
| PROJ.NSA / NTR | Projektsachkonto, Leistungsarten |
| PROJ.PST / PRT | Projektstatus, Projektteile |
| LOHN.LEN / LTC | Mitarbeiterstamm, Abteilung |
| PUBL.ADR | Adressstamm (Personal-Join) |

---

### 3.6 Architektur-Entscheidung: dbt Source-Layer

Der neue Data Vault liest ausschliesslich aus **`landing-zone`** — nicht aus `structured-tables`.

| Kriterium | Begründung |
|---|---|
| Rohdatenkonformität | `landing-zone` enthält unveränderliche Quelldaten ohne eingebettete Business-Logik |
| DV 2.1-Standard | Transformationen (Joins, Filter) werden im Vault explizit modelliert — nicht in der Quelle vorweggenommen |
| Nachvollziehbarkeit | Jede Ableitung ist im dbt-Modell sichtbar, versioniert und testbar |
| Entkopplung | Änderungen an `structured-tables` (Power BI) beeinflussen den Vault nicht |

`structured-tables` bleibt für das bestehende Power BI-Reporting unverändert aktiv.

---

## 4. Phase 2 — Infrastruktur

### 4.1 Erledigte Schritte

| Aufgabe | Detail | Status |
|---|---|---|
| Azure SQL Server | `sql-analytics-ewb-001.database.windows.net`, Region Switzerland North | Erstellt (4. März 2026) |
| Datenbank `datavault` (prod) | Serverless, General Purpose Gen5, Auto-Pause 60 min | Erstellt |
| Datenbank `datavault-dev` | Serverless, General Purpose Gen5, Auto-Pause 60 min | Erstellt (7. März 2026) |
| Datenbank `datavault-test` | Serverless, General Purpose Gen5, Auto-Pause 60 min | Erstellt (7. März 2026) |
| Managed Identity | System-Assigned, OID `9ebe7156-…` | Aktiviert |
| ADF Dataset `GenericParquetDataset_ewb` | 3-Parameter Parquet-Dataset (fileSystem, folderPath, fileName) | Deployed |
| ADF Dataset `ParquetFolderDataset_ewb` | 2-Parameter Parquet-Dataset ohne Dateiname (für Bulk-Copy) | Deployed |
| ADF Pipeline `Copy_LandingZone_to_LoadFS_ewb` | 19 Pilot-Tabellen, ForEach, historisierter Pfad in `load-fs` | Deployed (9. März 2026) |
| ADF Pipeline `Copy_Stage_ewb` | Bulk-Copy mit DSS-Metadatenspalten nach `stage-fs`, idempotent | Deployed (9. März 2026) |
| dbt Targets | `ewb`, `ewb-dev`, `ewb-test` in `~/.dbt/profiles.yml` konfiguriert | Erstellt (9. März 2026) |
| dbt Projektkonfiguration | EWB-Modelle in `_common` (Schema: `vault`), `as_columnstore: false` | Erstellt (9. März 2026) |
| SQL Firewall-Regel | Zugriff für lokalen Dev-Rechner | Eingerichtet (9. März 2026) |
| Datenbankschemas | `stg`, `vault`, `bv`, `mart` in allen 3 DBs | Erstellt (9. März 2026) |
| Database Scoped Credential | `managed_identity` (Managed Service Identity) in allen 3 DBs | Erstellt / umgestellt (12. März 2026) |
| External Data Source | `StageFileSystem` → `adls://analyticsstoraccount001.dfs.core.windows.net/stage-fs` in allen 3 DBs | Erstellt (12. März 2026) |
| External File Format | `ParquetFormat` (Snappy Parquet) in allen 3 DBs | Erstellt (12. März 2026) |
| RBAC Storage Blob Data Reader | MI-Zugriff auf Container `landing-zone`, `load-fs`, `stage-fs` | Eingerichtet (12. März 2026) |
| SAS Token abgelöst | `ewb_stage_fs_sas` durch `managed_identity` ersetzt, alle 3 DBs | Erledigt (12. März 2026) |

### 4.2 Ausstehende Schritte

| Aufgabe | Detail | Status |
|---|---|---|
| Key Vault Secret | `sql-analytics-ewb-001-admin-password` in `analytics-keyvault001` | EWB-Admin (Key Vault Secrets Officer) erforderlich |

---

## 5. Phase 3 — Raw Vault

### 5.1 Implementierungsfortschritt (Stand 15. April 2026)

| Schicht | Implementiert | Pilot-Scope | Fortschritt |
|---|---|---|---|
| External Tables | 23 | 23 | 100% ✅ (datavault-dev) |
| Staging-Views (Abacus) | 14 | 15 | 93% (NTB out of scope) |
| Staging-Views (Sharepoint) | 8 | 8 | 100% ✅ |
| Hubs | 13 (+2 Ghost) | 13 (+2 Ghost) | 100% ✅ |
| Satellites | 12 (+12 current_v) | 12 | 100% ✅ |
| Links | 11 | 11 | 100% ✅ |
| Reference Tables | 6 | 6 | 100% ✅ |
| **Mart-Views** | **16** | **16** | **100% ✅** |

**Wave 1 (Stammdaten): ✅ DEPLOYED** auf `datavault-dev` (28. März 2026, 27 Modelle, 0 Fehler)

**Wave 2 (Finance-Transaktionen): ✅ DEPLOYED** auf `datavault-dev` (29. März 2026) — Hub/Sat Buchungskopf + Hauptbuch + Kreditorenbeleg + Kreditor. Row Counts korrigiert nach ADF-Bug-Fix (31. März 2026): hub_hauptbuch=433.076, sat_hauptbuch=943.844.

**Wave 3 (GL-Links + Zahlungen + Projektteile): ✅ DEPLOYED** auf `datavault-dev` (31. März 2026) — hub_zahlung (283.094), sat_zahlung__abacus, hub_projektteil, sat_projektteil__abacus, 6 GL-Links (KST/Kreditor/Projekt/Konto/Buchungskopf/Zahlung).

**Wave 4 (structured-tables Gap Close): ✅ IMPLEMENTIERT** (15. April 2026) — Budget/Forecast/ActualForecast Mart-Views + dim_projekt Sharepoint-Erweiterung + dim_person Fix. 13/13 structured-tables abgedeckt (1 out of scope: Zugangsrechte).

**Finance Mart: ✅ DEPLOYED** (31. März 2026) — fakt_buchungen (892.713), fakt_belege (287.784), dim_kreditor.

**Implementierungsplan:** `design/raw-vault/_common/implementierungsplan.md` (erstellt 12. März 2026, basierend auf Synapse-Analyse)

### 5.2 Staging-Layer (stg.ewb_*)

| Tabelle | External Table | Staging-View | Status |
|---|---|---|---|
| FIBU.FHE | `stg.ext_ewb_fibu_fhe_main` | `stg.ewb_fibu_fhe_main` | ✅ Deployed (Referenz-Modell) |
| FIBU.GL.E22-E26 | `stg.ext_ewb_fibu_gl` | `stg.ewb_fibu_gl` | ✅ Deployed (Folder-Scan, BK=RECNUM) |
| KRED.KBL | `stg.ext_ewb_kred_kbl_main` | `stg.ewb_kred_kbl_main` | ✅ Deployed (Wave 2) |
| KRED.KVL | `stg.ext_ewb_kred_kvl_main` | `stg.ewb_kred_kvl_main` | ✅ Deployed (Wave 3) |
| KRED.KBS | `stg.ext_ewb_kred_kbs_main` | `stg.ewb_kred_kbs_main` | ✅ Deployed (Wave 2, ref_kred_buchungsstatus) |
| PROJ.NPO | `stg.ext_ewb_proj_npo_main` | `stg.ewb_proj_npo_main` | ✅ Deployed |
| PROJ.NTC | `stg.ext_ewb_proj_ntc_main` | `stg.ewb_proj_ntc_main` | ✅ Deployed |
| PROJ.NTB | — | — | Out of scope (Wave 1, kein Hub) |
| PROJ.NSA | `stg.ext_ewb_proj_nsa_main` | `stg.ewb_proj_nsa_main` | ✅ Deployed |
| PROJ.NTR | `stg.ext_ewb_proj_ntr_main` | `stg.ewb_proj_ntr_main` | ✅ Deployed |
| PROJ.PST | `stg.ext_ewb_proj_pst_main` | `stg.ewb_proj_pst_main` | ✅ Deployed |
| PROJ.PRT | `stg.ext_ewb_proj_prt_main` | `stg.ewb_proj_prt_main` | ✅ Deployed (Wave 3) |
| LOHN.LEN | `stg.ext_ewb_lohn_len_main` | `stg.ewb_lohn_len_main` | ✅ Deployed |
| LOHN.LTC | `stg.ext_ewb_lohn_ltc_main` | `stg.ewb_lohn_ltc_main` | ✅ Deployed |
| PUBL.ADR | `stg.ext_ewb_publ_adr_main` | `stg.ewb_publ_adr_main` | ✅ Deployed |

### 5.3 Raw Vault — Objekte

| Entität | Typ | Basiert auf | Status |
|---|---|---|---|
| `hub_person` | Hub | LOHN.LEN | ✅ Deployed |
| `hub_adresse` | Hub | PUBL.ADR | ✅ Deployed |
| `hub_projekt` | Hub | PROJ.NPO | ✅ Deployed |
| `hub_projektsachkonto` | Hub | PROJ.NSA | ✅ Deployed |
| `hub_zeiterfassung` | Hub | PROJ.NTC | ✅ Deployed |
| `hub_buchungskopf` | Hub | FIBU.FHE | ✅ Deployed (Wave 2) |
| `hub_hauptbuch` | Hub | FIBU.GL | ✅ Deployed (Wave 2, BK=RECNUM) |
| `hub_kreditorenbeleg` | Hub | KRED.KBL | ✅ Deployed (Wave 2) |
| `hub_kreditor` | Hub (Ghost) | KRED.KBL (KNR) | ✅ Deployed (Wave 2) |
| `hub_zahlung` | Hub | KRED.KVL | ✅ Deployed (Wave 3) |
| `hub_projektteil` | Hub | PROJ.PRT | ✅ Deployed (Wave 3) |
| `hub_konto` | Hub (Ghost) | FIBU.GL | ✅ Deployed (Wave 3, Ghost) |
| `hub_kostenstelle` | Hub (Ghost) | FIBU.GL | ✅ Deployed (Wave 3, Ghost) |
| `sat_person__abacus` | Satellite | LOHN.LEN | ✅ Deployed |
| `sat_person_adresse__abacus` | Satellite | PUBL.ADR | ✅ Deployed |
| `sat_adresse_kontakt__abacus` | Satellite | PUBL.ADR | ✅ Deployed |
| `sat_projekt__abacus` | Satellite | PROJ.NPO | ✅ Deployed |
| `sat_projektsachkonto__abacus` | Satellite | PROJ.NSA | ✅ Deployed |
| `sat_zeiterfassung__abacus` | Satellite | PROJ.NTC | ✅ Deployed |
| `sat_buchungskopf__abacus` | Satellite | FIBU.FHE | ✅ Deployed (Wave 2) |
| `sat_hauptbuch__abacus` | Satellite | FIBU.GL | ✅ Deployed (Wave 2) |
| `sat_kreditorenbeleg__abacus` | Satellite | KRED.KBL | ✅ Deployed (Wave 2) |
| `sat_kreditor__abacus` | Satellite | KRED.KBL (Ghost) | ✅ Deployed (Wave 2) |
| `sat_zahlung__abacus` | Satellite | KRED.KVL | ✅ Deployed (Wave 3) |
| `sat_projektteil__abacus` | Satellite | PROJ.PRT | ✅ Deployed (Wave 3) |
| `link_adresse_person` | Link | PUBL.ADR | ✅ Deployed |
| `link_zeiterfassung_person` | Link | PROJ.NTC | ✅ Deployed |
| `link_projektsachkonto_projekt` | Link | PROJ.NSA | ✅ Deployed |
| `link_hauptbuch_buchungskopf` | Link | FIBU.GL | ✅ Deployed (Wave 2) |
| `link_kreditorenbeleg_kreditor` | Link | KRED.KBL | ✅ Deployed (Wave 2) |
| `link_kreditorenbeleg_zahlung` | Link | KRED.KVL | ✅ Deployed (Wave 3) |
| `link_hauptbuch_kreditor` | Link | FIBU.GL | ✅ Deployed (Wave 3) |
| `link_hauptbuch_projekt` | Link | FIBU.GL | ✅ Deployed (Wave 3) |
| `link_hauptbuch_konto` | Link | FIBU.GL | ✅ Deployed (Wave 3) |
| `link_hauptbuch_kostenstelle` | Link | FIBU.GL | ✅ Deployed (Wave 3) |
| `link_projektteil_projekt` | Link | PROJ.PRT | ✅ Deployed (Wave 3) |
| `ref_abteilung` | Reference | LOHN.LTC | ✅ Deployed |
| `ref_leistungsart` | Reference | PROJ.NTR | ✅ Deployed |
| `ref_projektstatus` | Reference | PROJ.PST | ✅ Deployed |
| `ref_kred_buchungsstatus` | Reference | KRED.KBS | ✅ Deployed (Wave 2) |
| `ref_konto` | Reference | Sharepoint | ✅ Deployed |
| `ref_kostenstelle` | Reference | Sharepoint | ✅ Deployed |

### 5.4 Bereits erstellte dbt-Infrastruktur

| Artefakt | Detail | Status |
|---|---|---|
| `models/raw_vault/_common/` | Zielordner für EWB Vault-Modelle (hubs/, satellites/, links/) | Konfiguriert |
| `dbt_project.yml` | EWB-Modelle nutzen `_common` (Schema: `vault`, `as_columnstore: false`) | Erstellt (9. März 2026) |
| `models/staging/ewb_fibu_fhe_main.sql` | Referenz-Staging-View (automate_dv.stage() Pattern, VARBINARY-Pattern) | Erstellt |
| `models/staging/sources.yml` | 23 External Tables `ext_ewb_*` konfiguriert (15 Abacus + 8 Sharepoint) | Erstellt (9. März 2026) |

---

### 5.5 Gelöste Design-Fragen

Alle drei Design-Fragen wurden durch Datenanalyse gelöst. Vollständige technische Analyse: `design/raw-vault/_common/implementierungsplan.md` Abschnitt 7.

| # | Frage | Ergebnis | Status |
|---|---|---|---|
| F1 | FIBU.GL Business Key: Composite oder einfach? | BK-Korrektur: RECNUM (unique) statt `DKBELEGNUMMER\|\|KTO` (62% Nullen, 96 Dupes). Datenanalyse bestätigt. | ✅ Gelöst |
| F2 | NSA.PROJNR-Semantik und Personenbezug? | PROJNR = **ProjektNr** (97.5% Match zu NPO). Synapse `PROJNR=LOHNNR` ist ein Bug | ✅ Gelöst |
| F3 | NTR: Hub oder Reference Table? | Reference Table — nur 29 stabile Leistungsarten | ✅ Gelöst |

### 5.6 Erkenntnisse aus der Implementierung

| Erkenntnis | Detail |
|---|---|
| KBS ≠ Kreditorensalden | `KRED.KBS` ist eine Status-Konfigurationstabelle (18 Spalten: STATID, STATDEF, etc.), nicht Kreditoren-Stamm. Kein LIEFNR/SALDO/KONTO vorhanden. |
| hub_kreditor = Ghost Hub | Wird aus `KBL.KNR` abgeleitet (Wave 2), da keine dedizierte Kreditoren-Stammdatentabelle existiert |
| NTC = Zeitstempelung | PROJ.NTC enthält Stempeluhr-Daten (EMPLNR+PROJDAT+FROM1-TO10), keine Projekttätigkeiten. Kein PRONR/POSNR vorhanden. |
| Synapse-Bugs | Zwei Fehler in Synapse Views identifiziert: (1) `PROJNR=LOHNNR` Join, (2) `CODE=RECNUM` statt `CODE=NUMBER` |


### 5.7 Artefakt-Sync-Status (Stand 5. April 2026)

Konsistenzprüfung zwischen dbt-Modellen, YAML-Dokumentation, Entity-Designer und ER-Diagramm.

#### Staging Layer
| Staging-Modell (SQL) | _staging__models.yml | sources.yml (ext_ewb_) | stg-View DB | Status |
|---|---|---|---|---|
| `ewb_fibu_fhe_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_fibu_gl` | ✅ | ✅ | ✅ | Synchron |
| `ewb_kred_kbl_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_kred_kbs_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_kred_kvl_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_lohn_len_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_lohn_ltc_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_proj_npo_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_proj_nsa_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_proj_ntc_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_proj_ntr_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_proj_prt_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_proj_pst_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_publ_adr_main` | ✅ | ✅ | ✅ | Synchron |
| `ewb_sp_konten` | ✅ | ✅ (`_json`) | ✅ | Synchron (SP-JSON-Format) |
| `ewb_sp_kostenstellen` | ✅ | ✅ (`_json`) | ✅ | Synchron |
| `ewb_sp_budget` | ✅ | ✅ (`_json`) | ✅ | Synchron |
| `ewb_sp_forecast` | ✅ | ✅ (`_json`) | ✅ | Synchron |
| `ewb_sp_actualforecast` | ✅ | ✅ (`_json`) | ✅ | Synchron |
| `ewb_sp_zugangsrechte` | ✅ | ✅ (`_json`) | ✅ | Synchron |
| `ewb_sp_kategorisierungprojekte` | ✅ | ✅ (`_json`) | ✅ | Synchron |
| `ewb_sp_projektekategorien` | ✅ | ✅ (`_json`) | ✅ | Synchron |
| *(kein SQL)* | ❌ | ✅ `ext_ewb_proj_ntb_main` | ✅ ET in DB | ⚠️ Out-of-scope ET ohne Staging-View |

> **Hinweis:** Sharepoint External Tables nutzen den Suffix `_json` in sources.yml (z. B. `ext_ewb_sp_konten_json`), was dem effektiven DB-Tabellennamen entspricht.

#### Raw Vault Layer (_common__models.yml vs. SQL-Dateien)
| Objekt | SQL-Datei | _common__models.yml | DB (datavault-dev) | Status |
|---|---|---|---|---|
| **13 Hubs** (inkl. 2 Ghost) | ✅ 13 Dateien | ✅ 13 Einträge | ✅ 13 Tabellen | Synchron |
| **12 Satellites** | ✅ 12 Dateien | ✅ 12 Einträge | ✅ 12 Tabellen | Synchron |
| **12 current_v Views** | ✅ 12 Dateien | ✅ 12 Einträge | ✅ 12 Views | Synchron |
| **11 Links** | ✅ 11 Dateien | ✅ 11 Einträge | ✅ 11 Tabellen | Synchron |
| **6 References** | ✅ 6 Dateien | ✅ 6 Einträge | ✅ 6 Views | Synchron |

> **Hinweis (Stand 5.4.2026):** `hub_konto`, `hub_kostenstelle`, `link_hauptbuch_konto`, `link_hauptbuch_kostenstelle` sind vollständig in `_common__models.yml` dokumentiert — bekannte Lücke aus vorheriger Session **behoben** ✅.

#### ER-Diagramm vs. Vault-Modelle
| Bereich | ER-Header | Tatsächlich | Status |
|---|---|---|---|
| Hubs | 13 | 13 SQL-Dateien | ✅ Korrekt |
| Satellites | **14** | **12** SQL-Dateien | ⚠️ Header-Zähler falsch (um 2 zu hoch) |
| Links | **12** | **11** SQL-Dateien | ⚠️ `LINK_BUCHUNGSKOPF_KREDITORENBELEG` im Diagramm, aber kein SQL (entfernt per Entscheidung März 2026) |
| References | **5** | **6** SQL-Dateien | ⚠️ `ref_kred_buchungsstatus` fehlt im ER-Diagramm |
| Link-Name | `LINK_PERSON_ADRESSE` | `link_adresse_person` | ⚠️ Namensabweichung ER ↔ SQL-Datei |

#### Entity-Designer JSONs vs. Vault-Entitäten
| Entität | Entity-Designer JSON | Status |
|---|---|---|
| adresse, buchungskopf, hauptbuch, kreditor, kreditorenbeleg, person, projekt, projektsachkonto, projektteil, zahlung, zeiterfassung | ✅ vorhanden | Synchron |
| leistungsart, projektstatus, kred_buchungsstatus | ✅ vorhanden (Refs) | Synchron |
| **konto** (Ghost Hub) | ❌ kein `_common_konto.json` | ⚠️ Ghost Hub ohne Entity-Designer JSON |
| **kostenstelle** (Ghost Hub) | ❌ kein `_common_kostenstelle.json` | ⚠️ Ghost Hub ohne Entity-Designer JSON |

#### Bekannte Cleanup-Tasks (DB)
| Objekt | Schema | Problem | Priorität |
|---|---|---|---|
| `testview_29e1c7320897c0e96f3dca80df756f0e_10548` | `stg` | Debug-View aus dbt run_sql — sollte entfernt werden | Niedrig |
| `ext_ewb_sp_zugangsrechte_main` | `stg` | Extra ET in DB, nicht in sources.yml registriert (veraltetes Artefakt?) | Niedrig |
| `dv` Schema | DB | Leeres Schema in datavault-dev vorhanden, nicht dokumentiert | Niedrig |

---

## 6. Phase 4 — Orchestrierung & Automatisierung

### 6.1 ADF-Datenpipelines (neu erstellt)

Zwei neue Pipelines wurden im Azure Data Factory `analytics-datafactory001` eingerichtet. Sie bilden die Brücke zwischen den bestehenden Roh-Parquets und dem künftigen dbt-Vault.

#### Pipeline 1: `Copy_LandingZone_to_LoadFS_ewb`

Kopiert täglich 19 Pilot-Tabellen aus `landing-zone` nach `load-fs` und legt sie datumsbezogen und nach Run-ID strukturiert ab (historisierter Pfad).

| Eigenschaft | Wert |
|---|---|
| Quelle | `landing-zone/{MODULE}/{TABLE}/{FILE}.parquet` |
| Ziel | `load-fs/ewb/abacus/historized/yyyy/MM/dd/{RunId}/{fileName}` |
| Methode | ForEach (5 parallele Kopien) |
| Pilot-Tabellen | 19 (FIBU.GL.E22–E26, FIBU.FHE, KRED.KBL/KVL/KBS, PROJ.NPO/NTC/NTB/NSA/NTR/PST/PRT, LOHN.LEN/LTC, PUBL.ADR) |

#### Pipeline 2: `Copy_Stage_ewb`

Stellt den aktuellen Tagesstand im `stage-fs` Container bereit: löscht zuerst den bisherigen Staging-Ordner, dann lädt sie einen vollständigen Run-Snapshot aus `load-fs` nach `stage-fs`. Alle Parquet-Dateien erhalten automatisch 5 DSS-Metadatenspalten (Data Vault 2.1 Standard).

| Eigenschaft | Wert |
|---|---|
| Quelle | `load-fs/ewb/abacus/historized/{Datum}/{RunId}/` |
| Ziel | `stage-fs/ewb/abacus/` |
| Methode | Bulk-Copy (rekursiv, Ordnerhierarchie erhalten) |
| Idempotenz | Staging-Ordner wird vor jeder Ausführung gelöscht und neu befüllt |

**DSS-Metadatenspalten (automatisch hinzugefügt):**

| Spalte | Inhalt |
|---|---|
| `dss_record_source` | Herkunft (`ewb/abacus`) |
| `dss_load_date` | Ladedatum (`yyyy-MM-dd`) |
| `dss_run_id` | Eindeutige Run-ID der ADF-Pipeline |
| `dss_stage_timestamp` | Zeitstempel der Stage-Ausführung (UTC) |
| `dss_source_file_name` | Ursprünglicher Dateiname in `load-fs` |

### 6.2 Gesamtfluss (Soll-Zustand)

| Schritt | Technologie | Detail | Status |
|---|---|---|---|
| 1. Rohdaten laden | ADF (bestehend) | täglich in `landing-zone` | Aktiv |
| 2a. Pilot-Tabellen historisieren | ADF `Copy_LandingZone_to_LoadFS_ewb` | `landing-zone` → `load-fs/{Datum}/{RunId}` | Deployed |
| 2b. Staging bereitstellen | ADF `Copy_Stage_ewb` | `load-fs/{RunId}` → `stage-fs` (+ DSS-Spalten) | Deployed |
| 3. Vault transformieren | dbt (GitHub Actions Runner) | `stage-fs` → stg → hub/sat/link → bv → mart | Geplant |
| 4. Auslösung | GitHub `repository_dispatch` | ADF Web Activity → GitHub Actions Workflow | Geplant |

### 6.3 Ausstehend

| Aufgabe | Detail |
|---|---|
| ADF Trigger einrichten | Täglicher Trigger, der `cw_load_date` und `cw_runId` automatisch übergibt |
| dbt Workflow `deploy-ewb.yml` | GitHub Actions Workflow reagiert auf `repository_dispatch` Event |
| GitHub PAT in Key Vault | Secret `github-pat-dbt-dispatch` für ADF Web Activity |

---

## 7. Phase 5 — Reporting Layer & Power BI

Mart-Tabellen im Schema `mart_project` / `mart_finance` werden als **Star Schema** auf dem Vault-Fundament erstellt. Power BI verbindet sich direkt mit `sql-analytics-ewb-001` und liest aus Dimensionen (`dim_*`) und Faktentabellen (`fakt_*`).

### 7.1 Projekt-Domain — Star Schema (DEPLOYED ✅)

| Mart-Objekt | Typ | Synapse-Äquivalent | Zeilen | Tests |
|---|---|---|---|---|
| `mart_project.dim_person` | Dimension | [Projekt].[Personal]+[Abteilung] | 502 | ✅ 5/5 |
| `mart_project.dim_projekt` | Dimension | [Projekt].[Projekt] | 14.168 | ✅ 4/4 |
| `mart_project.dim_leistungsart` | Dimension | NTR-Lookup | 15 | ✅ 3/3 |
| `mart_project.fakt_stunden` | Fakt | [Projekt].[Stunden] | 199.206 | ✅ 4/4 (2 WARN) |
| `mart.dim_date` | Dimension | (generiert) | 5.844 | ✅ 2/2 |

**ER-Diagramm:** `design/mart/er-mart-project.mmd`

**Validierungs-Ergebnis (15.4.2026):**
- dim_person: Erweitert Synapse Personal um Abteilungs-Attribute. NULLIF-Fix fuer person_code.
- dim_projekt: ✅ Vollständig — inkl. 3 Sharepoint-Spalten (GruppeName, HauptgruppeNr, HauptgruppeName)
- fakt_stunden: PROJNR-Korrektur bestätigt (ProjektNr statt PersonalNr)
- LeistungsartNr: NSA.CODE ist Sachkonto (389 Werte), nicht 1:1 NTR — entspricht Synapse LEFT JOIN

### 7.2 Finance-Domain — Star Schema (DEPLOYED ✅)

| Mart-Objekt | Typ | Synapse-Äquivalent | Zeilen | Status |
|---|---|---|---|---|
| `mart_finance.fakt_buchungen` | Fakt | [Finance].[Buchungen] | 892.713 | ✅ Deployed (Wave 3) |
| `mart_finance.fakt_belege` | Fakt | [Finance].[Belege] | 287.784 | ✅ Deployed (KBL × KVL) |
| `mart_finance.dim_kreditor` | Dimension | [Finance].[Kunden] | 3.159 | ✅ Deployed (hub-Granularität) |
| `mart_project.dim_abteilung` | Dimension | [Projekt].[Abteilung] | ~2.027 | ✅ Deployed (Wave 3) |
| `mart_finance.fakt_budget` | Fakt | [Finance].[Budget] | 52.693 | ✅ Wave 4 (Sharepoint-Planungsdaten) |
| `mart_finance.fakt_forecast` | Fakt | [Finance].[Forecast] | 13.163 | ✅ Wave 4 (Sharepoint-Planungsdaten) |
| `mart_finance.ref_actual_forecast` | Reference | [Finance].[ActualForecast] | 24 | ✅ Wave 4 (Lookup Monat→Actual/Forecast) |

**Bekannte Abweichungen:**
- `dim_kreditor`: 3.159 (Hubs, DISTINCT) vs. Synapse 93.288 (alle KBL-Zeilen, no DISTINCT). DV-Granularität ist korrekt — Synapse ist denormalisiert.
- `fakt_buchungen`: 892.713 vs. Synapse 890.449 (+0.25%). Akzeptable Abweichung durch unterschiedliche Filterlogik.
- `fakt_stunden`: 199.209 vs. Synapse 63.755. Synapse hat bekannten Bug (`PROJNR=LOHNNR`, nur 2.5% Match). EWB-Wert ist korrekt.

**ER-Diagramm:** `design/mart/er-mart-finance.mmd`

---

## 8. Entscheidungslogbuch

| Datum | Entscheidung | Begründung |
|---|---|---|
| März 2026 | dim_abteilung (mart_project) deployed | DISTINCT (EMPL_NR, HOME_DEPT_NR, MUTATION_DATE) aus sat_person__abacus LEFT JOIN ref_abteilung. Matching Synapse Projekt.Abteilung (~2.027 Zeilen) |
| März 2026 | fakt_belege Granularität auf Beleg×Zahlung geändert | KBL LEFT JOIN KVL via link_kreditorenbeleg_zahlung → 287.784 Zeilen matching Synapse Finance.Belege |
| März 2026 | hub_hauptbuch BK-Korrektur: DKBELEGNUMMER||KTO → RECNUM | DKBELEGNUMMER hat 62% Nullen, bis zu 96 Duplikate pro Kombination. RECNUM ist der einzig unique Zeilenidentifier in FIBU.GL |
| März 2026 | ADF Bug gefixt: PreserveHierarchy + leerer fileName (9a46c031) | hub_hauptbuch wuchs von 9.868 auf 433.076 Rows. FIBU.GL E22-E26 werden nun korrekt als Folder-Scan (5 Jahresscheiben) geladen |
| März 2026 | link_buchungskopf_kreditorenbeleg entfernt | FK-Match = 0.08% (FHE.RECNUM = KBL.BELNR) — kein valider fachlicher Join. Link wurde aus dem Vault entfernt |
| März 2026 | Finance Mart deployed (31.3.) | fakt_buchungen (892.713), fakt_belege (287.784), dim_kreditor (3.159) auf `datavault-dev` |
| März 2026 | Star Schema für Projekt-Domain deployed (29.3.) | 3 Dimensionen + 1 Faktentabelle auf `datavault-dev`: dim_person, dim_projekt, dim_leistungsart, fakt_stunden. 173 Tests PASS (2 WARN) |
| März 2026 | NSA.CODE = Sachkonto, nicht Leistungsart | Synapse JOIN `CODE=RECNUM` war ebenfalls fehlerhaft. LEFT JOIN beibehalten (NULL für nicht-matchende Codes) |
| März 2026 | Wave 1 Stammdaten deployed (28.3.) | 27 Modelle auf `datavault-dev`: 5 Hubs, 6 Sats, 3 Links, 3 Refs, 10 Staging Views |
| März 2026 | hub_kreditor als Ghost Hub (aus KBL.KNR) | KRED.KBS enthält keine Kreditoren-Stammdaten — ist Status-Konfiguration. Verschoben nach Wave 2 |
| März 2026 | NTR/PST/LTC als Reference Tables (nicht Hubs) | Kleine, stabile Lookup-Tabellen (29/7/109 Einträge) ohne Historisierungsbedarf |
| März 2026 | EWB Vault-Objekte in `_common` (nicht separater Concept) | EWB ist das einzige Quellsystem auf dieser Instanz — kein `vault_ewb` Schema nötig |
| Feb 2026 | dbt Sources aus `landing-zone` (nicht `structured-tables`) | `structured-tables` enthält Business-Logik; DV 2.1 erfordert Rohdaten als Quelle |
| Feb 2026 | Neuer SQL Server `sql-analytics-ewb-001` im EWB-Tenant | Mandantentrennung von PPMC-Shared-Infrastruktur (`sql-datavault-weu-001`) |
| Feb 2026 | Managed Identity für Storage-Zugriff | Kein statisches Passwort / kein SAS-Token — Zero-Credential-Prinzip |
| Feb 2026 | ADF → dbt via GitHub `repository_dispatch` | Nutzung bestehender GitHub Actions Runner-Infrastruktur |
| Feb 2026 | Snappy Parquet als External File Format | ADF schreibt alle Parquet-Dateien mit Snappy-Komprimierung |
| März 2026 | Neue Container `load-fs` + `stage-fs` statt direkter Lesung aus `landing-zone` | Saubere Trennung: `landing-zone` bleibt unberührt; `stage-fs` ist stabiler, nicht-historisierter dbt-Quellpfad |
| März 2026 | `Copy_Stage_ewb` mit Delete-before-Copy-Ansatz (Idempotenz) | Stage-Ordner wird vollständig ersetzt — kein Datenmix zwischen unterschiedlichen Runs |
| März 2026 | `cw_load_date` als expliziter Pipeline-Parameter (kein AutoExpression) | ADF-Parameter-Defaults unterstützen keine Expressions (`@formatDateTime`) — Trigger übergibt das Datum zur Laufzeit |
| März 2026 | DSS-Metadatenspalten in der Stage-Pipeline (nicht in dbt) | Dateiherkunft und Ladezeit werden beim Kopiervorgang eingeprägt — dbt-Modelle erhalten vollständige Audit-Informationen ohne zusätzliche Logik |
| März 2026 | SAS Token als interim-Credential für `StageFileSystem` | Managed Identity (Zero-Credential) ist bevorzugt — solange RBAC Storage Blob Data Reader nicht gewährt wurde, ermöglicht ein SAS Token die Entwicklung in `datavault-dev`. SAS wird nach MI-Freischaltung abgelöst. |
| März 2026 | dbt Multi-Target (`ewb`, `ewb-dev`, `ewb-test`) | Saubere Trennung Dev/Test/Prod — gleiche Modelle, verschiedene Datenbanken |
| April 2026 | Wave 4 — Budget/Forecast als Mart-Views (nicht Raw Vault) | Sharepoint-Daten ohne Historisierungsbedarf. Staging vorhanden, Mart-Level JOIN reicht |
| April 2026 | dim_projekt um 3 Sharepoint-Spalten erweitert | GruppeName, HauptgruppeNr, HauptgruppeName per LEFT JOIN auf SP-Staging. ~260/14'198 Projekte kategorisiert |
| April 2026 | Zugangsrechte out of scope | 27 Zeilen, operativ/RLS — nicht analytisch. Staging `ewb_sp_zugangsrechte` vorhanden falls später nötig |
| April 2026 | PROJ.NTB out of scope | Abacus-internes Budget-System. Kein Synapse-View verwendet es |

---

## 9. Glossar

| Begriff | Bedeutung |
|---|---|
| **Data Vault 2.1** | Modellierungsstandard für Enterprise Data Warehouses — historisch, auditierbar, erweiterbar |
| **Hub** | Kern-Entität mit eindeutigen Business-Schlüsseln (z.B. alle Projektnummern) |
| **Satellite** | Beschreibende Attribute zu einem Hub, historisch versioniert |
| **Link** | Beziehungstabelle zwischen zwei oder mehr Hubs |
| **dbt** | Open-Source SQL-Transformations-Framework mit Versionierung und automatisierten Tests |
| **datavault** | Produktionsdatenbank auf `sql-analytics-ewb-001` — beinhaltet die produktiven Vault-Schemas (`stg`, `vault`, `bv`, `mart`) |
| **datavault-dev** | Entwicklungsdatenbank — dbt-Entwickler können hier frei modellieren ohne Produktionsdaten zu beeinflussen |
| **datavault-test** | Testdatenbank — für automatisierte dbt-Tests (CI/CD via GitHub Actions) |
| **Azure Data Factory (ADF)** | Microsoft-Dienst für Datenpipelines (ETL/ELT) |
| **landing-zone** | ADLS Gen2 Container für unveränderliche Rohdaten aus den Quellsystemen |
| **load-fs** | ADLS Gen2 Container für historisierte ADF-Kopien — Pfadstruktur: `{context}/{source}/historized/yyyy/MM/dd/{RunId}/` |
| **stage-fs** | ADLS Gen2 Container für den aktuellen Tagesstand — stabiler, nicht-historisierter Quellpfad für dbt External Tables |
| **structured-tables** | ADLS Gen2 Container mit transformierten Daten für das heutige Power BI-Reporting |
| **DSS-Spalten** | Data Vault 2.1 Standard-Metadatenspalten — werden automatisch beim Stage-Lauf hinzugefügt: `dss_record_source`, `dss_load_date`, `dss_run_id`, `dss_stage_timestamp`, `dss_source_file_name` |
| **Synapse Serverless** | Virtuelle SQL-Abfrageschicht über Parquet-Dateien (keine physischen Tabellen) |
| **ADLS Gen2** | Azure Data Lake Storage Generation 2 — zentraler Datenspeicher im EWB-Tenant |
| **SHIR** | Self-Hosted Integration Runtime — On-Premises-Brücke für ADF (VM `EWBSBI01`) |

---

*EWB Analytics Platform | PPMC AG | Stand: 15. April 2026 — Wave 1+2+3+4 deployed. 13/13 structured-tables abgedeckt (1 out of scope: Zugangsrechte). 92 Modelle, 447 Tests.*

> Letztes Update: Wave 3 + Finance Mart deployed (31. März 2026). Alle 36 Vault-Objekte + 8 Mart-Views auf `datavault-dev`. Nächster Schritt: Deployment auf `datavault` (Produktion) + GitHub Actions CI/CD.
