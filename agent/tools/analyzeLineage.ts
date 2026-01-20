/**
 * Analyze Lineage Tool - Shows data flow and dependencies
 * 
 * Visualizes:
 * - Source → Staging → Hub → Satellite flow
 * - Model dependencies (refs)
 * - Impact analysis (what depends on this model)
 */

import type Anthropic from '@anthropic-ai/sdk';
import { scanProject } from '../projectScanner.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

interface AnalyzeLineageInput {
  model?: string;
  direction?: 'upstream' | 'downstream' | 'both';
}

export const analyzeLineageTool: Anthropic.Messages.Tool = {
  name: 'analyze_lineage',
  description: `Analysiert den Datenfluss und Dependencies im Projekt.
Zeigt:
- Upstream: Woher kommen die Daten? (Source → Model)
- Downstream: Wohin fließen die Daten? (Model → Consumers)
- Vollständige Lineage für eine Entity

Beispiel: analyze_lineage() - Gesamtübersicht
Beispiel: analyze_lineage(model="hub_company") - Lineage für ein Model
Beispiel: analyze_lineage(model="sat_project", direction="upstream")`,
  input_schema: {
    type: 'object' as const,
    properties: {
      model: {
        type: 'string',
        description: 'Spezifisches Model zum Analysieren (optional)',
      },
      direction: {
        type: 'string',
        enum: ['upstream', 'downstream', 'both'],
        description: 'Richtung der Analyse (default: both)',
      },
    },
    required: [],
  },
};

