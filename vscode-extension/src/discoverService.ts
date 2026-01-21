/**
 * Discover Service
 * 
 * Provides functionality to discover Parquet files from Azure Storage
 * and add them as External Tables to sources.yml
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import * as yaml from 'yaml';

// ============================================================================
// Types
// ============================================================================

export interface ParquetFile {
  fileName: string;
  fullPath: string;
}

export interface ExternalTableDefinition {
  name: string;
  description: string;
  external: {
    location: string;
    file_format: string;
    data_source: string;
  };
  columns: Array<{
    name: string;
    data_type: string;
  }>;
}

export interface DiscoverResult {
  success: boolean;
  tables: ExternalTableDefinition[];
  errors: string[];
}

// ============================================================================
// dbt Execution Helper
// ============================================================================

/**
 * Get the dbt executable path
 */
export function getDbtPath(projectPath: string): string {
  const config = vscode.workspace.getConfiguration('datavault');
  const configuredPath = config.get<string>('dbtPath', '');
  
  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }
  
  // Auto-detect: Check .venv in project
  const isWindows = process.platform === 'win32';
  
  // Try multiple possible names on Windows
  if (isWindows) {
    const possiblePaths = [
      path.join(projectPath, '.venv', 'Scripts', 'dbt.exe'),
      path.join(projectPath, '.venv', 'Scripts', 'dbt.cmd'),
      path.join(projectPath, '.venv', 'Scripts', 'dbt.bat'),
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } else {
    const venvDbt = path.join(projectPath, '.venv', 'bin', 'dbt');
    if (fs.existsSync(venvDbt)) {
      return venvDbt;
    }
  }
  
  // Fallback to global dbt
  return 'dbt';
}

/**
 * Execute a dbt run-operation and return the output
 */
export async function runDbtOperation(
  projectPath: string,
  macroName: string,
  args: Record<string, unknown>,
  log?: (msg: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const dbtPath = getDbtPath(projectPath);
    
    // Format args as YAML-style for better Windows compatibility
    // dbt accepts both JSON and YAML for --args
    const argsYaml = '{' + Object.entries(args)
      .map(([k, v]) => `${k}: '${v}'`)
      .join(', ') + '}';
    
    const cmdArgs = ['run-operation', macroName, '--args', argsYaml];
    
    log?.(`Running: ${dbtPath} ${cmdArgs.join(' ')}`);
    
    const child = spawn(dbtPath, cmdArgs, {
      cwd: projectPath,
      shell: false,  // Don't use shell to avoid escaping issues
      env: { ...process.env },
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    
    child.on('close', (code) => {
      // dbt writes most output to stderr, so combine both
      const combinedOutput = stdout + stderr;
      log?.(`dbt stdout length: ${stdout.length}, stderr length: ${stderr.length}`);
      
      if (code !== 0) {
        reject(new Error(`dbt exited with code ${code}: ${combinedOutput}`));
        return;
      }
      resolve(combinedOutput);
    });
    
    child.on('error', (error) => {
      reject(new Error(`Failed to run dbt: ${error.message}`));
    });
  });
}

/**
 * Parse dbt output - extract lines after timestamps, filter noise
 */
function parseDbtOutput(output: string, log?: (msg: string) => void): string[] {
  // Normalize line endings (Windows uses \r\n)
  const normalizedOutput = output.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedOutput.split('\n');
  const outputLines: string[] = [];
  
  log?.(`Parsing ${lines.length} lines from dbt output`);
  
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
      outputLines.push(content);
    }
  }
  
  log?.(`Extracted ${outputLines.length} content lines`);
  return outputLines;
}

// ============================================================================
// Parquet Discovery Functions
// ============================================================================

/**
 * List all Parquet files in a folder using dbt macro
 */
export async function listParquetFiles(
  projectPath: string,
  folderPath: string,
  log?: (msg: string) => void
): Promise<ParquetFile[]> {
  // Normalize path: remove leading/trailing slashes
  const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '').replace(/"/g, '');
  
  const output = await runDbtOperation(projectPath, 'list_parquet_files', {
    folder_path: normalizedPath
  }, log);
  
  log?.(`Raw dbt output length: ${output.length}`);
  
  const lines = parseDbtOutput(output, log);
  const files: ParquetFile[] = [];
  
  // Parse file names from output (skip header/footer lines)
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and metadata lines
    if (!trimmed || 
        trimmed.startsWith('===') || 
        trimmed.startsWith('Gefunden:') ||
        trimmed.startsWith('#')) {
      continue;
    }
    // This should be a filename
    if (trimmed.endsWith('.parquet')) {
      files.push({
        fileName: trimmed,
        fullPath: `${normalizedPath}/${trimmed}`
      });
    }
  }
  
  return files;
}

