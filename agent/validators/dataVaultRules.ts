/**
 * Data Vault 2.1 Validation Rules
 * 
 * Validates naming conventions, required fields, and structure
 * according to DV 2.1 standards.
 */

import { ErrorCodes, type ErrorCode } from '../ui.js';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: ErrorCode;
  field: string;
  message: string;
  suggestion?: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// ============================================================================
// Naming Convention Patterns
// ============================================================================

const PATTERNS = {
  // Object naming
  hub: /^hub_[a-z][a-z0-9_]*$/,
  satellite: /^sat_[a-z][a-z0-9_]*$/,
  link: /^link_[a-z][a-z0-9_]*$/,
  staging: /^stg_[a-z][a-z0-9_]*$/,
  external: /^ext_[a-z][a-z0-9_]*$/,
  
  // Column naming
  hashKey: /^hk_[a-z][a-z0-9_]*$/,
  hashDiff: /^hd_[a-z][a-z0-9_]*$/,
  businessKey: /^[a-z][a-z0-9_]*_(id|code|number|key)$/i,
  
  // Metadata columns
  metadata: /^dss_/,
};

const REQUIRED_METADATA = ['dss_load_date', 'dss_record_source'];
const REQUIRED_METADATA_SAT = [...REQUIRED_METADATA, 'dss_run_id'];

// ============================================================================
// Hub Validation
// ============================================================================

