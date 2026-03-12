/**
 * Data Vault dbt Model Types
 */

export type ModelType = 'hub' | 'satellite' | 'link' | 'staging' | 'mart' | 'pit' | 'bridge' | 'view' | 'table' | 'effectivity_satellite' | 'ref' | 'external_table';

export type MaterializedType = 'view' | 'table' | 'incremental' | 'ephemeral' | 'external';

/**
 * YAML column definition from schema files
 */
export interface YamlColumnDefinition {
  name: string;
  description?: string;
  data_type?: string;
  tests?: unknown[];
}

/**
 * External Table definition from sources.yml
 */
export interface ExternalTable {
  name: string;
  description?: string;
  sourceName: string;      // Parent source name (e.g., 'staging')
  schema: string;          // Schema from source definition
  columns: ColumnInfo[];
  location?: string;       // Parquet file location
  fileFormat?: string;
  dataSource?: string;
  concept: string;         // Extracted from location or name
  _yamlPath: string;       // Path to sources.yml
}

/**
 * PSA (Persistent Staging Area) table info
 * These are dbt models that persist external table data
 */
export interface PsaTableInfo {
  name: string;            // e.g., 'jira_customers' (without psa_ prefix in sources.yml)
  modelName: string;       // e.g., 'psa_jira_customers' (actual dbt model name)
  description?: string;
  sourceName: string;      // Parent source name (e.g., 'staging')
  schema: string;
  columns: ColumnInfo[];
  sourceExternalTable: string;  // Original ext_* table name
  concept: string;
  _yamlPath: string;
}

/**
 * YAML model definition from _*__models.yml files
 */
export interface YamlModelDefinition {
  name: string;
  description?: string;
  columns?: YamlColumnDefinition[];
  config?: Record<string, unknown>;
  tests?: unknown[];
  // Internal metadata added during parsing
  _yamlPath?: string;
  _layer?: 'staging' | 'raw_vault' | 'business_vault' | 'mart';
  _concept?: string;
}

/**
 * Column information with data type
 */
export interface ColumnInfo {
  name: string;
  dataType?: string;
  description?: string;
}

/**
 * Represents a dbt model
 */
export interface DbtModel {
  name: string;
  schema: string;
  type: ModelType;
  materialized: MaterializedType;
  filePath: string;
  relativePath: string;
  columns: ColumnInfo[];
  refs: string[];        // Referenced models (from ref())
  sources: string[];     // Referenced sources (from source())
  concept: string;       // Business concept (e.g., 'jira', '_common')
  layer: 'staging' | 'raw_vault' | 'business_vault' | 'mart';
  description?: string;
  _yamlPath?: string;    // Path to the YAML schema file
}

/**
 * Hub-specific metadata
 */
export interface HubInfo extends DbtModel {
  type: 'hub';
  businessKey: string | null;
  satellites: string[];   // Related satellite names
}

/**
 * Satellite-specific metadata
 */
export interface SatelliteInfo extends DbtModel {
  type: 'satellite' | 'effectivity_satellite';
  parentHub: string | null;
  attributes: string[];
  isEffectivity: boolean;
}

/**
 * Link-specific metadata
 */
export interface LinkInfo extends DbtModel {
  type: 'link';
  connectedHubs: string[];
}

/**
 * dbt_project.yml configuration
 */
