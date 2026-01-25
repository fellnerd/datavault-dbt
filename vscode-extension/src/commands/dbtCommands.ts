import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDbtCommand, getDbtProfilesDir } from '../utils/dbt';

const execAsync = promisify(exec);

interface DbtModel {
  name: string;
  path: string;
  concept: string;
  layer: string;
  type: string; // hub, sat, link, staging, etc.
}

interface ModelQuickPickItem extends vscode.QuickPickItem {
  model?: DbtModel;
}

/**
 * Get all dbt models grouped by concept
 */
async function getDbtModels(projectPath: string): Promise<DbtModel[]> {
  const dbtCmd = getDbtCommand(projectPath);
  
  try {
    // Use dbt ls to get all models
    const { stdout } = await execAsync(`${dbtCmd} ls --resource-type model --output json`, {
      cwd: projectPath,
      env: { ...process.env, DBT_PROFILES_DIR: getDbtProfilesDir() }
    });

    const models: DbtModel[] = [];
    const lines = stdout.trim().split('\n');

    for (const line of lines) {
      try {
        const model = JSON.parse(line);
        if (model.resource_type === 'model') {
          // Parse path to extract concept and type
          // e.g., datavault.raw_vault.werkportal.hubs.hub_contacts
          const parts = model.unique_id.split('.');
          const name = parts[parts.length - 1];
          
          let concept = 'other';
          let layer = 'other';
          let type = 'model';

          if (parts.includes('raw_vault')) {
            layer = 'raw_vault';
            const rawVaultIndex = parts.indexOf('raw_vault');
            if (rawVaultIndex + 1 < parts.length - 1) {
              concept = parts[rawVaultIndex + 1];
            }
            if (name.startsWith('hub_')) type = 'hub';
            else if (name.startsWith('sat_')) type = 'satellite';
            else if (name.startsWith('link_')) type = 'link';
          } else if (parts.includes('staging')) {
            layer = 'staging';
            concept = 'staging';
            type = 'staging';
          } else if (parts.includes('business_vault')) {
            layer = 'business_vault';
            concept = 'business_vault';
          } else if (parts.includes('mart')) {
            layer = 'mart';
            const martIndex = parts.indexOf('mart');
            if (martIndex + 1 < parts.length - 1) {
              concept = parts[martIndex + 1];
            }
          }

          models.push({
            name,
            path: model.original_file_path || '',
            concept,
            layer,
            type
          });
        }
      } catch {
        // Skip non-JSON lines (warnings, etc.)
      }
    }

    return models;
  } catch (error) {
    // Fallback: use dbt ls with plain output
    try {
      const { stdout } = await execAsync(`${dbtCmd} ls --resource-type model`, {
        cwd: projectPath,
        env: { ...process.env, DBT_PROFILES_DIR: getDbtProfilesDir() }
      });

      const models: DbtModel[] = [];
      const lines = stdout.trim().split('\n').filter(l => !l.startsWith('[') && l.includes('.'));

      for (const line of lines) {
        const parts = line.trim().split('.');
        const name = parts[parts.length - 1];
        
        let concept = 'other';
        let layer = 'other';
        let type = 'model';

        if (parts.includes('raw_vault')) {
          layer = 'raw_vault';
          const rawVaultIndex = parts.indexOf('raw_vault');
          if (rawVaultIndex + 1 < parts.length - 1) {
            concept = parts[rawVaultIndex + 1];
          }
          if (name.startsWith('hub_')) type = 'hub';
          else if (name.startsWith('sat_')) type = 'satellite';
          else if (name.startsWith('link_')) type = 'link';
        } else if (parts.includes('staging')) {
          layer = 'staging';
          concept = 'staging';
          type = 'staging';
        } else if (parts.includes('business_vault')) {
          layer = 'business_vault';
          concept = 'business_vault';
        } else if (parts.includes('mart')) {
          layer = 'mart';
          const martIndex = parts.indexOf('mart');
          if (martIndex + 1 < parts.length - 1) {
            concept = parts[martIndex + 1];
          }
        }

        models.push({
          name,
          path: line.trim(),
          concept,
          layer,
          type
        });
      }

      return models;
    } catch (fallbackError) {
      vscode.window.showErrorMessage(`Failed to list dbt models: ${fallbackError}`);
      return [];
    }
  }
}

