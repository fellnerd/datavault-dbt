/**
 * Tool: Edit Model File
 * 
 * Edits an existing dbt model file with AI assistance.
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  PATHS, 
  getRelativePath, 
  fileExists, 
  readFile, 
  writeFile,
  getConceptPaths,
  getAvailableConcepts 
} from '../utils/fileOperations.js';
import { resultBox, formatError } from '../ui.js';
import type Anthropic from '@anthropic-ai/sdk';

export const editModelSchema = z.object({
  modelName: z.string().describe('Name des Models (z.B. "hub_company", "sat_company", "stg_company")'),
  newContent: z.string().describe('Der neue vollständige Inhalt der Datei'),
  reason: z.string().optional().describe('Grund für die Änderung'),
});

export type EditModelInput = z.infer<typeof editModelSchema>;

// Tool definition for Claude API
export const editModelTool: Anthropic.Messages.Tool = {
  name: 'edit_model',
  description: `Bearbeitet eine existierende dbt Model-Datei. Verwende dieses Tool um:
- Spalten zu Staging/Satellite hinzuzufügen oder zu entfernen
- SQL-Logik zu korrigieren
- Kommentare zu aktualisieren

Der vollständige neue Inhalt der Datei muss übergeben werden.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      modelName: {
        type: 'string',
        description: 'Name des Models (z.B. "hub_company", "sat_company")',
      },
      newContent: {
        type: 'string',
        description: 'Der neue vollständige Inhalt der Datei',
      },
      reason: {
        type: 'string',
        description: 'Grund für die Änderung (optional)',
      },
    },
    required: ['modelName', 'newContent'],
  },
};

/**
 * Find the file path for a model by searching all concept directories
 */
async function findModelPath(modelName: string): Promise<string | null> {
  const normalizedName = modelName.replace(/\.sql$/, '');
  
  // Staging - fixed location
  if (normalizedName.startsWith('stg_')) {
    const stagingPath = path.join(PATHS.staging, `${normalizedName}.sql`);
    if (await fileExists(stagingPath)) return stagingPath;
    return null;
  }
  
  // Business Vault - fixed location
  if (normalizedName.startsWith('pit_') || normalizedName.startsWith('bridge_')) {
    const bvPath = path.join(PATHS.businessVault, `${normalizedName}.sql`);
    if (await fileExists(bvPath)) return bvPath;
    return null;
  }
  
  // Raw Vault objects - search in all concept directories
  if (normalizedName.startsWith('hub_') || 
      normalizedName.startsWith('sat_') || 
      normalizedName.startsWith('eff_sat_') ||
      normalizedName.startsWith('link_')) {
    
    const concepts = await getAvailableConcepts();
    
    for (const concept of concepts) {
      const conceptPaths = getConceptPaths(concept);
      let testPath: string;
      
      if (normalizedName.startsWith('hub_')) {
        testPath = path.join(conceptPaths.hubs, `${normalizedName}.sql`);
      } else if (normalizedName.startsWith('sat_') || normalizedName.startsWith('eff_sat_')) {
        testPath = path.join(conceptPaths.satellites, `${normalizedName}.sql`);
      } else if (normalizedName.startsWith('link_')) {
        testPath = path.join(conceptPaths.links, `${normalizedName}.sql`);
      } else {
        continue;
      }
      
      if (await fileExists(testPath)) return testPath;
    }
    return null;
  }
  
  // Mart views - search in subdirectories
  if (normalizedName.endsWith('_v') || normalizedName.endsWith('_view')) {
    return null; // Will be handled separately
  }
  
  return null;
}

/**
 * Edit an existing model file
 */
export async function editModel(input: EditModelInput): Promise<string> {
  const { modelName, newContent, reason } = input;
  
  const output: string[] = [];
  
  // Find the file path
  let filePath = await findModelPath(modelName);
  
  // For mart views, try to find in subdirectories
  if (!filePath) {
    const martDirs = ['_common', 'customer', 'project', 'reporting', 'operations'];
    for (const dir of martDirs) {
      const testPath = path.join(PATHS.mart, dir, `${modelName}.sql`);
      if (await fileExists(testPath)) {
        filePath = testPath;
        break;
      }
    }
  }
  
  if (!filePath) {
    output.push(formatError('FILE_NOT_FOUND', modelName, 'Model nicht gefunden. Prüfe den Namen.'));
    return output.join('\n');
  }
  
  // Check if file exists
  if (!await fileExists(filePath)) {
    output.push(formatError('FILE_NOT_FOUND', getRelativePath(filePath), 'Datei existiert nicht.'));
    return output.join('\n');
  }
  
  // Read old content for backup info
  const oldContent = await readFile(filePath);
  
  // Write new content
  try {
    await writeFile(filePath, newContent);
    
    output.push(resultBox({
      status: 'OK',
      title: `Updated: ${modelName}`,
      details: {
        'Path': getRelativePath(filePath),
        'Reason': reason || 'Nicht angegeben',
        'Lines Before': String(oldContent.split('\n').length),
        'Lines After': String(newContent.split('\n').length),
      },
    }));
    
    output.push(`
[NEXT]
  dbt compile --select ${modelName}
  dbt run --select ${modelName}`);
    
  } catch (error) {
    output.push(formatError('WRITE_FAILED', filePath, String(error)));
  }
  
  return output.join('\n');
}
