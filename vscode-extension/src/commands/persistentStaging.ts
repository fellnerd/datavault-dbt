/**
 * Persistent Staging Area (PSA) Commands
 * 
 * Commands for creating PSA tables - persisted incremental tables that cache
 * external table data to avoid repeated OPENROWSET/PolyBase calls during staging.
 * 
 * Flow:
 *   ext_<concept>_<name> (External Table)
 *     → psa_<concept>_<name> (PSA - incremental table)
 *       → <concept>_<name> (Staging View with hashes)
 * 
 * Strategies:
 * - merge: Uses unique key for upsert (update existing, insert new)
 * - append: Insert-only (for full load scenarios)
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TreeItemData, ExternalTable } from '../types';

type Logger = (message: string) => void;

interface PsaCommandContext {
  projectPath: string | null;
  refreshProject: () => Promise<void>;
  log: Logger;
}

type IncrementalStrategy = 'merge' | 'append';

interface PsaConfig {
  name: string;                 // e.g., 'psa_jira_customers'
  concept: string;              // e.g., 'jira'
  entityName: string;           // e.g., 'customers'
  externalTableName: string;    // e.g., 'ext_jira_customers'
  strategy: IncrementalStrategy;
  uniqueKeyColumns: string[];   // For merge strategy
  incrementalColumn: string;    // Column for WHERE filter in incremental
  columns: string[];            // All columns to include
}

/**
 * Create a PSA table from an external table
 * Context menu on external_table items
 */
export async function createPersistentStaging(
  treeItem: TreeItemData | undefined,
  context: PsaCommandContext
): Promise<void> {
  const { projectPath, refreshProject, log } = context;

  if (!projectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }

  // Get external table from tree item
  const externalTable = treeItem?.externalTable;
  if (!externalTable) {
    vscode.window.showErrorMessage('Please select an external table');
    return;
  }

  log(`Creating PSA table for: ${externalTable.name}`);

  // Parse external table name: ext_<concept>_<entity> → concept, entity
  const parsed = parseExternalTableName(externalTable.name);
  if (!parsed) {
    vscode.window.showErrorMessage(`Could not parse external table name: ${externalTable.name}`);
    return;
  }

  // Step 1: Confirm entity name
  const entityName = await vscode.window.showInputBox({
    title: 'PSA Entity Name',
    prompt: 'Enter the entity name for the PSA table',
    value: parsed.entityName,
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Entity name is required';
      }
      if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
        return 'Use snake_case (letters, numbers, underscores)';
      }
      return null;
    }
  });

  if (!entityName) {
    return; // Cancelled
  }

  // Step 2: Select incremental strategy
  const strategyChoice = await vscode.window.showQuickPick(
    [
      {
        label: '$(merge) Merge (Upsert)',
        description: 'Update existing rows, insert new rows',
        detail: 'Best for incremental loads with a unique key. Requires selecting unique key column(s).',
        value: 'merge' as IncrementalStrategy
      },
      {
        label: '$(add) Append (Insert Only)',
        description: 'Insert all rows without checking for duplicates',
        detail: 'Best for full load scenarios or when source has no stable unique key.',
        value: 'append' as IncrementalStrategy
      }
    ],
    {
      title: 'Select Incremental Strategy',
      placeHolder: 'How should data be loaded incrementally?'
    }
  );

  if (!strategyChoice) {
    return; // Cancelled
  }

  const strategy = strategyChoice.value;
  let uniqueKeyColumns: string[] = [];

  // Step 3: For merge strategy, select unique key columns
  if (strategy === 'merge') {
    const columns = externalTable.columns.filter(c => !c.name.toLowerCase().startsWith('dss_'));
    const columnItems = columns.map(col => ({
      label: col.name,
      description: col.dataType,
      picked: col.name.toLowerCase().endsWith('_id') || col.name.toLowerCase().endsWith('_key')
    }));

    const selectedUniqueKeys = await vscode.window.showQuickPick(columnItems, {
      title: 'Select Unique Key Column(s)',
      placeHolder: 'Select column(s) that uniquely identify each row for merge',
      canPickMany: true
    });

    if (!selectedUniqueKeys || selectedUniqueKeys.length === 0) {
      vscode.window.showWarningMessage('Merge strategy requires at least one unique key column');
      return;
    }

    uniqueKeyColumns = selectedUniqueKeys.map(c => c.label);
  }

  // Step 4: Select incremental filter column
  const allColumns = externalTable.columns;
  const filterColumnItems = allColumns.map(col => ({
    label: col.name,
    description: col.dataType,
    picked: col.name.toLowerCase() === 'dss_load_date'
  }));

  const selectedFilterColumn = await vscode.window.showQuickPick(filterColumnItems, {
    title: 'Select Incremental Filter Column',
    placeHolder: 'Select the column to filter for new/changed data (e.g., dss_load_date, UPDATED)',
    canPickMany: false
  });

  if (!selectedFilterColumn) {
    return; // Cancelled
  }

  const incrementalColumn = selectedFilterColumn.label;

  // Prepare PSA config
  const psaName = `psa_${parsed.concept}_${entityName}`;
  const config: PsaConfig = {
    name: psaName,
    concept: parsed.concept,
    entityName,
    externalTableName: externalTable.name,
    strategy,
    uniqueKeyColumns,
    incrementalColumn,
    columns: externalTable.columns.map(c => c.name)
  };

  // Check if PSA model already exists
  const psaDir = path.join(projectPath, 'models', 'staging');
  const psaFilePath = path.join(psaDir, `${psaName}.sql`);

  if (fs.existsSync(psaFilePath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `${psaName}.sql already exists. Overwrite?`,
      'Yes', 'No'
    );
    if (overwrite !== 'Yes') {
      return;
    }
  }

  // Generate and write PSA SQL
  const sqlContent = generatePsaSql(config, externalTable);
  
  if (!fs.existsSync(psaDir)) {
    fs.mkdirSync(psaDir, { recursive: true });
  }
  
  fs.writeFileSync(psaFilePath, sqlContent, 'utf-8');
  log(`Created PSA model: ${psaFilePath}`);

  // Add to sources.yml as internal source (for tree view)
  await addPsaToSourcesYaml(projectPath, config, externalTable, log);

  // Update staging schema YAML
  await updatePsaSchemaYaml(projectPath, config, externalTable);
  log(`Updated schema YAML for ${psaName}`);

  // Show success
  const action = await vscode.window.showInformationMessage(
    `PSA table ${psaName} created successfully!\n\nStrategy: ${strategy}${strategy === 'merge' ? `\nUnique Key: ${uniqueKeyColumns.join(', ')}` : ''}\nIncremental Column: ${incrementalColumn}`,
    'Open File',
    'Run dbt'
  );

  if (action === 'Open File') {
    const doc = await vscode.workspace.openTextDocument(psaFilePath);
    await vscode.window.showTextDocument(doc);
  } else if (action === 'Run dbt') {
    vscode.commands.executeCommand('datavault.dbtRun');
  }

  await refreshProject();
}

