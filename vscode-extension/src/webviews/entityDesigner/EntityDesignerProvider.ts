import * as vscode from 'vscode';
import * as path from 'path';
import { 
  ExternalTable, 
  EntityDesignConfig, 
  WebviewMessage,
  WebviewInitMessage,
  SavedColumnConfig,
  WebviewSaveConfigMessage
} from '../../types';
import { getWebviewContent } from './getWebviewContent';
import { generateDataVaultObjects, generateSchemaYaml } from '../../services/entityGenerator';
import { loadDesignerConfig, saveDesignerConfig, DesignerConfig } from '../../services/designerConfigStore';

/**
 * Manages the Entity Designer webview panel
 * 
 * Architecture: Config-First (JSON is Single Source of Truth)
 * - JSON config stored in .vscode/entity-designer/<concept>_<entity>.json
 * - UI displays and edits the config
 * - Changes are saved to JSON immediately
 * - Generation reads from JSON file
 */
export class EntityDesignerProvider {
  public static readonly viewType = 'datavault.entityDesigner';
  
  private _panel: vscode.WebviewPanel | undefined;
  private _disposables: vscode.Disposable[] = [];
  private _projectPath: string | undefined;
  private _pendingInit: {
    externalTable: ExternalTable;
    concept: string;
    entityName: string;
    savedConfig?: DesignerConfig | null;
  } | undefined;
  
  /** Current entity context (for config-first approach) */
  private _currentEntity: {
    concept: string;
    entityName: string;
    sourceTable: string;
    sourceColumns: { name: string; dataType?: string }[];
  } | undefined;
  
  private _existingHubs: string[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    existingHubs: string[]
  ) {
    this._existingHubs = existingHubs;
  }

  /**
   * Update the list of existing hubs
   */
  public updateExistingHubs(hubs: string[]): void {
    this._existingHubs = hubs;
  }

