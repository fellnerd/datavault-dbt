import * as vscode from 'vscode';
import { EntityDesignerV2Provider } from '../webviews/entityDesignerV2/EntityDesignerV2Provider';
import { TreeItemData } from '../types';

/**
 * Register Entity Designer v2 commands.
 * These run alongside v1 commands during the migration period.
 */
export function registerEntityDesignerV2Commands(
  context: vscode.ExtensionContext,
  getProjectPath: () => string | undefined
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Open Entity Designer v2 from tree view or command palette
  disposables.push(
    vscode.commands.registerCommand(
      'datavault.openEntityDesignerV2',
      async (treeItem?: TreeItemData) => {
        const projectPath = getProjectPath();
        if (!projectPath) {
          vscode.window.showErrorMessage('No dbt project found');
          return;
        }

        let concept = '_common';
        let entityName = '';
        let sourceTable = '';

        if (treeItem?.externalTable) {
          const ext = treeItem.externalTable;
          concept = ext.concept;
          entityName = ext.name.replace(/^ext_/, '');
          sourceTable = ext.name;
        } else {
          // Prompt user
          const input = await vscode.window.showInputBox({
            prompt: 'External table name (e.g., ext_ewb_proj_npo_main)',
            placeHolder: 'ext_ewb_...',
          });
          if (!input) return;
          sourceTable = input;
          entityName = input.replace(/^ext_/, '');
          // Detect concept from name
          if (input.includes('ewb_')) concept = '_common';
          else if (input.includes('jira_')) concept = 'jira';
          else if (input.includes('adworks_')) concept = 'adworks';
        }

        await EntityDesignerV2Provider.createOrShow(
          context.extensionUri,
          projectPath,
          concept,
          entityName,
          sourceTable
        );
      }
    )
  );

  return disposables;
}
