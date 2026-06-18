import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getWebviewContent } from './getWebviewContent';
import { migrateV1toV2 } from '../../v2/services/configStoreV2';
import { isV1Config, isV2Config } from '../../v2/types';

/**
 * Extension-side types mirroring the webview types.
 * These are simplified — the full types live in src/v2/types/.
 */
interface EntityConfigV2 {
  version: 2;
  concept: string;
  sourceSystem: string;
  sourceTable: string;
  stagingModel: string;
  objects: Record<string, unknown>;
  columns: Record<string, unknown>;
  reservedKeywords: string[];
  layout?: unknown;
  savedAt: string;
}

type V2WebviewMessage =
  | { type: 'ready' }
  | { type: 'save'; config: EntityConfigV2 }
  | { type: 'generate'; objectNames?: string[] }
  | { type: 'validate' }
  | { type: 'previewCode'; objectName: string };

/**
 * Manages the Entity Designer v2 webview panel.
 *
 * Architecture:
 * - Singleton panel per workspace
 * - React Flow canvas for visual Data Vault object modeling
 * - Object-first paradigm: Hub/Sat/Link nodes, staging auto-derived
 * - Config persisted in .vscode/entity-designer/<concept>_<entity>.json (v2 format)
 */
export class EntityDesignerV2Provider {
  public static readonly viewType = 'datavault.entityDesignerV2';

  private static currentPanel: EntityDesignerV2Provider | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private _projectPath: string;
  private _concept: string;
  private _entityName: string;
  private _sourceTable: string;
  private _sourceColumns: Record<string, { dataType: string; description?: string }>;
  private _reservedKeywords: string[];
  private _isDirty: boolean = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    projectPath: string,
    concept: string,
    entityName: string,
    sourceTable: string,
    sourceColumns: Record<string, { dataType: string; description?: string }>,
    reservedKeywords: string[]
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._projectPath = projectPath;
    this._concept = concept;
    this._entityName = entityName;
    this._sourceTable = sourceTable;
    this._sourceColumns = sourceColumns;
    this._reservedKeywords = reservedKeywords;

