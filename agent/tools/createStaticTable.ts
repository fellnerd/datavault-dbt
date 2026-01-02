/**
 * Tool: Create Static Table
 * 
 * Creates a persisted (incremental) mart table from Hub/Satellite data.
 * Static Tables are physical tables with indexes for improved query performance.
 * 
 * Key Features:
 * - Incremental materialization with MERGE strategy
 * - Automatic Non-Clustered Index on Hash Key
 * - Ghost Record exclusion
 * - Change detection via dss_load_date
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import { writeFile, PATHS, getRelativePath, fileExists, ensureDir } from '../utils/fileOperations.js';

// Metadata columns that should not be included in static tables
const EXCLUDED_COLUMNS = [
  'hk_', 'hd_', 'dss_load_date', 'dss_record_source', 'dss_is_current', 'dss_end_date', 'dss_run_id'
];

export const createStaticTableSchema = z.object({
  tableName: z.string().describe('Name der Tabelle (z.B. "company_current")'),
  description: z.string().describe('Kurze Beschreibung der Tabelle'),
  baseHub: z.string().describe('Basis-Hub (z.B. "hub_company")'),
  satellites: z.array(z.object({
    name: z.string().describe('Satellite Name'),
    columns: z.array(z.string()).describe('Zu selektierende Spalten (* für alle)'),
    currentOnly: z.boolean().optional().describe('Nur aktuelle Einträge (dss_is_current = Y)'),
  })).describe('Einzubindende Satellites'),
  links: z.array(z.object({
    name: z.string().describe('Link Name'),
    targetHub: z.string().describe('Ziel-Hub'),
    targetSatellite: z.string().optional().describe('Satellite des Ziel-Hubs'),
    columns: z.array(z.string()).optional().describe('Zu selektierende Spalten'),
  })).optional().describe('Einzubindende Links'),
  mergeUpdateColumns: z.array(z.string()).optional().describe('Spalten die bei MERGE aktualisiert werden'),
});

export type CreateStaticTableInput = z.infer<typeof createStaticTableSchema>;

/**
 * Generate a unique column alias by prefixing with entity name
 */
function getUniqueColumnAlias(satName: string, colName: string, usedAliases: Set<string>): string {
  if (!usedAliases.has(colName)) {
    usedAliases.add(colName);
    return colName;
  }
  
  const entityPrefix = satName.replace('sat_', '').replace('eff_sat_', '');
  const prefixedAlias = `${entityPrefix}_${colName}`;
  
  if (!usedAliases.has(prefixedAlias)) {
    usedAliases.add(prefixedAlias);
    return prefixedAlias;
  }
  
  let counter = 2;
  while (usedAliases.has(`${prefixedAlias}${counter}`)) {
    counter++;
  }
  const finalAlias = `${prefixedAlias}${counter}`;
  usedAliases.add(finalAlias);
  return finalAlias;
}

/**
 * Extract payload columns from a satellite SQL file
 */
async function extractSatelliteColumns(satName: string): Promise<string[]> {
  try {
    const satPath = path.join(PATHS.satellites, `${satName}.sql`);
    const content = await fs.readFile(satPath, 'utf-8');
    
    const payloadMatch = content.match(/--\s*Payload[\s\S]*?FROM/i);
    if (payloadMatch) {
      const payloadSection = payloadMatch[0];
      const columnMatches = payloadSection.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*[,\n]/gim);
      const columns: string[] = [];
      for (const match of columnMatches) {
        const col = match[1].toLowerCase();
        if (!EXCLUDED_COLUMNS.some(excl => col.startsWith(excl) || col === excl)) {
          columns.push(col);
        }
      }
      if (columns.length > 0) {
        return columns;
      }
    }
    
    const srcMatches = content.matchAll(/src\.([a-z_][a-z0-9_]*)/gi);
    const columns: string[] = [];
    for (const match of srcMatches) {
      const col = match[1].toLowerCase();
      if (!EXCLUDED_COLUMNS.some(excl => col.startsWith(excl) || col === excl)) {
        if (!columns.includes(col)) {
          columns.push(col);
        }
      }
    }
    
    return columns.length > 0 ? columns : ['*'];
  } catch (error) {
    return ['*'];
  }
}

