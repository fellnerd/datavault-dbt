/**
 * Vault Delete Commands
 * 
 * Commands for deleting Raw Vault and Business Vault models.
 * Handles dependencies between Hubs, Satellites, and Links.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { TreeItemData, DbtModel, ProjectMetadata } from '../types';

type Logger = (message: string) => void;

interface VaultDeleteContext {
  projectPath: string | null;
  refreshProject: () => Promise<void>;
  getCurrentMetadata: () => ProjectMetadata | null;
  log: Logger;
}

/**
 * Find all models that depend on a given model
 */
function findDependentModels(
  modelName: string,
  modelType: 'hub' | 'sat' | 'link' | 'pit' | 'bridge' | 'ref',
  metadata: ProjectMetadata
): DbtModel[] {
  const dependents: DbtModel[] = [];
  
  // Collect all vault models from metadata
  const allModels: DbtModel[] = [
    ...metadata.models.filter(m => m.layer === 'raw_vault'),
    ...metadata.models.filter(m => m.layer === 'business_vault'),
  ];

  if (modelType === 'hub') {
    // Hub deletions affect:
    // 1. Satellites that reference this hub (sat_<entity> where hub_<entity> exists)
    // 2. Links that reference this hub
    const entityName = modelName.replace(/^hub_/, '');
    
    for (const model of allModels) {
      // Check satellites
      if (model.name.startsWith('sat_') && model.name.includes(entityName)) {
        // Read the file to confirm it references this hub
        if (fs.existsSync(model.filePath)) {
          const content = fs.readFileSync(model.filePath, 'utf-8');
          if (content.includes(`hk_${entityName}`) || content.includes(modelName)) {
            dependents.push(model);
          }
        }
      }
      
      // Check links
      if (model.name.startsWith('link_')) {
        if (fs.existsSync(model.filePath)) {
          const content = fs.readFileSync(model.filePath, 'utf-8');
          if (content.includes(`hk_${entityName}`) || content.includes(modelName)) {
            dependents.push(model);
          }
        }
      }
      
      // Check PITs
      if (model.name.startsWith('pit_') && model.name.includes(entityName)) {
        dependents.push(model);
      }
    }
  } else if (modelType === 'link') {
    // Link deletions affect:
    // 1. DC Satellites that hang on this link
    const linkName = modelName.replace(/^link_/, '');
    
    for (const model of allModels) {
      if (model.name.startsWith('sat_') && model.name.includes('_dc')) {
        if (fs.existsSync(model.filePath)) {
          const content = fs.readFileSync(model.filePath, 'utf-8');
          if (content.includes(`hk_link_${linkName}`) || content.includes(modelName)) {
            dependents.push(model);
          }
        }
      }
    }
  }

  return dependents;
}

/**
 * Remove a model from its schema YAML file
 */
async function removeFromSchemaYaml(
  projectPath: string,
  model: DbtModel
): Promise<{ success: boolean; error?: string }> {
  // Determine schema file path based on model location
  const modelDir = path.dirname(model.filePath);
  
  // Find the _<concept>__models.yml file
  const possibleSchemaFiles = [
    // Raw Vault: models/raw_vault/<concept>/_<concept>__models.yml
    path.join(modelDir, '..', `_${model.concept || 'models'}__models.yml`),
    // Also check parent directory
    path.join(modelDir, `_${model.concept || 'models'}__models.yml`),
    // Business Vault: models/business_vault/_business_vault__models.yml
    path.join(modelDir, '_business_vault__models.yml'),
    path.join(modelDir, '..', '_business_vault__models.yml'),
  ];

  for (const schemaPath of possibleSchemaFiles) {
    if (fs.existsSync(schemaPath)) {
      try {
        const content = fs.readFileSync(schemaPath, 'utf-8');
        const parsed = YAML.parse(content);
        
        if (!parsed?.models || !Array.isArray(parsed.models)) {
          continue;
        }

        const initialLength = parsed.models.length;
        parsed.models = parsed.models.filter((m: { name: string }) => m.name !== model.name);
        
        if (parsed.models.length < initialLength) {
          // Model was found and removed
          const doc = new YAML.Document(parsed);
          const yamlContent = doc.toString({
            indent: 2,
            lineWidth: 0,
            singleQuote: false
          });
          fs.writeFileSync(schemaPath, yamlContent, 'utf-8');
          return { success: true };
        }
      } catch (error) {
        // Continue to next possible file
      }
    }
  }

  return { success: true }; // Model not found in any schema file is OK
}

