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
 * SQL Server reserved keywords that must be escaped with square brackets.
 * @see https://learn.microsoft.com/en-us/sql/t-sql/language-elements/reserved-keywords-transact-sql
 */
const SQL_RESERVED_KEYWORDS = new Set([
  'ADD', 'ALL', 'ALTER', 'AND', 'ANY', 'AS', 'ASC', 'AUTHORIZATION', 'BACKUP', 'BEGIN',
  'BETWEEN', 'BREAK', 'BROWSE', 'BULK', 'BY', 'CASCADE', 'CASE', 'CHECK', 'CHECKPOINT',
  'CLOSE', 'CLUSTERED', 'COALESCE', 'COLLATE', 'COLUMN', 'COMMIT', 'COMPUTE', 'CONSTRAINT',
  'CONTAINS', 'CONTAINSTABLE', 'CONTINUE', 'CONVERT', 'CREATE', 'CROSS', 'CURRENT',
  'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'CURRENT_USER', 'CURSOR', 'DATABASE',
  'DBCC', 'DEALLOCATE', 'DECLARE', 'DEFAULT', 'DELETE', 'DENY', 'DESC', 'DISK', 'DISTINCT',
  'DISTRIBUTED', 'DOUBLE', 'DROP', 'DUMP', 'ELSE', 'END', 'ERRLVL', 'ESCAPE', 'EXCEPT',
  'EXEC', 'EXECUTE', 'EXISTS', 'EXIT', 'EXTERNAL', 'FETCH', 'FILE', 'FILLFACTOR', 'FOR',
  'FOREIGN', 'FREETEXT', 'FREETEXTTABLE', 'FROM', 'FULL', 'FUNCTION', 'GOTO', 'GRANT',
  'GROUP', 'HAVING', 'HOLDLOCK', 'IDENTITY', 'IDENTITY_INSERT', 'IDENTITYCOL', 'IF', 'IN',
  'INDEX', 'INNER', 'INSERT', 'INTERSECT', 'INTO', 'IS', 'JOIN', 'KEY', 'KILL', 'LEFT',
  'LEVEL', 'LIKE', 'LINENO', 'LOAD', 'MERGE', 'NATIONAL', 'NOCHECK', 'NONCLUSTERED', 'NOT',
  'NULL', 'NULLIF', 'OF', 'OFF', 'OFFSETS', 'ON', 'OPEN', 'OPENDATASOURCE', 'OPENQUERY',
  'OPENROWSET', 'OPENXML', 'OPTION', 'OR', 'ORDER', 'OUTER', 'OVER', 'PERCENT', 'PIVOT',
  'PLAN', 'PRECISION', 'PRIMARY', 'PRINT', 'PROC', 'PROCEDURE', 'PUBLIC', 'RAISERROR',
  'READ', 'READTEXT', 'RECONFIGURE', 'REFERENCES', 'REPLICATION', 'RESTORE', 'RESTRICT',
  'RETURN', 'REVERT', 'REVOKE', 'RIGHT', 'RIGHTS', 'ROLLBACK', 'ROWCOUNT', 'ROWGUIDCOL',
  'RULE', 'SAVE', 'SCHEMA', 'SECURITYAUDIT', 'SELECT', 'SEMANTICKEYPHRASETABLE',
  'SEMANTICSIMILARITYDETAILSTABLE', 'SEMANTICSIMILARITYTABLE', 'SESSION_USER', 'SET',
  'SETUSER', 'SHUTDOWN', 'SOME', 'STATISTICS', 'STATUS', 'SYSTEM_USER', 'TABLE', 'TABLESAMPLE',
  'TEXTSIZE', 'THEN', 'TO', 'TOP', 'TRAN', 'TRANSACTION', 'TRIGGER', 'TRUNCATE',
  'TRY_CONVERT', 'TSEQUAL', 'TYPE', 'UNION', 'UNIQUE', 'UNPIVOT', 'UPDATE', 'UPDATETEXT',
  'USE', 'USER', 'VALUE', 'VALUES', 'VARYING', 'VIEW', 'WAITFOR', 'WHEN', 'WHERE', 'WHILE',
  'WITH', 'WITHIN', 'WRITETEXT',
  // Additional keywords common in Abacus data
  'AFTER', 'BEFORE', 'ROLE', 'STATE', 'ZONE'
]);

/**
 * Escape a column name with square brackets if it's a SQL Server reserved keyword
 * or contains special characters (hyphens, spaces, etc.)
 */
