/**
 * External Table Commands
 * 
 * Commands for creating external tables in the database
 * using our custom create_external_table macro (with DROP IF EXISTS).
 */

import * as vscode from 'vscode';
import { Logger } from './index';
import { TreeItemData, ExternalTable } from '../types';
import { runDbtOperation } from '../discoverService';

/**
 * Context for external table commands
 */
export interface ExternalTableContext {
  projectPath: string | null;
  log: Logger;
  getExternalTables?: () => ExternalTable[];
}

/**
 * Create a single external table in the database
 */
export async function createExternalTable(
  treeItem: TreeItemData | undefined,
  ctx: ExternalTableContext
): Promise<void> {
  const { projectPath, log } = ctx;

  if (!projectPath) {
    vscode.window.showWarningMessage('No dbt project loaded');
    return;
  }

  if (!treeItem?.externalTable) {
    vscode.window.showWarningMessage('No external table selected');
    return;
  }

  const tableName = treeItem.externalTable.name;
  
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Creating external table: ${tableName}`,
    cancellable: false
  }, async (progress) => {
    try {
      progress.report({ message: 'Running dbt...' });
      
      // Use our custom macro that drops and recreates the table
      const output = await runDbtOperation(
        projectPath,
        'create_external_table',
        { table_name: tableName },
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
 * Create all external tables for a concept/source or group
 */
export async function createAllExternalTables(
  treeItem: TreeItemData | undefined,
  ctx: ExternalTableContext
): Promise<void> {
  const { projectPath, log } = ctx;

  if (!projectPath) {
    vscode.window.showWarningMessage('No dbt project loaded');
    return;
  }

  // Handle different tree item types
  let displayName = treeItem?.label || 'unknown';
  let tables = treeItem?.children || [];
  
  // For groups, we need to get the external table items from children
  // Groups have type 'group' or 'groupAll' and children are external_table items
  if (treeItem?.type === 'group' || treeItem?.type === 'groupAll') {
    displayName = `Group: ${treeItem.label}`;
    // Children of groups are already external table items
    tables = treeItem.children || [];
  }
  
  const tableCount = tables.length;
  
  if (tableCount === 0) {
    vscode.window.showWarningMessage(`No external tables found for "${displayName}"`);
    return;
  }
  
  // Confirm with user
  const confirm = await vscode.window.showInformationMessage(
    `Create ${tableCount} external table(s) for "${displayName}"?`,
    { modal: true },
    'Create All'
  );
  
  if (confirm !== 'Create All') {
    return;
  }
  
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Creating external tables for ${displayName}`,
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
      
      progress.report({ 
        message: `(${i + 1}/${tableCount}) ${tableName}...`,
        increment: i === 0 ? 0 : (100 / tableCount)
      });
      
      try {
        log(`Creating external table: ${tableName}`);
        
        // Use our custom macro that drops and recreates the table
        await runDbtOperation(
          projectPath,
          'create_external_table',
          { table_name: tableName },
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
        `Successfully created ${successCount} external table(s) for "${displayName}"`
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
 * Uses our custom create_external_table macro with DROP IF EXISTS for consistent behavior.
 */
export async function stageAllExternalSources(ctx: ExternalTableContext): Promise<void> {
  const { projectPath, log, getExternalTables } = ctx;

  if (!projectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }

  // Get all external tables from metadata
  const allTables = getExternalTables ? getExternalTables() : [];
  
  if (allTables.length === 0) {
    vscode.window.showWarningMessage('No external tables found in sources.yml');
    return;
  }
  
  // Confirm with user - this is a big operation
  const confirm = await vscode.window.showWarningMessage(
    `Stage ALL ${allTables.length} external sources? This will DROP and recreate ALL external tables.`,
    { modal: true },
    'Yes, Stage All'
  );
  
  if (confirm !== 'Yes, Stage All') {
    return;
  }
  
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Staging all external sources',
    cancellable: true
  }, async (progress, token) => {
    let successCount = 0;
    let failCount = 0;
    const totalCount = allTables.length;
    
    for (let i = 0; i < allTables.length; i++) {
      if (token.isCancellationRequested) {
        log('Operation cancelled by user');
        break;
      }
      
      const table = allTables[i];
      const tableName = table.name;
      
      progress.report({ 
        message: `(${i + 1}/${totalCount}) ${tableName}...`,
        increment: i === 0 ? 0 : (100 / totalCount)
      });
      
      try {
        log(`Creating external table: ${tableName}`);
        
        // Use our custom macro that drops and recreates the table
        await runDbtOperation(
          projectPath,
          'create_external_table',
          { table_name: tableName },
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
    if (token.isCancellationRequested) {
      vscode.window.showInformationMessage(
        `Operation cancelled. Created ${successCount}/${totalCount} tables before cancellation.`
      );
    } else if (failCount === 0) {
      vscode.window.showInformationMessage(
        `Successfully created all ${successCount} external table(s)`
      );
    } else {
      vscode.window.showWarningMessage(
        `Created ${successCount}/${totalCount} tables. ${failCount} failed. Check output for details.`
      );
    }
  });
}
