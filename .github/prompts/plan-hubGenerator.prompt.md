# Plan: Entity Designer Webview für VS Code Extension

## Übersicht

Statt separater Wizards für Hub, Satellite und Link wird ein **interaktiver Webview** verwendet, in dem alle Attribute einer Entity auf einen Blick definiert werden. Daraus werden dann alle Data Vault Objekte generiert.

## Konzept: Attribut-basiertes Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Entity Designer: werkportal_contacts                              [×]  │
├─────────────────────────────────────────────────────────────────────────┤
│  Source: ext_werkportal_public_wp_contacts                              │
│  Entity: contacts    Concept: werkportal                                │
├─────────────────────────────────────────────────────────────────────────┤
│  Column                │ Column Type      │ Target / Options            │
│  ────────────────────────────────────────────────────────────────────── │
│  object_id             │ [Business Key ▼] │                             │
│  subscription          │ [Business Key ▼] │                             │
│  name                  │ [Attribute    ▼] │ ☑ Include in Hash Diff     │
│  email1                │ [Attribute    ▼] │ ☑ Include in Hash Diff     │
│  company_supplier      │ [Foreign Key  ▼] │ → [hub_company        ▼]   │
│  company_client        │ [Foreign Key  ▼] │ → [hub_company        ▼]   │
│  contact_function_id   │ [Foreign Key  ▼] │ → [hub_function       ▼]   │
│  dss_record_source     │ [Metadata     ▼] │ (auto)                      │
│  dss_load_date         │ [Metadata     ▼] │ (auto)                      │
├─────────────────────────────────────────────────────────────────────────┤
│  Preview:                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────────┐    │
│  │ hub_contacts│  │ sat_contacts│  │ link_contacts_company        │    │
│  │ • hk_       │  │ • hk_       │  │ • hk_link_                   │    │
│  │ • object_id │  │ • hd_       │  │ • hk_contacts                │    │
│  │ • subscr... │  │ • name      │  │ • hk_company                 │    │
│  │ • dss_*     │  │ • email1    │  │ • company_supplier (driving) │    │
│  └─────────────┘  │ • ...       │  └──────────────────────────────┘    │
│                   └─────────────┘                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  [Generate All]  [Generate Hub]  [Generate Satellite]  [Generate Links] │
└─────────────────────────────────────────────────────────────────────────┘
```

## Column Types

| Type | Beschreibung | Generiert in |
|------|--------------|--------------|
| **Business Key** | Eindeutige Identifikation | Hub (+ Hash Key Berechnung) |
| **Attribute** | Beschreibende Daten | Satellite (+ Hash Diff) |
| **Foreign Key** | Referenz zu anderem Hub | Link |
| **Metadata** | dss_* Spalten | Alle Objekte (auto) |
| **Ignore** | Nicht verwenden | Nichts |

## UI Komponenten (vscrui - React UI Library)

Wir verwenden **vscrui** - eine aktiv gepflegte React-Bibliothek für VS Code Webviews.

> **Hinweis:** Das ursprünglich geplante `@vscode/webview-ui-toolkit` wurde am 6. Januar 2025 deprecated.
> `vscrui` ist die offizielle Nachfolge-Empfehlung für React-basierte Webviews.

### Installation

```bash
cd vscode-extension
npm install vscrui
```

### Komponenten-Mapping

| UI Element | vscrui Komponente | Verwendung |
|------------|-------------------|------------|
| Spalten-Tabelle | `<Table>` | Haupttabelle mit allen Columns |
| Column Type Auswahl | `<Dropdown>` | BK/Attribute/FK/Metadata/Ignore |
| FK Target Hub | `<Dropdown>` | Auswahl des Ziel-Hubs |
| Hash Diff Checkbox | `<Checkbox>` | "Include in Hash Diff" |
| Generate Buttons | `<Button>` | Primary/Secondary Actions |
| Entity Name | `<TextField>` | Editierbar |
| Preview Tabs | `<Panels>` | Hub/Satellite/Links Preview |
| Loading Spinner | `<Loader>` | Während Generation |
| Tags | `<Tag>` | Metadaten-Spalten markieren |
| Divider | `<Divider>` | Sektionen trennen |
| Labels | `<Label>` | Beschriftungen |
| Icons | `<Icon>` | Codicons (z.B. $(add), $(check)) |

### React Import

```typescript
import {
  Button,
  Checkbox,
  Divider,
  Dropdown,
  Icon,
  Label,
  Loader,
  Panels,
  Table,
  Tag,
  TextField
} from 'vscrui';
import 'vscrui/dist/codicon.css'; // Für Icons
```

### Entity Designer Layout (mit vscrui Komponenten)

```tsx
import { Button, Checkbox, Divider, Dropdown, Label, Loader, Panels, Table, Tag, TextField } from 'vscrui';
import 'vscrui/dist/codicon.css';

