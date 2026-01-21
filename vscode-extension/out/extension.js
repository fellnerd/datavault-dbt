"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const parser_1 = require("./parser");
const treeProviders_1 = require("./treeProviders");
const webviewPanel_1 = require("./webviewPanel");
// Global state
let stagingProvider;
let rawVaultProvider;
let businessVaultProvider;
let martProvider;
let currentMetadata = null;
let currentProjectPath = null;
let fileWatcher = null;
let refreshTimeout = null;
// Output channel for logging
let outputChannel;
function log(message) {
    const timestamp = new Date().toISOString();
    outputChannel.appendLine(`[${timestamp}] ${message}`);
    console.log(`[DataVault] ${message}`);
}
/**
 * Extension activation
 */
function activate(context) {
    // Create output channel
    outputChannel = vscode.window.createOutputChannel('Data Vault');
    context.subscriptions.push(outputChannel);
    log('Extension activating...');
    // Initialize tree providers
    stagingProvider = new treeProviders_1.StagingTreeProvider();
    rawVaultProvider = new treeProviders_1.RawVaultTreeProvider();
    businessVaultProvider = new treeProviders_1.BusinessVaultTreeProvider();
    martProvider = new treeProviders_1.MartTreeProvider();
    // Register tree views
    const stagingView = vscode.window.createTreeView('datavault-staging', {
        treeDataProvider: stagingProvider,
        showCollapseAll: true
    });
    const rawVaultView = vscode.window.createTreeView('datavault-rawvault', {
        treeDataProvider: rawVaultProvider,
        showCollapseAll: true
    });
    const businessVaultView = vscode.window.createTreeView('datavault-businessvault', {
        treeDataProvider: businessVaultProvider,
        showCollapseAll: true
    });
    const martView = vscode.window.createTreeView('datavault-mart', {
        treeDataProvider: martProvider,
        showCollapseAll: true
    });
    // Register commands
    const refreshCommand = vscode.commands.registerCommand('datavault.refresh', async () => {
        log('Refresh command triggered');
        await refreshProject();
    });
    const openModelCommand = vscode.commands.registerCommand('datavault.openModel', async (filePath) => {
        if (filePath) {
            log(`Opening model: ${filePath}`);
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        }
    });
    const showLineageCommand = vscode.commands.registerCommand('datavault.showLineage', async (item) => {
        if (!currentMetadata || !item?.model) {
            vscode.window.showWarningMessage('No model selected');
            return;
        }
        showModelDetails(context, item.model);
    });
    const showModelDetailsCommand = vscode.commands.registerCommand('datavault.showModelDetails', async (item) => {
        if (!currentMetadata) {
            vscode.window.showWarningMessage('No dbt project loaded');
            return;
        }
        let model;
        if (item?.model) {
            model = item.model;
        }
        else if (item?.filePath) {
            model = currentMetadata.models.find(m => m.filePath === item.filePath);
        }
        if (model) {
            showModelDetails(context, model);
        }
        else {
            vscode.window.showWarningMessage('No model selected');
        }
    });
    const selectProjectCommand = vscode.commands.registerCommand('datavault.selectProject', async () => {
        await selectProject();
    });
    // Add disposables
    context.subscriptions.push(stagingView, rawVaultView, businessVaultView, martView, refreshCommand, openModelCommand, showLineageCommand, showModelDetailsCommand, selectProjectCommand);
    // Auto-detect and load project with a small delay to ensure workspace is ready
    setTimeout(() => {
        autoDetectProject();
    }, 500);
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
async function autoDetectProject() {
    log('Starting auto-detect...');
    const config = vscode.workspace.getConfiguration('datavault');
    const configuredPath = config.get('projectPath');
    if (configuredPath && configuredPath.trim() !== '') {
        log(`Using configured path: ${configuredPath}`);
        currentProjectPath = configuredPath;
        await loadProject(configuredPath);
        return;
    }
    // Auto-detect
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        log('No workspace folders found');
        vscode.window.showWarningMessage('Data Vault: No workspace folder open');
        return;
    }
    log(`Found ${workspaceFolders.length} workspace folder(s)`);
    // Try to find dbt projects
    const projects = [];
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
        log('No dbt project found');
        vscode.window.showInformationMessage('No dbt project found. Use "Data Vault: Select dbt Project" to choose manually.', 'Select Project').then(selection => {
            if (selection === 'Select Project') {
                selectProject();
            }
        });
        return;
    }
    if (projects.length === 1) {
        currentProjectPath = projects[0];
        log(`Loading single project: ${projects[0]}`);
        await loadProject(projects[0]);
    }
    else {
        // Multiple projects - let user choose
        const selected = await vscode.window.showQuickPick(projects.map(p => ({
            label: path.basename(p),
            description: p,
            path: p
        })), { placeHolder: 'Select a dbt project' });
        if (selected) {
            currentProjectPath = selected.path;
            await loadProject(selected.path);
        }
    }
}
/**
 * Let user select a project manually
 */