export function validateHub(config: {
  name: string;
  hashKey: string;
  businessKeys: string[];
  source?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Validate name
  if (!PATTERNS.hub.test(config.name)) {
    errors.push({
      code: 'DV_INVALID_NAME',
      field: 'name',
      message: `Hub name '${config.name}' invalid`,
      suggestion: `Use format: hub_<entity> (lowercase, underscores)`,
    });
  }
  
  // Validate hash key
  if (!config.hashKey) {
    errors.push({
      code: 'DV_MISSING_HK',
      field: 'hashKey',
      message: 'Hash key is required',
      suggestion: `Use format: hk_<entity>`,
    });
  } else if (!PATTERNS.hashKey.test(config.hashKey)) {
    errors.push({
      code: 'DV_INVALID_HK',
      field: 'hashKey',
      message: `Hash key '${config.hashKey}' invalid`,
      suggestion: `Use format: hk_<entity> (e.g., hk_company)`,
    });
  }
  
  // Validate business keys
  if (!config.businessKeys || config.businessKeys.length === 0) {
    errors.push({
      code: 'DV_MISSING_BK',
      field: 'businessKeys',
      message: 'At least one business key required',
      suggestion: 'Business keys identify the natural key from source',
    });
  } else {
    // Warning for non-standard BK naming
    for (const bk of config.businessKeys) {
      if (!PATTERNS.businessKey.test(bk)) {
        warnings.push({
          field: 'businessKeys',
          message: `Business key '${bk}' may not follow convention`,
          suggestion: `Consider names ending with _id, _code, _number, or _key`,
        });
      }
    }
  }
  
  // Warn if entity doesn't match between name and hash key
  const hubEntity = config.name.replace('hub_', '');
  const hkEntity = config.hashKey.replace('hk_', '');
  if (hubEntity !== hkEntity) {
    warnings.push({
      field: 'hashKey',
      message: `Entity mismatch: hub_${hubEntity} vs hk_${hkEntity}`,
      suggestion: `Use hk_${hubEntity} for consistency`,
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Satellite Validation
// ============================================================================

export function validateSatellite(config: {
  name: string;
  hashKey: string;
  hashDiff: string;
  parentHub: string;
  attributes: string[];
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Validate name
  if (!PATTERNS.satellite.test(config.name)) {
    errors.push({
      code: 'DV_INVALID_NAME',
      field: 'name',
      message: `Satellite name '${config.name}' invalid`,
      suggestion: `Use format: sat_<entity> (lowercase, underscores)`,
    });
  }
  
  // Validate hash key
  if (!config.hashKey) {
    errors.push({
      code: 'DV_MISSING_HK',
      field: 'hashKey',
      message: 'Hash key (FK to Hub) is required',
      suggestion: `Use same hash key as parent hub`,
    });
  } else if (!PATTERNS.hashKey.test(config.hashKey)) {
    errors.push({
      code: 'DV_INVALID_HK',
      field: 'hashKey',
      message: `Hash key '${config.hashKey}' invalid`,
      suggestion: `Use format: hk_<entity>`,
    });
  }
  
  // Validate hash diff
  if (!config.hashDiff) {
    errors.push({
      code: 'DV_INVALID_HD',
      field: 'hashDiff',
      message: 'Hash diff is required for satellites',
      suggestion: `Use format: hd_<entity>`,
    });
  } else if (!PATTERNS.hashDiff.test(config.hashDiff)) {
    errors.push({
      code: 'DV_INVALID_HD',
      field: 'hashDiff',
      message: `Hash diff '${config.hashDiff}' invalid`,
      suggestion: `Use format: hd_<entity> (e.g., hd_company)`,
    });
  }
  
  // Validate parent hub reference
  if (!config.parentHub) {
    warnings.push({
      field: 'parentHub',
      message: 'No parent hub specified',
      suggestion: 'Link satellite to its hub for dependency tracking',
    });
  } else if (!PATTERNS.hub.test(config.parentHub)) {
    errors.push({
      code: 'DV_INVALID_NAME',
      field: 'parentHub',
      message: `Parent hub '${config.parentHub}' invalid name`,
      suggestion: `Use format: hub_<entity>`,
    });
  }
  
  // Validate attributes
  if (!config.attributes || config.attributes.length === 0) {
    warnings.push({
      field: 'attributes',
      message: 'No attributes specified',
      suggestion: 'Satellites should contain descriptive attributes',
    });
  }
  
  // Entity consistency check
  const satEntity = config.name.replace('sat_', '');
  const hkEntity = config.hashKey.replace('hk_', '');
  const hdEntity = config.hashDiff.replace('hd_', '');
  
  if (satEntity !== hdEntity) {
    warnings.push({
      field: 'hashDiff',
      message: `Entity mismatch: sat_${satEntity} vs hd_${hdEntity}`,
      suggestion: `Use hd_${satEntity} for consistency`,
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Link Validation
// ============================================================================

export function validateLink(config: {
  name: string;
  hashKey: string;
  hubReferences: Array<{ hub: string; hashKey: string; role?: string }>;
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Validate name
  if (!PATTERNS.link.test(config.name)) {
    errors.push({
      code: 'DV_INVALID_NAME',
      field: 'name',
      message: `Link name '${config.name}' invalid`,
      suggestion: `Use format: link_<entity1>_<entity2>`,
    });
  }
  
  // Validate link hash key
  if (!config.hashKey) {
    errors.push({
      code: 'DV_MISSING_HK',
      field: 'hashKey',
      message: 'Link hash key is required',
      suggestion: `Use format: hk_<entity1>_<entity2>`,
    });
  } else if (!PATTERNS.hashKey.test(config.hashKey)) {
    errors.push({
      code: 'DV_INVALID_HK',
      field: 'hashKey',
      message: `Hash key '${config.hashKey}' invalid`,
      suggestion: `Use format: hk_<link_name>`,
    });
  }
  
  // Validate hub references
  if (!config.hubReferences || config.hubReferences.length < 2) {
    errors.push({
      code: 'DV_MISSING_HK',
      field: 'hubReferences',
      message: 'Links require at least 2 hub references',
      suggestion: 'A link connects two or more hubs',
    });
  } else {
    for (const ref of config.hubReferences) {
      if (!PATTERNS.hub.test(ref.hub)) {
        errors.push({
          code: 'DV_INVALID_NAME',
          field: 'hubReferences',
          message: `Hub reference '${ref.hub}' invalid`,
          suggestion: `Use format: hub_<entity>`,
        });
      }
      if (!PATTERNS.hashKey.test(ref.hashKey)) {
        errors.push({
          code: 'DV_INVALID_HK',
          field: 'hubReferences',
          message: `Hub hash key '${ref.hashKey}' invalid`,
          suggestion: `Use format: hk_<entity>`,
        });
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Staging Validation
// ============================================================================

export function validateStaging(config: {
  name: string;
  source: string;
  columns: string[];
  hashKey?: string;
  hashDiff?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Validate name
  if (!PATTERNS.staging.test(config.name)) {
    errors.push({
      code: 'DV_INVALID_NAME',
      field: 'name',
      message: `Staging name '${config.name}' invalid`,
      suggestion: `Use format: stg_<entity>`,
    });
  }
  
  // Validate source (external table)
  if (!config.source) {
    errors.push({
      code: 'DEP_EXT_MISSING',
      field: 'source',
      message: 'Source (external table) is required',
      suggestion: 'Define external table in sources.yml first',
    });
  } else if (!PATTERNS.external.test(config.source)) {
    warnings.push({
      field: 'source',
      message: `Source '${config.source}' may not follow ext_ convention`,
      suggestion: `Use format: ext_<entity>`,
    });
  }
  
  // Validate columns
  if (!config.columns || config.columns.length === 0) {
    warnings.push({
      field: 'columns',
      message: 'No columns specified',
      suggestion: 'Define columns to select from source',
    });
  }
  
  // Hash key should be generated
  if (config.hashKey && !PATTERNS.hashKey.test(config.hashKey)) {
    errors.push({
      code: 'DV_INVALID_HK',
      field: 'hashKey',
      message: `Hash key '${config.hashKey}' invalid`,
      suggestion: `Use format: hk_<entity>`,
    });
  }
  
  // Hash diff should be generated
  if (config.hashDiff && !PATTERNS.hashDiff.test(config.hashDiff)) {
    errors.push({
      code: 'DV_INVALID_HD',
      field: 'hashDiff',
      message: `Hash diff '${config.hashDiff}' invalid`,
      suggestion: `Use format: hd_<entity>`,
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Formatting Results
// ============================================================================

export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];
  
  if (result.valid && result.warnings.length === 0) {
    lines.push('[OK] Validation passed');
    return lines.join('\n');
  }
  
  if (result.errors.length > 0) {
    lines.push('[ERRORS]');
    for (const err of result.errors) {
      lines.push(`  [${err.code}] ${err.field}: ${err.message}`);
      if (err.suggestion) {
        lines.push(`           → ${err.suggestion}`);
      }
    }
  }
  
  if (result.warnings.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('[WARNINGS]');
    for (const warn of result.warnings) {
      lines.push(`  ${warn.field}: ${warn.message}`);
      if (warn.suggestion) {
        lines.push(`           → ${warn.suggestion}`);
      }
    }
  }
  
  return lines.join('\n');
}
