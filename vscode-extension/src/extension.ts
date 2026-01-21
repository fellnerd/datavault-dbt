import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DbtProjectParser, findDbtProjects } from './parser';
import {
  StagingTreeProvider,
  RawVaultTreeProvider,
  BusinessVaultTreeProvider,
  MartTreeProvider,
  LoadTreeProvider,
  TreeItemData
} from './treeProviders';
import { ModelDetailsPanel } from './webviewPanel';
import { ProjectMetadata, DbtModel } from './types';
import {
  listParquetFiles,
  getParquetSchema,
  findSourcesYaml,
  tableExistsInSources,
  addTablesToSourcesYaml,
  replaceTableInSourcesYaml,
  ExternalTableDefinition,
  runDbtOperation,
  getDbtPath
} from './discoverService';

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

  // Register commands
  const refreshCommand = vscode.commands.registerCommand('datavault.refresh', async () => {
    log('Refresh command triggered');
    await refreshProject();
  });

  const openModelCommand = vscode.commands.registerCommand('datavault.openModel', async (arg: string | { filePath?: string }) => {
    // Handle both direct filePath string and TreeItemData object from context menu
    const filePath = typeof arg === 'string' ? arg : arg?.filePath;
    if (filePath) {
      log(`Opening model: ${filePath}`);
      const document = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(document);
    } else {
      vscode.window.showWarningMessage('No file path available for this item');
    }
  });

  const showLineageCommand = vscode.commands.registerCommand('datavault.showLineage', async (item: any) => {
    if (!currentMetadata || !item?.model) {
      vscode.window.showWarningMessage('No model selected');
      return;
    }
    showLineage(context, item.model);
  });

  const showModelDetailsCommand = vscode.commands.registerCommand('datavault.showModelDetails', async (item: any) => {
    if (!currentMetadata) {
      vscode.window.showWarningMessage('No dbt project loaded');
      return;
    }

    let model: DbtModel | undefined;

    if (item?.model) {
      model = item.model;
    } else if (item?.filePath) {
      model = currentMetadata.models.find(m => m.filePath === item.filePath);
    }

    if (model) {
      showModelDetails(context, model);
    } else {
      vscode.window.showWarningMessage('No model selected');
    }
  });

  const selectProjectCommand = vscode.commands.registerCommand('datavault.selectProject', async () => {
    await selectProject();
  });

  // Quick Win: Open YAML Definition
  const openYamlDefinitionCommand = vscode.commands.registerCommand('datavault.openYamlDefinition', async (item: any) => {
    const model: DbtModel | undefined = item?.model;
    if (model?._yamlPath) {
      log(`Opening YAML definition: ${model._yamlPath}`);
      const document = await vscode.workspace.openTextDocument(model._yamlPath);
      await vscode.window.showTextDocument(document);
    } else {
      vscode.window.showWarningMessage('No YAML definition found for this model');
    }
  });

  // Quick Win: Copy Model Name
  const copyModelNameCommand = vscode.commands.registerCommand('datavault.copyModelName', async (item: any) => {
    const model: DbtModel | undefined = item?.model;
    if (model?.name) {
      await vscode.env.clipboard.writeText(model.name);
      vscode.window.showInformationMessage(`Copied: ${model.name}`);
    }
  });

  // Quick Win: Copy as ref() Syntax
  const copyRefSyntaxCommand = vscode.commands.registerCommand('datavault.copyRefSyntax', async (item: any) => {
    const model: DbtModel | undefined = item?.model;
    if (model?.name) {
      const refSyntax = `{{ ref('${model.name}') }}`;
      await vscode.env.clipboard.writeText(refSyntax);
      vscode.window.showInformationMessage(`Copied: ${refSyntax}`);
    }
  });

  // Discover External Sources Command
  const discoverSourcesCommand = vscode.commands.registerCommand('datavault.discoverSources', async () => {
    await discoverExternalSources(context);
  });

  // Create single External Table Command
  const createExternalTableCommand = vscode.commands.registerCommand(
    'datavault.createExternalTable',
    async (treeItem?: TreeItemData) => {
      await createExternalTable(treeItem);
    }
  );

  // Create all External Tables for a concept/source Command
  const createAllExternalTablesCommand = vscode.commands.registerCommand(
    'datavault.createAllExternalTables',
    async (treeItem?: TreeItemData) => {
      await createAllExternalTables(treeItem);
    }
  );

  // Stage ALL External Sources Command (header button)
  const stageAllExternalSourcesCommand = vscode.commands.registerCommand(
    'datavault.stageAllExternalSources',
    async () => {
      await stageAllExternalSources();
    }
  );

  // Add disposables
  context.subscriptions.push(
    loadView,
    stagingView,
    rawVaultView,
    businessVaultView,
    martView,
    refreshCommand,
    openModelCommand,
    showLineageCommand,
    showModelDetailsCommand,
    selectProjectCommand,
    openYamlDefinitionCommand,
    copyModelNameCommand,
    copyRefSyntaxCommand,
    discoverSourcesCommand,
    createExternalTableCommand,
    createAllExternalTablesCommand,
    stageAllExternalSourcesCommand
  );

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
 * Show model details in webview
 */
