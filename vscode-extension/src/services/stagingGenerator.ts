/**
 * Staging Generator Service
 * 
 * Generates dbt staging SQL files with Data Vault 2.0 hash calculations.
 * 
 * Key principles (aligned with automate_dv best practices):
 * - ALL hash calculations happen in staging, NOT in downstream models
 * - Hash Keys: hk_<entity> for the main entity
 * - FK Hash Keys: hk_<target_entity> for each foreign key relationship
 * - Link Hash Keys: hk_link_<source>_<target> for each link
 * - Hash Diffs: hd_<entity> for regular satellite, hd_<entity>_<target>_dc for DC satellites
 * 
 * This ensures Link and Satellite models only reference pre-calculated hashes
 * from the staging layer - no hash computation in those models.
 * 
 * @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_staging/
 */

import { StagingConfig, ForeignKeyMapping } from '../types';

/**
 * Generate a complete staging SQL file
 * 
 * ALL hash calculations happen here - Link and Satellite models only reference these hashes
 */
export function generateStagingSql(config: StagingConfig): string {
  const {
    concept,
    entityName,
    externalTable,
    businessKeyColumns,
    businessKeySeparator,
    payloadColumns,
    hashDiffColumns,
    hashDiffSeparator,
    foreignKeys,
    recordSourceDefault,
    includeRunId,
    dependentChildKeys,
    multiActiveKeys
  } = config;

  // Sort hash diff columns alphabetically for consistent hashing (automate_dv convention)
  const sortedHashDiffColumns = [...hashDiffColumns].sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  const lines: string[] = [];

  // Header comment
  lines.push('/*');
  lines.push(` * Staging Model: ${concept}_${entityName}`);
  lines.push(' *');
  lines.push(` * Source: ${externalTable}`);
  if (businessKeyColumns.length > 0) {
    lines.push(` * Business Key: ${businessKeyColumns.join(', ')}`);
  }
  lines.push(` * Hash Key Separator: '${businessKeySeparator}' (DV 2.1 Standard)`);
  
  // Document Links/FKs
  if (foreignKeys && foreignKeys.length > 0) {
    lines.push(' *');
    lines.push(' * Links (Foreign Keys):');
    for (const fk of foreignKeys) {
      lines.push(` *   - ${fk.targetHub} via ${fk.sourceColumn}`);
    }
  }
  
  // Document DC if present
  if (dependentChildKeys && Object.keys(dependentChildKeys).length > 0) {
    lines.push(' *');
    lines.push(' * Dependent Child Keys (for DC Satellites):');
    for (const [targetHub, dcks] of Object.entries(dependentChildKeys)) {
      lines.push(` *   - ${targetHub}: ${dcks.join(', ')}`);
    }
  }
  
  // Document MA if present
  if (multiActiveKeys && multiActiveKeys.length > 0) {
    lines.push(' *');
    lines.push(` * Multi-Active Keys (CDK): ${multiActiveKeys.join(', ')}`);
  }
  
  lines.push(' *');
  lines.push(' * Hash Keys calculated here (automate_dv pattern):');
  lines.push(` *   - hk_${entityName} (Entity Hash Key)`);
  for (const fk of foreignKeys || []) {
    const targetEntity = fk.targetHub.replace('hub_', '').replace(/^.*\./, '');
    lines.push(` *   - hk_${targetEntity} (FK Hash Key for ${fk.targetHub})`);
    lines.push(` *   - hk_link_${entityName}_${targetEntity} (Link Hash Key)`);
  }
  lines.push(' */');
  lines.push('');

  // Hash diff columns macro (for regular satellite)
  if (sortedHashDiffColumns.length > 0) {
    lines.push('{%- set hashdiff_columns = [');
    sortedHashDiffColumns.forEach((col, idx) => {
      const comma = idx < sortedHashDiffColumns.length - 1 ? ',' : '';
      lines.push(`    '${col}'${comma}`);
    });
    lines.push('] -%}');
    lines.push('');
  }

  // MA Sat Hash Diff columns (CDK + attributes)
  if (multiActiveKeys && multiActiveKeys.length > 0) {
    const maHashDiffColumns = [...multiActiveKeys, ...sortedHashDiffColumns].sort((a, b) => 
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    lines.push('{%- set hashdiff_ma_columns = [');
    maHashDiffColumns.forEach((col, idx) => {
      const comma = idx < maHashDiffColumns.length - 1 ? ',' : '';
      lines.push(`    '${col}'${comma}`);
    });
    lines.push('] -%}');
    lines.push('');
  }

  // Source CTE
  lines.push('WITH source AS (');
  lines.push(`    SELECT * FROM {{ source('staging', '${externalTable}') }}`);
  lines.push('),');
  lines.push('');

  // Staged CTE
  lines.push('staged AS (');
  lines.push('    SELECT');
  
  // ============================================
  // HASH KEY (Entity) - only if BK exists
  // ============================================
  if (businessKeyColumns.length > 0) {
    lines.push('        -- ===========================================');
    lines.push('        -- HASH KEY (Entity)');
    lines.push('        -- ===========================================');
    lines.push(generateHashKey(entityName, businessKeyColumns, businessKeySeparator));
    lines.push('');
  }
  
  // ============================================
  // FK HASH KEYS (for each foreign key relationship)
  // ============================================
  if (foreignKeys && foreignKeys.length > 0) {
    lines.push('        -- ===========================================');
    lines.push('        -- FK HASH KEYS (for Links)');
    lines.push('        -- ===========================================');
    
    for (const fk of foreignKeys) {
      const targetEntity = fk.targetHub.replace('hub_', '').replace(/^.*\./, '');
      // FK Hash Key = hash of the FK source column(s)
      lines.push(generateHashKey(targetEntity, [fk.sourceColumn], businessKeySeparator));
    }
    lines.push('');
  }
  
  // ============================================
  // LINK HASH KEYS (hk_source + hk_target [+ DCK if present])
  // ============================================
  if (foreignKeys && foreignKeys.length > 0) {
    lines.push('        -- ===========================================');
    lines.push('        -- LINK HASH KEYS');
    lines.push('        -- ===========================================');
    
    for (const fk of foreignKeys) {
      const targetEntity = fk.targetHub.replace('hub_', '').replace(/^.*\./, '');
      const linkName = `link_${entityName}_${targetEntity}`;
      
      // Check if this link has DCKs
      const linkDCKs = dependentChildKeys?.[fk.targetHub] || [];
      
      if (linkDCKs.length > 0) {
        // Link with DCK: hash = source BK + target FK + DCK columns
        lines.push(`        -- Link with DCK: ${linkDCKs.join(', ')}`);
        lines.push(generateLinkHashKeyWithDCK(
          linkName, 
          entityName, 
          targetEntity, 
          businessKeyColumns,
          fk.sourceColumn,
          linkDCKs, 
          businessKeySeparator
        ));
      } else {
        // Standard Link: hash = source BK + target FK
        lines.push(generateLinkHashKey(
          linkName, 
          businessKeyColumns, 
          fk.sourceColumn, 
          businessKeySeparator
        ));
      }
    }
    lines.push('');
  }
  
  // ============================================
  // HASH DIFF (regular satellite) - only if we have attributes
  // ============================================
  if (sortedHashDiffColumns.length > 0) {
    lines.push('        -- ===========================================');
    lines.push('        -- HASH DIFF (Change Detection - Satellite)');
    lines.push('        -- ===========================================');
    lines.push(generateHashDiff(entityName, hashDiffSeparator));
    lines.push('');
  }
  
  // ============================================
  // DC SATELLITE HASH DIFFS (DCK + attributes)
  // ============================================
  if (dependentChildKeys && Object.keys(dependentChildKeys).length > 0) {
    lines.push('        -- ===========================================');
    lines.push('        -- HASH DIFF (DC Satellites)');
    lines.push('        -- ===========================================');
    
    for (const [targetHub, dcks] of Object.entries(dependentChildKeys)) {
      const targetEntity = targetHub.replace('hub_', '').replace(/^.*\./, '');
      const dcSatName = `${entityName}_${targetEntity}_dc`;
      // DC Sat hash diff = DCK + regular attributes (alphabetically sorted)
      const dcHashDiffColumns = [...dcks, ...sortedHashDiffColumns].sort((a, b) => 
        a.toLowerCase().localeCompare(b.toLowerCase())
      );
      lines.push(generateHashDiffForDC(dcSatName, dcHashDiffColumns, hashDiffSeparator));
    }
    lines.push('');
  }
  
  // ============================================
  // MA SATELLITE HASH DIFF
  // ============================================
  if (multiActiveKeys && multiActiveKeys.length > 0) {
    lines.push('        -- ===========================================');
    lines.push('        -- HASH DIFF (MA Satellite)');
    lines.push('        -- ===========================================');
    lines.push(generateHashDiffMA(entityName, hashDiffSeparator));
    lines.push('');
  }
  
  // ============================================
  // BUSINESS KEY(S)
  // ============================================
  if (businessKeyColumns.length > 0) {
    lines.push('        -- ===========================================');
    lines.push('        -- BUSINESS KEY(S)');
    lines.push('        -- ===========================================');
    businessKeyColumns.forEach((col) => {
      lines.push(`        ${col},`);
    });
    lines.push('');
  }
  
  // ============================================
  // PAYLOAD
  // ============================================
  lines.push('        -- ===========================================');
  lines.push('        -- PAYLOAD');
  lines.push('        -- ===========================================');
  payloadColumns.forEach((col) => {
    lines.push(`        ${col},`);
  });
  lines.push('');
  
  // ============================================
  // METADATA
  // ============================================
  lines.push('        -- ===========================================');
  lines.push('        -- METADATA');
  lines.push('        -- ===========================================');
  lines.push(`        COALESCE(dss_record_source, '${recordSourceDefault}') AS dss_record_source,`);
  lines.push('        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date' + (includeRunId ? ',' : ''));
  if (includeRunId) {
    lines.push('        dss_run_id');
  }
  lines.push('');
  lines.push('    FROM source');
  lines.push(')');
  lines.push('');
  lines.push('SELECT * FROM staged');

  return lines.join('\n');
}

/**
 * Generate hash key calculation for the main entity
 */
function generateHashKey(
  entityName: string, 
  businessKeyColumns: string[], 
  separator: string
): string {
  if (businessKeyColumns.length === 1) {
    // Single column - simple hash
    return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(${businessKeyColumns[0]} AS NVARCHAR(MAX)), '')
        ), 2) AS hk_${entityName},`;
  }
  
  // Multiple columns - composite hash with separator
  const concatParts = businessKeyColumns.map(col => 
    `ISNULL(CAST(${col} AS NVARCHAR(MAX)), '')`
  ).join(`,\n                '${separator}',\n                `);
  
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ${concatParts}
            )
        ), 2) AS hk_${entityName},`;
}

