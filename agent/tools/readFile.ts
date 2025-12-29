/**
 * Tool: Read File
 * 
 * Reads content from a file in the dbt project.
 */

import { z } from 'zod';
import { readFile, PROJECT_ROOT, fileExists } from '../utils/fileOperations.js';
import * as path from 'path';

export const readFileSchema = z.object({
  filePath: z.string().describe('Relativer Pfad zur Datei (z.B. "models/staging/stg_company.sql")'),
});

export type ReadFileInput = z.infer<typeof readFileSchema>;

export async function readProjectFile(input: ReadFileInput): Promise<string> {
  const { filePath } = input;
  const absolutePath = path.join(PROJECT_ROOT, filePath);
  
  if (!await fileExists(absolutePath)) {
    return `❌ Datei nicht gefunden: ${filePath}`;
  }
  
  try {
    const content = await readFile(absolutePath);
    return `📄 Inhalt von ${filePath}:\n\n\`\`\`\n${content}\n\`\`\``;
  } catch (error) {
    return `❌ Fehler beim Lesen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

export const readFileTool = {
  name: 'read_file',
  description: `Liest den Inhalt einer Datei im dbt Projekt.
Nützlich um bestehende Models, Konfigurationen oder Templates zu analysieren.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      filePath: {
        type: 'string',
        description: 'Relativer Pfad zur Datei (z.B. "models/staging/stg_company.sql")',
      },
    },
    required: ['filePath'],
  },
};
