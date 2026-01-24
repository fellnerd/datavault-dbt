/**
 * Staging Commands
 * 
 * Commands for creating and validating staging views.
 * 
 * Data Vault 2.0 Standard:
 * - Staging views contain ONLY the entity's own hash key (hk_<entity>)
 * - FK hash keys are calculated in Link models, not in staging
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { TreeItemData, ExternalTable, StagingConfig, DbtModel } from '../types';
import {
  generateStagingSql,
  parseExternalTableName,
  getDefaultStagingConfig
} from '../services/stagingGenerator';
import { validateStagingConfig, validateStagingSql } from '../services/stagingValidator';
import { updateStagingSchemaYaml, stagingModelExists, removeFromStagingSchemaYaml } from '../services/schemaGenerator';

const execAsync = promisify(exec);

type Logger = (message: string) => void;

interface StagingCommandContext {
  projectPath: string | null;
  refreshProject: () => Promise<void>;
  log: Logger;
}

/**
 * Get staging settings from VS Code configuration
 */
function getStagingSettings(): {
  businessKeySeparator: string;
  hashDiffSeparator: string;
  nullPlaceholder: string;
} {
  const config = vscode.workspace.getConfiguration('datavault.staging');
  return {
    businessKeySeparator: config.get('businessKeySeparator', '^^'),
    hashDiffSeparator: config.get('hashDiffSeparator', '||'),
    nullPlaceholder: config.get('nullPlaceholder', '')
  };
}

/**
 * Create a new staging view from an external table
 */