/**
 * Generate hash diff calculation using Jinja loop
 * Note: CONCAT() in SQL Server requires at least 2 arguments
 */
function generateHashDiff(entityName: string, separator: string): string {
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
                {%- if hashdiff_columns | length == 1 %}, ''{%- endif %}
            )
        ), 2) AS hd_${entityName},`;
}

/**
 * Generate Link Hash Key (standard link without DCK)
 * 
 * Link Hash = HASH(source BK columns + target FK column)
 */
function generateLinkHashKey(
  linkName: string,
  sourceBKColumns: string[],
  targetFKColumn: string,
  separator: string
): string {
  // Combine source BK + target FK for link hash
  const allColumns = [...sourceBKColumns, targetFKColumn];
  const concatParts = allColumns.map(col => 
    `ISNULL(CAST(${col} AS NVARCHAR(MAX)), '')`
  ).join(`,\n                '${separator}',\n                `);
  
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ${concatParts}
            )
        ), 2) AS hk_${linkName},`;
}

/**
 * Generate Link Hash Key WITH DCK columns for DC Satellites
 * 
 * Link Hash = HASH(source BK columns + target FK column + DCK columns)
 * This ensures uniqueness at the line-item level for dependent children
 */
function generateLinkHashKeyWithDCK(
  linkName: string,
  sourceEntity: string,
  targetEntity: string,
  sourceBKColumns: string[],
  targetFKColumn: string,
  dckColumns: string[],
  separator: string
): string {
  // Combine source BK + target FK + DCK for DC link hash
  const allColumns = [...sourceBKColumns, targetFKColumn, ...dckColumns];
  const concatParts = allColumns.map(col => 
    `ISNULL(CAST(${col} AS NVARCHAR(MAX)), '')`
  ).join(`,\n                '${separator}',\n                `);
  
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ${concatParts}
            )
        ), 2) AS hk_${linkName},`;
}

/**
 * Generate Hash Diff for DC Satellite (DCK + attributes)
 * Note: CONCAT() in SQL Server requires at least 2 arguments
 */
function generateHashDiffForDC(
  dcSatName: string,
  columns: string[],
  separator: string
): string {
  const concatParts = columns.map(col => 
    `ISNULL(CAST(${col} AS NVARCHAR(MAX)), '')`
  ).join(`,\n                '${separator}',\n                `);
  
  // SQL Server CONCAT requires at least 2 args - add empty string if only 1 column
  const fallback = columns.length === 1 ? `,\n                ''` : '';
  
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ${concatParts}${fallback}
            )
        ), 2) AS hd_${dcSatName},`;
}

