/**
 * Reference Table Commands
 * 
 * Commands for creating Reference Tables (dbt seeds with automate_dv ref_table macro).
 * Reference Tables are used for lookup data like status codes, roles, categories etc.
 * 
 * Two modes supported:
 * 1. Extract from External Table - Query existing data and create seed CSV
 * 2. Manual Entry - Create seed CSV with user-provided data
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TreeItemData, ExternalTable } from '../types';

type Logger = (message: string) => void;

interface RefTableCommandContext {
  projectPath: string | null;
  refreshProject: () => Promise<void>;
  log: Logger;
}

interface RefTableColumn {
  name: string;
  dataType?: string;
  isPrimaryKey: boolean;
}

interface RefTableRow {
  [column: string]: string;
}

/**
 * Create a Reference Table (seed CSV + optional model using automate_dv ref_table macro)
 */
export async function createRefTable(
  treeItem: TreeItemData | undefined,
  context: RefTableCommandContext
): Promise<void> {
  const { projectPath, refreshProject, log } = context;

  if (!projectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }

  log('Creating Reference Table...');

  // Step 1: Choose creation mode
  const mode = await vscode.window.showQuickPick(
    [
      {
        label: '$(edit) Manual Entry',
        description: 'Create seed CSV with manually entered data',
        detail: 'Define columns and add rows interactively',
        value: 'manual'
      },
      {
        label: '$(database) From External Table',
        description: 'Extract distinct values from an external table',
        detail: 'Query existing data to create reference data',
        value: 'extract',
        disabled: !treeItem?.externalTable
      }
    ],
    {
      title: 'Create Reference Table',
      placeHolder: 'How would you like to create the reference table?'
    }
  );

  if (!mode) {
    return; // Cancelled
  }

  if (mode.value === 'extract' && treeItem?.externalTable) {
    await createFromExternalTable(treeItem.externalTable, projectPath, refreshProject, log);
  } else {
    await createManualRefTable(projectPath, refreshProject, log);
  }
}

/**
 * Create reference table using automate_dv.ref_table macro
 * 
 * According to https://automate-dv.readthedocs.io/en/latest/tutorial/tut_ref_tables/
 * Reference Tables contain static lookup data (codes, categories, types)
 * They have a Natural Key (not a hash) and optional extra columns
 * 
 * The source should be a staging view, not an external table directly
 */
