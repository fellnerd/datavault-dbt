/**
 * Tool: Create Satellite
 * 
 * Creates a Data Vault Satellite model file.
 */

import { z } from 'zod';
import * as path from 'path';
import { writeFile, PATHS, getRelativePath, fileExists } from '../utils/fileOperations.js';

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
  const filePath = path.join(PATHS.satellites, `${satName}.sql`);
  
  // Check if file already exists
  if (await fileExists(filePath)) {
    return `❌ Fehler: ${satName}.sql existiert bereits unter ${getRelativePath(filePath)}`;
  }
  
  const payloadCols = payloadColumns.map(col => `        ${col}`).join(',\n');
  const srcPayloadCols = payloadColumns.map(col => `        src.${col}`).join(',\n');
  
  const hubRef = parentHub || `hub_${entityName}`;
  
  const content = `/*
 * Satellite: ${satName}
 * Schema: vault
 * 
 * Speichert ${entityName}-Attribute mit vollständiger Historie.
 * Änderungen werden durch Hash Diff erkannt.
 * 
 * dss_is_current: 'Y' für aktuellen Eintrag, 'N' für historische
 * dss_end_date: Ende der Gültigkeit (NULL = aktuell)
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
        -- Payload
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
  
  return `✅ Satellite erstellt: ${getRelativePath(filePath)}

Zugehöriger Hub: ${hubRef}

Nächste Schritte:
1. Prüfen ob Hash Diff (${hashDiff}) im Staging berechnet wird
2. Tests zu models/schema.yml hinzufügen (relationships zu ${hubRef})
3. Satellite bauen: dbt run --select ${satName}
4. Tests ausführen: dbt test --select ${satName}`;
}

export const createSatelliteTool = {
  name: 'create_satellite',
  description: `Erstellt ein Data Vault Satellite Model.
Satellites speichern Attribute mit vollständiger Historie.
Verwendet post_hook für dss_is_current Flag.
Namenskonvention: sat_<entity>`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entityName: {
        type: 'string',
        description: 'Name der Entity (z.B. "product", "customer")',
      },
      payloadColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Payload-Spalten (Attribute)',
      },
      sourceModel: {
        type: 'string',
        description: 'Quell-Staging-Model (z.B. "stg_product")',
      },
      parentHub: {
        type: 'string',
        description: 'Zugehöriger Hub (z.B. "hub_product") - optional',
      },
    },
    required: ['entityName', 'payloadColumns', 'sourceModel'],
  },
};
