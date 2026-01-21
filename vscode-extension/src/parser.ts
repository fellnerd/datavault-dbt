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
  MaterializedType
} from './types';

/**
 * Parser for dbt projects - extracts model metadata for Data Vault visualization
 */
export class DbtProjectParser {
  private projectPath: string;
  private projectConfig: DbtProjectConfig | null = null;

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
    
    // Find all model files
    const modelPaths = this.projectConfig['model-paths'] || ['models'];
    const modelFiles: string[] = [];
    
    for (const modelPath of modelPaths) {
      const fullPath = path.join(this.projectPath, modelPath);
      console.log(`[DataVault] Searching for SQL files in: ${fullPath}`);
      
      if (!fs.existsSync(fullPath)) {
        console.log(`[DataVault] Path does not exist: ${fullPath}`);
        continue;
      }
      
      const files = this.findSqlFilesSync(fullPath);
      console.log(`[DataVault] Found ${files.length} SQL files in ${modelPath}`);
      modelFiles.push(...files);
    }

    // Parse each model
    const models: DbtModel[] = [];
    for (const filePath of modelFiles) {
      try {
        const model = await this.parseModel(filePath);
        if (model) {
          models.push(model);
        }
      } catch (error) {
        console.error(`Failed to parse model ${filePath}:`, error);
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
      concepts,
      schemas,
      lastScanned: new Date()
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
          // Skip special directories
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
   * Parse a single model file
   */
  private async parseModel(filePath: string): Promise<DbtModel | null> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath, '.sql');
    const relativePath = path.relative(this.projectPath, filePath);
    
    // Determine layer and concept from path
    const { layer, concept } = this.parsePathInfo(relativePath);
    
    // Infer model type
    const type = this.inferModelType(relativePath, fileName);
    
    // Extract references
    const refs = this.extractRefs(content);
    const sources = this.extractSources(content);
    
    // Extract columns (best effort)
    const columns = this.extractColumns(content);
    
    // Determine schema
    const schema = this.determineSchema(layer, concept);
    
    // Determine materialization
    const materialized = this.determineMaterialized(content, layer, type);

    return {
      name: fileName,
      schema,
      type,
      materialized,
      filePath,
      relativePath,
      columns,
      refs,
      sources,
      concept,
      layer
    };
  }

  /**
   * Parse layer and concept from file path
   */
  private parsePathInfo(relativePath: string): { layer: DbtModel['layer']; concept: string } {
    const parts = relativePath.toLowerCase().split(path.sep);
    
    let layer: DbtModel['layer'] = 'staging';
    let concept = '_common';
    
    if (parts.includes('staging')) {
      layer = 'staging';
      // For staging, extract concept from filename pattern: <concept>_<entity>.sql
      const fileName = path.basename(relativePath, '.sql');
      const match = fileName.match(/^([a-z]+)_/);
      if (match && !['stg', 'ext'].includes(match[1])) {
        concept = match[1];
      }
    } else if (parts.includes('raw_vault')) {
      layer = 'raw_vault';
      // Find concept folder after raw_vault
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
      // Find concept folder after mart
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
   * Determine materialization strategy
   */
  private determineMaterialized(content: string, layer: DbtModel['layer'], type: ModelType): MaterializedType {
    // Check for explicit config in file
    const configMatch = content.match(/materialized\s*[=:]\s*['"]?(\w+)['"]?/);
    if (configMatch) {
      return configMatch[1] as MaterializedType;
    }

    // Default based on layer/type
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
   * Extract column names from SQL (best effort)
   */
  private extractColumns(content: string): string[] {
    const columns: string[] = [];
    
    // Pattern 1: SELECT column AS alias or SELECT column
    const selectPattern = /SELECT\s+([\s\S]*?)(?:FROM|$)/i;
    const selectMatch = content.match(selectPattern);
    
    if (selectMatch) {
      const selectClause = selectMatch[1];
      // Split by comma, handling nested parentheses
      const parts = this.splitSelectClause(selectClause);
      
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed || trimmed === '*') continue;
        
        // Extract alias or column name
        const asMatch = trimmed.match(/\bAS\s+\[?([^\]\s,]+)\]?\s*$/i);
        if (asMatch) {
          columns.push(asMatch[1]);
        } else {
          // Try to get the last identifier
          const lastIdMatch = trimmed.match(/\[?([a-zA-Z_][a-zA-Z0-9_]*)\]?\s*$/);
          if (lastIdMatch) {
            columns.push(lastIdMatch[1]);
          }
        }
      }
    }
    
    return columns;
  }

  /**
   * Split SELECT clause by commas, respecting parentheses
   */
  private splitSelectClause(clause: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of clause) {
      if (char === '(' || char === '{') {
        depth++;
        current += char;
      } else if (char === ')' || char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      parts.push(current);
    }
    
    return parts;
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

    // Try to extract business key from SQL
    const businessKey = this.extractBusinessKey(model.filePath);

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
    const attributes = model.columns.filter(
      col => !metadataColumns.some(prefix => col.toLowerCase().startsWith(prefix))
    );

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
   * Try to extract business key from hub SQL file
   */
  private extractBusinessKey(filePath: string): string | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      // Look for business key patterns
      const patterns = [
        /src_bk\s*[=:]\s*['"]([^'"]+)['"]/i,
        /business_key\s*[=:]\s*['"]([^'"]+)['"]/i,
        /bk_\w+/i
      ];
      
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          return match[1] || match[0];
        }
      }
    } catch {
      // Ignore errors
    }
    return null;
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