async function createFromExternalTable(
  externalTable: ExternalTable,
  projectPath: string,
  refreshProject: () => Promise<void>,
  log: Logger
): Promise<void> {
  log(`Creating reference table from: ${externalTable.name}`);

  // Filter out dss_* metadata columns and FK columns (IDs that reference other tables)
  const dataColumns = externalTable.columns.filter(
    col => !col.name.toLowerCase().startsWith('dss_')
  );

  // Step 1: Select the Primary Key column (Natural Key - single column)
  const pkItems = dataColumns.map(col => ({
    label: col.name,
    description: col.dataType,
    detail: col.name.toLowerCase().endsWith('_id') ? 'Likely a Foreign Key' : 
            col.name.toLowerCase().includes('code') || col.name.toLowerCase().includes('type') ? 'Likely a good PK' : ''
  }));

  const selectedPk = await vscode.window.showQuickPick(pkItems, {
    title: 'Step 1/5: Select Primary Key (Natural Key)',
    placeHolder: 'Select the single column that uniquely identifies each reference record (e.g., code, type)',
    canPickMany: false
  });

  if (!selectedPk) {
    return; // Cancelled
  }

  // Step 2: Select extra columns (attributes)
  const extraColumnItems = dataColumns
    .filter(col => col.name !== selectedPk.label)
    .map(col => ({
      label: col.name,
      description: col.dataType,
      picked: !col.name.toLowerCase().endsWith('_id') // Don't pre-select FK columns
    }));

  const selectedExtraColumns = await vscode.window.showQuickPick(extraColumnItems, {
    title: 'Step 2/5: Select Extra Columns (Optional)',
    placeHolder: 'Select additional columns to include (e.g., name, description)',
    canPickMany: true
  });

  // Extra columns are optional, so empty selection is OK

  // Step 3: Enter reference table name
  const suggestedName = extractRefTableName(externalTable.name, [selectedPk.label]);
  
  const refTableName = await vscode.window.showInputBox({
    title: 'Step 3/5: Reference Table Name',
    prompt: 'Enter name for the reference table (without ref_ prefix)',
    value: suggestedName,
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Name is required';
      }
      if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
        return 'Use snake_case (letters, numbers, underscores)';
      }
      if (value.toLowerCase().startsWith('ref_')) {
        return 'Name should not include ref_ prefix (it will be added automatically)';
      }
      return null;
    }
  });

  if (!refTableName) {
    return; // Cancelled
  }

  // Step 4: Enter concept name
  const sourceConcept = externalTable.concept || 'common';
  const conceptInput = await vscode.window.showInputBox({
    title: 'Step 4/5: Concept Name',
    prompt: 'Enter the concept name for this reference table',
    value: sourceConcept,
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Concept name is required';
      }
      if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
        return 'Use snake_case (letters, numbers, underscores)';
      }
      return null;
    }
  });

  if (!conceptInput) {
    return; // Cancelled
  }

  // Step 5: Select materialization
  const materializationChoice = await vscode.window.showQuickPick(
    [
      {
        label: '$(table) Table (Persistent)',
        description: 'materialized=\'table\'',
        detail: 'Data is stored physically - better for large reference data or frequent joins',
        value: 'table'
      },
      {
        label: '$(eye) View (Virtual)',
        description: 'materialized=\'view\'',
        detail: 'Data is computed on-the-fly - better for small or frequently changing reference data',
        value: 'view'
      },
      {
        label: '$(history) Incremental',
        description: 'materialized=\'incremental\'',
        detail: 'Only new/changed records are processed - best for large, append-only reference data',
        value: 'incremental'
      }
    ],
    {
      title: 'Step 5/5: Materialization',
      placeHolder: 'How should the reference table be stored?'
    }
  );

  if (!materializationChoice) {
    return; // Cancelled
  }

  const fullRefName = `ref_${refTableName}`;
  const targetConcept = conceptInput.trim().toLowerCase();
  const targetSchema = `vault_${targetConcept}`;
  const materialization = materializationChoice.value;
  
  // Staging view name matches the reference table name (without ref_ prefix)
  // Pattern: ref_address_type -> <concept>_address_type
  const stagingViewName = `${targetConcept}_${refTableName}`;
  
  // Determine output path
  const refTableDir = path.join(projectPath, 'models', 'raw_vault', targetConcept);
  const refTablePath = path.join(refTableDir, `${fullRefName}.sql`);

  // Check if file already exists
  if (fs.existsSync(refTablePath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `${fullRefName}.sql already exists. Overwrite?`,
      'Yes', 'No'
    );
    if (overwrite !== 'Yes') {
      return;
    }
  }

  // Ensure directory exists
  if (!fs.existsSync(refTableDir)) {
    fs.mkdirSync(refTableDir, { recursive: true });
  }

  // Generate SQL using automate_dv.ref_table macro
  const pkName = selectedPk.label;
  const extraColumnNames = selectedExtraColumns?.map(c => c.label) || [];
  const sqlContent = generateRefTableMacroSql(
    fullRefName, 
    stagingViewName,
    pkName, 
    extraColumnNames, 
    targetSchema,
    materialization
  );

  // Write SQL file
  fs.writeFileSync(refTablePath, sqlContent, 'utf-8');
  log(`Created reference table: ${refTablePath}`);

  // Update schema YAML
  const allColumns = [pkName, ...extraColumnNames];
  await updateRefTableModelYaml(projectPath, targetConcept, fullRefName, allColumns, [pkName], externalTable);
  log(`Updated schema YAML for ${fullRefName}`);

  // Automatically create staging view if it doesn't exist (required for automate_dv.ref_table)
  const stagingPath = path.join(projectPath, 'models', 'staging', `${stagingViewName}.sql`);
  if (!fs.existsSync(stagingPath)) {
    await createMinimalStagingView(projectPath, stagingViewName, externalTable, [pkName, ...extraColumnNames], log);
    vscode.window.showInformationMessage(`Staging view '${stagingViewName}' created automatically.`);
  }

  // Show success and offer actions
  const action = await vscode.window.showInformationMessage(
    `Reference table ${fullRefName} created successfully using automate_dv.ref_table macro!`,
    'Open File',
    'Run dbt'
  );

  if (action === 'Open File') {
    const doc = await vscode.workspace.openTextDocument(refTablePath);
    await vscode.window.showTextDocument(doc);
  } else if (action === 'Run dbt') {
    vscode.commands.executeCommand('datavault.dbtRun');
  }

  await refreshProject();
}

