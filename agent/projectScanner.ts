/**
 * Project Scanner - Analyzes the dbt project structure
 * 
 * Scans for existing Hubs, Satellites, Links, Marts, Seeds
 * and provides metadata for the wizard system.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get directory of current file and compute PROJECT_ROOT
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PROJECT_ROOT: 3 levels up from dist/ (dist -> agent -> project)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ============================================================================
// Types
// ============================================================================

export interface HubInfo {
  name: string;           // e.g., "company", "country"
  fullName: string;       // e.g., "hub_company"
  filePath: string;       // relative path
  businessKey?: string;   // extracted from SQL
  satellites: string[];   // related satellites
}

export interface SatelliteInfo {
  name: string;           // e.g., "company", "company_client_ext"
  fullName: string;       // e.g., "sat_company"
  filePath: string;
  parentHub?: string;     // e.g., "hub_company"
  attributes: string[];   // column names (if extractable)
  isEffectivity: boolean; // eff_sat_*
}

export interface LinkInfo {
  name: string;           // e.g., "company_role", "company_country"
  fullName: string;       // e.g., "link_company_role"
  filePath: string;
  connectedHubs: string[]; // e.g., ["hub_company", "hub_country"]
}

export interface MartInfo {
  name: string;           // e.g., "v_company_current"
  filePath: string;
  schema: string;         // e.g., "customer", "project", "reporting"
  usedModels: string[];   // refs extracted from SQL
}

export interface SeedInfo {
  name: string;           // e.g., "ref_role"
  filePath: string;
  columns?: string[];     // CSV header columns
}

export interface ProjectMetadata {
  hubs: HubInfo[];
  satellites: SatelliteInfo[];
  links: LinkInfo[];
  marts: MartInfo[];
  seeds: SeedInfo[];
  schemas: string[];      // Available mart schemas (business contexts)
  lastScanned: Date;
}

// ============================================================================
// Scanner Functions
// ============================================================================

/**
 * Scan the entire project and return metadata
 */
export async function scanProject(): Promise<ProjectMetadata> {
  const [hubs, satellites, links, marts, seeds] = await Promise.all([
    scanHubs(),
    scanSatellites(),
    scanLinks(),
    scanMarts(),
    scanSeeds(),
  ]);

  // Extract unique mart schemas
  const schemas = [...new Set(marts.map(m => m.schema).filter(s => s !== 'mart'))];

  return {
    hubs,
    satellites,
    links,
    marts,
    seeds,
    schemas: schemas.length > 0 ? schemas : ['customer', 'project', 'reporting', 'reference'],
    lastScanned: new Date(),
  };
}

/**
 * Scan for Hubs - scans all concept subdirectories
 */
async function scanHubs(): Promise<HubInfo[]> {
  const rawVaultDir = path.join(PROJECT_ROOT, 'models', 'raw_vault');
  const hubs: HubInfo[] = [];

  try {
    // Get all concept directories (werkportal, adventureworks, _common, etc.)
    const concepts = await fs.readdir(rawVaultDir, { withFileTypes: true });
    
    for (const concept of concepts) {
      if (!concept.isDirectory()) continue;
      
      const hubDir = path.join(rawVaultDir, concept.name, 'hubs');
      
      try {
        const files = await fs.readdir(hubDir);
        
        for (const file of files) {
          if (!file.endsWith('.sql')) continue;
          
          const fullName = file.replace('.sql', '');
          const name = fullName.replace('hub_', '');
          const filePath = path.join('models', 'raw_vault', concept.name, 'hubs', file);
          
          // Try to extract business key from SQL
          const sqlContent = await fs.readFile(path.join(hubDir, file), 'utf-8');
          const businessKey = extractBusinessKey(sqlContent);

          hubs.push({
            name,
            fullName,
            filePath,
            businessKey,
            satellites: [], // Will be populated later
          });
        }
      } catch (error) {
        // hubs directory doesn't exist for this concept
      }
    }
  } catch (error) {
    // raw_vault directory doesn't exist
  }

  return hubs;
}

/**
 * Scan for Satellites - scans all concept subdirectories
 */
