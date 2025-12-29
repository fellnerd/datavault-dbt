/**
 * Tool: Create PIT Table
 * 
 * Creates a Point-in-Time lookup table for efficient historical queries.
 */

import { z } from 'zod';
import * as path from 'path';
import { writeFile, PATHS, getRelativePath, fileExists } from '../utils/fileOperations.js';

export const createPITSchema = z.object({
  entityName: z.string().describe('Name der Entity (z.B. "company")'),
  satellites: z.array(z.string()).describe('Liste der Satellites (z.B. ["sat_company", "sat_company_ext"])'),
});

export type CreatePITInput = z.infer<typeof createPITSchema>;

export async function createPIT(input: CreatePITInput): Promise<string> {
  const { entityName, satellites } = input;
  
  const pitName = `pit_${entityName}`;
  const hashKey = `hk_${entityName}`;
  const hubName = `hub_${entityName}`;
  const filePath = path.join(PATHS.businessVault, `${pitName}.sql`);
  
  // Check if file already exists
  if (await fileExists(filePath)) {
    return `❌ Fehler: ${pitName}.sql existiert bereits unter ${getRelativePath(filePath)}`;
  }
  
  // Build satellite lookup CTEs
  const satLookups = satellites.map((sat, idx) => {
    const alias = `sat${idx + 1}`;
    return `
    -- Lookup: ${sat}
    (
        SELECT TOP 1 s.${hashKey}
        FROM {{ ref('${sat}') }} s
        WHERE s.${hashKey} = pb.${hashKey}
          AND CAST(s.dss_load_date AS DATE) <= pb.snapshot_date
        ORDER BY s.dss_load_date DESC
    ) AS ${sat}_hk,
    (
        SELECT TOP 1 s.dss_load_date
        FROM {{ ref('${sat}') }} s
        WHERE s.${hashKey} = pb.${hashKey}
          AND CAST(s.dss_load_date AS DATE) <= pb.snapshot_date
        ORDER BY s.dss_load_date DESC
    ) AS ${sat}_ldts`;
  }).join(',\n');
  
  // Build WHERE clause for non-null check
  const notNullChecks = satellites.map(sat => `${sat}_hk IS NOT NULL`).join('\n   OR ');
  
  const content = `/*
 * PIT Table: ${pitName}
 * Schema: vault
 * 
 * Point-in-Time Lookup für ${entityName}.
 * Optimiert historische Abfragen über mehrere Satellites.
 * 
 * Für jeden Snapshot-Tag wird der gültige Satellite-Eintrag referenziert.
 */

{{ config(
    materialized='table',
    as_columnstore=false
) }}

WITH 
-- Alle eindeutigen Snapshot-Daten aus den Satellites
snapshot_dates AS (
    SELECT DISTINCT CAST(dss_load_date AS DATE) AS snapshot_date
    FROM (
        ${satellites.map(sat => `SELECT dss_load_date FROM {{ ref('${sat}') }}`).join('\n        UNION ALL\n        ')}
    ) all_dates
),

-- Alle Entities aus dem Hub
entities AS (
    SELECT DISTINCT ${hashKey}
    FROM {{ ref('${hubName}') }}
),

-- Kreuzprodukt: Jede Entity × Jedes Datum
pit_base AS (
    SELECT 
        e.${hashKey},
        sd.snapshot_date
    FROM entities e
    CROSS JOIN snapshot_dates sd
),

-- Satellite Lookups
sat_lookups AS (
    SELECT 
        pb.${hashKey},
        pb.snapshot_date,${satLookups}
    FROM pit_base pb
)

SELECT * FROM sat_lookups
WHERE ${notNullChecks}
`;

  await writeFile(filePath, content);
  
  return `✅ PIT Table erstellt: ${getRelativePath(filePath)}

Hub: ${hubName}
Satellites: ${satellites.join(', ')}

Die PIT Table erstellt für jeden Snapshot-Tag einen Lookup
zu den gültigen Satellite-Einträgen.

⚠️ HINWEIS: PIT Tables können groß werden (Entities × Tage).
Für Performance ggf. Snapshot-Intervall einschränken.

Nächste Schritte:
1. Bauen: dbt run --select ${pitName}
2. Testen mit historischer Abfrage`;
}

export const createPITTool = {
  name: 'create_pit',
  description: `Erstellt eine Point-in-Time (PIT) Table.
Optimiert historische Abfragen über mehrere Satellites.
Namenskonvention: pit_<entity>`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entityName: {
        type: 'string',
        description: 'Name der Entity (z.B. "company")',
      },
      satellites: {
        type: 'array',
        items: { type: 'string' },
        description: 'Liste der Satellites (z.B. ["sat_company", "sat_company_ext"])',
      },
    },
    required: ['entityName', 'satellites'],
  },
};