/**
 * Parse external table name: ext_<concept>_<entity>
 */
function parseExternalTableName(name: string): { concept: string; entityName: string } | null {
  // Match: ext_<concept>_<entity> or just <concept>_<entity>
  const match = name.match(/^(?:ext_)?([a-z0-9]+)_(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    concept: match[1].toLowerCase(),
    entityName: match[2].toLowerCase()
  };
}

/**
 * Generate PSA SQL model content
 */
function generatePsaSql(config: PsaConfig, externalTable: ExternalTable): string {
  const { name, strategy, uniqueKeyColumns, incrementalColumn, externalTableName } = config;

  // Build column list (all columns from external table)
  const columnList = externalTable.columns.map(c => `    ${c.name}`).join(',\n');

  // Build config block
  const configParts = [
    `materialized='incremental'`,
    `incremental_strategy='${strategy}'`
  ];

  if (strategy === 'merge' && uniqueKeyColumns.length > 0) {
    if (uniqueKeyColumns.length === 1) {
      configParts.push(`unique_key='${uniqueKeyColumns[0]}'`);
    } else {
      configParts.push(`unique_key=['${uniqueKeyColumns.join("', '")}']`);
    }
  }

  // Azure SQL Basic tier doesn't support columnstore
  configParts.push(`as_columnstore=false`);

  const configBlock = configParts.join(',\n    ');

  // Build incremental WHERE clause
  const incrementalWhere = strategy === 'merge'
    ? `WHERE ${incrementalColumn} > (SELECT COALESCE(MAX(${incrementalColumn}), '1900-01-01') FROM {{ this }})`
    : `WHERE ${incrementalColumn} > (SELECT COALESCE(MAX(${incrementalColumn}), '1900-01-01') FROM {{ this }})`;

  return `/*
 * Persistent Staging Area: ${name}
 * 
 * Source: ${externalTableName}
 * Strategy: ${strategy}${strategy === 'merge' ? `\n * Unique Key: ${uniqueKeyColumns.join(', ')}` : ''}
 * Incremental Column: ${incrementalColumn}
 * 
 * Purpose: Persists external table data to avoid repeated OPENROWSET calls.
 *          Staging views (hash calculation) should reference this PSA table.
 */

{{ config(
    ${configBlock}
) }}

SELECT
${columnList}

FROM {{ source('staging', '${externalTableName}') }}

{% if is_incremental() %}
${incrementalWhere}
{% endif %}
`;
}

/**
 * Add PSA table to sources.yml as internal source
 * This allows it to appear in the tree view alongside external tables
 */
async function addPsaToSourcesYaml(
  projectPath: string,
  config: PsaConfig,
  externalTable: ExternalTable,
  log: Logger
): Promise<void> {
  const sourcesPath = path.join(projectPath, 'models', 'staging', 'sources.yml');
  
  if (!fs.existsSync(sourcesPath)) {
    log('sources.yml not found, skipping PSA source entry');
    return;
  }

  try {
    const YAML = await import('yaml');
    const content = fs.readFileSync(sourcesPath, 'utf-8');
    const sources = YAML.parse(content) as {
      version: number;
      sources: Array<{
        name: string;
        tables: Array<{
          name: string;
          meta?: { psa?: boolean };
          columns?: Array<{ name: string; data_type: string }>;
          [key: string]: unknown;
        }>;
        [key: string]: unknown;
      }>;
    };

    // Find the staging source
    const stagingSource = sources.sources?.find(s => s.name === 'staging');
    if (!stagingSource) {
      log('Staging source not found in sources.yml');
      return;
    }

    // PSA source name (without ext_ prefix, without psa_ prefix for cleaner tree view)
    // e.g., ext_jira_customers → jira_customers
    const psaSourceName = `${config.concept}_${config.entityName}`;

    // Check if already exists
    const existingIndex = stagingSource.tables.findIndex(t => t.name === psaSourceName);
    if (existingIndex >= 0) {
      stagingSource.tables.splice(existingIndex, 1);
    }

    // Add PSA source entry (no external: block since it's a dbt model)
    const psaEntry: {
      name: string;
      description: string;
      meta: { psa: boolean; source_external_table: string };
      columns: Array<{ name: string; data_type: string }>;
    } = {
      name: psaSourceName,
      description: `Persistent Staging Area for ${externalTable.name}`,
      meta: {
        psa: true,  // Mark as PSA for tree view differentiation
        source_external_table: externalTable.name
      },
      columns: externalTable.columns.map(c => ({
        name: c.name,
        data_type: c.dataType || 'NVARCHAR(4000)'
      }))
    };

    // Insert after the source external table for logical ordering
    const extIndex = stagingSource.tables.findIndex(t => t.name === externalTable.name);
    if (extIndex >= 0) {
      stagingSource.tables.splice(extIndex + 1, 0, psaEntry);
    } else {
      stagingSource.tables.push(psaEntry);
    }

    // Write back
    const yamlOutput = YAML.stringify(sources, { 
      indent: 2,
      lineWidth: 0  // Don't wrap lines
    });
    fs.writeFileSync(sourcesPath, yamlOutput, 'utf-8');
    log(`Added PSA source ${psaSourceName} to sources.yml`);

  } catch (error) {
    log(`Error updating sources.yml: ${error}`);
  }
}

/**
 * Update staging schema YAML with PSA model documentation
 */
async function updatePsaSchemaYaml(
  projectPath: string,
  config: PsaConfig,
  externalTable: ExternalTable
): Promise<void> {
  const schemaPath = path.join(projectPath, 'models', 'staging', '_staging__models.yml');

  // Build model entry
  const modelEntry: Record<string, unknown> = {
    name: config.name,
    description: `Persistent Staging Area for ${config.entityName}.\nSource: ${externalTable.name}\nStrategy: ${config.strategy}`,
    columns: externalTable.columns.map(col => {
      const entry: Record<string, unknown> = {
        name: col.name,
        description: col.name
      };
      if (col.dataType) {
        entry.data_type = col.dataType.toLowerCase();
      }
      // Mark unique keys
      if (config.uniqueKeyColumns.includes(col.name)) {
        entry.tests = ['not_null'];
      }
      return entry;
    })
  };

  try {
    const YAML = await import('yaml');
    let schema: { version: number; models: Array<Record<string, unknown>> };

    if (fs.existsSync(schemaPath)) {
      const content = fs.readFileSync(schemaPath, 'utf-8');
      schema = YAML.parse(content) || { version: 2, models: [] };
      if (!schema.models) schema.models = [];

      // Remove existing entry if present
      schema.models = schema.models.filter(m => m.name !== config.name);
    } else {
      schema = { version: 2, models: [] };
    }

    // Add new entry
    schema.models.push(modelEntry);

    // Sort models alphabetically
    schema.models.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    // Write back
    const yamlOutput = YAML.stringify(schema, {
      indent: 2,
      lineWidth: 0
    });
    fs.writeFileSync(schemaPath, yamlOutput, 'utf-8');

  } catch (error) {
    console.error('Error updating staging schema YAML:', error);
  }
}

/**
 * Command palette entry for PSA creation (selects from available external tables)
 */
export async function createPersistentStagingWizard(
  context: PsaCommandContext & { getCurrentMetadata: () => { externalTables: ExternalTable[] } | null }
): Promise<void> {
  const metadata = context.getCurrentMetadata();
  if (!metadata || !metadata.externalTables || metadata.externalTables.length === 0) {
    vscode.window.showErrorMessage('No external tables found in project');
    return;
  }

  // Group external tables by concept
  const tableItems = metadata.externalTables.map(t => ({
    label: t.name,
    description: t.concept,
    detail: t.location || t.schema,
    externalTable: t
  }));

  const selected = await vscode.window.showQuickPick(tableItems, {
    title: 'Select External Table for PSA',
    placeHolder: 'Choose an external table to create a Persistent Staging Area for'
  });

  if (!selected) {
    return;
  }

  // Create tree item data and call main function
  const treeItem: TreeItemData = {
    id: `ext-${selected.externalTable.name}`,
    label: selected.externalTable.name,
    type: 'external_table',
    externalTable: selected.externalTable,
    collapsibleState: 'none'
  };

  await createPersistentStaging(treeItem, context);
}
