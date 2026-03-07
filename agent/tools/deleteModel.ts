/**
 * Tool: Delete Model File
 * 
 * Deletes an existing dbt model file with confirmation.
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  PATHS, 
  getRelativePath, 
  fileExists,
  getConceptPaths,
  getAvailableConcepts 
} from '../utils/fileOperations.js';
import { resultBox, formatError } from '../ui.js';
import type Anthropic from '@anthropic-ai/sdk';

export const deleteModelSchema = z.object({
  modelName: z.string().describe('Name des Models (z.B. "hub_company", "sat_company")'),
  confirmed: z.boolean().describe('Bestätigung dass das Model gelöscht werden soll'),
});

export type DeleteModelInput = z.infer<typeof deleteModelSchema>;

// Tool definition for Claude API
export const deleteModelTool: Anthropic.Messages.Tool = {
  name: 'delete_model',
  description: `Löscht eine dbt Model-Datei. ACHTUNG: Diese Aktion kann nicht rückgängig gemacht werden!
Verwende dieses Tool nur wenn der User explizit um Löschung gebeten hat.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      modelName: {
        type: 'string',
        description: 'Name des Models (z.B. "hub_company", "sat_company")',
      },
      confirmed: {
        type: 'boolean',
        description: 'Muss true sein um die Löschung zu bestätigen',
      },
    },
    required: ['modelName', 'confirmed'],
  },
};

/**
 * Find all possible paths for a model by searching all concept directories
 */
async function findModelPaths(modelName: string): Promise<string[]> {
  const normalizedName = modelName.replace(/\.sql$/, '');
  const possiblePaths: string[] = [];
  
  // Staging - fixed location
  if (normalizedName.startsWith('stg_')) {
    possiblePaths.push(path.join(PATHS.staging, `${normalizedName}.sql`));
  }
  
  // Business Vault - fixed location
  if (normalizedName.startsWith('pit_') || normalizedName.startsWith('bridge_')) {
    possiblePaths.push(path.join(PATHS.businessVault, `${normalizedName}.sql`));
  }
  
  // Raw Vault objects - search in all concept directories
  if (normalizedName.startsWith('hub_') || 
      normalizedName.startsWith('sat_') || 
      normalizedName.startsWith('eff_sat_') ||
      normalizedName.startsWith('link_')) {
    
    const concepts = await getAvailableConcepts();
    
    for (const concept of concepts) {
      const conceptPaths = getConceptPaths(concept);
      
      if (normalizedName.startsWith('hub_')) {
        possiblePaths.push(path.join(conceptPaths.hubs, `${normalizedName}.sql`));
      } else if (normalizedName.startsWith('sat_') || normalizedName.startsWith('eff_sat_')) {
        possiblePaths.push(path.join(conceptPaths.satellites, `${normalizedName}.sql`));
      } else if (normalizedName.startsWith('link_')) {
        possiblePaths.push(path.join(conceptPaths.links, `${normalizedName}.sql`));
      }
    }
  }
  
  // For mart views, check subdirectories
  const martDirs = ['_common', 'customer', 'project', 'reporting', 'operations'];
  for (const dir of martDirs) {
    possiblePaths.push(path.join(PATHS.mart, dir, `${normalizedName}.sql`));
  }
  
  // Also check seeds
  possiblePaths.push(path.join(PATHS.seeds, `${normalizedName}.csv`));
  
  // Filter to only existing files
  const existingPaths: string[] = [];
  for (const p of possiblePaths) {
    if (await fileExists(p)) {
      existingPaths.push(p);
    }
  }
  
  return existingPaths;
}

/**
 * Delete an existing model file
 */
export async function deleteModel(input: DeleteModelInput): Promise<string> {
  const { modelName, confirmed } = input;
  
  const output: string[] = [];
  
  // Check confirmation
  if (!confirmed) {
    output.push(formatError('OP_NOT_CONFIRMED', modelName, 'Löschung muss mit confirmed=true bestätigt werden'));
    return output.join('\n');
  }
  
  // Find the file paths
  const filePaths = await findModelPaths(modelName);
  
  if (filePaths.length === 0) {
    output.push(formatError('FILE_NOT_FOUND', modelName, 'Model nicht gefunden. Prüfe den Namen.'));
    return output.join('\n');
  }
  
  // Delete all matching files
  const deletedFiles: string[] = [];
  const errors: string[] = [];
  
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
      deletedFiles.push(getRelativePath(filePath));
    } catch (error) {
      errors.push(`${getRelativePath(filePath)}: ${error}`);
    }
  }
  
  if (deletedFiles.length > 0) {
    output.push(resultBox({
      status: 'OK',
      title: `Deleted: ${modelName}`,
      details: {
        'Deleted Files': deletedFiles.join(', '),
        'Count': String(deletedFiles.length),
      },
    }));
  }
  
  if (errors.length > 0) {
    output.push(formatError('DELETE_FAILED', modelName, errors.join('\n')));
  }
  
  output.push(`
[WARN] Prüfe ob andere Models dieses Model referenzieren:
  grep -r "ref('${modelName}')" models/
  
[NEXT] Falls nötig, entferne Referenzen in:
  - schema.yml
  - sources.yml (für External Tables)`);
  
  return output.join('\n');
}
