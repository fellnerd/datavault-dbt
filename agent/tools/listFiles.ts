/**
 * Tool: List Files
 * 
 * Lists files in a directory of the dbt project.
 */

import { z } from 'zod';
import { listFiles, PROJECT_ROOT, fileExists } from '../utils/fileOperations.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export const listFilesSchema = z.object({
  directory: z.string().describe('Relativer Pfad zum Verzeichnis (z.B. "models/raw_vault/hubs")'),
});

export type ListFilesInput = z.infer<typeof listFilesSchema>;

export async function listProjectFiles(input: ListFilesInput): Promise<string> {
  const { directory } = input;
  const absolutePath = path.join(PROJECT_ROOT, directory);
  
  try {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const files = entries.filter(e => e.isFile()).map(e => `  📄 ${e.name}`);
    const dirs = entries.filter(e => e.isDirectory()).map(e => `  📁 ${e.name}/`);
    
    const all = [...dirs, ...files];
    
    if (all.length === 0) {
      return `📂 ${directory}: (leer)`;
    }
    
    return `📂 ${directory}:\n${all.join('\n')}`;
  } catch (error) {
    return `❌ Verzeichnis nicht gefunden oder nicht lesbar: ${directory}`;
  }
}

export const listFilesTool = {
  name: 'list_files',
  description: `Listet Dateien in einem Verzeichnis des dbt Projekts.
Nützlich um bestehende Models zu finden.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      directory: {
        type: 'string',
        description: 'Relativer Pfad zum Verzeichnis (z.B. "models/raw_vault/hubs")',
      },
    },
    required: ['directory'],
  },
};
