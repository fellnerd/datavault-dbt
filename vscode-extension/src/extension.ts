/**
 * Data Vault dbt Explorer - VS Code Extension
 * 
 * Entry point for the extension. Handles:
 * - Extension activation and deactivation
 * - Tree view provider initialization
 * - Project auto-detection and loading
 * - File system watcher setup
 * 
 * Commands are registered in ./commands/index.ts
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DbtProjectParser } from './parser';
import {
  StagingTreeProvider,
  RawVaultTreeProvider,
  BusinessVaultTreeProvider,
  MartTreeProvider,
  LoadTreeProvider
} from './providers';
import { ProjectMetadata } from './types';
import { registerCommands } from './commands';

// Global state
let loadProvider: LoadTreeProvider;
let stagingProvider: StagingTreeProvider;
let rawVaultProvider: RawVaultTreeProvider;
let businessVaultProvider: BusinessVaultTreeProvider;
let martProvider: MartTreeProvider;
let currentMetadata: ProjectMetadata | null = null;
let currentProjectPath: string | null = null;
let fileWatcher: vscode.FileSystemWatcher | null = null;
let yamlWatcher: vscode.FileSystemWatcher | null = null;
let refreshTimeout: NodeJS.Timeout | null = null;

// Tree view references for title updates
let loadView: vscode.TreeView<any>;
let stagingView: vscode.TreeView<any>;
let rawVaultView: vscode.TreeView<any>;
let businessVaultView: vscode.TreeView<any>;
let martView: vscode.TreeView<any>;

// Output channel for logging
let outputChannel: vscode.OutputChannel;

function log(message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
  console.log(`[DataVault] ${message}`);
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  outputChannel = vscode.window.createOutputChannel('Data Vault');
  context.subscriptions.push(outputChannel);
  
  log('Extension activating...');

  // Initialize tree providers
  loadProvider = new LoadTreeProvider();
  stagingProvider = new StagingTreeProvider();
  rawVaultProvider = new RawVaultTreeProvider();
  businessVaultProvider = new BusinessVaultTreeProvider();
  martProvider = new MartTreeProvider();

  // Register tree views
  loadView = vscode.window.createTreeView('datavault-sources', {
    treeDataProvider: loadProvider,
    showCollapseAll: true
  });

  stagingView = vscode.window.createTreeView('datavault-staging', {
    treeDataProvider: stagingProvider,
    showCollapseAll: true
  });

  rawVaultView = vscode.window.createTreeView('datavault-rawvault', {
    treeDataProvider: rawVaultProvider,
    showCollapseAll: true
  });

  businessVaultView = vscode.window.createTreeView('datavault-businessvault', {
    treeDataProvider: businessVaultProvider,
    showCollapseAll: true
  });

  martView = vscode.window.createTreeView('datavault-mart', {
    treeDataProvider: martProvider,
    showCollapseAll: true
  });

  // Add tree views to subscriptions
  context.subscriptions.push(
    loadView,
    stagingView,
    rawVaultView,
    businessVaultView,
    martView
  );

  // Register commands using the commands module
  const commandDisposables = registerCommands(context, {
    extensionContext: context,
    getCurrentMetadata: () => currentMetadata,
    getCurrentProjectPath: () => currentProjectPath,
    refreshProject,
    log
  });

  // Register select project command separately (uses local function)
  const selectProjectCommand = vscode.commands.registerCommand('datavault.selectProject', async () => {
    await selectProject();
  });

  context.subscriptions.push(...commandDisposables, selectProjectCommand);

  // Auto-detect and load project - retry multiple times as workspace might not be ready
  let retryCount = 0;
  const maxRetries = 5;
  const retryInterval = 1000;

  const tryAutoDetect = async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      log(`Workspace ready after ${retryCount} retries`);
      await autoDetectProject();
    } else if (retryCount < maxRetries) {
      retryCount++;
      log(`Workspace not ready, retry ${retryCount}/${maxRetries}...`);
      setTimeout(tryAutoDetect, retryInterval);
    } else {
      log('Max retries reached, workspace still not available');
      await autoDetectProject(); // Will show warning message
    }
  };

  setTimeout(tryAutoDetect, 500);

  // Also listen for workspace folder changes (important for Extension Host)
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      log('Workspace folders changed, re-detecting...');
      if (!currentProjectPath) {
        autoDetectProject();
      }
    })
  );

  // Setup configuration change listener
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('datavault')) {
      setupFileWatcher();
    }
  });
  
  log('Extension activated');
}

/**
 * Auto-detect dbt project in workspace
 */
