import * as vscode from 'vscode';
import { MartDesignerState, MartDesignerMessage } from '../../types';
import { getWebviewContent } from './getWebviewContent';
import { MartDesignerStateService } from '../../services/martDesignerState';
import {
  loadMartDesignerConfig,
  saveMartDesignerConfig,
  createEmptyMartDesignerState
} from '../../services/martDesignerConfigStore';
import { generateMartModels, showGenerationResult } from '../../services/martGenerator';

/**
 * Manages the Mart Designer webview panel.
 *
 * Architecture:
 * - Single panel instance (singleton per workspace)
 * - React Flow canvas for visual star schema design
 * - Bidirectional communication via postMessage
 * - State persisted in .vscode/mart-designer/<concept>_<martName>.json
 */
export class MartDesignerProvider {
  public static readonly viewType = 'datavault.martDesigner';

  private static currentPanel: MartDesignerProvider | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _stateService: MartDesignerStateService;
  private _disposables: vscode.Disposable[] = [];

  private _projectPath: string;
  private _concept: string;
  private _martName: string;
  private _isDirty: boolean = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    projectPath: string,
    concept: string,
    martName: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._projectPath = projectPath;
    this._concept = concept;
    this._martName = martName;
    this._stateService = MartDesignerStateService.getInstance();

    // Set webview content
    this._panel.webview.html = getWebviewContent(this._panel.webview, extensionUri);

    // Register webview with state service
    this._stateService.setWebview(this._panel.webview);

    // Handle panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      (message: MartDesignerMessage) => this.handleMessage(message),
      null,
      this._disposables
    );

    // Update title
    this.updateTitle();
  }

  /**
   * Create or reveal the Mart Designer panel.
   */
  public static async createOrShow(
    extensionUri: vscode.Uri,
    projectPath: string,
    concept: string,
    martName: string
  ): Promise<MartDesignerProvider> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel exists, reveal it
    if (MartDesignerProvider.currentPanel) {
      MartDesignerProvider.currentPanel._panel.reveal(column);

      // If different mart, load new state
      if (
        MartDesignerProvider.currentPanel._concept !== concept ||
        MartDesignerProvider.currentPanel._martName !== martName
      ) {
        MartDesignerProvider.currentPanel._concept = concept;
        MartDesignerProvider.currentPanel._martName = martName;
        MartDesignerProvider.currentPanel._projectPath = projectPath;
        MartDesignerProvider.currentPanel.updateTitle();
        await MartDesignerProvider.currentPanel.loadState();
      }

      return MartDesignerProvider.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      MartDesignerProvider.viewType,
      `Mart Designer: ${martName}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'out', 'webviews'),
          vscode.Uri.joinPath(extensionUri, 'node_modules')
        ]
      }
    );

    MartDesignerProvider.currentPanel = new MartDesignerProvider(
      panel,
      extensionUri,
      projectPath,
      concept,
      martName
    );

    return MartDesignerProvider.currentPanel;
  }

  /**
   * Get the current panel instance (if any)
   */
  public static getCurrentPanel(): MartDesignerProvider | undefined {
    return MartDesignerProvider.currentPanel;
  }

  /**
   * Handle messages from the webview
   */
  private async handleMessage(message: MartDesignerMessage): Promise<void> {
    console.log('[MartDesignerProvider] Received message:', message.type);

    switch (message.type) {
      case 'ready':
        // Webview is ready, load state
        await this.loadState();
        break;

      case 'save':
        await this.handleSave(message.payload);
        break;

      case 'generate':
        await this.handleGenerate(message.payload);
        break;

      case 'nodeSelected':
        this._stateService.setSelectedNode(message.payload.nodeId);
        break;

      case 'stateChanged':
        this.setDirty(true);
        break;
    }
  }

  /**
   * Load state from disk and send to webview
   */
  private async loadState(): Promise<void> {
    let state = await loadMartDesignerConfig(
      this._projectPath,
      this._concept,
      this._martName
    );

    if (!state) {
      // Create new empty state
      state = createEmptyMartDesignerState(this._concept, this._martName);
    }

    this._panel.webview.postMessage({
      type: 'loadState',
      payload: state
    } as MartDesignerMessage);

    this.setDirty(false);
  }

  /**
   * Save state to disk
   */
  private async handleSave(state: MartDesignerState): Promise<void> {
    try {
      await saveMartDesignerConfig(this._projectPath, state);
      this.setDirty(false);
      vscode.window.showInformationMessage(`Mart Designer: ${this._martName} saved.`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save: ${error}`);
    }
  }

  /**
   * Generate dbt models from state
   */
  private async handleGenerate(state: MartDesignerState): Promise<void> {
    try {
      // First save the state
      await saveMartDesignerConfig(this._projectPath, state);
      this.setDirty(false);

      // Generate mart models using Two-Layer Pattern
      const result = await generateMartModels(this._projectPath, state);

      // Show result to user
      showGenerationResult(result);

      this._panel.webview.postMessage({
        type: 'generationComplete',
        success: result.success,
        files: result.generatedFiles,
        errors: result.errors
      } as MartDesignerMessage);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Generation failed: ${errorMessage}`);

      this._panel.webview.postMessage({
        type: 'generationComplete',
        success: false,
        files: [],
        errors: [errorMessage]
      } as MartDesignerMessage);
    }
  }

  /**
   * Update the panel title with dirty indicator
   */
  private updateTitle(): void {
    const dirty = this._isDirty ? ' ●' : '';
    this._panel.title = `Mart Designer: ${this._martName}${dirty}`;
  }

  /**
   * Set dirty state and update title
   */
  private setDirty(dirty: boolean): void {
    if (this._isDirty !== dirty) {
      this._isDirty = dirty;
      this.updateTitle();
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    MartDesignerProvider.currentPanel = undefined;

    // Unregister webview from state service
    this._stateService.setWebview(null);

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
