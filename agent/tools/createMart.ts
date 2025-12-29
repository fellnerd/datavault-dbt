/**
 * Tool: Create Mart View
 * 
 * Creates a denormalized view for BI/Reporting.
 * IMPORTANT: Generates unique column aliases to avoid SQL Server duplicate column errors.
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import { writeFile, PATHS, getRelativePath, fileExists, ensureDir } from '../utils/fileOperations.js';

// Metadata columns that should not be included in mart views
const EXCLUDED_COLUMNS = [
  'hk_', 'hd_', 'dss_load_date', 'dss_record_source', 'dss_is_current', 'dss_end_date', 'dss_run_id'
];

export const createMartSchema = z.object({
  viewName: z.string().describe('Name der View (z.B. "company_current")'),
  description: z.string().describe('Kurze Beschreibung der View'),
  baseHub: z.string().describe('Basis-Hub (z.B. "hub_company")'),
  satellites: z.array(z.object({
    name: z.string().describe('Satellite Name'),
    columns: z.array(z.string()).describe('Zu selektierende Spalten'),
    currentOnly: z.boolean().optional().describe('Nur aktuelle Einträge (dss_is_current = Y)'),
  })).describe('Einzubindende Satellites'),
  links: z.array(z.object({
    name: z.string().describe('Link Name'),
    targetHub: z.string().describe('Ziel-Hub'),
    targetSatellite: z.string().optional().describe('Satellite des Ziel-Hubs'),
    columns: z.array(z.string()).optional().describe('Zu selektierende Spalten'),
  })).optional().describe('Einzubindende Links'),
  subfolder: z.string().optional().describe('Unterordner im mart/ Verzeichnis'),
});

export type CreateMartInput = z.infer<typeof createMartSchema>;

/**
 * Generate a unique column alias by prefixing with entity name
 * e.g., "name" from "sat_company" becomes "company_name"
 */
function getUniqueColumnAlias(satName: string, colName: string, usedAliases: Set<string>): string {
  // First try: just the column name (if unique)
  if (!usedAliases.has(colName)) {
    usedAliases.add(colName);
    return colName;
  }
  
  // Second try: prefix with entity name (sat_company -> company_name)
  const entityPrefix = satName.replace('sat_', '').replace('eff_sat_', '');
  const prefixedAlias = `${entityPrefix}_${colName}`;
  
  if (!usedAliases.has(prefixedAlias)) {
    usedAliases.add(prefixedAlias);
    return prefixedAlias;
  }
  
  // Third try: add numeric suffix
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
 * Reads the file and extracts column names from the -- Payload section
 */
async function extractSatelliteColumns(satName: string): Promise<string[]> {
  try {
    const satPath = path.join(PATHS.satellites, `${satName}.sql`);
    const content = await fs.readFile(satPath, 'utf-8');
    
    // Look for columns after "-- Payload" comment
    const payloadMatch = content.match(/--\s*Payload[\s\S]*?FROM/i);
    if (payloadMatch) {
      const payloadSection = payloadMatch[0];
      // Extract column names (simple identifiers before FROM)
      const columnMatches = payloadSection.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*[,\n]/gim);
      const columns: string[] = [];
      for (const match of columnMatches) {
        const col = match[1].toLowerCase();
        // Skip metadata columns
        if (!EXCLUDED_COLUMNS.some(excl => col.startsWith(excl) || col === excl)) {
          columns.push(col);
        }
      }
      if (columns.length > 0) {
        return columns;
      }
    }
    
    // Fallback: Look for src.column patterns in new_records
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
    return ['*']; // Fallback if file cannot be read
  }
}

