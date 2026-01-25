/**
 * Commands Module - Command Registration and Handlers
 * 
 * This module centralizes all VS Code command registrations.
 * Individual command implementations are in separate files.
 */

import * as vscode from 'vscode';
import { DbtModel, ProjectMetadata, TreeItemData, GroupConfig } from '../types';
import { ModelDetailsPanel } from '../webviewPanel';
import { discoverExternalSources } from './discover';
import { createExternalTable, createAllExternalTables, stageAllExternalSources } from './external';
import { createStaging, validateStaging, deleteStaging, createStagingWizard } from './staging';
import { createRefTable, createRefTableFromPalette } from './refTable';
import { createPITTable, createPITTableFromPalette } from './pitTable';
import { createBridgeTable, createBridgeTableFromPalette } from './bridgeTable';
import { registerEntityDesignerCommands } from './entityDesigner';
import { registerDbtCommands } from './dbtCommands';

// Re-export command implementations for use elsewhere
export { discoverExternalSources } from './discover';
export { createExternalTable, createAllExternalTables, stageAllExternalSources } from './external';
export { createStaging, validateStaging, deleteStaging } from './staging';
export { createRefTable, createRefTableFromPalette } from './refTable';
export { createPITTable, createPITTableFromPalette } from './pitTable';
export { createBridgeTable, createBridgeTableFromPalette } from './bridgeTable';
export { registerEntityDesignerCommands } from './entityDesigner';
export { registerDbtCommands } from './dbtCommands';

/**
 * Logger function type
 */
export type Logger = (message: string) => void;

/**
 * Context for command execution
 */
export interface CommandContext {
  extensionContext: vscode.ExtensionContext;
  getCurrentMetadata: () => ProjectMetadata | null;
  getCurrentProjectPath: () => string | null;
  refreshProject: () => Promise<void>;
  log: Logger;
}

