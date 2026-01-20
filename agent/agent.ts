/**
 * Claude Agent Logic
 * 
 * Uses the Anthropic SDK with manual tool execution loop.
 * Enhanced with ora spinners, streaming, and conversation tracking.
 * Now includes wizard-based structured input for dbt actions.
 */

import Anthropic from '@anthropic-ai/sdk';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { type MenuAction, ACTION_DESCRIPTIONS } from './menu.js';
import { getAllTools, executeTool } from './tools/index.js';
import { getSystemPrompt } from './context/systemPrompt.js';
import { extractCommands, showFollowUpMenu } from './followUp.js';
import * as ui from './ui.js';
import * as conversation from './conversation.js';
import { 
  PATHS, 
  getConceptPaths, 
  getAvailableConcepts,
  DEFAULT_CONCEPT 
} from './utils/fileOperations.js';
import {
  runMartWizard,
  runHubWizard,
  runSatelliteWizard,
  runLinkWizard,
  runEntityWizard,
  runEditWizard,
  runDeleteWizard,
  type WizardResult,
} from './wizards.js';

const client = new Anthropic();

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
// Get directory of current file and compute PROJECT_ROOT
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PROJECT_ROOT: 2 levels up from dist/ (dist -> agent -> project)
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..', '..');

/**
 * Browse project objects - show existing structure
 */
async function browseProjectObjects(): Promise<void> {
  const categories = [
    { name: '[*] Alles anzeigen (komplette Struktur)', value: 'all' },
    { name: '[H] Hubs (Raw Vault)', value: 'hubs' },
    { name: '[S] Satellites (Raw Vault)', value: 'satellites' },
    { name: '[L] Links (Raw Vault)', value: 'links' },
    { name: '[T] Staging Views', value: 'staging' },
    { name: '[M] Mart Views', value: 'mart' },
    { name: '[R] Seeds (Reference Tables)', value: 'seeds' },
    { name: '[<] Zurueck zum Hauptmenue', value: 'back' },
  ];

  const selected = await select({
    message: chalk.cyan('Was moechtest du anzeigen?'),
    choices: categories,
    pageSize: 10,
  });

  if (selected === 'back') {
    return;
  }

  console.log('');
  console.log(ui.divider());
  console.log('');

  // Load deployment status from dbt artifacts
  const deploymentStatus = await loadDeploymentStatus();
  const statusSummary = getStatusSummary(deploymentStatus);
  
  if (statusSummary) {
    console.log(statusSummary);
    console.log('');
  }

  const dirMap: Record<string, string> = {
    all: 'models',
    hubs: 'models/raw_vault',  // Will search all concept subdirs
    satellites: 'models/raw_vault',
    links: 'models/raw_vault',
    staging: 'models/staging',
    mart: 'models/mart',
    seeds: 'seeds',
  };

  const targetDir = dirMap[selected];
  const recursive = true;  // Always recursive to find files in concept subdirs

  try {
    const result = await listDirectoryForBrowse(targetDir, recursive, deploymentStatus);
    console.log(result);
  } catch (error) {
    console.log(chalk.red(`❌ Fehler beim Lesen: ${error}`));
  }

  console.log('');
  console.log(ui.divider());
  
  // Ask if user wants to see more or go back
  const nextAction = await select({
    message: chalk.cyan('Was nun?'),
    choices: [
      { name: '🔍 Weitere Kategorie anzeigen', value: 'more' },
      { name: '⬅️  Zurück zum Hauptmenü', value: 'back' },
    ],
  });

  if (nextAction === 'more') {
    await browseProjectObjects();
  }
}

/**
 * Deploy models - select and run dbt models
 */
