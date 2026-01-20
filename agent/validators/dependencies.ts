/**
 * Data Vault Dependency Checker
 * 
 * Validates that parent objects exist before creating dependent objects:
 * - Satellite requires Hub
 * - Link requires Hubs
 * - Mart requires Hubs + Satellites
 * 
 * Checks both file existence AND deployment status via dbt artifacts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ErrorCodes, type ErrorCode } from '../ui.js';

// ============================================================================
// Types
// ============================================================================

export interface DependencyResult {
  valid: boolean;
  missing: MissingDependency[];
  found: string[];
}

export interface MissingDependency {
  type: 'hub' | 'satellite' | 'link' | 'staging' | 'external';
  name: string;
  code: ErrorCode;
  requiredBy: string;
  status?: 'no_file' | 'not_deployed' | 'not_defined';
}

export interface ModelStatus {
  exists: boolean;        // SQL file exists
  deployed: boolean;      // In manifest (compiled at least once)
  lastRun?: string;       // Last successful run timestamp
}

// ============================================================================
// Project Root & Manifest Cache
// ============================================================================

let _projectRoot: string | null = null;
let _manifest: any = null;
let _manifestLoadTime: number = 0;
const MANIFEST_CACHE_MS = 30000; // 30 seconds cache

function getProjectRoot(): string {
  if (_projectRoot) return _projectRoot;
  
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, 'dbt_project.yml'))) {
      _projectRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (fs.existsSync(path.join(parent, 'dbt_project.yml'))) {
      _projectRoot = parent;
      return parent;
    }
    dir = parent;
  }
  return process.cwd();
}

/**
 * Load dbt manifest.json for deployment status
 */
function loadManifest(): any {
  const now = Date.now();
  if (_manifest && (now - _manifestLoadTime) < MANIFEST_CACHE_MS) {
    return _manifest;
  }
  
  const root = getProjectRoot();
  const manifestPath = path.join(root, 'target', 'manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    _manifest = JSON.parse(content);
    _manifestLoadTime = now;
    return _manifest;
  } catch {
    return null;
  }
}

/**
 * Clear manifest cache (call after dbt run)
 */
export function clearManifestCache(): void {
  _manifest = null;
  _manifestLoadTime = 0;
}

// ============================================================================
// Status Checks
// ============================================================================

/**
 * Check if a model file exists
 */
function modelFileExists(category: string, subcategory: string, name: string): boolean {
  const root = getProjectRoot();
  const modelPath = path.join(root, 'models', category, subcategory, `${name}.sql`);
  return fs.existsSync(modelPath);
}

/**
 * Check if a model is in the manifest (was compiled)
 */
