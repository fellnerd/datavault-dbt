## Plan: Data Mart Layer in VS Code Extension

Implementierung eines vollständigen Mart-Layers nach Data Vault 2.1 Best Practices mit einem **visuellen Star Schema Designer** basierend auf React Flow für intuitive Dimension- und Fact-Modellierung.

### TL;DR
Der Mart Layer transformiert Raw/Business Vault Daten in konsumentenfreundliche Star-Schema Strukturen. Statt Command-Palette-Wizards wird ein **interaktiver visueller Designer** (React Flow) verwendet, in dem Benutzer Dimensionen und Facts als Nodes erstellen und per Drag & Drop mit Vault-Objekten verbinden können. Attribute werden aus Hubs/Satellites in die Nodes gezogen.

---

## TODO: Implementation Checklist

### Phase 1: Foundation
- [ ] **Types definieren** (`types.ts`)
  - [ ] `MartModelType`, `SCDType`, `MartMaterialization`, `SurrogateKeyStrategy`
  - [ ] `DimensionConfig`, `DimensionAttribute`
  - [ ] `FactConfig`, `FactDimensionRef`, `FactMeasure`, `DegenerateDimension`
  - [ ] `MartDesignerNode`, `MartDesignerEdge`
  - [ ] `CustomColumn` Interface

### Phase 2: State Management
- [ ] **MartDesignerState Service** (`services/martDesignerState.ts`)
  - [ ] Singleton Pattern implementieren
  - [ ] Webview-Registration
  - [ ] `postMessage()` für Webview-Kommunikation
  - [ ] `addDimension()`, `addFact()`, `addAttributes()`, `addColumn()`
  - [ ] `addSeedAsDimension()` für Reference Dimensions
  - [ ] Message Types definieren (`MartDesignerMessage`)

### Phase 3: Webview Setup
- [ ] **React Flow installieren** (`npm install @xyflow/react`)
- [ ] **Ordnerstruktur anlegen** (`vscode-extension/src/webviews/martDesigner/`)
  - [ ] `MartDesignerProvider.ts`
  - [ ] `getWebviewContent.ts`
  - [ ] `app/` Unterordner

### Phase 4: React Components
- [ ] **Custom Nodes erstellen**
  - [ ] `DimensionNode.tsx` (SK, BK, Attributes, Custom Badge)
  - [ ] `FactNode.tsx` (FKs, Measures, Degenerate Dims)
- [ ] **Panels erstellen**
  - [ ] `PropertiesPanel.tsx` (SCD Type, Materialization, Surrogate Key Strategy)
  - [ ] `Toolbar.tsx` (Save, Add Dimension, Add Fact Buttons)
- [ ] **Hooks erstellen**
  - [ ] `useMessageHandler.ts` (postMessage Handling)

### Phase 5: Context Menu Commands
- [ ] **package.json erweitern**
  - [ ] `datavault.addAsDimension` Command
  - [ ] `datavault.addAsFact` Command
  - [ ] `datavault.addAttributesToNode` Command
  - [ ] `datavault.addColumnToNode` Command
  - [ ] `datavault.useAsSource` Command (PIT/Bridge)
  - [ ] `datavault.addAsSeedDimension` Command
- [ ] **Menu Contributions**
  - [ ] `view/item/context` für Raw Vault Tree
  - [ ] `view/item/context` für Business Vault Tree
  - [ ] `when`-Clauses für Context (`datavault.martDesignerOpen`, `datavault.nodeSelected`)

### Phase 6: State Persistence
- [ ] **Designer State speichern** (`.designer-state.json`)
  - [ ] Auto-Load beim Öffnen
  - [ ] Dirty-State Tracking (●-Indicator im Titel)
  - [ ] Save-Dialog bei ungespeicherten Änderungen
- [ ] **State Schema definieren** (`DesignerState` Interface)

### Phase 7: Code Generation (Two-Layer Pattern)
- [ ] **MartGeneratorService** (`services/martGenerator.ts`)
  - [ ] Base Model Template (`_base/_base_dim_<entity>.sql`)
  - [ ] Final Model Template (`dim_<entity>.sql`)
  - [ ] Fact Model Templates
  - [ ] YAML Generation (`_<concept>__models.yml`)
- [ ] **dbt_project.yml** Konfiguration für `_base/` (ephemeral)
- [ ] **Custom Column Detection** (Regex-Parser für Final Models)

### Phase 8: Validation
- [ ] **Validation Rules implementieren**
  - [ ] Dimension ohne Source → Error
  - [ ] Fact ohne Dimension-Referenz → Error
  - [ ] Doppelte FK-Namen → Error
  - [ ] Incremental ohne Unique Key → Error
  - [ ] Dimension ohne Attribute → Warning
  - [ ] Fact ohne Measures → Warning
  - [ ] Role-Playing ohne Alias → Warning

### Phase 9: Advanced Features (Optional)
- [ ] Undo/Redo Support
- [ ] Autolayout (Dagre)
- [ ] Export (PNG, SVG)
- [ ] Inline Calculated Fields Dialog
- [ ] SQL Preview Panel

### Phase 10: Testing & Documentation
- [ ] Unit Tests für Generator
- [ ] Integration Tests für Webview-Communication
- [ ] User Documentation (README)
- [ ] Developer Documentation (DEVELOPMENT.md)

---

## Architektur: Star Schema Designer

### UI Konzept (Tree → Webview Integration)

Die Extension nutzt die **bestehenden Tree Views** (Raw Vault, Business Vault, Mart) als Datenquelle. 
Kein redundantes Source Panel im Webview – stattdessen **Context Menu Commands** in den Trees.

```
┌── VS Code Sidebar ──────────┐  ┌── Webview Panel (Mart Designer) ──────────────────────┐
│                             │  │                                                        │
│  ▼ Raw Vault                │  │  Star Schema Designer - mart_werkportal    [Save] [×]  │
│    ▼ Werkportal             │  │  ─────────────────────────────────────────────────────  │
│      ▼ Hubs                 │  │                                                        │
│        ▼ hub_company ───────┼──┼─► [Add as Dimension]                                   │
│          📋 object_id ──────┼──┼─► [Add to Selected Node]     ┌─────────────────┐       │
│          📋 dss_load_date   │  │                              │   dim_company   │       │
│        ▼ hub_country        │  │                              │ ─────────────── │       │
│      ▼ Satellites           │  │                              │ 🔑 company_key  │       │
│        ▼ sat_company ───────┼──┼─► [Add Attributes to Dim]    │ 📋 object_id    │       │
│          📋 name            │  │                              │ 📋 name ◄───────┼───────┤
│          📋 city            │  │                              │ 📋 city         │       │
│          📋 email           │  │                              └────────┬────────┘       │
│      ▼ Links                │  │                                       │                │
│        ▼ link_order ────────┼──┼─► [Add as Fact]              ┌────────▼────────┐       │
│                             │  │                              │  fact_orders    │       │
│  ▼ Business Vault           │  │                              │ ─────────────── │       │
│    ▼ Werkportal             │  │                              │ 🔗 company_key  │       │
│      ▼ PITs                 │  │                              │ 🔗 date_key     │       │
│        pit_company ─────────┼──┼─► [Use as Dimension Source]  │ 📊 amount       │       │
│      ▼ Bridges              │  │                              └─────────────────┘       │
│        bridge_order         │  │                                                        │
│                             │  ├────────────────────────────────────────────────────────┤
│  ▼ Mart                     │  │ Properties: dim_company | SCD: Type 1 | Hub + 1 Sat    │
│    ▼ Werkportal             │  └────────────────────────────────────────────────────────┘
│      dim_company (editing)  │
│      dim_date               │
│                             │
└─────────────────────────────┘
```

### Vorteile dieses Ansatzes

| Aspekt | Vorteil |
|--------|---------|
| **Keine Redundanz** | Tree Views existieren bereits mit vollständiger Hierarchie |
| **Konsistente UX** | Gleiche Navigation wie in anderen VS Code Extensions |
| **Weniger Code** | Kein Source Panel im Webview nötig |
| **Bidirektional** | Selection Sync zwischen Tree und Canvas |

### Interaktionsmuster (Message-basiert)

| Tree-Aktion | Context Menu | Webview-Reaktion |
|-------------|--------------|------------------|
| Rechtsklick auf Hub | "Add as Dimension" | Erstellt `dim_<entity>` Node mit BK |
| Rechtsklick auf Hub | "Add to Selected Fact" | Fügt FK-Referenz zur ausgewählten Fact hinzu |
| Rechtsklick auf Satellite | "Add Attributes to Dimension" | Öffnet Attribut-Picker, fügt zu ausgewählter Dim hinzu |
| Rechtsklick auf Column | "Add to Selected Node" | Fügt einzelnes Attribut zur Selektion hinzu |
| Rechtsklick auf Link | "Add as Fact" | Erstellt `fact_<link>` Node mit FKs |
| Rechtsklick auf PIT | "Use as Dimension Source" | Setzt PIT als Quelle für SCD Type 2 Dimension |
| Rechtsklick auf Bridge | "Use as Fact Source" | Setzt Bridge als optimierte Fact-Quelle |
| Rechtsklick auf Seed | "Add as Reference Dimension" | Erstellt Reference Dimension (z.B. `dim_date`) |

| Canvas-Aktion | Beschreibung |
|---------------|--------------|
| **Edge ziehen: Fact → Dim** | Erstellt FK-Referenz (`company_key`) |
| **Klick auf Node** | Zeigt Properties Panel (SCD Type, Materialization) |
| **Doppelklick auf Node** | Öffnet Inline-Edit für Namen |
| **Delete-Taste** | Entfernt ausgewählten Node/Edge |
| **+ Dimension Button** | Erstellt leere Dimension Node |
| **+ Fact Button** | Erstellt leere Fact Node |
| **Save Button** | Generiert dbt Models und YAML |