/**
 * Delete entity designer config JSON if it exists
 */
function deleteDesignerConfig(projectPath: string, modelName: string, concept?: string): void {
  const configDirs = [
    path.join(projectPath, '.vscode', 'entity-designer'),
    path.join(projectPath, '.datavault', 'entity-configs'),
  ];

  for (const configDir of configDirs) {
    if (!fs.existsSync(configDir)) continue;
    
    const files = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const configPath = path.join(configDir, file);
      try {
        const configContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const configModelName = `${configContent.concept}_${configContent.entityName}`;
        // Check if this config relates to the model being deleted
        const entityName = modelName.replace(/^(hub_|sat_|link_|pit_|bridge_|ref_)/, '');
        if (configModelName.includes(entityName) || file.includes(entityName)) {
          fs.unlinkSync(configPath);
        }
      } catch {
        // Skip if can't parse
      }
    }
  }
}

/**
 * Delete a Raw Vault model (Hub, Satellite, Link)
 * Handles dependencies: deleting a Hub will also delete its Satellites and Links
 */
export async function deleteRawVaultModel(
  treeItem: TreeItemData | undefined,
  context: VaultDeleteContext
): Promise<void> {
  const { projectPath, refreshProject, getCurrentMetadata, log } = context;

  const model: DbtModel | undefined = treeItem?.model;
  if (!model || model.layer !== 'raw_vault') {
    vscode.window.showErrorMessage('Please select a Raw Vault model to delete');
    return;
  }

  if (!projectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }

  const metadata = getCurrentMetadata();
  if (!metadata) {
    vscode.window.showErrorMessage('Project metadata not loaded');
    return;
  }

  // Determine model type
  let modelType: 'hub' | 'sat' | 'link' | 'ref' = 'sat';
  if (model.name.startsWith('hub_')) modelType = 'hub';
  else if (model.name.startsWith('link_')) modelType = 'link';
  else if (model.name.startsWith('ref_')) modelType = 'ref';

  // Find dependent models
  const dependents = findDependentModels(model.name, modelType, metadata);

  // Build confirmation message
  let confirmMessage = `Are you sure you want to delete "${model.name}"?`;
  let deleteItems = [`• ${path.basename(model.filePath)}`];

  if (dependents.length > 0) {
    confirmMessage += `\n\n⚠️ This will also delete ${dependents.length} dependent model(s):`;
    for (const dep of dependents) {
      deleteItems.push(`• ${dep.name} (${dep.type})`);
    }
  }

  confirmMessage += `\n\nFiles to delete:\n${deleteItems.join('\n')}`;

  const confirmation = await vscode.window.showWarningMessage(
    confirmMessage,
    { modal: true },
    'Delete All'
  );

  if (confirmation !== 'Delete All') {
    return;
  }

  log(`Deleting Raw Vault model: ${model.name}`);

  try {
    // Delete dependent models first
    for (const dep of dependents) {
      if (fs.existsSync(dep.filePath)) {
        fs.unlinkSync(dep.filePath);
        log(`Deleted dependent: ${dep.filePath}`);
      }
      await removeFromSchemaYaml(projectPath, dep);
    }

    // Delete the main model
    if (fs.existsSync(model.filePath)) {
      fs.unlinkSync(model.filePath);
      log(`Deleted SQL file: ${model.filePath}`);
    }

    // Remove from schema YAML
    const schemaResult = await removeFromSchemaYaml(projectPath, model);
    if (schemaResult.success) {
      log(`Removed from schema YAML: ${model.name}`);
    } else {
      log(`Warning: Could not update schema YAML: ${schemaResult.error}`);
    }

    // Delete designer config if exists
    deleteDesignerConfig(projectPath, model.name, model.concept);

    const totalDeleted = 1 + dependents.length;
    vscode.window.showInformationMessage(
      `Deleted ${totalDeleted} model(s): ${model.name}${dependents.length > 0 ? ` + ${dependents.length} dependents` : ''}`
    );
    
    await refreshProject();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error deleting Raw Vault model: ${errorMessage}`);
    vscode.window.showErrorMessage(`Failed to delete model: ${errorMessage}`);
  }
}

/**
 * Delete a Business Vault model (PIT, Bridge)
 */
export async function deleteBusinessVaultModel(
  treeItem: TreeItemData | undefined,
  context: VaultDeleteContext
): Promise<void> {
  const { projectPath, refreshProject, log } = context;

  const model: DbtModel | undefined = treeItem?.model;
  if (!model || model.layer !== 'business_vault') {
    vscode.window.showErrorMessage('Please select a Business Vault model to delete');
    return;
  }

  if (!projectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }

  // Determine model type for display
  let modelTypeDisplay = 'model';
  if (model.name.startsWith('pit_')) modelTypeDisplay = 'PIT table';
  else if (model.name.startsWith('bridge_')) modelTypeDisplay = 'Bridge table';

  const confirmation = await vscode.window.showWarningMessage(
    `Are you sure you want to delete the ${modelTypeDisplay} "${model.name}"?\n\nThis will delete:\n• ${path.basename(model.filePath)}`,
    { modal: true },
    'Delete'
  );

  if (confirmation !== 'Delete') {
    return;
  }

  log(`Deleting Business Vault model: ${model.name}`);

  try {
    // Delete SQL file
    if (fs.existsSync(model.filePath)) {
      fs.unlinkSync(model.filePath);
      log(`Deleted SQL file: ${model.filePath}`);
    }

    // Remove from schema YAML
    const schemaResult = await removeFromSchemaYaml(projectPath, model);
    if (schemaResult.success) {
      log(`Removed from schema YAML: ${model.name}`);
    }

    vscode.window.showInformationMessage(`Deleted ${modelTypeDisplay}: ${model.name}`);
    await refreshProject();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error deleting Business Vault model: ${errorMessage}`);
    vscode.window.showErrorMessage(`Failed to delete model: ${errorMessage}`);
  }
}

