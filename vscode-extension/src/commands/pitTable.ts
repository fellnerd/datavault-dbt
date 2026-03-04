/**
 * PIT Table Commands
 * 
 * Commands for creating Point-in-Time (PIT) Tables using automate_dv pit macro.
 * PIT Tables optimize historical queries across multiple satellites.
 * 
 * automate_dv macro parameters:
 * - src_pk: Primary key (hub's hash key)
 * - src_extra_columns: Additional columns from hub
 * - as_of_dates_table: Table/model containing as-of dates
 * - satellites: Dictionary of satellite configurations
 * - stage_tables_ldts: Staging table load date columns
 * - src_ldts: Load date timestamp column name
 * - source_model: Hub model name
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TreeItemData, DbtModel, ProjectMetadata } from '../types';

type Logger = (message: string) => void;

interface PITCommandContext {
  projectPath: string | null;
  refreshProject: () => Promise<void>;
  getCurrentMetadata: () => ProjectMetadata | null;
  log: Logger;
}

interface SatelliteConfig {
  name: string;
  pkColumn: string;
  ldtsColumn: string;
}

/**
 * Create a PIT Table using automate_dv macro
 */
export async function createPITTable(
  treeItem: TreeItemData | undefined,
  context: PITCommandContext
): Promise<void> {
  const { projectPath, refreshProject, getCurrentMetadata, log } = context;

  if (!projectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }

  const metadata = getCurrentMetadata();
  if (!metadata) {
    vscode.window.showErrorMessage('Project metadata not loaded. Please wait for refresh.');
    return;
  }

  log('Creating PIT Table...');

  // Get all hubs and satellites from metadata
  const hubs = metadata.models.filter(m => m.type === 'hub');
  const satellites = metadata.models.filter(m => m.type === 'satellite' || m.type === 'effectivity_satellite');

  if (hubs.length === 0) {
    vscode.window.showErrorMessage('No hubs found in the project. Create hubs first.');
    return;
  }

  // Step 1: Select Hub
  let selectedHub: DbtModel | undefined;
  
  if (treeItem?.model?.type === 'hub') {
    // If triggered from a hub context menu
    selectedHub = treeItem.model;
  } else {
    // Show hub picker
    const hubItems = hubs.map(hub => ({
      label: hub.name,
      description: hub.concept,
      detail: `Schema: ${hub.schema}`,
      hub
    }));

    const selectedHubItem = await vscode.window.showQuickPick(hubItems, {
      title: 'Step 1: Select Hub',
      placeHolder: 'Select the hub for this PIT table'
    });

    if (!selectedHubItem) {
      return; // Cancelled
    }
    selectedHub = selectedHubItem.hub;
  }

  log(`Selected hub: ${selectedHub.name}`);

  // Extract entity name from hub (hub_company -> company)
  const entityName = selectedHub.name.replace(/^hub_/, '');
  const hashKey = `hk_${entityName}`;

  // Step 2: Find related satellites
  // Match satellites by concept and entity name pattern
  const relatedSatellites = satellites.filter(sat => {
    // Check if satellite is in the same concept
    if (sat.concept !== selectedHub!.concept) {
      return false;
    }
    // Check if satellite name matches the hub entity
    // sat_company, sat_company_ext, sat_company_address all match hub_company
    return sat.name.startsWith(`sat_${entityName}`);
  });

  if (relatedSatellites.length === 0) {
    vscode.window.showErrorMessage(
      `No satellites found for ${selectedHub.name}. Create satellites first.`
    );
    return;
  }

  // Step 3: Select Satellites to include
  const satItems = relatedSatellites.map(sat => ({
    label: sat.name,
    description: sat.type === 'effectivity_satellite' ? 'Effectivity Satellite' : 'Satellite',
    detail: `Columns: ${sat.columns.map(c => c.name).slice(0, 5).join(', ')}${sat.columns.length > 5 ? '...' : ''}`,
    picked: true, // Pre-select all related satellites
    sat
  }));

  const selectedSatItems = await vscode.window.showQuickPick(satItems, {
    title: 'Step 2: Select Satellites',
    placeHolder: 'Select satellites to include in the PIT table',
    canPickMany: true
  });

  if (!selectedSatItems || selectedSatItems.length === 0) {
    vscode.window.showWarningMessage('At least one satellite is required');
    return;
  }

  const selectedSatellites = selectedSatItems.map(item => item.sat);
  log(`Selected satellites: ${selectedSatellites.map(s => s.name).join(', ')}`);

  // Step 3: Configure as-of-dates source
  const asOfDateOption = await vscode.window.showQuickPick(
    [
      {
        label: '$(calendar) Generate from Satellites',
        description: 'Create CTE with distinct dates from satellite load dates',
        detail: 'Recommended for most use cases',
        value: 'generate'
      },
      {
        label: '$(table) Use Existing Model',
        description: 'Reference an existing model/seed with as-of dates',
        detail: 'Use if you have a calendar or date dimension table',
        value: 'model'
      }
    ],
    {
      title: 'Step 3: As-of Dates Source',
      placeHolder: 'How should as-of dates be determined?'
    }
  );

  if (!asOfDateOption) {
    return; // Cancelled
  }

  let asOfDatesConfig: string | null = null;
  let useGeneratedDates = true;

  if (asOfDateOption.value === 'model') {
    // Show model picker for as-of dates
    const allModels = metadata.models.filter(m => 
      m.type !== 'hub' && m.type !== 'satellite' && m.type !== 'link'
    );
    
    const modelItems = [
      ...allModels.map(m => ({
        label: m.name,
        description: m.type,
        detail: `Schema: ${m.schema}`,
        model: m.name
      }))
    ];

    const asOfDateInput = await vscode.window.showQuickPick(modelItems, {
      title: 'Select As-of Dates Model',
      placeHolder: 'Select a model containing the AS_OF_DATE column'
    });

    if (asOfDateInput) {
      asOfDatesConfig = asOfDateInput.model;
      useGeneratedDates = false;
    } else {
      return; // Cancelled
    }
  }

  // Step 4: Confirm PIT table name
  const defaultPitName = `pit_${entityName}`;
  const pitName = await vscode.window.showInputBox({
    title: 'Step 4: PIT Table Name',
    prompt: 'Enter the PIT table name',
    value: defaultPitName,
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Name is required';
      }
      if (!/^pit_[a-z][a-z0-9_]*$/i.test(value)) {
        return 'Must start with pit_ followed by snake_case';
      }
      return null;
    }
  });

  if (!pitName) {
    return; // Cancelled
  }

  // Check if PIT already exists
  const pitPath = path.join(projectPath, 'models', 'business_vault', `${pitName}.sql`);
  if (fs.existsSync(pitPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `PIT table ${pitName}.sql already exists. Overwrite?`,
      'Yes', 'No'
    );
    if (overwrite !== 'Yes') {
      return;
    }
  }

  // Build satellite configurations for automate_dv
  const satelliteConfigs: SatelliteConfig[] = selectedSatellites.map(sat => ({
    name: sat.name,
    pkColumn: hashKey,
    ldtsColumn: 'dss_load_date'
  }));

  // Generate the PIT model SQL
  const pitSql = generatePITSql(
    pitName,
    selectedHub.name,
    hashKey,
    satelliteConfigs,
    useGeneratedDates,
    asOfDatesConfig,
    selectedHub.concept
  );

  // Ensure business_vault directory exists
  const businessVaultDir = path.join(projectPath, 'models', 'business_vault');
  if (!fs.existsSync(businessVaultDir)) {
    fs.mkdirSync(businessVaultDir, { recursive: true });
  }

  // Write PIT model file
  fs.writeFileSync(pitPath, pitSql, 'utf-8');
  log(`Created PIT table: models/business_vault/${pitName}.sql`);

  // Update schema YAML
  await updateBusinessVaultSchemaYaml(
    projectPath,
    pitName,
    selectedHub.name,
    selectedSatellites.map(s => s.name),
    hashKey,
    log
  );

  vscode.window.showInformationMessage(
    `PIT table ${pitName} created with ${selectedSatellites.length} satellites.`,
    'Open File', 'Run dbt'
  ).then(selection => {
    if (selection === 'Open File') {
      vscode.workspace.openTextDocument(pitPath).then(doc => 
        vscode.window.showTextDocument(doc)
      );
    } else if (selection === 'Run dbt') {
      vscode.commands.executeCommand('datavault.dbtRun');
    }
  });

  await refreshProject();
}

