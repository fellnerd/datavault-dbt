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

> **Voraussetzung:** `az login` muss aktiv sein, damit `az storage blob list` auf den Storage Account zugreifen kann.

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