export function escapeColumnName(name: string): string {
  // Already escaped
  if (name.startsWith('[') && name.endsWith(']')) {
    return name;
  }
  // Needs escaping: reserved keyword or contains special characters
  if (SQL_RESERVED_KEYWORDS.has(name.toUpperCase()) || /[^a-zA-Z0-9_]/.test(name)) {
    return `[${name}]`;
  }
  return name;
}

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
    columnMappings = {},  // Default empty if not provided
    hashDiffColumns,
    hashDiffSeparator,
    foreignKeys,
    recordSourceDefault,
    includeRunId,
    dependentChildKeys,
    multiActiveKeys,
    isPureLinkEntity,
    isPureDependentChild,
    splitSatelliteTargetHub
  } = config;

  // Helper to get the source column name for a target column
  // If there's a mapping, use it; otherwise source = target
  const getSourceColumn = (targetCol: string): string => {
    // Check if there's a reverse mapping (source -> target where target matches)
    for (const [source, target] of Object.entries(columnMappings)) {
      if (target.toLowerCase() === targetCol.toLowerCase()) {
        return source;
      }
    }
    return targetCol;  // No mapping, source = target
  };

  // Sort hash diff columns alphabetically for consistent hashing (automate_dv convention)
  const sortedHashDiffColumns = [...hashDiffColumns].sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  
  // For Split-Satellites: Extract target entity name from hub name
  // e.g., "hub_product" → "product", "adventureworks.hub_product" → "product"
  const splitSatelliteTargetEntity = splitSatelliteTargetHub 
    ? splitSatelliteTargetHub.replace('hub_', '').replace(/^.*\./, '')
    : undefined;

  const lines: string[] = [];

  // Header comment — use derived staging name (matches filename)
  const stagingModelName = deriveStagingName(externalTable);
  lines.push('/*');
  lines.push(` * Staging Model: ${stagingModelName}`);
  lines.push(' *');
  lines.push(` * Source: ${externalTable}`);
  if (businessKeyColumns.length > 0) {
    lines.push(` * Business Key: ${businessKeyColumns.join(', ')}`);
  }
  if (splitSatelliteTargetHub) {
    lines.push(` * Split-Satellite Target: ${splitSatelliteTargetHub}`);
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
  if (isPureLinkEntity && foreignKeys && foreignKeys.length >= 2) {
    // Pure Link Entity: Combined link hash key
    const targetEntities = foreignKeys.map(fk => fk.targetHub.replace('hub_', '').replace(/^.*\./, ''));
    const linkName = targetEntities.join('_');
    lines.push(` *   - hk_link_${linkName} (Combined Link Hash Key)`);
    for (const fk of foreignKeys) {
      const targetEntity = fk.targetHub.replace('hub_', '').replace(/^.*\./, '');
      lines.push(` *   - hk_${targetEntity} (FK Hash Key for ${fk.targetHub})`);
    }
    lines.push(` *   - hd_${linkName} (Link Satellite Hash Diff)`);
  } else if (splitSatelliteTargetEntity) {
    // Split-Satellite: Use target hub's hash key name
    lines.push(` *   - hk_${splitSatelliteTargetEntity} (Split-Satellite Hash Key - points to ${splitSatelliteTargetHub})`);
    for (const fk of foreignKeys || []) {
      const targetEntity = fk.targetHub.replace('hub_', '').replace(/^.*\./, '');
      lines.push(` *   - hk_${targetEntity} (FK Hash Key for ${fk.targetHub})`);
      lines.push(` *   - hk_link_${splitSatelliteTargetEntity}_${targetEntity} (Link Hash Key)`);
    }
  } else {
    lines.push(` *   - hk_${entityName} (Entity Hash Key)`);
    
    // Count FKs per target for suffix generation in header
    const fkCountByTargetHeader: Record<string, number> = {};
    const fkIndexByTargetHeader: Record<string, number> = {};
    for (const fk of foreignKeys || []) {
      fkCountByTargetHeader[fk.targetHub] = (fkCountByTargetHeader[fk.targetHub] || 0) + 1;
    }
    
    for (const fk of foreignKeys || []) {
      const targetEntity = fk.targetHub.replace('hub_', '').replace(/^.*\./, '');
      
      // Determine numeric suffix if multiple FKs point to same target
      let suffix = '';
      if (fkCountByTargetHeader[fk.targetHub] > 1) {
        if (fkIndexByTargetHeader[fk.targetHub] === undefined) {
          fkIndexByTargetHeader[fk.targetHub] = 0;
        }
        const idx = fkIndexByTargetHeader[fk.targetHub]++;
        suffix = `_${idx + 1}`;
      }
      
      lines.push(` *   - hk_${targetEntity}${suffix} (FK Hash Key for ${fk.targetHub} via ${fk.sourceColumn})`);
      lines.push(` *   - hk_link_${entityName}_${targetEntity}${suffix} (Link Hash Key)`);
    }
  }
  lines.push(' */');
  lines.push('');

  // Hash diff columns macro (for regular satellite)
  if (sortedHashDiffColumns.length > 0) {
    lines.push('{%- set hashdiff_columns = [');
    sortedHashDiffColumns.forEach((col, idx) => {
      const comma = idx < sortedHashDiffColumns.length - 1 ? ',' : '';
      const escaped = escapeColumnName(col);
      lines.push(`    '${escaped}'${comma}`);
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
      const escaped = escapeColumnName(col);
      lines.push(`    '${escaped}'${comma}`);
    });
    lines.push('] -%}');
    lines.push('');
  }

  // Source CTE - handle different source types
  lines.push('WITH source AS (');
  const sourceType = config.sourceType || 'external_table';
  if (sourceType === 'seed') {
    // Seeds use ref() and need generated metadata columns
    lines.push('    SELECT ');
    lines.push('        *,');
    lines.push(`        '${recordSourceDefault}' AS dss_record_source,`);
    lines.push('        GETDATE() AS dss_load_date');
    lines.push(`    FROM {{ ref('${externalTable}') }}`);
  } else if (sourceType === 'database_table') {
    // PSA tables use ref() - psaModelName is passed in config for PSA sources
    const psaModelName = config.psaModelName || `psa_${externalTable}`;
    lines.push(`    SELECT * FROM {{ ref('${psaModelName}') }}`);
  } else {
    // Default: external_table
    lines.push(`    SELECT * FROM {{ source('staging', '${externalTable}') }}`);
  }
  lines.push('),');
  lines.push('');

  // Staged CTE
  lines.push('staged AS (');
  lines.push('    SELECT');
  
  // ============================================
  // HASH KEY (Entity) - only if BK exists AND not a Pure Link Entity
  // Pure Link Entities have no own Hub, so no entity hash key
  // Split-Satellites use the target hub's hash key name (hk_<targetEntity>)
  // ============================================
  if (businessKeyColumns.length > 0 && !isPureLinkEntity) {
    lines.push('        -- ===========================================');
    lines.push('        -- HASH KEY (Entity)');
    lines.push('        -- ===========================================');
    // For Split-Satellite: use target hub's entity name for hash key (e.g., hk_product)
    // This ensures the satellite references the existing hub's hash key
    const hashKeyEntity = splitSatelliteTargetEntity || entityName;
    lines.push(generateHashKey(hashKeyEntity, businessKeyColumns, businessKeySeparator));
    lines.push('');
  }
  
  // ============================================
  // FK HASH KEYS (for each foreign key relationship)
  // ============================================
  if (foreignKeys && foreignKeys.length > 0) {
    lines.push('        -- ===========================================');
    lines.push('        -- FK HASH KEYS (for Links)');
    lines.push('        -- ===========================================');
    
    // Count FKs per target hub to detect duplicates (e.g., ShipToAddressID + BillToAddressID → same hub)
    const fkCountByTarget: Record<string, number> = {};
    const fkIndexByTarget: Record<string, number> = {};
    for (const fk of foreignKeys) {
      fkCountByTarget[fk.targetHub] = (fkCountByTarget[fk.targetHub] || 0) + 1;
    }
    
    for (const fk of foreignKeys) {
      const targetEntity = fk.targetHub.replace('hub_', '').replace(/^.*\./, '');
      
      // Determine numeric suffix if multiple FKs point to same target
      let fkSuffix = '';
      if (fkCountByTarget[fk.targetHub] > 1) {
        // Initialize index tracker if needed
        if (fkIndexByTarget[fk.targetHub] === undefined) {
          fkIndexByTarget[fk.targetHub] = 0;
        }
        const idx = fkIndexByTarget[fk.targetHub]++;
        fkSuffix = `_${idx + 1}`;
      }
      
      // FK Hash Key = hash of the FK source column(s)
      lines.push(generateHashKeyWithSuffix(targetEntity, [fk.sourceColumn], businessKeySeparator, fkSuffix));
    }
    lines.push('');
  }
  
  // ============================================
  // LINK HASH KEYS
  // Pure Link Entity: ONE combined hash from all FK columns
  // Pure DC (multiple FKs): ONE combined hash from all FKs + DCK
  // Standard: One link hash per FK (hk_source + hk_target)
  // ============================================
  if (foreignKeys && foreignKeys.length > 0) {
    lines.push('        -- ===========================================');
    lines.push('        -- LINK HASH KEYS');
    lines.push('        -- ===========================================');
    
    if (isPureLinkEntity) {
      // Pure Link Entity: Combined link hash key from ALL FK columns
      const targetEntities = foreignKeys.map(fk => fk.targetHub.replace('hub_', '').replace(/^.*\./, ''));
      const linkName = `link_${targetEntities.join('_')}`;
      const fkColumns = foreignKeys.map(fk => fk.sourceColumn);
      lines.push(`        -- Pure Link Entity: Combined hash from all FKs`);
      lines.push(generatePureLinkHashKey(linkName, fkColumns, businessKeySeparator));
    } else if (isPureDependentChild && foreignKeys.length >= 2 && dependentChildKeys) {
      // Pure DC with multiple FKs: ONE combined link hash from all FKs + DCK columns
      const linkName = `link_${entityName}`;
      const fkColumns = foreignKeys.map(fk => fk.sourceColumn);
      // Collect all DCK columns (from all target hubs)
      const allDCKs = Object.values(dependentChildKeys).flat();
      lines.push(`        -- DC Link: Combined hash from all FKs + DCK columns`);
      lines.push(generateDCLinkHashKey(linkName, fkColumns, allDCKs, businessKeySeparator));
    } else {
      // Standard: One link hash per FK
      // First, count FKs per target hub to detect duplicates
      const fkCountByTarget: Record<string, number> = {};
      const fkIndexByTargetForLinks: Record<string, number> = {};
      for (const fk of foreignKeys) {
        fkCountByTarget[fk.targetHub] = (fkCountByTarget[fk.targetHub] || 0) + 1;
      }
      
      for (const fk of foreignKeys) {
        const targetEntity = fk.targetHub.replace('hub_', '').replace(/^.*\./, '');
        
        // Determine numeric suffix if multiple FKs point to same target
        let linkSuffix = '';
        if (fkCountByTarget[fk.targetHub] > 1) {
          // Initialize index tracker if needed
          if (fkIndexByTargetForLinks[fk.targetHub] === undefined) {
            fkIndexByTargetForLinks[fk.targetHub] = 0;
          }
          const idx = fkIndexByTargetForLinks[fk.targetHub]++;
          linkSuffix = `_${idx + 1}`;
        }
        
        const linkName = `link_${entityName}_${targetEntity}${linkSuffix}`;
        
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
    }
    lines.push('');
  }
  
  // ============================================
  // HASH DIFF (regular satellite OR link satellite for Pure Link Entity)
  // ============================================
  if (sortedHashDiffColumns.length > 0) {
    if (isPureLinkEntity) {
      // Link Satellite Hash Diff for Pure Link Entity
      const targetEntities = foreignKeys?.map(fk => fk.targetHub.replace('hub_', '').replace(/^.*\./, '')) || [];
      const linkSatName = targetEntities.join('_');
      lines.push('        -- ===========================================');
      lines.push('        -- HASH DIFF (Change Detection - Link Satellite)');
      lines.push('        -- ===========================================');
      lines.push(generateHashDiffForLinkSat(linkSatName, sortedHashDiffColumns, hashDiffSeparator));
    } else if (!isPureDependentChild) {
      // Standard Satellite (skip if Pure DC - will be handled in DC section)
      lines.push('        -- ===========================================');
      lines.push('        -- HASH DIFF (Change Detection - Satellite)');
      lines.push('        -- ===========================================');
      lines.push(generateHashDiff(entityName, hashDiffSeparator));
    }
    lines.push('');
  }
  
  // ============================================
  // DC SATELLITE HASH DIFFS (DCK + attributes)
  // ============================================
  if (dependentChildKeys && Object.keys(dependentChildKeys).length > 0) {
    lines.push('        -- ===========================================');
    lines.push('        -- HASH DIFF (DC Satellites)');
    lines.push('        -- ===========================================');
    
    if (isPureDependentChild && foreignKeys && foreignKeys.length >= 2) {
      // Pure DC with multiple FKs: ONE combined DC Sat hash diff
      const dcSatName = `${entityName}_dc`;
      // Collect all DCK columns
      const allDCKs = Object.values(dependentChildKeys).flat();
      // DC Sat hash diff = DCK + payload (deduplicated and alphabetically sorted)
      const allColumns = [...allDCKs, ...sortedHashDiffColumns];
      const uniqueColumns = [...new Set(allColumns)]; // Remove duplicates
      const dcHashDiffColumns = uniqueColumns.sort((a, b) => 
        a.toLowerCase().localeCompare(b.toLowerCase())
      );
      lines.push(generateHashDiffForDC(dcSatName, dcHashDiffColumns, hashDiffSeparator));
    } else {
      // Standard DC: One DC Sat per target hub
      for (const [targetHub, dcks] of Object.entries(dependentChildKeys)) {
        const targetEntity = targetHub.replace('hub_', '').replace(/^.*\./, '');
        const dcSatName = `${entityName}_${targetEntity}_dc`;
        // DC Sat hash diff = DCK + payload (deduplicated and alphabetically sorted)
        const allColumns = [...dcks, ...sortedHashDiffColumns];
        const uniqueColumns = [...new Set(allColumns)]; // Remove duplicates
        const dcHashDiffColumns = uniqueColumns.sort((a, b) => 
          a.toLowerCase().localeCompare(b.toLowerCase())
        );
        lines.push(generateHashDiffForDC(dcSatName, dcHashDiffColumns, hashDiffSeparator));
      }
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
      lines.push(`        ${escapeColumnName(col)},`);
    });
    lines.push('');
  }
  
  // ============================================
  // PAYLOAD
  // ============================================
  lines.push('        -- ===========================================');
  lines.push('        -- PAYLOAD');
  lines.push('        -- ===========================================');
  payloadColumns.forEach((targetCol) => {
    const sourceCol = getSourceColumn(targetCol);
    const escapedTarget = escapeColumnName(targetCol);
    const escapedSource = escapeColumnName(sourceCol);
    if (sourceCol.toLowerCase() !== targetCol.toLowerCase()) {
      // Source differs from target - need AS alias
      lines.push(`        ${escapedSource} AS ${escapedTarget},`);
    } else {
      lines.push(`        ${escapedTarget},`);
    }
  });
  lines.push('');
  
  // ============================================
  // METADATA
  // ============================================
  lines.push('        -- ===========================================');
  lines.push('        -- METADATA');
  lines.push('        -- ===========================================');
  if (sourceType === 'seed') {
    // Seeds: metadata already added in source CTE
    lines.push('        dss_record_source,');
    lines.push('        dss_load_date' + (includeRunId ? ',' : ''));
  } else {
    // External tables / database tables: use COALESCE for optional metadata columns
    lines.push(`        COALESCE(dss_record_source, '${recordSourceDefault}') AS dss_record_source,`);
    lines.push('        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date' + (includeRunId ? ',' : ''));
  }
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
  return generateHashKeyWithSuffix(entityName, businessKeyColumns, separator, '');
}