function showModelDetails(context: vscode.ExtensionContext, model: DbtModel): void {
  if (!currentMetadata) {
    vscode.window.showWarningMessage('No dbt project loaded');
    return;
  }

  const panel = ModelDetailsPanel.createOrShow(context.extensionUri, model, currentMetadata, 'details');

  // Handle messages from webview
  panel['_panel'].webview.onDidReceiveMessage(
    async (message: { command: string; model?: string }) => {
      if (message.command === 'openModel' && message.model && currentMetadata) {
        const targetModel = currentMetadata.models.find(m => m.name === message.model);
        if (targetModel) {
          showModelDetails(context, targetModel);
        }
      }
    },
    undefined,
    context.subscriptions
  );
}

/**
 * Show model lineage in webview
 */
function showLineage(context: vscode.ExtensionContext, model: DbtModel): void {
  if (!currentMetadata) {
    vscode.window.showWarningMessage('No dbt project loaded');
    return;
  }

  const panel = ModelDetailsPanel.createOrShow(context.extensionUri, model, currentMetadata, 'lineage');

  // Handle messages from webview
  panel['_panel'].webview.onDidReceiveMessage(
    async (message: { command: string; model?: string }) => {
      if (message.command === 'openModel' && message.model && currentMetadata) {
        const targetModel = currentMetadata.models.find(m => m.name === message.model);
        if (targetModel) {
          showLineage(context, targetModel);
        }
      }
    },
    undefined,
    context.subscriptions
  );
}

/**
 * Discover External Sources from Azure Storage
 */