/**
 * Generate PIT table SQL using automate_dv macro
 */
function generatePITSql(
  pitName: string,
  hubName: string,
  hashKey: string,
  satellites: SatelliteConfig[],
  useGeneratedDates: boolean,
  asOfDatesModel: string | null,
  concept: string
): string {
  // Build satellites dictionary for automate_dv
  const satellitesDict = satellites.map(sat => {
    return `    "${sat.name}": {
        "pk": {
            "PK": "${sat.pkColumn}"
        },
        "ldts": {
            "LDTS": "${sat.ldtsColumn}"
        }
    }`;
  }).join(',\n');

  // Build stage_tables_ldts dictionary
  const stageTablesLdts = satellites.map(sat => {
    const stagingName = sat.name.replace(/^sat_/, `${concept}_`);
    return `    "${stagingName}": "dss_load_date"`;
  }).join(',\n');

  // Generate the as_of_dates_table config
  let asOfDatesConfig: string;
  if (useGeneratedDates) {
    // We'll use a CTE approach since automate_dv expects a table
    // Create an inline seed or reference for dates
    asOfDatesConfig = `"as_of_date_table"`;
  } else {
    asOfDatesConfig = `"${asOfDatesModel}"`;
  }

  let sql = `{{-
  PIT Table: ${pitName}
  Hub: ${hubName}
  Satellites: ${satellites.map(s => s.name).join(', ')}
  
  Point-in-Time table for efficient historical queries.
  Generated by Data Vault dbt Explorer.
-}}

{{ config(
    materialized='incremental',
    incremental_strategy='append',
    as_columnstore=false,
    schema='vault'
) }}

{%- set source_model = "${hubName}" -%}
{%- set src_pk = "${hashKey}" -%}
{%- set src_ldts = "dss_load_date" -%}

{%- set satellites = {
${satellitesDict}
} -%}

{%- set stage_tables_ldts = {
${stageTablesLdts}
} -%}

`;

  if (useGeneratedDates) {
    // Add CTE for generating as-of dates from satellites
    sql += `-- Generate as-of dates from satellite load dates
WITH as_of_date_table AS (
    SELECT DISTINCT CAST(dss_load_date AS DATE) AS AS_OF_DATE
    FROM (
${satellites.map(sat => `        SELECT dss_load_date FROM {{ ref('${sat.name}') }}`).join('\n        UNION\n')}
    ) all_dates
    WHERE dss_load_date IS NOT NULL
)

{{ automate_dv.pit(
    source_model=source_model,
    src_pk=src_pk,
    as_of_dates_table="as_of_date_table",
    satellites=satellites,
    stage_tables_ldts=stage_tables_ldts,
    src_ldts=src_ldts
) }}
`;
  } else {
    sql += `{{ automate_dv.pit(
    source_model=source_model,
    src_pk=src_pk,
    as_of_dates_table=${asOfDatesConfig},
    satellites=satellites,
    stage_tables_ldts=stage_tables_ldts,
    src_ldts=src_ldts
) }}
`;
  }

  return sql;
}