/**
 * Generate Hash Diff for MA Satellite using Jinja loop
 * Note: CONCAT() in SQL Server requires at least 2 arguments
 */
function generateHashDiffMA(entityName: string, separator: string): string {
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_ma_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
                {%- if hashdiff_ma_columns | length == 1 %}, ''{%- endif %}
            )
        ), 2) AS hd_${entityName}_ma,`;
}

/**
 * Extract entity name and concept from external table name
 * Pattern: ext_<concept>_<entity>
 */
export function parseExternalTableName(tableName: string): { concept: string; entityName: string } | null {
  const match = tableName.match(/^ext_([^_]+)_(.+)$/i);
  if (match) {
    return {
      concept: match[1].toLowerCase(),
      entityName: match[2].toLowerCase()
    };
  }
  return null;
}

/**
 * Get default staging configuration from external table
 */
export function getDefaultStagingConfig(
  externalTableName: string,
  columns: string[],
  settings: {
    businessKeySeparator: string;
    hashDiffSeparator: string;
  }
): Partial<StagingConfig> {
  const parsed = parseExternalTableName(externalTableName);
  if (!parsed) {
    return {};
  }

  const { concept, entityName } = parsed;
  
  // Filter out metadata columns from payload
  const metadataColumns = ['dss_record_source', 'dss_load_date', 'dss_run_id'];
  const payloadColumns = columns.filter(col => !metadataColumns.includes(col.toLowerCase()));
  
  return {
    concept,
    entityName,
    externalTable: externalTableName,
    businessKeySeparator: settings.businessKeySeparator,
    hashDiffSeparator: settings.hashDiffSeparator,
    payloadColumns,
    hashDiffColumns: payloadColumns, // Default: all payload columns
    foreignKeys: [], // FK relationships are defined in Link models (DV 2.0)
    recordSourceDefault: concept,
    includeRunId: columns.some(c => c.toLowerCase() === 'dss_run_id')
  };
}
