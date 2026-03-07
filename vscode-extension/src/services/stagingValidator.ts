/**
 * Staging Validator Service
 * 
 * Validates staging configurations and SQL files for Data Vault compliance.
 */

import { StagingConfig, StagingValidationResult } from '../types';

/**
 * Validate a staging configuration before generation
 */
export function validateStagingConfig(config: StagingConfig): StagingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!config.concept || config.concept.trim() === '') {
    errors.push('Concept name is required');
  }
  
  if (!config.entityName || config.entityName.trim() === '') {
    errors.push('Entity name is required');
  }
  
  if (!config.externalTable || config.externalTable.trim() === '') {
    errors.push('External table name is required');
  }

  // Business Key validation
  // Note: Business keys CAN be empty for Pure Dependent Child entities
  // These entities are identified only by their relationship (FK + DCK) to a parent hub
  if (!config.businessKeyColumns || config.businessKeyColumns.length === 0) {
    // This is now a warning, not an error - Pure DC entities don't have BKs
    warnings.push('No business key columns - entity will be a Pure Dependent Child (requires Link + DCK in Entity Designer)');
  } else {
    // Check for duplicates
    const uniqueBk = new Set(config.businessKeyColumns.map(c => c.toLowerCase()));
    if (uniqueBk.size !== config.businessKeyColumns.length) {
      errors.push('Business key columns contain duplicates');
    }
  }

  // Payload validation
  if (!config.payloadColumns || config.payloadColumns.length === 0) {
    warnings.push('No payload columns selected - hash diff will be empty');
  }

  // FK validation
  if (config.foreignKeys && config.foreignKeys.length > 0) {
    const fkTargets = new Set<string>();
    for (const fk of config.foreignKeys) {
      if (!fk.sourceColumn) {
        errors.push('Foreign key mapping missing source column');
      }
      if (!fk.targetEntity) {
        errors.push('Foreign key mapping missing target entity');
      }
      
      // Check for duplicate FK targets
      if (fkTargets.has(fk.targetEntity.toLowerCase())) {
        warnings.push(`Multiple foreign keys pointing to same entity: ${fk.targetEntity}`);
      }
      fkTargets.add(fk.targetEntity.toLowerCase());
    }
  }

  // Naming convention checks
  if (config.entityName && !/^[a-z][a-z0-9_]*$/i.test(config.entityName)) {
    warnings.push('Entity name should follow snake_case convention');
  }

  if (config.concept && !/^[a-z][a-z0-9_]*$/i.test(config.concept)) {
    warnings.push('Concept name should follow snake_case convention');
  }

  // Separator validation
  if (!config.businessKeySeparator) {
    warnings.push('Business key separator not set, using default ^^');
  }

  if (!config.hashDiffSeparator) {
    warnings.push('Hash diff separator not set, using default ||');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate existing staging SQL content
 */
export function validateStagingSql(sqlContent: string): StagingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required sections
  const requiredPatterns = [
    { pattern: /hk_\w+/, message: 'Missing hash key (hk_*) column' },
    { pattern: /hd_\w+/, message: 'Missing hash diff (hd_*) column' },
    { pattern: /dss_record_source/, message: 'Missing dss_record_source metadata column' },
    { pattern: /dss_load_date/, message: 'Missing dss_load_date metadata column' },
    { pattern: /source\s*\(\s*['"]staging['"]/, message: 'Source should reference staging schema' },
    { pattern: /HASHBYTES\s*\(\s*['"]SHA2_256['"]/, message: 'Should use SHA2_256 for hashing' }
  ];

  for (const { pattern, message } of requiredPatterns) {
    if (!pattern.test(sqlContent)) {
      warnings.push(message);
    }
  }

  // Check for anti-patterns
  if (/HASHBYTES\s*\(\s*['"]MD5['"]/.test(sqlContent)) {
    warnings.push('MD5 is deprecated for Data Vault - use SHA2_256');
  }

  if (/SELECT\s+\*\s+FROM\s+source/i.test(sqlContent) && !/WITH\s+source\s+AS/i.test(sqlContent)) {
    warnings.push('Consider using explicit column selection instead of SELECT *');
  }

  // Check for metadata handling
  if (!/COALESCE.*dss_record_source/i.test(sqlContent)) {
    warnings.push('dss_record_source should use COALESCE for default value');
  }

  if (!/COALESCE.*dss_load_date/i.test(sqlContent)) {
    warnings.push('dss_load_date should use COALESCE for default value');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Parse staging SQL to extract configuration
 * Used for updateStaging to detect current state
 */
export function parseStagingSql(sqlContent: string): Partial<StagingConfig> | null {
  try {
    const config: Partial<StagingConfig> = {};

    // Extract entity name from hash key
    const hkMatch = sqlContent.match(/AS\s+hk_(\w+)/i);
    if (hkMatch) {
      config.entityName = hkMatch[1];
    }

    // Extract external table from source
    const sourceMatch = sqlContent.match(/source\s*\(\s*['"]staging['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
    if (sourceMatch) {
      config.externalTable = sourceMatch[1];
      
      // Parse concept from table name
      const tableMatch = sourceMatch[1].match(/^ext_([^_]+)_/i);
      if (tableMatch) {
        config.concept = tableMatch[1];
      }
    }

    // Extract hashdiff columns from Jinja set
    const hashdiffMatch = sqlContent.match(/set\s+hashdiff_columns\s*=\s*\[([\s\S]*?)\]/i);
    if (hashdiffMatch) {
      const columnsStr = hashdiffMatch[1];
      const columns = columnsStr.match(/'([^']+)'/g);
      if (columns) {
        config.payloadColumns = columns.map(c => c.replace(/'/g, ''));
      }
    }

    // Extract record source default
    const recordSourceMatch = sqlContent.match(/COALESCE\s*\(\s*dss_record_source\s*,\s*['"]([^'"]+)['"]\s*\)/i);
    if (recordSourceMatch) {
      config.recordSourceDefault = recordSourceMatch[1];
    }

    // Check for dss_run_id
    config.includeRunId = /dss_run_id/i.test(sqlContent);

    // Extract FK hash keys
    const fkMatches = sqlContent.matchAll(/AS\s+hk_(\w+),/gi);
    const foreignKeys: { targetEntity: string }[] = [];
    for (const match of fkMatches) {
      if (match[1] !== config.entityName) {
        foreignKeys.push({ targetEntity: match[1] });
      }
    }
    
    if (foreignKeys.length > 0) {
      config.foreignKeys = foreignKeys.map(fk => ({
        sourceColumn: '', // Cannot determine from SQL alone
        targetEntity: fk.targetEntity,
        targetHub: `hub_${fk.targetEntity}`,
        autoDetected: false
      }));
    }

    return config;
  } catch {
    return null;
  }
}
