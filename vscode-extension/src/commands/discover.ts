/**
 * Discover External Sources Command
 * 
 * Provides functionality to discover Parquet files from Azure Storage
 * and add them as External Tables to sources.yml via a multi-step wizard.
 */

import * as vscode from 'vscode';
import { Logger } from './index';
import {
  listParquetFiles,
  getParquetSchema,
  findSourcesYaml,
  tableExistsInSources,
  addTablesToSourcesYaml,
  replaceTableInSourcesYaml,
  ExternalTableDefinition
} from '../discoverService';

/**
 * Context for discover command
 */
export interface DiscoverContext {
  projectPath: string | null;
  refreshProject: () => Promise<void>;
  log: Logger;
}

/**
 * QuickPick item for file selection
 */
interface FileQuickPickItem extends vscode.QuickPickItem {
  fileName?: string;
  isWildcard?: boolean;
}

/**
 * Discover External Sources from Azure Storage
 * 
 * Multi-step wizard:
 * 1. Input folder path in ADLS Storage
 * 2. List and select Parquet files
 * 3. Parse schemas and add to sources.yml
 * 4. Handle duplicates
 */
export async function discoverExternalSources(ctx: DiscoverContext): Promise<void> {
  const { projectPath, refreshProject, log } = ctx;

  if (!projectPath) {
    vscode.window.showWarningMessage('No dbt project loaded. Please load a project first.');
    return;
  }

  const config = vscode.workspace.getConfiguration('datavault');

  // Step 1: Get last used folder path or empty
  const lastPath = config.get<string>('lastDiscoverPath', '');
  
  // Step 2: Input folder path
  const folderPath = await vscode.window.showInputBox({
    prompt: 'Enter folder path in ADLS Storage (relative to StageFileSystem)',
    placeHolder: 'e.g., jira/postgres or jira/sql',
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
      parquetFiles = await listParquetFiles(projectPath, folderPath, (msg) => log(msg));
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

  // Step 4: Multi-select files (with wildcard option at top)
  const wildcardOption: FileQuickPickItem = {
    label: '$(folder) Use entire folder (wildcard)',
    description: `Read ALL ${parquetFiles.length} files at query time`,
    detail: 'Creates a single External Table that reads all Parquet files in this folder',
    isWildcard: true
  };

  const fileItems: FileQuickPickItem[] = parquetFiles.map(f => ({
    label: f.fileName,
    description: folderPath,
    fileName: f.fileName
  }));

  // Add wildcard option at the top
  const items: FileQuickPickItem[] = [wildcardOption, ...fileItems];

  const selectedItems = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: 'Select files OR choose "Use entire folder" for wildcard',
    title: `Discover Sources - ${parquetFiles.length} files found`
  });

  if (!selectedItems || selectedItems.length === 0) {
    return; // User cancelled
  }

  // Check if wildcard option was selected
  const useWildcard = selectedItems.some(item => item.isWildcard);

  // Step 5: Find sources.yml
  const sourcesPath = findSourcesYaml(projectPath);
  if (!sourcesPath) {
    vscode.window.showErrorMessage('Could not find sources.yml in the project');
    return;
  }

  // =========================================================================
  // WILDCARD PATH: Create single table for entire folder
  // =========================================================================
  if (useWildcard) {
    await processWildcardFolder(projectPath, folderPath, parquetFiles, sourcesPath, refreshProject, log);
    return;
  }

  // =========================================================================
  // NORMAL PATH: Create individual tables for selected files
  // =========================================================================

  // Determine which files to process
  const filesToProcess = parquetFiles.filter(f => 
    selectedItems.some(item => item.fileName === f.fileName)
  );

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
          projectPath, 
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
 * Process wildcard folder - creates a single External Table that reads all files
 */
async function processWildcardFolder(
  projectPath: string,
  folderPath: string,
  parquetFiles: Array<{ fileName: string; fullPath: string }>,
  sourcesPath: string,
  refreshProject: () => Promise<void>,
  log: (msg: string) => void
): Promise<void> {
  // Suggest table name based on folder path
  const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '');
  const suggestedName = 'ext_' + normalizedPath
    .replace(/\//g, '_')
    .replace(/-/g, '_')
    .toLowerCase();

  const tableName = await vscode.window.showInputBox({
    prompt: `Create wildcard table for ${parquetFiles.length} files. Enter table name:`,
    placeHolder: 'e.g., ext_jira_api_invoice_delta',
    value: suggestedName,
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Table name is required';
      }
      if (!value.startsWith('ext_')) {
        return 'External table names should start with "ext_"';
      }
      if (!/^[a-z0-9_]+$/.test(value)) {
        return 'Table name should only contain lowercase letters, numbers, and underscores';
      }
      return null;
    }
  });

  if (!tableName) {
    return; // User cancelled
  }

  // Parse schema from first file as template
  let tableDefinition: ExternalTableDefinition | null = null;
  
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Parsing schema from sample file...',
    cancellable: false
  }, async (progress) => {
    try {
      const sampleFile = parquetFiles[0];
      progress.report({ message: `Reading schema from ${sampleFile.fileName}...` });
      
      tableDefinition = await getParquetSchema(
        projectPath, 
        folderPath, 
        sampleFile.fileName,
        (msg) => log(msg)
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to parse schema: ${errorMsg}`);
      log(`Schema parse error: ${errorMsg}`);
    }
  });

  if (!tableDefinition) {
    vscode.window.showErrorMessage('Failed to parse schema from sample file');
    return;
  }

  // Modify table definition for folder-based access
  // TypeScript needs explicit typing after null check
  const baseTable = tableDefinition as ExternalTableDefinition;
  const folderTableDefinition: ExternalTableDefinition = {
    name: tableName,
    description: `Wildcard External Table - reads ALL Parquet files from ${normalizedPath}/`,
    external: {
      file_format: baseTable.external.file_format,
      data_source: baseTable.external.data_source,
      // CRITICAL: Location is the FOLDER path (trailing slash)
      // Azure SQL will read all Parquet files in this folder automatically
      location: `${normalizedPath}/`
    },
    columns: baseTable.columns
  };

  log(`Created wildcard table definition with location: ${folderTableDefinition.external.location}`);

  // Check for duplicates and handle
  const tableExists = tableExistsInSources(sourcesPath, tableName);
  
  if (tableExists) {
    const action = await vscode.window.showWarningMessage(
      `Table "${tableName}" already exists in sources.yml`,
      { modal: true },
      'Replace',
      'Cancel'
    );

    if (action === 'Cancel' || !action) {
      return;
    }

    try {
      replaceTableInSourcesYaml(sourcesPath, folderTableDefinition, (msg) => log(msg));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to replace table: ${errorMsg}`);
      return;
    }
  } else {
    try {
      await addTablesToSourcesYaml(sourcesPath, [folderTableDefinition], (msg) => log(msg));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to add table: ${errorMsg}`);
      return;
    }
  }

  // Refresh and show result (same as normal discover)
  await refreshProject();

  vscode.window.showInformationMessage(
    `Wildcard External Table "${tableName}" added to sources.yml`
  );

  const doc = await vscode.workspace.openTextDocument(sourcesPath);
  await vscode.window.showTextDocument(doc);
}
