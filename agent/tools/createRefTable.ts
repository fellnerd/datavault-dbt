/**
 * Tool: Create Reference Table (Seed)
 * 
 * Creates a dbt seed CSV file for reference data.
 */

import { z } from 'zod';
import * as path from 'path';
import { writeFile, PATHS, getRelativePath, fileExists } from '../utils/fileOperations.js';

export const createRefTableSchema = z.object({
  name: z.string().describe('Name der Reference Table (z.B. "role", "status")'),
  columns: z.array(z.string()).describe('Spalten-Namen'),
  rows: z.array(z.array(z.string())).describe('Datenzeilen als Array von Arrays'),
});

export type CreateRefTableInput = z.infer<typeof createRefTableSchema>;

export async function createRefTable(input: CreateRefTableInput): Promise<string> {
  const { name, columns, rows } = input;
  
  const fileName = `ref_${name}.csv`;
  const filePath = path.join(PATHS.seeds, fileName);
  
  // Check if file already exists
  if (await fileExists(filePath)) {
    return `❌ Fehler: ${fileName} existiert bereits unter ${getRelativePath(filePath)}`;
  }
  
  // Build CSV content
  const header = columns.join(',');
  const dataRows = rows.map(row => row.join(','));
  const content = [header, ...dataRows].join('\n') + '\n';
  
  await writeFile(filePath, content);
  
  return `✅ Reference Table erstellt: ${getRelativePath(filePath)}

Spalten: ${columns.join(', ')}
Zeilen: ${rows.length}

Nächste Schritte:
1. Optional: Spaltentypen in dbt_project.yml definieren
2. Seed laden: dbt seed --select ref_${name}
3. Verwendung im Model: {{ ref('ref_${name}') }}`;
}

export const createRefTableTool = {
  name: 'create_ref_table',
  description: `Erstellt eine Reference Table als dbt Seed (CSV).
Ideal für Lookup-Daten wie Status-Codes, Rollen, etc.
Namenskonvention: ref_<name>.csv`,
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Name der Reference Table (z.B. "role", "status")',
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Spalten-Namen',
      },
      rows: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'string' },
        },
        description: 'Datenzeilen als Array von Arrays',
      },
    },
    required: ['name', 'columns', 'rows'],
  },
};
