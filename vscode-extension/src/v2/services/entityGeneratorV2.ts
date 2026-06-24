/**
 * Entity Generator v2 — Orchestrator
 * 
 * Coordinates the generation of all files from an EntityConfigV2:
 * staging SQL, vault models, current views, and schema YAML.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EntityConfigV2,
  GeneratedFileV2,
  GenerationResultV2,
  ValidationResult,
  ValidationMessage,
} from '../types';
import {
  DvObject,
  HubObject,
  SatelliteObject,
  MaSatelliteObject,
  DcSatelliteObject,
  LinkObject,
  isIncremental,
} from '../types';
import {
  generateSql,
  generateCurrentViewSql,
  getModelPath,
  getCurrentViewPath,
  getStagingPath,
} from './templateEngine';
import { deriveStagingSql, validateStagingDerivation } from './stagingDeriver';
import {
  generateStagingSchemaEntry,
  generateVaultSchemaEntry,
  generateCurrentViewSchemaEntry,
} from './schemaGenerator';

// ─── Validation ─────────────────────────────────────────────

export function validateConfig(config: EntityConfigV2): ValidationResult {
  const messages: ValidationMessage[] = [];

  // Must have at least one object
  if (Object.keys(config.objects).length === 0) {
    messages.push({
      severity: 'warning',
      message: 'No DV objects defined',
    });
  }

  // Validate each object
  for (const [name, obj] of Object.entries(config.objects)) {
    validateObject(name, obj, config, messages);
  }

  // Staging-level validation
  const stagingMessages = validateStagingDerivation(config);
  for (const msg of stagingMessages) {
    messages.push({ severity: msg.severity, message: msg.message });
  }

  return {
    valid: messages.filter(m => m.severity === 'error').length === 0,
    messages,
  };
}

function validateObject(
  name: string,
  obj: DvObject,
  config: EntityConfigV2,
  messages: ValidationMessage[],
): void {
  // Hub validations
  if (obj.type === 'hub') {
    const hub = obj as HubObject;
    const bks = Array.isArray(hub.srcNk) ? hub.srcNk : [hub.srcNk];
    if (bks.length === 0) {
      messages.push({ severity: 'error', objectName: name, message: 'Hub must have at least one business key' });
    }
    if (!hub.srcPk) {
      messages.push({ severity: 'error', objectName: name, message: 'Hub must have a hash key (srcPk)' });
    }
  }

  // Satellite validations
  if (obj.type === 'satellite') {
    const sat = obj as SatelliteObject;
    if (!sat.parentHub) {
      messages.push({ severity: 'error', objectName: name, message: 'Satellite must reference a parent hub' });
    }
    if (sat.srcPayload.length === 0) {
      messages.push({ severity: 'warning', objectName: name, message: 'Satellite has no payload columns' });
    }
    // Check parent hub exists in config
    if (sat.parentHub && !config.objects[sat.parentHub]) {
      messages.push({
        severity: 'warning',
        objectName: name,
        message: `Parent hub "${sat.parentHub}" not found in this config (external reference)`,
      });
    }
  }

  // Link validations
  if (obj.type === 'link') {
    const link = obj as import('../types').LinkObject;
    if (link.srcFk.length < 2) {
      messages.push({ severity: 'error', objectName: name, message: 'Link must have at least 2 foreign keys' });
    }
  }

  // MA Satellite validations
  if (obj.type === 'ma_satellite') {
    const maSat = obj as MaSatelliteObject;
    const cdks = Array.isArray(maSat.srcCdk) ? maSat.srcCdk : [maSat.srcCdk];
    if (cdks.length === 0) {
      messages.push({ severity: 'error', objectName: name, message: 'MA Satellite must have at least one CDK' });
    }
  }

  // DC Satellite validations
  if (obj.type === 'dc_satellite') {
    const dc = obj as DcSatelliteObject;
    if (!dc.parentLink) {
      messages.push({ severity: 'error', objectName: name, message: 'DC Satellite must reference a parent link' });
    }
  }
}

// ─── Generation ─────────────────────────────────────────────

export interface GenerateOptions {
  /** Only generate these object names. If empty/undefined, generate all. */
  objectNames?: string[];
  /** Project root path */
  projectPath: string;
  /** Write files to disk? Default: true */
  writeToDisk?: boolean;
}

/**
 * Resolve a satellite's src_pk from its parent hub/link so generated SQL is
 * always correct, even if the parent was assigned via the dropdown (which only
 * sets parentHub) rather than drag-and-drop. A satellite's hash key must equal
 * its parent's hash key.
 */