/**
 * Generate hash key calculation with optional suffix
 * Used for multiple FKs pointing to the same hub (e.g., hk_adresse_1, hk_adresse_2)
 */
function generateHashKeyWithSuffix(
  entityName: string, 
  businessKeyColumns: string[], 
  separator: string,
  suffix: string
): string {
  const hashKeyName = `hk_${entityName}${suffix}`;
  
  if (businessKeyColumns.length === 1) {
    // Single column - simple hash
    const escapedCol = escapeColumnName(businessKeyColumns[0]);
    return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(${escapedCol} AS NVARCHAR(MAX)), '')
        ), 2) AS ${hashKeyName},`;
  }
  
  // Multiple columns - composite hash with separator
  const concatParts = businessKeyColumns.map(col => 
    `ISNULL(CAST(${escapeColumnName(col)} AS NVARCHAR(MAX)), '')`
  ).join(`,\n                '${separator}',\n                `);
  
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ${concatParts}
            )
        ), 2) AS ${hashKeyName},`;
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
    `ISNULL(CAST(${escapeColumnName(col)} AS NVARCHAR(MAX)), '')`
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
 * For DC pattern: Link Hash = HASH(FK column + DCK columns)
 * The FK identifies the parent, DCK columns identify the child within the parent
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
  const allColumns = [targetFKColumn, ...dckColumns];
  const concatParts = allColumns.map(col => 
    `ISNULL(CAST(${escapeColumnName(col)} AS NVARCHAR(MAX)), '')`
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
    `ISNULL(CAST(${escapeColumnName(col)} AS NVARCHAR(MAX)), '')`
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
 * Generate Pure Link Hash Key for Intersection/Bridge Tables
 * Hash of all FK columns combined
 * Pattern: hk_link_<entity1>_<entity2> = HASH(fk1 ^^ fk2)
 */
function generatePureLinkHashKey(
  linkName: string, 
  fkColumns: string[], 
  separator: string
): string {
  // Sort FK columns alphabetically for consistent hashing
  const sortedFkColumns = [...fkColumns].sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  
  const parts = sortedFkColumns.map(col => `ISNULL(CAST(${escapeColumnName(col)} AS NVARCHAR(MAX)), '')`);
  const concatExpr = parts.join(` + '${separator}' + `);
  
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', ${concatExpr}), 2) AS hk_${linkName},`;
}

/**
 * Generate DC Link Hash Key for Dependent Child with multiple FKs
 * Hash of all FK columns + DCK columns combined
 * Pattern: hk_link_<entity> = HASH(fk1 ^^ fk2 ^^ dck1 ^^ dck2)
 * 
 * Unlike Pure Link Entity, DC Link includes DCK columns in the hash
 * because DCK is what makes each record unique within the link relationship.
 */
function generateDCLinkHashKey(
  linkName: string, 
  fkColumns: string[], 
  dckColumns: string[],
  separator: string
): string {
  // Combine FK and DCK columns, sort alphabetically for consistent hashing
  const allColumns = [...fkColumns, ...dckColumns].sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  
  const parts = allColumns.map(col => `ISNULL(CAST(${escapeColumnName(col)} AS NVARCHAR(MAX)), '')`);
  const concatExpr = parts.join(` + '${separator}' + `);
  
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', ${concatExpr}), 2) AS hk_${linkName},`;
}

/**
 * Generate Hash Diff for Link Satellite
 * Same as regular hash diff but with link satellite naming convention
 * Pattern: hd_<entity1>_<entity2>
 */
function generateHashDiffForLinkSat(
  linkSatName: string, 
  columns: string[],
  separator: string
): string {
  return `        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
                {%- if hashdiff_columns | length == 1 %}, ''{%- endif %}
            )
        ), 2) AS hd_${linkSatName},`;
}

/**
 * Extract entity name and concept from external table name
 * Pattern: ext_<concept>_<entity>
 */
export function parseExternalTableName(tableName: string): { concept: string; entityName: string } | null {
  // First try: ext_<concept>_<entity> format (external tables)
  const extMatch = tableName.match(/^ext_([^_]+)_(.+)$/i);
  if (extMatch) {
    return {
      concept: extMatch[1].toLowerCase(),
      entityName: extMatch[2].toLowerCase()
    };
  }
  
  // Second try: <concept>_<entity> format (PSA tables without ext_ prefix)
  const psaMatch = tableName.match(/^([^_]+)_(.+)$/i);
  if (psaMatch) {
    return {
      concept: psaMatch[1].toLowerCase(),
      entityName: psaMatch[2].toLowerCase()
    };
  }
  
  return null;
}

/**
 * Derive the dss_record_source value from the external table name.
 * EWB tables (ext_ewb_*) → 'ewb_abacus' (Abacus ERP)
 * Other tables → concept name (e.g., 'jira', 'adworks')
 */
export function deriveRecordSource(externalTableOrConcept: string): string {
  // Extract concept from external table name if it looks like one
  const parsed = parseExternalTableName(externalTableOrConcept);
  const concept = parsed ? parsed.concept : externalTableOrConcept;
  
  // EWB data comes from Abacus ERP — record source is 'ewb_abacus'
  if (concept === 'ewb') {
    return 'ewb_abacus';
  }
  return concept;
}

/**
 * Derive the staging view name from the external table name.
 * Pattern: ext_<concept>_<entity> → <concept>_<entity>
 * Example: ext_ewb_lohn_len_main → ewb_lohn_len_main
 */
export function deriveStagingName(externalTableName: string): string {
  return externalTableName.replace(/^ext_/i, '');
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
    recordSourceDefault: deriveRecordSource(externalTableName),
    includeRunId: columns.some(c => c.toLowerCase() === 'dss_run_id')
  };
}