<div className="entity-designer">
  <header>
    <TextField 
      value={entityName} 
      onChange={(e) => setEntityName(e.target.value)}
      placeholder="Entity Name"
    />
    <Tag>{concept}</Tag>
  </header>
  
  <Divider />
  
  {/* Spalten-Grid */}
  <Table>
    <thead>
      <tr>
        <th>Column</th>
        <th>Data Type</th>
        <th>Column Type</th>
        <th>Target / Options</th>
      </tr>
    </thead>
    <tbody>
      {columns.map(col => (
        <tr key={col.name}>
          <td>{col.name}</td>
          <td><code>{col.dataType}</code></td>
          <td>
            <Dropdown 
              value={col.columnType} 
              onChange={(value) => updateColumnType(col.name, value)}
              options={[
                { label: 'Business Key', value: 'business_key' },
                { label: 'Attribute', value: 'attribute' },
                { label: 'Foreign Key', value: 'foreign_key' },
                { label: 'Metadata', value: 'metadata' },
                { label: 'Ignore', value: 'ignore' }
              ]}
            />
          </td>
          <td>
            {col.columnType === 'attribute' && (
              <Checkbox 
                checked={col.includeInHashDiff}
                onChange={(checked) => updateHashDiff(col.name, checked)}
              >
                Hash Diff
              </Checkbox>
            )}
            {col.columnType === 'foreign_key' && (
              <Dropdown 
                value={col.foreignKeyTarget}
                onChange={(value) => updateFKTarget(col.name, value)}
                options={existingHubs.map(hub => ({ label: hub, value: hub }))}
              />
            )}
            {col.columnType === 'metadata' && <Tag>auto</Tag>}
          </td>
        </tr>
      ))}
    </tbody>
  </Table>
  
  <Divider />
  
  {/* Preview Tabs */}
  <Panels
    tabs={[
      { id: 'hub', label: 'Hub' },
      { id: 'sat', label: 'Satellite' },
      { id: 'links', label: 'Links' }
    ]}
  >
    <div id="hub"><pre>{hubPreview}</pre></div>
    <div id="sat"><pre>{satellitePreview}</pre></div>
    <div id="links"><pre>{linksPreview}</pre></div>
  </Panels>
  
  <Divider />
  
  {/* Action Buttons */}
  <footer>
    <Button appearance="primary" onClick={generateAll}>
      Generate All
    </Button>
    <Button appearance="secondary" onClick={generateHub}>
      Generate Hub
    </Button>
    <Button appearance="secondary" onClick={generateSatellite}>
      Generate Satellite
    </Button>
    <Button appearance="secondary" onClick={generateLinks}>
      Generate Links
    </Button>
  </footer>
  
  {isGenerating && <Loader />}