---

## Steps

### 1. **Mart Type Definitionen hinzufügen** in types.ts
```typescript
// Mart Model Types
export type MartModelType = 'dimension' | 'fact' | 'aggregate' | 'view';
export type SCDType = 'type1' | 'type2';
export type MartMaterialization = 'view' | 'table' | 'incremental';
export type SurrogateKeyStrategy = 'row_number' | 'identity' | 'hash';
export type DimensionSourceType = 'hub' | 'seed' | 'static' | 'reference';  // NEU

export interface DimensionConfig {
  name: string;                    // dim_company
  concept: string;                 // werkportal
  
  // Source Type - unterscheidet Hub-basierte von statischen Dimensionen
  sourceType: DimensionSourceType; // 'hub' | 'seed' | 'static' | 'reference'
  sourceHub?: string;              // hub_company (nur bei sourceType='hub')
  sourceSeed?: string;             // ref_status (nur bei sourceType='seed')
  sourceRef?: string;              // dim_date aus anderem Concept (sourceType='reference')
  
  sourceSatellites: string[];      // [sat_company, sat_company_ext]
  sourcePIT?: string;              // pit_company (optional für SCD Type 2)
  scdType: SCDType;
  attributes: DimensionAttribute[];
  surrogateKey: string;            // dim_company_key (Integer)
  businessKey: string;             // object_id
  hashKey?: string;                // hk_company (Vault Hash Key für Traceability)
  includeHashKey: boolean;         // hk_company als Attribut einschließen?
  materialization: MartMaterialization;
  surrogateKeyStrategy: SurrogateKeyStrategy;
}

export interface DimensionAttribute {
  name: string;                    // Zielname im Mart
  sourceModel: string;             // Quell-Model (Satellite, Seed, etc.)
  sourceColumn: string;            // Quell-Spalte
  dataType: string;
  description?: string;            // Für YAML-Dokumentation
}

export interface FactConfig {
  name: string;                    // fact_orders
  concept: string;                 // werkportal
  sourceLink?: string;             // link_order (optional)
  sourceBridge?: string;           // bridge_order (optional)
  sourceSatellites?: string[];     // [sat_order] für Measures
  
  // Grain = Kombination aller Dimension-FKs
  grain: string[];                 // ['dim_company_key', 'dim_date_key']
  
  // Dimension References (inkl. Role-Playing)
  dimensionRefs: FactDimensionRef[];
  
  // Degenerate Dimensions (Transaktions-Attribute ohne eigene Dim)
  degenerateDimensions: DegenerateDimension[];
  
  // Measures
  measures: FactMeasure[];
  
  // Materialization
  materialization: MartMaterialization;
  
  // Für Incremental: Unique Key
  incrementalUniqueKey?: string[]; // ['dim_company_key', 'dim_date_key', 'transaction_id']
  incrementalStrategy?: 'append' | 'merge'; // append = nur neue, merge = upsert
}

export interface FactDimensionRef {
  dimensionName: string;           // dim_date
  foreignKey: string;              // order_date_key (Name im Fact)
  sourceColumn: string;            // order_date (aus Link/Satellite)
  sourceModel?: string;            // sat_order (Quelle der sourceColumn, für Non-Hub Joins)
  joinColumn: string;              // hk_company ODER date_key (Join-Spalte zur Dimension)
  scdType?: SCDType;               // SCD Type der referenzierten Dimension (für Join-Logik)
  roleAlias?: string;              // "Order Date" (für Role-Playing Dimensions)
  isRolePlaying: boolean;          // true wenn gleiche Dim mehrfach referenziert
}

/**
 * Degenerate Dimension - Transaktionsattribute die direkt im Fact bleiben
 * Beispiel: order_number, invoice_id, transaction_reference
 */
export interface DegenerateDimension {
  name: string;                    // order_number
  sourceColumn: string;            // order_number (aus Link oder Satellite)
  sourceModel: string;             // link_order oder sat_order
  dataType: string;
  isPartOfGrain: boolean;          // true wenn Teil des unique key
}

export interface FactMeasure {
  name: string;                    // total_amount
  sourceColumn: string;            // amount
  sourceModel: string;             // sat_order (Quelle des Measures)
  dataType: string;                // DECIMAL(18,2)
  aggregation?: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' | 'NONE';
  description?: string;
}

// React Flow Node/Edge Types
export interface MartDesignerNode {
  id: string;
  type: 'dimension' | 'fact' | 'source';
  position: { x: number; y: number };
  data: DimensionConfig | FactConfig | VaultSourceData;
}

export interface MartDesignerEdge {
  id: string;
  source: string;          // fact node id
  target: string;          // dimension node id
  sourceHandle: string;    // FK column
  targetHandle: string;    // PK column
}
```

### 2. **Star Schema Designer Webview erstellen**
Neue Ordnerstruktur (vereinfacht - kein Source Panel):
```
vscode-extension/src/webviews/
├── entityDesigner/          # Bestehend
└── martDesigner/            # NEU
    ├── MartDesignerProvider.ts
    ├── getWebviewContent.ts
    └── app/
        ├── index.tsx
        ├── App.tsx
        ├── components/
        │   ├── Canvas.tsx           # React Flow Canvas
        │   ├── DimensionNode.tsx    # Custom Node für Dimensionen
        │   ├── FactNode.tsx         # Custom Node für Facts
        │   ├── PropertiesPanel.tsx  # Untere/Rechte Panel für Node-Properties
        │   └── Toolbar.tsx          # + Dimension, + Fact, Save Buttons
        ├── hooks/
        │   ├── useVSCodeApi.ts
        │   ├── useMartState.ts      # State Management für Designer
        │   └── useMessageHandler.ts # Empfängt Daten von Extension
        └── utils/
            ├── nodeFactory.ts       # Erstellt Nodes aus empfangenen Vault-Daten
            └── sqlGenerator.ts      # Generiert dbt SQL (Preview)
```

### 3. **Context Menu Commands für Tree Views**

**package.json erweitern:**
```json
{
  "commands": [
    {
      "command": "datavault.openMartDesigner",
      "title": "Open Mart Designer",
      "icon": "$(pie-chart)"
    },
    {
      "command": "datavault.addAsDimension",
      "title": "Add as Dimension",
      "icon": "$(add)"
    },
    {
      "command": "datavault.addAsFact",
      "title": "Add as Fact",
      "icon": "$(add)"
    },
    {
      "command": "datavault.addAttributesToNode",
      "title": "Add Attributes to Selected Node",
      "icon": "$(add)"
    },
    {
      "command": "datavault.addColumnToNode",
      "title": "Add to Selected Node",
      "icon": "$(add)"
    },
    {
      "command": "datavault.useAsSource",
      "title": "Use as Source (PIT/Bridge)",
      "icon": "$(references)"
    }
  ],
  "menus": {
    "view/title": [
      {
        "command": "datavault.openMartDesigner",
        "when": "view == datavault-mart",
        "group": "navigation"
      }
    ],
    "view/item/context": [
      {
        "command": "datavault.addAsDimension",
        "when": "view == datavault-raw-vault && viewItem =~ /^model/ && datavault.martDesignerOpen",
        "group": "mart@1"
      },
      {
        "command": "datavault.addAsFact",
        "when": "view == datavault-raw-vault && viewItem =~ /^model/ && datavault.martDesignerOpen",
        "group": "mart@2"
      },
      {
        "command": "datavault.addAttributesToNode",
        "when": "view == datavault-raw-vault && viewItem =~ /^model/ && datavault.martDesignerOpen && datavault.nodeSelected",
        "group": "mart@3"
      },
      {
        "command": "datavault.addColumnToNode",
        "when": "viewItem == column && datavault.martDesignerOpen && datavault.nodeSelected",
        "group": "mart@1"
      },
      {
        "command": "datavault.useAsSource",
        "when": "view == datavault-business-vault && viewItem =~ /^model/ && datavault.martDesignerOpen && datavault.nodeSelected",
        "group": "mart@1"
      },
      {
        "command": "datavault.addAsSeedDimension",
        "when": "view == datavault-sources && viewItem == seed && datavault.martDesignerOpen",
        "group": "mart@1"
      }
    ]
  }
}
```

**Neuer Command für Seed-Tabellen:**
```json
{
  "command": "datavault.addAsSeedDimension",
  "title": "Add as Reference Dimension",
  "icon": "$(calendar)"
}
```

> **Hinweis:** Seed-Tabellen werden im "Sources" Tree View angezeigt (neuer View oder Unterknoten in Raw Vault). 
> Context Menu "Add as Reference Dimension" erstellt eine Reference Dimension wie `dim_date`.

### 4. **Designer State Service** (Neu)