function resolveObjectPk(obj: DvObject, config: EntityConfigV2): DvObject {
  if (obj.type === 'satellite' || obj.type === 'ma_satellite') {
    const sat = obj as SatelliteObject | MaSatelliteObject;
    const hub = config.objects[sat.parentHub] as HubObject | undefined;
    if (hub?.srcPk && sat.srcPk !== hub.srcPk) {
      return { ...sat, srcPk: hub.srcPk };
    }
  }
  if (obj.type === 'dc_satellite') {
    const dc = obj as DcSatelliteObject;
    const link = config.objects[dc.parentLink] as LinkObject | undefined;
    if (link?.srcPk && dc.srcPk !== link.srcPk) {
      return { ...dc, srcPk: link.srcPk };
    }
  }
  return obj;
}

export function generateAll(config: EntityConfigV2, options: GenerateOptions): GenerationResultV2 {
  const files: GeneratedFileV2[] = [];
  const errors: string[] = [];

  // Validate first
  const validation = validateConfig(config);
  if (!validation.valid) {
    const errs = validation.messages.filter(m => m.severity === 'error');
    return {
      success: false,
      files: [],
      errors: errs.map(e => `${e.objectName ? `[${e.objectName}] ` : ''}${e.message}`),
    };
  }

  // Determine which objects to generate
  const objectsToGenerate = options.objectNames && options.objectNames.length > 0
    ? Object.entries(config.objects).filter(([name]) => options.objectNames!.includes(name))
    : Object.entries(config.objects);

  // 1. Generate staging SQL (always — it aggregates all objects)
  try {
    const stagingSql = deriveStagingSql(config);
    const stagingPath = getStagingPath(config.stagingModel);
    files.push({
      relativePath: stagingPath,
      content: stagingSql,
      fileType: 'staging',
      objectName: config.stagingModel,
    });
  } catch (e) {
    errors.push(`Staging generation failed: ${(e as Error).message}`);
  }

  // 2. Generate vault model SQL for each object
  for (const [name, rawObj] of objectsToGenerate) {
    const obj = resolveObjectPk(rawObj, config);
    try {
      if (obj.type === 'reference') {
        // Reference tables don't use automate_dv macros
        const sql = generateSql(obj);
        const modelPath = getModelPath(config.concept, obj);
        files.push({ relativePath: modelPath, content: sql, fileType: 'reference', objectName: name });
      } else if (obj.type === 'pit' || obj.type === 'bridge' || obj.type === 'xts') {
        // P3 types — skip for now
        errors.push(`${obj.type} generation not yet implemented`);
      } else {
        const sql = generateSql(obj);
        const modelPath = getModelPath(config.concept, obj);
        files.push({ relativePath: modelPath, content: sql, fileType: obj.type as GeneratedFileV2['fileType'], objectName: name });
      }
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }

    // Generate current view for satellites
    if (
      (obj.type === 'satellite' || obj.type === 'ma_satellite' || obj.type === 'dc_satellite') &&
      (obj as SatelliteObject).generateCurrentView !== false
    ) {
      try {
        const viewSql = generateCurrentViewSql(obj as SatelliteObject);
        const viewPath = getCurrentViewPath(config.concept, obj.name);
        files.push({ relativePath: viewPath, content: viewSql, fileType: 'current_view', objectName: `${name}_current_v` });
      } catch (e) {
        errors.push(`${name}_current_v: ${(e as Error).message}`);
      }
    }
  }

  // 3. Generate schema entries (informational — not written to models.yml directly)
  try {
    const stagingSchema = generateStagingSchemaEntry(config);
    if (stagingSchema) {
      files.push({
        relativePath: `models/staging/_staging__models.yml.snippet`,
        content: stagingSchema,
        fileType: 'staging_schema',
        objectName: `${config.stagingModel}_schema`,
      });
    }

    for (const [name, obj] of objectsToGenerate) {
      const vaultSchema = generateVaultSchemaEntry(obj, config.concept);
      if (vaultSchema) {
        files.push({
          relativePath: `models/raw_vault/${config.concept}/_${config.concept}__models.yml.snippet`,
          content: vaultSchema,
          fileType: 'vault_schema',
          objectName: `${name}_schema`,
        });
      }
    }
  } catch (e) {
    errors.push(`Schema generation failed: ${(e as Error).message}`);
  }

  // 4. Write files to disk if requested
  if (options.writeToDisk !== false) {
    for (const file of files) {
      if (file.relativePath.endsWith('.snippet')) { continue; } // Schema snippets are informational
      try {
        const fullPath = path.join(options.projectPath, file.relativePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, file.content, 'utf-8');
      } catch (e) {
        errors.push(`Failed to write ${file.relativePath}: ${(e as Error).message}`);
      }
    }
  }

  return {
    success: errors.length === 0,
    files,
    errors,
  };
}
