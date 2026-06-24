/**
 * Entity Config v2 Schema
 * 
 * Object-first configuration format. Instead of classifying columns into
 * types (v1), the user defines DV objects and assigns columns to them.
 * The staging layer is auto-derived from the vault objects.
 */

import { DvObject, DvObjectType } from './dvObjects';

// ─── Column Metadata ─────────────────────────────────────────

export interface ColumnDefinition {
  /** Column name as it appears in the source (external table) */
  sourceName: string;
  /** SQL Server data type, e.g. "NVARCHAR(4000)", "DECIMAL(38,18)" */
  dataType: string;
  nullable: boolean;
  /** Is this a SQL Server reserved keyword that needs escaping? */
  reservedKeyword?: boolean;
  /** Optional description */
  description?: string;
}

// ─── Source System Config ────────────────────────────────────

export interface SourceSystemConfig {
  /** Source system identifier for dss_record_source, e.g. "ewb_abacus" */
  recordSource: string;
  /** Business key prefix for dss_business_key CONCAT_WS pattern */
  tenantPrefix?: string[];
}

/** Well-known source systems with their conventions */
export const SOURCE_SYSTEMS: Record<string, SourceSystemConfig> = {
  ewb_abacus: {
    recordSource: 'ewb_abacus',
    tenantPrefix: ['default', 'default'],
  },
  idms: {
    recordSource: 'ewb_idms',
    tenantPrefix: ['default', 'default'],
  },
  jira: {
    recordSource: 'jira',
    tenantPrefix: ['default', 'default'],
  },
  adworks: {
    recordSource: 'adworks',
    tenantPrefix: ['default', 'default'],
  },
};

// ─── Canvas Layout (UI persistence) ─────────────────────────

export interface NodePosition {
  x: number;
  y: number;
}

export interface CanvasLayout {
  nodes: Record<string, NodePosition>;
  zoom?: number;
  panX?: number;
  panY?: number;
}

// ─── Entity Config v2 ───────────────────────────────────────

export interface EntityConfigV2 {
  /** Schema version — always 2 for this format */
  version: 2;

  /** Concept/target folder, e.g. "_common", "jira" */
  concept: string;

  /** Source system key from SOURCE_SYSTEMS, e.g. "ewb_abacus" */
  sourceSystem: string;

  /** External table name (source), e.g. "ext_ewb_proj_npo_main" */
  sourceTable: string;

  /** Staging model name (auto-derived), e.g. "ewb_proj_npo_main" */
  stagingModel: string;

  /** All DV objects defined for this entity, keyed by object name */
  objects: Record<string, DvObject>;

  /** Source column definitions (from sources.yml or user input) */
  columns: Record<string, ColumnDefinition>;

  /** SQL Server reserved keywords found in source columns */
  reservedKeywords: string[];

  /** Canvas layout for UI persistence */
  layout?: CanvasLayout;

  /** ISO timestamp of last save */
  savedAt: string;
}

// ─── Validation ──────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationMessage {
  severity: ValidationSeverity;
  objectName?: string;
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  messages: ValidationMessage[];
}

// ─── Generation Result ──────────────────────────────────────

export interface GeneratedFileV2 {
  /** Relative path from project root */
  relativePath: string;
  /** Full file content */
  content: string;
  /** What kind of file this is */
  fileType: 'staging' | 'hub' | 'satellite' | 'link' | 'ma_satellite' | 'dc_satellite'
    | 't_link' | 'eff_satellite' | 'reference' | 'pit' | 'bridge' | 'xts'
    | 'current_view' | 'staging_schema' | 'vault_schema';
  /** Object name this file was generated from */
  objectName: string;
}

export interface GenerationResultV2 {
  success: boolean;
  files: GeneratedFileV2[];
  errors: string[];
}

// ─── v1 Compatibility ────────────────────────────────────────

/** v1 config shape for migration detection */
export interface EntityConfigV1 {
  concept: string;
  entityName: string;
  sourceTable: string;
  columns: Array<{
    name: string;
    sourceName: string;
    dataType: string;
    columnType: string;
    includeInHashDiff: boolean;
    includeInPayload?: boolean;
    nullable: boolean;
    foreignKeyTarget?: string;
    satelliteGroup?: string;
  }>;
  savedAt?: string;
  generatedObjects?: string[];
}

/** Detect if a JSON config is v1 or v2 */
export function isV2Config(config: unknown): config is EntityConfigV2 {
  return (
    typeof config === 'object' &&
    config !== null &&
    'version' in config &&
    (config as Record<string, unknown>).version === 2
  );
}

/** Detect v1 config (has columns array, no version field) */
export function isV1Config(config: unknown): config is EntityConfigV1 {
  return (
    typeof config === 'object' &&
    config !== null &&
    !('version' in config) &&
    'columns' in config &&
    Array.isArray((config as Record<string, unknown>).columns)
  );
}

// ─── Webview Messages (v2) ───────────────────────────────────

export interface V2WebviewInitMessage {
  type: 'init';
  config: EntityConfigV2;
  availableHubs: string[];
  availableConcepts: string[];
  sourceColumns: Record<string, ColumnDefinition>;
}

export interface V2WebviewSaveMessage {
  type: 'save';
  config: EntityConfigV2;
}

export interface V2WebviewGenerateMessage {
  type: 'generate';
  objectNames?: string[];
}

export interface V2WebviewValidateMessage {
  type: 'validate';
}

export type V2WebviewMessage =
  | { type: 'ready' }
  | V2WebviewSaveMessage
  | V2WebviewGenerateMessage
  | V2WebviewValidateMessage
  | { type: 'addObject'; objectType: DvObjectType; name: string }
  | { type: 'removeObject'; name: string }
  | { type: 'updateObject'; name: string; object: DvObject }
  | { type: 'updateLayout'; layout: CanvasLayout };

export type V2ExtensionMessage =
  | V2WebviewInitMessage
  | { type: 'validationResult'; result: ValidationResult }
  | { type: 'generateResult'; result: GenerationResultV2 }
  | { type: 'error'; message: string };
