import * as fs from 'fs';
import * as path from 'path';
import { MartDesignerState } from '../types';

/**
 * Config store for Mart Designer state persistence.
 *
 * Storage location: .vscode/mart-designer/<concept>_<martName>.json
 *
 * The designer state is the single source of truth for the visual design.
 * Generated SQL models are derived from this state.
 */

const MART_DESIGNER_DIR = '.vscode/mart-designer';
const STATE_VERSION = '1.0';

/**
 * Get the path to the mart designer config file
 */
function getConfigPath(projectPath: string, concept: string, martName: string): string {
  return path.join(projectPath, MART_DESIGNER_DIR, `${concept}_${martName}.json`);
}

/**
 * Get the directory path for mart designer configs
 */
function getConfigDir(projectPath: string): string {
  return path.join(projectPath, MART_DESIGNER_DIR);
}

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(projectPath: string): Promise<void> {
  const dir = getConfigDir(projectPath);
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
}

/**
 * Load a mart designer configuration from disk.
 * Returns null if the file doesn't exist.
 */
export async function loadMartDesignerConfig(
  projectPath: string,
  concept: string,
  martName: string
): Promise<MartDesignerState | null> {
  const configPath = getConfigPath(projectPath, concept, martName);

  if (!fs.existsSync(configPath)) {
    console.log(`[MartDesignerConfigStore] No config found at ${configPath}`);
    return null;
  }

  try {
    const content = await fs.promises.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as MartDesignerState;

    // Validate version compatibility
    if (config.version !== STATE_VERSION) {
      console.warn(`[MartDesignerConfigStore] Config version mismatch: ${config.version} vs ${STATE_VERSION}`);
      // Future: Add migration logic here
    }

    console.log(`[MartDesignerConfigStore] Loaded config from ${configPath}`);
    return config;
  } catch (error) {
    console.error(`[MartDesignerConfigStore] Error loading config:`, error);
    return null;
  }
}

/**
 * Save a mart designer configuration to disk.
 */
export async function saveMartDesignerConfig(
  projectPath: string,
  config: MartDesignerState
): Promise<void> {
  await ensureConfigDir(projectPath);

  const configPath = getConfigPath(projectPath, config.concept, config.martName);

  // Update metadata
  const configToSave: MartDesignerState = {
    ...config,
    version: STATE_VERSION,
    lastModified: new Date().toISOString()
  };

  try {
    const content = JSON.stringify(configToSave, null, 2);
    await fs.promises.writeFile(configPath, content, 'utf-8');
    console.log(`[MartDesignerConfigStore] Saved config to ${configPath}`);
  } catch (error) {
    console.error(`[MartDesignerConfigStore] Error saving config:`, error);
    throw error;
  }
}

/**
 * Delete a mart designer configuration from disk.
 */
export async function deleteMartDesignerConfig(
  projectPath: string,
  concept: string,
  martName: string
): Promise<void> {
  const configPath = getConfigPath(projectPath, concept, martName);

  if (fs.existsSync(configPath)) {
    await fs.promises.unlink(configPath);
    console.log(`[MartDesignerConfigStore] Deleted config at ${configPath}`);
  }
}

/**
 * List all mart designer configurations in a project.
 * Returns array of { concept, martName } objects.
 */
export async function listMartDesignerConfigs(
  projectPath: string
): Promise<{ concept: string; martName: string }[]> {
  const configDir = getConfigDir(projectPath);

  if (!fs.existsSync(configDir)) {
    return [];
  }

  try {
    const files = await fs.promises.readdir(configDir);
    const configs: { concept: string; martName: string }[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        // Parse filename: concept_martName.json
        const baseName = file.replace('.json', '');
        const underscoreIndex = baseName.indexOf('_');
        if (underscoreIndex > 0) {
          configs.push({
            concept: baseName.substring(0, underscoreIndex),
            martName: baseName.substring(underscoreIndex + 1)
          });
        }
      }
    }

    return configs;
  } catch (error) {
    console.error(`[MartDesignerConfigStore] Error listing configs:`, error);
    return [];
  }
}

/**
 * Create a new empty mart designer state.
 */
export function createEmptyMartDesignerState(
  concept: string,
  martName: string
): MartDesignerState {
  return {
    version: STATE_VERSION,
    concept,
    martName,
    lastModified: new Date().toISOString(),
    nodes: [],
    edges: []
  };
}

/**
 * Check if a mart designer config exists
 */
export function martDesignerConfigExists(
  projectPath: string,
  concept: string,
  martName: string
): boolean {
  const configPath = getConfigPath(projectPath, concept, martName);
  return fs.existsSync(configPath);
}
