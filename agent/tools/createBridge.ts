/**
 * Create Bridge Tool - Creates a Bridge Table for optimized multi-hub queries
 * 
 * Bridge Tables are Business Vault objects that:
 * - Connect multiple Hubs for specific query patterns
 * - Pre-calculate point-in-time snapshots
 * - Optimize complex joins for BI queries
 */

import type Anthropic from '@anthropic-ai/sdk';
import { scanProject } from '../projectScanner.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

interface CreateBridgeInput {
  name: string;
  hubs: string[];
  links: string[];
  description?: string;
}

export const createBridgeTool: Anthropic.Messages.Tool = {
  name: 'create_bridge',
  description: `Erstellt eine Bridge Table für optimierte Multi-Hub Queries.
Bridge Tables verbinden mehrere Hubs und Links für komplexe BI-Abfragen.
Sie speichern vorberechnete Joins und Point-in-Time Snapshots.

Namenskonvention: bridge_<context>
Beispiel: create_bridge(name="bridge_project_team", hubs=["hub_project", "hub_company"], links=["link_project_company"])`,
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Name der Bridge Table (bridge_<context>)',
      },
      hubs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Liste der zu verbindenden Hubs',
      },
      links: {
        type: 'array',
        items: { type: 'string' },
        description: 'Liste der zu verwendenden Links',
      },
      description: {
        type: 'string',
        description: 'Optionale Beschreibung der Bridge Table',
      },
    },
    required: ['name', 'hubs', 'links'],
  },
};

export async function createBridge(input: CreateBridgeInput): Promise<string> {
  const { name, hubs, links, description } = input;
  
  // Validate naming convention
  const bridgeName = name.startsWith('bridge_') ? name : `bridge_${name}`;
  
  // Validate hubs exist
  const metadata = await scanProject();
  const missingHubs = hubs.filter(h => {
    const hubName = h.startsWith('hub_') ? h : `hub_${h}`;
    return !metadata.hubs.find(mh => mh.fullName === hubName);
  });
  
  if (missingHubs.length > 0) {
    return `❌ Folgende Hubs existieren nicht: ${missingHubs.join(', ')}\n\nVerfügbare Hubs:\n${metadata.hubs.map(h => `- ${h.fullName}`).join('\n')}`;
  }
  
  // Validate links exist
  const missingLinks = links.filter(l => {
    const linkName = l.startsWith('link_') ? l : `link_${l}`;
    return !metadata.links.find(ml => ml.fullName === linkName);
  });
  
  if (missingLinks.length > 0) {
    return `❌ Folgende Links existieren nicht: ${missingLinks.join(', ')}\n\nVerfügbare Links:\n${metadata.links.map(l => `- ${l.fullName}`).join('\n')}`;
  }
  
  // Normalize names
  const hubRefs = hubs.map(h => h.startsWith('hub_') ? h : `hub_${h}`);
  const linkRefs = links.map(l => l.startsWith('link_') ? l : `link_${l}`);
  
  // Generate SQL
  const sql = generateBridgeSql(bridgeName, hubRefs, linkRefs, description);
  
  // Ensure directory exists
  const bridgeDir = path.join(PROJECT_ROOT, 'models', 'business_vault');
  await fs.mkdir(bridgeDir, { recursive: true });
  
  // Write file
  const filePath = path.join(bridgeDir, `${bridgeName}.sql`);
  await fs.writeFile(filePath, sql, 'utf-8');
  
  const relativePath = `models/business_vault/${bridgeName}.sql`;
  
  return `✅ Bridge Table erstellt: **${bridgeName}**

**Pfad:** ${relativePath}

**Verbundene Hubs:**
${hubRefs.map(h => `- ${h}`).join('\n')}

**Verwendete Links:**
${linkRefs.map(l => `- ${l}`).join('\n')}

**Nächste Schritte:**
1. SQL anpassen falls nötig
2. \`dbt run --select ${bridgeName}\` ausführen
3. In Mart Views verwenden für optimierte Queries

**Hinweis:** Bridge Tables sollten mit dem load_date parametrisiert werden für Point-in-Time Queries.`;
}

function generateBridgeSql(name: string, hubs: string[], links: string[], description?: string): string {
  const firstHub = hubs[0];
  const firstHubEntity = firstHub.replace('hub_', '');
  
  const lines: string[] = [];
  
  // Header
  lines.push(`{{`);
  lines.push(`  config(`);
  lines.push(`    materialized='view',`);
  lines.push(`    schema='vault'`);
  lines.push(`  )`);
  lines.push(`}}`);
  lines.push('');
  lines.push(`{#`);
  lines.push(`  Bridge Table: ${name}`);
  if (description) {
    lines.push(`  ${description}`);
  }
  lines.push(`  `);
  lines.push(`  Verbindet:`);
  for (const hub of hubs) {
    lines.push(`  - ${hub}`);
  }
  lines.push(`  `);
  lines.push(`  Über Links:`);
  for (const link of links) {
    lines.push(`  - ${link}`);
  }
  lines.push(`#}`);
  lines.push('');
  
  // CTE for date spine (if needed)
  lines.push('WITH');
  lines.push('-- Anchor Hub');
  lines.push(`${firstHub}_cte AS (`);
  lines.push(`    SELECT`);
  lines.push(`        hk_${firstHubEntity},`);
  lines.push(`        dss_load_date,`);
  lines.push(`        dss_record_source`);
  lines.push(`    FROM {{ ref('${firstHub}') }}`);
  lines.push(`),`);
  lines.push('');
  
  // Add other hubs
  for (let i = 1; i < hubs.length; i++) {
    const hub = hubs[i];
    const entity = hub.replace('hub_', '');
    lines.push(`-- ${hub}`);
    lines.push(`${hub}_cte AS (`);
    lines.push(`    SELECT`);
    lines.push(`        hk_${entity},`);
    lines.push(`        dss_load_date,`);
    lines.push(`        dss_record_source`);
    lines.push(`    FROM {{ ref('${hub}') }}`);
    lines.push(`),`);
    lines.push('');
  }
  
  // Add links
  for (const link of links) {
    const linkEntity = link.replace('link_', '');
    lines.push(`-- ${link}`);
    lines.push(`${link}_cte AS (`);
    lines.push(`    SELECT *`);
    lines.push(`    FROM {{ ref('${link}') }}`);
    lines.push(`),`);
    lines.push('');
  }
  
  // Final bridge selection
  lines.push('-- Bridge Result');
  lines.push('bridge AS (');
  lines.push('    SELECT');
  
  // Select hash keys from all hubs
  for (const hub of hubs) {
    const entity = hub.replace('hub_', '');
    lines.push(`        ${firstHub}_cte.hk_${entity === firstHubEntity ? firstHubEntity : entity},`);
  }
  
  // Select link hash keys
  for (const link of links) {
    const linkEntity = link.replace('link_', '');
    lines.push(`        ${link}_cte.hk_${linkEntity},`);
  }
  
  lines.push(`        ${firstHub}_cte.dss_load_date,`);
  lines.push(`        ${firstHub}_cte.dss_record_source`);
  lines.push(`    FROM ${firstHub}_cte`);
  
  // Join links and other hubs
  // This is a simplified version - actual joins depend on the specific model
  for (const link of links) {
    lines.push(`    INNER JOIN ${link}_cte`);
    lines.push(`        ON ${firstHub}_cte.hk_${firstHubEntity} = ${link}_cte.hk_${firstHubEntity}`);
  }
  
  lines.push(')');
  lines.push('');
  lines.push('SELECT * FROM bridge');
  
  return lines.join('\n');
}