/**
 * Register all Data Vault commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  commandContext: CommandContext
): vscode.Disposable[] {
  const { getCurrentMetadata, getCurrentProjectPath, refreshProject, log } = commandContext;

  const disposables: vscode.Disposable[] = [];

  // Refresh Command
  disposables.push(
    vscode.commands.registerCommand('datavault.refresh', async () => {
      log('Refresh command triggered');
      await refreshProject();
    })
  );

  // Open Model Command
  disposables.push(
    vscode.commands.registerCommand('datavault.openModel', async (arg: string | { filePath?: string }) => {
      const filePath = typeof arg === 'string' ? arg : arg?.filePath;
      if (filePath) {
        log(`Opening model: ${filePath}`);
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
      } else {
        vscode.window.showWarningMessage('No file path available for this item');
      }
    })
  );

  // Show Lineage Command
  disposables.push(
    vscode.commands.registerCommand('datavault.showLineage', async (item: any) => {
      const metadata = getCurrentMetadata();
      if (!metadata || !item?.model) {
        vscode.window.showWarningMessage('No model selected');
        return;
      }
      showLineage(context, item.model, metadata);
    })
  );

  // Show Model Details Command
  disposables.push(
    vscode.commands.registerCommand('datavault.showModelDetails', async (item: any) => {
      const metadata = getCurrentMetadata();
      if (!metadata) {
        vscode.window.showWarningMessage('No dbt project loaded');
        return;
      }

      let model: DbtModel | undefined;
      if (item?.model) {
        model = item.model;
      } else if (item?.filePath) {
        model = metadata.models.find(m => m.filePath === item.filePath);
      }

      if (model) {
        showModelDetails(context, model, metadata);
      } else {
        vscode.window.showWarningMessage('No model selected');
      }
    })
  );

  // Open YAML Definition Command
  disposables.push(
    vscode.commands.registerCommand('datavault.openYamlDefinition', async (item: any) => {
      const model: DbtModel | undefined = item?.model;
      if (model?._yamlPath) {
        log(`Opening YAML definition: ${model._yamlPath}`);
        const document = await vscode.workspace.openTextDocument(model._yamlPath);
        await vscode.window.showTextDocument(document);
      } else {
        vscode.window.showWarningMessage('No YAML definition found for this model');
      }
    })
  );

  // Copy Model Name Command
  disposables.push(
    vscode.commands.registerCommand('datavault.copyModelName', async (item: any) => {
      const model: DbtModel | undefined = item?.model;
      if (model?.name) {
        await vscode.env.clipboard.writeText(model.name);
        vscode.window.showInformationMessage(`Copied: ${model.name}`);
      }
    })
  );

  // Copy as ref() Syntax Command
  disposables.push(
    vscode.commands.registerCommand('datavault.copyRefSyntax', async (item: any) => {
      const model: DbtModel | undefined = item?.model;
      if (model?.name) {
        const refSyntax = `{{ ref('${model.name}') }}`;
        await vscode.env.clipboard.writeText(refSyntax);
        vscode.window.showInformationMessage(`Copied: ${refSyntax}`);
      }
    })
  );

  // Discover External Sources Command
  disposables.push(
    vscode.commands.registerCommand('datavault.discoverSources', async () => {
      await discoverExternalSources({
        projectPath: getCurrentProjectPath(),
        refreshProject,
        log
      });
    })
  );

  // Create Single External Table Command
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.createExternalTable',
      async (treeItem?: TreeItemData) => {
        await createExternalTable(treeItem, {
          projectPath: getCurrentProjectPath(),
          log
        });
      }
    )
  );

  // Create All External Tables for a Concept Command
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.createAllExternalTables',
      async (treeItem?: TreeItemData) => {
        await createAllExternalTables(treeItem, {
          projectPath: getCurrentProjectPath(),
          log
        });
      }
    )
  );

  // Stage ALL External Sources Command
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.stageAllExternalSources',
      async () => {
        await stageAllExternalSources({
          projectPath: getCurrentProjectPath(),
          log,
          getExternalTables: () => getCurrentMetadata()?.externalTables || []
        });
      }
    )
  );

  // Create Staging View Command
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.createStaging',
      async (treeItem?: TreeItemData) => {
        await createStaging(treeItem, {
          projectPath: getCurrentProjectPath(),
          refreshProject,
          log
        });
      }
    )
  );

  // Create Staging Wizard Command (Command Palette accessible)
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.createStagingWizard',
      async () => {
        await createStagingWizard({
          projectPath: getCurrentProjectPath(),
          refreshProject,
          getCurrentMetadata,
          log
        });
      }
    )
  );

  // Validate Staging Model Command
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.validateStaging',
      async (treeItem?: TreeItemData) => {
        await validateStaging(treeItem, {
          projectPath: getCurrentProjectPath(),
          refreshProject,
          log
        });
      }
    )
  );

  // Delete Staging Model Command
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.deleteStaging',
      async (treeItem?: TreeItemData) => {
        await deleteStaging(treeItem, {
          projectPath: getCurrentProjectPath(),
          refreshProject,
          log
        });
      }
    )
  );

  // Create Reference Table Command (context menu on external table)
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.createRefTable',
      async (treeItem?: TreeItemData) => {
        await createRefTable(treeItem, {
          projectPath: getCurrentProjectPath(),
          refreshProject,
          log
        });
      }
    )
  );

  // Create PIT Table Command (context menu on hub or command palette)
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.createPITTable',
      async (treeItem?: TreeItemData) => {
        await createPITTable(treeItem, {
          projectPath: getCurrentProjectPath(),
          refreshProject,
          getCurrentMetadata,
          log
        });
      }
    )
  );

  // Create Bridge Table Command (context menu on hub or command palette)
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.createBridgeTable',
      async (treeItem?: TreeItemData) => {
        await createBridgeTable(treeItem, {
          projectPath: getCurrentProjectPath(),
          refreshProject,
          getCurrentMetadata,
          log
        });
      }
    )
  );

  // Entity Designer Commands (Hub/Satellite/Link Generator)
  const entityDesignerDisposables = registerEntityDesignerCommands(
    context,
    () => getCurrentProjectPath() ?? undefined
  );
  disposables.push(...entityDesignerDisposables);

  // dbt Commands (Run, Test, Compile with model picker)
  registerDbtCommands(context);

  // Group Management Commands
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.createGroup',
      async () => {
        await createGroup({ log, getCurrentMetadata });
      }
    )
  );

  disposables.push(
    vscode.commands.registerCommand(
      'datavault.addToGroup',
      async (treeItem?: TreeItemData, selectedItems?: TreeItemData[]) => {
        await addToGroup(treeItem, selectedItems, { log });
      }
    )
  );

  disposables.push(
    vscode.commands.registerCommand(
      'datavault.removeFromGroup',
      async (treeItem?: TreeItemData, selectedItems?: TreeItemData[]) => {
        await removeFromGroup(treeItem, selectedItems, { log });
      }
    )
  );

  return disposables;
}

/**
 * Create a new group with interactive UI
 */
