/**
 * External Table Commands
 * 
 * Commands for creating external tables in the database
 * using dbt run-operation stage_external_sources.
 */

import * as vscode from 'vscode';
import { Logger } from './index';
import { TreeItemData } from '../types';
import { runDbtOperation } from '../discoverService';

/**
 * Context for external table commands
 */
export interface ExternalTableContext {
  projectPath: string | null;
  log: Logger;
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
        projectPath,
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
export async function createAllExternalTables(
  treeItem: TreeItemData | undefined,
  ctx: ExternalTableContext
): Promise<void> {
  const { projectPath, log } = ctx;

  if (!projectPath) {
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
      
      progress.report({ 
        message: `(${i + 1}/${tableCount}) ${tableName}...`,
        increment: i === 0 ? 0 : (100 / tableCount)
      });
      
      try {
        log(`Creating external table: ${tableName}`);
        // dbt-external-tables uses 'select: source.table' format
        const selectArg = `staging.${tableName}`;
        
        await runDbtOperation(
          projectPath,
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
export async function stageAllExternalSources(ctx: ExternalTableContext): Promise<void> {
  const { projectPath, log } = ctx;

  if (!projectPath) {
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
        projectPath,
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
