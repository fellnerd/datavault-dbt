/**
 * Tool: Create Mart View
 * 
 * Creates a denormalized view for BI/Reporting.
 */

import { z } from 'zod';
import * as path from 'path';
import { writeFile, PATHS, getRelativePath, fileExists, ensureDir } from '../utils/fileOperations.js';

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
  
  // Build satellite columns
  const satColumns = satellites.flatMap(sat => 
    sat.columns.map(col => `    ${sat.name.replace('sat_', 's_')}.${col}`)
  ).join(',\n');
  
  // Build satellite joins
  const satJoins = satellites.map((sat, idx) => {
    const alias = sat.name.replace('sat_', 's_');
    const currentFilter = sat.currentOnly !== false ? `\n    AND ${alias}.dss_is_current = 'Y'` : '';
    return `-- ${sat.name}
LEFT JOIN {{ ref('${sat.name}') }} ${alias}
    ON h.${hashKey} = ${alias}.${hashKey}${currentFilter}`;
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
      const targetSatAlias = link.targetSatellite.replace('sat_', 's_');
      joinSql += `
LEFT JOIN {{ ref('${link.targetSatellite}') }} ${targetSatAlias}
    ON ${linkAlias}.${targetHk} = ${targetSatAlias}.${targetHk}
    AND ${targetSatAlias}.dss_is_current = 'Y'`;
    }
    
    return joinSql;
  }).join('\n\n');
  
  // Build link columns (if any)
  const linkColumns = links.flatMap(link => {
    if (link.columns && link.targetSatellite) {
      const targetSatAlias = link.targetSatellite.replace('sat_', 's_');
      return link.columns.map(col => `    ${targetSatAlias}.${col}`);
    }
    return [];
  }).join(',\n');
  
  const allColumns = [satColumns, linkColumns].filter(Boolean).join(',\n\n');
  const allJoins = [satJoins, linkJoins].filter(Boolean).join('\n\n');
  
  const content = `/*
 * Mart View: ${martName}
 * Schema: mart_project
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
2. Im BI-Tool verbinden: mart_project.${martName}`;
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
