/**
 * Source Table Commands
 * 
 * Commands for manipulating External Tables in sources.yml:
 * - Rename: Change table name
 * - Copy: Duplicate table with column selection
 * - Disable Columns: Hide columns from the table definition
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { Logger } from './index';
import { TreeItemData, ExternalTable } from '../types';
import { findSourcesYaml } from '../discoverService';

/**
 * Context for source table commands
 */
export interface SourceTableContext {
  projectPath: string | null;
  refreshProject: () => Promise<void>;
  log: Logger;
}

/**
 * Column item for QuickPick
 */
interface ColumnQuickPickItem extends vscode.QuickPickItem {
  columnName: string;
}

// ============================================================================
// YAML Manipulation Helpers
// ============================================================================

/**
 * Read and parse sources.yml
 */
function readSourcesYaml(sourcesPath: string): any {
  const content = fs.readFileSync(sourcesPath, 'utf8');
  return yaml.parse(content);
}

/**
 * Write sources.yml with proper formatting
 */
function writeSourcesYaml(sourcesPath: string, data: any): void {
  const content = yaml.stringify(data, {
    indent: 2,
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  fs.writeFileSync(sourcesPath, content, 'utf8');
}

/**
 * Find table in sources.yml by name
 */
function findTableInSources(parsed: any, tableName: string): { table: any; index: number } | null {
  if (!parsed?.sources?.[0]?.tables) {
    return null;
  }
  
  const tables = parsed.sources[0].tables as any[];
  const index = tables.findIndex(t => t.name === tableName);
  
  if (index === -1) {
    return null;
  }
  
  return { table: tables[index], index };
}

// ============================================================================
// RENAME EXTERNAL TABLE
// ============================================================================

/**
 * Rename an External Table (ext_ prefix is fixed)
 */
export async function renameExternalTable(
  treeItem: TreeItemData | undefined,
  ctx: SourceTableContext
): Promise<void> {
  const { projectPath, refreshProject, log } = ctx;

  if (!projectPath) {
    vscode.window.showWarningMessage('No dbt project loaded');
    return;
  }

  if (!treeItem?.externalTable) {
    vscode.window.showWarningMessage('No external table selected');
    return;
  }

  const table = treeItem.externalTable;
  const oldName = table.name;
  
  // Extract name without ext_ prefix
  const oldNameWithoutPrefix = oldName.startsWith('ext_') ? oldName.substring(4) : oldName;

  // Prompt for new name (without ext_ prefix)
  const newNameWithoutPrefix = await vscode.window.showInputBox({
    prompt: 'Enter new table name (ext_ prefix is automatic)',
    value: oldNameWithoutPrefix,
    title: 'Rename External Table',
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Table name is required';
      }
      if (!/^[a-z0-9_]+$/.test(value)) {
        return 'Table name should only contain lowercase letters, numbers, and underscores';
      }
      if (value === oldNameWithoutPrefix) {
        return 'New name must be different from current name';
      }
      return null;
    }
  });

  if (!newNameWithoutPrefix) {
    return; // User cancelled
  }

  // Add ext_ prefix back
  const newName = `ext_${newNameWithoutPrefix}`;

  // Find sources.yml and update
  const sourcesPath = findSourcesYaml(projectPath);
  if (!sourcesPath) {
    vscode.window.showErrorMessage('Could not find sources.yml');
    return;
  }

  try {
    const parsed = readSourcesYaml(sourcesPath);
    const found = findTableInSources(parsed, oldName);
    
    if (!found) {
      vscode.window.showErrorMessage(`Table "${oldName}" not found in sources.yml`);
      return;
    }

    // Check if new name already exists
    const existing = findTableInSources(parsed, newName);
    if (existing) {
      vscode.window.showErrorMessage(`Table "${newName}" already exists in sources.yml`);
      return;
    }

    // Update name
    found.table.name = newName;
    
    // Update description if it contains the old name
    if (found.table.description?.includes(oldName)) {
      found.table.description = found.table.description.replace(oldName, newName);
    }

    writeSourcesYaml(sourcesPath, parsed);
    log(`Renamed table: ${oldName} → ${newName}`);

    await refreshProject();
    vscode.window.showInformationMessage(`Table renamed: ${oldName} → ${newName}`);

    // Open sources.yml
    const doc = await vscode.workspace.openTextDocument(sourcesPath);
    await vscode.window.showTextDocument(doc);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to rename table: ${errorMsg}`);
    log(`Rename error: ${errorMsg}`);
  }
}

// ============================================================================
// COPY EXTERNAL TABLE
// ============================================================================

/**
 * Copy an External Table with column selection
 */
export async function copyExternalTable(
  treeItem: TreeItemData | undefined,
  ctx: SourceTableContext
): Promise<void> {
  const { projectPath, refreshProject, log } = ctx;

  if (!projectPath) {
    vscode.window.showWarningMessage('No dbt project loaded');
    return;
  }

  if (!treeItem?.externalTable) {
    vscode.window.showWarningMessage('No external table selected');
    return;
  }

  const table = treeItem.externalTable;
  const sourceName = table.name;

  // Step 1: Prompt for new name
  const newName = await vscode.window.showInputBox({
    prompt: 'Enter name for the copied table',
    value: `${sourceName}_copy`,
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

  if (!newName) {
    return; // User cancelled
  }

  // Step 2: Select columns
  const columns = table.columns || [];
  if (columns.length === 0) {
    vscode.window.showWarningMessage('Table has no columns to copy');
    return;
  }

  const columnItems: ColumnQuickPickItem[] = columns.map(col => ({
    label: col.name,
    description: col.dataType || 'unknown',
    picked: true, // All selected by default
    columnName: col.name
  }));

  const selectedColumns = await vscode.window.showQuickPick(columnItems, {
    canPickMany: true,
    placeHolder: 'Select columns to include in the copy',
    title: `Copy ${sourceName} - Select Columns`
  });

  if (!selectedColumns || selectedColumns.length === 0) {
    return; // User cancelled or selected nothing
  }

  // Find sources.yml and add copy
  const sourcesPath = findSourcesYaml(projectPath);
  if (!sourcesPath) {
    vscode.window.showErrorMessage('Could not find sources.yml');
    return;
  }

  try {
    const parsed = readSourcesYaml(sourcesPath);
    
    // Check if new name already exists
    const existing = findTableInSources(parsed, newName);
    if (existing) {
      vscode.window.showErrorMessage(`Table "${newName}" already exists in sources.yml`);
      return;
    }

    const found = findTableInSources(parsed, sourceName);
    if (!found) {
      vscode.window.showErrorMessage(`Source table "${sourceName}" not found in sources.yml`);
      return;
    }

    // Create copy with selected columns
    const selectedColumnNames = new Set(selectedColumns.map(c => c.columnName));
    const newTable = {
      ...JSON.parse(JSON.stringify(found.table)), // Deep clone
      name: newName,
      description: `Copy of ${sourceName}`,
      columns: found.table.columns.filter((col: any) => selectedColumnNames.has(col.name))
    };

    // Add to tables array
    parsed.sources[0].tables.push(newTable);

    writeSourcesYaml(sourcesPath, parsed);
    log(`Copied table: ${sourceName} → ${newName} (${selectedColumns.length} columns)`);

    await refreshProject();
    vscode.window.showInformationMessage(
      `Table copied: ${sourceName} → ${newName} (${selectedColumns.length} columns)`
    );

    // Open sources.yml
    const doc = await vscode.workspace.openTextDocument(sourcesPath);
    await vscode.window.showTextDocument(doc);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to copy table: ${errorMsg}`);
    log(`Copy error: ${errorMsg}`);
  }
}

