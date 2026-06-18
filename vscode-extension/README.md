# Data Vault dbt Explorer

VS Code Extension zur Visualisierung und Navigation von dbt Data Vault 2.1 Projekten.

## Features

- **Hierarchische Tree Views** für alle Data Vault Layer:
  - 📥 **Staging** - Staging Views gruppiert nach Business Concept
  - 🏛️ **Raw Vault** - Hubs, Satellites, Links gruppiert nach Concept
  - 📊 **Business Vault** - PITs und Bridges
  - 🎯 **Marts** - Domain-spezifische Views

- **Automatische Projekt-Erkennung** - Findet `dbt_project.yml` im Workspace

- **Live-Refresh** - FileSystemWatcher mit konfigurierbarem Debounce

- **Model Details Panel** - Zeigt Properties, Columns und Lineage

- **Lineage Visualization** (Phase 1) - Upstream/Downstream Dependencies als Liste

## Installation

```bash
cd vscode-extension
npm install
npm run compile
```

### Development

```bash
# Watch mode für Entwicklung
npm run watch

# In VS Code: F5 zum Starten der Extension Development Host
```

### Packaging

```bash
npm run package
# Erstellt .vsix Datei zur Installation
```

## Konfiguration

### Allgemeine Settings

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `datavault.projectPath` | `""` | Pfad zu dbt_project.yml (Auto-Detect wenn leer) |
| `datavault.autoRefresh` | `true` | Automatischer Refresh bei Dateiänderungen |
| `datavault.refreshDebounceMs` | `1000` | Debounce Zeit in ms |
| `datavault.dbtPath` | `""` | Pfad zum dbt-Binary (Auto-Detect im `.venv` wenn leer) |
| `datavault.dbtTarget` | `"dev"` | dbt Target für `run-operation` Befehle (z.B. `dev`, `staging`, `prod`) |

### Azure Storage / Parquet Discovery

Für die **Discover External Sources** Funktion (Parquet-Dateien aus Azure Storage als External Tables anlegen) müssen folgende Settings konfiguriert werden:

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `datavault.storage.accountName` | `""` | Azure Storage Account Name |
| `datavault.storage.containerName` | `""` | Azure Storage Container Name |
| `datavault.storage.dataSource` | `""` | Name der SQL External Data Source (erzeugt via `CREATE EXTERNAL DATA SOURCE`) |
| `datavault.storage.fileFormat` | `"ParquetFormat"` | Name des SQL External File Format (erzeugt via `CREATE EXTERNAL FILE FORMAT`) |

Die Werte werden am besten in `.vscode/settings.json` im Projektordner gespeichert, damit sie für alle Teammitglieder gelten:

```json
{
  "datavault.dbtTarget": "dev",
  "datavault.storage.accountName": "mystorageaccount",
  "datavault.storage.containerName": "mycontainer",
  "datavault.storage.dataSource": "MyDataSource",
  "datavault.storage.fileFormat": "ParquetFormat"
}
```

#### Funktionsweise

Der Discover-Prozess läuft in **zwei Phasen**, die jeweils eine andere Quelle nutzen:

```
                    ┌─────────────────────────────────────────────┐
                    │  Phase 1: Datei-Listing (Azure Blob Storage) │
  Ordner-Pfad  ───► │  az storage blob list                        │
  z.B.              │    --account-name <storage.accountName>      │
  IDMS/address/     │    --container-name <storage.containerName>  │ ───► Liste .parquet-Dateien
                    │    --prefix <pfad>/  --auth-mode login       │
                    └─────────────────────────────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │  Phase 2: Schema-Ermittlung (Azure SQL)      │
  ausgewählte  ───► │  dbt run-operation get_parquet_schema        │
  Datei             │    --args '{ data_source: <storage.dataSource>,│ ───► sources.yml
                    │              file_format: <storage.fileFormat>}'│      (External Table)
                    └─────────────────────────────────────────────┘
```

1. **Phase 1 – Datei-Listing über die Azure CLI:**
   Die Extension ruft `az storage blob list` auf, um alle `*.parquet`-Dateien unter dem angegebenen Ordner-Pfad zu finden.
   - Quelle: **Azure Blob Storage / ADLS Gen2** (`storage.accountName` + `storage.containerName`)
   - Authentifizierung: `--auth-mode login` → nutzt deine `az login`-Sitzung (siehe unten)
   - Verzeichnis-Enumeration wird bewusst über die Azure CLI gemacht, da Azure SQL Database (anders als Synapse Serverless) keine `OPENROWSET`-Wildcards unterstützt.

2. **Phase 2 – Schema-Ermittlung über dbt:**
   Für jede ausgewählte Datei ruft die Extension das dbt-Macro `get_parquet_schema` auf, das per External Data Source das Parquet-Schema ausliest.
   - Quelle: **Azure SQL External Data Source** (`storage.dataSource` + `storage.fileFormat`)
   - Das Ergebnis wird als External-Table-Definition in `models/staging/sources.yml` eingetragen.

> **Hinweis:** Die beiden Quellen sind unabhängig. `storage.dataSource` (z.B. `StageFileSystem` oder `LandingZoneFS`) muss in der Azure SQL DB als External Data Source existieren und auf denselben Container zeigen wie `storage.containerName`.

