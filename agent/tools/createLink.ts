/**
 * Tool: Create Link
 * 
 * Creates a Data Vault Link model file.
 */

import { z } from 'zod';
import { writeFile, getLinkPath, getRelativePath, fileExists, DEFAULT_CONCEPT } from '../utils/fileOperations.js';

export const createLinkSchema = z.object({
  entity1: z.string().describe('Erste Entity (z.B. "company")'),
  entity2: z.string().describe('Zweite Entity (z.B. "country")'),
  sourceModel: z.string().describe('Quell-Staging-Model'),
  additionalColumns: z.array(z.string()).optional().describe('Zusätzliche Spalten im Link (z.B. role_code)'),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;

export async function createLink(input: CreateLinkInput): Promise<string> {
  const { entity1, entity2, sourceModel, additionalColumns = [] } = input;
  
  const linkName = `link_${entity1}_${entity2}`;
  const linkHashKey = `hk_link_${entity1}_${entity2}`;
  const hk1 = `hk_${entity1}`;
  const hk2 = `hk_${entity2}`;
  const filePath = getLinkPath(`${entity1}_${entity2}`, DEFAULT_CONCEPT);
  
  // Check if file already exists
  if (await fileExists(filePath)) {
    return `❌ Fehler: ${linkName}.sql existiert bereits unter ${getRelativePath(filePath)}`;
  }
  
  const additionalColsSelect = additionalColumns.length > 0
    ? ',\n        ' + additionalColumns.join(',\n        ')
    : '';
  
  const additionalColsSrc = additionalColumns.length > 0
    ? ',\n        ' + additionalColumns.map(col => `src.${col}`).join(',\n        ')
    : '';
  
  const content = `/*
 * Link: ${linkName}
 * Schema: vault
 * 
 * Verbindet ${entity1} mit ${entity2}.
 * Insert-Only: Beziehungen werden hinzugefügt, nie gelöscht.
 */

{{ config(
    materialized='incremental',
    unique_key='${linkHashKey}',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT DISTINCT
        ${linkHashKey},
        ${hk1},
        ${hk2}${additionalColsSelect},
        dss_load_date,
        dss_record_source
    FROM {{ ref('${sourceModel}') }}
    WHERE ${hk1} IS NOT NULL
      AND ${hk2} IS NOT NULL
),

{% if is_incremental() %}
existing_links AS (
    SELECT ${linkHashKey} FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.${linkHashKey},
        src.${hk1},
        src.${hk2}${additionalColsSrc},
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_links el
        WHERE el.${linkHashKey} = src.${linkHashKey}
    )
    {% endif %}
)

SELECT * FROM new_records
`;

  await writeFile(filePath, content);
  
  return `✅ Link erstellt: ${getRelativePath(filePath)}

Verbindet: hub_${entity1} ↔ hub_${entity2}

⚠️ WICHTIG: Der Link Hash Key (${linkHashKey}) muss im Staging berechnet werden:

\`\`\`sql
CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
    CONCAT(
        ISNULL(CAST(<${entity1}_bk> AS NVARCHAR(MAX)), ''),
        '^^',
        ISNULL(CAST(<${entity2}_bk> AS NVARCHAR(MAX)), '')
    )
), 2) AS ${linkHashKey}
\`\`\`

Nächste Schritte:
1. Hash Key ${linkHashKey} im Staging-Model (${sourceModel}) berechnen
2. Tests zu models/schema.yml hinzufügen
3. Link bauen: dbt run --select ${linkName}`;
}

export const createLinkTool = {
  name: 'create_link',
  description: `Erstellt ein Data Vault Link Model.
Links verbinden zwei Hubs und sind insert-only.
Namenskonvention: link_<entity1>_<entity2>`,
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
      additionalColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Zusätzliche Spalten im Link (z.B. role_code)',
      },
    },
    required: ['entity1', 'entity2', 'sourceModel'],
  },
};
