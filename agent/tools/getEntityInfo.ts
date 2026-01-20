/**
 * Get Entity Info Tool - Shows detailed information about a specific entity
 * 
 * Displays:
 * - Hub information (business key, hash key)
 * - All related Satellites with attributes
 * - Related Links
 * - Staging View
 * - Mart Views using this entity
 * - Data lineage (source → staging → hub → sat)
 */

import type Anthropic from '@anthropic-ai/sdk';
import { scanProject } from '../projectScanner.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

interface GetEntityInfoInput {
  entity: string;
}

export const getEntityInfoTool: Anthropic.Messages.Tool = {
  name: 'get_entity_info',
  description: `Zeigt detaillierte Informationen zu einer Entity.
Gibt einen vollständigen Überblick über alle Komponenten:
- Hub (Business Key, Hash Key)
- Satellites (Attribute, History)
- Links (Beziehungen)
- Staging View
- Mart Views
- Datenfluss (Lineage)

Beispiel: get_entity_info(entity="company")`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entity: {
        type: 'string',
        description: 'Name der Entity (z.B. "company", "project", "country")',
      },
    },
    required: ['entity'],
  },
};

export async function getEntityInfo(input: GetEntityInfoInput): Promise<string> {
  const { entity } = input;
  const entityLower = entity.toLowerCase().replace('hub_', '').replace('sat_', '');
  
  const metadata = await scanProject();
  const lines: string[] = [];
  
  // Find Hub
  const hub = metadata.hubs.find(h => 
    h.name === entityLower || h.fullName === entity
  );
  
  if (!hub) {
    // Check if entity exists as satellite or link
    const sat = metadata.satellites.find(s => s.name === entityLower || s.fullName === entity);
    const link = metadata.links.find(l => l.name === entityLower || l.fullName === entity);
    
    if (sat) {
      return await getSatelliteDetails(sat);
    }
    if (link) {
      return await getLinkDetails(link);
    }
    
    return `❌ Entity "${entity}" nicht gefunden.\n\nVerfügbare Entities:\n${metadata.hubs.map(h => `- ${h.name}`).join('\n')}`;
  }
  
  lines.push(`# 🏛️ Entity: ${entityLower}\n`);
  
  // Hub Info
  lines.push('## 🔑 Hub');
  lines.push(`| Eigenschaft | Wert |`);
  lines.push(`|-------------|------|`);
  lines.push(`| Name | ${hub.fullName} |`);
  lines.push(`| Business Key | ${hub.businessKey || 'nicht erkannt'} |`);
  lines.push(`| Hash Key | hk_${entityLower} |`);
  lines.push(`| Pfad | ${hub.filePath} |`);
  lines.push('');
  
  // Hub SQL Preview
  try {
    const hubSql = await fs.readFile(path.join(PROJECT_ROOT, hub.filePath), 'utf-8');
    const preview = hubSql.split('\n').slice(0, 20).join('\n');
    lines.push('<details><summary>SQL Preview</summary>\n');
    lines.push('```sql');
    lines.push(preview);
    lines.push('```\n</details>\n');
  } catch {}
  
  // Satellites
  const satellites = metadata.satellites.filter(s => 
    s.parentHub === hub.fullName || 
    s.name === entityLower ||
    s.name.startsWith(entityLower + '_')
  );
  
  lines.push('## 📋 Satellites');
  if (satellites.length === 0) {
    lines.push('_Keine Satellites vorhanden_\n');
  } else {
    for (const sat of satellites) {
      const icon = sat.isEffectivity ? '⏱️' : '📄';
      lines.push(`### ${icon} ${sat.fullName}`);
      lines.push(`- **Pfad:** ${sat.filePath}`);
      
      if (sat.attributes.length > 0) {
        lines.push(`- **Attribute:** ${sat.attributes.length}`);
        lines.push('  ```');
        for (const attr of sat.attributes) {
          lines.push(`  - ${attr}`);
        }
        lines.push('  ```');
      }
      lines.push('');
    }
  }
  
  // Related Links
  const links = metadata.links.filter(l => 
    l.connectedHubs.includes(hub.fullName)
  );
  
  lines.push('## 🔗 Verknüpfte Links');
  if (links.length === 0) {
    lines.push('_Keine Links vorhanden_\n');
  } else {
    for (const link of links) {
      const otherHubs = link.connectedHubs.filter(h => h !== hub.fullName);
      lines.push(`- **${link.fullName}** → ${otherHubs.join(', ')}`);
    }
    lines.push('');
  }
  
  // Staging View
  lines.push('## 🔄 Staging');
  const stagingPath = path.join(PROJECT_ROOT, 'models', 'staging', `stg_${entityLower}.sql`);
  try {
    const stagingSql = await fs.readFile(stagingPath, 'utf-8');
    lines.push(`- **Staging View:** stg_${entityLower}`);
    lines.push(`- **Pfad:** models/staging/stg_${entityLower}.sql`);
    
    // Extract source
    const sourceMatch = stagingSql.match(/source\(['"](\w+)['"],\s*['"](\w+)['"]\)/);
    if (sourceMatch) {
      lines.push(`- **Source:** ${sourceMatch[1]}.${sourceMatch[2]}`);
    }
    lines.push('');
  } catch {
    lines.push(`_Staging View stg_${entityLower} nicht vorhanden_\n`);
  }
  
  // Marts using this entity
  const marts = metadata.marts.filter(m => 
    m.usedModels.some(ref => 
      ref.includes(entityLower) || 
      ref.includes(hub.fullName)
    )
  );
  
  lines.push('## 📈 Marts');
  if (marts.length === 0) {
    lines.push('_Keine Mart Views verwenden diese Entity_\n');
  } else {
    for (const mart of marts) {
      lines.push(`- **${mart.name}** (${mart.schema})`);
    }
    lines.push('');
  }
  
  // Data Lineage
  lines.push('## 📊 Datenfluss (Lineage)');
  lines.push('```');
  lines.push(`Source (External Table)`);
  lines.push(`    ↓`);
  lines.push(`stg_${entityLower} (Staging View + Hashing)`);
  lines.push(`    ↓`);
  lines.push(`${hub.fullName} (Business Key)`);
  for (const sat of satellites) {
    lines.push(`    ├── ${sat.fullName} (Attributes)`);
  }
  for (const link of links) {
    lines.push(`    └── ${link.fullName} (Relationship)`);
  }
  lines.push('```\n');
  
  // Completeness Check
  lines.push('## ✅ Vollständigkeit');
  const checks = [
    { name: 'Hub', ok: true },
    { name: 'Satellite', ok: satellites.length > 0 },
    { name: 'Staging View', ok: await fileExists(stagingPath) },
  ];
  
  for (const check of checks) {
    const icon = check.ok ? '✅' : '❌';
    lines.push(`- ${icon} ${check.name}`);
  }
  
  return lines.join('\n');
}

async function getSatelliteDetails(sat: { fullName: string; filePath: string; parentHub?: string; attributes: string[] }): Promise<string> {
  const lines = [`# 📋 Satellite: ${sat.fullName}\n`];
  
  lines.push('| Eigenschaft | Wert |');
  lines.push('|-------------|------|');
  lines.push(`| Name | ${sat.fullName} |`);
  lines.push(`| Parent Hub | ${sat.parentHub || 'unbekannt'} |`);
  lines.push(`| Pfad | ${sat.filePath} |`);
  lines.push(`| Attribute | ${sat.attributes.length} |`);
  lines.push('');
  
  if (sat.attributes.length > 0) {
    lines.push('## Attribute');
    for (const attr of sat.attributes) {
      lines.push(`- ${attr}`);
    }
  }
  
  return lines.join('\n');
}

async function getLinkDetails(link: { fullName: string; filePath: string; connectedHubs: string[] }): Promise<string> {
  const lines = [`# 🔗 Link: ${link.fullName}\n`];
  
  lines.push('| Eigenschaft | Wert |');
  lines.push('|-------------|------|');
  lines.push(`| Name | ${link.fullName} |`);
  lines.push(`| Verbindet | ${link.connectedHubs.join(' ↔ ')} |`);
  lines.push(`| Pfad | ${link.filePath} |`);
  
  return lines.join('\n');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
