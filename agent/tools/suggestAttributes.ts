/**
 * Suggest Attributes Tool - Suggests available attributes for a Satellite
 * 
 * Analyzes the External Table (sources.yml) and shows which columns
 * are available but not yet used in the Satellite.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { 
  getExternalTableColumns, 
  getAvailableAttributesForSatellite,
  getSatelliteAttributes 
} from '../projectScanner.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

interface SuggestAttributesInput {
  entity: string;
  satellite?: string;
}

export const suggestAttributesTool: Anthropic.Messages.Tool = {
  name: 'suggest_attributes',
  description: `Zeigt verfügbare Attribute für einen Satellite an.
Analysiert die External Table und zeigt welche Spalten noch nicht im Satellite verwendet werden.
Nützlich beim Erweitern eines Satellites um neue Attribute.

Beispiel: suggest_attributes(entity="company")
Beispiel: suggest_attributes(entity="project", satellite="sat_project")`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entity: {
        type: 'string',
        description: 'Name der Entity (z.B. "company", "project")',
      },
      satellite: {
        type: 'string',
        description: 'Optionaler Satellite-Name (default: sat_<entity>)',
      },
    },
    required: ['entity'],
  },
};

export async function suggestAttributes(input: SuggestAttributesInput): Promise<string> {
  const { entity, satellite } = input;
  const entityLower = entity.toLowerCase();
  const satName = satellite || `sat_${entityLower}`;
  
  const lines: string[] = [];
  lines.push(`# 📋 Verfügbare Attribute für ${satName}\n`);
  
  // Get external table name
  const extTable = `ext_${entityLower}`;
  
  // Get all columns from external table
  const allColumns = await getExternalTableColumns(extTable);
  
  if (allColumns.length === 0) {
    return `❌ External Table "${extTable}" nicht gefunden in sources.yml.\n\nBitte prüfe ob die Entity in models/staging/sources.yml definiert ist.`;
  }
  
  // Get current satellite attributes
  const currentAttrs = await getSatelliteAttributes(satName);
  
  // Get available attributes (not yet in satellite)
  const { available, source } = await getAvailableAttributesForSatellite(satName, currentAttrs);
  
  // Categorize columns
  const systemCols = ['id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'];
  const hashCols = allColumns.filter(c => c.startsWith('hk_') || c.startsWith('hd_') || c.startsWith('dss_'));
  const fkCols = allColumns.filter(c => c.endsWith('_id') && !systemCols.includes(c));
  
  lines.push('## 📊 Spalten-Übersicht');
  lines.push(`| Kategorie | Anzahl |`);
  lines.push(`|-----------|--------|`);
  lines.push(`| External Table | ${allColumns.length} |`);
  lines.push(`| Aktuell im Satellite | ${currentAttrs.length} |`);
  lines.push(`| Verfügbar | ${available.length} |`);
  lines.push('');
  
  // Current attributes
  lines.push('## ✅ Aktuelle Attribute im Satellite');
  if (currentAttrs.length === 0) {
    lines.push('_Keine Attribute gefunden (Satellite existiert evtl. nicht)_\n');
  } else {
    for (const attr of currentAttrs) {
      lines.push(`- ${attr}`);
    }
    lines.push('');
  }
  
  // Available attributes grouped by type
  lines.push('## 📝 Verfügbare Attribute (nicht im Satellite)');
  
  if (available.length === 0) {
    lines.push('_Alle Attribute sind bereits im Satellite_\n');
  } else {
    // Group by category
    const availableSystem = available.filter(c => systemCols.includes(c));
    const availableFk = available.filter(c => c.endsWith('_id') && !systemCols.includes(c));
    const availableBusiness = available.filter(c => 
      !systemCols.includes(c) && 
      !c.endsWith('_id') &&
      !c.startsWith('hk_') &&
      !c.startsWith('hd_') &&
      !c.startsWith('dss_')
    );
    
    if (availableBusiness.length > 0) {
      lines.push('### 💼 Business Attribute (empfohlen)');
      for (const col of availableBusiness) {
        lines.push(`- \`${col}\``);
      }
      lines.push('');
    }
    
    if (availableFk.length > 0) {
      lines.push('### 🔗 Foreign Keys (für Links verwenden)');
      for (const col of availableFk) {
        lines.push(`- \`${col}\` _(besser als Link modellieren)_`);
      }
      lines.push('');
    }
    
    if (availableSystem.length > 0) {
      lines.push('### ⚙️ System-Spalten (optional)');
      for (const col of availableSystem) {
        lines.push(`- \`${col}\``);
      }
      lines.push('');
    }
  }
  
  // Suggestion for add_attribute
  if (available.length > 0) {
    const businessAttrs = available.filter(c => 
      !systemCols.includes(c) && 
      !c.endsWith('_id') &&
      !c.startsWith('hk_') &&
      !c.startsWith('hd_') &&
      !c.startsWith('dss_')
    );
    
    if (businessAttrs.length > 0) {
      lines.push('## 💡 Vorschlag');
      lines.push('Um ein Attribut hinzuzufügen, verwende:');
      lines.push('```');
      lines.push(`add_attribute(`);
      lines.push(`  entity="${entityLower}",`);
      lines.push(`  attribute="${businessAttrs[0]}"`);
      lines.push(`)`);
      lines.push('```');
    }
  }
  
  return lines.join('\n');
}
