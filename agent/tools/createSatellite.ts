/**
 * Tool: Create Satellite
 * 
 * Creates a Data Vault Satellite model file.
 * Includes DV 2.1 validation and dependency checking.
 */

import { z } from 'zod';
import * as path from 'path';
import { writeFile, PATHS, getRelativePath, fileExists } from '../utils/fileOperations.js';
import { 
  validateSatellite, 
  formatValidationResult 
} from '../validators/dataVaultRules.js';
import { 
  checkSatelliteDependencies, 
  formatDependencyResult 
} from '../validators/dependencies.js';
import { resultBox, formatError } from '../ui.js';

export const createSatelliteSchema = z.object({
  entityName: z.string().describe('Name der Entity (z.B. "product", "customer")'),
  payloadColumns: z.array(z.string()).describe('Payload-Spalten (Attribute)'),
  sourceModel: z.string().describe('Quell-Staging-Model (z.B. "stg_product")'),
  parentHub: z.string().optional().describe('Zugehöriger Hub (z.B. "hub_product")'),
});

export type CreateSatelliteInput = z.infer<typeof createSatelliteSchema>;

export async function createSatellite(input: CreateSatelliteInput): Promise<string> {
  const { entityName, payloadColumns, sourceModel, parentHub } = input;
  
  const satName = `sat_${entityName}`;
  const hashKey = `hk_${entityName}`;
  const hashDiff = `hd_${entityName}`;
  const hubRef = parentHub || `hub_${entityName}`;
  const filePath = path.join(PATHS.satellites, `${satName}.sql`);
  
  const output: string[] = [];
  
  // === VALIDATION ===
  const validation = validateSatellite({
    name: satName,
    hashKey,
    hashDiff,
    parentHub: hubRef,
    attributes: payloadColumns,
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
  
  // === DEPENDENCY CHECK ===
  const deps = checkSatelliteDependencies({
    name: satName,
    parentHub: hubRef,
    staging: sourceModel,
  });
  
  if (!deps.valid) {
    output.push(resultBox({
      status: 'ERROR',
      title: 'Missing Dependencies',
      message: formatDependencyResult(deps),
    }));
    output.push('\n[SUGGESTION] Create missing objects first, or use --force to skip check');
    return output.join('\n');
  }
  
  // === FILE EXISTS CHECK ===
  if (await fileExists(filePath)) {
    output.push(formatError('FILE_EXISTS', getRelativePath(filePath), 'Use different entity name or delete existing file'));
    return output.join('\n');
  }
  
  // === GENERATE MODEL ===
  const payloadCols = payloadColumns.map(col => `        ${col}`).join(',\n');
  const srcPayloadCols = payloadColumns.map(col => `        src.${col}`).join(',\n');
  
  const content = `/*
 * Satellite: ${satName}
 * Parent Hub: ${hubRef}
 * Source: ${sourceModel}
 */

{{ config(
    materialized='incremental',
    unique_key='${hashKey}',
    as_columnstore=false,
    post_hook=[
        "{{ update_satellite_current_flag(this, '${hashKey}') }}"
    ]
) }}

WITH source_data AS (
    SELECT 
        ${hashKey},
        ${hashDiff},
        dss_load_date,
        dss_record_source,
${payloadCols}
    FROM {{ ref('${sourceModel}') }}
    WHERE ${hashKey} IS NOT NULL
),

{% if is_incremental() %}
existing_sats AS (
    SELECT 
        ${hashKey},
        ${hashDiff}
    FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.${hashKey},
        src.${hashDiff},
        src.dss_load_date,
        src.dss_record_source,
${srcPayloadCols}
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_sats es
        WHERE es.${hashKey} = src.${hashKey}
          AND es.${hashDiff} = src.${hashDiff}
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_current,
    CAST(NULL AS DATETIME2) AS dss_end_date
FROM new_records
`;

  await writeFile(filePath, content);
  
  // === SUCCESS OUTPUT ===
  output.push(resultBox({
    status: 'OK',
    title: `Created: ${satName}`,
    details: {
      'Path': getRelativePath(filePath),
      'Parent Hub': hubRef,
      'Hash Key': hashKey,
      'Hash Diff': hashDiff,
      'Attributes': payloadColumns.length.toString(),
    },
  }));
  
  output.push(`
[NEXT]
  dbt run --select ${satName}
  dbt test --select ${satName}`);

  return output.join('\n');
}

export const createSatelliteTool = {
  name: 'create_satellite',
  description: `Creates a Data Vault 2.1 Satellite model.
Validates naming conventions and checks dependencies (hub, staging).
Includes hash diff for change detection and current flag logic.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entityName: {
        type: 'string',
        description: 'Entity name without prefix (e.g., "product", "customer")',
      },
      payloadColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Attribute columns to track',
      },
      sourceModel: {
        type: 'string',
        description: 'Source staging model (e.g., "stg_product")',
      },
      parentHub: {
        type: 'string',
        description: 'Parent hub name (e.g., "hub_product") - optional, defaults to hub_<entity>',
      },
    },
    required: ['entityName', 'payloadColumns', 'sourceModel'],
  },
};
