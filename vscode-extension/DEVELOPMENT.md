# Data Vault dbt Explorer - VS Code Extension

## Projektziel

Eine VS Code Extension zur **Visualisierung und Navigation** von dbt Data Vault 2.1 Projekten mit hierarchischen Tree Views.

## Aktueller Status

### ✅ Implementiert

| Feature | Status | Modul |
|---------|--------|-------|
| Extension Scaffolding | ✅ | `package.json`, `tsconfig.json` |
| TypeScript Interfaces | ✅ | `src/types.ts` |
| dbt Project Parser | ✅ | `src/parser.ts` |
| 5 TreeDataProvider (Sources, Staging, Raw Vault, Business Vault, Mart) | ✅ | `src/providers/` |
| Model Details Webview mit Lineage | ✅ | `src/webviewPanel.ts` |
| Extension Entry Point | ✅ | `src/extension.ts` |
| Commands (Refresh, Open, Details, Select, Discover, Stage) | ✅ | `src/commands/` |
| FileSystemWatcher mit Debounce | ✅ | `src/extension.ts` |
| Workspace Detection | ✅ | `src/parser.ts`, `src/extension.ts` |
| External Sources Discovery (Parquet → sources.yml) | ✅ | `src/discoverService.ts`, `src/commands/discover.ts` |
| External Table Creation (dbt stage_external_sources) | ✅ | `src/commands/external.ts` |
| VSIX Package | ✅ | `datavault-dbt-0.1.1.vsix` |

### ❌ Bekanntes Problem

Die Extension funktioniert nicht korrekt bei **Remote SSH** Entwicklung. Sie sollte **lokal** getestet werden.

## Architektur

```
vscode-extension/
├── src/
│   ├── extension.ts          # Entry Point, Activation, Provider Setup
│   ├── types.ts              # TypeScript Interfaces (DbtModel, HubInfo, etc.)
│   ├── parser.ts             # dbt Project Parser (YAML + SQL Analyse)
│   ├── webviewPanel.ts       # Model Details Webview mit Lineage
│   ├── discoverService.ts    # Parquet Discovery via dbt Macros
│   ├── treeProviders.ts      # [DEPRECATED] Re-exports from providers/
│   │
│   ├── commands/             # Command Implementations
│   │   ├── index.ts          # Command Registration + Simple Commands
│   │   ├── discover.ts       # Discover External Sources Wizard
│   │   └── external.ts       # Create External Table Commands
│   │
│   └── providers/            # Tree Data Providers
│       ├── index.ts          # Module Exports
│       ├── base.ts           # DataVaultTreeProvider Base Class
│       ├── layers.ts         # Staging, Raw Vault, Business Vault, Mart Providers
│       └── load.ts           # External Tables Provider (Sources)
│
├── resources/
│   └── datavault.svg         # Activity Bar Icon
├── out/                      # Compiled JS Output
├── package.json              # Extension Manifest
└── tsconfig.json             # TypeScript Configuration
```

## Modul-Abhängigkeiten

```
extension.ts
├── commands/index.ts
│   ├── commands/discover.ts → discoverService.ts
│   └── commands/external.ts → discoverService.ts
├── providers/index.ts
│   ├── providers/base.ts → types.ts
│   ├── providers/layers.ts → providers/base.ts
│   └── providers/load.ts → providers/base.ts
├── parser.ts → types.ts
└── webviewPanel.ts → types.ts
```

## Tree View Struktur

```
📁 Data Vault (Activity Bar)
├── 📂 Sources (External Tables)
│   └── 📂 Adventureworks
│       └── ext_adventureworks_customer
├── 📂 Staging (stg)
│   └── 📂 Adventureworks
│       └── adventureworks_customer
├── 📂 Raw Vault
│   └── 📂 Adventureworks (vault_adventureworks)
│       ├── 🔑 Hubs
│       │   └── hub_customer
│       └── 📋 Satellites
│           └── sat_customer
├── 📂 Business Vault
│   ├── 📍 PITs
│   └── 🌉 Bridges
└── 📂 Marts
    └── 📂 Common (mart)
        └── dim_date
```

## Lokale Entwicklung

### Setup

```bash
cd vscode-extension
npm install
npm run compile
```

### Testen (F5)

1. Öffne den Workspace `C:\Users\User\source\datavault-dbt` in VS Code
2. Drücke **F5** → Extension Development Host startet
3. Im neuen Fenster sollte das **Data Vault Icon** in der Activity Bar erscheinen

### Debugging

- **Output Panel**: View → Output → "Data Vault"
- **Developer Tools**: Help → Toggle Developer Tools → Console
- **Running Extensions**: Ctrl+Shift+P → "Developer: Show Running Extensions"

### Package erstellen

```bash
npm run compile
npx vsce package --allow-missing-repository
# Erstellt: datavault-dbt-x.x.x.vsix
```

### Package installieren

```bash
code --install-extension datavault-dbt-x.x.x.vsix
```

## Key Interfaces

### DbtModel (src/types.ts)