```typescript
// services/martDesignerState.ts
import * as vscode from 'vscode';
import { DimensionConfig, FactConfig, MartDesignerNode } from '../types';

/**
 * Singleton service to manage Mart Designer state
 * Handles communication between Tree Views and Webview
 */
export class MartDesignerState {
  private static instance: MartDesignerState;
  private webview: vscode.Webview | null = null;
  private selectedNodeId: string | null = null;
  private nodes: Map<string, MartDesignerNode> = new Map();

  private constructor() {}

  static getInstance(): MartDesignerState {
    if (!MartDesignerState.instance) {
      MartDesignerState.instance = new MartDesignerState();
    }
    return MartDesignerState.instance;
  }

  /** Register webview for message passing */
  setWebview(webview: vscode.Webview | null): void {
    this.webview = webview;
    // Update context for menu visibility
    vscode.commands.executeCommand('setContext', 'datavault.martDesignerOpen', webview !== null);
  }

  /** Set currently selected node (from webview) */
  setSelectedNode(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    vscode.commands.executeCommand('setContext', 'datavault.nodeSelected', nodeId !== null);
  }

  /** Send data to webview */
  postMessage(message: MartDesignerMessage): void {
    if (this.webview) {
      this.webview.postMessage(message);
    }
  }

  /** Add Hub as new Dimension */
  addDimension(hub: DbtModel): void {
    const entityName = hub.name.replace('hub_', '');
    this.postMessage({
      type: 'addDimension',
      payload: {
        name: `dim_${entityName}`,
        sourceType: 'hub',
        sourceHub: hub.name,
        businessKey: this.extractBusinessKey(hub),
        hashKey: `hk_${entityName}`,
        columns: hub.columns,
        concept: hub.concept,
        // Defaults für nodeFactory
        surrogateKey: `dim_${entityName}_key`,
        scdType: 'type1',
        materialization: 'table',
        surrogateKeyStrategy: 'row_number',
        includeHashKey: true,
        sourceSatellites: [],
        attributes: []
      }
    });
  }

  /** Add Link as new Fact */
  addFact(link: DbtModel): void {
    this.postMessage({
      type: 'addFact',
      payload: {
        sourceLink: link.name,
        foreignKeys: this.extractForeignKeys(link),
        columns: link.columns,
        concept: link.concept
      }
    });
  }

  /** Add attributes from Satellite to selected node */
  addAttributes(satellite: DbtModel): void {
    if (!this.selectedNodeId) return;
    this.postMessage({
      type: 'addAttributes',
      payload: {
        targetNodeId: this.selectedNodeId,
        sourceSatellite: satellite.name,
        columns: satellite.columns.filter(c => !c.name.startsWith('hk_') && !c.name.startsWith('dss_'))
      }
    });
  }

  /** Add single column to selected node */
  addColumn(column: ColumnInfo, sourceName: string): void {
    if (!this.selectedNodeId) return;
    this.postMessage({
      type: 'addColumn',
      payload: {
        targetNodeId: this.selectedNodeId,
        sourceModel: sourceName,
        column
      }
    });
  }

  /** Set PIT/Bridge as optimized source */
  useAsSource(model: DbtModel): void {
    if (!this.selectedNodeId) return;
    this.postMessage({
      type: 'setSource',
      payload: {
        targetNodeId: this.selectedNodeId,
        sourceType: model.type, // 'pit' or 'bridge'
        sourceName: model.name
      }
    });
  }

  /** Add Seed/Reference table as Reference Dimension */
  addSeedAsDimension(seed: DbtModel): void {
    const entityName = seed.name.replace('seed_', '').replace('ref_', '');
    this.postMessage({
      type: 'addDimension',
      payload: {
        name: `dim_${entityName}`,
        sourceType: 'seed',
        sourceSeed: seed.name,
        businessKey: this.extractBusinessKey(seed),
        columns: seed.columns,
        concept: '_common', // Reference Dimensions sind concept-übergreifend
        // Defaults für Reference Dimension
        surrogateKey: `dim_${entityName}_key`,
        scdType: 'type1', // Reference Dims sind meist Type 1
        materialization: 'table',
        surrogateKeyStrategy: 'row_number',
        includeHashKey: false, // Seeds haben keine Hash Keys
        sourceSatellites: [],
        attributes: []
      }
    });
  }

  private extractBusinessKey(hub: DbtModel): string {
    // Find non-hash, non-metadata column
    const bk = hub.columns.find(c => 
      !c.name.startsWith('hk_') && 
      !c.name.startsWith('dss_') &&
      !c.name.includes('load_date')
    );
    return bk?.name || 'object_id';
  }

  private extractForeignKeys(link: DbtModel): string[] {
    return link.columns
      .filter(c => c.name.startsWith('hk_') && c.name !== `hk_link_${link.name.replace('link_', '')}`)
      .map(c => c.name);
  }
}

// Message types for Webview communication
export type MartDesignerMessage = 
  | { type: 'addDimension'; payload: AddDimensionPayload }
  | { type: 'addFact'; payload: AddFactPayload }
  | { type: 'addAttributes'; payload: AddAttributesPayload }
  | { type: 'addColumn'; payload: AddColumnPayload }
  | { type: 'setSource'; payload: SetSourcePayload }
  | { type: 'nodeSelected'; payload: { nodeId: string | null } }
  | { type: 'loadState'; payload: DesignerState }
  | { type: 'stateChanged'; payload: null };

// Payload Types
export interface AddDimensionPayload {
  name: string;
  sourceType: DimensionSourceType;
  sourceHub?: string;
  sourceSeed?: string;
  businessKey: string;
  hashKey?: string;
  columns: ColumnInfo[];
  concept: string;
  surrogateKey: string;
  scdType: SCDType;
  materialization: MartMaterialization;
  surrogateKeyStrategy: SurrogateKeyStrategy;
  includeHashKey: boolean;
  sourceSatellites: string[];
  attributes: DimensionAttribute[];
}

export interface DesignerState {
  version: string;
  concept: string;
  lastModified: string;
  nodes: MartDesignerNode[];
  edges: MartDesignerEdge[];
}
```

### 5. **React Flow Integration**
```bash
# Im vscode-extension Verzeichnis
npm install @xyflow/react
```

**DimensionNode.tsx (Custom Node):**
```tsx
import { Handle, Position } from '@xyflow/react';
import { DimensionConfig } from '../../types';

export function DimensionNode({ data, selected }: { data: DimensionConfig; selected: boolean }) {
  return (
    <div className={`dimension-node ${selected ? 'selected' : ''}`}>
      <div className="node-header dimension">
        <span className="icon">📊</span>
        <span className="title">{data.name}</span>
        <span className="badge">{data.scdType}</span>
      </div>
      <div className="node-body">
        {/* Surrogate Key - Connection Target for Facts */}
        <div className="column primary-key">
          <Handle type="target" position={Position.Left} id={data.surrogateKey} />
          🔑 {data.surrogateKey}
        </div>
        {/* Business Key */}
        <div className="column business-key">
          📋 {data.businessKey}
        </div>
        {/* Attributes - dynamically added via Tree Context Menu */}
        {data.attributes.map(attr => (
          <div key={attr.name} className="column attribute">
            📋 {attr.name}
            <span className="source-hint">{attr.sourceModel}</span>
          </div>
        ))}
      </div>
      <div className="node-footer">
        <span className="source-info">
          {data.sourcePIT || `${data.sourceHub} + ${data.sourceSatellites.length} Sat(s)`}
        </span>
      </div>
    </div>
  );
}
```

**FactNode.tsx:**
```tsx
import { Handle, Position } from '@xyflow/react';
import { FactConfig } from '../../types';

export function FactNode({ data, selected }: { data: FactConfig; selected: boolean }) {
  return (
    <div className={`fact-node ${selected ? 'selected' : ''}`}>
      <div className="node-header fact">
        <span className="icon">📈</span>
        <span className="title">{data.name}</span>
      </div>
      <div className="node-body">
        {/* Foreign Keys - Connection Sources to Dimensions */}
        {data.dimensionRefs.map(ref => (
          <div key={ref.foreignKey} className="column foreign-key">
            <Handle type="source" position={Position.Right} id={ref.foreignKey} />
            🔗 {ref.foreignKey} → {ref.dimensionName}
          </div>
        ))}
        {/* Measures */}
        {data.measures.map(measure => (
          <div key={measure.name} className="column measure">
            📊 {measure.name}
            {measure.aggregation && <span className="agg-hint">{measure.aggregation}</span>}
          </div>
        ))}
      </div>
      <div className="node-footer">
        <span className="grain-info">Grain: {data.grain.join(', ')}</span>
      </div>
    </div>
  );
}
```

### 6. **Message Handler im Webview**

```tsx
// hooks/useMessageHandler.ts
import { useEffect, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { MartDesignerMessage } from '../types';
import { createDimensionNode, createFactNode } from '../utils/nodeFactory';

export function useMessageHandler() {
  const { addNodes, setNodes, getNode } = useReactFlow();
  const vscode = acquireVsCodeApi();

  useEffect(() => {
    const handler = (event: MessageEvent<MartDesignerMessage>) => {
      const message = event.data;
      
      switch (message.type) {
        case 'addDimension': {
          const node = createDimensionNode(message.payload);
          addNodes(node);
          break;
        }
        case 'addFact': {
          const node = createFactNode(message.payload);
          addNodes(node);
          break;
        }
        case 'addAttributes': {
          const { targetNodeId, sourceSatellite, columns } = message.payload;
          setNodes(nodes => nodes.map(n => {
            if (n.id === targetNodeId && n.type === 'dimension') {
              return {
                ...n,
                data: {
                  ...n.data,
                  sourceSatellites: [...n.data.sourceSatellites, sourceSatellite],
                  attributes: [
                    ...n.data.attributes,
                    ...columns.map(col => ({
                      name: col.name,
                      sourceSatellite,
                      sourceColumn: col.name,
                      dataType: col.dataType || 'NVARCHAR(MAX)'
                    }))
                  ]
                }
              };
            }
            return n;
          }));
          break;
        }
        case 'addColumn': {
          const { targetNodeId, sourceModel, column } = message.payload;
          setNodes(nodes => nodes.map(n => {
            if (n.id === targetNodeId) {
              if (n.type === 'dimension') {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    attributes: [...n.data.attributes, {
                      name: column.name,
                      sourceModel: sourceModel,
                      sourceColumn: column.name,
                      dataType: column.dataType || 'NVARCHAR(MAX)'
                    }]
                  }
                };
              } else if (n.type === 'fact') {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    measures: [...n.data.measures, {
                      name: column.name,
                      sourceColumn: column.name
                    }]
                  }
                };
              }
            }
            return n;
          }));
          break;
        }
        case 'setSource': {
          const { targetNodeId, sourceType, sourceName } = message.payload;
          setNodes(nodes => nodes.map(n => {
            if (n.id === targetNodeId) {
              if (n.type === 'dimension' && sourceType === 'pit') {
                return { ...n, data: { ...n.data, sourcePIT: sourceName, scdType: 'type2' } };
              } else if (n.type === 'fact' && sourceType === 'bridge') {
                return { ...n, data: { ...n.data, sourceBridge: sourceName } };
              }
            }
            return n;
          }));
          break;
        }
        case 'loadState': {
          // Auto-Load beim Öffnen: Bestehenden State aus JSON laden
          const { nodes: loadedNodes, edges: loadedEdges } = message.payload;
          setNodes(loadedNodes);
          setEdges(loadedEdges);
          break;
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [addNodes, setNodes, setEdges]);

  // Notify extension when selection changes
  const onSelectionChange = useCallback((nodeId: string | null) => {
    vscode.postMessage({ type: 'nodeSelected', payload: { nodeId } });
  }, [vscode]);

  // Notify extension when state changes (for dirty tracking)
  const notifyStateChanged = useCallback(() => {
    vscode.postMessage({ type: 'stateChanged', payload: null });
  }, [vscode]);

  return { onSelectionChange, notifyStateChanged };
}
```

