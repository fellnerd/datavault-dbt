# Data Vault dbt Explorer - VS Code Extension

## Projektziel

Eine VS Code Extension zur **Visualisierung und Navigation** von dbt Data Vault 2.1 Projekten mit hierarchischen Tree Views.

## Aktueller Status

### ✅ Implementiert

| Feature | Status | Datei |
|---------|--------|-------|
| Extension Scaffolding | ✅ | `package.json`, `tsconfig.json` |
| TypeScript Interfaces | ✅ | `src/types.ts` |
| dbt Project Parser | ✅ | `src/parser.ts` |
| 4 TreeDataProvider (Staging, Raw Vault, Business Vault, Mart) | ✅ | `src/treeProviders.ts` |
| Model Details Webview mit Lineage (Liste) | ✅ | `src/webviewPanel.ts` |
| Extension Entry Point | ✅ | `src/extension.ts` |
| Commands (Refresh, Open, Details, Select) | ✅ | `src/extension.ts` |
| FileSystemWatcher mit Debounce | ✅ | `src/extension.ts` |
| Workspace Detection | ✅ | `src/parser.ts`, `src/extension.ts` |
| VSIX Package | ✅ | `datavault-dbt-0.1.1.vsix` |

### ❌ Bekanntes Problem

Die Extension funktioniert nicht korrekt bei **Remote SSH** Entwicklung. Sie sollte **lokal** getestet werden.

## Architektur

```
vscode-extension/
├── src/
│   ├── extension.ts      # Entry Point, Commands, FileWatcher, Aktivierung
│   ├── parser.ts         # dbt Project Parser (liest dbt_project.yml + SQL files)
│   ├── types.ts          # TypeScript Interfaces (DbtModel, HubInfo, etc.)
│   ├── treeProviders.ts  # 4 TreeDataProvider für die Layer-Views
│   └── webviewPanel.ts   # Model Details Webview mit Lineage
├── resources/
│   └── datavault.svg     # Activity Bar Icon
├── out/                  # Kompilierte JS-Dateien
├── package.json          # Extension Manifest (contributes, activationEvents)
└── tsconfig.json         # TypeScript Konfiguration
```

## Tree View Struktur

```
📁 Data Vault (Activity Bar)
├── 📂 Staging (stg)
│   ├── 📂 Werkportal
│   │   ├── werkportal_company
│   │   └── werkportal_country
│   └── 📂 Jira
│       └── jira_issue
├── 📂 Raw Vault
│   ├── 📂 Werkportal (vault_werkportal)
│   │   ├── 🔑 Hubs
│   │   │   ├── hub_company
│   │   │   └── hub_country
│   │   ├── 📋 Satellites
│   │   │   └── sat_company
│   │   └── 🔗 Links
│   │       └── link_company_country
│   └── 📂 Adventureworks (vault_adventureworks)
├── 📂 Business Vault
│   ├── 📍 PITs
│   │   └── pit_company
│   └── 🌉 Bridges
└── 📂 Marts
    ├── 📂 Common (mart)
    │   └── dim_date
    └── 📂 Project (mart_project)
```

## Lokale Entwicklung

### Setup

```bash
cd vscode-extension
npm install
npm run compile
```

### Testen (F5)

1. Öffne den Workspace `/home/user/projects/datavault-dbt` in VS Code
2. Drücke **F5** → Extension Development Host startet
3. Im neuen Fenster sollte das **Data Vault Icon** in der Activity Bar erscheinen

### Debugging

- **Output Panel**: View → Output → "Data Vault"
- **Developer Tools**: Help → Toggle Developer Tools → Console
- **Running Extensions**: Ctrl+Shift+P → "Developer: Show Running Extensions"

### Package erstellen

```bash
npm run compile
./node_modules/.bin/vsce package --allow-missing-repository
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
  name: string;           // z.B. "hub_company"
  schema: string;         // z.B. "vault_werkportal"
  type: ModelType;        // 'hub' | 'satellite' | 'link' | ...
  materialized: string;   // 'view' | 'table' | 'incremental'
  filePath: string;       // Absoluter Pfad
  relativePath: string;   // Relativer Pfad
  columns: string[];      // Extrahierte Spalten
  refs: string[];         // ref() Aufrufe
  sources: string[];      // source() Aufrufe
  concept: string;        // Business Concept (werkportal, jira, _common)
  layer: string;          // staging | raw_vault | business_vault | mart
}
```

### Parser Flow (src/parser.ts)

1. Lese `dbt_project.yml` → Project Name, Model Paths
2. Finde alle `.sql` Dateien rekursiv in `models/`
3. Für jede Datei:
   - Inferiere `type` aus Pfad/Name (hub_, sat_, link_, etc.)
   - Inferiere `layer` und `concept` aus Ordnerstruktur
   - Extrahiere `refs()` und `sources()` aus SQL
   - Extrahiere Spalten (Best Effort)
4. Enriche Hubs mit zugehörigen Satellites
5. Enriche Satellites mit Parent Hub
6. Enriche Links mit Connected Hubs

## Nächste Schritte (Roadmap)

### Phase 2
- [ ] Graphische Lineage Visualisierung (D3.js oder Mermaid in Webview)
- [ ] Source-Definitionen aus `sources.yml` anzeigen
- [ ] dbt Test Status Integration

### Phase 3
- [ ] Model Scaffolding Commands (Create Hub, Create Satellite, etc.)
- [ ] Integration mit dbt CLI (run, test, compile)
- [ ] Schema Comparison View

## Referenz: dbt_project.yml Struktur

Das Haupt-dbt-Projekt befindet sich in `/home/user/projects/datavault-dbt/`:

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
      werkportal:
        +schema: vault_werkportal
      adventureworks:
        +schema: vault_adventureworks
    business_vault:
      +schema: vault
    mart:
      _common:
        +schema: mart
      project:
        +schema: mart_project
```

## Kontakt / Kontext

Diese Extension ist Teil des **datavault-dbt** Projekts - einer virtualisierten Data Vault 2.1 Architektur auf Azure. Siehe:
- `docs/MODEL_ARCHITECTURE.md` - Data Vault Architektur
- `docs/DEVELOPER.md` - Entwickler-Konventionen
- `.github/copilot-instructions.md` - Copilot Instructions für das Hauptprojekt