async function createGroup(options: {
  log: Logger;
  getCurrentMetadata: () => ProjectMetadata | null;
}): Promise<void> {
  const { log, getCurrentMetadata } = options;

  // Step 1: Select Layer
  const layers = [
    { label: 'Sources', value: 'sources', description: 'External Tables' },
    { label: 'Staging', value: 'staging', description: 'Staging Views' },
    { label: 'Raw Vault', value: 'raw_vault', description: 'Hubs, Satellites, Links' },
    { label: 'Business Vault', value: 'business_vault', description: 'PITs, Bridges' },
    { label: 'Mart', value: 'mart', description: 'Dimensions, Facts' }
  ];

  const selectedLayer = await vscode.window.showQuickPick(layers, {
    placeHolder: 'Select the layer for this group',
    title: 'Create Group - Step 1/3: Layer'
  });

  if (!selectedLayer) {
    return;
  }

  // Step 2: Select Concept (from loaded metadata)
  const metadata = getCurrentMetadata();
  if (!metadata) {
    vscode.window.showErrorMessage('No project loaded. Please load a dbt project first.');
    return;
  }

  // Get available concepts based on layer
  let concepts: string[] = [];
  if (selectedLayer.value === 'sources') {
    concepts = [...new Set((metadata.externalTables || []).map(t => t.concept || '_other'))];
  } else {
    const layerModels = metadata.models.filter(m => m.layer === selectedLayer.value);
    concepts = [...new Set(layerModels.map(m => m.concept || '_other'))];
  }

  if (concepts.length === 0) {
    vscode.window.showWarningMessage(`No concepts found for ${selectedLayer.label}`);
    return;
  }

  const conceptItems = concepts.sort().map(c => ({
    label: c === '_common' ? 'Common' : c === '_other' ? 'Other' : c,
    value: c
  }));

  const selectedConcept = await vscode.window.showQuickPick(conceptItems, {
    placeHolder: 'Select the concept for this group',
    title: 'Create Group - Step 2/3: Concept'
  });

  if (!selectedConcept) {
    return;
  }

  // Step 3: Enter Group Name
  const groupName = await vscode.window.showInputBox({
    prompt: 'Enter a name for the new group',
    title: 'Create Group - Step 3/3: Name',
    placeHolder: 'e.g., Core Entities, Master Data, Reports',
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Group name cannot be empty';
      }
      if (value.length > 50) {
        return 'Group name too long (max 50 characters)';
      }
      // Check for duplicate
      const config = vscode.workspace.getConfiguration('datavault');
      const existingGroups = config.get<GroupConfig[]>('groups') || [];
      const duplicate = existingGroups.find(
        g => g.name.toLowerCase() === value.toLowerCase() &&
             g.concept === selectedConcept.value &&
             g.layer === selectedLayer.value
      );
      if (duplicate) {
        return `A group named "${value}" already exists for ${selectedConcept.label} (${selectedLayer.label})`;
      }
      return undefined;
    }
  });

  if (!groupName) {
    return;
  }

  // Create the new group
  const newGroup: GroupConfig = {
    name: groupName.trim(),
    concept: selectedConcept.value,
    layer: selectedLayer.value as 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart',
    models: []
  };

  // Save to settings
  const config = vscode.workspace.getConfiguration('datavault');
  const allGroups = config.get<GroupConfig[]>('groups') || [];
  allGroups.push(newGroup);
  await config.update('groups', allGroups, vscode.ConfigurationTarget.Workspace);

  log(`Created new group: ${groupName} (${selectedConcept.value}/${selectedLayer.value})`);
  vscode.window.showInformationMessage(
    `Group "${groupName}" created! Use the context menu to add models.`
  );
}