export async function createStaticTable(input: CreateStaticTableInput): Promise<string> {
  const { tableName, description, baseHub, satellites, links = [], mergeUpdateColumns } = input;
  
  const staticDir = path.join(PATHS.mart, 'tables');
  const filePath = path.join(staticDir, `${tableName}.sql`);
  
  await ensureDir(staticDir);
  
  if (await fileExists(filePath)) {
    return `❌ Fehler: ${tableName}.sql existiert bereits unter ${getRelativePath(filePath)}`;
  }
  
  const entity = baseHub.replace('hub_', '');
  const hashKey = `hk_${entity}`;
  
  const usedAliases = new Set<string>(['object_id', hashKey, 'hub_load_date', 'last_updated']);
  
  // Build satellite columns
  const satColumnsList: string[] = [];
  const allPayloadColumns: string[] = [];
  
  for (const sat of satellites) {
    const alias = sat.name.replace('sat_', 's_').replace('eff_sat_', 'es_');
    
    let columns = sat.columns;
    if (columns.includes('*') || columns.length === 0) {
      columns = await extractSatelliteColumns(sat.name);
    }
    
    if (columns.includes('*')) {
      satColumnsList.push(`        -- TODO: Spalten für ${sat.name} manuell hinzufügen`);
      continue;
    }
    
    for (const col of columns) {
      const uniqueAlias = getUniqueColumnAlias(sat.name, col, usedAliases);
      allPayloadColumns.push(uniqueAlias);
      if (uniqueAlias === col) {
        satColumnsList.push(`        ${alias}.${col}`);
      } else {
        satColumnsList.push(`        ${alias}.${col} AS ${uniqueAlias}`);
      }
    }
  }
  const satColumns = satColumnsList.join(',\n');
  
  // Build satellite joins
  const satJoins = satellites.map(sat => {
    const alias = sat.name.replace('sat_', 's_').replace('eff_sat_', 'es_');
    const satEntity = sat.name.replace('sat_', '').replace('eff_sat_', '');
    const satHk = `hk_${satEntity}`;
    const joinKey = satEntity === entity ? hashKey : satHk;
    const currentFilter = sat.currentOnly !== false ? `\n        AND ${alias}.dss_is_current = 'Y'` : '';
    return `    -- ${sat.name}
    LEFT JOIN {{ ref('${sat.name}') }} ${alias}
        ON h.${hashKey} = ${alias}.${joinKey}${currentFilter}`;
  }).join('\n\n');
  
  // Build link joins
  const linkJoins = links.map(link => {
    const linkAlias = link.name.replace('link_', 'l_');
    const targetEntity = link.targetHub.replace('hub_', '');
    const targetHk = `hk_${targetEntity}`;
    
    let joinSql = `    -- ${link.name}
    LEFT JOIN {{ ref('${link.name}') }} ${linkAlias}
        ON h.${hashKey} = ${linkAlias}.${hashKey}`;
    
    if (link.targetSatellite) {
      const targetSatAlias = link.targetSatellite.replace('sat_', 's_').replace('eff_sat_', 'es_');
      joinSql += `
    LEFT JOIN {{ ref('${link.targetSatellite}') }} ${targetSatAlias}
        ON ${linkAlias}.${targetHk} = ${targetSatAlias}.${targetHk}
        AND ${targetSatAlias}.dss_is_current = 'Y'`;
    }
    
    return joinSql;
  }).join('\n\n');
  
  // Build link columns
  const linkColumnsList: string[] = [];
  for (const link of links) {
    if (link.columns && link.targetSatellite) {
      const targetSatAlias = link.targetSatellite.replace('sat_', 's_').replace('eff_sat_', 'es_');
      for (const col of link.columns) {
        const uniqueAlias = getUniqueColumnAlias(link.targetSatellite, col, usedAliases);
        allPayloadColumns.push(uniqueAlias);
        if (uniqueAlias === col) {
          linkColumnsList.push(`        ${targetSatAlias}.${col}`);
        } else {
          linkColumnsList.push(`        ${targetSatAlias}.${col} AS ${uniqueAlias}`);
        }
      }
    }
  }
  const linkColumns = linkColumnsList.join(',\n');
  
  const allColumns = [satColumns, linkColumns].filter(Boolean).join(',\n\n');
  const allJoins = [satJoins, linkJoins].filter(Boolean).join('\n\n');
  
  // Determine merge update columns
  const updateCols = mergeUpdateColumns || allPayloadColumns;
  const mergeColList = updateCols.map(c => `'${c}'`).join(', ');
  
  const content = `/*
 * Static Table: ${tableName}
 * Schema: mart_static
 * 
 * ${description}
 * 
 * Persistierte Tabelle für optimierte Abfragen.
 * Inkrementelle Updates via MERGE auf ${hashKey}.
 */

{{ config(
    materialized='incremental',
    unique_key='${hashKey}',
    incremental_strategy='merge',
    merge_update_columns=[${mergeColList}, 'last_updated'],
    as_columnstore=false,
    tags=['static'],
    post_hook=[
        "{{ create_hash_index('${hashKey}') }}"
    ]
) }}

WITH source_data AS (
    SELECT
        -- Hash Key
        h.${hashKey},
        h.object_id,
        
        -- Payload
${allColumns},
        
        -- Metadata
        h.dss_load_date AS hub_load_date,
        COALESCE(${satellites.map(s => s.name.replace('sat_', 's_').replace('eff_sat_', 'es_') + '.dss_load_date').join(', ')}) AS last_updated

    FROM {{ ref('${baseHub}') }} h

${allJoins}

    -- Ghost Records ausschließen
    WHERE h.object_id > 0
)

SELECT * FROM source_data
{% if is_incremental() %}
WHERE last_updated > (SELECT MAX(last_updated) FROM {{ this }})
{% endif %}
`;

  await writeFile(filePath, content);
  
  return `✅ Static Table erstellt: ${getRelativePath(filePath)}

Beschreibung: ${description}
Schema: mart_static
Basis: ${baseHub}
Satellites: ${satellites.map(s => s.name).join(', ')}
Links: ${links.length > 0 ? links.map(l => l.name).join(', ') : 'keine'}

Features:
• Inkrementelle Materialisierung (MERGE)
• Non-Clustered Index auf ${hashKey}
• Change Detection via last_updated

Nächste Schritte:
1. Initial Load: dbt run --select ${tableName} --full-refresh
2. Inkrementell: dbt run --select ${tableName}
3. Alle Static Tables: dbt run --select tag:static`;
}

export const createStaticTableTool = {
  name: 'create_static_table',
  description: `Erstellt eine persistierte Static Table im Mart-Layer.
Static Tables sind physische Tabellen mit Index für optimierte Abfragen.
Verwendet MERGE-Strategie für inkrementelle Updates.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      tableName: {
        type: 'string',
        description: 'Name der Tabelle (z.B. "company_current")',
      },
      description: {
        type: 'string',
        description: 'Kurze Beschreibung der Tabelle',
      },
      baseHub: {
        type: 'string',
        description: 'Basis-Hub (z.B. "hub_company")',
      },
      satellites: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            columns: { type: 'array', items: { type: 'string' } },
            currentOnly: { type: 'boolean' },
          },
          required: ['name', 'columns'],
        },
        description: 'Einzubindende Satellites',
      },
      links: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            targetHub: { type: 'string' },
            targetSatellite: { type: 'string' },
            columns: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'targetHub'],
        },
        description: 'Einzubindende Links',
      },
      mergeUpdateColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Spalten die bei MERGE aktualisiert werden (Standard: alle Payload-Spalten)',
      },
    },
    required: ['tableName', 'description', 'baseHub', 'satellites'],
  },
};
