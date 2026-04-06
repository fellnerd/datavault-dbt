/**
 * Config Store v2
 * 
 * Reads/writes EntityConfigV2 JSON files.
 * Handles v1 → v2 migration for backward compatibility.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EntityConfigV2,
  EntityConfigV1,
  ColumnDefinition,
  isV2Config,
  isV1Config,
  SOURCE_SYSTEMS,
} from '../types';
import {
  DvObject,
  HubObject,
  SatelliteObject,
  LinkObject,
  MaSatelliteObject,
  DcSatelliteObject,
} from '../types';

const CONFIG_DIR = '.vscode/entity-designer';
const CONFIG_VERSION = 2;

// ─── SQL Server Reserved Keywords ────────────────────────────

const SQL_RESERVED_KEYWORDS = new Set([
  'PLAN', 'LEVEL', 'KEY', 'STATUS', 'TYPE', 'ORDER', 'GROUP', 'INDEX',
  'BEFORE', 'AFTER', 'FUNCTION', 'VALUE', 'TABLE', 'VIEW', 'USER',
  'ROLE', 'CHECK', 'DEFAULT', 'PRIMARY', 'FOREIGN', 'REFERENCES', 'RETURN',
]);

export function isReservedKeyword(name: string): boolean {
  return SQL_RESERVED_KEYWORDS.has(name.toUpperCase());
}

export function detectReservedKeywords(columnNames: string[]): string[] {
  return columnNames.filter(n => isReservedKeyword(n));
}

// ─── Config File Paths ───────────────────────────────────────

export function getConfigDir(projectPath: string): string {
  return path.join(projectPath, CONFIG_DIR);
}

export function getConfigPath(projectPath: string, concept: string, entityName: string): string {
  return path.join(getConfigDir(projectPath), `${concept}_${entityName}.json`);
}

export function ensureConfigDir(projectPath: string): void {
  const dir = getConfigDir(projectPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── Save / Load ─────────────────────────────────────────────

export function saveConfigV2(projectPath: string, config: EntityConfigV2): void {
  ensureConfigDir(projectPath);
  config.savedAt = new Date().toISOString();
  
  const entityName = extractEntityName(config);
  const filePath = getConfigPath(projectPath, config.concept, entityName);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

export function loadConfig(projectPath: string, concept: string, entityName: string): EntityConfigV2 | null {
  const filePath = getConfigPath(projectPath, concept, entityName);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  if (isV2Config(raw)) {
    return raw;
  }

  if (isV1Config(raw)) {
    return migrateV1toV2(raw);
  }

  return null;
}

export function listConfigs(projectPath: string): Array<{ concept: string; entityName: string; path: string }> {
  const dir = getConfigDir(projectPath);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const name = f.replace('.json', '');
      const parts = name.split('_');
      const concept = parts[0];
      const entityName = parts.slice(1).join('_');
      return { concept, entityName, path: path.join(dir, f) };
    });
}

// ─── Helper: Extract entity name from config ─────────────────

function extractEntityName(config: EntityConfigV2): string {
  // Find the first hub — its entity name is the primary entity
  const hub = Object.values(config.objects).find(o => o.type === 'hub');
  if (hub) {
    return hub.name.replace('hub_', '');
  }
  // Fallback: derive from staging model
  return config.stagingModel.replace(/^ewb_/, '').replace(/^adworks_/, '');
}

// ─── v1 → v2 Migration ──────────────────────────────────────

export function migrateV1toV2(v1: EntityConfigV1): EntityConfigV2 {
  const concept = v1.concept || '_common';
  const entityName = v1.entityName;
  const sourceTable = v1.sourceTable;
  
  // Detect source system from sourceTable name
  let sourceSystem = 'ewb_abacus';
  if (sourceTable.includes('adworks')) { sourceSystem = 'adworks'; }
  else if (sourceTable.includes('jira')) { sourceSystem = 'jira'; }

  // Derive staging model from source table (remove ext_ prefix)
  const stagingModel = sourceTable.replace(/^ext_/, '');

  // Build column definitions
  const columns: Record<string, ColumnDefinition> = {};
  for (const col of v1.columns) {
    columns[col.sourceName] = {
      sourceName: col.sourceName,
      dataType: col.dataType,
      nullable: col.nullable,
      reservedKeyword: isReservedKeyword(col.sourceName),
    };
  }

  // Build DV objects from v1 column types
  const objects: Record<string, DvObject> = {};

  // Extract business keys (hub columns)
  const hubColumns = v1.columns.filter(c => c.columnType === 'hub');
  const satColumns = v1.columns.filter(c =>
    c.columnType === 'satellite' && c.includeInPayload !== false
  );
  const linkColumns = v1.columns.filter(c => c.columnType === 'link');
  const dcColumns = v1.columns.filter(c => c.columnType === 'dependent_child');
  const maColumns = v1.columns.filter(c => c.columnType === 'multi_active');

  // Create Hub (if business keys exist)
  if (hubColumns.length > 0) {
    const hubName = `hub_${entityName}`;
    const bks = hubColumns.map(c => c.sourceName);
    const hub: HubObject = {
      type: 'hub',
      name: hubName,
      sourceModel: stagingModel,
      srcPk: `hk_${entityName}`,
      srcNk: bks.length === 1 ? bks[0] : bks,
      srcExtraColumns: ['dss_business_key', 'dss_create_datetime'],
    };
    objects[hubName] = hub;

    // Create Satellite(s) grouped by satelliteGroup
    const satGroups = new Map<string, typeof v1.columns>();
    for (const col of satColumns) {
      const group = col.satelliteGroup || entityName;
      if (!satGroups.has(group)) { satGroups.set(group, []); }
      satGroups.get(group)!.push(col);
    }

    for (const [group, cols] of satGroups) {
      const satEntity = group === entityName ? entityName : `${entityName}_${group}`;
      const satSourceSuffix = SOURCE_SYSTEMS[sourceSystem]?.recordSource.split('_')[0] || 'abacus';
      const satName = `sat_${satEntity}__${satSourceSuffix}`;
      const payload = cols.map(c => c.sourceName.toLowerCase());
      const hashdiffCols = cols.filter(c => c.includeInHashDiff).map(c => c.sourceName);
      
      const sat: SatelliteObject = {
        type: 'satellite',
        name: satName,
        sourceModel: stagingModel,
        srcPk: `hk_${entityName}`,
        srcHashdiff: {
          sourceColumn: `hd_${satEntity}`,
          alias: 'HASHDIFF',
        },
        srcPayload: payload,
        srcExtraColumns: ['dss_create_datetime'],
        parentHub: hubName,
        generateCurrentView: true,
      };
      objects[satName] = sat;
    }
  }

  // Create Links
  if (linkColumns.length > 0) {
    for (const col of linkColumns) {
      if (!col.foreignKeyTarget) { continue; }
      // foreignKeyTarget format: "<concept>.hub_<entity>"
      const targetParts = col.foreignKeyTarget.split('.');
      const targetHub = targetParts.length > 1 ? targetParts[1] : targetParts[0];
      const targetEntity = targetHub.replace('hub_', '');
      
      const linkName = `link_${entityName}_${targetEntity}`;
      const link: LinkObject = {
        type: 'link',
        name: linkName,
        sourceModel: stagingModel,
        srcPk: `hk_link_${entityName}_${targetEntity}`,
        srcFk: [`hk_${entityName}`, `hk_${targetEntity}`],
      };
      objects[linkName] = link;
    }
  }

  // Create DC Satellites
  if (dcColumns.length > 0) {
    // DC satellites are typically attached to a link
    const dcPayload = dcColumns.map(c => c.sourceName.toLowerCase());
    const dcName = `sat_${entityName}_dc`;
    const dc: DcSatelliteObject = {
      type: 'dc_satellite',
      name: dcName,
      sourceModel: stagingModel,
      srcPk: `hk_link_${entityName}`,
      srcHashdiff: {
        sourceColumn: `hd_${entityName}_dc`,
        alias: 'HASHDIFF',
      },
      srcPayload: dcPayload,
      parentLink: `link_${entityName}`,
      generateCurrentView: true,
    };
    objects[dcName] = dc;
  }

  // Create MA Satellites
  if (maColumns.length > 0) {
    const maCdk = maColumns.map(c => c.sourceName);
    const maPayload = satColumns.map(c => c.sourceName.toLowerCase());
    const maName = `sat_${entityName}_ma`;
    const ma: MaSatelliteObject = {
      type: 'ma_satellite',
      name: maName,
      sourceModel: stagingModel,
      srcPk: `hk_${entityName}`,
      srcCdk: maCdk.length === 1 ? maCdk[0] : maCdk,
      srcHashdiff: {
        sourceColumn: `hd_${entityName}_ma`,
        alias: 'HASHDIFF',
      },
      srcPayload: maPayload,
      parentHub: `hub_${entityName}`,
      generateCurrentView: true,
    };
    objects[maName] = ma;
  }

  const reservedKeywords = detectReservedKeywords(v1.columns.map(c => c.sourceName));

  return {
    version: CONFIG_VERSION,
    concept,
    sourceSystem,
    sourceTable,
    stagingModel,
    objects,
    columns,
    reservedKeywords,
    savedAt: v1.savedAt || new Date().toISOString(),
  };
}

// ─── Create New Config (from external table) ─────────────────

export interface NewConfigOptions {
  concept: string;
  sourceSystem: string;
  sourceTable: string;
  columns: Array<{ name: string; dataType: string; nullable?: boolean }>;
}

export function createNewConfig(options: NewConfigOptions): EntityConfigV2 {
  const stagingModel = options.sourceTable.replace(/^ext_/, '');
  
  const columns: Record<string, ColumnDefinition> = {};
  const reservedKeywords: string[] = [];

  for (const col of options.columns) {
    const isReserved = isReservedKeyword(col.name);
    if (isReserved) { reservedKeywords.push(col.name); }
    
    columns[col.name] = {
      sourceName: col.name,
      dataType: col.dataType,
      nullable: col.nullable ?? true,
      reservedKeyword: isReserved,
    };
  }

  return {
    version: CONFIG_VERSION,
    concept: options.concept,
    sourceSystem: options.sourceSystem,
    sourceTable: options.sourceTable,
    stagingModel,
    objects: {},
    columns,
    reservedKeywords,
    savedAt: new Date().toISOString(),
  };
}