/**
 * Show model details in webview
 */
function showModelDetails(
  context: vscode.ExtensionContext,
  model: DbtModel,
  metadata: ProjectMetadata
): void {
  const panel = ModelDetailsPanel.createOrShow(context.extensionUri, model, metadata, 'details');

  panel['_panel'].webview.onDidReceiveMessage(
    async (message: { command: string; model?: string }) => {
      if (message.command === 'openModel' && message.model) {
        const targetModel = metadata.models.find(m => m.name === message.model);
        if (targetModel) {
          showModelDetails(context, targetModel, metadata);
        }
      }
    },
    undefined,
    context.subscriptions
  );
}

/**
 * Show model lineage in webview
 */
function showLineage(
  context: vscode.ExtensionContext,
  model: DbtModel,
  metadata: ProjectMetadata
): void {
  const panel = ModelDetailsPanel.createOrShow(context.extensionUri, model, metadata, 'lineage');

  panel['_panel'].webview.onDidReceiveMessage(
    async (message: { command: string; model?: string }) => {
      if (message.command === 'openModel' && message.model) {
        const targetModel = metadata.models.find(m => m.name === message.model);
        if (targetModel) {
          showLineage(context, targetModel, metadata);
        }
      }
    },
    undefined,
    context.subscriptions
  );
}

/**
 * Add model(s) to a group
 */
async function addToGroup(
  treeItem?: TreeItemData,
  selectedItems?: TreeItemData[],
  options?: { log: Logger }
): Promise<void> {
  const log = options?.log || console.log;

  // Collect items to process (support multi-select)
  const items: TreeItemData[] = [];
  if (selectedItems && selectedItems.length > 0) {
    items.push(...selectedItems);
  } else if (treeItem) {
    items.push(treeItem);
  }

  if (items.length === 0) {
    vscode.window.showWarningMessage('No items selected');
    return;
  }

  // Get model/table names and determine concept and layer
  const modelNames: string[] = [];
  let concept: string | undefined;
  let layer: 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart' | undefined;

  for (const item of items) {
    if (item.type === 'model' && item.model) {
      modelNames.push(item.model.name);
      concept = concept || item.model.concept;
      layer = layer || item.model.layer;
    } else if (item.type === 'external_table' && item.externalTable) {
      modelNames.push(item.externalTable.name);
      concept = concept || item.externalTable.concept;
      layer = layer || 'sources';
    }
  }

  if (modelNames.length === 0 || !concept || !layer) {
    vscode.window.showWarningMessage('Could not determine model information');
    return;
  }

  log(`Adding ${modelNames.length} item(s) to group: concept=${concept}, layer=${layer}`);

  // Get existing groups from settings
  const config = vscode.workspace.getConfiguration('datavault');
  const allGroups = config.get<GroupConfig[]>('groups') || [];

  // Filter groups for the same concept and layer
  const availableGroups = allGroups.filter(g => g.concept === concept && g.layer === layer);

  if (availableGroups.length === 0) {
    const createNew = await vscode.window.showInformationMessage(
      `No groups found for ${concept} (${layer}). Create groups in .vscode/settings.json under "datavault.groups".`,
      'Open Settings'
    );
    if (createNew === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile');
    }
    return;
  }

  // Show QuickPick to select group
  const groupNames = availableGroups.map(g => g.name);
  const selectedGroup = await vscode.window.showQuickPick(groupNames, {
    placeHolder: `Select group for ${modelNames.length} item(s)`,
    title: 'Add to Group'
  });

  if (!selectedGroup) {
    return;
  }

  // Update the group in settings
  const groupIndex = allGroups.findIndex(g => g.name === selectedGroup && g.concept === concept && g.layer === layer);
  if (groupIndex === -1) {
    vscode.window.showErrorMessage(`Group "${selectedGroup}" not found`);
    return;
  }

  // Add models that are not already in the group (silently ignore duplicates)
  const group = allGroups[groupIndex];
  let addedCount = 0;
  for (const name of modelNames) {
    if (!group.models.includes(name)) {
      group.models.push(name);
      addedCount++;
    }
  }

  // Save updated settings
  await config.update('groups', allGroups, vscode.ConfigurationTarget.Workspace);

  if (addedCount > 0) {
    vscode.window.showInformationMessage(`Added ${addedCount} item(s) to group "${selectedGroup}"`);
  } else {
    vscode.window.showInformationMessage(`All items already in group "${selectedGroup}"`);
  }

  log(`Added ${addedCount} item(s) to group "${selectedGroup}"`);
}

