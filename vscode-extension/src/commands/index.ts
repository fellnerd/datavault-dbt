/**
 * Commands Module - Command Registration and Handlers
 * 
 * This module centralizes all VS Code command registrations.
 * Individual command implementations are in separate files.
 */

import * as vscode from 'vscode';
import { DbtModel, ProjectMetadata, TreeItemData } from '../types';
import { ModelDetailsPanel } from '../webviewPanel';
import { discoverExternalSources } from './discover';
import { createExternalTable, createAllExternalTables, stageAllExternalSources } from './external';
import { createStaging, validateStaging, deleteStaging } from './staging';
import { registerEntityDesignerCommands } from './entityDesigner';
import { registerDbtCommands } from './dbtCommands';

// Re-export command implementations for use elsewhere
export { discoverExternalSources } from './discover';
export { createExternalTable, createAllExternalTables, stageAllExternalSources } from './external';
export { createStaging, validateStaging, deleteStaging } from './staging';
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
          log
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

  // Entity Designer Commands (Hub/Satellite/Link Generator)
  const entityDesignerDisposables = registerEntityDesignerCommands(
    context,
    () => getCurrentProjectPath() ?? undefined
  );
  disposables.push(...entityDesignerDisposables);

  // dbt Commands (Run, Test, Compile with model picker)
  registerDbtCommands(context);

  return disposables;
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