async function deployModels(): Promise<string> {
  const deploymentStatus = await loadDeploymentStatus();
  
  // Collect all SQL models from all concept directories
  const allModels: { name: string; path: string; status: 'deployed' | 'pending' | 'failed' }[] = [];
  
  // Get all concept directories dynamically
  const concepts = await getAvailableConcepts();
  const modelDirs: string[] = [
    'models/staging',
  ];
  
  // Add all concept-specific directories
  for (const concept of concepts) {
    modelDirs.push(`models/raw_vault/${concept}/hubs`);
    modelDirs.push(`models/raw_vault/${concept}/satellites`);
    modelDirs.push(`models/raw_vault/${concept}/links`);
  }
  
  modelDirs.push('models/business_vault');
  modelDirs.push('models/mart');
  
  for (const dir of modelDirs) {
    const fullPath = path.join(PROJECT_ROOT, dir);
    try {
      const files = await fs.readdir(fullPath, { recursive: true });
      for (const file of files) {
        const fileName = String(file);
        if (fileName.endsWith('.sql')) {
          const modelName = path.basename(fileName, '.sql');
          let status: 'deployed' | 'pending' | 'failed' = 'pending';
          if (deploymentStatus.deployed.has(modelName)) status = 'deployed';
          else if (deploymentStatus.failed.has(modelName)) status = 'failed';
          
          allModels.push({
            name: modelName,
            path: `${dir}/${fileName}`,
            status,
          });
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }
  
  // Sort: pending first, then failed, then deployed
  allModels.sort((a, b) => {
    const order = { pending: 0, failed: 1, deployed: 2 };
    return order[a.status] - order[b.status];
  });
  
  // Build choices for checkbox
  const modelChoices = allModels.map(m => {
    const icon = m.status === 'deployed' ? chalk.green('✓') 
               : m.status === 'failed' ? chalk.red('✗')
               : chalk.yellow('○');
    return { 
      name: `${icon} ${m.name}`, 
      value: m.name,
      checked: m.status === 'pending', // Pre-select pending models
    };
  });
  
  // First ask for deployment mode
  const mode = await select({
    message: chalk.cyan('Deploy-Modus?'),
    choices: [
      { name: '[P] Alle pending Models', value: 'pending' },
      { name: '[S] Models auswählen', value: 'select' },
      { name: '[A] Alle Models (full refresh)', value: 'all' },
      { name: '[<] Zurück', value: 'back' },
    ],
  });
  
  if (mode === 'back') {
    return '';
  }
  
  let modelsToRun: string[] = [];
  
  if (mode === 'all') {
    modelsToRun = allModels.map(m => m.name);
  } else if (mode === 'pending') {
    modelsToRun = allModels.filter(m => m.status === 'pending').map(m => m.name);
    if (modelsToRun.length === 0) {
      console.log(chalk.green('[OK] Keine pending Models'));
      return '';
    }
  } else if (mode === 'select') {
    // Use checkbox for multi-select
    const { default: checkbox } = await import('@inquirer/checkbox');
    modelsToRun = await checkbox({
      message: chalk.cyan('Models auswählen (Space zum markieren, Enter zum bestätigen):'),
      choices: modelChoices,
      pageSize: 15,
    });
    
    if (modelsToRun.length === 0) {
      return '';
    }
  }
  
  // Build dbt command
  const command = mode === 'all' 
    ? 'dbt run --full-refresh'
    : `dbt run --select ${modelsToRun.join(' ')}`;
  
  console.log('');
  console.log(chalk.cyan(`[CMD] ${command}`));
  console.log('');
  
  // Execute via run_command tool
  const result = await executeTool('run_command', { command });
  
  // Clear manifest cache to reload fresh status
  const { clearManifestCache } = await import('./validators/dependencies.js');
  clearManifestCache();
  
  // Check for errors and offer AI analysis
  if (result.includes('ERROR') || result.includes('exit_code":1') || result.includes('exit_code": 1')) {
    console.log('');
    console.log(ui.box('🔍 Fehler erkannt - AI Analyse', 'warning'));
    
    const analyzeError = await confirm({
      message: 'Soll die AI den Fehler analysieren und einen Fix vorschlagen?',
      default: true,
    });
    
    if (analyzeError) {
      await analyzeAndFixDbtError(result, modelsToRun);
    }
  }
  
  return result;
}

/**
 * Analyze dbt error with AI and offer to fix
 */
async function analyzeAndFixDbtError(errorOutput: string, failedModels: string[]): Promise<void> {
  const spinner = ora({
    text: chalk.yellow('AI analysiert Fehler...'),
    spinner: 'dots',
  }).start();
  
  // Try to read compiled SQL if available
  let compiledSQL = '';
  for (const model of failedModels) {
    const compiledPaths = [
      path.join(PROJECT_ROOT, 'target', 'compiled', 'datavault', 'models', 'raw_vault', 'satellites', `${model}.sql`),
      path.join(PROJECT_ROOT, 'target', 'compiled', 'datavault', 'models', 'raw_vault', 'hubs', `${model}.sql`),
      path.join(PROJECT_ROOT, 'target', 'compiled', 'datavault', 'models', 'raw_vault', 'links', `${model}.sql`),
      path.join(PROJECT_ROOT, 'target', 'compiled', 'datavault', 'models', 'staging', `${model}.sql`),
    ];
    
    for (const compiledPath of compiledPaths) {
      try {
        compiledSQL = await fs.readFile(compiledPath, 'utf-8');
        compiledSQL = `\n\n**Compiled SQL (${model}):**\n\`\`\`sql\n${compiledSQL}\n\`\`\``;
        break;
      } catch {
        // File doesn't exist
      }
    }
    if (compiledSQL) break;
  }
  
  const analysisPrompt = `Analysiere diesen dbt/SQL Server Fehler und erkläre das Problem.

**Fehlerausgabe:**
${errorOutput}
${compiledSQL}

Bitte:
1. **Erkläre den Fehler** kurz und verständlich (auf Deutsch)
2. **Identifiziere die Ursache** (welche Datei, welche Zeile, welches Keyword)
3. **Schlage einen konkreten Fix vor** mit Code-Beispiel
4. Wenn es ein SQL Server reserviertes Keyword ist (wie BEGIN, END, USER, etc.), erkläre dass es mit [brackets] escaped werden muss

Antworte in diesem Format:
## Fehler
<kurze Erklärung>

## Ursache  
<Details zur Ursache>

## Lösung
<konkreter Fix mit Code>`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: 'Du bist ein dbt und SQL Server Experte. Analysiere Fehler präzise und schlage konkrete Fixes vor.',
      messages: [{ role: 'user', content: analysisPrompt }],
    });
    
    spinner.stop();
    
    // Extract text response
    let analysis = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        analysis = block.text;
        break;
      }
    }
    
    console.log('');
    console.log(chalk.cyan('─'.repeat(60)));
    console.log(chalk.bold.white('  AI Fehleranalyse'));
    console.log(chalk.cyan('─'.repeat(60)));
    console.log('');
    console.log(analysis);
    console.log('');
    console.log(chalk.cyan('─'.repeat(60)));
    
    // Offer to auto-fix
    const shouldFix = await confirm({
      message: 'Soll die AI versuchen, den Fehler automatisch zu beheben?',
      default: true,
    });
    
    if (shouldFix) {
      await autoFixDbtError(errorOutput, failedModels, analysis);
    }
    
  } catch (error) {
    spinner.stop();
    console.log(chalk.red(`[ERROR] AI Analyse fehlgeschlagen: ${error}`));
  }
}

/**
 * Auto-fix dbt error using AI
 */
async function autoFixDbtError(errorOutput: string, failedModels: string[], analysis: string): Promise<void> {
  const spinner = ora({
    text: chalk.yellow('AI wendet Fix an...'),
    spinner: 'dots',
  }).start();
  
  // Find the source files for failed models
  const sourceFiles: { model: string; path: string; content: string }[] = [];
  
  for (const model of failedModels) {
    const possiblePaths = [
      path.join(PROJECT_ROOT, 'models', 'raw_vault', 'satellites', `${model}.sql`),
      path.join(PROJECT_ROOT, 'models', 'raw_vault', 'hubs', `${model}.sql`),
      path.join(PROJECT_ROOT, 'models', 'raw_vault', 'links', `${model}.sql`),
      path.join(PROJECT_ROOT, 'models', 'staging', `${model}.sql`),
      path.join(PROJECT_ROOT, 'models', 'business_vault', `${model}.sql`),
      path.join(PROJECT_ROOT, 'models', 'mart', `${model}.sql`),
    ];
    
    for (const filePath of possiblePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        sourceFiles.push({ model, path: filePath, content });
        break;
      } catch {
        // File doesn't exist
      }
    }
  }
  
  if (sourceFiles.length === 0) {
    spinner.stop();
    console.log(chalk.yellow('[WARN] Keine Quelldateien gefunden zum Reparieren'));
    return;
  }
  
  const fixPrompt = `Basierend auf dieser Fehleranalyse, repariere die betroffenen Dateien.

**Fehler:**
${errorOutput}

**Analyse:**
${analysis}

**Betroffene Dateien:**
${sourceFiles.map(f => `
### ${f.model} (${f.path})
\`\`\`sql
${f.content}
\`\`\`
`).join('\n')}