export async function createMart(input: CreateMartInput): Promise<string> {
  const { viewName, description, baseHub, satellites, links = [], subfolder } = input;
  
  const martName = viewName.startsWith('v_') ? viewName : `v_${viewName}`;
  const martDir = subfolder ? path.join(PATHS.mart, subfolder) : PATHS.mart;
  const filePath = path.join(martDir, `${martName}.sql`);
  
  // Ensure mart directory exists
  await ensureDir(martDir);
  
  // Check if file already exists
  if (await fileExists(filePath)) {
    return `❌ Fehler: ${martName}.sql existiert bereits unter ${getRelativePath(filePath)}`;
  }
  
  // Extract entity name from hub
  const entity = baseHub.replace('hub_', '');
  const hashKey = `hk_${entity}`;
  
  // Track used column aliases to ensure uniqueness
  const usedAliases = new Set<string>(['object_id', hashKey, 'hub_load_date']);
  
  // Build satellite columns with unique aliases
  // If columns contains '*', expand to actual columns from satellite file
  const satColumnsList: string[] = [];
  for (const sat of satellites) {
    const alias = sat.name.replace('sat_', 's_').replace('eff_sat_', 'es_');
    
    // Expand '*' to actual columns
    let columns = sat.columns;
    if (columns.includes('*') || columns.length === 0) {
      columns = await extractSatelliteColumns(sat.name);
    }
    
    // Skip if still '*' (could not extract)
    if (columns.includes('*')) {
      satColumnsList.push(`    -- TODO: Spalten für ${sat.name} manuell hinzufügen`);
      continue;
    }
    
    for (const col of columns) {
      const uniqueAlias = getUniqueColumnAlias(sat.name, col, usedAliases);
      if (uniqueAlias === col) {
        satColumnsList.push(`    ${alias}.${col}`);
      } else {
        satColumnsList.push(`    ${alias}.${col} AS ${uniqueAlias}`);
      }
    }
  }
  const satColumns = satColumnsList.join(',\n');
  
  // Build satellite joins
  const satJoins = satellites.map(sat => {
    const alias = sat.name.replace('sat_', 's_').replace('eff_sat_', 'es_');
    const satEntity = sat.name.replace('sat_', '').replace('eff_sat_', '');
    const satHk = `hk_${satEntity}`;
    // Use the hub's hash key if satellite is for the base entity
    const joinKey = satEntity === entity ? hashKey : satHk;
    const currentFilter = sat.currentOnly !== false ? `\n    AND ${alias}.dss_is_current = 'Y'` : '';
    return `-- ${sat.name}
LEFT JOIN {{ ref('${sat.name}') }} ${alias}
    ON h.${hashKey} = ${alias}.${joinKey}${currentFilter}`;
  }).join('\n\n');
  
  // Build link joins (if any)
  const linkJoins = links.map(link => {
    const linkAlias = link.name.replace('link_', 'l_');
    const targetEntity = link.targetHub.replace('hub_', '');
    const targetHk = `hk_${targetEntity}`;
    
    let joinSql = `-- ${link.name}
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
  
  // Build link columns with unique aliases
  const linkColumnsList: string[] = [];
  for (const link of links) {
    if (link.columns && link.targetSatellite) {
      const targetSatAlias = link.targetSatellite.replace('sat_', 's_').replace('eff_sat_', 'es_');
      for (const col of link.columns) {
        const uniqueAlias = getUniqueColumnAlias(link.targetSatellite, col, usedAliases);
        if (uniqueAlias === col) {
          linkColumnsList.push(`    ${targetSatAlias}.${col}`);
        } else {
          linkColumnsList.push(`    ${targetSatAlias}.${col} AS ${uniqueAlias}`);
        }
      }
    }
  }
  const linkColumns = linkColumnsList.join(',\n');
  
  const allColumns = [satColumns, linkColumns].filter(Boolean).join(',\n\n');
  const allJoins = [satJoins, linkJoins].filter(Boolean).join('\n\n');
  
  const schemaName = subfolder ? `mart_${subfolder}` : 'mart_project';
  
  const content = `/*
 * Mart View: ${martName}
 * Schema: ${schemaName}
 * 
 * ${description}
 * Flache, denormalisierte View für BI/Reporting.
 */

{{ config(
    materialized='view'
) }}

SELECT
    -- IDs
    h.${hashKey},
    h.object_id,
    
    -- Attribute
${allColumns},
    
    -- Metadata
    h.dss_load_date AS hub_load_date

FROM {{ ref('${baseHub}') }} h

${allJoins}

-- Ghost Records ausschließen
WHERE h.object_id > 0
`;

  await writeFile(filePath, content);
  
  return `✅ Mart View erstellt: ${getRelativePath(filePath)}

Beschreibung: ${description}
Basis: ${baseHub}
Satellites: ${satellites.map(s => s.name).join(', ')}
Links: ${links.length > 0 ? links.map(l => l.name).join(', ') : 'keine'}

Nächste Schritte:
1. View bauen: dbt run --select ${martName}
2. Im BI-Tool verbinden: ${schemaName}.${martName}`;
}

export const createMartTool = {
  name: 'create_mart',
  description: `Erstellt eine denormalisierte Mart View für BI/Reporting.
Kombiniert Hub, Satellites und optional Links in eine flache View.
Namenskonvention: v_<name>`,
  input_schema: {
    type: 'object' as const,
    properties: {
      viewName: {
        type: 'string',
        description: 'Name der View (z.B. "company_current")',
      },
      description: {
        type: 'string',
        description: 'Kurze Beschreibung der View',
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
      subfolder: {
        type: 'string',
        description: 'Unterordner im mart/ Verzeichnis',
      },
    },
    required: ['viewName', 'description', 'baseHub', 'satellites'],
  },
};