async function scanSatellites(): Promise<SatelliteInfo[]> {
  const rawVaultDir = path.join(PROJECT_ROOT, 'models', 'raw_vault');
  const satellites: SatelliteInfo[] = [];

  try {
    // Get all concept directories (werkportal, adventureworks, _common, etc.)
    const concepts = await fs.readdir(rawVaultDir, { withFileTypes: true });
    
    for (const concept of concepts) {
      if (!concept.isDirectory()) continue;
      
      const satDir = path.join(rawVaultDir, concept.name, 'satellites');
      
      try {
        const files = await fs.readdir(satDir);
        
        for (const file of files) {
          if (!file.endsWith('.sql')) continue;
          
          const fullName = file.replace('.sql', '');
          const isEffectivity = fullName.startsWith('eff_sat_');
          const name = fullName.replace('eff_sat_', '').replace('sat_', '');
          const filePath = path.join('models', 'raw_vault', concept.name, 'satellites', file);
          
          // Try to extract parent hub from SQL
          const sqlContent = await fs.readFile(path.join(satDir, file), 'utf-8');
          const parentHub = extractParentHub(sqlContent);
          const attributes = extractAttributes(sqlContent);

          satellites.push({
            name,
            fullName,
            filePath,
            parentHub,
            attributes,
            isEffectivity,
          });
        }
      } catch (error) {
        // satellites directory doesn't exist for this concept
      }
    }
  } catch (error) {
    // raw_vault directory doesn't exist
  }

  return satellites;
}

/**
 * Scan for Links - scans all concept subdirectories
 */
async function scanLinks(): Promise<LinkInfo[]> {
  const rawVaultDir = path.join(PROJECT_ROOT, 'models', 'raw_vault');
  const links: LinkInfo[] = [];

  try {
    // Get all concept directories (werkportal, adventureworks, _common, etc.)
    const concepts = await fs.readdir(rawVaultDir, { withFileTypes: true });
    
    for (const concept of concepts) {
      if (!concept.isDirectory()) continue;
      
      const linkDir = path.join(rawVaultDir, concept.name, 'links');
      
      try {
        const files = await fs.readdir(linkDir);
        
        for (const file of files) {
          if (!file.endsWith('.sql')) continue;
          
          const fullName = file.replace('.sql', '');
          const name = fullName.replace('link_', '');
          const filePath = path.join('models', 'raw_vault', concept.name, 'links', file);
          
          // Try to extract connected hubs from SQL
          const sqlContent = await fs.readFile(path.join(linkDir, file), 'utf-8');
          const connectedHubs = extractConnectedHubs(sqlContent);

          links.push({
            name,
            fullName,
            filePath,
            connectedHubs,
          });
        }
      } catch (error) {
        // links directory doesn't exist for this concept
      }
    }
  } catch (error) {
    // raw_vault directory doesn't exist
  }

  return links;
}

/**
 * Scan for Mart views
 */
async function scanMarts(): Promise<MartInfo[]> {
  const martDir = path.join(PROJECT_ROOT, 'models', 'mart');
  const marts: MartInfo[] = [];

  async function scanDirectory(dir: string, schema: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Subdirectory = schema (business context)
          await scanDirectory(path.join(dir, entry.name), entry.name);
        } else if (entry.name.endsWith('.sql')) {
          const name = entry.name.replace('.sql', '');
          const filePath = schema === 'mart' 
            ? path.join('models', 'mart', entry.name)
            : path.join('models', 'mart', schema, entry.name);
          
          // Extract refs from SQL
          const sqlContent = await fs.readFile(path.join(dir, entry.name), 'utf-8');
          const usedModels = extractRefs(sqlContent);

          marts.push({
            name,
            filePath,
            schema,
            usedModels,
          });
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }
  }

  await scanDirectory(martDir, 'mart');
  return marts;
}

/**
 * Scan for Seeds (reference tables)
 */
