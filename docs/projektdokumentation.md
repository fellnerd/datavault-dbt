# EWB Analytics Platform — Projektdokumentation

| | |
|---|---|
| **Kunde** | EWB Energie Wasser Bern |
| **Projekt** | EWB Analytics Platform (Data Vault 2.1) |
| **Erstellt** | 27. Februar 2026 |
| **Stand** | 12. März 2026 |
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
| 2 | Infrastruktur: SQL Server + Datenbankinitialisierung | In Bearbeitung |
| 3 | Raw Vault: Staging, Hubs, Satellites, Links | In Bearbeitung |
| 4 | Orchestrierung & Automatisierung (ADF → dbt) | In Bearbeitung |
| 5 | Reporting Layer & Power BI | Geplant |

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
| KRED.KBS | Kreditorensalden |

**Projects:**

| Tabelle | Inhalt |
|---|---|
| PROJ.NPO | Projektpositionen |
| PROJ.NTC / NTCA / NTCE / NTB | Tätigkeiten, Budgets |
| PROJ.NSA / NTR | Stundenbuchungen |
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

### 5.1 Implementierungsfortschritt (Stand 12. März 2026)

| Schicht | Implementiert | Pilot-Scope | Fortschritt |
|---|---|---|---|
| External Tables | 19 | 19 | 100% (datavault-dev) |
| Staging-Views | 1 | 19 | 5% |
| Hubs | 0 | 10 (+2 Ghost) | 0% |
| Satellites | 0 | 14 | 0% |
| Links | 0 | 11 | 0% |

**Implementierungsplan:** `design/raw-vault/_common/implementierungsplan.md` (erstellt 12. März 2026, basierend auf Synapse-Analyse)

### 5.2 Staging-Layer (stg.ewb_*)

| Tabelle | External Table | Staging-View | Status |
|---|---|---|---|
| FIBU.FHE | `stg.ext_ewb_fibu_fhe_main` | `stg.ewb_fibu_fhe_main` | Komplett (Referenz-Modell) |
| FIBU.GL.E22 | `stg.ext_ewb_fibu_gl_e22` | `stg.ewb_fibu_gl_e22` | View ausstehend |
| FIBU.GL.E23 | `stg.ext_ewb_fibu_gl_e23` | `stg.ewb_fibu_gl_e23` | View ausstehend |
| FIBU.GL.E24 | `stg.ext_ewb_fibu_gl_e24` | `stg.ewb_fibu_gl_e24` | View ausstehend |
| FIBU.GL.E25 | `stg.ext_ewb_fibu_gl_e25` | `stg.ewb_fibu_gl_e25` | View ausstehend |
| FIBU.GL.E26 | `stg.ext_ewb_fibu_gl_e26` | `stg.ewb_fibu_gl_e26` | View ausstehend |
| KRED.KBL | `stg.ext_ewb_kred_kbl_main` | `stg.ewb_kred_kbl_main` | View ausstehend |
| KRED.KVL | `stg.ext_ewb_kred_kvl_main` | `stg.ewb_kred_kvl_main` | View ausstehend |
| KRED.KBS | `stg.ext_ewb_kred_kbs_main` | `stg.ewb_kred_kbs_main` | View ausstehend |
| PROJ.NPO | `stg.ext_ewb_proj_npo_main` | `stg.ewb_proj_npo_main` | View ausstehend |
| PROJ.NTC | `stg.ext_ewb_proj_ntc_main` | `stg.ewb_proj_ntc_main` | View ausstehend |
| PROJ.NTB | `stg.ext_ewb_proj_ntb_main` | `stg.ewb_proj_ntb_main` | View ausstehend |
| PROJ.NSA | `stg.ext_ewb_proj_nsa_main` | `stg.ewb_proj_nsa_main` | View ausstehend |
| PROJ.NTR | `stg.ext_ewb_proj_ntr_main` | `stg.ewb_proj_ntr_main` | View ausstehend |
| PROJ.PST | `stg.ext_ewb_proj_pst_main` | `stg.ewb_proj_pst_main` | View ausstehend |
| PROJ.PRT | `stg.ext_ewb_proj_prt_main` | `stg.ewb_proj_prt_main` | View ausstehend |
| LOHN.LEN | `stg.ext_ewb_lohn_len_main` | `stg.ewb_lohn_len_main` | View ausstehend |
| LOHN.LTC | `stg.ext_ewb_lohn_ltc_main` | `stg.ewb_lohn_ltc_main` | View ausstehend |
| PUBL.ADR | `stg.ext_ewb_publ_adr_main` | `stg.ewb_publ_adr_main` | View ausstehend |

### 5.3 Raw Vault — Geplante Objekte