async function discoverExternalSources(context: vscode.ExtensionContext): Promise<void> {
  if (!currentProjectPath) {
    vscode.window.showWarningMessage('No dbt project loaded. Please load a project first.');
    return;
  }

  const config = vscode.workspace.getConfiguration('datavault');

  // Step 1: Get last used folder path or empty
  const lastPath = config.get<string>('lastDiscoverPath', '');
  
  // Step 2: Input folder path
  const folderPath = await vscode.window.showInputBox({
    prompt: 'Enter folder path in ADLS Storage (relative to StageFileSystem)',
    placeHolder: 'e.g., werkportal/postgres or jira/sql',
    value: lastPath,
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Folder path is required';
      }
      return null;
    }
  });

  if (!folderPath) {
    return; // User cancelled
  }

  // Save the folder path for next time
  await config.update('lastDiscoverPath', folderPath, vscode.ConfigurationTarget.Workspace);

  // Step 3: List Parquet files with progress
  let parquetFiles: Array<{ fileName: string; fullPath: string }> = [];
  
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Discovering Parquet files...',
    cancellable: false
  }, async (progress) => {
    try {
      progress.report({ message: `Scanning ${folderPath}...` });
      parquetFiles = await listParquetFiles(currentProjectPath!, folderPath, (msg) => log(msg));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to list files: ${errorMsg}`);
      log(`Discover error: ${errorMsg}`);
    }
  });

  if (parquetFiles.length === 0) {
    vscode.window.showWarningMessage(`No Parquet files found in "${folderPath}"`);
    return;
  }

  // Step 4: Multi-select files
  interface FileQuickPickItem extends vscode.QuickPickItem {
    fileName?: string;
  }

  const items: FileQuickPickItem[] = parquetFiles.map(f => ({
    label: f.fileName,
    description: folderPath,
    fileName: f.fileName
  }));

  const selectedItems = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: 'Select Parquet files to discover',
    title: `Discover Sources - ${parquetFiles.length} files found`
  });

  if (!selectedItems || selectedItems.length === 0) {
    return; // User cancelled
  }

  // Determine which files to process
  const filesToProcess = parquetFiles.filter(f => 
    selectedItems.some(item => item.fileName === f.fileName)
  );

  // Step 5: Find sources.yml
  const sourcesPath = findSourcesYaml(currentProjectPath);
  if (!sourcesPath) {
    vscode.window.showErrorMessage('Could not find sources.yml in the project');
    return;
  }

  // Step 6: Process files and handle duplicates
  const newTables: ExternalTableDefinition[] = [];
  const duplicates: Array<{ table: ExternalTableDefinition; fileName: string }> = [];
  const errors: string[] = [];

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Discovering schemas...',
    cancellable: true
  }, async (progress, token) => {
    for (let i = 0; i < filesToProcess.length; i++) {
      if (token.isCancellationRequested) {
        break;
      }

      const file = filesToProcess[i];
      progress.report({ 
        message: `Processing ${file.fileName} (${i + 1}/${filesToProcess.length})`,
        increment: 100 / filesToProcess.length
      });

      try {
        const tableDefinition = await getParquetSchema(
          currentProjectPath!, 
          folderPath, 
          file.fileName,
          (msg) => log(msg)
        );

        if (tableDefinition) {
          // Check if table already exists
          if (tableExistsInSources(sourcesPath, tableDefinition.name)) {
            duplicates.push({ table: tableDefinition, fileName: file.fileName });
          } else {
            newTables.push(tableDefinition);
          }
        } else {
          errors.push(`Failed to parse schema for ${file.fileName}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${file.fileName}: ${errorMsg}`);
        log(`Schema error for ${file.fileName}: ${errorMsg}`);
      }
    }
  });

  // Step 7: Handle duplicates - ask user
  if (duplicates.length > 0) {
    const duplicateNames = duplicates.map(d => d.table.name).join(', ');
    const action = await vscode.window.showWarningMessage(
      `${duplicates.length} table(s) already exist: ${duplicateNames}`,
      { modal: true },
      'Replace All',
      'Skip Duplicates',
      'Cancel'
    );

    if (action === 'Cancel' || !action) {
      return;
    }

    if (action === 'Replace All') {
      for (const dup of duplicates) {
        try {
          replaceTableInSourcesYaml(sourcesPath, dup.table, (msg) => log(msg));
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to replace ${dup.table.name}: ${errorMsg}`);
        }
      }
    }
    // If 'Skip Duplicates', we just don't add them
  }

  // Step 8: Add new tables to sources.yml
  if (newTables.length > 0) {
    try {
      const result = await addTablesToSourcesYaml(sourcesPath, newTables, (msg) => log(msg));
      log(`Added ${result.added.length} tables, skipped ${result.skipped.length}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to update sources.yml: ${errorMsg}`);
      return;
    }
  }

  // Step 9: Refresh the tree view
  await refreshProject();

  // Step 10: Show summary
  const totalAdded = newTables.length + (duplicates.length > 0 ? duplicates.length : 0);
  let message = `Discovered ${totalAdded} external table(s)`;
  if (errors.length > 0) {
    message += ` with ${errors.length} error(s)`;
    log(`Discovery errors: ${errors.join('; ')}`);
  }
  
  vscode.window.showInformationMessage(message);

  // Open sources.yml to show the result
  const doc = await vscode.workspace.openTextDocument(sourcesPath);
  await vscode.window.showTextDocument(doc);
}

/**
 * Create a single external table in the database
 */