</div>
```

### Styling

Das Toolkit übernimmt automatisch das VS Code Theme (Light/Dark/High Contrast). 
Nur minimales Custom CSS für Layout:

```css
.entity-designer {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

footer {
  display: flex;
  gap: 8px;
}

vscode-data-grid {
  width: 100%;
}
```

## Data Vault Komponenten (DV 2.0 Standard)

### Hub Struktur
| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `hk_<entity>` | CHAR(64) | Hash Key (Primary Key) |
| `<bk_columns>` | varies | Business Key(s) - Original-Werte |
| `dss_load_date` | DATETIME2 | Erster Load-Zeitpunkt |
| `dss_record_source` | VARCHAR | Datenquelle |

### Satellite Struktur
| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `hk_<entity>` | CHAR(64) | FK zum Hub |
| `hd_<entity>` | CHAR(64) | Hash Diff (Change Detection) |
| `<attributes>` | varies | Alle Attribute-Spalten |
| `dss_load_date` | DATETIME2 | Load-Zeitpunkt |
| `dss_record_source` | VARCHAR | Datenquelle |

### Link Struktur
| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `hk_link_<name>` | CHAR(64) | Hash Key des Links |
| `hk_<entity1>` | CHAR(64) | FK zum ersten Hub |
| `hk_<entity2>` | CHAR(64) | FK zum zweiten Hub |
| `<driving_key>` | varies | Original FK-Wert |
| `dss_load_date` | DATETIME2 | Load-Zeitpunkt |
| `dss_record_source` | VARCHAR | Datenquelle |

### Design-Prinzipien
1. **Insert-Only** - Hubs/Links werden nie updated
2. **Deduplizierung** - `SELECT DISTINCT` auf Hash Key
3. **Ghost Records** - Pflicht für referentielle Integrität
4. **Multi-Source** - Gleicher Hub kann aus mehreren Quellen befüllt werden

## Workflow

```
External Table
       ↓ Rechtsklick → "Design Entity"
┌──────────────────────┐
│   Entity Designer    │  ← Webview öffnet sich
│   (Attribut-Grid)    │
└──────────────────────┘
       ↓ "Generate All"
Hub + Satellite + Links (alle auf einmal)
```

## Trigger
- Rechtsklick auf Staging Model → "Design Entity"
- Rechtsklick auf External Table → "Design Entity"
- Command Palette: "Data Vault: Open Entity Designer"

## Generierte Dateien

Pro Entity werden generiert:

| Objekt | Datei | Bedingung |
|--------|-------|-----------|
| Hub | `models/raw_vault/<concept>/hubs/hub_<entity>.sql` | Immer |
| Ghost Seed | `seeds/ghost_hub_<entity>.csv` | Immer (für ref. Integrität) |
| Satellite | `models/raw_vault/<concept>/satellites/sat_<entity>.sql` | Wenn Attributes vorhanden |
| Link(s) | `models/raw_vault/<concept>/links/link_<entity>_<target>.sql` | Pro FK-Spalte |
| YAML | `models/raw_vault/<concept>/_<concept>__models.yml` | Update |

## Technische Umsetzung

### Neue Dateien

```
vscode-extension/
├── esbuild.webview.mjs              # esbuild Config für Webview
├── tsconfig.webview.json            # TypeScript Config für React
├── src/
│   ├── webviews/
│   │   ├── entityDesigner/
│   │   │   ├── EntityDesignerProvider.ts    # VS Code Webview Provider
│   │   │   ├── getWebviewContent.ts         # HTML Template mit Toolkit
│   │   │   └── app/                         # React App mit VS Code Toolkit
│   │   │       ├── index.tsx                # Entry Point
│   │   │       ├── App.tsx                  # Main Component
│   │   │       ├── components/
│   │   │       │   ├── ColumnGrid.tsx       # VSCodeDataGrid Wrapper
│   │   │       │   ├── ColumnTypeCell.tsx   # Dropdown + Options
│   │   │       │   ├── OptionsCell.tsx      # Checkbox / FK Dropdown
│   │   │       │   └── PreviewPanels.tsx    # VSCodePanels für Preview
│   │   │       ├── hooks/
│   │   │       │   ├── useEntityDesign.ts   # State Management
│   │   │       │   └── useVSCodeApi.ts      # acquireVsCodeApi() Wrapper
│   │   │       └── styles/
│   │   │           └── entityDesigner.css   # Minimales Layout CSS
│   ├── services/
├── out/
│   └── webviews/
│       └── entityDesigner.js            # Bundled Webview (esbuild output)
│   ├── hubGenerator.ts                  # Hub SQL Generation
│   ├── satelliteGenerator.ts            # Satellite SQL Generation
│   ├── linkGenerator.ts                 # Link SQL Generation
│   ├── ghostRecordGenerator.ts          # Ghost Record Seeds
│   └── stagingParser.ts                 # Staging SQL analysieren
├── commands/
│   └── entityDesigner.ts                # Command Handler
└── types.ts                             # EntityDesignConfig, etc.
```

### Types

```typescript
interface EntityDesignConfig {
  concept: string;
  entityName: string;
  sourceTable: string;      // External Table oder Staging
  columns: ColumnDefinition[];
  ghostRecordValue: string; // Default: '-1'
}

interface ColumnDefinition {
  name: string;
  dataType: string;
  columnType: ColumnType;
  includeInHashDiff: boolean;
  foreignKeyTarget?: string;  // z.B. 'hub_company'
}

type ColumnType = 
  | 'business_key' 
  | 'attribute' 
  | 'foreign_key' 
  | 'metadata' 
  | 'ignore';

interface GenerationResult {
  hub?: GeneratedFile;
  satellite?: GeneratedFile;
  links: GeneratedFile[];
  ghostSeed: GeneratedFile;
  yamlUpdates: GeneratedFile[];
}
```

### Webview Communication

```typescript
// Extension → Webview
interface InitMessage {
  type: 'init';
  data: {
    columns: ColumnInfo[];
    existingHubs: string[];  // Für FK-Dropdown
    concept: string;
    entityName: string;
  };
}

// Webview → Extension
interface GenerateMessage {
  type: 'generate';
  target: 'all' | 'hub' | 'satellite' | 'links';
  config: EntityDesignConfig;
}
```

## Ghost Records (PFLICHT)

Jeder Hub bekommt automatisch einen Ghost Record:

**Seed-Datei:** `seeds/ghost_hub_<entity>.csv`
```csv
hk_<entity>,<bk_columns>,dss_record_source,dss_load_date
0000000000000000000000000000000000000000000000000000000000000000,-1,SYSTEM,1900-01-01
```

**Hub SQL mit Ghost Record:**
```sql
WITH source AS (
    SELECT DISTINCT hk_<entity>, <bk>, dss_record_source, dss_load_date
    FROM {{ ref('<concept>_<entity>') }}
    WHERE hk_<entity> IS NOT NULL
),
ghost AS (
    SELECT * FROM {{ ref('ghost_hub_<entity>') }}
)
SELECT * FROM source
UNION ALL
SELECT * FROM ghost
WHERE NOT EXISTS (SELECT 1 FROM {{ this }} WHERE hk_<entity> = ghost.hk_<entity>)
```

## Link Generation

Für jede FK-Spalte wird ein Link generiert:

```sql
/*
 * Link: link_contacts_company
 * Source: werkportal_contacts (Staging)
 * Hubs: hub_contacts, hub_company
 */

{{
    config(
        materialized='incremental',
        incremental_strategy='append',
        as_columnstore=false
    )
}}

WITH source AS (
    SELECT DISTINCT
        -- Link Hash Key (kombiniert beide Hub-Keys)
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(hk_contacts, '^^', 
                   CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
                       ISNULL(CAST(company_supplier AS NVARCHAR(MAX)), '')), 2))
        ), 2) AS hk_link_contacts_company,
        hk_contacts,
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(company_supplier AS NVARCHAR(MAX)), '')), 2) AS hk_company,
        company_supplier,  -- Driving Key
        dss_record_source,
        dss_load_date
    FROM {{ ref('werkportal_contacts') }}
    WHERE company_supplier IS NOT NULL
)