export async function createStaging(
  treeItem: TreeItemData | undefined,
  context: StagingCommandContext
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

  log(`Creating staging view for: ${externalTable.name}`);

  const settings = getStagingSettings();
  const columns = externalTable.columns.map(c => c.name);

  // Get default config based on external table
  const defaultConfig = getDefaultStagingConfig(externalTable.name, columns, settings);

  if (!defaultConfig.concept || !defaultConfig.entityName) {
    vscode.window.showErrorMessage(`Could not parse external table name: ${externalTable.name}`);
    return;
  }

  // Check if staging already exists
  if (stagingModelExists(projectPath, defaultConfig.concept, defaultConfig.entityName)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Staging model ${defaultConfig.concept}_${defaultConfig.entityName} already exists. Overwrite?`,
      'Yes', 'No'
    );
    if (overwrite !== 'Yes') {
      return;
    }
  }

  // Step 1: Confirm entity name and concept
  const entityName = await vscode.window.showInputBox({
    title: 'Entity Name',
    prompt: 'Enter the entity name for the staging view',
    value: defaultConfig.entityName,
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

  const concept = await vscode.window.showInputBox({
    title: 'Concept Name',
    prompt: 'Enter the concept/source system name',
    value: defaultConfig.concept,
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Concept name is required';
      }
      return null;
    }
  });

  if (!concept) {
    return; // Cancelled
  }

  // Step 2: Select business key columns
  // Note: Business keys can be empty for Pure Dependent Child entities
  // that are identified only by their relationship to a parent hub
  const bkItems: vscode.QuickPickItem[] = columns.map(col => ({
    label: col,
    picked: false  // No auto-detect - let user explicitly select
  }));

  const selectedBks = await vscode.window.showQuickPick(bkItems, {
    title: 'Step 2: Select Business Key Column(s)',
    placeHolder: 'Select columns that uniquely identify records (leave empty for Pure Dependent Child)',
    canPickMany: true
  });

  if (!selectedBks) {
    return; // Cancelled (ESC pressed)
  }

  // Allow empty business keys for Pure Dependent Child entities
  const businessKeyColumns = selectedBks.map(item => item.label);
  // Note: Empty BK is valid for Pure DC entities - no warning needed, 
  // user will configure Link relationship in Entity Designer

  // Step 3: Select payload columns (which columns to include in the view)
  // Filter out ALL dss_* metadata columns
  const availablePayloadColumns = columns
    .filter(col => !col.toLowerCase().startsWith('dss_')) // Exclude ALL dss_* columns
    .filter(col => !businessKeyColumns.includes(col)); // Exclude BK columns

  // Debug: Check if we have payload columns
  if (availablePayloadColumns.length === 0) {
    vscode.window.showErrorMessage(`No payload columns available! Total columns: ${columns.length}, dss columns filtered out.`);
    return;
  }

  const payloadItems: vscode.QuickPickItem[] = availablePayloadColumns.map(col => ({
    label: col,
    picked: true // Default all selected
  }));

  const selectedPayload = await vscode.window.showQuickPick(payloadItems, {
    title: 'Step 3: Select Payload Columns',
    placeHolder: 'Select columns to include in the staging view (unselect to exclude)',
    canPickMany: true
  });

  if (!selectedPayload) {
    return; // Cancelled
  }

  const payloadColumns = selectedPayload.map(item => item.label);

  // Step 4: Select hash diff columns (subset of payload for change detection)
  const hashDiffItems: vscode.QuickPickItem[] = payloadColumns.map(col => ({
    label: col,
    picked: true // Default all payload columns in hash diff
  }));

  const selectedHashDiff = await vscode.window.showQuickPick(hashDiffItems, {
    title: 'Step 4: Select Hash Diff Columns',
    placeHolder: 'Select columns for change detection (subset of payload)',
    canPickMany: true
  });

  if (!selectedHashDiff) {
    return; // Cancelled
  }

  const hashDiffColumns = selectedHashDiff.map(item => item.label);

  // Note: DC Satellite and Multi-Active Satellite configuration is handled in the Entity Designer,
  // not in the staging workflow. The staging view only provides:
  // - hk_<entity> (hash key for the entity's own business key)
  // - hd_<entity> (hash diff for change detection)
  // - Payload columns
  // 
  // Link models calculate their own hk_link_* hashes, including any DCK columns.
  // DC Satellites reference the Link hash, not a staging hash.
  
  const stagingConfig: StagingConfig = {
    concept,
    entityName,
    externalTable: externalTable.name,
    businessKeyColumns,
    businessKeySeparator: settings.businessKeySeparator,
    payloadColumns,
    hashDiffColumns,
    hashDiffSeparator: settings.hashDiffSeparator,
    foreignKeys: [], // Empty - FK relationships defined in Link models
    recordSourceDefault: concept,
    includeRunId: columns.some(c => c.toLowerCase() === 'dss_run_id')
    // Note: dependentChildKeys and multiActiveKeys are configured in Entity Designer
  };

  // Validate config
  const validation = validateStagingConfig(stagingConfig);
  
  if (!validation.isValid) {
    vscode.window.showErrorMessage(`Validation failed: ${validation.errors.join(', ')}`);
    return;
  }

  if (validation.warnings.length > 0) {
    log(`Warnings: ${validation.warnings.join(', ')}`);
  }

  // Generate SQL
  const sql = generateStagingSql(stagingConfig);

  // Write SQL file
  const stagingDir = path.join(projectPath, 'models', 'staging');
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true });
  }

  const sqlFilePath = path.join(stagingDir, `${concept}_${entityName}.sql`);
  fs.writeFileSync(sqlFilePath, sql, 'utf-8');
  log(`Created staging SQL: ${sqlFilePath}`);

  // Update schema YAML
  const schemaResult = await updateStagingSchemaYaml(projectPath, stagingConfig);
  if (schemaResult.success) {
    log(`Updated schema YAML: ${schemaResult.filePath}`);
  } else {
    log(`Warning: Could not update schema YAML: ${schemaResult.error}`);
  }

  // Open the created file
  const document = await vscode.workspace.openTextDocument(sqlFilePath);
  await vscode.window.showTextDocument(document);

  vscode.window.showInformationMessage(
    `Created staging view: ${concept}_${entityName}`,
    'Refresh'
  ).then(action => {
    if (action === 'Refresh') {
      refreshProject();
    }
  });

  await refreshProject();
}

/**
 * Validate a staging model using dbt compile
 */
export async function validateStaging(
  treeItem: TreeItemData | undefined,
  context: StagingCommandContext
): Promise<void> {
  const { projectPath, log } = context;

  const model: DbtModel | undefined = treeItem?.model;
  if (!model || model.layer !== 'staging') {
    vscode.window.showErrorMessage('Please select a staging model');
    return;
  }

  if (!projectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }

  log(`Validating staging model with dbt compile: ${model.name}`);

  // Show progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Validating ${model.name}...`,
      cancellable: false
    },
    async (progress) => {
      try {
        // Get dbt path from settings or use default
        const config = vscode.workspace.getConfiguration('datavault');
        let dbtPath = config.get<string>('dbtPath', '');
        
        if (!dbtPath) {
          // Try to find dbt in .venv
          const venvDbt = path.join(projectPath, '.venv', 'Scripts', 'dbt.exe');
          const venvDbtUnix = path.join(projectPath, '.venv', 'bin', 'dbt');
          
          if (fs.existsSync(venvDbt)) {
            dbtPath = venvDbt;
          } else if (fs.existsSync(venvDbtUnix)) {
            dbtPath = venvDbtUnix;
          } else {
            dbtPath = 'dbt'; // Assume it's in PATH
          }
        }

        progress.report({ message: 'Running dbt compile...' });

        // Run dbt compile for this specific model
        const command = `"${dbtPath}" compile --select ${model.name}`;
        
        const { stdout, stderr } = await execAsync(command, {
          cwd: projectPath,
          timeout: 60000 // 60 second timeout
        });

        // Parse output
        const output = stdout + stderr;
        
        // Check for errors
        if (output.includes('Compilation Error') || output.includes('ERROR')) {
          // Extract error message
          const errorMatch = output.match(/Compilation Error[^\n]*\n([\s\S]*?)(?=\n\n|\nDone\.)/i);
          const errorMessage = errorMatch ? errorMatch[1].trim() : 'Unknown compilation error';
          
          vscode.window.showErrorMessage(
            `❌ ${model.name} compilation failed`,
            'Show Details'
          ).then(action => {
            if (action === 'Show Details') {
              showValidationOutput(model.name, output, 'error');
            }
          });
          return;
        }

        // Check for warnings
        if (output.includes('WARNING') || output.includes('Warning')) {
          vscode.window.showWarningMessage(
            `⚠️ ${model.name} compiled with warnings`,
            'Show Details'
          ).then(action => {
            if (action === 'Show Details') {
              showValidationOutput(model.name, output, 'warning');
            }
          });
          return;
        }

        // Success - also run pattern validation
        const sqlContent = fs.readFileSync(model.filePath, 'utf-8');
        const patternValidation = validateStagingSql(sqlContent);

        if (patternValidation.warnings.length > 0) {
          const items: vscode.QuickPickItem[] = [
            { label: '✅ dbt compile', description: 'Successful - no syntax errors' },
            { label: '', description: '', kind: vscode.QuickPickItemKind.Separator },
            ...patternValidation.warnings.map(w => ({ label: '⚠️', description: w }))
          ];

          await vscode.window.showQuickPick(items, {
            title: `Validation Results: ${model.name}`,
            placeHolder: 'dbt compile OK, but some Data Vault best practice warnings'
          });
        } else {
          vscode.window.showInformationMessage(
            `✅ ${model.name} - dbt compile successful, follows Data Vault best practices`
          );
        }

      } catch (error: any) {
        // Handle execution errors
        const errorMessage = error.stderr || error.message || String(error);
        
        log(`Validation error: ${errorMessage}`);
        
        vscode.window.showErrorMessage(
          `❌ Failed to validate ${model.name}`,
          'Show Details'
        ).then(action => {
          if (action === 'Show Details') {
            showValidationOutput(model.name, errorMessage, 'error');
          }
        });
      }
    }
  );
}

