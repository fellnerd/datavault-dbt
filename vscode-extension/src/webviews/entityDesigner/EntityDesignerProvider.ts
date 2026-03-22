import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { 
  ExternalTable, 
  EntityDesignConfig, 
  WebviewMessage,
  WebviewInitMessage,
  SavedColumnConfig,
  WebviewSaveConfigMessage,
  LambdaVaultConfig,
  StagingModelInfo
} from '../../types';
import { getWebviewContent } from './getWebviewContent';
import { generateDataVaultObjects, generateSchemaYaml, generateVirtualViews } from '../../services/entityGenerator';
import { loadDesignerConfig, saveDesignerConfig, DesignerConfig, detectSourceTypeFromStaging } from '../../services/designerConfigStore';
import { deriveStagingName } from '../../services/stagingGenerator';

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
   * Extract available concepts from dbt_project.yml raw_vault configuration.
   * Returns the folder names under models.datavault.raw_vault (e.g. ['_common', 'jira']).
   */
  private extractAvailableConcepts(): string[] {
    if (!this._projectPath) {return [];}

    try {
      const configPath = path.join(this._projectPath, 'dbt_project.yml');
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = yaml.parse(content);

      const projectName = config?.name || 'datavault';
      const rawVault = config?.models?.[projectName]?.raw_vault;
      if (!rawVault || typeof rawVault !== 'object') {return [];}

      // Keys under raw_vault are the concept folders
      const concepts = Object.keys(rawVault).filter(
        k => !k.startsWith('+')  // skip dbt config keys like +schema
      );
      console.log(`[Entity Designer] Available concepts from dbt_project.yml: ${concepts.join(', ')}`);
      return concepts;
    } catch (error) {
      console.error('[Entity Designer] Error reading dbt_project.yml:', error);
      return [];
    }
  }

  /**
   * Load available staging models for Lambda Vault selection
   * Returns staging models from the same concept (excluding current entity)
   */
  private async loadAvailableStagingModels(concept: string, currentEntity: string): Promise<StagingModelInfo[]> {
    if (!this._projectPath) return [];

    const stagingDir = path.join(this._projectPath, 'models', 'staging');
    const stagingModels: StagingModelInfo[] = [];
    
    // Derive source concept from external table (e.g., ext_ewb_lohn_len_main → ewb)
    // Fall back to concept for legacy compatibility
    const sourceTable = this._currentEntity?.sourceTable;
    const sourceConcept = sourceTable 
      ? (sourceTable.replace(/^ext_/, '').split('_')[0] || concept) 
      : concept;
    const currentModelName = sourceTable 
      ? deriveStagingName(sourceTable) 
      : `${concept}_${currentEntity}`;

    try {
      if (!fs.existsSync(stagingDir)) return [];

      const files = await fs.promises.readdir(stagingDir);
      const sqlFiles = files.filter(f => f.endsWith('.sql') && !f.startsWith('_'));

      for (const file of sqlFiles) {
        const modelName = file.replace('.sql', '');
        // Only include models from same concept, exclude EXACT current model (not partial match)
        if (modelName.startsWith(sourceConcept + '_') && modelName !== currentModelName) {
          // Try to extract columns from the staging SQL
          const filePath = path.join(stagingDir, file);
          const columns = await this.extractStagingColumns(filePath);
          
          stagingModels.push({
            name: modelName,
            concept: sourceConcept,
            columns
          });
        }
      }

      console.log(`[Entity Designer] Found ${stagingModels.length} staging models for Lambda Vault`);
    } catch (error) {
      console.error('[Entity Designer] Error loading staging models:', error);
    }

    return stagingModels;
  }

  /**
   * Extract column names from a staging SQL file
   */
  private async extractStagingColumns(filePath: string): Promise<string[]> {
    // Read columns from _staging__models.yml instead of parsing SQL
    if (!this._projectPath) return [];
    
    const modelName = path.basename(filePath, '.sql');
    const yamlPath = path.join(this._projectPath, 'models', 'staging', '_staging__models.yml');
    
    try {
      if (!fs.existsSync(yamlPath)) {
        console.log(`[Entity Designer] No _staging__models.yml found`);
        return [];
      }
      
      const content = await fs.promises.readFile(yamlPath, 'utf-8');
      const yaml = require('js-yaml');
      const parsed = yaml.load(content) as { models?: Array<{ name: string; columns?: Array<{ name: string }> }> };
      
      if (!parsed?.models) return [];
      
      const model = parsed.models.find(m => m.name === modelName);
      if (!model?.columns) {
        console.log(`[Entity Designer] Model ${modelName} not found in _staging__models.yml`);
        return [];
      }
      
      const columns = model.columns.map(c => c.name);
      console.log(`[Entity Designer] Loaded ${columns.length} columns for ${modelName} from YAML`);
      return columns;
    } catch (err) {
      console.error(`[Entity Designer] Error reading _staging__models.yml:`, err);
      return [];
    }
  }

  /**
   * Load column names from the base staging model for Lambda Vault comparison
   */
  private async loadBaseStagingColumns(concept: string, entityName: string): Promise<string[]> {
    if (!this._projectPath) return [];

    const stagingDir = path.join(this._projectPath, 'models', 'staging');
    
    // Try source-table-derived name first (e.g., ewb_lohn_len_main.sql from ext_ewb_lohn_len_main)
    const sourceTable = this._currentEntity?.sourceTable;
    if (sourceTable) {
      const derivedFile = path.join(stagingDir, `${deriveStagingName(sourceTable)}.sql`);
      if (fs.existsSync(derivedFile)) {
        try {
          const columns = await this.extractStagingColumns(derivedFile);
          console.log(`[Entity Designer] Loaded ${columns.length} columns from staging ${deriveStagingName(sourceTable)}`);
          return columns;
        } catch (error) {
          console.error('[Entity Designer] Error loading staging columns:', error);
        }
      }
    }
    
    // Fallback: try concept_entity pattern (legacy)
    const baseStagingFile = path.join(stagingDir, `${concept}_${entityName}.sql`);

    try {
      if (fs.existsSync(baseStagingFile)) {
        const columns = await this.extractStagingColumns(baseStagingFile);
        console.log(`[Entity Designer] Loaded ${columns.length} columns from base staging ${concept}_${entityName}`);
        return columns;
      }
    } catch (error) {
      console.error('[Entity Designer] Error loading base staging columns:', error);
    }

    return [];
  }

  /**
   * Send initialization data to the webview
   */
  private async sendInitMessage(
    externalTable: ExternalTable,
    concept: string,
    entityName: string,
    savedConfig?: DesignerConfig | null
  ): Promise<void> {
    if (!this._panel) {return;}

    // DEBUG: Log the columns being sent to verify dataTypes
    console.log('[Entity Designer] Columns from externalTable:');
    externalTable.columns.slice(0, 5).forEach(c => {
      console.log(`  - ${c.name}: dataType = "${c.dataType}"`);
    });

    // Load available staging models for Lambda Vault
    const availableStagingModels = await this.loadAvailableStagingModels(concept, entityName);
    
    // Load base staging columns for Lambda Vault comparison
    const baseStagingColumns = await this.loadBaseStagingColumns(concept, entityName);

    // Extract available concepts from dbt_project.yml
    const availableConcepts = this.extractAvailableConcepts();

    // Determine which columns to send:
    // If savedConfig has columns, use those as the PRIMARY source (user's saved config is truth)
    // Only fall back to externalTable.columns if no saved config exists
    let columnsToSend = externalTable.columns;
    
    if (savedConfig && savedConfig.columns.length > 0) {
      // Build dataType map from externalTable for enrichment
      const extDataTypeMap = new Map(
        externalTable.columns.map(c => [c.name.toLowerCase(), c.dataType])
      );
      
      // Convert saved config columns to ColumnInfo format
      columnsToSend = savedConfig.columns.map(sc => ({
        name: sc.sourceName || sc.name,
        dataType: extDataTypeMap.get((sc.sourceName || sc.name).toLowerCase()) || sc.dataType || 'NVARCHAR(MAX)'
      }));
      
      console.log(`[Entity Designer] Using saved config columns (${columnsToSend.length}) instead of externalTable columns (${externalTable.columns.length})`);
    }

    const initMessage: WebviewInitMessage = {
      type: 'init',
      data: {
        columns: columnsToSend,
        existingHubs: this._existingHubs,
        concept,
        entityName,
        sourceTable: externalTable.name,
        savedColumns: savedConfig && savedConfig.columns.length > 0 ? savedConfig.columns : undefined,
        availableStagingModels,
        lambdaVault: savedConfig?.lambdaVault,
        baseStagingColumns,
        availableConcepts
      }
    };

    if (savedConfig) {
      console.log('[Entity Designer] Sending init with saved config:', savedConfig.columns.length, 'columns');
      if (savedConfig.lambdaVault?.enabled) {
        console.log('[Entity Designer] Lambda Vault enabled with delta:', savedConfig.lambdaVault.deltaStagingModel);
      }
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
        await this.handleGenerateWithContext(message);
        break;
      case 'saveConfig':
        const saveMsg = message as WebviewSaveConfigMessage;
        await this.handleSaveConfig(
          saveMsg.columns, 
          saveMsg.entityName, 
          saveMsg.lambdaVault,
          saveMsg.concept
        );
        break;
      // Note: updateDataType case removed - dataTypes are now synced to sources.yml on Generate
      case 'update':
        // Legacy - column updates now handled via saveConfig
        break;
    }
  }

  /**
   * Handle generate with context (concept/entity may have changed)
   */
  private async handleGenerateWithContext(message: any): Promise<void> {
    const { target, concept, entityName, originalConcept, originalEntityName, columns, lambdaVault } = message;
    
    // Check if concept or entity was renamed
    const conceptChanged = originalConcept && concept && concept !== originalConcept;
    const entityChanged = originalEntityName && entityName && entityName !== originalEntityName;
    
    if (conceptChanged || entityChanged) {
      console.log(`[Entity Designer] Detected rename: ${originalConcept}_${originalEntityName} -> ${concept}_${entityName}`);
      
      // Update current entity context to new values
      if (this._currentEntity) {
        this._currentEntity.concept = concept;
        this._currentEntity.entityName = entityName;
      }
      
      // Save config under NEW name first
      if (columns && this._projectPath) {
        const config: DesignerConfig = {
          concept,
          entityName,
          sourceTable: this._currentEntity?.sourceTable || '',
          columns,
          savedAt: new Date().toISOString(),
          lambdaVault
        };
        await saveDesignerConfig(this._projectPath, config);
        console.log(`[Entity Designer] Saved config as ${concept}_${entityName}.json`);
        
        // Delete old config file if it exists
        const oldConfigPath = path.join(this._projectPath, '.vscode', 'entity-designer', `${originalConcept}_${originalEntityName}.json`);
        if (fs.existsSync(oldConfigPath)) {
          fs.unlinkSync(oldConfigPath);
          console.log(`[Entity Designer] Deleted old config: ${originalConcept}_${originalEntityName}.json`);
        }
        
        // Delete old staging SQL if it exists
        const oldStagingPath = path.join(this._projectPath, 'models', 'staging', `${originalConcept}_${originalEntityName}.sql`);
        if (fs.existsSync(oldStagingPath)) {
          fs.unlinkSync(oldStagingPath);
          console.log(`[Entity Designer] Deleted old staging: ${originalConcept}_${originalEntityName}.sql`);
        }
      }
      
      // Update panel title
      if (this._panel) {
        this._panel.title = `Entity Designer: ${entityName}`;
      }
    } else if (columns && this._projectPath && this._currentEntity) {
      // No rename, but save current config before generate
      console.log(`[Entity Designer] Generate: saving ${columns.length} columns (ignored: ${columns.filter((c: SavedColumnConfig) => c.columnType === 'ignore').length})`);
      const config: DesignerConfig = {
        concept: this._currentEntity.concept,
        entityName: this._currentEntity.entityName,
        sourceTable: this._currentEntity.sourceTable,
        columns,
        savedAt: new Date().toISOString(),
        lambdaVault
      };
      await saveDesignerConfig(this._projectPath, config);
    }
    
    // Now proceed with generation
    await this.handleGenerate(target);
  }

  /**
   * Save config to JSON file (Config-First: JSON is Single Source of Truth)
   */
  private async handleSaveConfig(columns: SavedColumnConfig[], entityName?: string, lambdaVault?: LambdaVaultConfig, concept?: string): Promise<void> {
    if (!this._projectPath || !this._currentEntity) {
      console.error('[Entity Designer] Cannot save config: missing project path or entity context');
      return;
    }

    // Update concept if provided (user changed target concept/folder)
    if (concept && concept !== this._currentEntity.concept) {
      console.log(`[Entity Designer] Concept changed: ${this._currentEntity.concept} -> ${concept}`);
      this._currentEntity.concept = concept;
    }

    // Update entity name if provided (user renamed the entity)
    if (entityName && entityName !== this._currentEntity.entityName) {
      console.log(`[Entity Designer] Entity renamed: ${this._currentEntity.entityName} -> ${entityName}`);
      this._currentEntity.entityName = entityName;
      
      // Update panel title
      if (this._panel) {
        this._panel.title = `Entity Designer: ${entityName}`;
      }
    }

    const config: DesignerConfig = {
      concept: this._currentEntity.concept,
      entityName: this._currentEntity.entityName,
      sourceTable: this._currentEntity.sourceTable,
      columns,
      savedAt: new Date().toISOString(),
      lambdaVault
    };

    // Debug: Log column count and types
    console.log(`[Entity Designer] Saving ${columns.length} columns to JSON`);
    const ignoredCount = columns.filter(c => c.columnType === 'ignore').length;
    if (ignoredCount > 0) {
      console.log(`[Entity Designer] Including ${ignoredCount} ignored column(s)`);
    }

    await saveDesignerConfig(this._projectPath, config);
    console.log('[Entity Designer] Config saved to JSON');
    if (lambdaVault?.enabled) {
      console.log('[Entity Designer] Lambda Vault saved with delta:', lambdaVault.deltaStagingModel);
    }
  }

  /**
   * Update data type in sources.yml
   * This keeps the sources.yml in sync when user changes data types in the designer
   */
  private async handleUpdateDataType(columnName: string, newDataType: string): Promise<void> {
    if (!this._projectPath || !this._currentEntity) {
      console.error('[Entity Designer] Cannot update dataType: missing project path or entity context');
      return;
    }

    const sourceTable = this._currentEntity.sourceTable;
    const sourcesYmlPath = path.join(this._projectPath, 'models', 'staging', 'sources.yml');

    try {
      if (!fs.existsSync(sourcesYmlPath)) {
        console.warn('[Entity Designer] sources.yml not found');
        return;
      }

      const content = await fs.promises.readFile(sourcesYmlPath, 'utf-8');
      const parsed = yaml.parse(content);

      if (!parsed?.sources?.[0]?.tables) {
        console.warn('[Entity Designer] Invalid sources.yml structure');
        return;
      }

      // Find the table
      const table = parsed.sources[0].tables.find((t: { name: string }) => t.name === sourceTable);
      if (!table?.columns) {
        console.warn(`[Entity Designer] Table ${sourceTable} not found in sources.yml`);
        return;
      }

      // Find and update the column
      const column = table.columns.find((c: { name: string }) => 
        c.name.toLowerCase() === columnName.toLowerCase()
      );
      if (column) {
        column.data_type = newDataType;
        
        // Write back to file with preserved formatting
        const newContent = yaml.stringify(parsed, { 
          lineWidth: 0,
          defaultStringType: 'QUOTE_DOUBLE',
          defaultKeyType: 'QUOTE_DOUBLE'
        });
        await fs.promises.writeFile(sourcesYmlPath, newContent, 'utf-8');
        console.log(`[Entity Designer] Updated ${columnName} data_type to ${newDataType} in sources.yml`);
      } else {
        console.warn(`[Entity Designer] Column ${columnName} not found in table ${sourceTable}`);
      }
    } catch (error) {
      console.error('[Entity Designer] Error updating sources.yml:', error);
    }
  }

  /**
   * Batch sync all dataTypes to sources.yml (called on Generate)
   * Only writes once to avoid multiple file watcher triggers
   */
  private async syncDataTypesToSourcesYaml(columns: SavedColumnConfig[]): Promise<void> {
    if (!this._projectPath || !this._currentEntity) {
      console.warn('[Entity Designer] Cannot sync dataTypes: missing project path or entity context');
      return;
    }

    const sourceTable = this._currentEntity.sourceTable;
    const sourcesYmlPath = path.join(this._projectPath, 'models', 'staging', 'sources.yml');

    try {
      if (!fs.existsSync(sourcesYmlPath)) {
        console.warn('[Entity Designer] sources.yml not found, skipping dataType sync');
        return;
      }

      const content = await fs.promises.readFile(sourcesYmlPath, 'utf-8');
      const parsed = yaml.parse(content);

      if (!parsed?.sources?.[0]?.tables) {
        console.warn('[Entity Designer] Invalid sources.yml structure');
        return;
      }

      // Find the table
      const table = parsed.sources[0].tables.find((t: { name: string }) => t.name === sourceTable);
      if (!table?.columns) {
        console.warn(`[Entity Designer] Table ${sourceTable} not found in sources.yml`);
        return;
      }

      // Build map of column updates
      let updatedCount = 0;
      for (const col of columns) {
        const sourceName = col.sourceName || col.name;
        const ymlColumn = table.columns.find((c: { name: string }) => 
          c.name.toLowerCase() === sourceName.toLowerCase()
        );
        if (ymlColumn && col.dataType && ymlColumn.data_type !== col.dataType) {
          ymlColumn.data_type = col.dataType;
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        // Write back to file with preserved formatting
        const newContent = yaml.stringify(parsed, { 
          lineWidth: 0,
          defaultStringType: 'QUOTE_DOUBLE',
          defaultKeyType: 'QUOTE_DOUBLE'
        });
        await fs.promises.writeFile(sourcesYmlPath, newContent, 'utf-8');
        console.log(`[Entity Designer] Synced ${updatedCount} dataType(s) to sources.yml`);
      } else {
        console.log('[Entity Designer] No dataType changes to sync to sources.yml');
      }
    } catch (error) {
      console.error('[Entity Designer] Error syncing dataTypes to sources.yml:', error);
    }
  }

  /**
   * Recreate external table after dataType changes
   * Executes the datavault.createExternalTable command
   */
  private async recreateExternalTable(tableName: string): Promise<void> {
    try {
      console.log(`[Entity Designer] Recreating external table: ${tableName}`);
      
      // Create a minimal TreeItemData that the command expects
      const treeItemData = {
        label: tableName,
        type: 'external_table' as const,
        externalTable: {
          name: tableName,
          concept: this._currentEntity?.concept || '',
          columns: []
        }
      };
      
      // Execute the createExternalTable command
      await vscode.commands.executeCommand('datavault.createExternalTable', treeItemData);
      
      console.log(`[Entity Designer] External table recreated: ${tableName}`);
    } catch (error) {
      console.error('[Entity Designer] Error recreating external table:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Handle generate request - reads config from JSON file (Config-First)
   */
  private async handleGenerate(target: 'all' | 'hub' | 'satellite' | 'links' | 'dc_satellite' | 'ma_satellite' | 'pit'): Promise<void> {
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

      // Auto-detect sourceType from existing staging file if not saved in config
      let effectiveSourceType = savedConfig.sourceType;
      if (!effectiveSourceType) {
        effectiveSourceType = await detectSourceTypeFromStaging(this._projectPath, concept, entityName);
        // Save the detected type for future use
        savedConfig.sourceType = effectiveSourceType;
        await saveDesignerConfig(this._projectPath, savedConfig);
        console.log(`[Entity Designer] Auto-detected sourceType: ${effectiveSourceType}`);
      }

      // Special handling for PIT table generation
      if (target === 'pit') {
        await this.handleGeneratePIT(concept, entityName, savedConfig);
        return;
      }

      vscode.window.showInformationMessage(`Generating ${target} from config...`);

      // Build EntityDesignConfig from saved JSON config
      const config: EntityDesignConfig = {
        concept,
        entityName,
        sourceTable,
        sourceType: effectiveSourceType,  // Use detected/saved sourceType
        columns: savedConfig.columns.map(c => {
          // Determine if column is a satellite type (primary or additional)
          const isSatelliteType = c.columnType === 'satellite' || (c.additionalTypes?.includes('satellite') ?? false);
          // Use saved includeInHashDiff if available, otherwise default to true for satellite columns
          const includeInHashDiff = c.includeInHashDiff !== undefined ? c.includeInHashDiff : isSatelliteType;
          
          return {
            name: c.name,
            sourceName: c.sourceName || c.name,
            dataType: c.dataType || 'NVARCHAR(MAX)',
            columnType: c.columnType as 'hub' | 'satellite' | 'link' | 'dependent_child' | 'multi_active' | 'metadata' | 'ignore',
            // Pass additionalTypes for multi-target columns (e.g., link + satellite)
            additionalTypes: c.additionalTypes as ('hub' | 'satellite' | 'link' | 'dependent_child' | 'multi_active' | 'metadata' | 'ignore')[] | undefined,
            // Use saved value or default to true for satellite columns
            includeInHashDiff,
            foreignKeyTarget: c.foreignKeyTarget,
            // Split-Satellite: pass target hub for hub columns
            hubTarget: c.hubTarget,
            dependentChildForLink: c.dependentChildForLink,
            multiActiveSequence: c.multiActiveSequence,
            nullable: c.nullable ?? true
          };
        }),
        ghostRecordValue: '-1'
      };

      // Determine which targets to generate (including DC/MA satellites if configured)
      let targets: ('hub' | 'satellite' | 'links' | 'dc_satellite' | 'ma_satellite')[];
      if (target === 'all') {
        targets = ['hub', 'satellite', 'links'];
        // Auto-add DC Satellite if dependent_child columns exist
        if (savedConfig.columns.some(c => c.columnType === 'dependent_child')) {
          targets.push('dc_satellite');
        }
        // Auto-add MA Satellite if multi_active columns exist
        if (savedConfig.columns.some(c => c.columnType === 'multi_active')) {
          targets.push('ma_satellite');
        }
      } else if (target === 'links') {
        targets = ['links'];
        // Auto-add DC Satellite with links if dependent_child columns exist
        if (savedConfig.columns.some(c => c.columnType === 'dependent_child')) {
          targets.push('dc_satellite');
        }
      } else if (target === 'satellite') {
        targets = ['satellite'];
        // Auto-add DC Satellite if dependent_child columns exist
        if (savedConfig.columns.some(c => c.columnType === 'dependent_child')) {
          targets.push('dc_satellite');
        }
        // Auto-add MA Satellite if multi_active columns exist
        if (savedConfig.columns.some(c => c.columnType === 'multi_active')) {
          targets.push('ma_satellite');
        }
      } else {
        targets = [target];
      }

      // Generate Data Vault objects
      const result = await generateDataVaultObjects(config, this._projectPath, targets);
      
      if (result.success) {
        // Generate schema YAML
        await generateSchemaYaml(config, result.files, this._projectPath);
        
        // Generate Virtual Views if Lambda Vault is enabled
        if (savedConfig.lambdaVault?.enabled && savedConfig.lambdaVault.deltaStagingModel) {
          console.log('[Entity Designer] Lambda Vault enabled, generating virtual views...');
          const virtualFiles = await generateVirtualViews(
            config,
            savedConfig.lambdaVault,
            this._projectPath
          );
          result.files.push(...virtualFiles);
          console.log(`[Entity Designer] Generated ${virtualFiles.length} virtual view(s)`);
        }
        
        // Sync dataTypes to sources.yml (batch update)
        await this.syncDataTypesToSourcesYaml(savedConfig.columns);
        
        // Recreate external table to apply dataType changes
        await this.recreateExternalTable(sourceTable);
        
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
   * Handle PIT table generation from Entity Designer
   * Uses the pitTable command logic to generate a PIT for this entity
   */
  private async handleGeneratePIT(
    concept: string,
    entityName: string,
    savedConfig: DesignerConfig
  ): Promise<void> {
    try {
      if (!this._projectPath) {
        throw new Error('Project path not set');
      }

      const fs = await import('fs');
      const path = await import('path');
      const yaml = await import('yaml');

      // Construct hub and satellite names based on concept/entity
      const hubName = `hub_${entityName}`;
      const satName = `sat_${entityName}`;
      const pitName = `pit_${entityName}`;
      const hashKey = `hk_${entityName}`;

      // Check if hub and satellite exist
      const hubPath = path.join(this._projectPath, 'models', 'raw_vault', concept, 'hubs', `${hubName}.sql`);
      const satPath = path.join(this._projectPath, 'models', 'raw_vault', concept, 'satellites', `${satName}.sql`);

      // We'll generate based on what we expect, even if files don't exist yet
      // (they might be generated alongside the PIT)
      
      vscode.window.showInformationMessage(`Generating PIT table for ${entityName}...`);

      // Generate PIT SQL using automate_dv macro
      const pitSql = this.generatePitSql(pitName, hubName, hashKey, [satName], concept);

      // Ensure business_vault directory exists
      const businessVaultDir = path.join(this._projectPath, 'models', 'business_vault');
      if (!fs.existsSync(businessVaultDir)) {
        fs.mkdirSync(businessVaultDir, { recursive: true });
      }

      // Write PIT model file
      const pitPath = path.join(businessVaultDir, `${pitName}.sql`);
      fs.writeFileSync(pitPath, pitSql, 'utf-8');

      // Update business vault schema YAML
      await this.updateBusinessVaultSchemaForPIT(
        this._projectPath,
        pitName,
        hubName,
        [satName],
        hashKey
      );

      vscode.window.showInformationMessage(`PIT table ${pitName} created successfully.`);

      // Open the generated file
      const doc = await vscode.workspace.openTextDocument(pitPath);
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });

      // Notify webview
      this._panel?.webview.postMessage({
        type: 'generationComplete',
        success: true,
        files: [pitPath],
        errors: []
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`PIT generation failed: ${errorMessage}`);
      
      this._panel?.webview.postMessage({
        type: 'generationComplete',
        success: false,
        files: [],
        errors: [errorMessage]
      });
    }
  }

  /**
   * Generate PIT table SQL using automate_dv macro
   */
  private generatePitSql(
    pitName: string,
    hubName: string,
    hashKey: string,
    satellites: string[],
    concept: string
  ): string {
    const satYaml = satellites.map(sat => 
      `    "${sat}":\n      pk:\n        PK: "${hashKey}"\n      ldts:\n        LDTS: "dss_load_date"`
    ).join('\n');

    // Derive staging name from source table if available, fallback to concept_entity
    const sourceTable = this._currentEntity?.sourceTable;
    const stagingName = sourceTable 
      ? deriveStagingName(sourceTable)
      : `${concept}_${hubName.replace('hub_', '')}`;

    return `{{-
  PIT Table: ${pitName}
  Hub: ${hubName}
  Satellites: ${satellites.join(', ')}
  
  Point-in-Time table for efficient temporal queries.
  Generated by Data Vault dbt Explorer - Entity Designer.
-}}

{{ config(
    materialized='incremental',
    incremental_strategy='append',
    as_columnstore=false,
    schema='vault'
) }}

{%- set source_model = "${hubName}" -%}
{%- set src_pk = "${hashKey}" -%}
{%- set src_ldts = "dss_load_date" -%}

{%- set satellites = {
${satYaml}
} -%}

{%- set stage_tables_ldts = {
    "${stagingName}": "dss_load_date"
} -%}

-- Generate as-of dates from satellite load dates
WITH as_of_date_table AS (
    SELECT DISTINCT CAST(dss_load_date AS DATE) AS AS_OF_DATE
    FROM (
${satellites.map(sat => `        SELECT dss_load_date FROM {{ ref('${sat}') }}`).join('\n        UNION\n')}
    ) all_dates
    WHERE dss_load_date IS NOT NULL
)

{{ automate_dv.pit(
    source_model=source_model,
    src_pk=src_pk,
    as_of_dates_table="as_of_date_table",
    satellites=satellites,
    stage_tables_ldts=stage_tables_ldts,
    src_ldts=src_ldts
) }}
`;
  }

  /**
   * Update business vault schema YAML for PIT table
   */
  private async updateBusinessVaultSchemaForPIT(
    projectPath: string,
    pitName: string,
    hubName: string,
    satellites: string[],
    hashKey: string
  ): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const yaml = await import('yaml');

    const schemaPath = path.join(projectPath, 'models', 'business_vault', '_business_vault__models.yml');

    const columns = [
      { name: 'AS_OF_DATE', description: 'Point-in-time date', data_type: 'date' },
      { name: hashKey, description: `Hash Key from ${hubName}`, data_type: 'char(64)' },
      ...satellites.flatMap(sat => [
        { name: `${sat.toUpperCase()}_PK`, description: `Hash Key reference to ${sat}`, data_type: 'char(64)' },
        { name: `${sat.toUpperCase()}_LDTS`, description: `Load timestamp from ${sat}`, data_type: 'datetime2(7)' }
      ])
    ];

    const newPitDef = {
      name: pitName,
      description: `PIT table spanning ${hubName} and satellites: ${satellites.join(', ')}`,
      columns
    };

    let schemaContent: { version: number; models: Array<{ name: string; [key: string]: unknown }> };

    if (fs.existsSync(schemaPath)) {
      const existingContent = fs.readFileSync(schemaPath, 'utf-8');
      schemaContent = yaml.parse(existingContent) || { version: 2, models: [] };
      schemaContent.models = (schemaContent.models || []).filter(m => m.name !== pitName);
    } else {
      schemaContent = { version: 2, models: [] };
    }

    schemaContent.models.push(newPitDef);
    schemaContent.models.sort((a, b) => a.name.localeCompare(b.name));

    const yamlContent = yaml.stringify(schemaContent, { indent: 2, lineWidth: 0 });
    fs.writeFileSync(schemaPath, yamlContent, 'utf-8');
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