export interface DbtProjectConfig {
  name: string;
  version?: string;
  profile?: string;
  'model-paths'?: string[];
  'seed-paths'?: string[];
  models?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * PIT (Point-in-Time) table metadata
 */
export interface PitInfo extends DbtModel {
  type: 'pit';
  baseHub: string | null;
  includedSatellites: string[];
}

/**
 * Bridge table metadata
 */
export interface BridgeInfo extends DbtModel {
  type: 'bridge';
  baseLink: string | null;
  includedSatellites: string[];
}

/**
 * Complete project metadata
 */
export interface ProjectMetadata {
  projectName: string;
  projectPath: string;
  version?: string;
  profile?: string;
  models: DbtModel[];
  hubs: HubInfo[];
  satellites: SatelliteInfo[];
  links: LinkInfo[];
  pits: PitInfo[];
  bridges: BridgeInfo[];
  marts: DbtModel[];
  staging: DbtModel[];
  seeds: DbtModel[];     // Reference tables from seeds
  externalTables: ExternalTable[];  // External tables from sources.yml
  psaTables: PsaTableInfo[];        // PSA tables from sources.yml (meta.psa: true)
  concepts: string[];    // Unique business concepts
  schemas: string[];     // Unique schemas
  lastScanned: Date;
}

/**
 * Group configuration for organizing models in tree views
 */
export interface GroupConfig {
  name: string;           // Display name of the group
  concept: string;        // Concept this group belongs to (e.g., 'jira')
  layer: 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart';  // Which tree view
  models: string[];       // Model names in this group
}

/**
 * Tree item data for VS Code TreeView
 */
export interface TreeItemData {
  id: string;
  label: string;
  type: 'layer' | 'concept' | 'category' | 'model' | 'column' | 'external_table' | 'psa_table' | 'group' | 'groupAll';
  modelType?: ModelType;
  filePath?: string;
  children?: TreeItemData[];
  model?: DbtModel;
  externalTable?: ExternalTable;
  psaTable?: PsaTableInfo;
  collapsibleState: 'none' | 'collapsed' | 'expanded';
  icon?: string;
  description?: string;
  tooltip?: string;
  concept?: string;       // For groups: which concept this belongs to
  groupName?: string;     // For model-in-group: which group it's in
  layer?: 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart';  // Layer for group context
}

// ============================================
// STAGING CONFIGURATION TYPES
// ============================================

/**
 * Foreign Key mapping for staging views
 */
export interface ForeignKeyMapping {
  sourceColumn: string;    // e.g., 'country_id'
  targetEntity: string;    // e.g., 'country'
  targetHub: string;       // e.g., 'hub_country'
  autoDetected: boolean;   // true if from pattern match
}

/**
 * Source type for staging views
 */
export type SourceType = 'external_table' | 'seed' | 'database_table' | 'manual';

/**
 * Entity type for Data Vault modeling
 * - standard: Has its own Business Key → Hub + Satellite
 * - dependent_child: No own BK, identified by parent FK + DCK → Link + DC Satellite
 * - multi_active: Multiple concurrent values per BK → Hub + MA Satellite
 * - link_only: Intersection table, no own BK, 2+ FKs → Link + optional Link Satellite
 */
export type StagingEntityType = 'standard' | 'dependent_child' | 'multi_active' | 'link_only';

/**
 * Configuration for generating a staging view
 */
export interface StagingConfig {
  // Entity identification
  concept: string;              // 'adventureworks', 'jira'
  entityName: string;           // 'customer', 'company'
  
  // Entity type (determines which Data Vault objects will be generated)
  entityType?: StagingEntityType;  // Default: 'standard'
  
  // Source
  externalTable: string;        // 'ext_adventureworks_customer' or seed name
  sourceType?: SourceType;      // Type of source (default: 'external_table')
  psaModelName?: string;        // For PSA sources: the dbt model name (e.g., 'psa_jira_company')
  
  // Business Key
  businessKeyColumns: string[];
  businessKeySeparator: string; // Default: '^^'
  
  // Payload (columns included in the view)
  payloadColumns: string[];
  
  // Column mappings for aliases (source -> target)
  // If a column has a different target name, it will be mapped here
  columnMappings?: Record<string, string>;  // { 'SOURCE_COL': 'target_col' }
  
  // Hash Diff (columns for change detection, subset of payload)
  hashDiffColumns: string[];
  hashDiffSeparator: string;    // Default: '^^' (DV 2.1 Standard)
  
  // Foreign Keys (auto-detected + manual)
  foreignKeys: ForeignKeyMapping[];
  
