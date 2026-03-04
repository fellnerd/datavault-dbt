/**
 * Bridge Table Commands
 * 
 * Commands for creating Bridge Tables using automate_dv bridge macro.
 * Bridge Tables span a Hub and one or more Links with their Effectivity Satellites.
 * 
 * automate_dv macro parameters:
 * - source_model: Hub model name
 * - src_pk: Hub's primary key (hash key)
 * - src_ldts: Hub's load date timestamp column
 * - as_of_dates_table: Table/model containing as-of dates
 * - bridge_walk: Dictionary of link relationships with eff_sat mappings
 * - stage_tables_ldts: Staging table load date columns
 * 
 * bridge_walk structure (per relationship):
 * - bridge_link_pk: Alias for link PK in bridge
 * - bridge_end_date: Alias for eff_sat end date
 * - bridge_load_date: Alias for eff_sat load date
 * - link_table: Link model name
 * - link_pk: Link's primary key column
 * - link_fk1, link_fk2: Link's foreign keys
 * - eff_sat_table: Effectivity satellite model name
 * - eff_sat_pk: Eff sat's primary key
 * - eff_sat_end_date: End date column in eff sat
 * - eff_sat_load_date: Load date column in eff sat
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TreeItemData, DbtModel, ProjectMetadata } from '../types';

type Logger = (message: string) => void;

interface BridgeCommandContext {
  projectPath: string | null;
  refreshProject: () => Promise<void>;
  getCurrentMetadata: () => ProjectMetadata | null;
  log: Logger;
}

interface BridgeWalkStep {
  stepName: string;           // e.g., "CUSTOMER_ORDER"
  link: DbtModel;             // The link model
  effSat: DbtModel | null;    // The effectivity satellite (optional)
  linkPk: string;             // Link's primary key column
  linkFk1: string;            // First foreign key
  linkFk2: string;            // Second foreign key
}

/**
 * Create a Bridge Table using automate_dv macro
 */