/**
 * Create a minimal staging view for reference table source
 * Also updates _staging__models.yml
 */
async function createMinimalStagingView(
  projectPath: string,
  stagingViewName: string,
  externalTable: ExternalTable,
  columns: string[],
  log: Logger
): Promise<void> {
  const stagingPath = path.join(projectPath, 'models', 'staging', `${stagingViewName}.sql`);
  
  const columnSelects = columns.map(col => 
    `        ${col} AS ${col.toLowerCase()}`
  ).join(',\n');

  const sql = `/*
 * Staging View: ${stagingViewName}
 * 
 * Minimal staging view for reference table source.
 * Source: ${externalTable.name}
 */

WITH source AS (
    SELECT * FROM {{ source('staging', '${externalTable.name}') }}
),

staged AS (
    SELECT DISTINCT
${columnSelects},
        COALESCE(dss_record_source, '${externalTable.concept || 'unknown'}') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date

    FROM source
)

SELECT * FROM staged
`;

  fs.writeFileSync(stagingPath, sql, 'utf-8');
  log(`Created minimal staging view: ${stagingPath}`);

  // Update _staging__models.yml
  await updateStagingModelYaml(projectPath, stagingViewName, externalTable, columns, log);
}

/**
 * Update _staging__models.yml with new staging view entry
 */
async function updateStagingModelYaml(
  projectPath: string,
  stagingViewName: string,
  externalTable: ExternalTable,
  columns: string[],
  log: Logger
): Promise<void> {
  const yamlPath = path.join(projectPath, 'models', 'staging', '_staging__models.yml');
  
  // Build model entry
  const modelEntry: Record<string, unknown> = {
    name: stagingViewName,
    description: `Staging view for reference table source.\nSource: ${externalTable.name}`,
    config: {
      meta: {
        entity_type: 'reference',
        source_type: 'external_table',
        external_table: externalTable.name
      }
    },
    columns: [
      ...columns.map(col => ({
        name: col.toLowerCase(),
        description: `Reference data column`
      })),
      {
        name: 'dss_record_source',
        description: 'Data source identifier',
        data_type: 'varchar(100)',
        tests: ['not_null']
      },
      {
        name: 'dss_load_date',
        description: 'Load timestamp',
        data_type: 'datetime2(7)',
        tests: ['not_null']
      }
    ]
  };

  try {
    const YAML = await import('yaml');
    let schema: { version: number; models: Array<Record<string, unknown>> };
    
    if (fs.existsSync(yamlPath)) {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      schema = YAML.parse(content) || { version: 2, models: [] };
      if (!schema.models) schema.models = [];
      
      // Remove existing entry if present
      schema.models = schema.models.filter(m => m.name !== stagingViewName);
    } else {
      schema = { version: 2, models: [] };
    }
    
    // Add new entry
    schema.models.push(modelEntry);
    
    // Write back
    const doc = new YAML.Document(schema);
    fs.writeFileSync(yamlPath, doc.toString({ indent: 2, lineWidth: 0 }), 'utf-8');
    log(`Updated _staging__models.yml with ${stagingViewName}`);
  } catch (error) {
    log(`Warning: Could not update _staging__models.yml: ${error}`);
  }
}