async function autoDetectProject(): Promise<void> {
  log('Starting auto-detect...');
  
  // Debug: Log all workspace info
  const workspaceFolders = vscode.workspace.workspaceFolders;
  log(`workspaceFolders: ${JSON.stringify(workspaceFolders?.map(f => f.uri.fsPath))}`);
  log(`workspaceFile: ${vscode.workspace.workspaceFile?.fsPath}`);
  
  const config = vscode.workspace.getConfiguration('datavault');
  const configuredPath = config.get<string>('projectPath');

  if (configuredPath && configuredPath.trim() !== '') {
    log(`Using configured path: ${configuredPath}`);
    currentProjectPath = configuredPath;
    await loadProject(configuredPath);
    return;
  }

  // Auto-detect - workspaceFolders already declared above
  if (!workspaceFolders || workspaceFolders.length === 0) {
    log('No workspace folders found');
    vscode.window.showWarningMessage('Data Vault: No workspace folder open');
    return;
  }

  log(`Found ${workspaceFolders.length} workspace folder(s)`);
  
  // Try to find dbt projects
  const projects: string[] = [];
  
  for (const folder of workspaceFolders) {
    const folderPath = folder.uri.fsPath;
    log(`Checking folder: ${folderPath}`);
    
    // Direct check for dbt_project.yml in root
    const rootConfig = path.join(folderPath, 'dbt_project.yml');
    if (fs.existsSync(rootConfig)) {
      log(`Found dbt_project.yml at: ${rootConfig}`);
      projects.push(folderPath);
    }
    
    // Also check masterdata subfolder (common in this project)
    const masterdataConfig = path.join(folderPath, 'masterdata', 'dbt', 'dbt_project.yml');
    if (fs.existsSync(masterdataConfig)) {
      log(`Found dbt_project.yml at: ${masterdataConfig}`);
      projects.push(path.join(folderPath, 'masterdata', 'dbt'));
    }
  }
  
  log(`Total dbt projects found: ${projects.length}`);
  
  if (projects.length === 0) {
    log('No dbt project found - use Command Palette to select manually');
    return;
  }

  if (projects.length === 1) {
    currentProjectPath = projects[0];
    log(`Loading single project: ${projects[0]}`);
    await loadProject(projects[0]);
  } else {
    // Multiple projects - load first one automatically
    currentProjectPath = projects[0];
    log(`Multiple projects found, loading first: ${projects[0]}`);
    await loadProject(projects[0]);
  }
}

/**
 * Let user select a project manually
 */
async function selectProject(): Promise<void> {
  const result = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Select dbt Project Folder (containing dbt_project.yml)',
    openLabel: 'Select Project'
  });

  if (result && result.length > 0) {
    const selectedPath = result[0].fsPath;
    const configPath = path.join(selectedPath, 'dbt_project.yml');
    
    if (fs.existsSync(configPath)) {
      currentProjectPath = selectedPath;
      await loadProject(selectedPath);
    } else {
      vscode.window.showErrorMessage(`No dbt_project.yml found in ${selectedPath}`);
    }
  }
}

/**
 * Load and parse a dbt project
 */
