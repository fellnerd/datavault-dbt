import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EntityDesignerProvider } from '../webviews/entityDesigner/EntityDesignerProvider';
import { ExternalTable, DbtModel, TreeItemData } from '../types';
import { scanForExistingHubs } from '../services/hubScanner';

let designerProvider: EntityDesignerProvider | undefined;

/**
 * Register Entity Designer commands
 */
export function registerEntityDesignerCommands(
  context: vscode.ExtensionContext,
  getProjectPath: () => string | undefined
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Open Entity Designer command
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.openEntityDesigner',
      async (treeItem?: TreeItemData) => {
        const projectPath = getProjectPath();
        if (!projectPath) {
          vscode.window.showErrorMessage('No dbt project found');
          return;
        }

        // Determine if we're working with an external table or staging model
        let externalTable: ExternalTable | undefined;
        let concept: string;
        let entityName: string;

        if (treeItem?.externalTable) {
          // From Sources tree view - external table
          externalTable = treeItem.externalTable;
          concept = externalTable.concept;
          entityName = extractEntityName(externalTable.name, concept);
        } else if (treeItem?.model) {
          // From Staging tree view - staging model
          const model = treeItem.model;
          concept = model.concept;
          entityName = extractEntityName(model.name, concept);
          
          // Try to get the real external table name from the staging SQL file
          const stagingFilePath = path.join(projectPath, 'models', 'staging', `${model.name}.sql`);
          let realExtTableName = `ext_${concept}_${entityName}`; // fallback
          
          if (fs.existsSync(stagingFilePath)) {
            const sqlContent = fs.readFileSync(stagingFilePath, 'utf-8');
            // Parse: {{ source('staging', 'ext_werkportal_public_wp_contacts') }}
            const sourceMatch = sqlContent.match(/source\s*\(\s*['"]staging['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
            if (sourceMatch) {
              realExtTableName = sourceMatch[1];
            }
          }
          
          // Create a mock external table from the staging model
          externalTable = {
            name: realExtTableName,
            sourceName: 'staging',
            schema: 'stg',
            columns: model.columns,
            concept,
            _yamlPath: model._yamlPath || ''
          };
        } else {
          // Called without context - show picker
          vscode.window.showWarningMessage(
            'Please right-click on an External Table or Staging Model to open Entity Designer'
          );
          return;
        }

        // Log for debugging
        console.log('[Entity Designer] Opening for:', { 
          tableName: externalTable.name, 
          concept, 
          entityName,
          columnCount: externalTable.columns?.length || 0
        });

        // Scan for existing hubs (always refresh)
        const existingHubs = await scanForExistingHubs(projectPath);

        // Create or get the provider
        if (!designerProvider) {
          designerProvider = new EntityDesignerProvider(
            context.extensionUri,
            existingHubs
          );
        } else {
          // Update hubs list (in case new hubs were created)
          designerProvider.updateExistingHubs(existingHubs);
        }

        // Open the designer with project path
        await designerProvider.openDesigner(externalTable, concept, entityName, projectPath);
      }
    )
  );

  return disposables;
}

/**
 * Extract entity name from table/model name
 * e.g., 'ext_werkportal_public_wp_contacts' -> 'contacts'
 * e.g., 'werkportal_contacts' -> 'contacts'
 */
function extractEntityName(name: string, concept: string): string {
  // Remove common prefixes
  let entityName = name
    .replace(/^ext_/, '')
    .replace(/^stg_/, '')
    .replace(new RegExp(`^${concept}_`), '')
    .replace(/_public_wp_/, '_')  // werkportal specific
    .replace(/_public_/, '_');
  
  // If still has concept prefix, remove it
  if (entityName.startsWith(`${concept}_`)) {
    entityName = entityName.substring(concept.length + 1);
  }
  
  return entityName;
}
