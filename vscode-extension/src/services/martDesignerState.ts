import * as vscode from 'vscode';
import {
  DbtModel,
  ColumnInfo,
  MartDesignerMessage,
  AddDimensionPayload,
  AddFactPayload,
  DimensionSourceType
} from '../types';

/**
 * Singleton service for Mart Designer state management.
 * Handles communication between Tree Views and the Mart Designer Webview.
 *
 * Architecture:
 * - Tree View context menus call methods on this service
 * - Service sends messages to the webview via postMessage
 * - Webview sends messages back for state sync
 */
export class MartDesignerStateService {
  private static instance: MartDesignerStateService;
  private webview: vscode.Webview | null = null;
  private selectedNodeId: string | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): MartDesignerStateService {
    if (!MartDesignerStateService.instance) {
      MartDesignerStateService.instance = new MartDesignerStateService();
    }
    return MartDesignerStateService.instance;
  }

  /**
   * Register the webview for message passing.
   * Called by MartDesignerProvider when panel is created/disposed.
   */
  public setWebview(webview: vscode.Webview | null): void {
    this.webview = webview;
    // Update context for menu visibility
    vscode.commands.executeCommand('setContext', 'datavault.martDesignerOpen', webview !== null);

    if (!webview) {
      // Clear selection when webview is closed
      this.setSelectedNode(null);
    }
  }

  /**
   * Check if the Mart Designer is open
   */
  public isDesignerOpen(): boolean {
    return this.webview !== null;
  }

  /**
   * Set the currently selected node (from webview).
   * Updates VS Code context for conditional menus.
   */
  public setSelectedNode(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    vscode.commands.executeCommand('setContext', 'datavault.nodeSelected', nodeId !== null);
  }

  /**
   * Get the currently selected node ID
   */
  public getSelectedNodeId(): string | null {
    return this.selectedNodeId;
  }

  /**
   * Send a message to the webview
   */
  public postMessage(message: MartDesignerMessage): void {
    if (this.webview) {
      this.webview.postMessage(message);
    } else {
      console.warn('[MartDesignerState] Cannot post message: webview not registered');
    }
  }

  // ============================================
  // TREE -> WEBVIEW ACTIONS
  // ============================================

  /**
   * Add a Hub as a new Dimension node.
   * Called when user right-clicks on a Hub in the Raw Vault tree.
   */
  public addDimension(hub: DbtModel): void {
    const entityName = hub.name.replace('hub_', '');
    const businessKey = this.extractBusinessKey(hub);

    const payload: AddDimensionPayload = {
      name: `dim_${entityName}`,
      sourceType: 'hub' as DimensionSourceType,
      sourceHub: hub.name,
      businessKey,
      hashKey: `hk_${entityName}`,
      columns: hub.columns,
      concept: hub.concept,
      surrogateKey: `dim_${entityName}_key`,
      scdType: 'type1',
      materialization: 'table',
      surrogateKeyStrategy: 'row_number',
      includeHashKey: true,
      sourceSatellites: [],
      attributes: []
    };

    this.postMessage({
      type: 'addDimension',
      payload
    });
  }

  /**
   * Add a PIT table as a Dimension source (for SCD Type 2).
   * Called when user right-clicks on a PIT in the Business Vault tree.
   */
  public addDimensionFromPIT(pit: DbtModel, baseHub: string | null): void {
    const entityName = pit.name.replace('pit_', '');
    const businessKey = 'object_id'; // Default, should be extracted from hub

    const payload: AddDimensionPayload = {
      name: `dim_${entityName}`,
      sourceType: 'pit' as DimensionSourceType,
      sourceHub: baseHub || `hub_${entityName}`,
      businessKey,
      hashKey: `hk_${entityName}`,
      columns: pit.columns,
      concept: pit.concept,
      surrogateKey: `dim_${entityName}_key`,
      scdType: 'type2', // PIT implies SCD Type 2
      materialization: 'table',
      surrogateKeyStrategy: 'row_number',
      includeHashKey: true,
      sourceSatellites: [],
      attributes: []
    };

    this.postMessage({
      type: 'addDimension',
      payload
    });
  }

  /**
   * Add a Seed as a Reference Dimension (e.g., dim_date).
   * Called when user right-clicks on a Seed in the Sources tree.
   */
  public addSeedAsDimension(seed: DbtModel): void {
    const entityName = seed.name.replace('seed_', '').replace('ref_', '');
    const businessKey = this.extractBusinessKey(seed);

    const payload: AddDimensionPayload = {
      name: `dim_${entityName}`,
      sourceType: 'seed' as DimensionSourceType,
      sourceSeed: seed.name,
      businessKey,
      columns: seed.columns,
      concept: '_common', // Reference dimensions are cross-concept
      surrogateKey: `dim_${entityName}_key`,
      scdType: 'type1', // Reference dims are usually Type 1
      materialization: 'table',
      surrogateKeyStrategy: 'row_number',
      includeHashKey: false, // Seeds don't have hash keys
      sourceSatellites: [],
      attributes: []
    };

    this.postMessage({
      type: 'addDimension',
      payload
    });
  }

  /**
   * Add a Link as a new Fact node.
   * Called when user right-clicks on a Link in the Raw Vault tree.
   */
  public addFact(link: DbtModel): void {
    const entityName = link.name.replace('link_', '');
    const foreignKeys = this.extractForeignKeys(link);

    const payload: AddFactPayload = {
      name: `fact_${entityName}`,
      sourceLink: link.name,
      foreignKeys,
      columns: link.columns,
      concept: link.concept
    };

    this.postMessage({
      type: 'addFact',
      payload
    });
  }

  /**
   * Add attributes from a Satellite to the selected Dimension node.
   * Called when user right-clicks on a Satellite.
   */
  public addAttributes(satellite: DbtModel): void {
    if (!this.selectedNodeId) {
      vscode.window.showWarningMessage('Please select a node in the Mart Designer first.');
      return;
    }

    // Filter out metadata columns
    const attributeColumns = satellite.columns.filter(c =>
      !c.name.startsWith('hk_') &&
      !c.name.startsWith('dss_') &&
      !c.name.includes('load_date') &&
      !c.name.includes('record_source')
    );

    this.postMessage({
      type: 'addAttributes',
      payload: {
        targetNodeId: this.selectedNodeId,
        sourceModel: satellite.name,
        columns: attributeColumns
      }
    });
  }

  /**
   * Add a single column to the selected node.
   * Called when user right-clicks on a column in the tree.
   */
  public addColumn(column: ColumnInfo, sourceModelName: string): void {
    if (!this.selectedNodeId) {
      vscode.window.showWarningMessage('Please select a node in the Mart Designer first.');
      return;
    }

    this.postMessage({
      type: 'addColumn',
      payload: {
        targetNodeId: this.selectedNodeId,
        sourceModel: sourceModelName,
        column
      }
    });
  }

  /**
   * Set a PIT or Bridge as the source for the selected node.
   * Called when user right-clicks on PIT/Bridge in Business Vault tree.
   */
  public useAsSource(model: DbtModel): void {
    if (!this.selectedNodeId) {
      vscode.window.showWarningMessage('Please select a node in the Mart Designer first.');
      return;
    }

    const sourceType = model.type === 'pit' ? 'pit' : 'bridge';

    this.postMessage({
      type: 'setSource',
      payload: {
        targetNodeId: this.selectedNodeId,
        sourceType: sourceType as 'pit' | 'bridge',
        sourceName: model.name
      }
    });
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Extract the business key column from a Hub or Seed.
   * Returns the first non-hash, non-metadata column.
   */
  private extractBusinessKey(model: DbtModel): string {
    const bk = model.columns.find(c =>
      !c.name.startsWith('hk_') &&
      !c.name.startsWith('dss_') &&
      !c.name.includes('load_date') &&
      !c.name.includes('record_source')
    );
    return bk?.name || 'object_id';
  }

  /**
   * Extract foreign key columns from a Link.
   * Returns hash keys that reference other hubs.
   */
  private extractForeignKeys(link: DbtModel): string[] {
    const linkHashKey = `hk_link_${link.name.replace('link_', '')}`;
    return link.columns
      .filter(c => c.name.startsWith('hk_') && c.name !== linkHashKey)
      .map(c => c.name);
  }
}
