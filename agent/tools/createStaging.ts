/**
 * Tool: Create Staging View
 * 
 * Creates a dbt staging model with hash calculations.
 * Includes DV 2.1 validation.
 */

import { z } from 'zod';
import * as path from 'path';
import { writeFile, PATHS, getRelativePath, fileExists } from '../utils/fileOperations.js';
import { validateStaging, formatValidationResult } from '../validators/dataVaultRules.js';
import { resultBox, formatError } from '../ui.js';

export const createStagingSchema = z.object({
  entityName: z.string().describe('Name der Entity (z.B. "product")'),
  externalTable: z.string().describe('External Table Name (z.B. "ext_product")'),
  businessKeyColumns: z.array(z.string()).describe('Business Key Spalten (z.B. ["object_id"] oder ["tenant_id", "object_id"])'),
  payloadColumns: z.array(z.string()).describe('Payload-Spalten für Hash Diff'),
  foreignKeys: z.array(z.object({
    column: z.string(),
    targetEntity: z.string(),
  })).optional().describe('Foreign Keys zu anderen Entities'),
});

export type CreateStagingInput = z.infer<typeof createStagingSchema>;

export async function createStaging(input: CreateStagingInput): Promise<string> {
  const { entityName, externalTable, businessKeyColumns, payloadColumns, foreignKeys = [] } = input;
  
  const stagingName = `stg_${entityName}`;
  const hashKey = `hk_${entityName}`;
  const hashDiff = `hd_${entityName}`;
  const filePath = path.join(PATHS.staging, `${stagingName}.sql`);
  
  const output: string[] = [];
  
  // === VALIDATION ===
  const validation = validateStaging({
    name: stagingName,
    source: externalTable,
    columns: [...businessKeyColumns, ...payloadColumns],
    hashKey,
    hashDiff,
  });
  
  if (!validation.valid) {
    output.push(resultBox({
      status: 'ERROR',
      title: 'Validation Failed',
      message: formatValidationResult(validation),
    }));
    return output.join('\n');
  }
  
  if (validation.warnings.length > 0) {
    output.push(resultBox({
      status: 'WARN',
      title: 'Validation Warnings',
      message: formatValidationResult(validation),
    }));
  }
  
  // === FILE EXISTS CHECK ===
  if (await fileExists(filePath)) {
    output.push(formatError('FILE_EXISTS', getRelativePath(filePath), 'Use different entity name or delete existing file'));
    return output.join('\n');
  }
  
  // Build hashdiff columns list
  const hashdiffList = payloadColumns.map(col => `    '${col}'`).join(',\n');
  
  // Build FK hash key calculations
  const fkHashKeys = foreignKeys.map(fk => `
        -- FK Hash Key: ${fk.targetEntity}
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(${fk.column} AS NVARCHAR(MAX)), '')
        ), 2) AS hk_${fk.targetEntity},`).join('');
  
  // Build payload columns list
  const payloadList = payloadColumns.map(col => `        ${col}`).join(',\n');
  
  // Build hashdiff concat
  const hashdiffConcat = payloadColumns.map(col => 
    `                ISNULL(CAST(${col} AS NVARCHAR(MAX)), '')`
  ).join(',\n');
  
  // Build Business Key hash - supports composite keys with ^^ separator (DV 2.1)
  const isCompositeKey = businessKeyColumns.length > 1;
  const bkHashCalc = isCompositeKey
    ? `CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT_WS('^^',
                ${businessKeyColumns.map(col => `ISNULL(CAST(${col} AS NVARCHAR(MAX)), '')`).join(',\n                ')}
            )
        ), 2)`
    : `CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(${businessKeyColumns[0]} AS NVARCHAR(MAX)), '')
        ), 2)`;
  
  // Build Business Key columns list
  const bkColumnsList = businessKeyColumns.map(col => `        ${col}`).join(',\n');

  const content = `/*
 * Staging Model: ${stagingName}
 * 
 * Bereitet ${entityName}-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key${isCompositeKey ? 's (Composite)' : ''}: ${businessKeyColumns.join(', ')}
 */

{%- set hashdiff_columns = [
${hashdiffList}
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', '${externalTable}') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        ${bkHashCalc} AS ${hashKey},
${fkHashKeys}
        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
${hashdiffConcat}
            )
        ), 2) AS ${hashDiff},
        
        -- ===========================================
        -- BUSINESS KEY${isCompositeKey ? 'S' : ''}
        -- ===========================================
${bkColumnsList},
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
${payloadList},
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
`;

  await writeFile(filePath, content);
  
  // === SUCCESS OUTPUT ===
  const fkInfo = foreignKeys.length > 0 
    ? foreignKeys.map(fk => `hk_${fk.targetEntity}`).join(', ')
    : 'none';
  
  output.push(resultBox({
    status: 'OK',
    title: `Created: ${stagingName}`,
    details: {
      'Path': getRelativePath(filePath),
      'Source': externalTable,
      'Hash Key': hashKey,
      'Hash Diff': hashDiff,
      'Business Key(s)': businessKeyColumns.join(', '),
      'Composite Key': isCompositeKey ? 'Yes (^^-separated)' : 'No',
      'FK Hash Keys': fkInfo,
    },
  }));
  
  output.push(`
[WARN] External table must exist in sources.yml

[NEXT]
  dbt run-operation stage_external_sources
  dbt run --select ${stagingName}`);

  return output.join('\n');
}

export const createStagingTool = {
  name: 'create_staging',
  description: `Creates a staging view with hash calculations.
Calculates hk_<entity> (hash key) and hd_<entity> (hash diff).
Uses SQL Server HASHBYTES for SHA2_256 hashing.
Supports composite business keys (multiple columns).`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entityName: {
        type: 'string',
        description: 'Entity name without prefix (e.g., "product")',
      },
      externalTable: {
        type: 'string',
        description: 'External table name (e.g., "ext_product")',
      },
      businessKeyColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Business key column(s) (e.g., ["object_id"] or ["tenant_id", "object_id"] for composite)',
      },
      payloadColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Attribute columns for hash diff',
      },
      foreignKeys: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            column: { type: 'string' },
            targetEntity: { type: 'string' },
          },
          required: ['column', 'targetEntity'],
        },
        description: 'Foreign keys to other entities',
      },
    },
    required: ['entityName', 'externalTable', 'businessKeyColumns', 'payloadColumns'],
  },
};