| Entität | Typ | Basiert auf | Status |
|---|---|---|---|
| `hub_konto` | Hub | FIBU.GL | Geplant |
| `hub_lieferant` | Hub | KRED.KBL | Geplant |
| `hub_beleg` | Hub | KRED.KBL | Geplant |
| `hub_beleg_fhe` | Hub | FIBU.FHE | Geplant |
| `sat_buchung` | Satellite | FIBU.GL | Geplant |
| `sat_beleg_fhe` | Satellite | FIBU.FHE | Geplant |
| `sat_beleg_detail` | Satellite | KRED.KBL + KVL | Geplant |
| `sat_zahlung` | Satellite | KRED.KVL | Geplant |
| `sat_saldo` | Satellite | KRED.KBS | Geplant |
| `link_beleg_lieferant` | Link | KRED.KBL | Geplant |
| `hub_projekt` | Hub | PROJ.NPO | Geplant |
| `sat_projekt_stamm` | Satellite | PROJ.NPO + PST | Geplant |
| `hub_stunden` | Hub | PROJ.NSA | Geplant |
| `sat_stundenbuchung` | Satellite | PROJ.NSA | Geplant |
| `link_stunden_projekt` | Link | PROJ.NSA + NTR | Geplant |
| `hub_mitarbeiter` | Hub | LOHN.LEN | Geplant |
| `sat_mitarbeiter` | Satellite | LOHN.LEN | Geplant |
| `hub_adresse` | Hub | PUBL.ADR | Geplant |
| `sat_adresse` | Satellite | PUBL.ADR | Geplant |

### 5.4 Bereits erstellte dbt-Infrastruktur

| Artefakt | Detail | Status |
|---|---|---|
| `models/raw_vault/_common/` | Zielordner für EWB Vault-Modelle (hubs/, satellites/, links/) | Konfiguriert |
| `dbt_project.yml` | EWB-Modelle nutzen `_common` (Schema: `vault`, `as_columnstore: false`) | Erstellt (9. März 2026) |
| `models/staging/ewb_fibu_fhe_main.sql` | Referenz-Staging-View (5-Block-Struktur, VARBINARY-Pattern) | Erstellt |
| `models/staging/sources.yml` | Alle 19 External Tables `ext_ewb_*` konfiguriert | Erstellt (9. März 2026) |

---

### 5.5 Offene Design-Fragen (Meeting-Vorbereitung)

Diese drei Fragen müssen vor dem Implementierungsstart Wave 2/3 mit EWB geklärt werden. Vollständige technische Analyse: `design/raw-vault/_common/implementierungsplan.md` Abschnitt 7.

| # | Frage | Betrifft | Wave |
|---|---|---|---|
| F1 | Kann dieselbe Belegnummer (`BELEGNR`) auf mehreren Konten (`KONTO`) erscheinen (Soll/Haben-Buchung)? | Datenbankstruktur für 890.449 Buchungszeilen | 2 |
| F2 | Was bedeutet das Feld `CODE` in PROJ.NSA — Mitarbeiterkürzel, Leistungsart oder Kostenstelle? Und: über welches Feld wird der Personenbezug hergestellt? | Person-Verlinkung für Stundenbuchungen (63.755 Zeilen) | 3 |
| F3 | Kommen Leistungsarten (PROJ.NTR) auch aus anderen Systemen (z.B. IDMS)? Ist Historisierung der Bezeichnungen nötig? | Einfache Lookup-Tabelle vs. vollständiger Hub+Satellite | 1 |

**Hintergrund F1:** Bei Soll/Haben-Buchung auf mehreren Konten pro Beleg → BK = `BELEGNR||KONTO` (jede Zeile ist eigene Hub-Instanz). Falls `BELEGNR` eindeutig pro Konto → BK = `BELEGNR` mit separatem `hub_konto`. Die Antwort bestimmt die gesamte FIBU-Modellierung.

**Hintergrund F2:** Die Rohdaten (`stg.ext_ewb_proj_nsa_main`) enthalten `PROJNR` (Projektbezug vorhanden ✅). Spalten `PRONR` und `SATZID` existieren **nicht**. PROJ.NSA ist eine aggregierte Periodenauswertung (`PROJNR + CODE + PERIYEAR + PERIMONTH + GB`) — kein direktes Personalfeld sichtbar. Synapse `Projekt.Stunden` joined NSA mit PUBL.ADR, aber über welches Feld ist unklar. Falls kein Personenbezug ableitbar: `link_stundenbuchung_person` entfällt.

**Hintergrund F3:** NTR-Tabelle hat < 100 Einträge und ändert sich selten. Wenn nur Abacus-Quelle → einfache `ref_leistungsart` (dbt Seed, kein Hash-Join). Wenn Multi-Source oder Historisierung → `hub_leistungsart + sat_leistungsart`.

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

Mart-Views im Schema `mart` werden auf dem Vault-Fundament erstellt. Power BI verbindet sich direkt mit `sql-analytics-ewb-001` und liest aus diesen Views.

---

## 8. Entscheidungslogbuch

| Datum | Entscheidung | Begründung |
|---|---|---|
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

*EWB Analytics Platform | PPMC AG | Stand: 12. März 2026 — Credential-Umstellung auf Managed Identity abgeschlossen*

> Letztes Update: RBAC Storage Blob Data Reader durch EWB-Admin eingerichtet (12. März 2026). SAS Token kann nun durch Managed Identity ersetzt werden. Nächster Schritt: Credential-Umstellung + External Data Sources auf `datavault-test` / `datavault` einrichten.