### 7. **Mart Generator Service** in services/martGenerator.ts
```yaml
models:
  datavault:
    mart:
      _common:
        +schema: mart
        +materialized: table
      werkportal:
        +schema: mart_werkportal
        +materialized: table
```

---

## Workflow: Dimension erstellen (Tree → Webview)

```
1. User öffnet "Mart Designer" (Button im Mart Tree View Header)
   → Webview Panel öffnet sich
   → Context "datavault.martDesignerOpen" = true
   → Tree Context Menus werden sichtbar

2. User navigiert im Raw Vault Tree zu:
   Raw Vault > Werkportal > Hubs > hub_company

3. User rechtsklickt auf "hub_company"
   → Context Menu zeigt: "Add as Dimension"

4. User klickt "Add as Dimension"
   → Extension ruft MartDesignerState.addDimension(hub_company)
   → postMessage an Webview: { type: 'addDimension', payload: {...} }
   → Webview erstellt "dim_company" Node mit:
     - company_key (Surrogate Key)
     - object_id (Business Key aus Hub)

5. User expandiert "sat_company" im Tree
   → Sieht Spalten: name, city, email, ...

6. User rechtsklickt auf "sat_company"
   → Context Menu: "Add Attributes to Selected Node"
   → Dialog: Attribut-Auswahl (Checkboxes)
   → Ausgewählte Attribute werden zur Dimension hinzugefügt

7. ODER: User rechtsklickt auf einzelne Spalte "name"
   → Context Menu: "Add to Selected Node"
   → Spalte wird direkt hinzugefügt

8. User wählt dim_company Node auf Canvas
   → Properties Panel zeigt:
     - Name: dim_company (editierbar)
     - SCD Type: ○ Type 1 (current)  ○ Type 2 (history)
     - Source Hub: hub_company
     - Satellites: sat_company
     - PIT Table: (Dropdown - optional für Type 2)

9. User navigiert zu Business Vault > pit_company
   → Rechtsklick: "Use as Dimension Source"
   → SCD Type wechselt automatisch auf Type 2
   → Source zeigt nun: pit_company

10. User klickt "Save" im Webview
    → System generiert:
      - models/mart/werkportal/dim_company.sql
      - Eintrag in models/mart/werkportal/_werkportal__models.yml
```

---

## Workflow: Fact erstellen (Tree → Webview)

```
1. User hat Mart Designer offen mit dim_company, dim_country, dim_date

2. User navigiert zu Raw Vault > Werkportal > Links > link_order

3. Rechtsklick auf "link_order" → "Add as Fact"
   → Webview erstellt "fact_order" Node mit:
     - Automatisch erkannte FKs: hk_company, hk_country
     - Leere Measures-Liste

4. User zieht Edge von fact_order.hk_company zu dim_company.company_key
   → System erstellt FK-Referenz automatisch
   → fact_order zeigt: 🔗 company_key → dim_company

5. Gleicher Vorgang für dim_country und dim_date

6. User navigiert zu sat_order im Tree
   → Rechtsklick auf "amount" Spalte: "Add to Selected Node"
   → amount wird als Measure hinzugefügt

7. User wählt amount im Properties Panel
   → Setzt Aggregation: SUM

8. Optional: Business Vault > bridge_order
   → Rechtsklick: "Use as Fact Source"
   → Optimierte Fact-Generierung mit Bridge

9. Save generiert fact_order.sql
```

---

## Technische Details

### React Flow Konfiguration
```tsx
// App.tsx
import { ReactFlow, Background, Controls, MiniMap, Node, Edge } from '@xyflow/react';
import { useMessageHandler } from './hooks/useMessageHandler';
import { DimensionNode } from './components/DimensionNode';
import { FactNode } from './components/FactNode';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toolbar } from './components/Toolbar';
import '@xyflow/react/dist/style.css';

const nodeTypes = {
  dimension: DimensionNode,
  fact: FactNode,
};

export function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const { onSelectionChange } = useMessageHandler();

  // Notify extension when selection changes
  const handleSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    const selected = nodes.length === 1 ? nodes[0] : null;
    setSelectedNode(selected);
    onSelectionChange(selected?.id || null);
  }, [onSelectionChange]);

  // Handle edge connections (Fact → Dimension)
  const onConnect = useCallback((connection: Connection) => {
    // Auto-create FK reference when connecting
    setEdges(eds => addEdge({
      ...connection,
      type: 'smoothstep',
      animated: true,
      label: connection.sourceHandle, // FK name
    }, eds));
    
    // Update Fact node with dimension reference
    setNodes(nds => nds.map(n => {
      if (n.id === connection.source && n.type === 'fact') {
        const targetNode = nds.find(t => t.id === connection.target);
        return {
          ...n,
          data: {
            ...n.data,
            dimensionRefs: [...n.data.dimensionRefs, {
              dimensionName: targetNode?.data.name,
              foreignKey: connection.sourceHandle,
              sourceColumn: connection.sourceHandle?.replace('_key', '')
            }]
          }
        };
      }
      return n;
    }));
  }, [setEdges, setNodes]);

  return (
    <div className="mart-designer">
      <Toolbar onSave={handleSave} />
      <div className="canvas-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={handleSelectionChange}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      {selectedNode && (
        <PropertiesPanel 
          node={selectedNode} 
          onUpdate={(data) => updateNodeData(selectedNode.id, data)} 
        />
      )}
    </div>
  );
}
```

### Context Value Matching für Menus

Die Context Menus erscheinen nur wenn:
1. **Mart Designer ist offen:** `datavault.martDesignerOpen == true`
2. **Node ist ausgewählt** (für "Add to..."): `datavault.nodeSelected == true`
3. **Richtiger Item-Typ:** `viewItem =~ /^model/` für Models, `viewItem == column` für Spalten

```typescript
// In MartDesignerProvider.ts - beim Öffnen/Schließen
export class MartDesignerProvider implements vscode.WebviewViewProvider {
  private static currentPanel: vscode.WebviewPanel | undefined;

  public static createOrShow(extensionUri: vscode.Uri) {
    if (MartDesignerProvider.currentPanel) {
      MartDesignerProvider.currentPanel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'martDesigner',
      'Mart Designer',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    MartDesignerProvider.currentPanel = panel;
    
    // Set context for menu visibility
    vscode.commands.executeCommand('setContext', 'datavault.martDesignerOpen', true);
    MartDesignerState.getInstance().setWebview(panel.webview);

    panel.onDidDispose(() => {
      MartDesignerProvider.currentPanel = undefined;
      vscode.commands.executeCommand('setContext', 'datavault.martDesignerOpen', false);
      vscode.commands.executeCommand('setContext', 'datavault.nodeSelected', false);
      MartDesignerState.getInstance().setWebview(null);
    });

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(message => {
      if (message.type === 'nodeSelected') {
        MartDesignerState.getInstance().setSelectedNode(message.payload.nodeId);
      } else if (message.type === 'save') {
        MartGeneratorService.generateFromDesigner(message.payload);
      }
    });

    panel.webview.html = getWebviewContent(panel.webview, extensionUri);
  }
}
```

### State Persistence

**Strategie: Auto-Load beim Öffnen + Explizites Speichern**

Der Designer-State wird als JSON-Datei im Workspace gespeichert und beim Öffnen automatisch geladen.

**Datei-Struktur:**
```
models/mart/<concept>/
├── .designer-state.json    ← Designer State (Auto-Load, explizit Save)
├── dim_company.sql         ← Generierte SQL-Datei
├── dim_date.sql
├── fact_order.sql
└── _<concept>__models.yml
```

