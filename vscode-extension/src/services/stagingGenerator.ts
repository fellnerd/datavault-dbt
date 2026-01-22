/**
 * Staging Generator Service
 * 
 * Generates dbt staging SQL files with Data Vault 2.0 hash calculations.
 * 
 * Key principle: Staging views contain ONLY the entity's own hash key (hk_<entity>).
 * Foreign key hash keys are calculated in Link models, not here.
 * 
 * Pattern based on models/staging/adventureworks_customer.sql
 */

import { StagingConfig } from '../types';

/**
 * Generate a complete staging SQL file
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
    includeRunId
  } = config;

  // Sort hash diff columns alphabetically for consistent hashing
  const sortedHashDiffColumns = [...hashDiffColumns].sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  const lines: string[] = [];

  // Header comment
  lines.push('/*');
  lines.push(` * Staging Model: ${concept}_${entityName}`);
  lines.push(' *');
  lines.push(` * Source: ${externalTable}`);
  lines.push(` * Business Key: ${businessKeyColumns.join(', ')}`);
  lines.push(` * Hash Key Separator: '${businessKeySeparator}' (DV 2.1 Standard)`);
  lines.push(' */');
  lines.push('');

  // Hash diff columns macro
  lines.push('{%- set hashdiff_columns = [');
  sortedHashDiffColumns.forEach((col, idx) => {
    const comma = idx < sortedHashDiffColumns.length - 1 ? ',' : '';
    lines.push(`    '${col}'${comma}`);
  });
  lines.push('] -%}');
  lines.push('');

  // Source CTE
  lines.push('WITH source AS (');
  lines.push(`    SELECT * FROM {{ source('staging', '${externalTable}') }}`);
  lines.push('),');
  lines.push('');

  // Staged CTE
  lines.push('staged AS (');
  lines.push('    SELECT');
  
  // Hash Keys section
  lines.push('        -- ===========================================');
  lines.push('        -- HASH KEY (Entity)');
  lines.push('        -- ===========================================');
  lines.push('        -- Note: FK hash keys are calculated in Link models, not in staging');
  lines.push(generateHashKey(entityName, businessKeyColumns, businessKeySeparator));
  lines.push('');
  
  // Hash Diff section
  lines.push('        -- ===========================================');
  lines.push('        -- HASH DIFF (Change Detection)');
  lines.push('        -- ===========================================');
  lines.push(generateHashDiff(entityName, hashDiffSeparator));
  lines.push('');
  
  // Business Key section
  lines.push('        -- ===========================================');
  lines.push('        -- BUSINESS KEY(S)');
  lines.push('        -- ===========================================');
  businessKeyColumns.forEach((col, idx) => {
    // Always end with comma (payload follows)
    lines.push(`        ${col},`);
  });
  lines.push('');
  
  // Payload section
  lines.push('        -- ===========================================');
  lines.push('        -- PAYLOAD');
  lines.push('        -- ===========================================');
  payloadColumns.forEach((col) => {
    // Always end with comma (metadata follows)
    lines.push(`        ${col},`);
  });
  lines.push('');
  
  // Metadata section
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
 */
function generateHashDiff(entityName: string, separator: string): string {
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_${entityName},`;
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