Verwende das edit_model Tool um jede betroffene Datei zu reparieren.
WICHTIG: 
- Ersetze die GESAMTE Datei, nicht nur Teile
- Bei SQL Server reservierten Keywords wie BEGIN, END, USER, KEY etc. verwende [brackets]
- Stelle sicher, dass alle Spalten konsistent escaped sind`;

  try {
    const tools = getAllTools();
    
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: fixPrompt }],
      tools,
    });
    
    spinner.stop();
    
    let fixesApplied = 0;
    
    // Process tool calls
    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'edit_model') {
        console.log(chalk.gray(`  Fixing ${(block.input as Record<string, unknown>).modelName}...`));
        const toolResult = await executeTool('edit_model', block.input as Record<string, unknown>);
        
        if (!toolResult.includes('ERROR')) {
          fixesApplied++;
          console.log(chalk.green(`  ✓ ${(block.input as Record<string, unknown>).modelName} repariert`));
        } else {
          console.log(chalk.red(`  ✗ Fehler beim Reparieren: ${toolResult}`));
        }
      }
    }
    
    if (fixesApplied > 0) {
      console.log('');
      console.log(chalk.green(`[OK] ${fixesApplied} Datei(en) repariert`));
      
      // Offer to re-run
      const rerun = await confirm({
        message: 'Models erneut deployen?',
        default: true,
      });
      
      if (rerun) {
        const command = `dbt run --select ${failedModels.join(' ')}`;
        console.log('');
        console.log(chalk.cyan(`[CMD] ${command}`));
        console.log('');
        await executeTool('run_command', { command });
      }
    }
    
  } catch (error) {
    spinner.stop();
    console.log(chalk.red(`[ERROR] Auto-Fix fehlgeschlagen: ${error}`));
  }
}

interface DeploymentStatus {
  deployed: Set<string>;      // Successfully deployed to DB
  failed: Set<string>;        // Failed in last run
  compiled: Set<string>;      // In manifest but status unknown
  notDeployed: Set<string>;   // Explicitly not in DB
  lastRun?: Date;
}

/**
 * State file to track deployment history across runs
 */
const STATE_FILE = '.dbt-agent-state.json';

interface AgentState {
  deployedModels: string[];
  lastUpdated: string;
}

/**
 * Load persisted state
 */
async function loadAgentState(): Promise<AgentState | null> {
  try {
    const statePath = path.join(PROJECT_ROOT, STATE_FILE);
    const content = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save persisted state
 */
async function saveAgentState(state: AgentState): Promise<void> {
  try {
    const statePath = path.join(PROJECT_ROOT, STATE_FILE);
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  } catch {
    // Ignore save errors
  }
}

/**
 * Load deployment status from dbt target artifacts + persisted state
 */
async function loadDeploymentStatus(): Promise<DeploymentStatus> {
  const status: DeploymentStatus = {
    deployed: new Set(),
    failed: new Set(),
    compiled: new Set(),
    notDeployed: new Set(),
  };

  // Load persisted state first (accumulated history)
  const agentState = await loadAgentState();
  if (agentState) {
    for (const model of agentState.deployedModels) {
      status.deployed.add(model);
    }
  }

  // Update from run_results.json (latest run)
  try {
    const runResultsPath = path.join(PROJECT_ROOT, 'target', 'run_results.json');
    const runResultsContent = await fs.readFile(runResultsPath, 'utf-8');
    const runResults = JSON.parse(runResultsContent);
    
    if (runResults.generated_at) {
      status.lastRun = new Date(runResults.generated_at);
    }
    
    for (const result of runResults.results || []) {
      const uniqueId = result.unique_id || '';
      const modelName = uniqueId.split('.').pop() || '';
      
      if (result.status === 'success') {
        status.deployed.add(modelName);
        status.failed.delete(modelName);
      } else if (result.status === 'error' || result.status === 'fail') {
        status.failed.add(modelName);
        status.deployed.delete(modelName);
      }
    }
    
    // Persist updated state
    await saveAgentState({
      deployedModels: Array.from(status.deployed),
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    // run_results.json doesn't exist
  }

  // Add compiled models from manifest
  try {
    const manifestPath = path.join(PROJECT_ROOT, 'target', 'manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    
    for (const nodeId of Object.keys(manifest.nodes || {})) {
      if (nodeId.startsWith('model.')) {
        const modelName = nodeId.split('.').pop() || '';
        if (!status.deployed.has(modelName) && !status.failed.has(modelName)) {
          status.compiled.add(modelName);
        }
      }
    }
  } catch (error) {
    // manifest.json doesn't exist
  }

  return status;
}

/**
 * Get status summary string
 */
function getStatusSummary(status: DeploymentStatus): string {
  const parts: string[] = [];
  
  if (status.lastRun) {
    const timeAgo = getTimeAgo(status.lastRun);
    parts.push(chalk.gray(`Letzter Run: ${timeAgo}`));
  }
  
  if (status.deployed.size > 0) {
    parts.push(chalk.green(`✓ ${status.deployed.size} deployed`));
  }
  if (status.failed.size > 0) {
    parts.push(chalk.red(`✗ ${status.failed.size} failed`));
  }
  if (status.compiled.size > 0) {
    parts.push(chalk.yellow(`○ ${status.compiled.size} pending`));
  }
  
  if (parts.length === 0) {
    return chalk.gray('Keine dbt Artifacts gefunden. Führe "dbt run" aus.');
  }
  
  return parts.join(' │ ');
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'gerade eben';
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`;
  return `vor ${Math.floor(seconds / 86400)} Tagen`;
}

/**
 * List directory contents for browsing with deployment status
 */