**Designer State Schema (`.designer-state.json`):**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "version": "1.0",
  "concept": "werkportal",
  "lastModified": "2026-01-27T10:30:00Z",
  "nodes": [
    {
      "id": "dim_company",
      "type": "dimension",
      "position": { "x": 100, "y": 200 },
      "data": {
        "name": "dim_company",
        "sourceType": "hub",
        "sourceHub": "hub_company",
        "sourceSatellites": ["sat_company"],
        "scdType": "type1",
        "materialization": "table",
        "surrogateKeyStrategy": "row_number",
        "businessKey": "object_id",
        "surrogateKey": "dim_company_key",
        "hashKey": "hk_company",
        "includeHashKey": true,
        "attributes": [
          { "name": "name", "sourceModel": "sat_company", "sourceColumn": "name", "dataType": "NVARCHAR(255)" },
          { "name": "city", "sourceModel": "sat_company", "sourceColumn": "city", "dataType": "NVARCHAR(100)" }
        ]
      }
    },
    {
      "id": "fact_order",
      "type": "fact",
      "position": { "x": 400, "y": 200 },
      "data": {
        "name": "fact_order",
        "sourceLink": "link_order",
        "sourceSatellites": ["sat_order"],
        "materialization": "incremental",
        "incrementalStrategy": "append",
        "incrementalUniqueKey": ["company_key", "date_key", "order_number"],
        "grain": ["company_key", "date_key"],
        "dimensionRefs": [
          { "dimensionName": "dim_company", "foreignKey": "company_key", "joinColumn": "hk_company", "scdType": "type1", "isRolePlaying": false }
        ],
        "degenerateDimensions": [
          { "name": "order_number", "sourceColumn": "order_number", "sourceModel": "sat_order", "dataType": "NVARCHAR(50)", "isPartOfGrain": true }
        ],
        "measures": [
          { "name": "amount", "sourceColumn": "amount", "sourceModel": "sat_order", "dataType": "DECIMAL(18,2)", "aggregation": "SUM" }
        ]
      }
    }
  ],
  "edges": [
    { "id": "e-fact_order-dim_company", "source": "fact_order", "target": "dim_company", "sourceHandle": "company_key", "targetHandle": "dim_company_key" }
  ]
}
```

**Lifecycle:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  State Persistence Lifecycle                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. OPEN DESIGNER                                                           │
│     ├── Check: Existiert `.designer-state.json` für Concept?                │
│     │   ├── JA  → Auto-Load: Nodes + Edges aus JSON laden                   │
│     │   └── NEIN → Leerer Canvas                                            │
│     │                                                                       │
│  2. USER ARBEITET                                                           │
│     ├── Nodes hinzufügen/bearbeiten                                         │
│     ├── Edges verbinden                                                     │
│     ├── Properties ändern                                                   │
│     └── State ist "dirty" (unsaved changes)                                 │
│         → Titel zeigt: "Mart Designer - werkportal ●" (Dot = unsaved)       │
│                                                                             │
│  3. EXPLICIT SAVE (Ctrl+S oder Save Button)                                 │
│     ├── Schreibt `.designer-state.json`                                     │
│     ├── Generiert alle `dim_*.sql` und `fact_*.sql` Dateien                 │
│     ├── Aktualisiert `_<concept>__models.yml`                               │
│     └── State ist "clean"                                                   │
│         → Titel zeigt: "Mart Designer - werkportal"                         │
│                                                                             │
│  4. CLOSE DESIGNER (mit unsaved changes)                                    │
│     └── Dialog: "Save changes before closing?"                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation in MartDesignerProvider.ts:**
```typescript
// Auto-Load beim Öffnen
const statePath = path.join(workspaceRoot, 'models', 'mart', concept, '.designer-state.json');
if (fs.existsSync(statePath)) {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  panel.webview.postMessage({ type: 'loadState', payload: state });
}

// Dirty-State Tracking
let isDirty = false;
panel.webview.onDidReceiveMessage(message => {
  if (message.type === 'stateChanged') {
    isDirty = true;
    panel.title = `Mart Designer - ${concept} ●`;
  } else if (message.type === 'save') {
    // Write .designer-state.json
    fs.writeFileSync(statePath, JSON.stringify(message.payload.state, null, 2));
    // Generate SQL files
    MartGeneratorService.generateFromDesigner(message.payload);
    isDirty = false;
    panel.title = `Mart Designer - ${concept}`;
  }
});

// Warn on close with unsaved changes
panel.onDidDispose(() => {
  if (isDirty) {
    // Show dialog before dispose is not possible
    // State is lost if user closes without saving
  }
});
```

### Bestehende Mart-Models erkennen

**Strategie: JSON-Konfiguration ist Wahrheitsquelle (nicht SQL)**

Manuell erstellte oder geänderte SQL-Dateien werden **nicht** automatisch in den Designer geladen.
Die `.designer-state.json` ist die einzige Quelle für den Designer.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WICHTIG: JSON ist Wahrheitsquelle                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ✅ Designer erkennt:                                                       │
│     - Alles in `.designer-state.json`                                       │
│                                                                             │
│  ❌ Designer erkennt NICHT:                                                 │
│     - Manuell erstellte `dim_*.sql` ohne Designer-State                     │
│     - Manuell geänderte SQL-Dateien (Änderungen gehen beim Save verloren!)  │
│                                                                             │
│  Workflow für manuelle SQL-Dateien:                                         │
│     1. SQL wird manuell erstellt (z.B. `dim_date.sql`)                      │
│     2. Datei existiert, aber nicht im Designer sichtbar                     │
│     3. dbt kann trotzdem darauf zugreifen via {{ ref('dim_date') }}         │
│     4. Wenn im Designer gewünscht: Manuell als Node hinzufügen              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Alternative für Zukunft (Out of Scope):**
SQL-Parsing könnte später implementiert werden, um bestehende Models zu importieren.
Dies ist komplex und fehleranfällig bei manuellen Änderungen.

### Multi-Concept Facts: Schema-Zuordnung

**Regel: Fact gehört zum Concept seines Source-Links**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Multi-Concept Fact Schema-Zuordnung                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Beispiel: fact_order aus link_order (werkportal)                           │
│            referenziert dim_date (_common) und dim_company (werkportal)     │
│                                                                             │
│  Schema-Regel:                                                              │
│  ─────────────                                                              │
│  Fact-Schema = Concept des Source-Links                                     │
│                                                                             │
│  fact_order                                                                 │
│    ├── Source: link_order (werkportal)                                      │
│    ├── Schema: mart_werkportal ← bestimmt durch Source-Link                 │
│    └── Referenziert:                                                        │
│        ├── dim_company (mart_werkportal) ← gleiches Concept                 │
│        └── dim_date (mart) ← _common Dimension                              │
│                                                                             │
│  SQL Join:                                                                  │
│  ─────────                                                                  │
│  FROM {{ ref('link_order') }} l                                             │
│  JOIN {{ ref('dim_company') }} dc ON ...  -- dbt löst Schema automatisch    │
│  JOIN {{ ref('dim_date') }} dd ON ...     -- dbt löst Schema automatisch    │
│                                                                             │
│  Hinweis: dbt {{ ref() }} kümmert sich um Cross-Schema Joins.              │
│  Im generierten SQL keine expliziten Schema-Prefixe nötig.                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Custom SQL Transformationen (Two-Layer Model)

### Architektur: Zwei-Schichten-Modell

Mart-Models erfordern oft **Custom SQL Transformationen** (berechnete Felder, CASE WHEN, Window Functions, komplexe Joins). Um diese bei Regenerierung nicht zu verlieren, verwendet der Designer ein **Two-Layer Model Pattern**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  models/mart/werkportal/                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   _base/                         ← GENERATED LAYER (Mart Designer)          │
│   ├── _base_dim_company.sql      ← Regeneriert bei jeder Änderung           │
│   ├── _base_dim_date.sql         ← Ephemeral (nicht persistiert)            │
│   └── _base_fact_order.sql       ← Nur Basis-Struktur, keine Custom Logic   │
│                                                                             │
│   dim_company.sql                ← CUSTOM LAYER (User-Eigentum)             │
│   dim_date.sql                   ← Hier Custom Transformationen             │
│   fact_order.sql                 ← Wird NIE vom Designer überschrieben      │
│   _werkportal__models.yml                                                   │
│   .designer-state.json                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Vorteile dieses Ansatzes

| Aspekt | Vorteil |
|--------|---------|
| **Kein Datenverlust** | Custom SQL bleibt bei Regenerierung erhalten |
| **Volle SQL-Power** | User kann Window Functions, CTEs, komplexe CASE WHEN schreiben |
| **Klare Ownership** | `_base/` = Designer, final = User |
| **dbt Best Practice** | Staging → Base → Final ist Standard-Pattern |
| **Einfach zu verstehen** | Kein Macro-Wissen erforderlich |

### Datenfluss

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   Raw Vault                    Base Layer                  Custom Layer     │
│   ──────────                   ──────────                  ────────────     │
│                                                                             │
│   hub_company ──┐                                                           │
│                 ├──► _base_dim_company ──► dim_company ──► BI Tools         │
│   sat_company ──┘    (ephemeral)           (table)                          │
│                      │                     │                                │
│                      │ Generiert:          │ Custom:                        │
│                      │ - SK, BK, HK        │ - UPPER(name)                  │
│                      │ - Basis-Attribute   │ - CASE WHEN tier               │
│                      │ - Satellite Joins   │ - Window Functions             │
│                                            │ - Custom Joins                 │
│                                            │ - Berechnete Felder            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### dbt_project.yml Konfiguration

```yaml
models:
  datavault:
    mart:
      _common:
        _base:
          +schema: mart
          +materialized: ephemeral  # Nicht persistiert!
        +schema: mart
        +materialized: table
      werkportal:
        _base:
          +schema: mart_werkportal
          +materialized: ephemeral
        +schema: mart_werkportal
        +materialized: table
