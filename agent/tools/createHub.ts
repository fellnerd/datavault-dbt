/**
 * Tool: Create Hub
 * 
 * Creates a Data Vault Hub model file.
 */

import { z } from 'zod';
import * as path from 'path';
import { writeFile, PATHS, getRelativePath, fileExists } from '../utils/fileOperations.js';

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
  
  // Check if file already exists
  if (await fileExists(filePath)) {
    return `❌ Fehler: ${hubName}.sql existiert bereits unter ${getRelativePath(filePath)}`;
  }
  
  const businessKeyCols = businessKeyColumns.join(',\n        ');
  
  const content = `/*
 * Hub: ${hubName}
 * Schema: vault
 * 
 * Speichert eindeutige Business Keys für ${entityName}.
 * Insert-Only: Neue Einträge werden hinzugefügt, nie gelöscht.
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
  
  return `✅ Hub erstellt: ${getRelativePath(filePath)}

Nächste Schritte:
1. Tests zu models/schema.yml hinzufügen
2. External Table prüfen: dbt run-operation stage_external_sources
3. Hub bauen: dbt run --select ${hubName}
4. Tests ausführen: dbt test --select ${hubName}`;
}

export const createHubTool = {
  name: 'create_hub',
  description: `Erstellt ein Data Vault Hub Model.
Hubs speichern eindeutige Business Keys und sind insert-only.
Namenskonvention: hub_<entity>`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entityName: {
        type: 'string',
        description: 'Name der Entity (z.B. "product", "customer")',
      },
      businessKeyColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Business Key Spalte(n)',
      },
      sourceModel: {
        type: 'string',
        description: 'Quell-Staging-Model (z.B. "stg_product")',
      },
    },
    required: ['entityName', 'businessKeyColumns', 'sourceModel'],
  },
};
