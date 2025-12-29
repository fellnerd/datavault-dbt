/**
 * File Operations Utilities
 * 
 * Helper functions for reading, writing, and modifying dbt project files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { fileURLToPath } from 'url';

// Get directory of current file
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Project root (three levels up from dist/utils folder: dist/utils -> dist -> agent -> project root)
// When running from dist/utils/fileOperations.js, we need to go up 3 levels
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

export const PATHS = {
  models: path.join(PROJECT_ROOT, 'models'),
  staging: path.join(PROJECT_ROOT, 'models', 'staging'),
  hubs: path.join(PROJECT_ROOT, 'models', 'raw_vault', 'hubs'),
  satellites: path.join(PROJECT_ROOT, 'models', 'raw_vault', 'satellites'),
  links: path.join(PROJECT_ROOT, 'models', 'raw_vault', 'links'),
  businessVault: path.join(PROJECT_ROOT, 'models', 'business_vault'),
  mart: path.join(PROJECT_ROOT, 'models', 'mart'),
  seeds: path.join(PROJECT_ROOT, 'seeds'),
  sourcesYml: path.join(PROJECT_ROOT, 'models', 'staging', 'sources.yml'),
  schemaYml: path.join(PROJECT_ROOT, 'models', 'schema.yml'),
};

/**
 * Ensure a directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Read a file as string
 */
export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Write content to a file (creates directories if needed)
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List files in a directory
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(e => e.isFile())
      .map(e => e.name);
  } catch {
    return [];
  }
}

/**
 * Read and parse a YAML file
 */
export async function readYaml<T = unknown>(filePath: string): Promise<T> {
  const content = await readFile(filePath);
  return parseYaml(content) as T;
}

/**
 * Write object as YAML to file
 */
export async function writeYaml(filePath: string, data: unknown): Promise<void> {
  const content = stringifyYaml(data, {
    indent: 2,
    lineWidth: 0, // Don't wrap lines
  });
  await writeFile(filePath, content);
}

/**
 * Append content to sources.yml external tables
 */
export async function appendToSourcesYaml(tableDefinition: object): Promise<void> {
  const sourcesPath = PATHS.sourcesYml;
  const sources = await readYaml<{ sources: Array<{ tables: unknown[] }> }>(sourcesPath);
  
  // Find the staging source
  const stagingSource = sources.sources.find(s => s.tables);
  if (stagingSource) {
    stagingSource.tables.push(tableDefinition);
    await writeYaml(sourcesPath, sources);
  }
}

/**
 * Add model tests to schema.yml
 */
export async function addModelToSchemaYaml(modelDefinition: object): Promise<void> {
  const schemaPath = PATHS.schemaYml;
  const schema = await readYaml<{ models?: unknown[] }>(schemaPath);
  
  if (!schema.models) {
    schema.models = [];
  }
  
  schema.models.push(modelDefinition);
  await writeYaml(schemaPath, schema);
}

/**
 * Get relative path from project root
 */
export function getRelativePath(absolutePath: string): string {
  return path.relative(PROJECT_ROOT, absolutePath);
}