    this._panel.webview.html = getWebviewContent(this._panel.webview, extensionUri);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message: V2WebviewMessage) => this.handleMessage(message),
      null,
      this._disposables
    );

    this.updateTitle();
  }

  /**
   * Create or reveal the Entity Designer v2 panel.
   */
  public static async createOrShow(
    extensionUri: vscode.Uri,
    projectPath: string,
    concept: string,
    entityName: string,
    sourceTable: string,
    sourceColumns: Record<string, { dataType: string; description?: string }> = {},
    reservedKeywords: string[] = []
  ): Promise<EntityDesignerV2Provider> {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (EntityDesignerV2Provider.currentPanel) {
      EntityDesignerV2Provider.currentPanel._panel.reveal(column);

      if (
        EntityDesignerV2Provider.currentPanel._entityName !== entityName ||
        EntityDesignerV2Provider.currentPanel._concept !== concept
      ) {
        EntityDesignerV2Provider.currentPanel._concept = concept;
        EntityDesignerV2Provider.currentPanel._entityName = entityName;
        EntityDesignerV2Provider.currentPanel._sourceTable = sourceTable;
        EntityDesignerV2Provider.currentPanel._projectPath = projectPath;
        EntityDesignerV2Provider.currentPanel._sourceColumns = sourceColumns;
        EntityDesignerV2Provider.currentPanel._reservedKeywords = reservedKeywords;
        EntityDesignerV2Provider.currentPanel.updateTitle();
        await EntityDesignerV2Provider.currentPanel.loadAndSendConfig();
      }

      return EntityDesignerV2Provider.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      EntityDesignerV2Provider.viewType,
      `Entity Designer v2: ${entityName}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'out', 'webviews'),
        ],
      }
    );

    const provider = new EntityDesignerV2Provider(
      panel, extensionUri, projectPath, concept, entityName, sourceTable,
      sourceColumns, reservedKeywords
    );
    EntityDesignerV2Provider.currentPanel = provider;
    return provider;
  }

  // ─── Message Handling ──────────────────────────────────────────
  private async handleMessage(message: V2WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.loadAndSendConfig();
        break;

      case 'save':
        await this.saveConfig(message.config);
        break;

      case 'generate':
        await this.generateModels(message.objectNames);
        break;

      case 'validate':
        await this.validateConfig();
        break;

      case 'previewCode':
        await this.previewCode(message.objectName);
        break;
    }
  }

  // ─── Config Load/Save ─────────────────────────────────────────
  private getConfigPath(): string {
    return path.join(
      this._projectPath,
      '.vscode',
      'entity-designer',
      `${this._concept}_${this._entityName}.json`
    );
  }

  private async loadAndSendConfig(): Promise<void> {
    try {
      let config: EntityConfigV2 | null = null;

      // 1. Try the exact config path (concept_entityName.json)
      const configPath = this.getConfigPath();
      if (fs.existsSync(configPath)) {
        config = this.readConfigFile(configPath);
      }

      // 2. Fallback: search by sourceTable. Handles the case where the
      //    config was saved under a different entity name (e.g. v1 stored
      //    "idms_address" while the source table is "ext_idms_address_main").
      if (!config && this._sourceTable) {
        const found = this.findConfigBySourceTable(this._sourceTable);
        if (found) {
          config = found.config;
          // Sync identity to the found file so future saves target it
          this._concept = found.concept;
          this._entityName = found.entityName;
          this.updateTitle();
        }
      }

      // 3. Nothing found → start with an empty config
      if (!config) {
        config = this.createEmptyConfig();
      }

      // Load available hubs from existing configs
      const availableHubs = this.loadAvailableHubs();
      const availableConcepts = this.loadAvailableConcepts();
      const sourceColumns = config.columns || {};

      this._panel.webview.postMessage({
        type: 'init',
        config,
        availableHubs,
        availableConcepts,
        sourceColumns,
      });
    } catch (err) {
      this._panel.webview.postMessage({
        type: 'error',
        message: `Failed to load config: ${err}`,
      });
    }
  }

  /**
   * Read a config file, migrating v1 → v2 when needed.
   * Returns null for unrecognized formats.
   */
  private readConfigFile(filePath: string): EntityConfigV2 | null {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (isV2Config(raw)) {
      return raw as unknown as EntityConfigV2;
    }
    if (isV1Config(raw)) {
      return migrateV1toV2(raw) as unknown as EntityConfigV2;
    }
    return null;
  }

  /**
   * Search the entity-designer directory for a config whose sourceTable
   * matches the given table. Used as a fallback when the derived entity
   * name does not match the saved file name.
   */
  private findConfigBySourceTable(
    sourceTable: string
  ): { config: EntityConfigV2; concept: string; entityName: string } | null {
    const dir = path.join(this._projectPath, '.vscode', 'entity-designer');
    if (!fs.existsSync(dir)) return null;

    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const filePath = path.join(dir, file);
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (raw?.sourceTable !== sourceTable) continue;

        const config = isV2Config(raw)
          ? (raw as unknown as EntityConfigV2)
          : isV1Config(raw)
            ? (migrateV1toV2(raw) as unknown as EntityConfigV2)
            : null;
        if (!config) continue;

        // Derive concept + entity name from the file name using the config's
        // own concept (which may itself contain underscores, e.g. "_common").
        const concept: string = raw.concept || '_common';
        const baseName = file.replace(/\.json$/, '');
        const prefix = `${concept}_`;
        const entityName = baseName.startsWith(prefix)
          ? baseName.substring(prefix.length)
          : baseName;

        return { config, concept, entityName };
      } catch {
        /* skip malformed config files */
      }
    }
    return null;
  }

  private createEmptyConfig(): EntityConfigV2 {
    const stagingModel = this._sourceTable.replace(/^ext_/, '');
    return {
      version: 2,
      concept: this._concept,
      sourceSystem: this.detectSourceSystem(),
      sourceTable: this._sourceTable,
      stagingModel,
      objects: {},
      columns: this._sourceColumns || {},
      reservedKeywords: this._reservedKeywords || [],
      savedAt: new Date().toISOString(),
    };
  }

  private detectSourceSystem(): string {
    if (this._sourceTable.includes('ewb_')) return 'ewb_abacus';
    if (this._sourceTable.includes('jira_')) return 'jira';
    if (this._sourceTable.includes('adworks_')) return 'adworks';
    return 'unknown';
  }

  private async saveConfig(config: EntityConfigV2): Promise<void> {
    try {
      const configPath = this.getConfigPath();
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this._isDirty = false;
      this.updateTitle();
      vscode.window.showInformationMessage(`Entity Designer v2: Config saved for ${this._entityName}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to save config: ${err}`);
    }
  }

  // ─── Code Generation ──────────────────────────────────────────
  private async generateModels(_objectNames?: string[]): Promise<void> {
    try {
      const genModule = await import('../../v2/services/entityGeneratorV2');

      const configPath = this.getConfigPath();
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const config = isV1Config(parsed) ? migrateV1toV2(parsed) : parsed;

      const validation = genModule.validateConfig(config);
      const validationErrors = validation.messages.filter((m: { severity: string }) => m.severity === 'error');
      if (validationErrors.length > 0) {
        this._panel.webview.postMessage({
          type: 'generateResult',
          success: false,
          files: [],
          errors: validationErrors.map((m: { message: string }) => m.message),
        });
        vscode.window.showErrorMessage(`Generation failed: ${validationErrors.map((m: { message: string }) => m.message).join(', ')}`);
        return;
      }

      const result = genModule.generateAll(config, { projectPath: this._projectPath });

      // Write generated files
      const writtenFiles: string[] = [];
      for (const file of result.files) {
        const fullPath = path.join(this._projectPath, file.relativePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, file.content, 'utf-8');
        writtenFiles.push(file.relativePath);
      }

      this._panel.webview.postMessage({
        type: 'generateResult',
        success: true,
        files: writtenFiles,
        errors: [],
      });

      vscode.window.showInformationMessage(
        `Entity Designer v2: Generated ${writtenFiles.length} files for ${this._entityName}`
      );
    } catch (err) {
      this._panel.webview.postMessage({
        type: 'generateResult',
        success: false,
        files: [],
        errors: [`Generation error: ${err}`],
      });
    }
  }

  // ─── Validation ────────────────────────────────────────────────
  private async validateConfig(): Promise<void> {
    try {
      const genModule = await import('../../v2/services/entityGeneratorV2');

      const configPath = this.getConfigPath();
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const config = isV1Config(parsed) ? migrateV1toV2(parsed) : parsed;

      const result = genModule.validateConfig(config);

      this._panel.webview.postMessage({
        type: 'validationResult',
        errors: result.messages.map((m: { severity: string; objectName?: string; field?: string; message: string }) => ({
          objectName: m.objectName || '',
          field: m.field || '',
          message: m.message,
          severity: m.severity as 'error' | 'warning',
        })),
      });

      if (result.valid) {
        vscode.window.showInformationMessage('Entity Designer v2: Validation passed ✓');
      }
    } catch (err) {
      this._panel.webview.postMessage({
        type: 'error',
        message: `Validation error: ${err}`,
      });
    }
  }

  // ─── Code Preview ──────────────────────────────────────────────
  private async previewCode(_objectName: string): Promise<void> {
    try {
      const genModule = await import('../../v2/services/entityGeneratorV2');

      const configPath = this.getConfigPath();
      if (!fs.existsSync(configPath)) return;

      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const config = isV1Config(parsed) ? migrateV1toV2(parsed) : parsed;

      const result = genModule.generateAll(config, { projectPath: this._projectPath });

      this._panel.webview.postMessage({
        type: 'codePreview',
        objectName: _objectName,
        files: result.files.map((f: { relativePath: string; content: string; fileType: string }) => ({
          path: f.relativePath,
          content: f.content,
          type: f.fileType,
        })),
      });
    } catch {
      // Silent fail for preview — user hasn't saved yet
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────
  private loadAvailableHubs(): string[] {
    try {
      const designerDir = path.join(this._projectPath, '.vscode', 'entity-designer');
      if (!fs.existsSync(designerDir)) return [];

      const hubs: string[] = [];
      for (const file of fs.readdirSync(designerDir)) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(designerDir, file), 'utf-8'));
          // Normalize v1 → v2 so hubs from legacy configs are also listed
          const config = isV2Config(raw)
            ? (raw as unknown as EntityConfigV2)
            : isV1Config(raw)
              ? (migrateV1toV2(raw) as unknown as EntityConfigV2)
              : null;
          if (!config?.objects) continue;
          for (const [name, obj] of Object.entries(config.objects)) {
            if ((obj as { type: string }).type === 'hub') {
              hubs.push(name);
            }
          }
        } catch { /* skip malformed */ }
      }
      return [...new Set(hubs)];
    } catch {
      return [];
    }
  }

  private loadAvailableConcepts(): string[] {
    return ['_common', 'jira', 'adworks'];
  }

  private updateTitle(): void {
    this._panel.title = `Entity Designer v2: ${this._entityName}${this._isDirty ? ' ●' : ''}`;
  }

  private dispose(): void {
    EntityDesignerV2Provider.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      d?.dispose();
    }
  }
}
