/**
 * Tool: Create Staging View
 * 
 * Creates a dbt staging model with hash calculations.
 */

import { z } from 'zod';
import * as path from 'path';
import { writeFile, PATHS, getRelativePath, fileExists } from '../utils/fileOperations.js';

export const createStagingSchema = z.object({
  entityName: z.string().describe('Name der Entity (z.B. "product")'),
  externalTable: z.string().describe('External Table Name (z.B. "ext_product")'),
  businessKeyColumn: z.string().describe('Business Key Spalte (z.B. "object_id")'),
  payloadColumns: z.array(z.string()).describe('Payload-Spalten für Hash Diff'),
  foreignKeys: z.array(z.object({
    column: z.string(),
    targetEntity: z.string(),
  })).optional().describe('Foreign Keys zu anderen Entities'),
});

export type CreateStagingInput = z.infer<typeof createStagingSchema>;

export async function createStaging(input: CreateStagingInput): Promise<string> {
  const { entityName, externalTable, businessKeyColumn, payloadColumns, foreignKeys = [] } = input;
  
  const stagingName = `stg_${entityName}`;
  const hashKey = `hk_${entityName}`;
  const hashDiff = `hd_${entityName}`;
  const filePath = path.join(PATHS.staging, `${stagingName}.sql`);
  
  // Check if file already exists
  if (await fileExists(filePath)) {
    return `❌ Fehler: ${stagingName}.sql existiert bereits unter ${getRelativePath(filePath)}`;
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
  
  const content = `/*
 * Staging Model: ${stagingName}
 * 
 * Bereitet ${entityName}-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
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
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(${businessKeyColumn} AS NVARCHAR(MAX)), '')
        ), 2) AS ${hashKey},
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
        -- BUSINESS KEY
        -- ===========================================
        ${businessKeyColumn},
        
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
  
  const fkInfo = foreignKeys.length > 0 
    ? `\nFK Hash Keys: ${foreignKeys.map(fk => `hk_${fk.targetEntity}`).join(', ')}`
    : '';
  
  return `✅ Staging View erstellt: ${getRelativePath(filePath)}

Hash Key: ${hashKey}
Hash Diff: ${hashDiff}${fkInfo}

⚠️ WICHTIG: External Table muss existieren!
Falls nicht vorhanden, füge sie zu models/staging/sources.yml hinzu.

Nächste Schritte:
1. External Table prüfen/erstellen in sources.yml
2. dbt run-operation stage_external_sources
3. Staging testen: dbt run --select ${stagingName}`;
}

export const createStagingTool = {
  name: 'create_staging',
  description: `Erstellt ein Staging View Model mit Hash-Berechnungen.
Berechnet hk_<entity> (Hash Key) und hd_<entity> (Hash Diff).
Verwendet SQL Server HASHBYTES für Hash-Berechnung.
Namenskonvention: stg_<entity>`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entityName: {
        type: 'string',
        description: 'Name der Entity (z.B. "product")',
      },
      externalTable: {
        type: 'string',
        description: 'External Table Name (z.B. "ext_product")',
      },
      businessKeyColumn: {
        type: 'string',
        description: 'Business Key Spalte (z.B. "object_id")',
      },
      payloadColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Payload-Spalten für Hash Diff',
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
        description: 'Foreign Keys zu anderen Entities',
      },
    },
    required: ['entityName', 'externalTable', 'businessKeyColumn', 'payloadColumns'],
  },
};
