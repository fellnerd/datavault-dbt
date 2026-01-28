import * as vscode from 'vscode';
import { TreeItemData, DbtModel, HubInfo, LinkInfo, PitInfo, BridgeInfo, ColumnInfo } from '../types';
import { MartDesignerProvider } from '../webviews/martDesigner/MartDesignerProvider';
import { MartDesignerStateService } from '../services/martDesignerState';
import { listMartDesignerConfigs } from '../services/martDesignerConfigStore';

/**
 * Command context for Mart Designer commands
 */
interface MartDesignerCommandContext {
  extensionUri: vscode.Uri;
  getProjectPath: () => string | undefined;
  getMetadata: () => { hubs: HubInfo[]; links: LinkInfo[]; pits: PitInfo[]; bridges: BridgeInfo[] } | undefined;
}

/**
 * Register all Mart Designer commands
 */
export function registerMartDesignerCommands(
  context: MartDesignerCommandContext
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  const stateService = MartDesignerStateService.getInstance();

  // ============================================
  // OPEN MART DESIGNER
  // ============================================

  disposables.push(
    vscode.commands.registerCommand(
      'datavault.openMartDesigner',
      async (treeItem?: TreeItemData) => {
        const projectPath = context.getProjectPath();
        if (!projectPath) {
          vscode.window.showErrorMessage('No dbt project found. Please open a dbt project first.');
          return;
        }

        let concept: string;
        let martName: string;

        // If opened from concept item in tree, show existing marts for that concept
        if (treeItem?.type === 'concept' && treeItem.concept) {
          concept = treeItem.concept;

          // Get existing mart configs for this concept
          const allConfigs = await listMartDesignerConfigs(projectPath);
          const conceptConfigs = allConfigs.filter(c => c.concept === concept);

          // Create quick pick items
          const items: vscode.QuickPickItem[] = [
            { label: '$(add) Create new mart...', description: 'Create a new mart design' }
          ];

          // Add existing marts
          if (conceptConfigs.length > 0) {
            items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
            conceptConfigs.forEach(config => {
              items.push({
                label: config.martName,
                description: `Open existing mart: ${config.concept}_${config.martName}`
              });
            });
          }

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select a mart for concept "${concept}"`
          });

          if (!selected) { return; }

          if (selected.label.startsWith('$(add)')) {
            // Create new mart
            const inputName = await vscode.window.showInputBox({
              prompt: 'Enter a name for the new mart',
              placeHolder: 'e.g., sales, orders, customers',
              value: `${concept}_mart`
            });
            if (!inputName) { return; }
            martName = inputName;
          } else {
            // Open existing mart
            martName = selected.label;
          }
        } else if (treeItem?.model) {
          // If opened from model item, use model info
          concept = treeItem.model.concept;
          martName = treeItem.model.name.replace('dim_', '').replace('fact_', '');
        } else {
          // No context - prompt for everything
          const inputName = await vscode.window.showInputBox({
            prompt: 'Enter a name for the new mart',
            placeHolder: 'e.g., sales, orders, customers',
            value: 'new_mart'
          });
          if (!inputName) { return; }
          martName = inputName;

          // Prompt for concept
          const metadata = context.getMetadata();
          const concepts = [...new Set(metadata?.hubs.map(h => h.concept) || [])];
          if (concepts.length > 0) {
            const selectedConcept = await vscode.window.showQuickPick(concepts, {
              placeHolder: 'Select a concept for this mart'
            });
            if (selectedConcept) {
              concept = selectedConcept;
            } else {
              concept = '_common';
            }
          } else {
            concept = '_common';
          }
        }

        // Open or reveal the Mart Designer
        await MartDesignerProvider.createOrShow(
          context.extensionUri,
          projectPath,
          concept,
          martName
        );
      }
    )
  );

  // ============================================
  // ADD AS DIMENSION
  // ============================================

  disposables.push(
    vscode.commands.registerCommand(
      'datavault.addAsDimension',
      async (treeItem?: TreeItemData) => {
        if (!stateService.isDesignerOpen()) {
          vscode.window.showWarningMessage('Please open the Mart Designer first.');
          return;
        }

        if (!treeItem?.model) {
          vscode.window.showWarningMessage('Please select a model in the tree view.');
          return;
        }

        const model = treeItem.model;

        // Check if it's a Hub or PIT
        if (model.type === 'hub') {
          stateService.addDimension(model);
          vscode.window.showInformationMessage(`Added ${model.name} as dimension.`);
        } else if (model.type === 'pit') {
          const pitModel = model as unknown as PitInfo;
          stateService.addDimensionFromPIT(model, pitModel.baseHub);
          vscode.window.showInformationMessage(`Added ${model.name} as SCD Type 2 dimension.`);
        } else {
          vscode.window.showWarningMessage(
            `Cannot add ${model.type} as dimension. Only Hubs and PITs are supported.`
          );
        }
      }
    )
  );

  // ============================================
  // ADD AS FACT
  // ============================================

  disposables.push(
    vscode.commands.registerCommand(
      'datavault.addAsFact',
      async (treeItem?: TreeItemData) => {
        if (!stateService.isDesignerOpen()) {
          vscode.window.showWarningMessage('Please open the Mart Designer first.');
          return;
        }

        if (!treeItem?.model) {
          vscode.window.showWarningMessage('Please select a model in the tree view.');
          return;
        }

        const model = treeItem.model;

        // Check if it's a Link
        if (model.type === 'link') {
          stateService.addFact(model);
          vscode.window.showInformationMessage(`Added ${model.name} as fact.`);
        } else {
          vscode.window.showWarningMessage(
            `Cannot add ${model.type} as fact. Only Links are supported.`
          );
        }
      }
    )
  );

  // ============================================
  // ADD ATTRIBUTES TO NODE
  // ============================================

  disposables.push(
    vscode.commands.registerCommand(
      'datavault.addAttributesToNode',
      async (treeItem?: TreeItemData) => {
        if (!stateService.isDesignerOpen()) {
          vscode.window.showWarningMessage('Please open the Mart Designer first.');
          return;
        }

        if (!stateService.getSelectedNodeId()) {
          vscode.window.showWarningMessage('Please select a node in the Mart Designer first.');
          return;
        }

        if (!treeItem?.model) {
          vscode.window.showWarningMessage('Please select a model in the tree view.');
          return;
        }

        const model = treeItem.model;

        // Add columns from any model type
        stateService.addAttributes(model);
        vscode.window.showInformationMessage(`Added columns from ${model.name} to node.`);
      }
    )
  );

  // ============================================
  // ADD COLUMN TO NODE
  // ============================================

  disposables.push(
    vscode.commands.registerCommand(
      'datavault.addColumnToNode',
      async (treeItem?: TreeItemData, parentModel?: DbtModel) => {
        if (!stateService.isDesignerOpen()) {
          vscode.window.showWarningMessage('Please open the Mart Designer first.');
          return;
        }

        if (!stateService.getSelectedNodeId()) {
          vscode.window.showWarningMessage('Please select a node in the Mart Designer first.');
          return;
        }

        // Get column info from tree item
        if (treeItem?.type === 'column' && treeItem.label) {
          const column: ColumnInfo = {
            name: treeItem.label,
            dataType: treeItem.description
          };

          // Get parent model name from tree item, command arg, or fallback
          const modelName = treeItem.model?.name || parentModel?.name || 'unknown';
          stateService.addColumn(column, modelName);
          vscode.window.showInformationMessage(`Added column ${column.name}.`);
        }
      }
    )
  );

  // ============================================
  // USE AS SOURCE (PIT/BRIDGE)
  // ============================================

  disposables.push(
    vscode.commands.registerCommand(
      'datavault.useAsSource',
      async (treeItem?: TreeItemData) => {
        if (!stateService.isDesignerOpen()) {
          vscode.window.showWarningMessage('Please open the Mart Designer first.');
          return;
        }

        if (!stateService.getSelectedNodeId()) {
          vscode.window.showWarningMessage('Please select a node in the Mart Designer first.');
          return;
        }

        if (!treeItem?.model) {
          vscode.window.showWarningMessage('Please select a PIT or Bridge in the tree view.');
          return;
        }

        const model = treeItem.model;

        if (model.type === 'pit' || model.type === 'bridge') {
          stateService.useAsSource(model);
          vscode.window.showInformationMessage(`Set ${model.name} as source.`);
        } else {
          vscode.window.showWarningMessage(
            `Only PIT and Bridge tables can be used as optimized sources.`
          );
        }
      }
    )
  );

  // ============================================
  // ADD SEED AS REFERENCE DIMENSION
  // ============================================

  disposables.push(
    vscode.commands.registerCommand(
      'datavault.addSeedAsDimension',
      async (treeItem?: TreeItemData) => {
        if (!stateService.isDesignerOpen()) {
          vscode.window.showWarningMessage('Please open the Mart Designer first.');
          return;
        }

        if (!treeItem?.model) {
          vscode.window.showWarningMessage('Please select a seed in the tree view.');
          return;
        }

        stateService.addSeedAsDimension(treeItem.model);
        vscode.window.showInformationMessage(`Added ${treeItem.model.name} as reference dimension.`);
      }
    )
  );

  return disposables;
}
