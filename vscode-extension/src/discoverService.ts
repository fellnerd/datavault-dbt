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
import { getDbtPath } from './utils/dbt';

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
    
    const dbtTarget = vscode.workspace.getConfiguration('datavault').get<string>('dbtTarget', 'dev');
    const cmdArgs = dbtTarget
      ? ['--no-use-colors', 'run-operation', macroName, '--args', argsYaml, '--target', dbtTarget]
      : ['--no-use-colors', 'run-operation', macroName, '--args', argsYaml];
    
    // On Windows, dbt is installed as dbt.cmd and cannot be spawned without shell:true
    // (same fix as listParquetFiles uses for az.cmd — see CVE-2024-27980 note there)
    const isWindows = process.platform === 'win32';
    const spawnArgs = isWindows ? cmdArgs.map(quoteShellArg) : cmdArgs;

    log?.(`Running: ${dbtPath} ${cmdArgs.join(' ')}`);
    
    const child = spawn(dbtPath, spawnArgs, {
      cwd: projectPath,
      shell: isWindows,
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
  // Normalize line endings (Windows uses \r\n) and strip ANSI escape codes
  const normalizedOutput = output
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')   // strip ANSI color codes like \x1b[0m
    .replace(/\[0m/g, '');             // strip bare [0m (sometimes no ESC prefix)
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
 * Quote an argument for safe use with a shell (shell:true on Windows).
 * Leaves simple flag/value tokens untouched, wraps anything with shell-special
 * characters in double quotes to prevent word-splitting and injection.
 */
function quoteShellArg(arg: string): string {
  if (/^[A-Za-z0-9_\-./]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '\\"')}"`;
}

/**
 * Consistent, actionable error message when the Azure CLI cannot be found.
 */
function azNotFoundMessage(): string {
  return (
    'Azure CLI (az) not found. Install it from https://aka.ms/azure-cli, ' +
    'run "az login", then fully restart VS Code so the extension picks up the ' +
    'updated PATH.'
  );
}

/**
 * List all Parquet files in a folder using Azure CLI (az storage blob list).
 * 
 * Replaces the dbt macro approach (OPENROWSET wildcard) which is not supported
 * in Azure SQL Database (only Synapse Serverless SQL Pool supports directory
 * enumeration via OPENROWSET). Azure CLI requires: az login beforehand.
 */
export async function listParquetFiles(
  projectPath: string,
  folderPath: string,
  log?: (msg: string) => void
): Promise<ParquetFile[]> {
  const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '').replace(/"/g, '');

  const cfg = vscode.workspace.getConfiguration('datavault');
  const storageAccount = cfg.get<string>('storage.accountName', '');
  const container = cfg.get<string>('storage.containerName', '');

  if (!storageAccount || !container) {
    throw new Error(
      'Azure Storage settings not configured. Please set datavault.storage.accountName and datavault.storage.containerName in VS Code Settings.'
    );
  }

  log?.(`Listing Parquet files via Azure CLI: ${container}/${normalizedPath}`);

  const output = await new Promise<string>((resolve, reject) => {
    const args = [
      'storage', 'blob', 'list',
      '--account-name', storageAccount,
      '--container-name', container,
      '--prefix', `${normalizedPath}/`,
      '--query', '[].name',
      '--output', 'json',
      '--auth-mode', 'login'
    ];

    // On Windows the Azure CLI is a batch script (az.cmd). Since Node 18.20/20.12
    // (CVE-2024-27980) spawn() refuses to run .cmd/.bat files unless shell:true,
    // otherwise it fails with ENOENT. Quote args to stay injection-safe in a shell.
    const isWindows = process.platform === 'win32';
    const spawnArgs = isWindows ? args.map(quoteShellArg) : args;

    log?.(`Running: az ${args.join(' ')}`);
    const child = spawn('az', spawnArgs, { cwd: projectPath, shell: isWindows });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        // Windows cmd reports a missing command as exit code 1/9009 instead of ENOENT
        if (/is not recognized as an internal or external command|command not found/i.test(stderr)) {
          reject(new Error(azNotFoundMessage()));
        } else {
          reject(new Error(`az storage blob list failed (exit ${code}): ${stderr}`));
        }
      } else {
        resolve(stdout);
      }
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(new Error(azNotFoundMessage()));
      } else {
        reject(new Error(`Failed to run az CLI: ${error.message}`));
      }
    });
  });

  const blobNames: string[] = JSON.parse(output);
  const files: ParquetFile[] = blobNames
    .filter(name => name.endsWith('.parquet'))
    .map(name => {
      const fileName = name.split('/').pop() ?? name;
      return { fileName, fullPath: name };
    });

  log?.(`Found ${files.length} Parquet files`);
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
  
  const cfg = vscode.workspace.getConfiguration('datavault');
  const dataSource = cfg.get<string>('storage.dataSource', '');
  const fileFormat = cfg.get<string>('storage.fileFormat', 'ParquetFormat');

  if (!dataSource) {
    throw new Error(
      'External Data Source not configured. Please set datavault.storage.dataSource in VS Code Settings.'
    );
  }

  const output = await runDbtOperation(projectPath, 'get_parquet_schema', {
    folder_path: normalizedPath,
    file_name: fileName,
    data_source: dataSource,
    file_format: fileFormat
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
