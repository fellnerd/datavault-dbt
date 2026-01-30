/**
 * Designer Config Store
 * 
 * Persists Entity Designer configurations to JSON files
 * Location: .entity-designer/<concept>_<entity>.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SavedColumnConfig, LambdaVaultConfig } from '../types';

export interface DesignerConfig {
  /** Concept/source system name */
  concept: string;
  /** Entity name */
  entityName: string;
  /** Source table name */
  sourceTable: string;
  /** Source type: external_table, seed, database_table, manual */
  sourceType?: 'external_table' | 'seed' | 'database_table' | 'manual';
  /** Column configurations */
  columns: SavedColumnConfig[];
  /** When the config was last saved */
  savedAt: string;
  /** Which objects were generated */
  generatedObjects?: ('hub' | 'satellite' | 'links' | 'dc_satellite' | 'ma_satellite')[];
  /** Lambda Vault configuration for near-real-time data */
  lambdaVault?: LambdaVaultConfig;
}

const CONFIG_FOLDER = '.vscode/entity-designer';

/**
 * Get the config file path for an entity
 */
function getConfigPath(projectPath: string, concept: string, entityName: string): string {
  return path.join(projectPath, CONFIG_FOLDER, `${concept}_${entityName}.json`);
}

/**
 * Load saved designer configuration for an entity
 * Returns null if no config exists
 */
export async function loadDesignerConfig(
  projectPath: string,
  concept: string,
  entityName: string
): Promise<DesignerConfig | null> {
  const configPath = getConfigPath(projectPath, concept, entityName);
  
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as DesignerConfig;
    console.log(`[DesignerConfigStore] Loaded config for ${concept}_${entityName}`);
    return config;
  } catch (error) {
    // File doesn't exist or is invalid - that's OK
    return null;
  }
}

/**
 * Save designer configuration for an entity
 */
export async function saveDesignerConfig(
  projectPath: string,
  config: DesignerConfig
): Promise<void> {
  const configPath = getConfigPath(projectPath, config.concept, config.entityName);
  
  // Ensure directory exists
  const configDir = path.dirname(configPath);
  await fs.mkdir(configDir, { recursive: true });
  
  // Add timestamp
  config.savedAt = new Date().toISOString();
  
  // Write config
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`[DesignerConfigStore] Saved config for ${config.concept}_${config.entityName}`);
}

/**
 * Detect source type from an existing staging SQL file
 * Returns 'seed' if file uses ref(), 'external_table' otherwise
 */
export async function detectSourceTypeFromStaging(
  projectPath: string,
  concept: string,
  entityName: string
): Promise<'external_table' | 'seed' | 'database_table' | 'manual'> {
  const stagingPath = path.join(
    projectPath, 
    'models', 
    'staging', 
    `${concept}_${entityName}.sql`
  );
  
  try {
    const content = await fs.readFile(stagingPath, 'utf-8');
    
    // Check for ref() pattern - indicates a seed
    if (content.includes("{{ ref('") || content.includes('{{ ref("')) {
      console.log(`[DesignerConfigStore] Detected source type: seed (from ref() in staging)`);
      return 'seed';
    }
    
    // Check for direct table reference (no dbt function)
    if (!content.includes("{{ source(") && !content.includes("{{ ref(")) {
      console.log(`[DesignerConfigStore] Detected source type: database_table (no dbt function)`);
      return 'database_table';
    }
    
    // Default: external_table with source()
    console.log(`[DesignerConfigStore] Detected source type: external_table (from source() in staging)`);
    return 'external_table';
    
  } catch {
    // File doesn't exist - default to external_table
    return 'external_table';
  }
}

/**
 * Delete designer configuration for an entity
 */
export async function deleteDesignerConfig(
  projectPath: string,
  concept: string,
  entityName: string
): Promise<void> {
  const configPath = getConfigPath(projectPath, concept, entityName);
  
  try {
    await fs.unlink(configPath);
    console.log(`[DesignerConfigStore] Deleted config for ${concept}_${entityName}`);
  } catch {
    // File doesn't exist - that's OK
  }
}

/**
 * List all saved designer configurations
 */
export async function listDesignerConfigs(projectPath: string): Promise<string[]> {
  const configDir = path.join(projectPath, CONFIG_FOLDER);
  
  try {
    const files = await fs.readdir(configDir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}