async function scanSeeds(): Promise<SeedInfo[]> {
  const seedDir = path.join(PROJECT_ROOT, 'seeds');
  const seeds: SeedInfo[] = [];

  try {
    const files = await fs.readdir(seedDir);
    
    for (const file of files) {
      if (!file.endsWith('.csv')) continue;
      
      const name = file.replace('.csv', '');
      const filePath = path.join('seeds', file);
      
      // Try to read CSV header
      const csvContent = await fs.readFile(path.join(seedDir, file), 'utf-8');
      const firstLine = csvContent.split('\n')[0];
      const columns = firstLine?.split(',').map(c => c.trim());

      seeds.push({
        name,
        filePath,
        columns,
      });
    }
  } catch (error) {
    // Directory doesn't exist
  }

  return seeds;
}

// ============================================================================
// SQL Extraction Helpers
// ============================================================================

/**
 * Extract business key column from hub SQL
 */
function extractBusinessKey(sql: string): string | undefined {
  // Look for src_pk or HASHBYTES with column reference
  const pkMatch = sql.match(/src_pk\s*=\s*['"]?(\w+)['"]?/i);
  if (pkMatch) return pkMatch[1];
  
  // Look for hk_ definition
  const hkMatch = sql.match(/hk_\w+.*HASHBYTES.*?CAST\((\w+)/is);
  if (hkMatch) return hkMatch[1];
  
  return undefined;
}

/**
 * Extract parent hub from satellite SQL
 */
function extractParentHub(sql: string): string | undefined {
  // Look for ref('hub_*') pattern
  const refMatch = sql.match(/ref\(['"]?(hub_\w+)['"]?\)/i);
  if (refMatch) return refMatch[1];
  
  // Look for hk_ column that matches a hub
  const hkMatch = sql.match(/hk_(\w+)/i);
  if (hkMatch) return `hub_${hkMatch[1]}`;
  
  return undefined;
}

/**
 * Extract attributes from satellite SQL (SELECT columns)
 * Looks for columns in the source_data CTE or the Payload section
 */
function extractAttributes(sql: string): string[] {
  const attributes: string[] = [];
  const excludedPrefixes = ['hk_', 'hd_', 'dss_', 'src'];
  
  // Method 1: Look for "-- Payload" comment section
  const payloadMatch = sql.match(/--\s*Payload[:\s]*([\s\S]*?)(?:FROM|WHERE|\n\s*\))/i);
  if (payloadMatch) {
    const payloadSection = payloadMatch[1];
    const columnMatches = payloadSection.matchAll(/^\s*(?:src\.)?([a-z_][a-z0-9_]*)\s*[,\n]/gim);
    for (const match of columnMatches) {
      const col = match[1].toLowerCase();
      if (!excludedPrefixes.some(p => col.startsWith(p))) {
        if (!attributes.includes(col)) {
          attributes.push(col);
        }
      }
    }
    if (attributes.length > 0) return attributes;
  }
  
  // Method 2: Look for src.column patterns
  const srcMatches = sql.matchAll(/src\.([a-z_][a-z0-9_]*)/gi);
  for (const match of srcMatches) {
    const col = match[1].toLowerCase();
    if (!excludedPrefixes.some(p => col.startsWith(p))) {
      if (!attributes.includes(col)) {
        attributes.push(col);
      }
    }
  }
  
  return attributes;
}

/**
 * Extract connected hubs from link SQL
 */
function extractConnectedHubs(sql: string): string[] {
  const hubs: string[] = [];
  
  // Look for ref('hub_*') patterns
  const refMatches = sql.matchAll(/ref\(['"]?(hub_\w+)['"]?\)/gi);
  for (const match of refMatches) {
    if (!hubs.includes(match[1])) {
      hubs.push(match[1]);
    }
  }
  
  return hubs;
}

/**
 * Extract all refs from SQL
 */
function extractRefs(sql: string): string[] {
  const refs: string[] = [];
  
  const refMatches = sql.matchAll(/ref\(['"]?(\w+)['"]?\)/gi);
  for (const match of refMatches) {
    if (!refs.includes(match[1])) {
      refs.push(match[1]);
    }
  }
  
  return refs;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get satellites for a specific hub
 */
export function getSatellitesForHub(metadata: ProjectMetadata, hubName: string): SatelliteInfo[] {
  const fullHubName = hubName.startsWith('hub_') ? hubName : `hub_${hubName}`;
  return metadata.satellites.filter(s => s.parentHub === fullHubName);
}

/**
 * Get links that connect to a specific hub
 */
export function getLinksForHub(metadata: ProjectMetadata, hubName: string): LinkInfo[] {
  const fullHubName = hubName.startsWith('hub_') ? hubName : `hub_${hubName}`;
  return metadata.links.filter(l => l.connectedHubs.includes(fullHubName));
}

/**
 * Format metadata as a summary string
 */
export function formatMetadataSummary(metadata: ProjectMetadata): string {
  const lines: string[] = [
    'Projekt-Analyse:',
    '',
    `  Hubs:       ${metadata.hubs.length} (${metadata.hubs.map(h => h.name).join(', ')})`,
    `  Satellites: ${metadata.satellites.length} (${metadata.satellites.map(s => s.fullName).join(', ')})`,
    `  Links:      ${metadata.links.length} (${metadata.links.map(l => l.name).join(', ')})`,
    `  Marts:      ${metadata.marts.length}`,
    `  Seeds:      ${metadata.seeds.length} (${metadata.seeds.map(s => s.name).join(', ')})`,
    `  Schemas:    ${metadata.schemas.join(', ')}`,
  ];
  
  return lines.join('\n');
}

/**
 * Get all available models for mart creation
 */
export function getAvailableModelsForMart(metadata: ProjectMetadata): string[] {
  const models: string[] = [];
  
  // Add hubs
  models.push(...metadata.hubs.map(h => h.fullName));
  
  // Add satellites
  models.push(...metadata.satellites.map(s => s.fullName));
  
  // Add links
  models.push(...metadata.links.map(l => l.fullName));
  
  // Add seeds
  models.push(...metadata.seeds.map(s => s.name));
  
  return models.sort();
}

// ============================================================================
// Staging Scanner
// ============================================================================

export interface StagingInfo {
  name: string;           // e.g., "company"
  fullName: string;       // e.g., "stg_company"
  filePath: string;       // absolute path
  businessKeys: string[]; // e.g., ["object_id"]
  payloadColumns: string[]; // columns from hashdiff_columns
  fkColumns: string[];    // Foreign key columns (hk_*)
  externalTable?: string; // source external table
}

/**
 * Scan all staging models
 */
export async function scanStagingModels(): Promise<StagingInfo[]> {
  const stagingDir = path.join(PROJECT_ROOT, 'models', 'staging');
  const stagingModels: StagingInfo[] = [];
  
  try {
    const files = await fs.readdir(stagingDir);
    
    for (const file of files) {
      if (!file.startsWith('stg_') || !file.endsWith('.sql')) continue;
      
      const filePath = path.join(stagingDir, file);
      const name = file.replace(/^stg_/, '').replace(/\.sql$/, '');
      const fullName = `stg_${name}`;
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const info = extractStagingInfo(content, name, fullName, filePath);
        stagingModels.push(info);
      } catch {
        // File read error, skip
      }
    }
  } catch {
    // Directory doesn't exist
  }
  
  return stagingModels;
}

/**
 * Extract information from staging SQL
 */
function extractStagingInfo(sql: string, name: string, fullName: string, filePath: string): StagingInfo {
  const info: StagingInfo = {
    name,
    fullName,
    filePath,
    businessKeys: [],
    payloadColumns: [],
    fkColumns: [],
  };
  
  // Extract hashdiff_columns (payload)
  const hashdiffMatch = sql.match(/\{%-?\s*set\s+hashdiff_columns\s*=\s*\[([\s\S]*?)\]\s*-?%\}/i);
  if (hashdiffMatch) {
    const columnsStr = hashdiffMatch[1];
    const columnMatches = columnsStr.matchAll(/'([^']+)'/g);
    for (const match of columnMatches) {
      info.payloadColumns.push(match[1]);
    }
  }
  
  // Extract business keys from hash key calculation comments
  const bkMatch = sql.match(/--\s*BUSINESS\s+KEY[S]?\s*[\r\n]+([\s\S]*?)(?:--\s*=|FROM)/i);
  if (bkMatch) {
    const bkSection = bkMatch[1];
    // Look for column names that aren't hk_, hd_, dss_
    const colMatches = bkSection.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*[,\n]/gim);
    for (const match of colMatches) {
      const col = match[1].toLowerCase();
      if (!col.startsWith('hk_') && !col.startsWith('hd_') && !col.startsWith('dss_')) {
        if (!info.businessKeys.includes(col)) {
          info.businessKeys.push(col);
        }
      }
    }
  }
  
  // Extract FK columns (hk_* but not hk_{name})
  const fkMatches = sql.matchAll(/AS\s+(hk_[a-z_]+)/gi);
  for (const match of fkMatches) {
    const fk = match[1].toLowerCase();
    if (fk !== `hk_${name}` && !info.fkColumns.includes(fk)) {
      info.fkColumns.push(fk);
    }
  }
  
  // Extract external table from source()
  const sourceMatch = sql.match(/source\(['"]?[^'"]+['"]?,\s*['"]?([^'")\s]+)['"]?\)/i);
  if (sourceMatch) {
    info.externalTable = sourceMatch[1];
  }
  
  return info;
}

/**
 * Get staging info for a specific entity
 */
export async function getStagingForEntity(entityName: string): Promise<StagingInfo | null> {
  const stagingModels = await scanStagingModels();
  const normalizedName = entityName.replace(/^stg_/, '');
  return stagingModels.find(s => s.name === normalizedName) || null;
}

// ============================================================================
// External Table Column Scanner (from sources.yml)
// ============================================================================

export interface ExternalTableInfo {
  name: string;           // e.g., "ext_company_client"
  columns: string[];      // all column names
  description?: string;
}

/**
 * Parse sources.yml and extract external table columns
 */
export async function getExternalTableColumns(externalTableName: string): Promise<string[]> {
  const sourcesPath = path.join(PROJECT_ROOT, 'models', 'staging', 'sources.yml');
  
  try {
    const content = await fs.readFile(sourcesPath, 'utf-8');
    
    // Find the table section
    const tableRegex = new RegExp(
      `- name:\\s*${externalTableName}[\\s\\S]*?columns:\\s*([\\s\\S]*?)(?=\\n\\s{6}- name:|\\n\\s{2,4}# |$)`,
      'i'
    );
    const tableMatch = content.match(tableRegex);
    
    if (!tableMatch) {
      // Try simpler extraction
      return extractColumnsSimple(content, externalTableName);
    }
    
    const columnsSection = tableMatch[1];
    const columns: string[] = [];
    
    // Extract column names
    const columnMatches = columnsSection.matchAll(/^\s+- name:\s*([a-z_][a-z0-9_]*)/gim);
    for (const match of columnMatches) {
      columns.push(match[1].toLowerCase());
    }
    
    return columns;
  } catch {
    return [];
  }
}

/**
 * Simpler column extraction as fallback
 */
function extractColumnsSimple(yamlContent: string, tableName: string): string[] {
  const columns: string[] = [];
  const lines = yamlContent.split('\n');
  let inTable = false;
  let inColumns = false;
  
  for (const line of lines) {
    // Check if we're at the table definition
    if (line.match(new RegExp(`^\\s+- name:\\s*${tableName}\\s*$`, 'i'))) {
      inTable = true;
      continue;
    }
    
    // Check if we're leaving the table (new table starts)
    if (inTable && line.match(/^\s{6}- name:\s*ext_/i)) {
      break;
    }
    
    // Check if columns section starts
    if (inTable && line.match(/^\s+columns:\s*$/)) {
      inColumns = true;
      continue;
    }
    
    // Extract column name
    if (inTable && inColumns) {
      const colMatch = line.match(/^\s+- name:\s*([a-z_][a-z0-9_]*)/i);
      if (colMatch) {
        columns.push(colMatch[1].toLowerCase());
      }
    }
  }
  
  return columns;
}

/**
 * Get all available columns for an entity (from External Table)
 * Excludes metadata columns (dss_*)
 */
export async function getAvailableColumnsForEntity(entityName: string): Promise<string[]> {
  // Normalize entity name
  const normalized = entityName
    .replace(/^(stg_|hub_|sat_|link_)/, '')
    .replace(/_client$|_contractor$|_supplier$/, ''); // Handle company subtypes
  
  // Try different external table name patterns
  const possibleNames = [
    `ext_${entityName.replace(/^(stg_|hub_|sat_|link_)/, '')}`,
    `ext_${normalized}`,
    `ext_company_${entityName.replace(/^.*_/, '')}`, // For sat_company -> ext_company_client etc.
  ];
  
  for (const extTableName of possibleNames) {
    const columns = await getExternalTableColumns(extTableName);
    if (columns.length > 0) {
      // Filter out metadata columns
      return columns.filter(c => !c.startsWith('dss_'));
    }
  }
  
  return [];
}

/**
 * Get available attributes for adding to a satellite
 * Returns columns from external table minus already-used columns in satellite
 */
export async function getAvailableAttributesForSatellite(
  satelliteName: string,
  currentAttributes: string[]
): Promise<{ available: string[]; source: string }> {
  // Extract entity name from satellite name
  const entityName = satelliteName.replace(/^sat_/, '');
  
  // Get staging info to find external table
  const stagingInfo = await getStagingForEntity(entityName);
  const extTableName = stagingInfo?.externalTable || `ext_${entityName}`;
  
  // Get all columns from external table
  const allColumns = await getExternalTableColumns(extTableName);
  
  if (allColumns.length === 0) {
    // Fallback: try to get from staging hashdiff
    if (stagingInfo && stagingInfo.payloadColumns.length > 0) {
      const available = stagingInfo.payloadColumns.filter(
        c => !currentAttributes.includes(c)
      );
      return { available, source: stagingInfo.fullName };
    }
    return { available: [], source: 'unknown' };
  }
  
  // Filter out:
  // - metadata columns (dss_*)
  // - business keys (object_id, etc.)
  // - already used columns
  // - system columns (date_created, date_updated, user_created, user_updated)
  const systemColumns = ['object_id', 'date_created', 'date_updated', 'user_created', 'user_updated'];
  
  const available = allColumns.filter(col => {
    const lower = col.toLowerCase();
    return !lower.startsWith('dss_') &&
           !systemColumns.includes(lower) &&
           !currentAttributes.map(c => c.toLowerCase()).includes(lower);
  });
  
  return { available, source: extTableName };
}

/**
 * Get current attributes from a satellite model
 */
export async function getSatelliteAttributes(satelliteName: string): Promise<string[]> {
  const satPath = path.join(PROJECT_ROOT, 'models', 'raw_vault', 'satellites', `${satelliteName}.sql`);
  
  try {
    const sql = await fs.readFile(satPath, 'utf-8');
    
    // Extract payload columns from hashdiff_columns
    const hashdiffMatch = sql.match(/\{%-?\s*set\s+hashdiff_columns\s*=\s*\[([\s\S]*?)\]\s*-?%\}/i);
    if (hashdiffMatch) {
      const columnsStr = hashdiffMatch[1];
      const columns: string[] = [];
      const columnMatches = columnsStr.matchAll(/'([^']+)'/g);
      for (const match of columnMatches) {
        columns.push(match[1]);
      }
      return columns;
    }
    
    // Fallback: extract from SELECT statement
    const attributes: string[] = [];
    const selectMatch = sql.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
    if (selectMatch) {
      const selectSection = selectMatch[1];
      const colMatches = selectSection.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*[,\n]/gim);
      for (const match of colMatches) {
        const col = match[1].toLowerCase();
        // Exclude system/hash columns
        if (!col.startsWith('hk_') && !col.startsWith('hd_') && !col.startsWith('dss_')) {
          attributes.push(col);
        }
      }
    }
    
    return attributes;
  } catch {
    return [];
  }
}