/**
 * Create QuickPick items grouped by concept
 */
function createGroupedQuickPickItems(models: DbtModel[]): ModelQuickPickItem[] {
  const items: ModelQuickPickItem[] = [];
  
  // Group by layer, then concept
  const grouped = new Map<string, Map<string, DbtModel[]>>();
  
  for (const model of models) {
    if (!grouped.has(model.layer)) {
      grouped.set(model.layer, new Map());
    }
    const layerMap = grouped.get(model.layer)!;
    if (!layerMap.has(model.concept)) {
      layerMap.set(model.concept, []);
    }
    layerMap.get(model.concept)!.push(model);
  }

  // Layer order
  const layerOrder = ['staging', 'raw_vault', 'business_vault', 'mart', 'other'];
  
  for (const layer of layerOrder) {
    const layerMap = grouped.get(layer);
    if (!layerMap) continue;

    // Add layer separator
    const layerLabel = layer.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    items.push({
      label: `$(folder) ${layerLabel}`,
      kind: vscode.QuickPickItemKind.Separator
    });

    // Sort concepts alphabetically
    const concepts = Array.from(layerMap.keys()).sort();
    
    for (const concept of concepts) {
      const conceptModels = layerMap.get(concept)!;
      
      // Add concept header if different from layer
      if (concept !== layer && concept !== 'other') {
        items.push({
          label: `  $(package) ${concept}`,
          kind: vscode.QuickPickItemKind.Separator
        });
      }

      // Sort models by type then name
      const typeOrder = ['hub', 'satellite', 'link', 'staging', 'model'];
      conceptModels.sort((a, b) => {
        const typeA = typeOrder.indexOf(a.type);
        const typeB = typeOrder.indexOf(b.type);
        if (typeA !== typeB) return typeA - typeB;
        return a.name.localeCompare(b.name);
      });

      for (const model of conceptModels) {
        const icon = getModelIcon(model.type);
        items.push({
          label: `    ${icon} ${model.name}`,
          description: model.type,
          detail: model.path,
          model
        });
      }
    }
  }

  return items;
}

function getModelIcon(type: string): string {
  switch (type) {
    case 'hub': return '$(key)';
    case 'satellite': return '$(list-unordered)';
    case 'link': return '$(git-merge)';
    case 'staging': return '$(database)';
    case 'seed': return '$(table)';
    default: return '$(file)';
  }
}

interface DbtSeed {
  name: string;
  path: string;
}

interface SeedQuickPickItem extends vscode.QuickPickItem {
  seed?: DbtSeed;
}

/**
 * Get all dbt seeds from the seeds/ directory
 */
async function getDbtSeeds(projectPath: string): Promise<DbtSeed[]> {
  const seedsDir = path.join(projectPath, 'seeds');
  const seeds: DbtSeed[] = [];

  if (!fs.existsSync(seedsDir)) {
    return seeds;
  }

  // Recursively find all CSV files
  function findCsvFiles(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findCsvFiles(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.csv')) {
        const relativePath = path.relative(seedsDir, fullPath);
        const name = path.basename(entry.name, '.csv');
        seeds.push({
          name,
          path: relativePath
        });
      }
    }
  }

  findCsvFiles(seedsDir);
  return seeds.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Show seed picker and run dbt seed command
 */
