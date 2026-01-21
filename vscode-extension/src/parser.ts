import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { glob } from 'glob';
import {
  DbtModel,
  DbtProjectConfig,
  HubInfo,
  SatelliteInfo,
  LinkInfo,
  PitInfo,
  BridgeInfo,
  ProjectMetadata,
  ModelType,
  MaterializedType,
  YamlModelDefinition,
  YamlColumnDefinition,
  ColumnInfo,
  ExternalTable
} from './types';

/**
 * Parser for dbt projects - extracts model metadata from YAML schema files
 * Primary source: _*__models.yml files (dbt schema documentation)
 * Fallback: SQL file analysis for refs/sources only
 */
export class DbtProjectParser {
  private projectPath: string;
  private projectConfig: DbtProjectConfig | null = null;
  private yamlModels: Map<string, YamlModelDefinition> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Parse the entire dbt project and return metadata
   */
  async parse(): Promise<ProjectMetadata> {
    console.log(`[DataVault] Parsing project at: ${this.projectPath}`);
    
    // Load dbt_project.yml
    this.projectConfig = await this.loadProjectConfig();
    console.log(`[DataVault] Loaded config for project: ${this.projectConfig.name}`);
    
    // Find all model paths
    const modelPaths = this.projectConfig['model-paths'] || ['models'];
    
    // Step 1: Load all YAML schema files first (primary source)
    for (const modelPath of modelPaths) {
      const fullPath = path.join(this.projectPath, modelPath);
      if (fs.existsSync(fullPath)) {
        await this.loadYamlSchemaFiles(fullPath);
      }
    }
    console.log(`[DataVault] Loaded ${this.yamlModels.size} models from YAML schema files`);

    // Step 2: Find SQL files to get refs/sources and file paths
    const sqlFiles: string[] = [];
    for (const modelPath of modelPaths) {
      const fullPath = path.join(this.projectPath, modelPath);
      if (fs.existsSync(fullPath)) {
        const files = this.findSqlFilesSync(fullPath);
        sqlFiles.push(...files);
      }
    }
    console.log(`[DataVault] Found ${sqlFiles.length} SQL files`);

    // Step 3: Build model list - YAML as primary source, SQL for refs/sources
    const models: DbtModel[] = [];
    const processedModels = new Set<string>();

    // First: Process all models defined in YAML
    for (const [modelName, yamlDef] of this.yamlModels) {
      const sqlFile = sqlFiles.find(f => path.basename(f, '.sql') === modelName);
      const model = await this.buildModelFromYaml(modelName, yamlDef, sqlFile);
      if (model) {
        models.push(model);
        processedModels.add(modelName);
      }
    }

    // Second: Process SQL files not in YAML (legacy/undocumented models)
    for (const sqlFile of sqlFiles) {
      const modelName = path.basename(sqlFile, '.sql');
      if (!processedModels.has(modelName)) {
        console.log(`[DataVault] Warning: Model '${modelName}' has no YAML documentation`);
        const model = await this.parseModelFromSql(sqlFile);
        if (model) {
          models.push(model);
        }
      }
    }

    // Categorize models
    const hubs = models.filter(m => m.type === 'hub').map(m => this.enrichHub(m, models));
    const satellites = models.filter(m => m.type === 'satellite' || m.type === 'effectivity_satellite')
      .map(m => this.enrichSatellite(m, models));
    const links = models.filter(m => m.type === 'link').map(m => this.enrichLink(m, models));
    const pits = models.filter(m => m.type === 'pit').map(m => this.enrichPit(m, models));
    const bridges = models.filter(m => m.type === 'bridge').map(m => this.enrichBridge(m, models));
    const marts = models.filter(m => m.layer === 'mart');
    const staging = models.filter(m => m.layer === 'staging');

    // Step 4: Parse sources.yml for external tables
    const externalTables = await this.parseSourcesYaml(modelPaths);
    console.log(`[DataVault] Loaded ${externalTables.length} external tables from sources.yml`);

    // Extract unique concepts and schemas
    const concepts = [...new Set(models.map(m => m.concept).filter(c => c))];
    const schemas = [...new Set(models.map(m => m.schema).filter(s => s))];

    return {
      projectName: this.projectConfig.name,
      projectPath: this.projectPath,
      version: this.projectConfig.version,
      profile: this.projectConfig.profile,
      models,
      hubs,
      satellites,
      links,
      pits,
      bridges,
      marts,
      staging,
      externalTables,
      concepts,
      schemas,
      lastScanned: new Date()
    };
  }

