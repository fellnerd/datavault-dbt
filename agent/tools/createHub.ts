/**
 * Tool: Create Hub
 * 
 * Creates a Data Vault Hub model file.
 * Includes DV 2.1 validation and dependency checking.
 */

import { z } from 'zod';
import * as path from 'path';
import { writeFile, PATHS, getRelativePath, fileExists } from '../utils/fileOperations.js';
import { validateHub, formatValidationResult } from '../validators/dataVaultRules.js';
import { checkStagingDependencies, formatDependencyResult } from '../validators/dependencies.js';
import { resultBox, formatError } from '../ui.js';

export const createHubSchema = z.object({
  entityName: z.string().describe('Name der Entity (z.B. "product", "customer")'),
  businessKeyColumns: z.array(z.string()).describe('Business Key Spalte(n)'),
  sourceModel: z.string().describe('Quell-Staging-Model (z.B. "stg_product")'),
});

export type CreateHubInput = z.infer<typeof createHubSchema>;

export async function createHub(input: CreateHubInput): Promise<string> {
  const { entityName, businessKeyColumns, sourceModel } = input;
  
  const hubName = `hub_${entityName}`;
  const hashKey = `hk_${entityName}`;
  const filePath = path.join(PATHS.hubs, `${hubName}.sql`);
  
  const output: string[] = [];
  
  // === VALIDATION ===
  const validation = validateHub({
    name: hubName,
    hashKey,
    businessKeys: businessKeyColumns,
    source: sourceModel,
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
  const deps = checkStagingDependencies({
    name: hubName,
    externalTable: sourceModel.replace('stg_', 'ext_'),
  });
  
  // Dependency check is warning-only for hubs (staging might be created together)
  if (!deps.valid) {
    output.push(resultBox({
      status: 'WARN',
      title: 'Dependencies',
      message: formatDependencyResult(deps) + '\nHub will be created anyway.',
    }));
  }
  
  // === FILE EXISTS CHECK ===
  if (await fileExists(filePath)) {
    output.push(formatError('FILE_EXISTS', getRelativePath(filePath), 'Use different entity name or delete existing file'));
    return output.join('\n');
  }
  
  // === GENERATE MODEL ===
  const businessKeyCols = businessKeyColumns.join(',\n        ');
  
  const content = `/*
 * Hub: ${hubName}
 * Source: ${sourceModel}
 * Business Keys: ${businessKeyColumns.join(', ')}
 */

{{ config(
    materialized='incremental',
    unique_key='${hashKey}',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        ${hashKey},
        ${businessKeyCols},
        dss_load_date,
        dss_record_source
    FROM {{ ref('${sourceModel}') }}
    WHERE ${hashKey} IS NOT NULL
),

{% if is_incremental() %}
existing_hubs AS (
    SELECT ${hashKey} FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT DISTINCT
        src.${hashKey},
        ${businessKeyColumns.map(col => `src.${col}`).join(',\n        ')},
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_hubs eh
        WHERE eh.${hashKey} = src.${hashKey}
    )
    {% endif %}
)

SELECT * FROM new_records
`;

  await writeFile(filePath, content);
  
  // === SUCCESS OUTPUT ===
  output.push(resultBox({
    status: 'OK',
    title: `Created: ${hubName}`,
    details: {
      'Path': getRelativePath(filePath),
      'Hash Key': hashKey,
      'Business Keys': businessKeyColumns.join(', '),
      'Source': sourceModel,
    },
  }));
  
  output.push(`
[NEXT]
  dbt run --select ${hubName}
  dbt test --select ${hubName}`);

  return output.join('\n');
}

export const createHubTool = {
  name: 'create_hub',
  description: `Creates a Data Vault 2.1 Hub model.
Validates naming conventions (hub_<entity>, hk_<entity>).
Hubs store unique business keys and are insert-only.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entityName: {
        type: 'string',
        description: 'Entity name without prefix (e.g., "product", "customer")',
      },
      businessKeyColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Business key column(s)',
      },
      sourceModel: {
        type: 'string',
        description: 'Source staging model (e.g., "stg_product")',
      },
    },
    required: ['entityName', 'businessKeyColumns', 'sourceModel'],
  },
};