async function loadProject(projectPath: string): Promise<void> {
  log(`Loading project from: ${projectPath}`);
  
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Data Vault: Loading dbt project...',
      cancellable: false
    },
    async (progress) => {
      try {
        progress.report({ message: 'Parsing project structure...' });
        
        const parser = new DbtProjectParser(projectPath);
        currentMetadata = await parser.parse();

        log(`Parsed ${currentMetadata.models.length} models from ${currentMetadata.projectName}`);

        progress.report({ message: 'Updating views...' });
        
        // Update all providers
        loadProvider.setMetadata(currentMetadata);
        stagingProvider.setMetadata(currentMetadata);
        rawVaultProvider.setMetadata(currentMetadata);
        businessVaultProvider.setMetadata(currentMetadata);
        martProvider.setMetadata(currentMetadata);

        // Update tree view titles with model counts
        updateTreeViewTitles(currentMetadata);

        // Setup file watcher
        setupFileWatcher();

        vscode.window.showInformationMessage(
          `Loaded ${currentMetadata.models.length} models from ${currentMetadata.projectName}`
        );
        
        log('Project loaded successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`Failed to load project: ${errorMessage}`);
        console.error('Failed to load project:', error);
        vscode.window.showErrorMessage(`Failed to load dbt project: ${errorMessage}`);
      }
    }
  );
}

/**
 * Refresh the current project
 */
async function refreshProject(): Promise<void> {
  if (!currentProjectPath) {
    log('No current project, running auto-detect');
    await autoDetectProject();
    return;
  }

  await loadProject(currentProjectPath);
}

/**
 * Update tree view titles with model counts
 */
function updateTreeViewTitles(metadata: ProjectMetadata): void {
  const loadCount = metadata.externalTables?.length || 0;
  const stagingCount = metadata.staging.length;
  const rawVaultCount = metadata.hubs.length + metadata.satellites.length + metadata.links.length;
  const businessVaultCount = metadata.pits.length + metadata.bridges.length;
  const martCount = metadata.marts.length;

  loadView.title = `Sources (${loadCount})`;
  stagingView.title = `Staging (${stagingCount})`;
  rawVaultView.title = `Raw Vault (${rawVaultCount})`;
  businessVaultView.title = `Business Vault (${businessVaultCount})`;
  martView.title = `Marts (${martCount})`;
}

/**
 * Setup file system watcher for auto-refresh
 */
function setupFileWatcher(): void {
  // Dispose existing watchers
  if (fileWatcher) {
    fileWatcher.dispose();
    fileWatcher = null;
  }
  if (yamlWatcher) {
    yamlWatcher.dispose();
    yamlWatcher = null;
  }

  const config = vscode.workspace.getConfiguration('datavault');
  const autoRefresh = config.get<boolean>('autoRefresh', true);
  const debounceMs = config.get<number>('refreshDebounceMs', 1000);

  if (!autoRefresh || !currentProjectPath) {
    return;
  }

  log('Setting up file watcher');

  // Watch for SQL and YAML file changes
  const sqlPattern = new vscode.RelativePattern(currentProjectPath, 'models/**/*.sql');
  const yamlPattern = new vscode.RelativePattern(currentProjectPath, 'models/**/*.yml');
  
  fileWatcher = vscode.workspace.createFileSystemWatcher(sqlPattern);
  yamlWatcher = vscode.workspace.createFileSystemWatcher(yamlPattern);

  const debouncedRefresh = () => {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(() => {
      log('File change detected, refreshing...');
      refreshProject();
      refreshTimeout = null;
    }, debounceMs);
  };

  // SQL file events
  fileWatcher.onDidChange(debouncedRefresh);
  fileWatcher.onDidCreate(debouncedRefresh);
  fileWatcher.onDidDelete(debouncedRefresh);
  
  // YAML file events
  yamlWatcher.onDidChange(debouncedRefresh);
  yamlWatcher.onDidCreate(debouncedRefresh);
  yamlWatcher.onDidDelete(debouncedRefresh);
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  log('Extension deactivating');
  if (fileWatcher) {
    fileWatcher.dispose();
  }
  if (yamlWatcher) {
    yamlWatcher.dispose();
  }
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }
}