/**
 * Generate SQL using automate_dv.ref_table macro
 * 
 * @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_ref_tables/
 */
function generateRefTableMacroSql(
  refName: string,
  sourceModel: string,
  pkColumn: string,
  extraColumns: string[],
  schema: string,
  materialization: string
): string {
  // Build extra columns config
  const extraColumnsConfig = extraColumns.length > 0
    ? `[${extraColumns.map(c => `'${c.toLowerCase()}'`).join(', ')}]`
    : '[]';

  // Incremental needs additional config
  const incrementalConfig = materialization === 'incremental' 
    ? `,
    incremental_strategy='append',
    as_columnstore=false`
    : '';

  return `/*
 * Reference Table: ${refName}
 * 
 * Pattern: Non-historised Reference Table (Data Vault 2.0)
 * Source Model: ${sourceModel}
 * Primary Key: ${pkColumn.toLowerCase()} (Natural Key)
 * Extra Columns: ${extraColumns.length > 0 ? extraColumns.map(c => c.toLowerCase()).join(', ') : '(none)'}
 * 
 * Reference Tables store static lookup data (codes, categories, types).
 * The PK is a Natural Key (not a hash key).
 * 
 * @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_ref_tables/
 */

{{ config(
    materialized='${materialization}',
    schema='${schema}'${incrementalConfig}
) }}

{%- set source_model = '${sourceModel}' -%}
{%- set src_pk = '${pkColumn.toLowerCase()}' -%}
{%- set src_extra_columns = ${extraColumnsConfig} -%}
{%- set src_ldts = 'dss_load_date' -%}
{%- set src_source = 'dss_record_source' -%}

{{ automate_dv.ref_table(
    src_pk=src_pk,
    src_extra_columns=src_extra_columns,
    src_ldts=src_ldts,
    src_source=src_source,
    source_model=source_model
) }}
`;
}

/**
 * Update or create model YAML for reference table in raw_vault/<concept>/
 */
async function updateRefTableModelYaml(
  projectPath: string,
  concept: string,
  refName: string,
  columns: string[],
  pkColumns: string[],
  externalTable: ExternalTable
): Promise<void> {
  const schemaPath = path.join(projectPath, 'models', 'raw_vault', concept, `_${concept}__models.yml`);
  
  // Build model entry
  const modelEntry: Record<string, unknown> = {
    name: refName,
    description: `Reference table for ${refName.replace('ref_', '')}.\nLookup data from ${externalTable.name}.`,
    columns: columns.map(col => {
      const colLower = col.toLowerCase();
      const isPk = pkColumns.some(pk => pk.toLowerCase() === colLower);
      const colDef = externalTable.columns.find(c => c.name.toLowerCase() === colLower);
      
      const entry: Record<string, unknown> = {
        name: colLower,
        description: isPk ? `Primary Key - ${col}` : `${col}`,
      };
      
      if (colDef?.dataType) {
        entry.data_type = colDef.dataType.toLowerCase();
      }
      
      if (isPk) {
        entry.tests = ['not_null', 'unique'];
      }
      
      return entry;
    })
  };

  // Add metadata columns
  (modelEntry.columns as Array<Record<string, unknown>>).push(
    { name: 'dss_load_date', description: 'Load timestamp', data_type: 'datetime2(7)' },
    { name: 'dss_record_source', description: 'Data source identifier', data_type: 'varchar(100)' }
  );

  try {
    const YAML = await import('yaml');
    let schema: { version: number; models: Array<Record<string, unknown>> };
    
    if (fs.existsSync(schemaPath)) {
      const content = fs.readFileSync(schemaPath, 'utf-8');
      schema = YAML.parse(content) || { version: 2, models: [] };
      if (!schema.models) schema.models = [];
      
      // Remove existing entry if present
      schema.models = schema.models.filter(m => m.name !== refName);
    } else {
      schema = { version: 2, models: [] };
    }
    
    // Add new entry
    schema.models.push(modelEntry);
    
    // Write back
    const doc = new YAML.Document(schema);
    fs.writeFileSync(schemaPath, doc.toString({ indent: 2, lineWidth: 0 }), 'utf-8');
  } catch (error) {
    console.error('Error updating model YAML:', error);
  }
}