  /**
   * Load all YAML schema files (*__models.yml, schema.yml) recursively
   */
  private async loadYamlSchemaFiles(dir: string): Promise<void> {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          await this.loadYamlSchemaFiles(fullPath);
        } else if (entry.isFile() && this.isSchemaYamlFile(entry.name)) {
          await this.parseYamlSchemaFile(fullPath);
        }
      }
    } catch (error) {
      console.error(`[DataVault] Error reading directory ${dir}:`, error);
    }
  }

  /**
   * Check if file is a schema YAML file (not sources.yml)
   */
  private isSchemaYamlFile(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    // Match: _*__models.yml, schema.yml, *_schema.yml but NOT sources.yml
    return (lower.endsWith('.yml') || lower.endsWith('.yaml')) && 
           !lower.includes('sources') &&
           !lower.includes('packages') &&
           (lower.includes('models') || lower.includes('schema'));
  }

  /**
   * Parse a single YAML schema file and extract model definitions
   */
  private async parseYamlSchemaFile(filePath: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = yaml.parse(content);
      
      if (!parsed || !parsed.models || !Array.isArray(parsed.models)) {
        return;
      }

      const relativePath = path.relative(this.projectPath, filePath);
      const { layer, concept } = this.parsePathInfo(relativePath);
      
      console.log(`[DataVault] Parsing YAML: ${relativePath} (layer: ${layer}, concept: ${concept})`);

      for (const modelDef of parsed.models) {
        if (modelDef.name) {
          this.yamlModels.set(modelDef.name, {
            ...modelDef,
            _yamlPath: filePath,
            _layer: layer,
            _concept: concept
          });
        }
      }
    } catch (error) {
      console.error(`[DataVault] Error parsing YAML ${filePath}:`, error);
    }
  }

  /**
   * Build a DbtModel from YAML definition + optional SQL file for refs/sources
   */
  private async buildModelFromYaml(
    modelName: string, 
    yamlDef: YamlModelDefinition, 
    sqlFilePath?: string
  ): Promise<DbtModel | null> {
    const layer = yamlDef._layer || 'staging';
    
    // For staging models, extract concept from model name (e.g., werkportal_company -> werkportal)
    // For other layers, use the concept from the YAML path
    let concept = yamlDef._concept || '_common';
    if (layer === 'staging') {
      // Handle stg_<concept>_<entity> pattern (e.g., stg_tempo_worklog -> tempo)
      let nameToMatch = modelName;
      if (modelName.toLowerCase().startsWith('stg_')) {
        nameToMatch = modelName.substring(4); // Remove 'stg_' prefix
      }
      const match = nameToMatch.match(/^([a-z]+)_/i);
      if (match && !['ext'].includes(match[1].toLowerCase())) {
        concept = match[1].toLowerCase();
      }
    }
    
    const type = this.inferModelType('', modelName);
    const schema = this.determineSchema(layer, concept);
    
    // Extract columns from YAML with data types
    const columns: ColumnInfo[] = (yamlDef.columns || []).map((col: YamlColumnDefinition) => ({
      name: col.name,
      dataType: col.data_type,
      description: col.description
    }));
    
    // Get refs and sources from SQL file if available
    let refs: string[] = [];
    let sources: string[] = [];
    let filePath = '';
    let relativePath = '';
    
    if (sqlFilePath && fs.existsSync(sqlFilePath)) {
      const sqlContent = await fs.promises.readFile(sqlFilePath, 'utf-8');
      refs = this.extractRefs(sqlContent);
      sources = this.extractSources(sqlContent);
      filePath = sqlFilePath;
      relativePath = path.relative(this.projectPath, sqlFilePath);
    }

    // Determine materialization from dbt_project.yml config
    const materialized = this.determineMaterializedFromConfig(layer, type);

    return {
      name: modelName,
      schema,
      type,
      materialized,
      filePath,
      relativePath,
      columns,
      refs,
      sources,
      concept,
      layer,
      description: yamlDef.description,
      _yamlPath: yamlDef._yamlPath
    };
  }

  /**
   * Fallback: Parse model from SQL file only (for undocumented models)
   */
  private async parseModelFromSql(filePath: string): Promise<DbtModel | null> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath, '.sql');
    const relativePath = path.relative(this.projectPath, filePath);
    
    const { layer, concept } = this.parsePathInfo(relativePath);
    const type = this.inferModelType(relativePath, fileName);
    const refs = this.extractRefs(content);
    const sources = this.extractSources(content);
    const schema = this.determineSchema(layer, concept);
    const materialized = this.determineMaterializedFromConfig(layer, type);

    // No columns - YAML is missing!
    return {
      name: fileName,
      schema,
      type,
      materialized,
      filePath,
      relativePath,
      columns: [], // Empty - model needs YAML documentation
      refs,
      sources,
      concept,
      layer,
      description: '⚠️ No YAML documentation'
    };
  }

  /**
   * Recursively find all .sql files in a directory (synchronous)
   */
  private findSqlFilesSync(dir: string): string[] {
    const results: string[] = [];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          results.push(...this.findSqlFilesSync(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.sql')) {
          results.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`[DataVault] Error reading directory ${dir}:`, error);
    }
    
    return results;
  }

  /**
   * Load and parse dbt_project.yml
   */
  private async loadProjectConfig(): Promise<DbtProjectConfig> {
    const configPath = path.join(this.projectPath, 'dbt_project.yml');
    console.log(`[DataVault] Loading config from: ${configPath}`);
    const content = await fs.promises.readFile(configPath, 'utf-8');
    return yaml.parse(content) as DbtProjectConfig;
  }

  /**
   * Parse layer and concept from file path
   */
  private parsePathInfo(relativePath: string): { layer: DbtModel['layer']; concept: string } {
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const parts = normalizedPath.toLowerCase().split('/');
    
    let layer: DbtModel['layer'] = 'staging';
    let concept = '_common';
    
    if (parts.includes('staging')) {
      layer = 'staging';
      let fileName = path.basename(relativePath, '.sql').replace('.yml', '').replace('.yaml', '');
      // Handle stg_<concept>_<entity> pattern
      if (fileName.toLowerCase().startsWith('stg_')) {
        fileName = fileName.substring(4);
      }
      const match = fileName.match(/^([a-z]+)_/);
      if (match && !['ext'].includes(match[1])) {
        concept = match[1];
      }
    } else if (parts.includes('raw_vault')) {
      layer = 'raw_vault';
      const rawVaultIdx = parts.indexOf('raw_vault');
      if (rawVaultIdx < parts.length - 1) {
        const nextPart = parts[rawVaultIdx + 1];
        if (!['hubs', 'satellites', 'links'].includes(nextPart)) {
          concept = nextPart;
        }
      }
    } else if (parts.includes('business_vault')) {
      layer = 'business_vault';
    } else if (parts.includes('mart')) {
      layer = 'mart';
      const martIdx = parts.indexOf('mart');
      if (martIdx < parts.length - 1) {
        const nextPart = parts[martIdx + 1];
        concept = nextPart;
      }
    }
    
    return { layer, concept };
  }

  /**
   * Infer model type from path and filename
   */
  private inferModelType(relativePath: string, fileName: string): ModelType {
    const pathLower = relativePath.toLowerCase();
    const nameLower = fileName.toLowerCase();

    // Check path-based patterns first
    if (pathLower.includes('/hubs/') || pathLower.includes('\\hubs\\')) {
      return 'hub';
    }
    if (pathLower.includes('/satellites/') || pathLower.includes('\\satellites\\')) {
      if (nameLower.startsWith('eff_sat_')) {
        return 'effectivity_satellite';
      }
      return 'satellite';
    }
    if (pathLower.includes('/links/') || pathLower.includes('\\links\\')) {
      return 'link';
    }
    if (pathLower.includes('/staging/') || pathLower.includes('\\staging\\')) {
      return 'staging';
    }
    if (pathLower.includes('/mart/') || pathLower.includes('\\mart\\')) {
      return 'mart';
    }
    if (pathLower.includes('/business_vault/') || pathLower.includes('\\business_vault\\')) {
      if (nameLower.startsWith('pit_')) return 'pit';
      if (nameLower.startsWith('bridge_')) return 'bridge';
      return 'table';
    }

    // Check name-based patterns
    if (nameLower.startsWith('hub_')) return 'hub';
    if (nameLower.startsWith('eff_sat_')) return 'effectivity_satellite';
    if (nameLower.startsWith('sat_')) return 'satellite';
    if (nameLower.startsWith('link_')) return 'link';
    if (nameLower.startsWith('stg_')) return 'staging';
    if (nameLower.startsWith('pit_')) return 'pit';
    if (nameLower.startsWith('bridge_')) return 'bridge';
    if (nameLower.startsWith('dim_') || nameLower.startsWith('fact_')) return 'mart';
    if (nameLower.startsWith('ref_')) return 'ref';

    return 'view';
  }

  /**
   * Determine schema based on layer and concept
   */
  private determineSchema(layer: DbtModel['layer'], concept: string): string {
    switch (layer) {
      case 'staging':
        return 'stg';
      case 'raw_vault':
        return concept === '_common' ? 'vault' : `vault_${concept}`;
      case 'business_vault':
        return 'vault';
      case 'mart':
        return concept === '_common' ? 'mart' : `mart_${concept}`;
      default:
        return 'dbo';
    }
  }

  /**
   * Determine materialization from dbt_project.yml config (not from SQL content)
   */
  private determineMaterializedFromConfig(layer: DbtModel['layer'], type: ModelType): MaterializedType {
    // Default based on layer/type (matches dbt_project.yml)
    if (layer === 'staging') return 'view';
    if (layer === 'mart') return 'view';
    if (layer === 'raw_vault') return 'incremental';
    if (layer === 'business_vault') return 'table';
    
    return 'view';
  }

  /**
   * Extract ref() calls from SQL content
   */
  private extractRefs(content: string): string[] {
    const refs: string[] = [];
    const refPattern = /\{\{\s*ref\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g;
    let match;
    while ((match = refPattern.exec(content)) !== null) {
      if (!refs.includes(match[1])) {
        refs.push(match[1]);
      }
    }
    return refs;
  }

  /**
   * Extract source() calls from SQL content
   */
  private extractSources(content: string): string[] {
    const sources: string[] = [];
    const sourcePattern = /\{\{\s*source\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g;
    let match;
    while ((match = sourcePattern.exec(content)) !== null) {
      const sourceName = `${match[1]}.${match[2]}`;
      if (!sources.includes(sourceName)) {
        sources.push(sourceName);
      }
    }
    return sources;
  }

  /**
   * Enrich hub with related satellites
   */
  private enrichHub(model: DbtModel, allModels: DbtModel[]): HubInfo {
    const hubName = model.name.replace(/^hub_/, '');
    
    // Find satellites that reference this hub
    const satellites = allModels
      .filter(m => m.type === 'satellite' || m.type === 'effectivity_satellite')
      .filter(m => m.refs.includes(model.name) || m.name.includes(hubName))
      .map(m => m.name);

    // Try to find business key from columns (first column after hk_*)
    let businessKey: string | null = null;
    const nonMetaCols = model.columns.filter(c => 
      !c.name.toLowerCase().startsWith('hk_') && 
      !c.name.toLowerCase().startsWith('dss_')
    );
    if (nonMetaCols.length > 0) {
      businessKey = nonMetaCols[0].name;
    }

    return {
      ...model,
      type: 'hub',
      businessKey,
      satellites
    };
  }

  /**
   * Enrich satellite with parent hub
   */
  private enrichSatellite(model: DbtModel, allModels: DbtModel[]): SatelliteInfo {
    // Find parent hub from refs
    const parentHub = model.refs.find(ref => ref.startsWith('hub_')) || null;
    
    // Filter out metadata columns
    const metadataColumns = ['hk_', 'hd_', 'dss_', 'load_date', 'record_source'];
    const attributes = model.columns
      .filter(col => !metadataColumns.some(prefix => col.name.toLowerCase().startsWith(prefix)))
      .map(col => col.name);

    return {
      ...model,
      type: model.type as 'satellite' | 'effectivity_satellite',
      parentHub,
      attributes,
      isEffectivity: model.type === 'effectivity_satellite' || model.name.startsWith('eff_sat_')
    };
  }

  /**
   * Enrich link with connected hubs
   */
  private enrichLink(model: DbtModel, allModels: DbtModel[]): LinkInfo {
    // Find connected hubs from refs
    const connectedHubs = model.refs.filter(ref => ref.startsWith('hub_'));

    return {
      ...model,
      type: 'link',
      connectedHubs
    };
  }

  /**
   * Enrich PIT with base hub and satellites
   */
  private enrichPit(model: DbtModel, allModels: DbtModel[]): PitInfo {
    const baseHub = model.refs.find(ref => ref.startsWith('hub_')) || null;
    const includedSatellites = model.refs.filter(ref => 
      ref.startsWith('sat_') || ref.startsWith('eff_sat_')
    );

    return {
      ...model,
      type: 'pit',
      baseHub,
      includedSatellites
    };
  }

  /**
   * Enrich Bridge with base link and satellites
   */
  private enrichBridge(model: DbtModel, allModels: DbtModel[]): BridgeInfo {
    const baseLink = model.refs.find(ref => ref.startsWith('link_')) || null;
    const includedSatellites = model.refs.filter(ref => 
      ref.startsWith('sat_') || ref.startsWith('eff_sat_')
    );

    return {
      ...model,
      type: 'bridge',
      baseLink,
      includedSatellites
    };
  }

  /**
   * Parse sources.yml files to extract external table definitions
   */
  private async parseSourcesYaml(modelPaths: string[]): Promise<ExternalTable[]> {
    const externalTables: ExternalTable[] = [];

    for (const modelPath of modelPaths) {
      const fullPath = path.join(this.projectPath, modelPath);
      if (!fs.existsSync(fullPath)) continue;

      // Find all sources.yml files
      const sourcesFiles = await this.findSourcesYamlFiles(fullPath);
      
      for (const sourcesFile of sourcesFiles) {
        try {
          const content = await fs.promises.readFile(sourcesFile, 'utf-8');
          const parsed = yaml.parse(content);
          
          if (!parsed || !parsed.sources || !Array.isArray(parsed.sources)) {
            continue;
          }

          for (const source of parsed.sources) {
            const sourceName = source.name || 'unknown';
            const sourceSchema = source.schema || 'stg';
            
            if (!source.tables || !Array.isArray(source.tables)) continue;

            for (const table of source.tables) {
              if (!table.name) continue;

              // Extract columns
              const columns: ColumnInfo[] = (table.columns || []).map((col: YamlColumnDefinition) => ({
                name: col.name,
                dataType: col.data_type,
                description: col.description
              }));

              // Extract concept from location or name
              let concept = '_common';
              if (table.external?.location) {
                // Parse location like "werkportal/postgres/public.wp_company_client.parquet"
                const locationParts = table.external.location.split('/');
                if (locationParts.length > 0) {
                  concept = locationParts[0].toLowerCase();
                }
              } else if (table.name.startsWith('ext_')) {
                // Extract from name like "ext_werkportal_company"
                const nameParts = table.name.substring(4).split('_');
                if (nameParts.length > 1) {
                  concept = nameParts[0].toLowerCase();
                }
              }

              externalTables.push({
                name: table.name,
                description: table.description,
                sourceName,
                schema: sourceSchema,
                columns,
                location: table.external?.location,
                fileFormat: table.external?.file_format,
                dataSource: table.external?.data_source,
                concept,
                _yamlPath: sourcesFile
              });
            }
          }
        } catch (error) {
          console.error(`[DataVault] Error parsing sources.yml ${sourcesFile}:`, error);
        }
      }
    }

    return externalTables;
  }

  /**
   * Find all sources.yml files recursively
   */
  private async findSourcesYamlFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const subFiles = await this.findSourcesYamlFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase();
          if (lower === 'sources.yml' || lower === 'sources.yaml' || lower.includes('sources')) {
            if (lower.endsWith('.yml') || lower.endsWith('.yaml')) {
              files.push(fullPath);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[DataVault] Error finding sources files in ${dir}:`, error);
    }
    
    return files;
  }
}

/**
 * Find dbt_project.yml in workspace
 */
export async function findDbtProjects(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<string[]> {
  const projects: string[] = [];
  
  for (const folder of workspaceFolders) {
    console.log(`[DataVault] Searching for dbt_project.yml in: ${folder.uri.fsPath}`);
    
    // First check root directory directly
    const rootDbtProject = path.join(folder.uri.fsPath, 'dbt_project.yml');
    if (fs.existsSync(rootDbtProject)) {
      console.log(`[DataVault] Found dbt_project.yml at root: ${folder.uri.fsPath}`);
      projects.push(folder.uri.fsPath);
      continue;
    }
    
    // Then try glob for nested projects
    try {
      const files = await glob('**/dbt_project.yml', {
        cwd: folder.uri.fsPath,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dbt_packages/**', '**/.git/**']
      });
      
      console.log(`[DataVault] Glob found ${files.length} dbt_project.yml files`);
      
      for (const file of files) {
        projects.push(path.dirname(file));
      }
    } catch (error) {
      console.error(`[DataVault] Glob error:`, error);
    }
  }
  
  console.log(`[DataVault] Total projects found: ${projects.length}`);
  return projects;
}