/**
 * Delete an entire entity including:
 * - Staging SQL model
 * - Staging YAML entry
 * - All Raw Vault models (Hub, Satellite, Links)
 * - Raw Vault YAML entries
 * - Entity Designer JSON config
 * 
 * Called from Staging view context menu
 */
export async function deleteEntity(
  treeItem: TreeItemData | undefined,
  context: VaultDeleteContext
): Promise<void> {
  const { projectPath, refreshProject, getCurrentMetadata, log } = context;

  const model: DbtModel | undefined = treeItem?.model;
  if (!model || model.layer !== 'staging') {
    vscode.window.showErrorMessage('Please select a Staging model to delete the entity');
    return;
  }

  if (!projectPath) {
    vscode.window.showErrorMessage('No dbt project found');
    return;
  }

  const metadata = getCurrentMetadata();
  if (!metadata) {
    vscode.window.showErrorMessage('Project metadata not loaded');
    return;
  }

  // Extract concept and entity name from staging model
  // Staging model name format: <concept>_<entity> (e.g., "adworks_kunde")
  const stagingName = model.name;
  const concept = model.concept || stagingName.split('_')[0];
  const entityName = stagingName.replace(`${concept}_`, '');

  log(`Preparing to delete entity: ${entityName} (concept: ${concept})`);

  // Collect all files to delete
  const filesToDelete: { path: string; type: string }[] = [];
  const yamlUpdates: { model: DbtModel; type: string }[] = [];

  // 1. Staging SQL
  if (fs.existsSync(model.filePath)) {
    filesToDelete.push({ path: model.filePath, type: 'Staging SQL' });
  }
  yamlUpdates.push({ model, type: 'Staging YAML' });

  // 2. Find Raw Vault models for this entity
  const rawVaultModels = metadata.models.filter(m => 
    m.layer === 'raw_vault' && 
    m.concept === concept
  );

  // Hub
  const hub = rawVaultModels.find(m => m.name === `hub_${entityName}`);
  if (hub && fs.existsSync(hub.filePath)) {
    filesToDelete.push({ path: hub.filePath, type: 'Hub' });
    yamlUpdates.push({ model: hub, type: 'Hub YAML' });
  }

  // Satellite
  const sat = rawVaultModels.find(m => m.name === `sat_${entityName}`);
  if (sat && fs.existsSync(sat.filePath)) {
    filesToDelete.push({ path: sat.filePath, type: 'Satellite' });
    yamlUpdates.push({ model: sat, type: 'Satellite YAML' });
  }

  // Links (any link that contains the entity name)
  const links = rawVaultModels.filter(m => 
    m.name.startsWith('link_') && 
    (m.name.includes(entityName) || m.name.includes(`_${entityName}`))
  );
  for (const link of links) {
    if (fs.existsSync(link.filePath)) {
      filesToDelete.push({ path: link.filePath, type: 'Link' });
      yamlUpdates.push({ model: link, type: 'Link YAML' });
    }
  }

  // Link Satellites
  const lsats = rawVaultModels.filter(m => 
    m.name.startsWith('lsat_') && m.name.includes(entityName)
  );
  for (const lsat of lsats) {
    if (fs.existsSync(lsat.filePath)) {
      filesToDelete.push({ path: lsat.filePath, type: 'Link Satellite' });
      yamlUpdates.push({ model: lsat, type: 'Link Satellite YAML' });
    }
  }

  // DC Satellites
  const dcSats = rawVaultModels.filter(m => 
    m.name.includes(entityName) && m.name.includes('_dc')
  );
  for (const dcSat of dcSats) {
    if (fs.existsSync(dcSat.filePath)) {
      filesToDelete.push({ path: dcSat.filePath, type: 'DC Satellite' });
      yamlUpdates.push({ model: dcSat, type: 'DC Satellite YAML' });
    }
  }

  // MA Satellites
  const maSats = rawVaultModels.filter(m => 
    m.name.includes(entityName) && m.name.includes('_ma')
  );
  for (const maSat of maSats) {
    if (fs.existsSync(maSat.filePath)) {
      filesToDelete.push({ path: maSat.filePath, type: 'MA Satellite' });
      yamlUpdates.push({ model: maSat, type: 'MA Satellite YAML' });
    }
  }

  // 3. Entity Designer JSON config
  const configPaths = [
    path.join(projectPath, '.vscode', 'entity-designer', `${concept}_${entityName}.json`),
    path.join(projectPath, '.datavault', 'entity-configs', `${concept}_${entityName}.json`),
  ];
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      filesToDelete.push({ path: configPath, type: 'Designer Config' });
    }
  }

  // Build confirmation message
  const fileList = filesToDelete.map(f => `• ${f.type}: ${path.basename(f.path)}`).join('\n');
  const confirmMessage = `Are you sure you want to delete the entire entity "${entityName}"?\n\n` +
    `This will delete ${filesToDelete.length} file(s):\n${fileList}\n\n` +
    `And update ${new Set(yamlUpdates.map(y => y.model._yamlPath || 'YAML')).size} YAML file(s).`;

  const confirmation = await vscode.window.showWarningMessage(
    confirmMessage,
    { modal: true },
    'Delete Entity'
  );

  if (confirmation !== 'Delete Entity') {
    return;
  }

  log(`Deleting entity: ${entityName}`);

  try {
    // Delete all SQL/JSON files
    for (const file of filesToDelete) {
      fs.unlinkSync(file.path);
      log(`Deleted: ${file.path}`);
    }

    // Update YAML files
    for (const update of yamlUpdates) {
      await removeFromSchemaYaml(projectPath, update.model);
      log(`Removed from YAML: ${update.model.name}`);
    }

    vscode.window.showInformationMessage(
      `Deleted entity "${entityName}": ${filesToDelete.length} files removed`
    );
    
    await refreshProject();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error deleting entity: ${errorMessage}`);
    vscode.window.showErrorMessage(`Failed to delete entity: ${errorMessage}`);
  }
}