async function listDirectoryForBrowse(
  dir: string, 
  recursive: boolean,
  deploymentStatus: DeploymentStatus
): Promise<string> {
  const absolutePath = path.join(PROJECT_ROOT, dir);
  
  async function listRecursive(basePath: string, relativePath: string, depth: number = 0): Promise<string[]> {
    if (depth > 4) return [];
    
    const fullPath = path.join(basePath, relativePath);
    const indent = '  '.repeat(depth);
    const results: string[] = [];
    
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
      const files = entries.filter(e => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));
      
      for (const d of dirs) {
        results.push(`${indent}${chalk.blue('[DIR] ' + d.name + '/')}`);
        if (recursive) {
          const subResults = await listRecursive(basePath, path.join(relativePath, d.name), depth + 1);
          results.push(...subResults);
        }
      }
      
      for (const f of files) {
        const displayName = formatFileWithStatus(f.name, deploymentStatus);
        results.push(`${indent}${displayName}`);
      }
    } catch (error) {
      // Ignore unreadable directories
    }
    
    return results;
  }
  
  const results = await listRecursive(PROJECT_ROOT, dir, 0);
  
  if (results.length === 0) {
    return chalk.yellow(`[DIR] ${dir}: (leer)`);
  }
  
  return `${chalk.cyan.bold('[DIR] ' + dir + (recursive ? ' (rekursiv)' : '') + ':')}\n${results.join('\n')}`;
}

/**
 * Format filename with deployment status indicator
 */
function formatFileWithStatus(filename: string, status: DeploymentStatus): string {
  const icon = getFileIcon(filename);
  
  // Only show status for SQL files (models)
  if (!filename.endsWith('.sql')) {
    return `${chalk.gray(icon + ' ')}${chalk.white(filename)}`;
  }
  
  // Extract model name without extension
  const modelName = filename.replace('.sql', '');
  
  // Check deployment status
  if (status.deployed.has(modelName)) {
    return `${chalk.green('✓')} ${chalk.gray(icon)} ${chalk.white(filename)}`;
  } else if (status.failed.has(modelName)) {
    return `${chalk.red('✗')} ${chalk.gray(icon)} ${chalk.white(filename)} ${chalk.red('(failed)')}`;
  } else if (status.compiled.has(modelName)) {
    return `${chalk.yellow('○')} ${chalk.gray(icon)} ${chalk.white(filename)} ${chalk.yellow('(pending)')}`;
  } else {
    return `${chalk.gray('·')} ${chalk.gray(icon)} ${chalk.dim(filename)} ${chalk.gray('(neu)')}`;
  }
}

/**
 * Get icon based on file extension
 */
function getFileIcon(filename: string): string {
  if (filename.endsWith('.sql')) return '[SQL]';
  if (filename.endsWith('.yml') || filename.endsWith('.yaml')) return '[YML]';
  if (filename.endsWith('.csv')) return '[CSV]';
  if (filename.endsWith('.md')) return '[MD]';
  return '[FILE]';
}

/**
 * Maps menu actions to task descriptions for Claude
 */
const TASK_PROMPTS: Record<MenuAction, string> = {
  browse_objects: 'Show all existing objects in the project (use list_files with recursive=true)',
  deploy_models: 'Deploy selected dbt models',
  edit_object: 'Edit an existing dbt model',
  delete_object: 'Delete an existing dbt model',
  add_attribute: 'Add a new attribute to an existing satellite',
  create_entity: 'Create a complete new entity with all components (External Table, Staging, Hub, Satellite)',
  create_hub: 'Create a new Hub table',
  create_satellite: 'Create a new Satellite table',
  create_link: 'Create a new Link table between two hubs',
  create_ref_table: 'Create a new Reference Table (dbt seed)',
  create_eff_sat: 'Create a new Effectivity Satellite',
  create_pit: 'Create a new PIT (Point-in-Time) table',
  create_mart: 'Create a new Mart View for reporting',
  add_tests: 'Add dbt tests to schema.yml',
  exit: '',
};

/**
 * Actions that use the wizard system instead of free-form input
 */
const WIZARD_ACTIONS: MenuAction[] = [
  'create_mart',
  'create_hub',
  'create_satellite',
  'create_link',
  'create_entity',
  'edit_object',
  'delete_object',
];

/**
 * Run the appropriate wizard for an action
 */
async function runWizardForAction(action: MenuAction): Promise<WizardResult | null> {
  switch (action) {
    case 'create_mart':
      return runMartWizard();
    case 'create_hub':
      return runHubWizard();
    case 'create_satellite':
      return runSatelliteWizard();
    case 'create_entity':
      return runEntityWizard();
    case 'create_link':
      return runLinkWizard();
    case 'edit_object':
      return runEditWizard();
    case 'delete_object':
      return runDeleteWizard();
    default:
      return null;
  }
}

/**
 * Convert wizard result to tool input parameters
 */
function wizardResultToToolInput(result: WizardResult): { toolName: string; input: unknown } | null {
  switch (result.type) {
    case 'mart':
      return {
        toolName: 'create_mart',
        input: {
          viewName: result.viewName,
          description: result.description,
          baseHub: result.sourceHubs[0],
          satellites: result.sourceSatellites.map(sat => ({
            name: sat,
            columns: ['*'], // Will be expanded by tool
            currentOnly: result.includeCurrentFlag,
          })),
          links: result.sourceLinks.map(link => ({
            name: link,
            targetHub: '', // Will be determined by tool
          })),
          subfolder: result.schema,
        },
      };
    case 'hub':
      return {
        toolName: 'create_hub',
        input: {
          entityName: result.entityName,
          businessKeyColumns: [result.businessKeyColumn],
          sourceModel: `stg_${result.entityName}`,
        },
      };
    case 'satellite':
      return {
        toolName: 'create_satellite',
        input: {
          entityName: result.entityName,
          payloadColumns: result.attributes,
          sourceModel: result.sourceStaging,
          parentHub: result.parentHub,
        },
      };
    case 'link':
      return {
        toolName: 'create_link',
        input: {
          name: result.name,
          hub1: result.hub1,
          hub2: result.hub2,
          sourceStaging: result.sourceStaging,
        },
      };
    case 'entity':
      // Entity is special - handled separately in executeEntityWizard
      return null;
    case 'edit':
      // Edit requires Claude to analyze and apply changes
      return null;
    case 'delete':
      return {
        toolName: 'delete_model',
        input: {
          modelName: result.modelName,
          confirmed: result.confirmed,
        },
      };
  }
}

// ============================================================================
// VALIDATION & AUTO-FIX
// ============================================================================