async function showSeedPicker(
  projectPath: string,
  title: string,
  placeHolder: string,
  commandBuilder: (seeds: string[]) => string
): Promise<void> {
  const seeds = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Loading dbt seeds...',
      cancellable: false
    },
    async () => getDbtSeeds(projectPath)
  );

  if (seeds.length === 0) {
    vscode.window.showWarningMessage('No seed files (CSV) found in seeds/ directory.');
    return;
  }

  const items: SeedQuickPickItem[] = seeds.map(seed => ({
    label: `$(table) ${seed.name}`,
    description: seed.path,
    seed
  }));

  const quickPick = vscode.window.createQuickPick<SeedQuickPickItem>();
  quickPick.title = title;
  quickPick.placeholder = placeHolder;
  quickPick.items = items;
  quickPick.canSelectMany = true;
  quickPick.matchOnDescription = true;

  // Add "Select All" button
  quickPick.buttons = [
    {
      iconPath: new vscode.ThemeIcon('check-all'),
      tooltip: 'Select All'
    },
    {
      iconPath: new vscode.ThemeIcon('clear-all'),
      tooltip: 'Clear Selection'
    }
  ];

  quickPick.onDidTriggerButton(button => {
    if (button.tooltip === 'Select All') {
      quickPick.selectedItems = items.filter(i => i.seed);
    } else if (button.tooltip === 'Clear Selection') {
      quickPick.selectedItems = [];
    }
  });

  return new Promise<void>((resolve) => {
    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems.filter(i => i.seed);
      quickPick.hide();

      if (selected.length === 0) {
        vscode.window.showWarningMessage('No seeds selected.');
        resolve();
        return;
      }

      // Build selector string using seed names
      const selectors = selected.map(i => i.seed!.name);
      const command = commandBuilder(selectors);

      // Run in terminal with venv activation
      runDbtInTerminal(projectPath, command);

      resolve();
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve();
    });

    quickPick.show();
  });
}

/**
 * Show model picker and run dbt command
 */
async function showModelPicker(
  projectPath: string,
  title: string,
  placeHolder: string,
  commandBuilder: (models: string[]) => string
): Promise<void> {
  const models = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Loading dbt models...',
      cancellable: false
    },
    async () => getDbtModels(projectPath)
  );

  if (models.length === 0) {
    vscode.window.showWarningMessage('No dbt models found in project.');
    return;
  }

  const items = createGroupedQuickPickItems(models);

  const quickPick = vscode.window.createQuickPick<ModelQuickPickItem>();
  quickPick.title = title;
  quickPick.placeholder = placeHolder;
  quickPick.items = items;
  quickPick.canSelectMany = true;
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  // Add "Select All" button
  quickPick.buttons = [
    {
      iconPath: new vscode.ThemeIcon('check-all'),
      tooltip: 'Select All'
    },
    {
      iconPath: new vscode.ThemeIcon('clear-all'),
      tooltip: 'Clear Selection'
    }
  ];

  quickPick.onDidTriggerButton(button => {
    if (button.tooltip === 'Select All') {
      quickPick.selectedItems = items.filter(i => i.model);
    } else if (button.tooltip === 'Clear Selection') {
      quickPick.selectedItems = [];
    }
  });

  return new Promise<void>((resolve) => {
    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems.filter(i => i.model);
      quickPick.hide();

      if (selected.length === 0) {
        vscode.window.showWarningMessage('No models selected.');
        resolve();
        return;
      }

      // Build selector string
      const selectors = selected.map(i => i.model!.path);
      const command = commandBuilder(selectors);

      // Check for .venv and build activation command
      const isWindows = process.platform === 'win32';
      const venvPath = isWindows
        ? path.join(projectPath, '.venv', 'Scripts', 'activate.ps1')
        : path.join(projectPath, '.venv', 'bin', 'activate');
      
      const hasVenv = fs.existsSync(venvPath);

      // Run in terminal
      const terminal = vscode.window.createTerminal({
        name: 'dbt',
        cwd: projectPath
      });
      terminal.show();
      
      // Activate venv first if it exists
      if (hasVenv) {
        if (isWindows) {
          terminal.sendText(`& "${venvPath}"`);
        } else {
          terminal.sendText(`source "${venvPath}"`);
        }
      }
      terminal.sendText(command);

      resolve();
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve();
    });

    quickPick.show();
  });
}

/**
 * Get the dbt project path
 */
function getDbtProjectPath(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return undefined;
  }

  // Check for dbt_project.yml in root or known locations
  for (const folder of workspaceFolders) {
    const candidates = [
      folder.uri.fsPath,
      path.join(folder.uri.fsPath, 'datavault-dbt'),
    ];

    for (const candidate of candidates) {
      try {
        const fs = require('fs');
        if (fs.existsSync(path.join(candidate, 'dbt_project.yml'))) {
          return candidate;
        }
      } catch {
        // Continue checking
      }
    }
  }

  // Default to first workspace folder
  return workspaceFolders[0].uri.fsPath;
}