  // Metadata
  recordSourceDefault: string;
  includeRunId: boolean;
  
  // Dependent Child Satellites (DC Sat)
  // DCK columns grouped by target link (e.g., { 'hub_product': ['line_item_no'] })
  dependentChildKeys?: Record<string, string[]>;
  
  // Multi-Active Satellites (MA Sat)
  // CDK columns that distinguish concurrent records (e.g., ['phone_type'])
  multiActiveKeys?: string[];
  
  // Pure Link Entity (Intersection/Bridge Table)
  // When true: No Hub, only Links to existing Hubs
  // Generates combined hk_link with all FK hashes
  isPureLinkEntity?: boolean;
  
  // Pure Dependent Child: Entity with no own BK, identified by FKs + DCK
  // When true with 2+ FKs: Generates ONE combined DC Link + DC Satellite
  isPureDependentChild?: boolean;
  
  // Split-Satellite: Points to existing Hub instead of creating new one
  // Value: hub name (e.g., 'hub_product') - uses that hub's hash key
  // When set: No Hub generated, Satellite uses target hub's hk_<entity>
  splitSatelliteTargetHub?: string;
}

/**
 * Options for updating an existing staging model
 */
export interface StagingUpdateOptions {
  addNewColumns: boolean;
  regenerateHashDiff: boolean;
  updateForeignKeys: boolean;
}

/**
 * Validation result for staging models
 */
export interface StagingValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================
// ENTITY DESIGNER TYPES
// ============================================

/**
 * Column type classification for Entity Designer
 * Supports both legacy names (business_key, attribute, foreign_key) 
 * and new DV-aligned names (hub, satellite, link)
 */
export type DesignerColumnType = 
  | 'business_key' | 'hub'        // Business Key → Hub
  | 'attribute' | 'satellite'     // Attribute → Satellite
  | 'foreign_key' | 'link'        // Foreign Key → Link
  | 'dependent_child'             // Dependent Child Key → DC Sat (on Link)
  | 'multi_active'                // Multi-Active Key → MA Sat
  | 'metadata' 
  | 'ignore';

/**
 * Column definition in Entity Designer
 */
export interface DesignerColumnDefinition {
  name: string;
  sourceName?: string;
  dataType: string;
  columnType: DesignerColumnType;
  /** Additional types for multi-type columns (e.g., satellite + link) */
  additionalTypes?: DesignerColumnType[];
  includeInHashDiff: boolean;
  foreignKeyTarget?: string;  // e.g., 'hub_company' for links
  /** For hub columns: target hub (empty = new hub, 'hub_xyz' = Split-Satellite) */
  hubTarget?: string;
  nullable?: boolean;
  /** For dependent_child: which link this DCK belongs to */
  dependentChildForLink?: string;
  /** For multi_active: sequence/identifier column name */
  multiActiveSequence?: boolean;
}

/**
 * Configuration for Entity Designer
 */
export interface EntityDesignConfig {
  concept: string;              // e.g., 'jira'
  entityName: string;           // e.g., 'contacts'
  sourceTable: string;          // External Table or Staging view name
  sourceType?: SourceType;      // Type of source (seed, external_table, etc.)
  columns: DesignerColumnDefinition[];
  ghostRecordValue: string;     // Default: '-1'
  /** Lambda Vault configuration for near-real-time data */
  lambdaVault?: LambdaVaultConfig;
}

// ============================================
// LAMBDA VAULT TYPES (Near-Real-Time Data Vault)
// ============================================

/**
 * Column mapping between base staging and delta staging
 * For columns with different names in base vs delta
 */
export interface LambdaColumnMapping {
  /** Column name in base staging (e.g., 'hk_rechnung') */
  baseColumn: string;
  /** Column name in delta staging (e.g., 'hk_rechnung_delta') */
  deltaColumn: string;
}

/**
 * Lambda Vault configuration
 * Enables virtual views that UNION persisted (base) + real-time (delta) data
 */
export interface LambdaVaultConfig {
  /** Whether Lambda Vault is enabled for this entity */
  enabled: boolean;
  /** Name of the delta staging model (e.g., 'jira_rechnung_delta') */
  deltaStagingModel: string;
  /** Column mappings for columns with different names between base and delta */
  columnMappings: LambdaColumnMapping[];
}

/**
 * Info about a staging model for Lambda Vault dropdown
 */
export interface StagingModelInfo {
  /** Model name (e.g., 'jira_rechnung_delta') */
  name: string;
  /** Concept/source (e.g., 'jira') */
  concept: string;
  /** Column names in the staging model */
  columns: string[];
}

/**
 * Generated file result
 */
export interface GeneratedFile {
  path: string;
  content: string;
  type: 'hub' | 'satellite' | 'link' | 'link_satellite' | 'dc_satellite' | 'ma_satellite' | 'ghost_seed' | 'yaml' | 'schema' | 'staging' | 'virtual_hub' | 'virtual_satellite' | 'virtual_link';
}

/**
 * Result of generation process
 */
export interface GenerationResult {
  success: boolean;
  files: GeneratedFile[];
  errors: string[];
}

// ============================================
// WEBVIEW MESSAGE TYPES
// ============================================

/**
 * Message from Extension to Webview
 */
export interface WebviewInitMessage {
  type: 'init';
  data: {
    columns: ColumnInfo[];
    existingHubs: string[];
    concept: string;
    entityName: string;
    sourceTable: string;
    /** Saved column configurations (if previously configured) */
    savedColumns?: SavedColumnConfig[];
    /** Available staging models for Lambda Vault delta selection */
    availableStagingModels?: StagingModelInfo[];
    /** Saved Lambda Vault configuration */
    lambdaVault?: LambdaVaultConfig;
    /** Column names from base staging SQL (for Lambda Vault comparison) */
    baseStagingColumns?: string[];
  };
}

/**
 * Saved column config for persistence
 */
export interface SavedColumnConfig {
  name: string;
  sourceName?: string;
  dataType?: string;
  columnType: string;
  /** Additional types for multi-target columns (e.g., link column also in satellite) */
  additionalTypes?: string[];
  foreignKeyTarget?: string;
  /** For hub columns: target hub (empty = new hub, 'hub_xyz' = Split-Satellite) */
  hubTarget?: string;
  nullable?: boolean;
  /** For dependent_child: which link this DCK belongs to */
  dependentChildForLink?: string;
  /** For multi_active: is this a sequence/identifier column */
  multiActiveSequence?: boolean;
  /** Whether to include this column in Hash Diff calculation (for satellite columns) */
  includeInHashDiff?: boolean;
}

/**
 * Message from Webview to Extension
 */
export interface WebviewGenerateMessage {
  type: 'generate';
  target: 'all' | 'hub' | 'satellite' | 'links' | 'dc_satellite' | 'ma_satellite';
  // Config is now read from JSON file, not from UI
}

/**
 * Save config message - saves current UI state to JSON
 */
export interface WebviewSaveConfigMessage {
  type: 'saveConfig';
  columns: SavedColumnConfig[];
  entityName?: string;  // Optional: set when user renames the entity
  concept?: string;     // Optional: set when user changes the concept
  /** Lambda Vault configuration */
  lambdaVault?: LambdaVaultConfig;
}

/**
 * Update column type message
 */
export interface WebviewUpdateMessage {
  type: 'update';
  columnName: string;
  field: 'columnType' | 'includeInHashDiff' | 'foreignKeyTarget';
  value: string | boolean;
}

/**
 * Generation complete message
 */
export interface WebviewGenerationCompleteMessage {
  type: 'generationComplete';
  success: boolean;
  files: string[];
  errors: string[];
}

/**
 * Ready message from webview
 */
export interface WebviewReadyMessage {
  type: 'ready';
}

/**
 * Update data type in sources.yml
 */
export interface WebviewUpdateDataTypeMessage {
  type: 'updateDataType';
  columnName: string;  // Original column name in sources.yml
  newDataType: string; // New data type to set
}

/**
 * Union type for all webview messages
 */
export type WebviewMessage =
  | WebviewInitMessage
  | WebviewGenerateMessage
  | WebviewSaveConfigMessage
  | WebviewUpdateMessage
  | WebviewGenerationCompleteMessage
  | WebviewReadyMessage
  | WebviewUpdateDataTypeMessage;

// ============================================
// MART DESIGNER TYPES
// ============================================

/**
 * SCD Type for dimensions
 */
export type SCDType = 'type1' | 'type2';

/**
 * Materialization options for mart models
 */
export type MartMaterialization = 'view' | 'table' | 'incremental';

/**
 * Source type for dimensions
 */
export type DimensionSourceType = 'hub' | 'pit' | 'seed' | 'static';

/**
 * Surrogate key generation strategy
 */
export type SurrogateKeyStrategy = 'row_number' | 'identity' | 'hash';

/**
 * Dimension attribute configuration
 */
export interface DimensionAttribute {
  name: string;                    // Target column name in dimension
  sourceModel: string;             // Source model (satellite, seed, etc.)
  sourceColumn: string;            // Source column name
  dataType: string;                // SQL data type
  description?: string;            // Documentation
}

/**
 * Dimension configuration for Mart Designer
 */
export interface DimensionConfig {
  name: string;                    // e.g., 'dim_company'
  concept: string;                 // e.g., 'jira'

