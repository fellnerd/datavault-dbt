/**
 * Tool: Create Effectivity Satellite
 * 
 * Creates a Data Vault Effectivity Satellite model for link validity tracking.
 */

import { z } from 'zod';
import * as path from 'path';
import { writeFile, PATHS, getRelativePath, fileExists } from '../utils/fileOperations.js';

export const createEffSatSchema = z.object({
  entity1: z.string().describe('Erste Entity (z.B. "company")'),
  entity2: z.string().describe('Zweite Entity (z.B. "country")'),
  sourceModel: z.string().describe('Quell-Staging-Model'),
  drivingKey: z.string().describe('Driving Key Entity (meist die "1" Seite der Beziehung)'),
});

export type CreateEffSatInput = z.infer<typeof createEffSatSchema>;

export async function createEffSat(input: CreateEffSatInput): Promise<string> {
  const { entity1, entity2, sourceModel, drivingKey } = input;
  
  const effSatName = `eff_sat_${entity1}_${entity2}`;
  const linkName = `link_${entity1}_${entity2}`;
  const linkHashKey = `hk_link_${entity1}_${entity2}`;
  const hk1 = `hk_${entity1}`;
  const hk2 = `hk_${entity2}`;
  const drivingHk = `hk_${drivingKey}`;
  const filePath = path.join(PATHS.satellites, `${effSatName}.sql`);
  
  // Check if file already exists
  if (await fileExists(filePath)) {
    return `❌ Fehler: ${effSatName}.sql existiert bereits unter ${getRelativePath(filePath)}`;
  }
  
  const content = `/*
 * Effectivity Satellite: ${effSatName}
 * Schema: vault
 * 
 * Trackt die zeitliche Gültigkeit der Beziehung ${entity1} ↔ ${entity2}.
 * Driving Key: ${drivingKey} (bestimmt wann eine neue Version erstellt wird)
 * 
 * dss_is_active: 'Y' = Beziehung aktiv, 'N' = Beziehung beendet
 * dss_start_date: Beginn der Gültigkeit
 * dss_end_date: Ende der Gültigkeit (NULL = aktuell aktiv)
 */

{{ config(
    materialized='incremental',
    unique_key=['${drivingHk}', 'dss_start_date'],
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT
        ${linkHashKey},
        ${hk1},
        ${hk2},
        dss_load_date AS dss_start_date,
        dss_record_source
    FROM {{ ref('${sourceModel}') }}
    WHERE ${hk1} IS NOT NULL
      AND ${hk2} IS NOT NULL
),

{% if is_incremental() %}
existing AS (
    SELECT 
        ${drivingHk},
        dss_start_date
    FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.${linkHashKey},
        src.${hk1},
        src.${hk2},
        src.dss_start_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing e
        WHERE e.${drivingHk} = src.${drivingHk}
          AND e.dss_start_date = src.dss_start_date
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_active,
    CAST(NULL AS DATETIME2) AS dss_end_date
FROM new_records
`;

  await writeFile(filePath, content);
  
  return `✅ Effectivity Satellite erstellt: ${getRelativePath(filePath)}

Link: ${linkName}
Driving Key: ${drivingHk}

Der Effectivity Satellite trackt wann die Beziehung zwischen
${entity1} und ${entity2} aktiv/inaktiv war.

Nächste Schritte:
1. Sicherstellen dass ${linkName} existiert
2. Tests zu models/schema.yml hinzufügen
3. Bauen: dbt run --select ${effSatName}`;
}

export const createEffSatTool = {
  name: 'create_eff_sat',
  description: `Erstellt einen Effectivity Satellite für zeitliche Link-Gültigkeit.
Trackt wann eine Beziehung aktiv/inaktiv war.
Namenskonvention: eff_sat_<entity1>_<entity2>`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entity1: {
        type: 'string',
        description: 'Erste Entity (z.B. "company")',
      },
      entity2: {
        type: 'string',
        description: 'Zweite Entity (z.B. "country")',
      },
      sourceModel: {
        type: 'string',
        description: 'Quell-Staging-Model',
      },
      drivingKey: {
        type: 'string',
        description: 'Driving Key Entity (meist die "1" Seite der Beziehung)',
      },
    },
    required: ['entity1', 'entity2', 'sourceModel', 'drivingKey'],
  },
};
