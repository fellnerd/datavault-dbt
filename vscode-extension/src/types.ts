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
  concept: string;       // Business concept (e.g., 'werkportal', '_common')
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
  concepts: string[];    // Unique business concepts
  schemas: string[];     // Unique schemas
  lastScanned: Date;
}

/**
 * Group configuration for organizing models in tree views
 */
export interface GroupConfig {
  name: string;           // Display name of the group
  concept: string;        // Concept this group belongs to (e.g., 'werkportal')
  layer: 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart';  // Which tree view
  models: string[];       // Model names in this group
}

/**
 * Tree item data for VS Code TreeView
 */
export interface TreeItemData {
  id: string;
  label: string;
  type: 'layer' | 'concept' | 'category' | 'model' | 'column' | 'external_table' | 'group' | 'groupAll';
  modelType?: ModelType;
  filePath?: string;
  children?: TreeItemData[];
  model?: DbtModel;
  externalTable?: ExternalTable;
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
 * Configuration for generating a staging view
 */
export interface StagingConfig {
  // Entity identification
  concept: string;              // 'adventureworks', 'werkportal'
  entityName: string;           // 'customer', 'company'
  
  // Source
  externalTable: string;        // 'ext_adventureworks_customer' or seed name
  sourceType?: SourceType;      // Type of source (default: 'external_table')
  
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
  includeInHashDiff: boolean;
  foreignKeyTarget?: string;  // e.g., 'hub_company' for links
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
  concept: string;              // e.g., 'werkportal'
  entityName: string;           // e.g., 'contacts'
  sourceTable: string;          // External Table or Staging view name
  sourceType?: SourceType;      // Type of source (seed, external_table, etc.)
  columns: DesignerColumnDefinition[];
  ghostRecordValue: string;     // Default: '-1'
}

/**
 * Generated file result
 */
export interface GeneratedFile {
  path: string;
  content: string;
  type: 'hub' | 'satellite' | 'link' | 'dc_satellite' | 'ma_satellite' | 'ghost_seed' | 'yaml' | 'schema' | 'staging';
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
  foreignKeyTarget?: string;
  nullable?: boolean;
  /** For dependent_child: which link this DCK belongs to */
  dependentChildForLink?: string;
  /** For multi_active: is this a sequence/identifier column */
  multiActiveSequence?: boolean;
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