async function createExternalTable(treeItem?: TreeItemData): Promise<void> {
  if (!currentProjectPath) {
    vscode.window.showWarningMessage('No dbt project loaded');
    return;
  }

  if (!treeItem?.externalTable) {
    vscode.window.showWarningMessage('No external table selected');
    return;
  }

  const tableName = treeItem.externalTable.name;
  // dbt-external-tables uses 'select: source.table' format
  const selectArg = `staging.${tableName}`;
  
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Creating external table: ${tableName}`,
    cancellable: false
  }, async (progress) => {
    try {
      progress.report({ message: 'Running dbt...' });
      
      const output = await runDbtOperation(
        currentProjectPath!,
        'stage_external_sources',
        { select: selectArg },
        (msg) => log(msg)
      );
      
      log(`Create external table output: ${output.substring(0, 500)}`);
      
      vscode.window.showInformationMessage(`External table "${tableName}" created successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Failed to create external table: ${errorMsg}`);
      vscode.window.showErrorMessage(`Failed to create external table: ${errorMsg}`);
    }
  });
}

/**
 * Create all external tables for a concept/source
 */
async function createAllExternalTables(treeItem?: TreeItemData): Promise<void> {
  if (!currentProjectPath) {
    vscode.window.showWarningMessage('No dbt project loaded');
    return;
  }

  const conceptName = treeItem?.label || 'unknown';
  const tables = treeItem?.children || [];
  const tableCount = tables.length;
  
  if (tableCount === 0) {
    vscode.window.showWarningMessage(`No external tables found for "${conceptName}"`);
    return;
  }
  
  // Confirm with user
  const confirm = await vscode.window.showInformationMessage(
    `Create ${tableCount} external table(s) for "${conceptName}"?`,
    { modal: true },
    'Create All'
  );
  
  if (confirm !== 'Create All') {
    return;
  }
  
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Creating external tables for ${conceptName}`,
    cancellable: true
  }, async (progress, token) => {
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < tables.length; i++) {
      if (token.isCancellationRequested) {
        log('Operation cancelled by user');
        break;
      }
      
      const table = tables[i];
      const tableName = table.label;
      const progressPercent = Math.round((i / tableCount) * 100);
      
      progress.report({ 
        message: `(${i + 1}/${tableCount}) ${tableName}...`,
        increment: i === 0 ? 0 : (100 / tableCount)
      });
      
      try {
        log(`Creating external table: ${tableName}`);
        // dbt-external-tables uses 'select: source.table' format
        const selectArg = `staging.${tableName}`;
        
        const output = await runDbtOperation(
          currentProjectPath!,
          'stage_external_sources',
          { select: selectArg },
          (msg) => log(msg)
        );
        
        successCount++;
        log(`Created: ${tableName}`);
      } catch (error) {
        failCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Failed to create ${tableName}: ${errorMsg}`);
      }
    }
    
    // Summary
    if (failCount === 0) {
      vscode.window.showInformationMessage(
        `Successfully created ${successCount} external table(s) for "${conceptName}"`
      );
    } else {
      vscode.window.showWarningMessage(
        `Created ${successCount}/${tableCount} tables. ${failCount} failed. Check output for details.`
      );
    }
  });
}

/**
 * Stage all external sources (creates/updates ALL external tables across all concepts)
 */
async function stageAllExternalSources(): Promise<void> {
  if (!currentProjectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }
  
  // Confirm with user - this is a big operation
  const confirm = await vscode.window.showWarningMessage(
    'Stage ALL external sources? This will create or update ALL external tables across all concepts.',
    { modal: true },
    'Yes, Stage All'
  );
  
  if (confirm !== 'Yes, Stage All') {
    return;
  }
  
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Staging all external sources',
    cancellable: false
  }, async (progress) => {
    try {
      progress.report({ message: 'Running dbt stage_external_sources... (this may take a while)' });
      
      // Run without filter to create ALL tables
      const output = await runDbtOperation(
        currentProjectPath!,
        'stage_external_sources',
        {},  // No filter = all tables
        (msg) => log(msg)
      );
      
      // Log full output for debugging (split into lines for readability)
      const lines = output.split('\n').filter(l => l.trim());
      log(`Stage all external sources completed with ${lines.length} output lines`);
      
      // Count created tables from output
      const createdCount = (output.match(/START external source/g) || []).length;
      const skipCount = (output.match(/SKIP/g) || []).length;
      const successCount = createdCount - skipCount;
      
      vscode.window.showInformationMessage(
        `External sources staged: ${successCount} created, ${skipCount} skipped (already exist)`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Failed to stage external sources: ${errorMsg}`);
      vscode.window.showErrorMessage(`Failed to stage external sources: ${errorMsg}`);
    }
  });
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