export async function createBridgeTable(
  treeItem: TreeItemData | undefined,
  context: BridgeCommandContext
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

  log('Creating Bridge Table...');

  // Get all hubs, links, and effectivity satellites
  const hubs = metadata.models.filter(m => m.type === 'hub');
  const links = metadata.models.filter(m => m.type === 'link');
  const effSats = metadata.models.filter(m => m.type === 'effectivity_satellite');

  if (hubs.length === 0) {
    vscode.window.showErrorMessage('No hubs found in the project. Create hubs first.');
    return;
  }

  if (links.length === 0) {
    vscode.window.showErrorMessage('No links found in the project. Create links first.');
    return;
  }

  // Step 1: Select starting Hub
  let selectedHub: DbtModel | undefined;
  
  if (treeItem?.model?.type === 'hub') {
    selectedHub = treeItem.model;
  } else {
    const hubItems = hubs.map(hub => ({
      label: hub.name,
      description: hub.concept,
      detail: `Columns: ${hub.columns.map(c => c.name).slice(0, 4).join(', ')}...`,
      hub
    }));

    const selectedHubItem = await vscode.window.showQuickPick(hubItems, {
      title: 'Step 1: Select Starting Hub',
      placeHolder: 'Select the hub that will be the starting point of the bridge'
    });

    if (!selectedHubItem) {
      return; // Cancelled
    }
    selectedHub = selectedHubItem.hub;
  }

  log(`Selected hub: ${selectedHub.name}`);
  const entityName = selectedHub.name.replace(/^hub_/, '');
  const hashKey = `hk_${entityName}`;

  // Step 2: Select Links to include in the bridge walk
  // Find links that connect to this hub
  const relatedLinks = links.filter(link => {
    // Check if any column references this hub's hash key
    return link.columns.some(col => 
      col.name.toLowerCase().includes(hashKey.toLowerCase()) ||
      col.name.toLowerCase().includes(`${entityName}_fk`)
    ) || link.refs?.includes(selectedHub!.name);
  });

  if (relatedLinks.length === 0) {
    // If no direct matches, show all links
    vscode.window.showWarningMessage(
      `No links directly connected to ${selectedHub.name} found. Showing all links.`
    );
  }

  const linksToShow = relatedLinks.length > 0 ? relatedLinks : links;

  const linkItems = linksToShow.map(link => ({
    label: link.name,
    description: link.concept,
    detail: `Refs: ${link.refs?.join(', ') || 'none'}`,
    picked: relatedLinks.includes(link),
    link
  }));

  const selectedLinkItems = await vscode.window.showQuickPick(linkItems, {
    title: 'Step 2: Select Links for Bridge Walk',
    placeHolder: 'Select the links to include in the bridge (in order of traversal)',
    canPickMany: true
  });

  if (!selectedLinkItems || selectedLinkItems.length === 0) {
    vscode.window.showWarningMessage('At least one link is required for a bridge');
    return;
  }

  const selectedLinks = selectedLinkItems.map(item => item.link);
  log(`Selected links: ${selectedLinks.map(l => l.name).join(', ')}`);

  // Step 3: For each link, find or select the corresponding effectivity satellite
  const bridgeWalkSteps: BridgeWalkStep[] = [];

  for (const link of selectedLinks) {
    // Find effectivity satellites for this link
    const linkEffSats = effSats.filter(sat => {
      const satName = sat.name.toLowerCase();
      const linkName = link.name.toLowerCase().replace('link_', '');
      return satName.includes(linkName) || 
             satName.includes(`eff_sat_${linkName}`) ||
             sat.refs?.includes(link.name);
    });

    let selectedEffSat: DbtModel | null = null;

    if (linkEffSats.length === 1) {
      selectedEffSat = linkEffSats[0];
      log(`Auto-matched effectivity satellite: ${selectedEffSat.name} for ${link.name}`);
    } else if (linkEffSats.length > 1) {
      // Let user choose
      const effSatItems = linkEffSats.map(sat => ({
        label: sat.name,
        description: sat.concept,
        sat
      }));

      const selectedEffSatItem = await vscode.window.showQuickPick(effSatItems, {
        title: `Select Effectivity Satellite for ${link.name}`,
        placeHolder: `Choose the effectivity satellite for link ${link.name}`
      });

      if (selectedEffSatItem) {
        selectedEffSat = selectedEffSatItem.sat;
      }
    } else {
      // No effectivity satellite found - warn but continue
      const proceed = await vscode.window.showWarningMessage(
        `No effectivity satellite found for ${link.name}. Bridge tables typically require eff_sats.`,
        'Continue without', 'Cancel'
      );
      if (proceed !== 'Continue without') {
        return;
      }
    }

    // Determine link columns
    const linkPk = link.columns.find(c => 
      c.name.toLowerCase().startsWith('hk_') && c.name.toLowerCase().includes('link')
    )?.name || `hk_link_${link.name.replace('link_', '')}`;

    // Find FK columns (columns that start with hk_ but aren't the link's own PK)
    const fkColumns = link.columns.filter(c => 
      c.name.toLowerCase().startsWith('hk_') && c.name.toLowerCase() !== linkPk.toLowerCase()
    );

    // Warn if no FK columns found
    if (fkColumns.length < 2) {
      log(`Warning: Link ${link.name} has less than 2 FK columns detected. Using inferred names.`);
    }

    // Use detected FK columns or infer from link name
    const linkNameParts = link.name.replace('link_', '').split('_');
    const linkFk1 = fkColumns[0]?.name || (linkNameParts[0] ? `hk_${linkNameParts[0]}` : 'hk_fk1');
    const linkFk2 = fkColumns[1]?.name || (linkNameParts[1] ? `hk_${linkNameParts[1]}` : 'hk_fk2');

    // Create step name from link name
    const stepName = link.name.replace('link_', '').toUpperCase();

    bridgeWalkSteps.push({
      stepName,
      link,
      effSat: selectedEffSat,
      linkPk,
      linkFk1,
      linkFk2
    });
  }

  // Step 4: Configure as-of-dates source
  const asOfDateOption = await vscode.window.showQuickPick(
    [
      {
        label: '$(calendar) Generate from Links/Eff Sats',
        description: 'Create CTE with distinct dates from link/eff sat load dates',
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
      title: 'Step 4: As-of Dates Source',
      placeHolder: 'How should as-of dates be determined?'
    }
  );

  if (!asOfDateOption) {
    return; // Cancelled
  }

  let asOfDatesConfig: string | null = null;
  let useGeneratedDates = true;

  if (asOfDateOption.value === 'model') {
    const allModels = metadata.models.filter(m => 
      m.type !== 'hub' && m.type !== 'satellite' && m.type !== 'link'
    );
    
    const modelItems = allModels.map(m => ({
      label: m.name,
      description: m.type,
      detail: `Schema: ${m.schema}`,
      model: m.name
    }));

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

  // Step 5: Confirm Bridge table name
  const defaultBridgeName = `bridge_${selectedLinks.map(l => l.name.replace('link_', '')).join('_')}`;
  const bridgeName = await vscode.window.showInputBox({
    title: 'Step 5: Bridge Table Name',
    prompt: 'Enter the Bridge table name',
    value: defaultBridgeName,
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Name is required';
      }
      if (!/^bridge_[a-z][a-z0-9_]*$/i.test(value)) {
        return 'Must start with bridge_ followed by snake_case';
      }
      return null;
    }
  });

  if (!bridgeName) {
    return; // Cancelled
  }

  // Check if Bridge already exists
  const bridgePath = path.join(projectPath, 'models', 'business_vault', `${bridgeName}.sql`);
  if (fs.existsSync(bridgePath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Bridge table ${bridgeName}.sql already exists. Overwrite?`,
      'Yes', 'No'
    );
    if (overwrite !== 'Yes') {
      return;
    }
  }

  // Generate the Bridge model SQL
  const bridgeSql = generateBridgeSql(
    bridgeName,
    selectedHub,
    hashKey,
    bridgeWalkSteps,
    useGeneratedDates,
    asOfDatesConfig
  );

  // Ensure business_vault directory exists
  const businessVaultDir = path.join(projectPath, 'models', 'business_vault');
  if (!fs.existsSync(businessVaultDir)) {
    fs.mkdirSync(businessVaultDir, { recursive: true });
  }

  // Write Bridge model file
  fs.writeFileSync(bridgePath, bridgeSql, 'utf-8');
  log(`Created Bridge table: models/business_vault/${bridgeName}.sql`);

  // Update schema YAML
  await updateBusinessVaultSchemaYaml(
    projectPath,
    bridgeName,
    selectedHub.name,
    bridgeWalkSteps,
    hashKey,
    log
  );

  vscode.window.showInformationMessage(
    `Bridge table ${bridgeName} created with ${bridgeWalkSteps.length} link relationship(s).`,
    'Open File', 'Run dbt'
  ).then(selection => {
    if (selection === 'Open File') {
      vscode.workspace.openTextDocument(bridgePath).then(doc => 
        vscode.window.showTextDocument(doc)
      );
    } else if (selection === 'Run dbt') {
      vscode.commands.executeCommand('datavault.dbtRun');
    }
  });

  await refreshProject();
}

/**
 * Generate Bridge table SQL using automate_dv macro
 */
function generateBridgeSql(
  bridgeName: string,
  hub: DbtModel,
  hashKey: string,
  bridgeWalkSteps: BridgeWalkStep[],
  useGeneratedDates: boolean,
  asOfDatesModel: string | null
): string {
  // Build bridge_walk YAML
  const bridgeWalkYaml = bridgeWalkSteps.map(step => {
    const linkName = step.link.name;
    const effSatName = step.effSat?.name || `eff_sat_${step.link.name.replace('link_', '')}`;
    
    return `  ${step.stepName}:
    bridge_link_pk: ${linkName.toUpperCase()}_PK
    bridge_end_date: ${effSatName.toUpperCase()}_ENDDATE
    bridge_load_date: ${effSatName.toUpperCase()}_LOADDATE
    link_table: ${linkName}
    link_pk: ${step.linkPk}
    link_fk1: ${step.linkFk1}
    link_fk2: ${step.linkFk2}
    eff_sat_table: ${effSatName}
    eff_sat_pk: ${step.linkPk}
    eff_sat_end_date: END_DATE
    eff_sat_load_date: dss_load_date`;
  }).join('\n');

  // Build stage_tables_ldts YAML
  const stageTablesLdts = bridgeWalkSteps.map(step => {
    const stagingName = step.link.concept 
      ? `${step.link.concept}_${step.link.name.replace('link_', '')}`
      : step.link.name.replace('link_', '');
    return `  ${stagingName}: dss_load_date`;
  }).join('\n');

  let sql = `{{-
  Bridge Table: ${bridgeName}
  Hub: ${hub.name}
  Links: ${bridgeWalkSteps.map(s => s.link.name).join(', ')}
  
  Bridge table spanning the hub and associated links with effectivity satellites.
  Generated by Data Vault dbt Explorer.
-}}

{{ config(
    materialized='incremental',
    incremental_strategy='append',
    as_columnstore=false,
    schema='vault'
) }}

{%- set yaml_metadata -%}
source_model: ${hub.name}
src_pk: ${hashKey}
src_ldts: dss_load_date
`;

  if (useGeneratedDates) {
    sql += `as_of_dates_table: as_of_date_table
`;
  } else {
    sql += `as_of_dates_table: ${asOfDatesModel}
`;
  }

  sql += `bridge_walk:
${bridgeWalkYaml}
stage_tables_ldts:
${stageTablesLdts}
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{% set source_model = metadata_dict["source_model"] %}
{% set src_pk = metadata_dict["src_pk"] %}
{% set src_ldts = metadata_dict["src_ldts"] %}
{% set as_of_dates_table = metadata_dict["as_of_dates_table"] %}
{% set bridge_walk = metadata_dict["bridge_walk"] %}
{% set stage_tables_ldts = metadata_dict["stage_tables_ldts"] %}

`;

  if (useGeneratedDates) {
    // Add CTE for generating as-of dates
    const dateUnions = bridgeWalkSteps.map(step => 
      step.effSat 
        ? `SELECT dss_load_date FROM {{ ref('${step.effSat.name}') }}`
        : `SELECT dss_load_date FROM {{ ref('${step.link.name}') }}`
    ).join('\n    UNION\n    ');

    sql += `-- Generate as-of dates from link/eff_sat load dates
WITH as_of_date_table AS (
    SELECT DISTINCT CAST(dss_load_date AS DATE) AS AS_OF_DATE
    FROM (
    ${dateUnions}
    ) all_dates
    WHERE dss_load_date IS NOT NULL
)

`;
  }

  sql += `{{ automate_dv.bridge(
    source_model=source_model,
    src_pk=src_pk,
    src_ldts=src_ldts,
    bridge_walk=bridge_walk,
    as_of_dates_table=as_of_dates_table,
    stage_tables_ldts=stage_tables_ldts
) }}
`;

  return sql;
}

/**
 * Update business_vault schema YAML with the new Bridge table
 */
async function updateBusinessVaultSchemaYaml(
  projectPath: string,
  bridgeName: string,
  hubName: string,
  bridgeWalkSteps: BridgeWalkStep[],
  hashKey: string,
  log: Logger
): Promise<void> {
  const schemaPath = path.join(projectPath, 'models', 'business_vault', '_business_vault__models.yml');

  // Build column definitions
  const columns = [
    {
      name: hashKey,
      description: 'Hash Key from starting Hub',
      data_type: 'char(64)',
      tests: ['not_null']
    },
    {
      name: 'AS_OF_DATE',
      description: 'Point-in-time date',
      data_type: 'date',
      tests: ['not_null']
    },
    ...bridgeWalkSteps.map(step => ({
      name: `${step.link.name.toUpperCase()}_PK`,
      description: `Hash Key reference to ${step.link.name}`,
      data_type: 'char(64)'
    }))
  ];

  const newBridgeDef = {
    name: bridgeName,
    description: `Bridge table spanning ${hubName} through ${bridgeWalkSteps.map(s => s.link.name).join(', ')}`,
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
        m => m.name !== bridgeName
      );
    } else {
      schemaContent = { version: 2, models: [] };
    }

    // Add new definition
    schemaContent.models.push(newBridgeDef);

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
 * Create Bridge Table from command palette (without hub context)
 */
export async function createBridgeTableFromPalette(
  context: BridgeCommandContext
): Promise<void> {
  await createBridgeTable(undefined, context);
}