interface ValidationResult {
  hasErrors: boolean;
  errors: string;
  rawOutput: string;
}

/**
 * Validate created models by running dbt compile
 */
async function validateCreatedModels(modelSelector: string, entityName: string): Promise<ValidationResult> {
  const { handleRunCommand } = await import('./tools/runCommand.js');
  
  try {
    const result = await handleRunCommand({
      command: `dbt compile --select ${modelSelector}`,
      timeout_seconds: 120,
    });
    
    // Parse the result - it's a formatted string
    const hasErrors = result.includes('ERROR') || 
                      result.includes('Compilation Error') ||
                      result.includes('Database Error') ||
                      result.includes('exit code: 1');
    
    // Extract error messages
    let errors = '';
    if (hasErrors) {
      // Extract relevant error lines
      const lines = result.split('\n');
      const errorLines = lines.filter(l => 
        l.includes('Error') || 
        l.includes('error') || 
        l.includes('failed') ||
        l.includes('invalid') ||
        l.includes('not found')
      );
      errors = errorLines.join('\n') || result;
    }
    
    return {
      hasErrors,
      errors,
      rawOutput: result,
    };
  } catch (error) {
    return {
      hasErrors: true,
      errors: String(error),
      rawOutput: String(error),
    };
  }
}

interface FixResult {
  fixed: boolean;
  output: string;
}

/**
 * Use Claude to fix validation errors in created models
 */
async function fixValidationErrors(
  errors: string,
  createdFiles: string[],
  _wizardResult: WizardResult
): Promise<FixResult> {
  console.log(chalk.gray('  Reading created files for context...'));
  
  // Read the created files
  const fileContents: Record<string, string> = {};
  const { readFile: readFileContent, PATHS, getAvailableConcepts } = await import('./utils/fileOperations.js');
  const path = await import('path');
  const fs = await import('fs/promises');
  
  const concepts = await getAvailableConcepts();
  
  for (const filename of createdFiles) {
    let filePath: string | null = null;
    
    if (filename.startsWith('stg_')) {
      filePath = path.join(PATHS.staging, filename);
    } else if (filename.startsWith('hub_')) {
      // Search in all concept directories
      for (const concept of concepts) {
        const candidatePath = path.join(PATHS.rawVault, concept, 'hubs', filename);
        try {
          await fs.access(candidatePath);
          filePath = candidatePath;
          break;
        } catch {
          // Try next concept
        }
      }
    } else if (filename.startsWith('sat_') || filename.startsWith('eff_sat_')) {
      // Search in all concept directories
      for (const concept of concepts) {
        const candidatePath = path.join(PATHS.rawVault, concept, 'satellites', filename);
        try {
          await fs.access(candidatePath);
          filePath = candidatePath;
          break;
        } catch {
          // Try next concept
        }
      }
    } else if (filename.startsWith('link_')) {
      // Search in all concept directories
      for (const concept of concepts) {
        const candidatePath = path.join(PATHS.rawVault, concept, 'links', filename);
        try {
          await fs.access(candidatePath);
          filePath = candidatePath;
          break;
        } catch {
          // Try next concept
        }
      }
    } else {
      continue;
    }
    
    if (!filePath) continue;
    
    try {
      const content = await readFileContent(filePath);
      if (content) {
        fileContents[filename] = content;
      }
    } catch {
      // File might not exist yet
    }
  }
  
  // Build prompt for Claude to fix the errors
  const fixPrompt = `
FEHLER BEIM KOMPILIEREN - BITTE KORRIGIEREN

## Compile Errors:
\`\`\`
${errors}
\`\`\`

## Betroffene Dateien:
${Object.entries(fileContents).map(([name, content]) => `
### ${name}
\`\`\`sql
${content}
\`\`\`
`).join('\n')}