  // Source configuration
  sourceType: DimensionSourceType; // 'hub' | 'pit' | 'seed' | 'static'
  sourceHub?: string;              // hub_company (for sourceType='hub')
  sourcePIT?: string;              // pit_company (for sourceType='pit' or SCD Type 2)
  sourceSeed?: string;             // seed_date (for sourceType='seed')
  sourceSatellites: string[];      // [sat_company, sat_company_ext]

  // SCD configuration
  scdType: SCDType;                // 'type1' or 'type2'

  // Key configuration
  surrogateKey: string;            // dim_company_key (Integer)
  businessKey: string;             // object_id
  hashKey?: string;                // hk_company (Vault Hash Key for traceability)
  includeHashKey: boolean;         // Include hk_company as attribute?
  surrogateKeyStrategy: SurrogateKeyStrategy;

  // Attributes
  attributes: DimensionAttribute[];

  // Materialization
  materialization: MartMaterialization;
}

/**
 * Fact dimension reference (FK to dimension)
 */
export interface FactDimensionRef {
  dimensionName: string;           // dim_company
  foreignKey: string;              // company_key (name in fact output)
  factJoinColumn?: string;         // Column in fact source to join on (e.g., issue_status_id in sat_vorgang)
  dimJoinColumn?: string;          // Column in dimension to join on (e.g., issue_status_id in dim_vorgang_status)
  sourceColumn?: string;           // Legacy: hk_company or date column
  sourceModel?: string;            // Source model if not from link
  joinColumn?: string;             // Legacy: Column to join on in dimension
  scdType?: SCDType;               // SCD type of referenced dimension
  roleAlias?: string;              // "Order Date" for role-playing
  isRolePlaying: boolean;          // true if same dim used multiple times
}

/**
 * Degenerate dimension (transaction attribute stored in fact)
 */
export interface DegenerateDimension {
  name: string;                    // order_number
  sourceColumn: string;            // Source column name
  sourceModel: string;             // link_order or sat_order
  dataType: string;                // SQL data type
  isPartOfGrain: boolean;          // Part of unique key?
}

/**
 * Fact measure configuration
 */
export interface FactMeasure {
  name: string;                    // total_amount
  sourceColumn: string;            // amount
  sourceModel: string;             // sat_order
  dataType: string;                // DECIMAL(18,2)
  aggregation?: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' | 'NONE';
  description?: string;
}

/**
 * Fact configuration for Mart Designer
 */
export interface FactConfig {
  name: string;                    // fact_orders
  concept: string;                 // jira