/**
 * Get schema for a single Parquet file using dbt macro
 */
export async function getParquetSchema(
  projectPath: string,
  folderPath: string,
  fileName: string,
  log?: (msg: string) => void
): Promise<ExternalTableDefinition | null> {
  const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '').replace(/"/g, '');
  
  const output = await runDbtOperation(projectPath, 'get_parquet_schema', {
    folder_path: normalizedPath,
    file_name: fileName
  }, log);
  
  const lines = parseDbtOutput(output);
  
  // Parse YAML output from dbt macro
  // The macro outputs YAML-formatted text
  const yamlLines: string[] = [];
  let inTable = false;
  
  for (const line of lines) {
    // Start capturing when we see "- name:"
    if (line.trim().startsWith('- name:')) {
      inTable = true;
    }
    if (inTable) {
      // Stop at comment lines
      if (line.trim().startsWith('#')) {
        break;
      }
      yamlLines.push(line);
    }
  }
  
  if (yamlLines.length === 0) {
    return null;
  }
  
  try {
    // Parse the YAML table definition
    const yamlText = yamlLines.join('\n');
    const parsed = yaml.parse(yamlText);
    
    // parsed is an array with one item (the table definition)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0] as ExternalTableDefinition;
    }
    
    return null;
  } catch (e) {
    log?.(`Failed to parse YAML: ${e}`);
    return null;
  }
}

// ============================================================================
// sources.yml Management
// ============================================================================

/**
 * Find the sources.yml file in the project
 */
export function findSourcesYaml(projectPath: string): string | null {
  const candidates = [
    path.join(projectPath, 'models', 'staging', 'sources.yml'),
    path.join(projectPath, 'models', 'sources.yml'),
  ];
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  
  return null;
}

/**
 * Check if a table already exists in sources.yml
 */
export function tableExistsInSources(
  sourcesPath: string,
  tableName: string
): boolean {
  try {
    const content = fs.readFileSync(sourcesPath, 'utf8');
    const parsed = yaml.parse(content);
    
    if (!parsed?.sources?.[0]?.tables) {
      return false;
    }
    
    const tables = parsed.sources[0].tables as Array<{ name: string }>;
    return tables.some(t => t.name === tableName);
  } catch {
    return false;
  }
}

/**
 * Add new external tables to sources.yml
 */
export async function addTablesToSourcesYaml(
  sourcesPath: string,
  newTables: ExternalTableDefinition[],
  log?: (msg: string) => void
): Promise<{ added: string[]; skipped: string[] }> {
  const added: string[] = [];
  const skipped: string[] = [];
  
  // Read existing file
  const content = fs.readFileSync(sourcesPath, 'utf8');
  const parsed = yaml.parse(content);
  
  if (!parsed?.sources?.[0]?.tables) {
    throw new Error('Invalid sources.yml structure');
  }
  
  const tables = parsed.sources[0].tables as ExternalTableDefinition[];
  
  for (const newTable of newTables) {
    const exists = tables.some(t => t.name === newTable.name);
    if (exists) {
      skipped.push(newTable.name);
      continue;
    }
    
    tables.push(newTable);
    added.push(newTable.name);
    log?.(`Added: ${newTable.name}`);
  }
  
  // Write back with proper formatting
  // Use yaml.stringify with custom options to match existing format
  const newContent = yaml.stringify(parsed, {
    indent: 2,
    lineWidth: 0, // Don't wrap lines
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  
  fs.writeFileSync(sourcesPath, newContent, 'utf8');
  
  return { added, skipped };
}

/**
 * Replace an existing table in sources.yml
 */
export function replaceTableInSourcesYaml(
  sourcesPath: string,
  newTable: ExternalTableDefinition,
  log?: (msg: string) => void
): void {
  const content = fs.readFileSync(sourcesPath, 'utf8');
  const parsed = yaml.parse(content);
  
  if (!parsed?.sources?.[0]?.tables) {
    throw new Error('Invalid sources.yml structure');
  }
  
  const tables = parsed.sources[0].tables as ExternalTableDefinition[];
  const index = tables.findIndex(t => t.name === newTable.name);
  
  if (index >= 0) {
    tables[index] = newTable;
    log?.(`Replaced: ${newTable.name}`);
  } else {
    tables.push(newTable);
    log?.(`Added: ${newTable.name}`);
  }
  
  const newContent = yaml.stringify(parsed, {
    indent: 2,
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  
  fs.writeFileSync(sourcesPath, newContent, 'utf8');
}