function modelInManifest(name: string): boolean {
  const manifest = loadManifest();
  if (!manifest || !manifest.nodes) return false;
  
  // Models in manifest are keyed as "model.project_name.model_name"
  for (const key of Object.keys(manifest.nodes)) {
    if (key.endsWith(`.${name}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Get full model status
 */
export function getModelStatus(category: string, subcategory: string, name: string): ModelStatus {
  const fileExists = modelFileExists(category, subcategory, name);
  const deployed = modelInManifest(name);
  
  return {
    exists: fileExists,
    deployed: deployed,
  };
}

function stagingExists(name: string): boolean {
  const root = getProjectRoot();
  const modelPath = path.join(root, 'models', 'staging', `${name}.sql`);
  return fs.existsSync(modelPath);
}

function externalTableDefined(name: string): boolean {
  const root = getProjectRoot();
  const sourcesPath = path.join(root, 'models', 'staging', 'sources.yml');
  
  if (!fs.existsSync(sourcesPath)) return false;
  
  const content = fs.readFileSync(sourcesPath, 'utf-8');
  return content.includes(`name: ${name}`) || content.includes(`name: '${name}'`);
}

// ============================================================================
// Dependency Checks (File-based - for creation validation)
// ============================================================================

/**
 * Check dependencies for creating a Satellite
 */
export function checkSatelliteDependencies(config: {
  name: string;
  parentHub: string;
  staging?: string;
}): DependencyResult {
  const missing: MissingDependency[] = [];
  const found: string[] = [];
  
  // Check parent hub exists
  if (config.parentHub) {
    if (modelFileExists('raw_vault', 'hubs', config.parentHub)) {
      found.push(`Hub: ${config.parentHub}`);
    } else {
      missing.push({
        type: 'hub',
        name: config.parentHub,
        code: 'DEP_HUB_MISSING',
        requiredBy: config.name,
      });
    }
  }
  
  // Check staging exists
  if (config.staging) {
    if (stagingExists(config.staging)) {
      found.push(`Staging: ${config.staging}`);
    } else {
      missing.push({
        type: 'staging',
        name: config.staging,
        code: 'DEP_STG_MISSING',
        requiredBy: config.name,
      });
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    found,
  };
}

/**
 * Check dependencies for creating a Link
 */
export function checkLinkDependencies(config: {
  name: string;
  hubReferences: Array<{ hub: string }>;
  staging?: string;
}): DependencyResult {
  const missing: MissingDependency[] = [];
  const found: string[] = [];
  
  // Check all referenced hubs exist
  for (const ref of config.hubReferences || []) {
    if (modelFileExists('raw_vault', 'hubs', ref.hub)) {
      found.push(`Hub: ${ref.hub}`);
    } else {
      missing.push({
        type: 'hub',
        name: ref.hub,
        code: 'DEP_HUB_MISSING',
        requiredBy: config.name,
      });
    }
  }
  
  // Check staging exists
  if (config.staging) {
    if (stagingExists(config.staging)) {
      found.push(`Staging: ${config.staging}`);
    } else {
      missing.push({
        type: 'staging',
        name: config.staging,
        code: 'DEP_STG_MISSING',
        requiredBy: config.name,
      });
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    found,
  };
}

/**
 * Check dependencies for creating a Mart View
 */
export function checkMartDependencies(config: {
  name: string;
  hub: string;
  satellites: string[];
}): DependencyResult {
  const missing: MissingDependency[] = [];
  const found: string[] = [];
  
  // Check hub exists
  if (config.hub) {
    if (modelFileExists('raw_vault', 'hubs', config.hub)) {
      found.push(`Hub: ${config.hub}`);
    } else {
      missing.push({
        type: 'hub',
        name: config.hub,
        code: 'DEP_HUB_MISSING',
        requiredBy: config.name,
      });
    }
  }
  
  // Check all satellites exist
  for (const sat of config.satellites || []) {
    if (modelFileExists('raw_vault', 'satellites', sat)) {
      found.push(`Satellite: ${sat}`);
    } else {
      missing.push({
        type: 'satellite',
        name: sat,
        code: 'DEP_SAT_MISSING',
        requiredBy: config.name,
      });
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    found,
  };
}

/**
 * Check dependencies for creating a Staging view
 */
export function checkStagingDependencies(config: {
  name: string;
  externalTable: string;
}): DependencyResult {
  const missing: MissingDependency[] = [];
  const found: string[] = [];
  
  // Check external table is defined in sources.yml
  if (config.externalTable) {
    if (externalTableDefined(config.externalTable)) {
      found.push(`External Table: ${config.externalTable}`);
    } else {
      missing.push({
        type: 'external',
        name: config.externalTable,
        code: 'DEP_EXT_MISSING',
        requiredBy: config.name,
      });
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    found,
  };
}

// ============================================================================
// Formatting
// ============================================================================

export function formatDependencyResult(result: DependencyResult): string {
  const lines: string[] = [];
  
  if (result.valid) {
    lines.push('[OK] Dependencies satisfied');
    if (result.found.length > 0) {
      for (const f of result.found) {
        lines.push(`  ✓ ${f}`);
      }
    }
    return lines.join('\n');
  }
  
  lines.push('[ERROR] Missing dependencies');
  for (const m of result.missing) {
    lines.push(`  [${m.code}] ${m.type}: ${m.name}`);
    lines.push(`           Required by: ${m.requiredBy}`);
  }
  
  if (result.found.length > 0) {
    lines.push('');
    lines.push('[OK] Found:');
    for (const f of result.found) {
      lines.push(`  ✓ ${f}`);
    }
  }
  
  return lines.join('\n');
}

// ============================================================================
// Discovery Functions
// ============================================================================

/**
 * List all existing hubs in the project
 */
export function listHubs(): string[] {
  const root = getProjectRoot();
  const hubsDir = path.join(root, 'models', 'raw_vault', 'hubs');
  
  if (!fs.existsSync(hubsDir)) return [];
  
  return fs.readdirSync(hubsDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => f.replace('.sql', ''));
}

/**
 * List all existing satellites in the project
 */
export function listSatellites(): string[] {
  const root = getProjectRoot();
  const satsDir = path.join(root, 'models', 'raw_vault', 'satellites');
  
  if (!fs.existsSync(satsDir)) return [];
  
  return fs.readdirSync(satsDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => f.replace('.sql', ''));
}

/**
 * List all existing links in the project
 */
export function listLinks(): string[] {
  const root = getProjectRoot();
  const linksDir = path.join(root, 'models', 'raw_vault', 'links');
  
  if (!fs.existsSync(linksDir)) return [];
  
  return fs.readdirSync(linksDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => f.replace('.sql', ''));
}

/**
 * List all existing staging views in the project
 */
export function listStagingViews(): string[] {
  const root = getProjectRoot();
  const stagingDir = path.join(root, 'models', 'staging');
  
  if (!fs.existsSync(stagingDir)) return [];
  
  return fs.readdirSync(stagingDir)
    .filter(f => f.endsWith('.sql') && f.startsWith('stg_'))
    .map(f => f.replace('.sql', ''));
}