/**
 * Create reference table with manual data entry
 */
async function createManualRefTable(
  projectPath: string,
  refreshProject: () => Promise<void>,
  log: Logger
): Promise<void> {
  log('Creating manual reference table');

  // Step 1: Enter reference table name
  const refTableName = await vscode.window.showInputBox({
    title: 'Reference Table Name',
    prompt: 'Enter name for the reference table (without ref_ prefix)',
    placeHolder: 'e.g., status, category, role',
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Name is required';
      }
      if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
        return 'Use snake_case (letters, numbers, underscores)';
      }
      return null;
    }
  });

  if (!refTableName) {
    return; // Cancelled
  }

  // Check if seed already exists
  const seedPath = path.join(projectPath, 'seeds', `ref_${refTableName}.csv`);
  if (fs.existsSync(seedPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Seed ref_${refTableName}.csv already exists. Overwrite?`,
      'Yes', 'No'
    );
    if (overwrite !== 'Yes') {
      return;
    }
  }

  // Step 2: Define columns
  const columnInput = await vscode.window.showInputBox({
    title: 'Define Columns',
    prompt: 'Enter column names separated by commas',
    placeHolder: 'e.g., status_code, status_name, description',
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'At least one column is required';
      }
      const cols = value.split(',').map(c => c.trim()).filter(c => c);
      if (cols.length === 0) {
        return 'At least one column is required';
      }
      for (const col of cols) {
        if (!/^[a-z][a-z0-9_]*$/i.test(col)) {
          return `Invalid column name: ${col}. Use snake_case.`;
        }
      }
      return null;
    }
  });

  if (!columnInput) {
    return; // Cancelled
  }

  const columnNames = columnInput.split(',').map(c => c.trim()).filter(c => c);

  // Step 3: Select primary key column(s)
  const pkItems = columnNames.map((col, index) => ({
    label: col,
    picked: index === 0 // First column is typically PK
  }));

  const selectedPks = await vscode.window.showQuickPick(pkItems, {
    title: 'Select Primary Key Column(s)',
    placeHolder: 'Select the column(s) that uniquely identify each row',
    canPickMany: true
  });

  if (!selectedPks || selectedPks.length === 0) {
    vscode.window.showWarningMessage('At least one primary key column is required');
    return;
  }

  const pkNames = selectedPks.map(c => c.label);

  // Step 4: Enter data rows
  const rows = await collectRows(columnNames, pkNames.length > 1);
  
  if (rows.length === 0) {
    vscode.window.showWarningMessage('No data entered. Reference table not created.');
    return;
  }

  // Generate and save files
  await saveRefTable(projectPath, refTableName, columnNames, pkNames, rows, log);
  
  vscode.window.showInformationMessage(
    `Reference table ref_${refTableName} created with ${rows.length} rows.`,
    'Open Seed File'
  ).then(selection => {
    if (selection === 'Open Seed File') {
      vscode.workspace.openTextDocument(seedPath).then(doc => 
        vscode.window.showTextDocument(doc)
      );
    }
  });

  await refreshProject();
}

/**
 * Collect data rows from user input
 */
async function collectRows(
  columnNames: string[],
  hasCompositeKey: boolean
): Promise<RefTableRow[]> {
  const rows: RefTableRow[] = [];
  
  // Show instructions
  vscode.window.showInformationMessage(
    `Enter data rows. Each row: ${columnNames.join(', ')} (comma-separated). Empty input to finish.`
  );

  while (true) {
    const rowNumber = rows.length + 1;
    const rowInput = await vscode.window.showInputBox({
      title: `Row ${rowNumber}`,
      prompt: `Enter values for: ${columnNames.join(', ')}`,
      placeHolder: `value1, value2${columnNames.length > 2 ? ', ...' : ''}`,
      validateInput: (value) => {
        if (!value || value.trim() === '') {
          return null; // Empty is valid (to finish)
        }
        const values = parseCSVRow(value);
        if (values.length !== columnNames.length) {
          return `Expected ${columnNames.length} values, got ${values.length}`;
        }
        return null;
      }
    });

    if (!rowInput || rowInput.trim() === '') {
      // Ask if user wants to finish or cancel
      if (rows.length === 0) {
        const action = await vscode.window.showQuickPick(
          ['Add First Row', 'Cancel'],
          { placeHolder: 'No rows entered yet' }
        );
        if (action === 'Cancel') {
          return [];
        }
        continue;
      }
      break; // Finished entering rows
    }

    const values = parseCSVRow(rowInput);
    const row: RefTableRow = {};
    columnNames.forEach((col, i) => {
      row[col] = values[i] || '';
    });
    rows.push(row);

    // Show confirmation
    vscode.window.setStatusBarMessage(`Added row ${rowNumber}: ${values.join(', ')}`, 2000);
  }

  return rows;
}

/**
 * Parse a CSV row, handling quoted values
 */
function parseCSVRow(input: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (input[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  
  return values;
}

/**
 * Save reference table files (seed CSV + schema YAML)
 */
async function saveRefTable(
  projectPath: string,
  refTableName: string,
  columnNames: string[],
  pkNames: string[],
  rows: RefTableRow[],
  log: Logger
): Promise<void> {
  const seedsDir = path.join(projectPath, 'seeds');
  
  // Ensure seeds directory exists
  if (!fs.existsSync(seedsDir)) {
    fs.mkdirSync(seedsDir, { recursive: true });
  }

  // Generate CSV content
  const csvHeader = columnNames.join(',');
  const csvRows = rows.map(row => 
    columnNames.map(col => escapeCSVValue(row[col] || '')).join(',')
  );
  const csvContent = [csvHeader, ...csvRows].join('\n') + '\n';

  // Write CSV file
  const seedPath = path.join(seedsDir, `ref_${refTableName}.csv`);
  fs.writeFileSync(seedPath, csvContent, 'utf-8');
  log(`Created seed file: seeds/ref_${refTableName}.csv`);

  // Update or create schema.yml
  await updateSeedSchemaYaml(projectPath, refTableName, columnNames, pkNames, log);
}

/**
 * Escape CSV value (quote if contains comma, newline, or quotes)
 */
function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Update seeds/schema.yml with the new seed definition
 */
async function updateSeedSchemaYaml(
  projectPath: string,
  refTableName: string,
  columnNames: string[],
  pkNames: string[],
  log: Logger
): Promise<void> {
  const schemaPath = path.join(projectPath, 'seeds', 'schema.yml');
  
  // Build the new seed definition
  const newSeedDef = {
    name: `ref_${refTableName}`,
    description: `Reference table for ${refTableName}`,
    config: {
      schema: 'vault'
    },
    columns: columnNames.map(col => {
      const colDef: { name: string; description: string; tests?: string[] } = {
        name: col,
        description: `${col} column`
      };
      if (pkNames.includes(col)) {
        colDef.tests = ['unique', 'not_null'];
        colDef.description = `Primary Key - ${col}`;
      }
      return colDef;
    })
  };

  try {
    // Use dynamic import for yaml
    const yaml = await import('yaml');
    
    let schemaContent: { version: number; seeds: Array<{ name: string; [key: string]: unknown }> };
    
    if (fs.existsSync(schemaPath)) {
      // Read existing schema
      const existingContent = fs.readFileSync(schemaPath, 'utf-8');
      schemaContent = yaml.parse(existingContent) || { version: 2, seeds: [] };
      
      // Remove existing definition if present
      schemaContent.seeds = (schemaContent.seeds || []).filter(
        s => s.name !== `ref_${refTableName}`
      );
    } else {
      schemaContent = { version: 2, seeds: [] };
    }

    // Add new definition
    schemaContent.seeds.push(newSeedDef);

    // Sort seeds alphabetically
    schemaContent.seeds.sort((a, b) => a.name.localeCompare(b.name));

    // Write schema file
    const yamlContent = yaml.stringify(schemaContent, {
      indent: 2,
      lineWidth: 0
    });
    fs.writeFileSync(schemaPath, yamlContent, 'utf-8');
    log(`Updated schema file: seeds/schema.yml`);
  } catch (error) {
    log(`Warning: Could not update schema.yml: ${error}`);
    // Continue without schema update
  }
}

/**
 * Generate SQL query to extract distinct values from external table
 */
function generateExtractionQuery(
  externalTable: ExternalTable,
  columnNames: string[],
  pkNames: string[]
): string {
  const columns = columnNames.join(',\n    ');
  const orderBy = pkNames.join(', ');
  
  return `SELECT DISTINCT
    ${columns}
FROM [stg].[${externalTable.name}]
ORDER BY ${orderBy};`;
}

/**
 * Extract a suggested reference table name from external table and columns
 */
function extractRefTableName(tableName: string, columns: string[]): string {
  // Try to extract from column names (e.g., status_id -> status)
  if (columns.length === 1) {
    const col = columns[0].toLowerCase();
    if (col.endsWith('_id')) {
      return col.slice(0, -3);
    }
    if (col.endsWith('_code')) {
      return col.slice(0, -5);
    }
    return col;
  }
  
  // Try to find common pattern
  const firstCol = columns[0].toLowerCase();
  const match = firstCol.match(/^([a-z]+)_/);
  if (match) {
    return match[1];
  }
  
  // Fallback to table name extraction
  const tableMatch = tableName.match(/ext_[^_]+_(.+)/);
  if (tableMatch) {
    return tableMatch[1];
  }
  
  return 'lookup';
}

/**
 * Create Reference Table command handler for command palette
 * (without external table context)
 */
export async function createRefTableFromPalette(
  context: RefTableCommandContext
): Promise<void> {
  await createRefTable(undefined, context);
}

/**
 * Delete a Reference Table and its associated staging view
 * 
 * Deletes:
 * 1. Reference Table SQL (raw_vault/<concept>/ref_<name>.sql)
 * 2. Staging View SQL (staging/<concept>_<name>.sql)
 * 3. YAML entries in both _staging__models.yml and _<concept>__models.yml
 */
export async function deleteRefTable(
  treeItem: TreeItemData | undefined,
  context: RefTableCommandContext
): Promise<void> {
  const { projectPath, refreshProject, log } = context;

  if (!projectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }

  // Get model from tree item - can be ref table or staging view
  const model = treeItem?.model;
  if (!model) {
    vscode.window.showErrorMessage('Please select a Reference Table or its Staging View to delete');
    return;
  }

  let refTableName: string;
  let stagingViewName: string;
  let concept: string;

  // Determine names based on what was selected
  if (model.name.startsWith('ref_')) {
    // Selected the ref table directly
    refTableName = model.name;
    concept = model.concept || '';
    // Staging view name: concept + ref table name without ref_ prefix
    // e.g., ref_address_type -> adworks_address_type
    stagingViewName = `${concept}_${model.name.replace('ref_', '')}`;
  } else if (model.layer === 'staging') {
    // Selected the staging view
    stagingViewName = model.name;
    concept = model.concept || model.name.split('_')[0];
    // Ref table name: ref_ + entity name
    const entityName = model.name.replace(`${concept}_`, '');
    refTableName = `ref_${entityName}`;
  } else {
    vscode.window.showErrorMessage('Please select a Reference Table or its Staging View');
    return;
  }

  log(`Preparing to delete Reference Table: ${refTableName} (staging: ${stagingViewName}, concept: ${concept})`);

  // Collect files to delete
  const filesToDelete: { path: string; type: string; exists: boolean }[] = [];

  // 1. Reference Table SQL
  const refTablePath = path.join(projectPath, 'models', 'raw_vault', concept, `${refTableName}.sql`);
  filesToDelete.push({ 
    path: refTablePath, 
    type: 'Reference Table', 
    exists: fs.existsSync(refTablePath) 
  });

  // 2. Staging View SQL
  const stagingPath = path.join(projectPath, 'models', 'staging', `${stagingViewName}.sql`);
  filesToDelete.push({ 
    path: stagingPath, 
    type: 'Staging View', 
    exists: fs.existsSync(stagingPath) 
  });

  // Show confirmation
  const existingFiles = filesToDelete.filter(f => f.exists);
  if (existingFiles.length === 0) {
    vscode.window.showWarningMessage('No files found to delete');
    return;
  }

  const fileList = existingFiles.map(f => `• ${f.type}: ${path.basename(f.path)}`).join('\n');
  const confirm = await vscode.window.showWarningMessage(
    `Delete Reference Table "${refTableName}"?\n\nFiles to delete:\n${fileList}\n\nThis will also remove YAML entries.`,
    { modal: true },
    'Delete'
  );

  if (confirm !== 'Delete') {
    return;
  }

  // Delete files
  for (const file of existingFiles) {
    try {
      fs.unlinkSync(file.path);
      log(`Deleted: ${file.path}`);
    } catch (error) {
      log(`Warning: Could not delete ${file.path}: ${error}`);
    }
  }

  // Remove from _staging__models.yml
  await removeModelFromYaml(
    path.join(projectPath, 'models', 'staging', '_staging__models.yml'),
    stagingViewName,
    log
  );

  // Remove from _<concept>__models.yml
  await removeModelFromYaml(
    path.join(projectPath, 'models', 'raw_vault', concept, `_${concept}__models.yml`),
    refTableName,
    log
  );

  vscode.window.showInformationMessage(`Reference Table "${refTableName}" deleted successfully`);
  await refreshProject();
}

/**
 * Remove a model entry from a YAML schema file
 */
async function removeModelFromYaml(
  yamlPath: string,
  modelName: string,
  log: Logger
): Promise<void> {
  if (!fs.existsSync(yamlPath)) {
    log(`YAML file not found: ${yamlPath}`);
    return;
  }

  try {
    const YAML = await import('yaml');
    const content = fs.readFileSync(yamlPath, 'utf-8');
    const schema = YAML.parse(content);

    if (!schema?.models || !Array.isArray(schema.models)) {
      log(`No models array in ${yamlPath}`);
      return;
    }

    const originalLength = schema.models.length;
    schema.models = schema.models.filter((m: { name: string }) => m.name !== modelName);

    if (schema.models.length < originalLength) {
      const doc = new YAML.Document(schema);
      fs.writeFileSync(yamlPath, doc.toString({ indent: 2, lineWidth: 0 }), 'utf-8');
      log(`Removed "${modelName}" from ${yamlPath}`);
    } else {
      log(`Model "${modelName}" not found in ${yamlPath}`);
    }
  } catch (error) {
    log(`Warning: Could not update ${yamlPath}: ${error}`);
  }
}