/**
 * Run dbt command in terminal with venv activation
 */
function runDbtInTerminal(projectPath: string, command: string): void {
  const isWindows = process.platform === 'win32';
  const venvPath = isWindows
    ? path.join(projectPath, '.venv', 'Scripts', 'activate.ps1')
    : path.join(projectPath, '.venv', 'bin', 'activate');
  
  const hasVenv = fs.existsSync(venvPath);

  const terminal = vscode.window.createTerminal({
    name: 'dbt',
    cwd: projectPath
  });
  terminal.show();
  
  if (hasVenv) {
    if (isWindows) {
      terminal.sendText(`& "${venvPath}"`);
    } else {
      terminal.sendText(`source "${venvPath}"`);
    }
  }
  terminal.sendText(command);
}

// ============================================================================
// COMMAND HANDLERS - Using Native QuickPick
// ============================================================================

/**
 * dbt run --full-refresh - Recreate tables from scratch
 * Note: --empty flag is NOT supported by dbt-sqlserver adapter
 */
export async function dbtRunFullRefresh(): Promise<void> {
  const projectPath = getDbtProjectPath();
  if (!projectPath) return;

  await showModelPicker(
    projectPath,
    'dbt: Full Refresh (Recreate)',
    'Select models to recreate (drops and rebuilds tables)',
    (models) => `dbt run --select ${models.join(' ')} --full-refresh`
  );
}

/**
 * dbt run - Run models with data
 */
export async function dbtRun(): Promise<void> {
  const projectPath = getDbtProjectPath();
  if (!projectPath) return;

  await showModelPicker(
    projectPath,
    'dbt: Run Models',
    'Select models to run (with data loading)',
    (models) => `dbt run --select ${models.join(' ')}`
  );
}

/**
 * dbt seed - Load CSV seed files into database
 */
export async function dbtSeed(): Promise<void> {
  const projectPath = getDbtProjectPath();
  if (!projectPath) return;

  await showSeedPicker(
    projectPath,
    'dbt: Load Seeds',
    'Select seed files to load into database',
    (seeds) => `dbt seed --select ${seeds.join(' ')}`
  );
}

/**
 * dbt build - Run seeds, models, snapshots and tests
 */
export async function dbtBuild(): Promise<void> {
  const projectPath = getDbtProjectPath();
  if (!projectPath) return;

  await showModelPicker(
    projectPath,
    'dbt: Build (Seeds + Models + Tests)',
    'Select models to build (includes seeds, models, and tests)',
    (models) => `dbt build --select ${models.join(' ')}`
  );
}

/**
 * dbt test - Run tests for models
 */
export async function dbtTest(): Promise<void> {
  const projectPath = getDbtProjectPath();
  if (!projectPath) return;

  await showModelPicker(
    projectPath,
    'dbt: Test Models',
    'Select models to test',
    (models) => `dbt test --select ${models.join(' ')}`
  );
}

/**
 * dbt compile - Preview SQL without running
 */
export async function dbtCompile(): Promise<void> {
  const projectPath = getDbtProjectPath();
  if (!projectPath) return;

  await showModelPicker(
    projectPath,
    'dbt: Compile (Preview SQL)',
    'Select models to compile',
    (models) => `dbt compile --select ${models.join(' ')}`
  );
}

/**
 * Register all dbt commands
 */
export function registerDbtCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('datavault.dbtRunFullRefresh', dbtRunFullRefresh),
    vscode.commands.registerCommand('datavault.dbtRun', dbtRun),
    vscode.commands.registerCommand('datavault.dbtSeed', dbtSeed),
    vscode.commands.registerCommand('datavault.dbtBuild', dbtBuild),
    vscode.commands.registerCommand('datavault.dbtTest', dbtTest),
    vscode.commands.registerCommand('datavault.dbtCompile', dbtCompile)
  );
}