/**
 * Remove model(s) from a group
 */
async function removeFromGroup(
  treeItem?: TreeItemData,
  selectedItems?: TreeItemData[],
  options?: { log: Logger }
): Promise<void> {
  const log = options?.log || console.log;

  // Collect items to process (support multi-select)
  const items: TreeItemData[] = [];
  if (selectedItems && selectedItems.length > 0) {
    items.push(...selectedItems);
  } else if (treeItem) {
    items.push(treeItem);
  }

  if (items.length === 0) {
    vscode.window.showWarningMessage('No items selected');
    return;
  }

  // Get model/table names and group info
  const toRemove: { name: string; groupName: string; concept: string; layer: string }[] = [];

  for (const item of items) {
    const groupName = item.groupName;
    if (!groupName || groupName === 'All') {
      continue; // Skip items in "All" group
    }

    if (item.type === 'model' && item.model) {
      toRemove.push({
        name: item.model.name,
        groupName,
        concept: item.model.concept,
        layer: item.model.layer
      });
    } else if (item.type === 'external_table' && item.externalTable) {
      toRemove.push({
        name: item.externalTable.name,
        groupName,
        concept: item.externalTable.concept,
        layer: 'sources'
      });
    }
  }

  if (toRemove.length === 0) {
    vscode.window.showWarningMessage('No items to remove from groups');
    return;
  }

  log(`Removing ${toRemove.length} item(s) from groups`);

  // Get existing groups from settings
  const config = vscode.workspace.getConfiguration('datavault');
  const allGroups = config.get<GroupConfig[]>('groups') || [];

  // Remove items from their groups
  let removedCount = 0;
  for (const item of toRemove) {
    const groupIndex = allGroups.findIndex(
      g => g.name === item.groupName && g.concept === item.concept && g.layer === item.layer
    );
    if (groupIndex !== -1) {
      const modelIndex = allGroups[groupIndex].models.indexOf(item.name);
      if (modelIndex !== -1) {
        allGroups[groupIndex].models.splice(modelIndex, 1);
        removedCount++;
      }
    }
  }

  // Save updated settings
  await config.update('groups', allGroups, vscode.ConfigurationTarget.Workspace);

  if (removedCount > 0) {
    vscode.window.showInformationMessage(`Removed ${removedCount} item(s) from group(s)`);
  }

  log(`Removed ${removedCount} item(s) from groups`);
}
