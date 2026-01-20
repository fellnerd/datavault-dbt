/**
 * Tool: List Files
 * 
 * Lists files in a directory of the dbt project.
 * Supports recursive listing for exploring project structure.
 */

import { z } from 'zod';
import { listFiles, PROJECT_ROOT, fileExists } from '../utils/fileOperations.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export const listFilesSchema = z.object({
  directory: z.string().describe('Relativer Pfad zum Verzeichnis (z.B. "models" oder "models/raw_vault/werkportal/hubs")'),
  recursive: z.boolean().optional().describe('Wenn true, listet auch Unterverzeichnisse (max 3 Ebenen)'),
});

export type ListFilesInput = z.infer<typeof listFilesSchema>;

async function listDirectoryRecursive(
  basePath: string, 
  relativePath: string, 
  depth: number = 0, 
  maxDepth: number = 3
): Promise<string[]> {
  if (depth > maxDepth) return [];
  
  const absolutePath = path.join(basePath, relativePath);
  const indent = '  '.repeat(depth);
  const results: string[] = [];
  
  try {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const files = entries.filter(e => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));
    
    for (const dir of dirs) {
      results.push(`${indent}📁 ${dir.name}/`);
      const subResults = await listDirectoryRecursive(
        basePath, 
        path.join(relativePath, dir.name), 
        depth + 1, 
        maxDepth
      );
      results.push(...subResults);
    }
    
    for (const file of files) {
      results.push(`${indent}📄 ${file.name}`);
    }
  } catch (error) {
    // Ignore unreadable directories
  }
  
  return results;
}

export async function listProjectFiles(input: ListFilesInput): Promise<string> {
  const { directory, recursive = false } = input;
  const absolutePath = path.join(PROJECT_ROOT, directory);
  
  try {
    if (recursive) {
      const results = await listDirectoryRecursive(PROJECT_ROOT, directory, 0, 3);
      if (results.length === 0) {
        return `📂 ${directory}: (leer)`;
      }
      return `📂 ${directory}/ (rekursiv):\n${results.join('\n')}`;
    }
    
    // Non-recursive (original behavior)
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
Mit recursive=true werden auch alle Unterverzeichnisse angezeigt (max 3 Ebenen).
Beispiel: list_files("models", recursive=true) zeigt die gesamte Model-Struktur.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      directory: {
        type: 'string',
        description: 'Relativer Pfad zum Verzeichnis (z.B. "models" oder "models/mart")',
      },
      recursive: {
        type: 'boolean',
        description: 'Wenn true, listet rekursiv alle Unterverzeichnisse (max 3 Ebenen). Standard: false',
      },
    },
    required: ['directory'],
  },
};