```typescript
interface DbtModel {
  name: string;           // z.B. "hub_customer"
  schema: string;         // z.B. "vault_adventureworks"
  type: ModelType;        // 'hub' | 'satellite' | 'link' | ...
  materialized: string;   // 'view' | 'table' | 'incremental'
  filePath: string;       // Absoluter Pfad zur SQL-Datei
  relativePath: string;   // Relativer Pfad im Projekt
  columns: ColumnInfo[];  // Spalten mit Name, DataType, Description
  refs: string[];         // ref() Aufrufe im SQL
  sources: string[];      // source() Aufrufe im SQL
  concept: string;        // Business Concept (adventureworks, _common)
  layer: string;          // staging | raw_vault | business_vault | mart
  _yamlPath?: string;     // Pfad zur YAML Schema-Datei
}
```

### ExternalTable (src/types.ts)

```typescript
interface ExternalTable {
  name: string;           // z.B. "ext_adventureworks_customer"
  description?: string;
  sourceName: string;     // Parent source name (staging)
  schema: string;         // stg
  columns: ColumnInfo[];  // Spalten mit Datentypen
  location?: string;      // Parquet-Pfad in ADLS
  fileFormat?: string;    // PARQUET
  dataSource?: string;    // External Data Source Name
  concept: string;        // Extrahiert aus Location/Name
  _yamlPath: string;      // Pfad zur sources.yml
}
```

### Parser Flow (src/parser.ts)

1. Lese `dbt_project.yml` → Project Name, Model Paths
2. Lade alle YAML Schema-Dateien (`*__models.yml`, `schema.yml`)
3. Finde alle `.sql` Dateien rekursiv in `models/`
4. Für jedes Model:
   - YAML-Definition als primäre Quelle (Spalten, Description)
   - SQL-Analyse für refs() und sources()
   - Inferiere `type` aus Pfad/Name (hub_, sat_, link_, etc.)
   - Inferiere `layer` und `concept` aus Ordnerstruktur
5. Enriche Hubs mit zugehörigen Satellites
6. Enriche Satellites mit Parent Hub
7. Enriche Links mit Connected Hubs
8. Parse `sources.yml` für External Tables

## Commands

| Command | ID | Beschreibung |
|---------|-----|-------------|
| Refresh | `datavault.refresh` | Projekt neu laden |
| Open Model | `datavault.openModel` | SQL-Datei öffnen |
| Show Details | `datavault.showModelDetails` | Webview mit Model-Details |
| Show Lineage | `datavault.showLineage` | Webview mit Lineage-Graph |
| Select Project | `datavault.selectProject` | dbt-Projekt manuell auswählen |
| Open YAML | `datavault.openYamlDefinition` | YAML Schema öffnen |
| Copy Name | `datavault.copyModelName` | Model-Name kopieren |
| Copy ref() | `datavault.copyRefSyntax` | `{{ ref('model') }}` kopieren |
| Discover Sources | `datavault.discoverSources` | Parquet-Dateien entdecken |
| Create External Table | `datavault.createExternalTable` | Einzelne Ext. Table erstellen |
| Create All Tables | `datavault.createAllExternalTables` | Alle Ext. Tables für Concept |
| Stage All | `datavault.stageAllExternalSources` | Alle External Sources stagen |

## Nächste Schritte (Roadmap)

### Phase 2
- [ ] Graphische Lineage Visualisierung (D3.js oder Mermaid in Webview)
- [ ] dbt Test Status Integration
- [ ] Model Scaffolding Commands (Create Hub, Create Satellite, etc.)

### Phase 3
- [ ] Integration mit dbt CLI (run, test, compile)
- [ ] Schema Comparison View

## Referenz: dbt_project.yml Struktur

Das Haupt-dbt-Projekt befindet sich in `C:\Users\User\source\datavault-dbt`:

```yaml
name: 'datavault'
model-paths: ["models"]

models:
  datavault:
    staging:
      +schema: stg
    raw_vault:
      _common:
        +schema: vault
      adventureworks:
        +schema: vault_adventureworks
    business_vault:
      +schema: vault
    mart:
      _common:
        +schema: mart
```

## Konfiguration (settings.json)

```json
{
  "datavault.projectPath": "",           // Optionaler Pfad zum dbt-Projekt
  "datavault.autoRefresh": true,         // Auto-Refresh bei Dateiänderungen
  "datavault.refreshDebounceMs": 1000,   // Debounce für File Watcher
  "datavault.dbtPath": "",               // Pfad zu dbt executable (auto-detect)
  "datavault.lastDiscoverPath": ""       // Zuletzt verwendeter ADLS-Pfad
}
```

## Kontakt / Kontext

Diese Extension ist Teil des **datavault-dbt** Projekts - einer virtualisierten Data Vault 2.1 Architektur auf Azure. Siehe:
- `docs/MODEL_ARCHITECTURE.md` - Data Vault Architektur
- `docs/DEVELOPER.md` - Entwickler-Konventionen
- `.github/copilot-instructions.md` - Copilot Instructions für das Hauptprojekt