export async function analyzeLineage(input: AnalyzeLineageInput): Promise<string> {
  const { model, direction = 'both' } = input;
  const metadata = await scanProject();
  
  const lines: string[] = [];
  
  if (model) {
    // Analyze specific model
    lines.push(`# 📊 Lineage: ${model}\n`);
    
    const upstream = direction === 'both' || direction === 'upstream';
    const downstream = direction === 'both' || direction === 'downstream';
    
    if (upstream) {
      lines.push('## ⬆️ Upstream (Datenherkunft)');
      const upstreamModels = await getUpstream(model);
      if (upstreamModels.length === 0) {
        lines.push('_Keine Upstream-Dependencies (Source Level)_\n');
      } else {
        lines.push('```');
        for (let i = upstreamModels.length - 1; i >= 0; i--) {
          const indent = '  '.repeat(upstreamModels.length - 1 - i);
          const arrow = i === upstreamModels.length - 1 ? '' : '↓ ';
          lines.push(`${indent}${arrow}${upstreamModels[i]}`);
        }
        lines.push(`${'  '.repeat(upstreamModels.length)}↓ ${model}`);
        lines.push('```\n');
      }
    }
    
    if (downstream) {
      lines.push('## ⬇️ Downstream (Datenverwendung)');
      const downstreamModels = await getDownstream(model, metadata);
      if (downstreamModels.length === 0) {
        lines.push('_Keine Downstream-Dependencies_\n');
      } else {
        lines.push('```');
        lines.push(model);
        for (let i = 0; i < downstreamModels.length; i++) {
          const isLast = i === downstreamModels.length - 1;
          const prefix = isLast ? '└── ' : '├── ';
          lines.push(`${prefix}${downstreamModels[i]}`);
        }
        lines.push('```\n');
      }
    }
    
    // Impact Analysis
    const allDownstream = await getAllDownstream(model, metadata);
    if (allDownstream.length > 0) {
      lines.push('## ⚠️ Impact Analysis');
      lines.push(`Änderungen an **${model}** betreffen ${allDownstream.length} Model(s):`);
      for (const m of allDownstream) {
        lines.push(`- ${m}`);
      }
      lines.push('');
    }
    
  } else {
    // Show overall lineage
    lines.push('# 📊 Projekt-Lineage Übersicht\n');
    
    lines.push('## 🔄 Data Vault Datenfluss');
    lines.push('```');
    lines.push('┌─────────────────────────────────────────────────────────┐');
    lines.push('│                    EXTERNAL TABLES                       │');
    lines.push('│  (ADLS Parquet via PolyBase)                            │');
    lines.push('└────────────────────────┬────────────────────────────────┘');
    lines.push('                         │');
    lines.push('                         ▼');
    lines.push('┌─────────────────────────────────────────────────────────┐');
    lines.push('│                    STAGING LAYER                         │');
    lines.push('│  stg_* Views - Hash Calculation, Data Preparation       │');
    lines.push('└────────────────────────┬────────────────────────────────┘');
    lines.push('                         │');
    lines.push('          ┌──────────────┼──────────────┐');
    lines.push('          ▼              ▼              ▼');
    lines.push('┌─────────────┐  ┌─────────────┐  ┌─────────────┐');
    lines.push('│    HUBS     │  │  SATELLITES │  │    LINKS    │');
    lines.push('│  hub_*      │◄─│  sat_*      │  │  link_*     │');
    lines.push('│  (Bus.Keys) │  │  (History)  │  │  (Relations)│');
    lines.push('└──────┬──────┘  └──────┬──────┘  └──────┬──────┘');
    lines.push('       │                │                │');
    lines.push('       └────────────────┼────────────────┘');
    lines.push('                        ▼');
    lines.push('┌─────────────────────────────────────────────────────────┐');
    lines.push('│                   BUSINESS VAULT                         │');
    lines.push('│  pit_* (Point-in-Time), bridge_*, business rules        │');
    lines.push('└────────────────────────┬────────────────────────────────┘');
    lines.push('                         │');
    lines.push('                         ▼');
    lines.push('┌─────────────────────────────────────────────────────────┐');
    lines.push('│                    MART LAYER                            │');
    lines.push('│  Denormalized views for BI/Reporting                    │');
    lines.push('└─────────────────────────────────────────────────────────┘');
    lines.push('```\n');
    
    // List entities with their flow
    lines.push('## 📋 Entity Lineage');
    
    for (const hub of metadata.hubs) {
      const entity = hub.name;
      const sats = metadata.satellites.filter(s => 
        s.parentHub === hub.fullName || s.name === entity || s.name.startsWith(entity + '_')
      );
      const links = metadata.links.filter(l => l.connectedHubs.includes(hub.fullName));
      const marts = metadata.marts.filter(m => 
        m.usedModels.some(ref => ref.includes(entity) || ref.includes(hub.fullName))
      );
      
      lines.push(`### ${entity}`);
      lines.push('```');
      lines.push(`ext_${entity} → stg_${entity} → ${hub.fullName}`);
      for (const sat of sats) {
        lines.push(`                          └─→ ${sat.fullName}`);
      }
      for (const link of links) {
        lines.push(`                          └─→ ${link.fullName}`);
      }
      for (const mart of marts) {
        lines.push(`                                    └─→ ${mart.name}`);
      }
      lines.push('```\n');
    }
    
    // Orphan detection
    const orphanSats = metadata.satellites.filter(s => 
      !s.parentHub || !metadata.hubs.find(h => h.fullName === s.parentHub)
    );
    
    if (orphanSats.length > 0) {
      lines.push('## ⚠️ Warnungen');
      lines.push('### Satellites ohne erkannten Parent Hub');
      for (const sat of orphanSats) {
        lines.push(`- ${sat.fullName} (erwartet: ${sat.parentHub || 'unbekannt'})`);
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Get upstream dependencies (what this model depends on)
 */
async function getUpstream(model: string): Promise<string[]> {
  const upstream: string[] = [];
  
  // Determine file path based on model name
  let filePath: string;
  if (model.startsWith('hub_')) {
    filePath = path.join(PROJECT_ROOT, 'models', 'raw_vault', 'hubs', `${model}.sql`);
  } else if (model.startsWith('sat_') || model.startsWith('eff_sat_')) {
    filePath = path.join(PROJECT_ROOT, 'models', 'raw_vault', 'satellites', `${model}.sql`);
  } else if (model.startsWith('link_')) {
    filePath = path.join(PROJECT_ROOT, 'models', 'raw_vault', 'links', `${model}.sql`);
  } else if (model.startsWith('stg_')) {
    filePath = path.join(PROJECT_ROOT, 'models', 'staging', `${model}.sql`);
  } else if (model.startsWith('pit_') || model.startsWith('bridge_')) {
    filePath = path.join(PROJECT_ROOT, 'models', 'business_vault', `${model}.sql`);
  } else {
    // Check marts
    filePath = path.join(PROJECT_ROOT, 'models', 'mart', `${model}.sql`);
  }
  
  try {
    const sql = await fs.readFile(filePath, 'utf-8');
    
    // Extract refs
    const refMatches = sql.matchAll(/ref\(['"](\w+)['"]\)/g);
    for (const match of refMatches) {
      upstream.push(match[1]);
    }
    
    // Extract sources
    const sourceMatches = sql.matchAll(/source\(['"](\w+)['"],\s*['"](\w+)['"]\)/g);
    for (const match of sourceMatches) {
      upstream.push(`source: ${match[1]}.${match[2]}`);
    }
  } catch {}
  
  return upstream;
}

/**
 * Get direct downstream dependencies (what uses this model)
 */
async function getDownstream(model: string, metadata: Awaited<ReturnType<typeof scanProject>>): Promise<string[]> {
  const downstream: string[] = [];
  
  // Check all satellites
  for (const sat of metadata.satellites) {
    const satPath = path.join(PROJECT_ROOT, sat.filePath);
    try {
      const sql = await fs.readFile(satPath, 'utf-8');
      if (sql.includes(`ref('${model}')`)) {
        downstream.push(sat.fullName);
      }
    } catch {}
  }
  
  // Check all links
  for (const link of metadata.links) {
    const linkPath = path.join(PROJECT_ROOT, link.filePath);
    try {
      const sql = await fs.readFile(linkPath, 'utf-8');
      if (sql.includes(`ref('${model}')`)) {
        downstream.push(link.fullName);
      }
    } catch {}
  }
  
  // Check all marts
  for (const mart of metadata.marts) {
    if (mart.usedModels.includes(model)) {
      downstream.push(mart.name);
    }
  }
  
  return downstream;
}

/**
 * Get all downstream dependencies recursively
 */
async function getAllDownstream(model: string, metadata: Awaited<ReturnType<typeof scanProject>>): Promise<string[]> {
  const all = new Set<string>();
  const queue = [model];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    const downstream = await getDownstream(current, metadata);
    
    for (const d of downstream) {
      if (!all.has(d)) {
        all.add(d);
        queue.push(d);
      }
    }
  }
  
  return Array.from(all);
}