// ============================================================================
// DISABLE COLUMNS
// ============================================================================

/**
 * Disable (remove) columns from an External Table
 */
export async function disableColumns(
  treeItem: TreeItemData | undefined,
  ctx: SourceTableContext
): Promise<void> {
  const { projectPath, refreshProject, log } = ctx;

  if (!projectPath) {
    vscode.window.showWarningMessage('No dbt project loaded');
    return;
  }

  if (!treeItem?.externalTable) {
    vscode.window.showWarningMessage('No external table selected');
    return;
  }

  const table = treeItem.externalTable;
  const tableName = table.name;
  const columns = table.columns || [];

  if (columns.length === 0) {
    vscode.window.showWarningMessage('Table has no columns');
    return;
  }

  // Show columns with current state (all enabled)
  const columnItems: ColumnQuickPickItem[] = columns.map(col => ({
    label: col.name,
    description: col.dataType || 'unknown',
    picked: false, // None selected = none disabled
    columnName: col.name
  }));

  const columnsToDisable = await vscode.window.showQuickPick(columnItems, {
    canPickMany: true,
    placeHolder: 'Select columns to DISABLE (remove from table definition)',
    title: `${tableName} - Select Columns to Disable`
  });

  if (!columnsToDisable || columnsToDisable.length === 0) {
    vscode.window.showInformationMessage('No columns disabled');
    return;
  }

  // Check if all columns would be disabled
  if (columnsToDisable.length === columns.length) {
    vscode.window.showErrorMessage('Cannot disable all columns. At least one column must remain.');
    return;
  }

  // Confirm
  const confirm = await vscode.window.showWarningMessage(
    `Disable ${columnsToDisable.length} column(s) from ${tableName}?`,
    { modal: true },
    'Disable'
  );

  if (confirm !== 'Disable') {
    return;
  }

  // Find sources.yml and update
  const sourcesPath = findSourcesYaml(projectPath);
  if (!sourcesPath) {
    vscode.window.showErrorMessage('Could not find sources.yml');
    return;
  }

  try {
    const parsed = readSourcesYaml(sourcesPath);
    const found = findTableInSources(parsed, tableName);
    
    if (!found) {
      vscode.window.showErrorMessage(`Table "${tableName}" not found in sources.yml`);
      return;
    }

    // Remove disabled columns
    const disabledNames = new Set(columnsToDisable.map(c => c.columnName));
    found.table.columns = found.table.columns.filter(
      (col: any) => !disabledNames.has(col.name)
    );

    writeSourcesYaml(sourcesPath, parsed);
    log(`Disabled ${columnsToDisable.length} columns from ${tableName}: ${[...disabledNames].join(', ')}`);

    await refreshProject();
    vscode.window.showInformationMessage(
      `Disabled ${columnsToDisable.length} column(s) from ${tableName}`
    );

    // Open sources.yml
    const doc = await vscode.workspace.openTextDocument(sourcesPath);
    await vscode.window.showTextDocument(doc);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to disable columns: ${errorMsg}`);
    log(`Disable columns error: ${errorMsg}`);
  }
}

// ============================================================================
// DELETE EXTERNAL TABLE
// ============================================================================

/**
 * Delete an External Table from sources.yml
 */
export async function deleteExternalTable(
  treeItem: TreeItemData | undefined,
  ctx: SourceTableContext
): Promise<void> {
  const { projectPath, refreshProject, log } = ctx;

  if (!projectPath) {
    vscode.window.showWarningMessage('No dbt project loaded');
    return;
  }

  if (!treeItem?.externalTable) {
    vscode.window.showWarningMessage('No external table selected');
    return;
  }

  const table = treeItem.externalTable;
  const tableName = table.name;

  // Confirm deletion
  const confirm = await vscode.window.showWarningMessage(
    `Delete external table "${tableName}" from sources.yml?`,
    { modal: true, detail: 'This will remove the table definition. The Parquet file will not be affected.' },
    'Delete'
  );

  if (confirm !== 'Delete') {
    return;
  }

  // Find sources.yml and delete
  const sourcesPath = findSourcesYaml(projectPath);
  if (!sourcesPath) {
    vscode.window.showErrorMessage('Could not find sources.yml');
    return;
  }

  try {
    const parsed = readSourcesYaml(sourcesPath);
    const found = findTableInSources(parsed, tableName);
    
    if (!found) {
      vscode.window.showErrorMessage(`Table "${tableName}" not found in sources.yml`);
      return;
    }

    // Remove table from array
    parsed.sources[0].tables.splice(found.index, 1);

    writeSourcesYaml(sourcesPath, parsed);
    log(`Deleted table: ${tableName}`);

    await refreshProject();
    vscode.window.showInformationMessage(`Table "${tableName}" deleted from sources.yml`);

    // Open sources.yml
    const doc = await vscode.workspace.openTextDocument(sourcesPath);
    await vscode.window.showTextDocument(doc);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to delete table: ${errorMsg}`);
    log(`Delete error: ${errorMsg}`);
  }
}
