/**
 * Tool: Parquet Explorer
 * 
 * Provides tools to explore Parquet files in ADLS Gen2 via dbt macros.
 * - List files in a folder
 * - Get schema of a file (YAML for sources.yml)
 * - Preview data from a file
 */

import type Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..', '..', '..');
const VENV_PATH = path.join(PROJECT_ROOT, '.venv', 'bin');

// ============================================================================
// Helper: Execute dbt run-operation
// ============================================================================

async function runDbtOperation(macroName: string, args: Record<string, unknown>): Promise<string> {
  return new Promise((resolve) => {
    const argsJson = JSON.stringify(args);
    const command = `${VENV_PATH}/dbt`;
    const cmdArgs = ['run-operation', macroName, '--args', argsJson];
    
    const child = spawn(command, cmdArgs, {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PATH: `${VENV_PATH}:${process.env.PATH}`,
      },
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(`❌ dbt Fehler (Exit Code ${code}):\n${stderr || stdout}`);
        return;
      }
      
      // Parse dbt output - extract only the relevant lines (after timestamps)
      const lines = stdout.split('\n');
      const outputLines: string[] = [];
      let inOutput = false;
      
      for (const line of lines) {
        // Match timestamp pattern: "HH:MM:SS  content"
        const match = line.match(/^\d{2}:\d{2}:\d{2}\s{2}(.*)$/);
        if (match) {
          const content = match[1];
          // Skip dbt startup messages
          if (content.startsWith('Running with dbt=') ||
              content.startsWith('Registered adapter:') ||
              content.startsWith('[WARNING]') ||
              content.startsWith('There are') ||
              content.startsWith('- models.') ||
              content.startsWith('Found ')) {
            continue;
          }
          inOutput = true;
          outputLines.push(content);
        }
      }
      
      resolve(outputLines.join('\n').trim() || stdout);
    });
    
    child.on('error', (error) => {
      resolve(`❌ Fehler beim Ausführen von dbt: ${error.message}`);
    });
  });
}

// ============================================================================
// Tool: List Parquet Files
// ============================================================================

export interface ListParquetFilesInput {
  folder_path: string;
}

export async function listParquetFiles(input: ListParquetFilesInput): Promise<string> {
  const { folder_path } = input;
  
  if (!folder_path) {
    return '❌ folder_path ist erforderlich (z.B. "jira/sql" oder "werkportal/postgres")';
  }
  
  return runDbtOperation('list_parquet_files', { folder_path });
}

export const listParquetFilesTool: Anthropic.Messages.Tool = {
  name: 'list_parquet_files',
  description: `Listet alle Parquet-Dateien in einem ADLS-Verzeichnis auf.
Verwendet die External Data Source "StageFileSystem" über OPENROWSET.

Beispiel-Ordner:
- "jira/sql" - Jira Daten
- "werkportal/postgres" - Werkportal PostgreSQL Export

Gibt Dateinamen zurück, die für get_parquet_schema verwendet werden können.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      folder_path: {
        type: 'string',
        description: 'Pfad zum Ordner in ADLS (z.B. "jira/sql")',
      },
    },
    required: ['folder_path'],
  },
};

// ============================================================================
// Tool: Get Parquet Schema
// ============================================================================

export interface GetParquetSchemaInput {
  folder_path: string;
  file_name: string;
}

export async function getParquetSchema(input: GetParquetSchemaInput): Promise<string> {
  const { folder_path, file_name } = input;
  
  if (!folder_path || !file_name) {
    return '❌ folder_path und file_name sind erforderlich';
  }
  
  return runDbtOperation('get_parquet_schema', { folder_path, file_name });
}

export const getParquetSchemaTool: Anthropic.Messages.Tool = {
  name: 'get_parquet_schema',
  description: `Liest das Schema einer Parquet-Datei und gibt es als YAML für sources.yml aus.
Die Ausgabe kann direkt in die sources.yml kopiert werden.

Erkennt automatisch SQL Server Datentypen:
- VARCHAR → NVARCHAR(4000)
- DECIMAL/NUMERIC → DECIMAL(38,10)
- BIT, BIGINT, INT, DATE, DATETIME2, etc.

Verwendung:
1. Erst list_parquet_files aufrufen um Dateinamen zu finden
2. Dann get_parquet_schema für die gewünschte Datei`,
  input_schema: {
    type: 'object' as const,
    properties: {
      folder_path: {
        type: 'string',
        description: 'Pfad zum Ordner in ADLS (z.B. "jira/sql")',
      },
      file_name: {
        type: 'string',
        description: 'Name der Parquet-Datei (z.B. "Platform.Api_Project.parquet")',
      },
    },
    required: ['folder_path', 'file_name'],
  },
};

// ============================================================================
// Tool: Get Parquet Data
// ============================================================================

export interface GetParquetDataInput {
  folder_path: string;
  file_name: string;
  limit?: number;
}

export async function getParquetData(input: GetParquetDataInput): Promise<string> {
  const { folder_path, file_name, limit = 5 } = input;
  
  if (!folder_path || !file_name) {
    return '❌ folder_path und file_name sind erforderlich';
  }
  
  return runDbtOperation('get_parquet_data', { folder_path, file_name, limit });
}

export const getParquetDataTool: Anthropic.Messages.Tool = {
  name: 'get_parquet_data',
  description: `Liest Beispieldaten aus einer Parquet-Datei.
Zeigt die ersten N Zeilen mit allen Spalten und Werten.

Nützlich um:
- Datenqualität zu prüfen
- Business Keys zu identifizieren
- Beziehungen zu anderen Tabellen zu erkennen`,
  input_schema: {
    type: 'object' as const,
    properties: {
      folder_path: {
        type: 'string',
        description: 'Pfad zum Ordner in ADLS (z.B. "jira/sql")',
      },
      file_name: {
        type: 'string',
        description: 'Name der Parquet-Datei (z.B. "Platform.Api_Project.parquet")',
      },
      limit: {
        type: 'number',
        description: 'Anzahl der Zeilen (Standard: 5, Max: 100)',
      },
    },
    required: ['folder_path', 'file_name'],
  },
};

// ============================================================================
// Export all Parquet tools
// ============================================================================

export const parquetTools = {
  list_parquet_files: {
    tool: listParquetFilesTool,
    handler: listParquetFiles,
  },
  get_parquet_schema: {
    tool: getParquetSchemaTool,
    handler: getParquetSchema,
  },
  get_parquet_data: {
    tool: getParquetDataTool,
    handler: getParquetData,
  },
};