AUFGABE: Analysiere die Fehler und korrigiere die betroffenen Dateien mit dem edit_file Tool.
Beachte dabei:
1. Azure SQL Server Syntax (keine PostgreSQL-spezifischen Funktionen)
2. Data Vault 2.1 Namenskonventionen (hk_, hd_, dss_)
3. Korrekte Jinja2/dbt Syntax
4. Alle Spalten müssen in der Source existieren
`;

  console.log(chalk.gray('  Asking AI to fix errors...'));
  
  // Use the existing agent infrastructure via the tools
  try {
    const tools = getAllTools();
    
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: fixPrompt }],
      tools,
    });
    
    let hasEdits = false;
    let responseText = '';
    
    // Process response and execute any tool calls
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      } else if (block.type === 'tool_use') {
        // Execute the tool
        const toolResult = await executeTool(block.name, block.input as Record<string, unknown>);
        if (block.name === 'edit_file' && !toolResult.includes('ERROR')) {
          hasEdits = true;
          console.log(chalk.green(`  ✓ Fixed: ${(block.input as { filePath?: string }).filePath || 'file'}`));
        }
      }
    }
    
    if (hasEdits) {
      // Re-validate after fix
      console.log(chalk.gray('  Re-validating after fix...'));
      const modelSelector = createdFiles.map(f => f.replace('.sql', '')).join(' ');
      const revalidation = await validateCreatedModels(modelSelector, '');
      
      return {
        fixed: !revalidation.hasErrors,
        output: responseText,
      };
    }
    
    return {
      fixed: false,
      output: responseText || 'AI did not make any edits',
    };
  } catch (error) {
    return {
      fixed: false,
      output: `AI fix failed: ${error}`,
    };
  }
}

/**
 * Execute edit wizard with AI assistance
 */
async function executeEditWithAI(result: WizardResult): Promise<string> {
  if (result.type !== 'edit') return 'Invalid result type';
  
  console.log('');
  console.log(chalk.cyan(`[EDIT] ${result.modelName}`));
  console.log(chalk.gray(`  Aktion: ${result.editAction}`));
  if (result.attributeNames && result.attributeNames.length > 0) {
    console.log(chalk.gray(`  Attribute: ${result.attributeNames.join(', ')}`));
  }
  if (result.attributeName) {
    console.log(chalk.gray(`  Attribut: ${result.attributeName}`));
  }
  console.log('');
  
  // Build specific prompt based on action
  let editPrompt = `Bearbeite das Model ${result.modelName}.\n\n`;
  editPrompt += `**Datei:** ${result.filePath}\n`;
  editPrompt += `**Model-Typ:** ${result.modelType}\n\n`;
  
  switch (result.editAction) {
    case 'add_attribute':
      if (result.attributeNames && result.attributeNames.length > 0) {
        editPrompt += `**Aufgabe:** Füge folgende Attribute hinzu: ${result.attributeNames.join(', ')}\n`;
        if (result.modelType === 'satellite') {
          editPrompt += result.includeInHashDiff 
            ? `- ALLE Attribute zur SELECT-Spalte UND zum hashdiff_columns Array hinzufügen\n`
            : `- ALLE Attribute NUR zur SELECT-Spalte hinzufügen, NICHT zum hashdiff_columns Array\n`;
          editPrompt += `- Die Attribute kommen aus dem Source-Staging (src.attributname)\n`;
          editPrompt += `- Füge sie im Payload-Bereich ein, vor den Metadaten-Spalten\n`;
        } else if (result.modelType === 'staging') {
          editPrompt += `- Spalten zur SELECT-Liste hinzufügen (src.spaltenname)\n`;
          editPrompt += `- Alle zum hashdiff_columns Array hinzufügen\n`;
        }
      } else {
        editPrompt += `**Aufgabe:** Füge das Attribut "${result.attributeName}" hinzu.\n`;
      }
      break;
      
    case 'remove_attribute':
      editPrompt += `**Aufgabe:** Entferne das Attribut "${result.attributeName}".\n`;
      if (result.modelType === 'satellite') {
        editPrompt += `- Attribut aus SELECT und hashdiff_columns entfernen\n`;
      } else {
        editPrompt += `- Attribut aus allen relevanten Stellen entfernen\n`;
      }
      break;
      
    case 'add_to_hashdiff':
      editPrompt += `**Aufgabe:** Füge "${result.attributeName}" zum hashdiff_columns Array hinzu.\n`;
      editPrompt += `- Das Attribut existiert bereits in der SELECT-Liste\n`;
      editPrompt += `- Nur das hashdiff_columns Array am Anfang der Datei anpassen\n`;
      break;
      
    case 'remove_from_hashdiff':
      editPrompt += `**Aufgabe:** Entferne "${result.attributeName}" aus dem hashdiff_columns Array.\n`;
      editPrompt += `- Die Spalte soll weiterhin in der SELECT-Liste bleiben\n`;
      editPrompt += `- Nur das hashdiff_columns Array am Anfang der Datei anpassen\n`;
      break;
      
    case 'add_fk':
      editPrompt += `**Aufgabe:** Füge einen Foreign Key hinzu.\n`;
      editPrompt += `- FK Spalte: ${result.fkColumn}\n`;
      editPrompt += `- Ziel-Hub: ${result.fkTargetHub}\n`;
      editPrompt += `- Berechne hk_${result.fkTargetHub?.replace(/^hub_/, '')} als Hash der FK-Spalte\n`;
      editPrompt += `- Verwende CONVERT(CHAR(64), HASHBYTES('SHA2_256', ...), 2) Syntax\n`;
      break;
      
    case 'change_source':
      editPrompt += `**Aufgabe:** Ändere die Source auf "${result.sourceModel}".\n`;
      if (result.modelType === 'staging') {
        editPrompt += `- External Table im FROM-Teil ändern\n`;
        editPrompt += `- ref() oder source() Aufruf anpassen\n`;
      } else {
        editPrompt += `- Staging View Reference ändern: ref('${result.sourceModel}')\n`;
      }
      break;
      
    case 'custom':
      editPrompt += `**Aufgabe:** ${result.customDescription}\n`;
      break;
  }
  
  editPrompt += `\n**Aktueller Inhalt:**\n\`\`\`sql\n${result.currentContent}\n\`\`\`\n\n`;
  editPrompt += `Bitte:\n`;
  editPrompt += `1. Verwende das edit_model Tool um die Datei zu aktualisieren\n`;
  editPrompt += `2. Der neue Inhalt muss VOLLSTÄNDIG sein (ersetze die ganze Datei)\n`;
  editPrompt += `3. Beachte Azure SQL Server Syntax und Data Vault 2.1 Konventionen\n`;

  const spinner = ora({
    text: chalk.yellow('AI wendet Änderung an...'),
    spinner: 'dots',
  }).start();
  
  try {
    const tools = getAllTools();
    
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: editPrompt }],
      tools,
    });
    
    spinner.stop();
    
    let responseText = '';
    let editApplied = false;
    
    // Process response and execute tool calls
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      } else if (block.type === 'tool_use' && block.name === 'edit_model') {
        console.log(chalk.gray('  Wende Änderungen an...'));
        const toolResult = await executeTool('edit_model', block.input as Record<string, unknown>);
        console.log(ui.toolResult(toolResult, !toolResult.includes('ERROR')));
        
        if (!toolResult.includes('ERROR')) {
          editApplied = true;
          
          // Validate after edit
          console.log('');
          console.log(chalk.cyan(`[VALIDATE] Compiling ${result.modelName}...`));
          const validation = await validateCreatedModels(result.modelName, result.modelName);
          
          if (validation.hasErrors) {
            console.log(chalk.yellow('[WARN] Validation errors after edit'));
            console.log(chalk.gray(validation.errors));
          } else {
            console.log(chalk.green('[OK] Validation passed'));
          }
        }
      }
    }
    
    if (!editApplied) {
      console.log(chalk.yellow('[WARN] AI hat keine Änderungen vorgenommen'));
      if (responseText) {
        console.log(chalk.gray(responseText));
      }
    }
    
    return responseText || 'Edit completed';
  } catch (error) {
    spinner.stop();
    console.log(chalk.red(`[ERROR] ${error}`));
    return `Edit failed: ${error}`;
  }
}

/**
 * Execute entity wizard (creates multiple files)
 */