async function selectProject() {
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
        }
        else {
            vscode.window.showErrorMessage(`No dbt_project.yml found in ${selectedPath}`);
        }
    }
}
/**
 * Load and parse a dbt project
 */
async function loadProject(projectPath) {
    log(`Loading project from: ${projectPath}`);
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Data Vault: Loading dbt project...',
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ message: 'Parsing project structure...' });
            const parser = new parser_1.DbtProjectParser(projectPath);
            currentMetadata = await parser.parse();
            log(`Parsed ${currentMetadata.models.length} models from ${currentMetadata.projectName}`);
            progress.report({ message: 'Updating views...' });
            // Update all providers
            stagingProvider.setMetadata(currentMetadata);
            rawVaultProvider.setMetadata(currentMetadata);
            businessVaultProvider.setMetadata(currentMetadata);
            martProvider.setMetadata(currentMetadata);
            // Setup file watcher
            setupFileWatcher();
            vscode.window.showInformationMessage(`Loaded ${currentMetadata.models.length} models from ${currentMetadata.projectName}`);
            log('Project loaded successfully');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(`Failed to load project: ${errorMessage}`);
            console.error('Failed to load project:', error);
            vscode.window.showErrorMessage(`Failed to load dbt project: ${errorMessage}`);
        }
    });
}
/**
 * Refresh the current project
 */
async function refreshProject() {
    if (!currentProjectPath) {
        log('No current project, running auto-detect');
        await autoDetectProject();
        return;
    }
    await loadProject(currentProjectPath);
}
/**
 * Setup file system watcher for auto-refresh
 */
function setupFileWatcher() {
    // Dispose existing watcher
    if (fileWatcher) {
        fileWatcher.dispose();
        fileWatcher = null;
    }
    const config = vscode.workspace.getConfiguration('datavault');
    const autoRefresh = config.get('autoRefresh', true);
    const debounceMs = config.get('refreshDebounceMs', 1000);
    if (!autoRefresh || !currentProjectPath) {
        return;
    }
    log('Setting up file watcher');
    // Watch for SQL file changes
    const pattern = new vscode.RelativePattern(currentProjectPath, 'models/**/*.sql');
    fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
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
    fileWatcher.onDidChange(debouncedRefresh);
    fileWatcher.onDidCreate(debouncedRefresh);
    fileWatcher.onDidDelete(debouncedRefresh);
}
/**
 * Show model details in webview
 */
function showModelDetails(context, model) {
    if (!currentMetadata) {
        vscode.window.showWarningMessage('No dbt project loaded');
        return;
    }
    const panel = webviewPanel_1.ModelDetailsPanel.createOrShow(context.extensionUri, model, currentMetadata);
    // Handle messages from webview
    panel['_panel'].webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'openModel' && message.model && currentMetadata) {
            const targetModel = currentMetadata.models.find(m => m.name === message.model);
            if (targetModel) {
                showModelDetails(context, targetModel);
            }
        }
    }, undefined, context.subscriptions);
}
/**
 * Extension deactivation
 */
function deactivate() {
    log('Extension deactivating');
    if (fileWatcher) {
        fileWatcher.dispose();
    }
    if (refreshTimeout) {
        clearTimeout(refreshTimeout);
    }
}
//# sourceMappingURL=extension.js.map