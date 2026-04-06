/**
 * Webview-side type definitions for Entity Designer v2.
 * These mirror the extension-side types from src/v2/types/ but are
 * self-contained for the webview bundle (no vscode imports).
 */

// ─── DV Object Types ──────────────────────────────────────────────
export type DvObjectType =
  | 'hub' | 'satellite' | 'link'
  | 'ma_satellite' | 'dc_satellite'
  | 't_link' | 'eff_satellite'
  | 'reference' | 'pit' | 'bridge' | 'xts';

export interface HashdiffConfig {
  sourceColumn: string;
  alias: string; // always "HASHDIFF"
}

export interface DvObjectBase {
  type: DvObjectType;
  name: string;
  sourceModel: string;
  srcLdts?: string;
  srcSource?: string;
}

export interface HubObject extends DvObjectBase {
  type: 'hub';
  srcPk: string;
  srcNk: string | string[];
  srcExtraColumns?: string[];
}

export interface SatelliteObject extends DvObjectBase {
  type: 'satellite';
  srcPk: string;
  srcHashdiff: HashdiffConfig;
  srcPayload: string[];
  srcExtraColumns?: string[];
  srcEff?: string;
  parentHub: string;
  generateCurrentView?: boolean;
}

export interface LinkObject extends DvObjectBase {
  type: 'link';
  srcPk: string;
  srcFk: string[];
  srcExtraColumns?: string[];
}

export interface MaSatelliteObject extends DvObjectBase {
  type: 'ma_satellite';
  srcPk: string;
  srcCdk: string[];
  srcHashdiff: HashdiffConfig;
  srcPayload: string[];
  srcExtraColumns?: string[];
  parentHub: string;
}

export interface DcSatelliteObject extends DvObjectBase {
  type: 'dc_satellite';
  srcPk: string;
  srcHashdiff: HashdiffConfig;
  srcPayload: string[];
  srcExtraColumns?: string[];
  parentLink: string;
}

export interface ReferenceObject extends DvObjectBase {
  type: 'reference';
  primaryKey: string;
  columns: string[];
  filter?: string;
}

export type DvObject =
  | HubObject
  | SatelliteObject
  | LinkObject
  | MaSatelliteObject
  | DcSatelliteObject
  | ReferenceObject;

// ─── Column & Config Types ────────────────────────────────────────
export interface ColumnDefinition {
  sourceName: string;
  dataType: string;
  nullable: boolean;
  reservedKeyword?: boolean;
  description?: string;
}

export interface CanvasLayout {
  nodes: Record<string, { x: number; y: number }>;
  zoom: number;
  panX: number;
  panY: number;
}

export interface EntityConfigV2 {
  version: 2;
  concept: string;
  sourceSystem: string;
  sourceTable: string;
  stagingModel: string;
  objects: Record<string, DvObject>;
  columns: Record<string, ColumnDefinition>;
  reservedKeywords: string[];
  layout?: CanvasLayout;
  savedAt: string;
}

// ─── Messages (Webview ↔ Extension) ──────────────────────────────
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'save'; config: EntityConfigV2 }
  | { type: 'generate'; objectNames?: string[] }
  | { type: 'validate' }
  | { type: 'addObject'; objectType: DvObjectType; name: string }
  | { type: 'removeObject'; name: string }
  | { type: 'updateObject'; name: string; object: DvObject }
  | { type: 'updateLayout'; layout: CanvasLayout }
  | { type: 'previewCode'; objectName: string };

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'staging' | 'hub' | 'satellite' | 'link' | 'current_view' | 'reference' | 'schema';
}

export interface ValidationError {
  objectName: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export type ExtensionMessage =
  | {
      type: 'init';
      config: EntityConfigV2;
      availableHubs: string[];
      availableConcepts: string[];
      sourceColumns: Record<string, ColumnDefinition>;
    }
  | { type: 'validationResult'; errors: ValidationError[] }
  | { type: 'generateResult'; success: boolean; files: string[]; errors: string[] }
  | { type: 'codePreview'; objectName: string; files: GeneratedFile[] }
  | { type: 'error'; message: string };

// ─── Node Data (React Flow) ─────────────────────────────────────
export interface HubNodeData {
  objectName: string;
  object: HubObject;
  isSelected: boolean;
}

export interface SatNodeData {
  objectName: string;
  object: SatelliteObject | MaSatelliteObject | DcSatelliteObject;
  isSelected: boolean;
}

export interface LinkNodeData {
  objectName: string;
  object: LinkObject;
  isSelected: boolean;
}

export interface RefNodeData {
  objectName: string;
  object: ReferenceObject;
  isSelected: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────
export const DV_TYPE_LABELS: Record<DvObjectType, string> = {
  hub: 'Hub',
  satellite: 'Satellite',
  link: 'Link',
  ma_satellite: 'Multi-Active Satellite',
  dc_satellite: 'Dependent Child Satellite',
  t_link: 'Transactional Link',
  eff_satellite: 'Effectivity Satellite',
  reference: 'Reference Table',
  pit: 'Point-in-Time',
  bridge: 'Bridge',
  xts: 'Extended Tracking Satellite',
};

export const DV_TYPE_ABBREVIATIONS: Record<DvObjectType, string> = {
  hub: 'HUB',
  satellite: 'SAT',
  link: 'LNK',
  ma_satellite: 'MA',
  dc_satellite: 'DC',
  t_link: 'TLNK',
  eff_satellite: 'EFF',
  reference: 'REF',
  pit: 'PIT',
  bridge: 'BRG',
  xts: 'XTS',
};

export const DV_TYPE_COLORS: Record<DvObjectType, string> = {
  hub: '#4a9eff',
  satellite: '#50c878',
  link: '#ff8c42',
  ma_satellite: '#9b59b6',
  dc_satellite: '#e67e22',
  t_link: '#e74c3c',
  eff_satellite: '#1abc9c',
  reference: '#95a5a6',
  pit: '#34495e',
  bridge: '#2c3e50',
  xts: '#7f8c8d',
};