SELECT * FROM source
{% if is_incremental() %}
WHERE hk_link_contacts_company NOT IN (SELECT hk_link_contacts_company FROM {{ this }})
{% endif %}
```

## Implementierungs-Reihenfolge

| Step | Task | Aufwand | Status |
|------|------|---------|--------|
| 1 | esbuild Setup (`esbuild.webview.mjs`, `tsconfig.webview.json`) | 1h | ✅ Fertig |
| 2 | Types erweitern (`EntityDesignConfig`, etc.) | 1h | ✅ Fertig |
| 3 | Webview Provider Grundgerüst | 2h | ✅ Fertig |
| 4 | React App mit Column Grid (vscrui) | 4h | ✅ Fertig |
| 5 | Hub Scanner Service (existierende Hubs finden) | 1h | ✅ Fertig |
| 6 | Entity Generator Service (Hub/Sat/Link) | 4h | ✅ Fertig |
| 7 | Command Registration & Integration | 1h | ✅ Fertig |
| 8 | Ghost Record Generator | 1h | ⏳ Phase 2 |
| 9 | YAML Schema Updates | 2h | ✅ Teilweise (Basic) |
| 10 | Integration & Testing | 3h | ⏳ Offen |
| **Total Phase 1** | | **~16h** | **80% Fertig** |

### Implementierte Dateien

```
vscode-extension/
├── esbuild.webview.mjs              # ✅ esbuild Config für Webview
├── tsconfig.webview.json            # ✅ TypeScript Config für React
├── src/
│   ├── webviews/
│   │   ├── entityDesigner/
│   │   │   ├── EntityDesignerProvider.ts    # ✅ VS Code Webview Provider
│   │   │   ├── getWebviewContent.ts         # ✅ HTML Template
│   │   │   └── app/                         # ✅ React App mit vscrui
│   │   │       ├── index.tsx                # ✅ Entry Point
│   │   │       ├── App.tsx                  # ✅ Main Component
│   │   │       ├── components/
│   │   │       │   ├── ColumnGrid.tsx       # ✅ Spalten-Tabelle
│   │   │       │   └── PreviewPanels.tsx    # ✅ Hub/Sat/Link Preview
│   │   │       └── hooks/
│   │   │           ├── useEntityDesign.ts   # ✅ State Management
│   │   │           └── useVSCodeApi.ts      # ✅ VS Code API Wrapper
│   ├── services/
│   │   ├── hubScanner.ts            # ✅ Findet existierende Hubs
│   │   └── entityGenerator.ts       # ✅ Generiert Hub/Sat/Link SQL + YAML
│   ├── commands/
│   │   └── entityDesigner.ts        # ✅ Command Handler
│   └── types.ts                     # ✅ EntityDesignConfig, etc.
├── out/
│   └── webviews/
│       └── entityDesigner.js        # ✅ Bundled Webview
```

### Nächste Schritte (Phase 1 Abschluss)

1. **Testen im Extension Development Host** - F5 drücken, Extension testen
2. **Ghost Records** - Seed-Dateien für Ghost Records generieren
3. **Link Hash Key** - Im Staging berechnen lassen (aktuell nur im Link SQL)
4. **Error Handling** - Robustere Fehlermeldungen

## Schema-Ordner Struktur

```
models/raw_vault/
├── werkportal/
│   ├── _werkportal__models.yml
│   ├── hubs/
│   │   └── hub_contacts.sql
│   ├── satellites/
│   │   └── sat_contacts.sql
│   └── links/
│       ├── link_contacts_company_supplier.sql   # FK: company_supplier → hub_company
│       ├── link_contacts_company_client.sql     # FK: company_client → hub_company
│       └── link_contacts_function.sql           # FK: contact_function_id → hub_function
seeds/
├── ghost_hub_contacts.csv
├── ghost_hub_company.csv
└── ghost_hub_function.csv
```

**Hinweis:** Jede FK-Spalte erzeugt einen separaten Link, auch wenn mehrere FKs auf denselben Hub zeigen.

## Entscheidungen (abgeschlossen)

### Grundlegende Architektur
1. ~~**Separate Wizards vs Webview?**~~ → **Webview** (alles auf einen Blick)
2. ~~**Schema-Ordner:**~~ → `raw_vault/<concept>/hubs|satellites|links/`
3. ~~**Ghost Records:**~~ → **PFLICHT**, automatisch als Seed generiert
4. ~~**Satellite automatisch?**~~ → **NEIN**, User wählt Attributes im Designer
5. ~~**UI Framework:**~~ → **React + vscrui** (aktiv gepflegte Alternative zum deprecated @vscode/webview-ui-toolkit)

### Link-Handling
6. ~~**Link-Naming bei mehreren FKs zum gleichen Hub?**~~ → **Separate Links pro FK-Spalte**
   - `company_supplier` → `link_contacts_company_supplier`
   - `company_client` → `link_contacts_company_client`
   - Klarer, keine Verwechslungsgefahr

7. ~~**Same-As-Link / Hierarchie-Link?**~~ → **Phase 2** (später)
   - Self-Referencing Links (z.B. `hub_company` → `hub_company`) nicht in Phase 1

### Technische Umsetzung
8. ~~**Webview Build-Prozess?**~~ → **esbuild**
   - Separates `tsconfig.webview.json` für React-App
   - npm script: `npm run build:webview`
   - Output: `out/webviews/entityDesigner.js`

9. ~~**FK Target Hub - Woher kommen die Optionen?**~~ → **File-Scan + Inline-Erstellung**
   - Primär: Scan von `models/raw_vault/**/hubs/hub_*.sql`
   - Option "Neuen Hub erstellen..." im Dropdown
   - Inline-Dialog für neuen Hub-Namen

### Scope Phase 1 vs Phase 2
10. ~~**Multi-Active Satellite?**~~ → **Phase 2** (später)
    - Phase 1: Ein Satellite pro Entity
    - Phase 2: Multi-Active für Historisierung

11. ~~**Effectivity Satellite (Eff-Sat)?**~~ → **Phase 2** (später)
    - Phase 1: Links ohne Eff-Sat
    - Phase 2: Optional Start/End-Dating für Beziehungen

## vscrui Ressourcen

- **npm:** `vscrui`
- **GitHub:** https://github.com/estruyf/vscrui
- **Storybook:** Run `npm run storybook` in vscrui repo
- **Komponenten:** Badge, Button, Checkbox, Divider, Dropdown, Icon, Label, Loader, Pane, Panels, Table, Tag, TextArea, TextField