  // Source configuration
  sourceLink?: string;             // link_order
  sourceBridge?: string;           // bridge_order (optional optimization)
  sourceSatellites?: string[];     // [sat_order] for measures

  // Grain definition
  grain: string[];                 // ['company_key', 'date_key']

  // Dimension references
  dimensionRefs: FactDimensionRef[];

  // Degenerate dimensions
  degenerateDimensions: DegenerateDimension[];

  // Measures
  measures: FactMeasure[];

  // Materialization
  materialization: MartMaterialization;

  // Incremental configuration
  incrementalUniqueKey?: string[]; // ['company_key', 'date_key', 'order_number']
  incrementalStrategy?: 'append' | 'merge';
}

/**
 * Custom column added manually in final model
 */
export interface CustomColumn {
  name: string;                    // Column name
  expression: string;              // SQL expression (e.g., "UPPER(name)")
  dataType?: string;               // Optional data type
  description?: string;            // Documentation
  addedManually: boolean;          // Always true for custom columns
}

/**
 * React Flow node for Mart Designer
 */
export interface MartDesignerNode {
  id: string;
  type: 'dimension' | 'fact';
  position: { x: number; y: number };
  data: DimensionConfig | FactConfig;
}

/**
 * React Flow edge for Mart Designer
 */
export interface MartDesignerEdge {
  id: string;
  source: string;                  // Fact node ID
  target: string;                  // Dimension node ID
  sourceHandle: string;            // FK column
  targetHandle: string;            // SK column
  data?: {
    joinType: 'inner' | 'left';
    label?: string;
  };
}

/**
 * Complete Mart Designer state for persistence
 */
export interface MartDesignerState {
  version: string;                 // Schema version
  concept: string;                 // Business concept
  martName: string;                // Name of the mart design
  lastModified: string;            // ISO timestamp
  nodes: MartDesignerNode[];
  edges: MartDesignerEdge[];
}

/**
 * Validation error for Mart Designer
 */
export interface MartValidationError {
  nodeId?: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Validation result for Mart Designer
 */
export interface MartValidationResult {
  isValid: boolean;
  errors: MartValidationError[];
  warnings: MartValidationError[];
}

// ============================================
// MART DESIGNER MESSAGE TYPES
// ============================================

/**
 * Payload for adding a dimension
 */
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

/**
 * Payload for adding a fact
 */
export interface AddFactPayload {
  name: string;
  sourceLink: string;
  foreignKeys: string[];
  columns: ColumnInfo[];
  concept: string;
}

/**
 * Payload for adding attributes to a node
 */
export interface AddAttributesPayload {
  targetNodeId: string;
  sourceModel: string;
  columns: ColumnInfo[];
}

/**
 * Payload for adding a single column to a node
 */
export interface AddColumnPayload {
  targetNodeId: string;
  sourceModel: string;
  column: ColumnInfo;
}

/**
 * Payload for setting a source (PIT/Bridge)
 */
export interface SetSourcePayload {
  targetNodeId: string;
  sourceType: 'pit' | 'bridge';
  sourceName: string;
}

/**
 * Message types for Mart Designer webview communication
 */
export type MartDesignerMessage =
  | { type: 'ready' }
  | { type: 'init'; data: MartDesignerState }
  | { type: 'addDimension'; payload: AddDimensionPayload }
  | { type: 'addFact'; payload: AddFactPayload }
  | { type: 'addAttributes'; payload: AddAttributesPayload }
  | { type: 'addColumn'; payload: AddColumnPayload }
  | { type: 'setSource'; payload: SetSourcePayload }
  | { type: 'nodeSelected'; payload: { nodeId: string | null } }
  | { type: 'save'; payload: MartDesignerState }
  | { type: 'generate'; payload: MartDesignerState }
  | { type: 'stateChanged' }
  | { type: 'generationComplete'; success: boolean; files: string[]; errors: string[] }
  | { type: 'loadState'; payload: MartDesignerState };