async function executeEntityWizard(result: WizardResult): Promise<string> {
  if (result.type !== 'entity') return 'Invalid result type';
  
  const outputs: string[] = [];
  const createdFiles: string[] = [];
  
  // Start transaction for multi-file undo
  conversation.startTransaction(`Entity: ${result.entityName}`);
  
  console.log('');
  console.log(chalk.cyan(`[ACTION] Creating entity: ${result.entityName}`));
  console.log('');
  
  // 1. Create Staging
  if (result.createStaging) {
    console.log(chalk.gray(`  [1/3] Creating stg_${result.entityName}...`));
    const stagingResult = await executeTool('create_staging', {
      entityName: result.entityName,
      externalTable: result.externalTable,
      businessKeyColumns: result.businessKeyColumns,  // All BKs for composite hash
      payloadColumns: result.attributeColumns,
    });
    outputs.push(stagingResult);
    if (!stagingResult.includes('ERROR')) {
      createdFiles.push(`stg_${result.entityName}.sql`);
    }
  }
  
  // 2. Create Hub
  if (result.createHub) {
    console.log(chalk.gray(`  [2/3] Creating hub_${result.entityName}...`));
    const hubResult = await executeTool('create_hub', {
      entityName: result.entityName,
      businessKeyColumns: result.businessKeyColumns,  // All BKs for composite key
      sourceModel: `stg_${result.entityName}`,
    });
    outputs.push(hubResult);
    if (!hubResult.includes('ERROR')) {
      createdFiles.push(`hub_${result.entityName}.sql`);
    }
  }
  
  // 3. Create Satellite
  if (result.createSatellite) {
    console.log(chalk.gray(`  [3/3] Creating sat_${result.entityName}...`));
    const satResult = await executeTool('create_satellite', {
      entityName: result.entityName,
      payloadColumns: result.attributeColumns,
      sourceModel: `stg_${result.entityName}`,
      parentHub: `hub_${result.entityName}`,
    });
    outputs.push(satResult);
    if (!satResult.includes('ERROR')) {
      createdFiles.push(`sat_${result.entityName}.sql`);
    }
  }
  
  // Commit transaction
  conversation.commitTransaction();
  
  // === VALIDATION: Compile models to check for errors ===
  if (createdFiles.length > 0) {
    console.log('');
    console.log(chalk.cyan('[VALIDATE] Compiling created models...'));
    
    const modelsToValidate = createdFiles.map(f => f.replace('.sql', '')).join(' ');
    const compileResult = await validateCreatedModels(modelsToValidate, result.entityName);
    
    if (compileResult.hasErrors) {
      // Rollback transaction if validation fails
      console.log(chalk.yellow('\n[ROLLBACK] Validation failed - invoking AI to fix...'));
      
      // Let the AI fix the errors
      const fixResult = await fixValidationErrors(
        compileResult.errors,
        createdFiles,
        result
      );
      
      if (fixResult.fixed) {
        console.log(chalk.green('[OK] AI successfully fixed the errors'));
        outputs.push(fixResult.output);
      } else {
        console.log(chalk.red('[ERROR] AI could not fix all errors'));
        console.log(chalk.yellow('Please review the files manually:'));
        createdFiles.forEach(f => console.log(chalk.gray(`  - models/*/${f}`)));
        outputs.push(fixResult.output);
      }
    } else {
      console.log(chalk.green('[OK] Validation passed - models compile successfully'));
    }
  }
  
  // Summary
  console.log('');
  console.log(ui.divider());
  console.log(chalk.green(`[OK] Entity ${result.entityName} created`));
  console.log(chalk.gray(`     Files: ${createdFiles.join(', ')}`));
  console.log('');
  console.log(chalk.cyan('[NEXT]'));
  console.log(`  dbt run --select stg_${result.entityName} hub_${result.entityName} sat_${result.entityName}`);
  console.log('');
  
  return outputs.join('\n\n');
}

/**
 * Execute wizard result directly without Claude
 */
async function executeWizardDirectly(result: WizardResult): Promise<string> {
  // Entity wizard needs special handling (multiple tools)
  if (result.type === 'entity') {
    return executeEntityWizard(result);
  }
  
  // Edit wizard needs Claude to analyze and apply changes
  if (result.type === 'edit') {
    return executeEditWithAI(result);
  }
  
  const toolInfo = wizardResultToToolInput(result);
  if (!toolInfo) {
    return 'No tool mapping for wizard result';
  }
  
  const { toolName, input } = toolInfo;
  
  console.log('');
  console.log(chalk.blue(`[ACTION] ${toolName}`));
  console.log('');
  
  const toolResult = await executeTool(toolName, input);
  const hasError = toolResult.includes('ERROR');
  console.log(ui.toolResult(toolResult, !hasError));
  
  // === VALIDATION: Compile the created model ===
  if (!hasError && result.type !== 'delete') {
    // Determine the model name from the result
    let modelName: string | null = null;
    
    switch (result.type) {
      case 'hub':
        modelName = `hub_${result.entityName}`;
        break;
      case 'satellite':
        modelName = `sat_${result.entityName}${result.isExtended ? '_ext' : ''}`;
        break;
      case 'link':
        modelName = result.name;
        break;
      case 'mart':
        modelName = result.viewName;
        break;
    }
    
    if (modelName) {
      console.log('');
      console.log(chalk.cyan(`[VALIDATE] Compiling ${modelName}...`));
      
      const validation = await validateCreatedModels(modelName, modelName);
      
      if (validation.hasErrors) {
        console.log(chalk.yellow('[WARN] Validation failed - invoking AI to fix...'));
        
        const fixResult = await fixValidationErrors(
          validation.errors,
          [`${modelName}.sql`],
          result
        );
        
        if (fixResult.fixed) {
          console.log(chalk.green('[OK] AI successfully fixed the errors'));
        } else {
          console.log(chalk.red('[ERROR] AI could not fix all errors'));
          console.log(chalk.yellow(`Please review: models/*/${modelName}.sql`));
        }
        
        return toolResult + '\n\n' + fixResult.output;
      } else {
        console.log(chalk.green('[OK] Validation passed'));
      }
    }
  }
  
  return toolResult;
}

/**
 * Run an agent task based on user selection
 */