#### Azure Login (Voraussetzung)

Phase 1 nutzt die **Azure CLI** mit deiner interaktiven Anmeldung. Ohne gültige Sitzung schlägt der Discover fehl.

```powershell
# 1. Azure CLI installieren (falls nicht vorhanden): https://aka.ms/azure-cli

# 2. Anmelden (öffnet Browser-Login)
az login

# 3. Richtiges Abo wählen (falls mehrere)
az account set --subscription "<subscription-id-oder-name>"

# 4. Zugriff testen — muss eine JSON-Liste der Parquet-Dateien liefern
az storage blob list `
  --account-name <storage.accountName> `
  --container-name <storage.containerName> `
  --prefix "IDMS/address/" `
  --auth-mode login `
  --query "[].name" -o json
```

Wenn Schritt 4 eine Dateiliste zurückgibt, funktioniert auch der Discover in der Extension.

> **Berechtigung:** Dein Azure-Konto braucht auf dem Storage Account mindestens die Rolle **Storage Blob Data Reader** (RBAC). `--auth-mode login` nutzt RBAC statt Account-Keys.

#### Troubleshooting

| Symptom | Ursache | Lösung |
|---------|---------|--------|
| `Failed to run az CLI: spawn az ENOENT` | Azure CLI nicht installiert oder nicht im PATH | `az` installieren, danach VS Code **komplett neu starten** (nicht nur Fenster neu laden), damit der aktualisierte PATH übernommen wird |
| `Azure CLI (az) not found` | wie oben | siehe oben |
| `No Parquet files found in "<pfad>/"` | Pfad falsch, leerer Ordner oder fehlende Anmeldung | Pfad ohne führenden Slash angeben (z.B. `IDMS/address/`); `az login` prüfen; Test-Befehl oben ausführen |
| `az storage blob list failed (... AuthorizationPermissionMismatch)` | Konto hat keine Blob-Leserechte | Rolle **Storage Blob Data Reader** auf dem Storage Account zuweisen lassen |
| Schema leer / Phase 2 schlägt fehl | `storage.dataSource` existiert nicht in Azure SQL | External Data Source via `CREATE EXTERNAL DATA SOURCE` anlegen und Namen im Setting eintragen |

> **Windows-Hinweis:** Die Azure CLI ist auf Windows ein Batch-Skript (`az.cmd`). Die Extension startet sie deshalb über die Shell — ein manueller Workaround ist nicht nötig.


## Verwendung

1. Öffne einen Workspace mit einem dbt-Projekt
2. Die Extension erkennt automatisch `dbt_project.yml`
3. Navigiere über die Activity Bar zum "Data Vault" Icon
4. Klicke auf ein Model um die Datei zu öffnen
5. Rechtsklick → "Show Model Details" für Lineage

## Commands

| Command | Beschreibung |
|---------|--------------|
| `Data Vault: Refresh` | Projekt neu laden |
| `Data Vault: Open Model File` | Model-Datei öffnen |
| `Data Vault: Show Lineage` | Lineage anzeigen |
| `Data Vault: Show Model Details` | Detail-Panel öffnen |
| `Data Vault: Select dbt Project` | Projekt manuell wählen |

## Tree Structure

```
📁 Data Vault
├── 📂 Staging (stg)
│   ├── 📂 Jira
│   │   ├── 📥 jira_company
│   │   └── 📥 jira_country
│   └── 📂 Adventureworks
│       └── 📥 adventureworks_customer
├── 📂 Raw Vault
│   ├── 📂 Jira (vault_jira)
│   │   ├── 🔑 Hubs
│   │   │   ├── hub_company
│   │   │   └── hub_country
│   │   ├── 📋 Satellites
│   │   │   └── sat_company
│   │   └── 🔗 Links
│   │       └── link_company_country
│   └── 📂 Common (vault)
├── 📂 Business Vault
│   ├── 📍 PITs
│   │   └── pit_company
│   └── 🌉 Bridges
└── 📂 Marts
    ├── 📂 Common (mart)
    │   └── dim_date
    └── 📂 Project (mart_project)
        └── company_current_v
```

## Architektur

```
vscode-extension/
├── src/
│   ├── extension.ts      # Entry Point, Commands, Lifecycle
│   ├── parser.ts         # dbt Project Parser
│   ├── types.ts          # TypeScript Interfaces
│   ├── treeProviders.ts  # TreeDataProvider für Views
│   └── webviewPanel.ts   # Model Details Webview
├── resources/
│   └── datavault.svg     # Activity Bar Icon
├── package.json          # Extension Manifest
└── tsconfig.json         # TypeScript Config
```

## Roadmap

- [x] Phase 1: Tree Views mit Layer-Hierarchie
- [x] Phase 1: Lineage als Liste
- [ ] Phase 2: Graphische Lineage (D3/Mermaid)
- [ ] Phase 2: Source-Definitionen (sources.yml) anzeigen
- [ ] Phase 2: dbt Test Status Integration
- [ ] Phase 3: Model Scaffolding Commands