/**
 * Update business_vault schema YAML with the new PIT table
 */
async function updateBusinessVaultSchemaYaml(
  projectPath: string,
  pitName: string,
  hubName: string,
  satelliteNames: string[],
  hashKey: string,
  log: Logger
): Promise<void> {
  const schemaPath = path.join(projectPath, 'models', 'business_vault', '_business_vault__models.yml');

  // Build the new PIT definition
  const columns = [
    {
      name: hashKey,
      description: 'Hash Key from Hub',
      data_type: 'char(64)',
      tests: ['not_null']
    },
    {
      name: 'AS_OF_DATE',
      description: 'Point-in-time date',
      data_type: 'date',
      tests: ['not_null']
    },
    ...satelliteNames.flatMap(satName => [
      {
        name: `${satName}_PK`,
        description: `Hash Key reference to ${satName}`,
        data_type: 'char(64)'
      },
      {
        name: `${satName}_LDTS`,
        description: `Load date from ${satName}`,
        data_type: 'datetime2(7)'
      }
    ])
  ];

  const newPitDef = {
    name: pitName,
    description: `Point-in-Time table for ${hubName.replace('hub_', '')}. Hub: ${hubName}, Satellites: ${satelliteNames.join(', ')}`,
    columns
  };

  try {
    const yaml = await import('yaml');
    
    let schemaContent: { version: number; models: Array<{ name: string; [key: string]: unknown }> };
    
    if (fs.existsSync(schemaPath)) {
      const existingContent = fs.readFileSync(schemaPath, 'utf-8');
      schemaContent = yaml.parse(existingContent) || { version: 2, models: [] };
      
      // Remove existing definition if present
      schemaContent.models = (schemaContent.models || []).filter(
        m => m.name !== pitName
      );
    } else {
      schemaContent = { version: 2, models: [] };
    }

    // Add new definition
    schemaContent.models.push(newPitDef);

    // Sort models alphabetically
    schemaContent.models.sort((a, b) => a.name.localeCompare(b.name));

    // Write schema file
    const yamlContent = yaml.stringify(schemaContent, {
      indent: 2,
      lineWidth: 0
    });
    fs.writeFileSync(schemaPath, yamlContent, 'utf-8');
    log(`Updated schema file: models/business_vault/_business_vault__models.yml`);
  } catch (error) {
    log(`Warning: Could not update schema.yml: ${error}`);
  }
}

/**
 * Create PIT Table from command palette (without hub context)
 */
export async function createPITTableFromPalette(
  context: PITCommandContext
): Promise<void> {
  await createPITTable(undefined, context);
}