export async function runAgentTask(action: MenuAction): Promise<void> {
  console.log(''); // Leerzeile fuer bessere Lesbarkeit
  
  // Special handling for browse_objects - show structure directly
  if (action === 'browse_objects') {
    await browseProjectObjects();
    return;
  }
  
  // Special handling for deploy_models - direct execution
  if (action === 'deploy_models') {
    const result = await deployModels();
    if (result) {
      console.log(result);
    }
    return;
  }

  // Check if this action uses a wizard (direct execution without Claude)
  if (WIZARD_ACTIONS.includes(action)) {
    // Run the wizard to collect structured parameters
    const wizardResult = await runWizardForAction(action);
    
    if (!wizardResult) {
      // User cancelled the wizard
      console.log(chalk.yellow('  Abgebrochen.'));
      return;
    }
    
    console.log('');
    console.log(chalk.green('  ✓ Parameter erfasst'));
    console.log('');
    console.log(ui.divider());
    
    // Execute directly without Claude - much faster!
    const result = await executeWizardDirectly(wizardResult);
    
    console.log('');
    console.log(ui.box('✅ Aufgabe abgeschlossen!', 'success'));
    
    // Extract and show follow-up commands
    const suggestedCommands = extractCommands(result);
    await showFollowUpMenu(suggestedCommands);
    
    return;
  }

  // Non-wizard actions: use Claude for free-form input
  const description = ACTION_DESCRIPTIONS[action];
  if (description) {
    console.log(ui.box(description, 'info'));
  }

  // Get free-form user input
  const userInput = await input({
    message: chalk.cyan('Beschreibe deine Anforderung:'),
    validate: (value: string) => value.trim().length > 0 || 'Bitte gib eine Beschreibung ein',
  });

  console.log('');
  console.log(ui.divider());

  const spinner = ora({
    text: chalk.yellow('Agent analysiert Anforderung...'),
    spinner: 'dots',
  }).start();

  try {
    const tools = getAllTools();
    
    // Build initial messages
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `## Task: ${TASK_PROMPTS[action]}

## User Request:
${userInput}

## Instructions:
1. Analyze the request and determine what needs to be created
2. Use the available tools to create the necessary files
3. Follow the project conventions exactly
4. Provide a summary of what was created and next steps

Please proceed with the task.`,
      },
    ];

    // Agentic loop - continue until no more tool calls
    let iterations = 0;
    const maxIterations = 10;
    let fullResponseText = ''; // Collect all text for command extraction

    while (iterations < maxIterations) {
      iterations++;

      spinner.text = chalk.yellow(`Agent denkt nach... (Iteration ${iterations}/${maxIterations})`);

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: getSystemPrompt(),
        messages,
        tools,
      });

      // Process response content
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
      const textParts: string[] = [];
      
      for (const block of response.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
          fullResponseText += block.text + '\n'; // Collect for later
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      // Show text response if any
      if (textParts.length > 0) {
        spinner.stop();
        console.log('');
        console.log(ui.formatResponse(textParts.join('\n')));
      }

      // If no tool use, we're done
      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        spinner.stop();
        break;
      }

      // Show tool calls
      if (toolUseBlocks.length > 0) {
        spinner.stop();
        console.log('');
        console.log(chalk.bold.blue(`🔧 ${toolUseBlocks.length} Tool(s) werden ausgeführt:`));
        console.log('');
      }

      // Execute tools and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      
      for (const toolUse of toolUseBlocks) {
        // Show tool info
        console.log(ui.toolOutput(toolUse.name, toolUse.input as Record<string, unknown>));
        
        const toolSpinner = ora({
          text: chalk.gray(`Führe ${toolUse.name} aus...`),
          spinner: 'dots',
          indent: 2,
        }).start();

        const result = await executeTool(toolUse.name, toolUse.input);
        
        // Track created files for undo functionality
        if (toolUse.name.startsWith('create_')) {
          const toolInput = toolUse.input as { name?: string; entity?: string; concept?: string };
          const name = toolInput.name || toolInput.entity;
          const concept = toolInput.concept || DEFAULT_CONCEPT;
          if (name) {
            let filePath = '';
            switch (toolUse.name) {
              case 'create_hub':
                filePath = `models/raw_vault/${concept}/hubs/hub_${name}.sql`;
                break;
              case 'create_satellite':
                filePath = `models/raw_vault/${concept}/satellites/sat_${name}.sql`;
                break;
              case 'create_link':
                filePath = `models/raw_vault/${concept}/links/link_${name}.sql`;
                break;
              case 'create_staging':
                filePath = `models/staging/stg_${name}.sql`;
                break;
              case 'create_ref_table':
                filePath = `seeds/ref_${name}.csv`;
                break;
              case 'create_eff_sat':
                filePath = `models/raw_vault/${concept}/satellites/eff_sat_${name}.sql`;
                break;
              case 'create_pit':
                filePath = `models/business_vault/pit_${name}.sql`;
                break;
              case 'create_mart':
                filePath = `models/mart/${name}.sql`;
                break;
            }
            if (filePath) {
              conversation.trackCreatedFile(filePath);
            }
          }
        }
        
        const isSuccess = !result.toLowerCase().includes('error') && !result.toLowerCase().includes('fehler');
        toolSpinner.stop();
        
        console.log(ui.toolResult(result, isSuccess));
        console.log('');
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Add assistant message and tool results to conversation
      messages.push({
        role: 'assistant',
        content: response.content,
      });
      
      messages.push({
        role: 'user',
        content: toolResults,
      });

      spinner.start();
    }

    // WICHTIG: Spinner stoppen wenn Loop endet (auch bei maxIterations)
    spinner.stop();
    
    // Warnung wenn max iterations erreicht
    if (iterations >= maxIterations) {
      console.log('');
      console.log(ui.warning(`Max Iterationen (${maxIterations}) erreicht. Agent wurde gestoppt.`));
    }

    console.log('');
    console.log(ui.box('✅ Aufgabe abgeschlossen!', 'success'));
    
    // Initialize conversation state for follow-up
    conversation.initializeFromTask(
      `Task: ${TASK_PROMPTS[action]}\nUser: ${userInput}`,
      fullResponseText
    );
    
    // Extract and show follow-up commands - immer Menu zeigen
    const suggestedCommands = extractCommands(fullResponseText);
    await showFollowUpMenu(suggestedCommands);
    
    console.log('');

  } catch (error) {
    spinner.stop();
    
    if (error instanceof Anthropic.APIError) {
      console.log('');
      console.log(ui.box(`API Fehler: ${error.message}`, 'error'));
      if (error.status === 401) {
        console.log(chalk.yellow('   💡 Bitte prüfe deinen ANTHROPIC_API_KEY'));
      } else if (error.status === 429) {
        console.log(chalk.yellow('   💡 Rate Limit erreicht. Bitte warte einen Moment.'));
      }
    } else {
      throw error;
    }
  }
}
