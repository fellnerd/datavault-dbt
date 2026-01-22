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
  externalTables: ExternalTable[];  // External tables from sources.yml
  concepts: string[];    // Unique business concepts
  schemas: string[];     // Unique schemas
  lastScanned: Date;
}

/**
 * Tree item data for VS Code TreeView
 */
export interface TreeItemData {
  id: string;
  label: string;
  type: 'layer' | 'concept' | 'category' | 'model' | 'column' | 'external_table';
  modelType?: ModelType;
  filePath?: string;
  children?: TreeItemData[];
  model?: DbtModel;
  externalTable?: ExternalTable;
  collapsibleState: 'none' | 'collapsed' | 'expanded';
  icon?: string;
  description?: string;
  tooltip?: string;
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
 * Configuration for generating a staging view
 */
export interface StagingConfig {
  // Entity identification
  concept: string;              // 'adventureworks', 'werkportal'
  entityName: string;           // 'customer', 'company'
  
  // Source
  externalTable: string;        // 'ext_adventureworks_customer'
  
  // Business Key
  businessKeyColumns: string[];
  businessKeySeparator: string; // Default: '^^'
  
  // Payload (columns included in the view)
  payloadColumns: string[];
  
  // Hash Diff (columns for change detection, subset of payload)
  hashDiffColumns: string[];
  hashDiffSeparator: string;    // Default: '||'
  
  // Foreign Keys (auto-detected + manual)
  foreignKeys: ForeignKeyMapping[];
  
  // Metadata
  recordSourceDefault: string;
  includeRunId: boolean;
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

