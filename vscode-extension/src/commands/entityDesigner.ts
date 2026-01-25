import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { EntityDesignerProvider } from '../webviews/entityDesigner/EntityDesignerProvider';
import { ExternalTable, DbtModel, TreeItemData, ColumnInfo } from '../types';
import { scanForExistingHubs } from '../services/hubScanner';

let designerProvider: EntityDesignerProvider | undefined;

/**
 * Load dataType mapping from sources.yml
 * Returns a Map of columnName (lowercase) -> dataType
 */
function loadDataTypesFromSourcesYaml(projectPath: string, tableName: string): Map<string, string> {
  const dataTypeMap = new Map<string, string>();
  const sourcesYmlPath = path.join(projectPath, 'models', 'staging', 'sources.yml');
  
  if (!fs.existsSync(sourcesYmlPath)) {
    console.log('[Entity Designer] sources.yml not found');
    return dataTypeMap;
  }
  
  try {
    const content = fs.readFileSync(sourcesYmlPath, 'utf-8');
    const parsed = yaml.parse(content);
    
    if (!parsed?.sources?.[0]?.tables) {
      return dataTypeMap;
    }
    
    const table = parsed.sources[0].tables.find((t: { name: string }) => t.name === tableName);
    if (!table?.columns) {
      console.log(`[Entity Designer] Table ${tableName} not found in sources.yml`);
      return dataTypeMap;
    }
    
    // Build dataType map (case-insensitive lookup)
    for (const col of table.columns) {
      if (col.name && col.data_type) {
        dataTypeMap.set(col.name.toLowerCase(), col.data_type);
      }
    }
    
    console.log(`[Entity Designer] Loaded ${dataTypeMap.size} dataTypes from sources.yml`);
  } catch (error) {
    console.error('[Entity Designer] Error parsing sources.yml:', error);
  }
  
  return dataTypeMap;
}

/**
 * Enrich columns with dataTypes from sources.yml
 */
function enrichColumnsWithDataTypes(columns: ColumnInfo[], dataTypeMap: Map<string, string>): ColumnInfo[] {
  return columns.map(col => ({
    ...col,
    dataType: dataTypeMap.get(col.name.toLowerCase()) || col.dataType || 'NVARCHAR(MAX)'
  }));
}

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
          
          // Enrich existing columns with dataTypes from sources.yml
          const dataTypeMap = loadDataTypesFromSourcesYaml(projectPath, externalTable.name);
          if (dataTypeMap.size > 0) {
            externalTable = { 
              ...externalTable, 
              columns: enrichColumnsWithDataTypes(externalTable.columns, dataTypeMap) 
            };
          }
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
          
          // Load dataTypes from sources.yml and enrich model.columns
          const dataTypeMap = loadDataTypesFromSourcesYaml(projectPath, realExtTableName);
          const enrichedColumns = enrichColumnsWithDataTypes(model.columns, dataTypeMap);
          
          // Create external table with model columns enriched with dataTypes
          externalTable = {
            name: realExtTableName,
            sourceName: 'staging',
            schema: 'stg',
            columns: enrichedColumns,
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
          columnCount: externalTable.columns?.length || 0,
          firstColDataType: externalTable.columns?.[0]?.dataType || 'undefined'
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