  /**
   * Open the Entity Designer for an external table or staging model
   */
  public async openDesigner(
    externalTable: ExternalTable,
    concept: string,
    entityName: string,
    projectPath?: string
  ): Promise<void> {
    this._projectPath = projectPath;
    // Create or reveal the webview panel
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.One);
    } else {
      this._panel = vscode.window.createWebviewPanel(
        EntityDesignerProvider.viewType,
        `Entity Designer: ${entityName}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webviews'),
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'vscrui', 'dist')
          ]
        }
      );

      // Set up disposal
      this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

      // Handle messages from the webview
      this._panel.webview.onDidReceiveMessage(
        (message: WebviewMessage) => this.handleMessage(message),
        null,
        this._disposables
      );
    }

    // Set webview content
    this._panel.webview.html = getWebviewContent(
      this._panel.webview,
      this._extensionUri
    );

    // Try to load saved configuration
    let savedConfig: DesignerConfig | null = null;
    if (projectPath) {
      savedConfig = await loadDesignerConfig(projectPath, concept, entityName);
      if (savedConfig) {
        console.log('[Entity Designer] Found saved config, will restore column settings');
      }
    }

    // Store pending init data - will be sent when webview sends 'ready'
    this._pendingInit = { externalTable, concept, entityName, savedConfig };

    // Also try sending after a delay as fallback
    setTimeout(() => {
      if (this._pendingInit) {
        console.log('[Entity Designer] Sending init via timeout fallback');
        this.sendInitMessage(
          this._pendingInit.externalTable,
          this._pendingInit.concept,
          this._pendingInit.entityName,
          this._pendingInit.savedConfig
        );
      }
    }, 500);
  }

  /**
   * Send initialization data to the webview
   */
  private sendInitMessage(
    externalTable: ExternalTable,
    concept: string,
    entityName: string,
    savedConfig?: DesignerConfig | null
  ): void {
    if (!this._panel) {return;}

    const initMessage: WebviewInitMessage = {
      type: 'init',
      data: {
        columns: externalTable.columns,
        existingHubs: this._existingHubs,
        concept,
        entityName,
        sourceTable: externalTable.name,
        savedColumns: savedConfig && savedConfig.columns.length > 0 ? savedConfig.columns : undefined
      }
    };

    if (savedConfig) {
      console.log('[Entity Designer] Sending init with saved config:', savedConfig.columns.length, 'columns');
    }

    // Store current entity context for config-first generation
    this._currentEntity = {
      concept,
      entityName,
      sourceTable: externalTable.name,
      sourceColumns: externalTable.columns.map(c => ({ name: c.name, dataType: c.dataType }))
    };

    this._panel.webview.postMessage(initMessage);
  }

  /**
   * Handle messages from the webview
   */
  private async handleMessage(message: WebviewMessage): Promise<void> {
    console.log('[Entity Designer] Received message:', message.type);
    
    switch (message.type) {
      case 'ready':
        // Webview is ready, send init data
        if (this._pendingInit) {
          console.log('[Entity Designer] Webview ready, sending init data');
          this.sendInitMessage(
            this._pendingInit.externalTable,
            this._pendingInit.concept,
            this._pendingInit.entityName,
            this._pendingInit.savedConfig
          );
          this._pendingInit = undefined;
        }
        break;
      case 'generate':
        await this.handleGenerate(message.target);
        break;
      case 'saveConfig':
        await this.handleSaveConfig(message.columns);
        break;
      case 'update':
        // Legacy - column updates now handled via saveConfig
        break;
    }
  }

  /**
   * Save config to JSON file (Config-First: JSON is Single Source of Truth)
   */
  private async handleSaveConfig(columns: SavedColumnConfig[]): Promise<void> {
    if (!this._projectPath || !this._currentEntity) {
      console.error('[Entity Designer] Cannot save config: missing project path or entity context');
      return;
    }

    const config: DesignerConfig = {
      concept: this._currentEntity.concept,
      entityName: this._currentEntity.entityName,
      sourceTable: this._currentEntity.sourceTable,
      columns,
      savedAt: new Date().toISOString()
    };

    await saveDesignerConfig(this._projectPath, config);
    console.log('[Entity Designer] Config saved to JSON');
  }

  /**
   * Handle generate request - reads config from JSON file (Config-First)
   */
  private async handleGenerate(target: 'all' | 'hub' | 'satellite' | 'links'): Promise<void> {
    try {
      if (!this._projectPath || !this._currentEntity) {
        throw new Error('Project path or entity context not set');
      }

      const { concept, entityName, sourceTable, sourceColumns } = this._currentEntity;

      // Load config from JSON (Single Source of Truth)
      const savedConfig = await loadDesignerConfig(this._projectPath, concept, entityName);
      if (!savedConfig || savedConfig.columns.length === 0) {
        throw new Error('No saved configuration found. Please configure columns first.');
      }

      vscode.window.showInformationMessage(`Generating ${target} from config...`);
      
      // Determine which targets to generate
      let targets: ('hub' | 'satellite' | 'links')[];
      if (target === 'all') {
        targets = ['hub', 'satellite', 'links'];
      } else {
        targets = [target];
      }

      // Build EntityDesignConfig from saved JSON config
      const config: EntityDesignConfig = {
        concept,
        entityName,
        sourceTable,
        columns: savedConfig.columns.map(c => ({
          name: c.name,
          sourceName: c.sourceName || c.name,
          dataType: c.dataType || 'NVARCHAR(MAX)',
          columnType: c.columnType as 'hub' | 'satellite' | 'link' | 'metadata' | 'ignore',
          includeInHashDiff: c.columnType === 'satellite',
          foreignKeyTarget: c.foreignKeyTarget,
          nullable: c.nullable ?? true
        })),
        ghostRecordValue: '-1'
      };

      // Generate Data Vault objects
      const result = await generateDataVaultObjects(config, this._projectPath, targets);
      
      if (result.success) {
        // Generate schema YAML
        await generateSchemaYaml(config, result.files, this._projectPath);
        
        // Update config with generated objects info
        savedConfig.generatedObjects = targets;
        savedConfig.savedAt = new Date().toISOString();
        await saveDesignerConfig(this._projectPath, savedConfig);
        
        // Show success message with file count
        const fileCount = result.files.length;
        vscode.window.showInformationMessage(
          `Generated ${fileCount} file(s): ${result.files.map(f => path.basename(f.path)).join(', ')}`
        );

        // Open generated files in editor
        for (const file of result.files) {
          const doc = await vscode.workspace.openTextDocument(file.path);
          await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
        }
      } else {
        vscode.window.showErrorMessage(`Generation failed: ${result.errors.join(', ')}`);
      }
      
      // Send completion message back to webview
      this._panel?.webview.postMessage({
        type: 'generationComplete',
        success: result.success,
        files: result.files.map(f => f.path),
        errors: result.errors
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Generation failed: ${errorMessage}`);
      
      this._panel?.webview.postMessage({
        type: 'generationComplete',
        success: false,
        files: [],
        errors: [errorMessage]
      });
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
    
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
