/**
 * Data Vault dbt Model Types
 */

export type ModelType = 'hub' | 'satellite' | 'link' | 'staging' | 'mart' | 'pit' | 'bridge' | 'view' | 'table' | 'effectivity_satellite' | 'ref';

export type MaterializedType = 'view' | 'table' | 'incremental' | 'ephemeral';

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
  columns: string[];
  refs: string[];        // Referenced models (from ref())
  sources: string[];     // Referenced sources (from source())
  concept: string;       // Business concept (e.g., 'werkportal', '_common')
  layer: 'staging' | 'raw_vault' | 'business_vault' | 'mart';
  description?: string;
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
  version: string;
  profile: string;
  models: DbtModel[];
  hubs: HubInfo[];
  satellites: SatelliteInfo[];
  links: LinkInfo[];
  pits: PitInfo[];
  bridges: BridgeInfo[];
  marts: DbtModel[];
  staging: DbtModel[];
  concepts: string[];    // Unique business concepts
  schemas: string[];     // Unique schemas
  lastScanned: Date;
}

/**
 * dbt_project.yml structure
 */
export interface DbtProjectConfig {
  name: string;
  version: string;
  'config-version': number;
  profile: string;
  'model-paths': string[];
  vars?: Record<string, unknown>;
  models?: Record<string, unknown>;
}

/**
 * Tree item data for VS Code TreeView
 */
export interface TreeItemData {
  id: string;
  label: string;
  type: 'layer' | 'concept' | 'category' | 'model';
  modelType?: ModelType;
  filePath?: string;
  children?: TreeItemData[];
  model?: DbtModel;
  collapsibleState: 'none' | 'collapsed' | 'expanded';
  icon?: string;
  description?: string;
  tooltip?: string;
}