```

### Base Model Template (`_base/_base_dim_<entity>.sql`)

```sql
{# ============================================================
   GENERATED BY MART DESIGNER - DO NOT EDIT MANUALLY
   Regenerated: {{ now() }}
   
   To customize: Edit {{ name }}.sql (not this file)
   ============================================================ #}

{{ config(materialized='ephemeral') }}

SELECT
    {# Surrogate Key #}
    ROW_NUMBER() OVER (ORDER BY h.hk_{{ entity }}) AS dim_{{ entity }}_key,
    
    {# Business Key #}
    h.{{ business_key }} AS {{ entity }}_id,
    
    {# Vault Hash Key (Traceability) #}
    h.hk_{{ entity }},
    
    {# Attributes from Satellites #}
    {% for attr in attributes %}
    {{ attr.sourceModel }}.{{ attr.sourceColumn }} AS {{ attr.name }}{% if not loop.last %},{% endif %}
    {% endfor %}

FROM {{ ref('hub_{{ entity }}') }} h
{% for sat in sourceSatellites %}
LEFT JOIN {{ ref('{{ sat }}') }} {{ sat }} 
    ON h.hk_{{ entity }} = {{ sat }}.hk_{{ entity }}
    AND {{ sat }}.dss_load_date = (
        SELECT MAX(dss_load_date) 
        FROM {{ ref('{{ sat }}') }} 
        WHERE hk_{{ entity }} = h.hk_{{ entity }}
    )
{% endfor %}
```

### Final Model Template (`dim_<entity>.sql`)

```sql
{# ============================================================
   CUSTOM TRANSFORMATION LAYER
   
   Base Model: {{ ref('_base_dim_' + entity) }}
   Generated:  {{ now() }}
   
   ⚠️ This file will NOT be overwritten by the Mart Designer.
   Add your custom transformations below.
   ============================================================ #}

{{ config(materialized='table') }}

{# ============================================================
   CUSTOM TRANSFORMATIONS
   Add calculated fields, CASE WHEN, Window Functions here
   ============================================================ #}

SELECT
    {# Base columns from generated layer #}
    base.*
    
    {# ══════════════════════════════════════════════════════════
       ADD YOUR CUSTOM COLUMNS BELOW
       Examples:
       
       -- Calculated Field
       , UPPER(base.name) AS name_upper
       
       -- Business Logic
       , CASE 
           WHEN base.credit_score > 700 THEN 'Premium'
           WHEN base.credit_score > 500 THEN 'Standard'
           ELSE 'Basic'
         END AS customer_tier
       
       -- Window Function
       , ROW_NUMBER() OVER (PARTITION BY base.city ORDER BY base.name) AS city_rank
       
       -- Concatenation
       , CONCAT(base.city, ', ', base.country) AS full_location
       
       ══════════════════════════════════════════════════════════ #}
    
FROM {{ ref('_base_dim_{{ entity }}') }} base
```

### Generator Logik

```typescript
// In MartGeneratorService.ts
async function generateDimension(config: DimensionConfig): Promise<void> {
  const basePath = path.join(
    workspaceRoot, 'models', 'mart', config.concept, '_base', `_base_${config.name}.sql`
  );
  const finalPath = path.join(
    workspaceRoot, 'models', 'mart', config.concept, `${config.name}.sql`
  );
  
  // 1. ALWAYS regenerate base model (safe)
  const baseSql = renderBaseTemplate(config);
  await fs.mkdir(path.dirname(basePath), { recursive: true });
  await fs.writeFile(basePath, baseSql);
  
  // 2. ONLY create final model if it doesn't exist
  if (!await fileExists(finalPath)) {
    const finalSql = renderFinalTemplate(config);
    await fs.writeFile(finalPath, finalSql);
    vscode.window.showInformationMessage(
      `Created ${config.name}.sql - Add custom transformations there.`
    );
  } else {
    // Final model exists - notify user that base was updated
    vscode.window.showInformationMessage(
      `Updated _base_${config.name}.sql. Custom layer preserved.`
    );
  }
}
```

### Designer UI: Custom Column Indicator

Im Designer wird angezeigt, ob ein Model Custom Columns hat:

```
┌─────────────────────────────────────────────────────────────────┐
│  dim_company                                                     │
│  ──────────────────────────────────────────────────────────────  │
│  🔑 dim_company_key                          [Generated]         │
│  📋 object_id                                [Generated]         │
│  📋 name                                     [Generated]         │
│  📋 city                                     [Generated]         │
│  ─────────────────────────────────────────────────────────────  │
│  📝 name_upper                               [Custom ✏️]         │
│  📝 customer_tier                            [Custom ✏️]         │
├─────────────────────────────────────────────────────────────────┤
│  ⚠️ Has custom transformations - base only will be regenerated  │
│  [Open Custom Layer]                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Workflow: Custom Transformation hinzufügen

```
1. User erstellt dim_company im Designer
   → Generator erstellt:
     - models/mart/werkportal/_base/_base_dim_company.sql (ephemeral)
     - models/mart/werkportal/dim_company.sql (table)

2. User öffnet dim_company.sql (Cmd+Click im Designer oder "Open Custom Layer" Button)
   → VS Code öffnet die Datei

3. User fügt Custom Column hinzu:
   
   SELECT
       base.*,
       UPPER(base.name) AS name_upper,  -- NEU
       CASE WHEN base.revenue > 1000000 THEN 'Enterprise' 
            ELSE 'SMB' END AS segment   -- NEU
   FROM {{ ref('_base_dim_company') }} base

4. User ändert Attribute im Designer (z.B. fügt sat_company_ext hinzu)
   → Generator regeneriert NUR _base_dim_company.sql
   → dim_company.sql bleibt unverändert mit Custom Columns

5. Designer zeigt Custom Columns mit [Custom ✏️] Badge an
   (via Custom Column Detection aus Final Model)
```

### Custom Column Detection (für Designer-Anzeige)

```typescript
async function detectCustomColumns(modelName: string, concept: string): Promise<CustomColumn[]> {
  const finalPath = path.join(workspaceRoot, 'models', 'mart', concept, `${modelName}.sql`);
  
  if (!await fs.exists(finalPath)) {
    return [];
  }
  
  const content = await fs.readFile(finalPath, 'utf-8');
  
  // Parse SELECT columns nach "base.*"
  const customMatch = content.match(/base\.\*\s*\n([\s\S]*?)FROM/i);
  if (!customMatch) return [];
  
  // Extract column definitions
  const columnRegex = /,\s*(.+?)\s+AS\s+(\w+)/gi;
  const columns: CustomColumn[] = [];
  let match;
  
  while ((match = columnRegex.exec(customMatch[1])) !== null) {
    columns.push({
      name: match[2],
      expression: match[1].trim(),
      addedManually: true
    });
  }
  
  return columns;
}
```

### Types für Custom Columns

```typescript
// In types.ts ergänzen
export interface CustomColumn {
  name: string;                 // Spaltenname im Mart
  expression: string;           // SQL Expression (z.B. "UPPER(name)")
  dataType?: string;            // Optionaler Datentyp
  description?: string;         // Dokumentation
  addedManually: boolean;       // true = im SQL editiert, nicht im Designer
}

export interface DimensionConfig {
  // ... existing fields ...
  
  // Custom Transformation Support
  hasCustomLayer: boolean;        // true wenn final model existiert und angepasst wurde
  customColumns?: CustomColumn[]; // Vorschau der Custom Columns im Designer (read-only)
}
```

### Inline Calculated Fields im Designer (Optional)

Für einfache Transformationen kann der Designer auch einen "Add Calculated Field" Dialog bieten:

```
┌─────────────────────────────────────────────────────────────────┐
│  Properties: dim_company                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Attributes:                                                    │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ 📋 name          ← sat_company.name        [×]             ││
│  │ 📋 city          ← sat_company.city        [×]             ││
│  │ 📝 name_upper    = UPPER(name)             [×]             ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  [+ Add Attribute] [+ Add Calculated Field]                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Dialog für Calculated Field:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Add Calculated Field                                           │
│  ───────────────────────────────────────────────────────────────│
│  Name:       [name_upper        ]                               │
│  Expression: [UPPER(name)       ]                               │
│  Data Type:  [NVARCHAR(255)     ▼]                              │
│                                        [Cancel] [Add]           │
└─────────────────────────────────────────────────────────────────┘
```

> **Hinweis:** Designer-definierte Calculated Fields werden im `_base_` Model generiert.
> Komplexere Transformationen (CTEs, Window Functions über mehrere Spalten) werden im Final Model manuell hinzugefügt.

### Empfehlungen für Custom Transformations

| Transformation | Wo implementieren | Grund |
|----------------|-------------------|-------|
| **Einfache Berechnungen** (UPPER, CONCAT) | Designer oder Final Model | Beides möglich |
| **CASE WHEN Logik** | Final Model | Oft komplex, besser in SQL |
| **Window Functions** | Final Model | Erfordert Kontext über mehrere Zeilen |
| **Custom Joins** | Final Model | Zusätzliche Quellen außerhalb Designer |
| **CTEs** | Final Model | Komplexe Abfragen mit Zwischenschritten |
| **Pre/Post Hooks** | Final Model config() | Index-Erstellung, Grants |

---

## Further Considerations

### 1. **SCD Type 2 Dimension Implementierung**

| Option | Beschreibung | Wann verwenden |
|--------|--------------|----------------|
| **Option A: Satellite-direkt** | Direkt aus Satellite mit `dss_load_date` als `valid_from`/`valid_to` | Dimension basiert auf nur einem Satellite |
| **Option B: PIT-basiert** | Über PIT-Tabelle, die mehrere Satellites zusammenführt | Multi-Satellite Dimensionen (z.B. `sat_company` + `sat_company_address`) |

**Empfehlung:** PIT-basiert wenn verfügbar, sonst Satellite-direkt.

```sql
-- Option A: Satellite-direkt (Single Satellite)
SELECT
    dim_company_key,
    object_id,
    name, city, email,
    dss_load_date AS valid_from,
    LEAD(dss_load_date) OVER (PARTITION BY hk_company ORDER BY dss_load_date) AS valid_to,
    CASE WHEN valid_to IS NULL THEN 'Y' ELSE 'N' END AS is_current
FROM {{ ref('sat_company') }}

-- Option B: PIT-basiert (Multi-Satellite)
SELECT
    dim_company_key,
    h.object_id,
    s1.name, s1.city,        -- aus sat_company
    s2.street, s2.zip_code,  -- aus sat_company_address
    p.pit_load_date AS valid_from,
    ...
FROM {{ ref('pit_company') }} p
JOIN {{ ref('hub_company') }} h ON p.hk_company = h.hk_company
LEFT JOIN {{ ref('sat_company') }} s1 ON p.sat_company_ldts = s1.dss_load_date
LEFT JOIN {{ ref('sat_company_address') }} s2 ON p.sat_company_address_ldts = s2.dss_load_date
```

### 2. **Surrogate Key Strategie**

Im Information Mart werden **Integer Surrogate Keys** verwendet, um performante Joins zu ermöglichen. Die Vault Hash-Keys (`hk_*`) bleiben als zusätzliche Attribute erhalten für Traceability.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  dim_company                                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  dim_company_key    INT (PK)    ← Surrogate Key für Joins                   │
│  ───────────────────────────────────────────────────────────────────────────│
│  object_id          BIGINT      ← Business Key (aus Hub)                    │
│  hk_company         CHAR(64)    ← Vault Hash Key (für Traceability)         │
│  ───────────────────────────────────────────────────────────────────────────│
│  name               NVARCHAR    ← Attribute aus Satellite(s)                │
│  city               NVARCHAR                                                │
│  ...                                                                        │
│  ───────────────────────────────────────────────────────────────────────────│
│  valid_from         DATETIME2   ← SCD Type 2 Validity (optional)            │
│  valid_to           DATETIME2                                               │
│  is_current         CHAR(1)                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Generierung des Integer Surrogate Key:**

| Methode | SQL | Vorteile | Nachteile |
|---------|-----|----------|-----------|
| **ROW_NUMBER** | `ROW_NUMBER() OVER (ORDER BY hk_company, valid_from)` | Einfach, deterministisch bei gleichem Input | Ändert sich bei Re-Run wenn neue Daten |
| **DENSE_RANK** | `DENSE_RANK() OVER (ORDER BY hk_company)` | Stabil für Type 1 Dims | Nicht für Type 2 geeignet |
| **IDENTITY** | Table mit `IDENTITY(1,1)` | Performant, stabil | Nur bei persistierten Tables |
| **Hash-to-Int** | `ABS(CHECKSUM(hk_company))` | Deterministisch | Kollisionen möglich |

**Empfehlung:** `ROW_NUMBER()` für Views, `IDENTITY` für persistierte Tables.

```sql
-- Im Properties Panel auswählbar:
-- ○ Auto-generated (ROW_NUMBER)
-- ○ Identity Column (nur bei Table)
-- ○ Hash-based (CHECKSUM)

SELECT
    ROW_NUMBER() OVER (ORDER BY h.hk_company) AS dim_company_key,  -- Integer SK
    h.object_id,                                                    -- Business Key
    h.hk_company,                                                   -- Vault HK (Traceability)
    s.name, s.city, s.email
FROM {{ ref('hub_company') }} h
LEFT JOIN {{ ref('sat_company') }} s ON h.hk_company = s.hk_company
```

### 3. **Materialisierung: Virtuell vs. Persistiert**

Der Benutzer kann im Properties Panel wählen, ob das Mart-Objekt als **View** (virtuell) oder **Table** (persistiert) materialisiert wird.

```
┌─────────────────────────────────────────────────────────────────┐
│  Properties: dim_company                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Materialization:                                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ○ View (virtuell)     - Immer aktuell, kein ETL-Aufwand    ││
│  │ ● Table (persistiert) - Schnelle Queries, Indexierung      ││
│  │ ○ Incremental         - Nur neue Daten laden (für große    ││
│  │                         Fact-Tabellen)                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Surrogate Key:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ● Auto-generated (ROW_NUMBER)                               ││
│  │ ○ Identity Column (nur bei Table)                           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| Materialisierung | Wann verwenden | dbt Config |
|------------------|----------------|------------|
| **View** | Kleine Dimensionen, häufige Quelländerungen | `materialized='view'` |
| **Table** | Große Dimensionen, komplexe Joins, brauchen Indizes | `materialized='table'` |
| **Incremental** | Große Fact-Tabellen mit append-only Pattern | `materialized='incremental'` |

**Empfehlung:**
- `dim_*` → **Table** (für performante Joins, Index auf Surrogate Key)
- `fact_*` klein → **View** (flexibel, immer aktuell)
- `fact_*` groß → **Incremental** (nur neue Transaktionen laden)

### 4. **Bestehende Marts laden**
   - Parser liest existierende `dim_*.sql` / `fact_*.sql`
   - Rekonstruiert Designer-State aus SQL (reverse engineering)
   - Oder: State immer parallel speichern in `.designer-state.json`

### 5. **Validierung im Designer**

| Check | Schweregrad | Beschreibung | Lösung |
|-------|-------------|--------------|--------|
| Dimension ohne Attribute | ⚠️ Warning | Nur SK + BK, keine Satellite-Attribute | Attribute hinzufügen |
| Dimension ohne Source | ❌ Error | Kein Hub/Seed/Reference definiert | Source auswählen |
| Fact ohne Dimension-Referenz | ❌ Error | Kein Grain definiert | Mind. 1 Dim-Referenz |
| Fact ohne Measures | ⚠️ Warning | Nur FKs, keine Metriken | OK für reine Beziehungs-Facts |
| Doppelte FK-Namen | ❌ Error | Zwei FKs mit gleichem Namen | Role Alias verwenden |
| Fehlende Source | ❌ Error | Hub/Sat/Link existiert nicht im Projekt | Source prüfen |
| Role-Playing ohne Alias | ⚠️ Warning | Gleiche Dim 2x ohne unterschiedliche Namen | Alias vergeben |
| Incremental ohne Unique Key | ❌ Error | `materialized='incremental'` ohne `unique_key` | Unique Key definieren |
| SCD Type 2 ohne PIT | ℹ️ Info | Type 2 Dim ohne PIT (Single-Sat OK) | PIT empfohlen für Multi-Sat |
| Zirkuläre Referenz | ❌ Error | Dimension referenziert sich selbst | Struktur prüfen |

### 6. **Undo/Redo Support**
   - React Flow bietet `useUndoRedo` Hook
   - Speichert Node/Edge Änderungen im Stack
   - Keyboard Shortcuts: `Ctrl+Z` / `Ctrl+Y`

### 7. **Autolayout**
   - Dagre oder ELK für automatisches Layout
   - Star-Schema typisch: Fact in Mitte, Dims drumherum
   - Button: "Auto-Arrange" im Toolbar

### 8. **Export**
   - Mermaid ER-Diagramm generieren
   - PNG/SVG Export des Designs
   - dbt Documentation Export (schema.yml)

---

## Data Vault 2.1 Dimensional Modeling Patterns

### Dimension-Typen im Information Mart

| Dimension-Typ | Quelle | Beispiel | Join-Pattern |
|---------------|--------|----------|--------------|
| **Hub-Dimension** | Hub + Satellite(s) | `dim_company` aus `hub_company` + `sat_company` | Über `hk_company` |
| **Reference Dimension** | Seed/Static Table | `dim_date` aus `seed_date` | Über Datum-Wert |
| **Conformed Dimension** | Shared across Facts | `dim_date` in `fact_order` und `fact_shipment` | Gleiche Dim, mehrere Facts |
| **Role-Playing Dimension** | Gleiche Dim, verschiedene Rollen | `dim_date` als `order_date_key` UND `ship_date_key` | Alias + Multi-Join |
| **Junk Dimension** | Low-Cardinality Flags | `dim_order_flags` (is_express, is_gift, etc.) | Kombinierte Flags |
| **Degenerate Dimension** | Transaktions-ID im Fact | `order_number` direkt im Fact | Kein Join nötig |

### Fact-Typen im Information Mart

| Fact-Typ | Beschreibung | Grain | Beispiel |
|----------|--------------|-------|----------|
| **Transaction Fact** | Einzelne Transaktionen | 1 Row = 1 Event | `fact_order` (jede Bestellung) |
| **Periodic Snapshot** | Regelmäßige Momentaufnahme | 1 Row = 1 Periode | `fact_monthly_balance` |
| **Accumulating Snapshot** | Prozess-Lifecycle | 1 Row = 1 Prozess | `fact_order_fulfillment` |
| **Factless Fact** | Nur Beziehungen, keine Measures | Nur FKs | `fact_student_attendance` |

### Grain-Bestimmung (Best Practice)

Das **Grain** definiert, was eine einzelne Zeile in der Fact-Tabelle repräsentiert:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  GRAIN = Kombination aller Dimension-FKs die einen Record eindeutig machen │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  fact_order:                                                               │
│  ───────────                                                               │
│  Grain: "Eine Bestellposition für einen Kunden an einem Tag"               │
│  → dim_company_key + dim_date_key + dim_product_key + order_line_number    │
│                                                                            │
│  fact_daily_sales:                                                         │
│  ────────────────                                                          │
│  Grain: "Tägliche Verkaufssumme pro Produkt und Filiale"                   │
│  → dim_date_key + dim_product_key + dim_store_key                          │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Fact-zu-Dimension Join-Strategien

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  KRITISCH: Wie kommt der Integer-FK in die Fact-Tabelle?                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Strategie A: Join über Vault Hash Key (hk_*)                               │
│  ─────────────────────────────────────────────                              │
│  Für Hub-basierte Dimensionen:                                              │
│                                                                             │
│    link_order.hk_company  ───JOIN───►  dim_company.hk_company               │
│                                              │                              │
│                                              ▼                              │
│                                        dim_company_key (Integer)            │
│                                                                             │
│  Strategie B: Join über Business Key / Datum-Wert                           │
│  ─────────────────────────────────────────────────                          │
│  Für Reference/Static Dimensionen (z.B. dim_date):                          │
│                                                                             │
│    sat_order.order_date  ───CAST───►  dim_date.full_date                    │
│                                              │                              │
│                                              ▼                              │
│                                        dim_date_key (Integer)               │
│                                                                             │
│  Strategie C: Lookup über Satellite-Attribut                                │
│  ─────────────────────────────────────────────                              │
│  Wenn FK nicht im Link, sondern im Satellite:                               │
│                                                                             │
│    sat_order.status_code  ───JOIN───►  dim_status.status_code               │
│                                              │                              │
│                                              ▼                              │
│                                        dim_status_key (Integer)             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### SCD Type 2 in Facts - Point-in-Time Joins

Bei SCD Type 2 Dimensionen muss der Fact auf die **richtige Version** der Dimension joinen:

```sql
-- Option 1: Nur aktuelle Version (für aktuelle Berichte)
JOIN dim_company dc ON l.hk_company = dc.hk_company AND dc.is_current = 'Y'

-- Option 2: Historische Version (für as-was Berichte)
JOIN dim_company dc ON l.hk_company = dc.hk_company 
    AND l.dss_load_date BETWEEN dc.valid_from AND COALESCE(dc.valid_to, '9999-12-31')
```

---

### Data Vault 2.1 Mart Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INFORMATION MART                                   │
│                         (Star Schema / Dimensional)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│   │ dim_company │    │  dim_date   │    │ dim_country │    Dimensions      │
│   │ (from Hub)  │    │  (static)   │    │ (from Hub)  │    (Type 1/2)      │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                    │
│          │                  │                  │                            │
│          └─────────────┬────┴────┬─────────────┘                            │
│                        │         │                                          │
│                   ┌────▼─────────▼────┐                                     │
│                   │   fact_orders     │    Facts                            │
│                   │   (from Link)     │    (Measures + FKs)                 │
│                   └───────────────────┘                                     │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                           BUSINESS VAULT                                     │
│                        (Query Assistance)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐              ┌──────────────┐                             │
│   │ pit_company │              │ bridge_order │      PIT = Point-In-Time    │
│   │ (Hub + Sats)│              │ (Link + FKs) │      Bridge = Link + Dims   │
│   └──────┬──────┘              └──────┬───────┘                             │
│          │                            │                                     │
├──────────┼────────────────────────────┼─────────────────────────────────────┤
│          │      RAW DATA VAULT        │                                     │
├──────────┼────────────────────────────┼─────────────────────────────────────┤
│          │                            │                                     │
│   ┌──────▼──────┐              ┌──────▼───────┐                             │
│   │ hub_company │              │  link_order  │                             │
│   │ sat_company │              │              │                             │
│   └─────────────┘              └──────────────┘                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### SQL Templates (Vorschau)

**Dimension (SCD Type 1 - Current Only, Hub-basiert):**
```sql
{{ config(materialized='table', schema='mart_{{ concept }}') }}

SELECT
    ROW_NUMBER() OVER (ORDER BY h.hk_{{ entity }}) AS dim_{{ entity }}_key,  -- Integer SK
    h.{{ business_key }} AS {{ entity }}_id,                                  -- Business Key
    h.hk_{{ entity }},                                                        -- Vault HK (Traceability)
    {% for attr in attributes %}
    {{ attr.sourceModel }}.{{ attr.sourceColumn }} AS {{ attr.name }},
    {% endfor %}
    h.dss_load_date AS valid_from
FROM {{ ref('hub_{{ entity }}') }} h
{% for sat in sourceSatellites %}
LEFT JOIN {{ ref('{{ sat }}') }} {{ sat }} 
    ON h.hk_{{ entity }} = {{ sat }}.hk_{{ entity }}
    AND {{ sat }}.dss_load_date = (
        SELECT MAX(dss_load_date) 
        FROM {{ ref('{{ sat }}') }} 
        WHERE hk_{{ entity }} = h.hk_{{ entity }}
    )
{% endfor %}
```

**Dimension (SCD Type 2 - via PIT):**
```sql
{{ config(materialized='table', schema='mart_{{ concept }}') }}

SELECT
    ROW_NUMBER() OVER (ORDER BY p.hk_{{ entity }}, p.pit_load_date) AS dim_{{ entity }}_key,
    h.{{ business_key }} AS {{ entity }}_id,
    h.hk_{{ entity }},
    {% for attr in attributes %}
    {{ attr.sourceModel }}.{{ attr.sourceColumn }} AS {{ attr.name }},
    {% endfor %}
    p.pit_load_date AS valid_from,
    LEAD(p.pit_load_date) OVER (PARTITION BY p.hk_{{ entity }} ORDER BY p.pit_load_date) AS valid_to,
    CASE 
        WHEN LEAD(p.pit_load_date) OVER (PARTITION BY p.hk_{{ entity }} ORDER BY p.pit_load_date) IS NULL 
        THEN 'Y' ELSE 'N' 
    END AS is_current
FROM {{ ref('pit_{{ entity }}') }} p
JOIN {{ ref('hub_{{ entity }}') }} h ON p.hk_{{ entity }} = h.hk_{{ entity }}
{% for sat in sourceSatellites %}
LEFT JOIN {{ ref('{{ sat }}') }} {{ sat }} 
    ON p.hk_{{ entity }} = {{ sat }}.hk_{{ entity }}
    AND p.{{ sat }}_ldts = {{ sat }}.dss_load_date
{% endfor %}
```

**Dimension (Reference/Static - z.B. dim_date aus Seed):**
```sql
{{ config(materialized='table', schema='mart') }}

-- Statische Dimension aus Seed-Tabelle
SELECT
    ROW_NUMBER() OVER (ORDER BY date_key) AS dim_date_key,  -- Integer SK
    date_key,                                                -- Business Key (YYYYMMDD)
    full_date,
    day_of_week,
    day_name,
    month_number,
    month_name,
    quarter,
    year
FROM {{ ref('seed_date') }}
```

**Fact (mit Dimension-Joins und Role-Playing):**
```sql
{{ config(
    materialized='{{ materialization }}',
    schema='mart_{{ concept }}'
    {%- if materialization == 'incremental' %},
    unique_key=['{{ incrementalUniqueKey | join("', '") }}'],
    incremental_strategy='{{ incrementalStrategy }}'
    {%- endif %}
) }}

SELECT
    -- Dimension Foreign Keys (Integer)
    {% for dimRef in dimensionRefs %}
    {{ dimRef.dimensionName }}.dim_{{ dimRef.dimensionName.replace('dim_', '') }}_key AS {{ dimRef.foreignKey }},
    {% endfor %}
    
    -- Degenerate Dimensions (Transaktions-Attribute)
    {% for dd in degenerateDimensions %}
    {{ dd.sourceModel }}.{{ dd.sourceColumn }} AS {{ dd.name }},
    {% endfor %}
    
    -- Measures
    {% for measure in measures %}
    {{ measure.sourceModel }}.{{ measure.sourceColumn }} AS {{ measure.name }}{% if not loop.last %},{% endif %}
    {% endfor %}

FROM {{ ref('{{ sourceLink }}') }} l

-- Satellite Joins (für Measures und Degenerate Dims)
{% for sat in sourceSatellites %}
LEFT JOIN {{ ref('{{ sat }}') }} {{ sat }}
    ON l.hk_link_{{ sourceLink.replace('link_', '') }} = {{ sat }}.hk_link_{{ sourceLink.replace('link_', '') }}
    AND {{ sat }}.dss_load_date = (
        SELECT MAX(dss_load_date) FROM {{ ref('{{ sat }}') }}
        WHERE hk_link_{{ sourceLink.replace('link_', '') }} = l.hk_link_{{ sourceLink.replace('link_', '') }}
    )
{% endfor %}

-- Dimension Joins (über Vault Hash Key → Dimension Integer Key)
{% for dimRef in dimensionRefs %}
JOIN {{ ref('{{ dimRef.dimensionName }}') }} {{ dimRef.dimensionName }}
    {%- if dimRef.joinColumn.startswith('hk_') %}
    ON l.{{ dimRef.joinColumn }} = {{ dimRef.dimensionName }}.{{ dimRef.joinColumn }}
    {%- else %}
    ON {{ dimRef.sourceModel }}.{{ dimRef.sourceColumn }} = {{ dimRef.dimensionName }}.{{ dimRef.joinColumn }}
    {%- endif %}
    {% if dimRef.scdType == 'type2' %}
    AND {{ dimRef.dimensionName }}.is_current = 'Y'  -- Nur aktuelle Version bei SCD Type 2
    {% endif %}
{% endfor %}

{% if materialization == 'incremental' %}
{% if is_incremental() %}
WHERE l.dss_load_date > (SELECT MAX(dss_load_date) FROM {{ this }})
{% endif %}
{% endif %}
```

**Fact (Role-Playing Dimension Beispiel - Order Date + Ship Date):**
```sql
-- Beispiel: fact_order mit dim_date als Order- und Ship-Date

SELECT
    dim_company.dim_company_key AS company_key,
    dim_date_order.dim_date_key AS order_date_key,    -- Role: Order Date
    dim_date_ship.dim_date_key AS ship_date_key,      -- Role: Ship Date
    sat_order.order_number,                            -- Degenerate Dimension
    sat_order.amount,
    sat_order.quantity
FROM {{ ref('link_order') }} l
LEFT JOIN {{ ref('sat_order') }} sat_order ON l.hk_link_order = sat_order.hk_link_order
-- Company Dimension (über Hub Hash Key)
JOIN {{ ref('dim_company') }} dim_company ON l.hk_company = dim_company.hk_company
-- Date Dimension: Order Date (über Datum-Wert)
JOIN {{ ref('dim_date') }} dim_date_order ON CAST(sat_order.order_date AS DATE) = dim_date_order.full_date
-- Date Dimension: Ship Date (über Datum-Wert) - Role-Playing!
LEFT JOIN {{ ref('dim_date') }} dim_date_ship ON CAST(sat_order.ship_date AS DATE) = dim_date_ship.full_date
```