/**
 * Show validation output in an output channel
 */
function showValidationOutput(modelName: string, output: string, type: 'error' | 'warning' | 'info'): void {
  const outputChannel = vscode.window.createOutputChannel('Data Vault Validation');
  outputChannel.clear();
  outputChannel.appendLine(`=== Validation Results: ${modelName} ===`);
  outputChannel.appendLine(`Type: ${type.toUpperCase()}`);
  outputChannel.appendLine(`Time: ${new Date().toISOString()}`);
  outputChannel.appendLine('');
  outputChannel.appendLine(output);
  outputChannel.show();
}

/**
 * Delete a staging model (SQL file + YAML entry)
 */
export async function deleteStaging(
  treeItem: TreeItemData | undefined,
  context: StagingCommandContext
): Promise<void> {
  const { projectPath, refreshProject, log } = context;

  const model: DbtModel | undefined = treeItem?.model;
  if (!model || model.layer !== 'staging') {
    vscode.window.showErrorMessage('Please select a staging model to delete');
    return;
  }

  if (!projectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }

  // Confirm deletion
  const confirmation = await vscode.window.showWarningMessage(
    `Are you sure you want to delete the staging model "${model.name}"?\n\nThis will delete:\n• ${path.basename(model.filePath)}\n• Entry in _staging__models.yml`,
    { modal: true },
    'Delete',
    'Cancel'
  );

  if (confirmation !== 'Delete') {
    return;
  }

  log(`Deleting staging model: ${model.name}`);

  try {
    // 1. Delete SQL file
    if (fs.existsSync(model.filePath)) {
      fs.unlinkSync(model.filePath);
      log(`Deleted SQL file: ${model.filePath}`);
    }

    // 2. Remove from _staging__models.yml
    const schemaResult = await removeFromStagingSchemaYaml(projectPath, model.name);
    if (schemaResult.success) {
      log(`Removed from schema YAML: ${model.name}`);
    } else {
      log(`Warning: Could not update schema YAML: ${schemaResult.error}`);
    }

    // 3. Delete designer config JSON if it exists
    const configDir = path.join(projectPath, '.datavault', 'entity-configs');
    // Model name is usually concept_entity, try to find matching config
    const possibleConfigFiles = fs.existsSync(configDir)
      ? fs.readdirSync(configDir).filter(f => f.endsWith('.json'))
      : [];
    
    for (const configFile of possibleConfigFiles) {
      const configPath = path.join(configDir, configFile);
      try {
        const configContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const configModelName = `${configContent.concept}_${configContent.entityName}`;
        if (configModelName === model.name) {
          fs.unlinkSync(configPath);
          log(`Deleted designer config: ${configFile}`);
          break;
        }
      } catch {
        // Skip if can't parse
      }
    }

    vscode.window.showInformationMessage(`Deleted staging model: ${model.name}`);
    await refreshProject();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error deleting staging model: ${errorMessage}`);
    vscode.window.showErrorMessage(`Failed to delete staging model: ${errorMessage}`);
  }
}
