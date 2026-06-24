import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EntityDesignerV2Provider } from '../webviews/entityDesignerV2/EntityDesignerV2Provider';
import { TreeItemData } from '../types';

// SQL Server reserved keywords commonly found in Abacus data
const RESERVED_KEYWORDS = new Set([
  'PLAN', 'LEVEL', 'KEY', 'STATUS', 'TYPE', 'ORDER', 'GROUP', 'INDEX',
  'BEFORE', 'AFTER', 'FUNCTION', 'VALUE', 'TABLE', 'VIEW', 'USER',
  'ROLE', 'CHECK', 'DEFAULT', 'PRIMARY', 'FOREIGN', 'REFERENCES', 'RETURN',
  'START', 'END', 'OPEN', 'CLOSE', 'CURRENT', 'PERCENT', 'NATIONAL',
  'IDENTITY', 'ESCAPE', 'SCHEMA', 'COLUMN', 'CASE', 'PUBLIC',
]);

interface SourceTable {
  name: string;
  columns: Array<{ name: string; data_type?: string; description?: string }>;
}

/**
 * Load external tables from sources.yml
 */
function loadExternalTablesFromSources(projectPath: string): SourceTable[] {
  const sourcesPath = path.join(projectPath, 'models', 'staging', 'sources.yml');
  if (!fs.existsSync(sourcesPath)) return [];

  try {
    const content = fs.readFileSync(sourcesPath, 'utf-8');
    const tables: SourceTable[] = [];
    let currentTable: SourceTable | null = null;
    let inColumns = false;

    for (const line of content.split('\n')) {
      // Match table name: - "name": "ext_..." or - name: ext_...
      const tableMatch = line.match(/^\s+-\s+"?name"?:\s+"?(ext_\w+)"?\s*$/);
      if (tableMatch) {
        if (currentTable) tables.push(currentTable);
        currentTable = { name: tableMatch[1], columns: [] };
        inColumns = false;
        continue;
      }
      // Match columns: key (quoted or not)
      if (currentTable && line.match(/^\s+"?columns"?:\s*$/)) {
        inColumns = true;
        continue;
      }
      if (inColumns && currentTable) {
        const colMatch = line.match(/^\s+-\s+"?name"?:\s+"?(\w[\w-]*)"?\s*$/);
        if (colMatch) {
          currentTable.columns.push({ name: colMatch[1] });
          continue;
        }
        const dtMatch = line.match(/^\s+"?data_type"?:\s+"?(.+?)"?\s*$/);
        if (dtMatch && currentTable.columns.length > 0) {
          currentTable.columns[currentTable.columns.length - 1].data_type = dtMatch[1];
          continue;
        }
        const descMatch = line.match(/^\s+"?description"?:\s+"?(.+?)"?\s*$/);
        if (descMatch && currentTable.columns.length > 0) {
          currentTable.columns[currentTable.columns.length - 1].description = descMatch[1];
          continue;
        }
        // New table section or non-column content → stop column parsing
        if (line.match(/^\s+-\s+"?name"?:/) && !line.match(/ext_/)) {
          inColumns = false;
        }
      }
    }
    if (currentTable) tables.push(currentTable);
    return tables;
  } catch (err) {
    console.error('[EntityDesignerV2] Error loading sources.yml:', err);
    return [];
  }
}

/**
 * Register Entity Designer v2 commands.
 * These run alongside v1 commands during the migration period.
 */
export function registerEntityDesignerV2Commands(
  context: vscode.ExtensionContext,
  getProjectPath: () => string | undefined
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Open Entity Designer v2 from tree view or command palette
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.openEntityDesignerV2',
      async (treeItem?: TreeItemData) => {
        const projectPath = getProjectPath();
        if (!projectPath) {
          vscode.window.showErrorMessage('No dbt project found');
          return;
        }

        let concept = '_common';
        let entityName = '';
        let sourceTable = '';
        let sourceColumns: Record<string, { dataType: string; description?: string }> = {};

        if (treeItem?.externalTable) {
          // From tree view right-click (same as v1)
          const ext = treeItem.externalTable;
          concept = ext.concept;
          entityName = ext.name.replace(/^ext_/, '');
          sourceTable = ext.name;

          // Load column info from sources.yml
          const allTables = loadExternalTablesFromSources(projectPath);
          const match = allTables.find(t => t.name === sourceTable);
          if (match) {
            for (const col of match.columns) {
              sourceColumns[col.name] = {
                dataType: col.data_type || 'NVARCHAR(4000)',
                description: col.description,
              };
            }
          }
        } else {
          // Command palette: show QuickPick with available external tables
          const allTables = loadExternalTablesFromSources(projectPath);
          if (allTables.length === 0) {
            vscode.window.showWarningMessage(
              'No external tables found in models/staging/sources.yml'
            );
            return;
          }

          const items = allTables.map(t => ({
            label: t.name,
            description: `${t.columns.length} columns`,
            detail: t.name.replace(/^ext_/, ''),
            table: t,
          }));

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select an external table to design',
            matchOnDescription: true,
            matchOnDetail: true,
          });
          if (!selected) return;

          sourceTable = selected.table.name;
          entityName = sourceTable.replace(/^ext_/, '');

          // Detect concept
          if (sourceTable.includes('ewb_')) concept = '_common';
          else if (sourceTable.includes('jira_')) concept = 'jira';
          else if (sourceTable.includes('adworks_')) concept = 'adworks';

          // Map columns
          for (const col of selected.table.columns) {
            sourceColumns[col.name] = {
              dataType: col.data_type || 'NVARCHAR(4000)',
              description: col.description,
            };
          }
        }

        // Detect reserved keywords in columns
        const reservedKeywords = Object.keys(sourceColumns)
          .filter(col => RESERVED_KEYWORDS.has(col.toUpperCase()));

        await EntityDesignerV2Provider.createOrShow(
          context.extensionUri,
          projectPath,
          concept,
          entityName,
          sourceTable,
          sourceColumns,
          reservedKeywords
        );
      }
    )
  );

  return disposables;
}
