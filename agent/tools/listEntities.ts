/**
 * List Entities Tool - Shows all Data Vault entities in the project
 * 
 * Provides a comprehensive overview of:
 * - Hubs (Business Keys)
 * - Satellites (Attributes)
 * - Links (Relationships)
 * - Staging Views
 * - Marts
 * - Seeds
 */

import type Anthropic from '@anthropic-ai/sdk';
import { scanProject, type ProjectMetadata } from '../projectScanner.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

interface ListEntitiesInput {
  type?: 'all' | 'hubs' | 'satellites' | 'links' | 'staging' | 'marts' | 'seeds';
  verbose?: boolean;
}

export const listEntitiesTool: Anthropic.Messages.Tool = {
  name: 'list_entities',
  description: `Listet alle Data Vault Entities im Projekt auf.
Zeigt eine Übersicht aller Hubs, Satellites, Links, Staging Views, Marts und Seeds.
Nutze type='all' für Gesamtübersicht oder filtere nach Typ.
Mit verbose=true werden zusätzliche Details angezeigt.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['all', 'hubs', 'satellites', 'links', 'staging', 'marts', 'seeds'],
        description: 'Typ der Entities (default: all)',
      },
      verbose: {
        type: 'boolean',
        description: 'Zeige zusätzliche Details wie Spalten und Dependencies',
      },
    },
    required: [],
  },
};

export async function listEntities(input: ListEntitiesInput): Promise<string> {
  const { type = 'all', verbose = false } = input;
  
  const metadata = await scanProject();
  const staging = await scanStagingViews();
  
  const lines: string[] = ['# 📊 Data Vault Projekt Übersicht\n'];
  
  // Summary
  lines.push('## Zusammenfassung');
  lines.push(`| Typ | Anzahl |`);
  lines.push(`|-----|--------|`);
  lines.push(`| Hubs | ${metadata.hubs.length} |`);
  lines.push(`| Satellites | ${metadata.satellites.length} |`);
  lines.push(`| Links | ${metadata.links.length} |`);
  lines.push(`| Staging Views | ${staging.length} |`);
  lines.push(`| Marts | ${metadata.marts.length} |`);
  lines.push(`| Seeds | ${metadata.seeds.length} |`);
  lines.push('');
  
  // Hubs
  if (type === 'all' || type === 'hubs') {
    lines.push('## 🔑 Hubs (Business Keys)');
    if (metadata.hubs.length === 0) {
      lines.push('_Keine Hubs vorhanden_\n');
    } else {
      for (const hub of metadata.hubs) {
        const satCount = metadata.satellites.filter(s => s.parentHub === hub.fullName).length;
        if (verbose) {
          lines.push(`### ${hub.fullName}`);
          lines.push(`- **Business Key:** ${hub.businessKey || 'nicht erkannt'}`);
          lines.push(`- **Satellites:** ${satCount}`);
          lines.push(`- **Pfad:** ${hub.filePath}`);
          lines.push('');
        } else {
          lines.push(`- **${hub.fullName}** (${hub.businessKey || '?'}) - ${satCount} Satellite(s)`);
        }
      }
      lines.push('');
    }
  }
  
  // Satellites
  if (type === 'all' || type === 'satellites') {
    lines.push('## 📋 Satellites (Attribute History)');
    if (metadata.satellites.length === 0) {
      lines.push('_Keine Satellites vorhanden_\n');
    } else {
      // Group by parent hub
      const grouped = new Map<string, typeof metadata.satellites>();
      for (const sat of metadata.satellites) {
        const parent = sat.parentHub || 'unbekannt';
        if (!grouped.has(parent)) grouped.set(parent, []);
        grouped.get(parent)!.push(sat);
      }
      
      for (const [parent, sats] of grouped) {
        if (verbose) {
          lines.push(`### ${parent}`);
          for (const sat of sats) {
            const prefix = sat.isEffectivity ? '⏱️' : '📄';
            lines.push(`#### ${prefix} ${sat.fullName}`);
            if (sat.attributes.length > 0) {
              lines.push(`- **Attribute:** ${sat.attributes.slice(0, 10).join(', ')}${sat.attributes.length > 10 ? '...' : ''}`);
            }
            lines.push(`- **Pfad:** ${sat.filePath}`);
          }
          lines.push('');
        } else {
          for (const sat of sats) {
            const prefix = sat.isEffectivity ? '⏱️' : '📄';
            lines.push(`- ${prefix} **${sat.fullName}** → ${parent}`);
          }
        }
      }
      lines.push('');
    }
  }
  
  // Links
  if (type === 'all' || type === 'links') {
    lines.push('## 🔗 Links (Relationships)');
    if (metadata.links.length === 0) {
      lines.push('_Keine Links vorhanden_\n');
    } else {
      for (const link of metadata.links) {
        if (verbose) {
          lines.push(`### ${link.fullName}`);
          lines.push(`- **Verbindet:** ${link.connectedHubs.join(' ↔ ')}`);
          lines.push(`- **Pfad:** ${link.filePath}`);
          lines.push('');
        } else {
          lines.push(`- **${link.fullName}:** ${link.connectedHubs.join(' ↔ ')}`);
        }
      }
      lines.push('');
    }
  }
  
  // Staging
  if (type === 'all' || type === 'staging') {
    lines.push('## 🔄 Staging Views');
    if (staging.length === 0) {
      lines.push('_Keine Staging Views vorhanden_\n');
    } else {
      for (const stg of staging) {
        if (verbose) {
          lines.push(`- **${stg.name}** → Source: ${stg.source || 'unbekannt'}`);
        } else {
          lines.push(`- ${stg.name}`);
        }
      }
      lines.push('');
    }
  }
  
  // Marts
  if (type === 'all' || type === 'marts') {
    lines.push('## 📈 Marts (Business Views)');
    if (metadata.marts.length === 0) {
      lines.push('_Keine Marts vorhanden_\n');
    } else {
      // Group by schema
      const grouped = new Map<string, typeof metadata.marts>();
      for (const mart of metadata.marts) {
        if (!grouped.has(mart.schema)) grouped.set(mart.schema, []);
        grouped.get(mart.schema)!.push(mart);
      }
      
      for (const [schema, marts] of grouped) {
        lines.push(`### Schema: ${schema}`);
        for (const mart of marts) {
          if (verbose) {
            lines.push(`- **${mart.name}**`);
            if (mart.usedModels.length > 0) {
              lines.push(`  - Verwendet: ${mart.usedModels.join(', ')}`);
            }
          } else {
            lines.push(`- ${mart.name}`);
          }
        }
        lines.push('');
      }
    }
  }
  
  // Seeds
  if (type === 'all' || type === 'seeds') {
    lines.push('## 📚 Seeds (Reference Data)');
    if (metadata.seeds.length === 0) {
      lines.push('_Keine Seeds vorhanden_\n');
    } else {
      for (const seed of metadata.seeds) {
        if (verbose && seed.columns) {
          lines.push(`- **${seed.name}**: ${seed.columns.join(', ')}`);
        } else {
          lines.push(`- ${seed.name}`);
        }
      }
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

/**
 * Scan staging views
 */
async function scanStagingViews(): Promise<Array<{name: string; source?: string}>> {
  const stagingDir = path.join(PROJECT_ROOT, 'models', 'staging');
  const views: Array<{name: string; source?: string}> = [];
  
  try {
    const files = await fs.readdir(stagingDir);
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;
      if (file === 'sources.yml') continue;
      
      const name = file.replace('.sql', '');
      const content = await fs.readFile(path.join(stagingDir, file), 'utf-8');
      
      // Extract source from SQL
      const sourceMatch = content.match(/source\(['"](\w+)['"],\s*['"](\w+)['"]\)/);
      const source = sourceMatch ? `${sourceMatch[1]}.${sourceMatch[2]}` : undefined;
      
      views.push({ name, source });
    }
  } catch (error) {
    // Directory doesn't exist
  }
  
  return views;
}
