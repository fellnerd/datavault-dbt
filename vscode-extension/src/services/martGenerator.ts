import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { MartDesignerState, DimensionConfig, FactConfig } from '../types';

/**
 * Cache for hub business keys loaded from YAML files
 * Maps hub name (e.g., "hub_vorgang") to its business key column names
 */
interface HubBusinessKeyCache {
  [hubName: string]: string[];
}

/**
 * Load business keys for all hubs from YAML schema files
 * Identifies columns with description containing "Business Key"
 */
async function loadHubBusinessKeys(projectPath: string): Promise<HubBusinessKeyCache> {
  const cache: HubBusinessKeyCache = {};

  // Search for YAML files in raw_vault directory
  const rawVaultPath = path.join(projectPath, 'models', 'raw_vault');

  if (!fs.existsSync(rawVaultPath)) {
    return cache;
  }

  // Recursively find all YAML files
  const yamlFiles = await findYamlFiles(rawVaultPath);

  for (const yamlFile of yamlFiles) {
    try {
      const content = await fs.promises.readFile(yamlFile, 'utf-8');
      const parsed = yaml.load(content) as { version?: number; models?: Array<{ name: string; columns?: Array<{ name: string; description?: string }> }> };

      if (!parsed || !parsed.models) continue;

      for (const model of parsed.models) {
        // Only process hub models
        if (!model.name.startsWith('hub_')) continue;

        const businessKeys: string[] = [];

        if (model.columns) {
          for (const column of model.columns) {
            // Check if description indicates this is a Business Key
            if (column.description &&
                column.description.toLowerCase().includes('business key')) {
              businessKeys.push(column.name);
            }
          }
        }

        if (businessKeys.length > 0) {
          cache[model.name] = businessKeys;
        }
      }
    } catch (error) {
      // Skip files that can't be parsed
      console.warn(`Could not parse YAML file ${yamlFile}:`, error);
    }
  }

  return cache;
}

/**
 * Recursively find all YAML files in a directory
 */
async function findYamlFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subResults = await findYamlFiles(fullPath);
        results.push(...subResults);
      } else if (entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml'))) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }

  return results;
}

/**
 * Mart Generator Service
 *
 * Implements the Two-Layer Pattern:
 * - _base/ directory: Generated models (ephemeral, always regenerated)
 * - Final models: Custom layer (only created if not existing)
 *
 * Structure:
 * models/mart/<concept>/
 * ├── _base/
 * │   ├── _base_dim_company.sql    ← Generated (ephemeral)
 * │   └── _base_fact_order.sql     ← Generated (ephemeral)
 * ├── dim_company.sql               ← Custom Layer (NOT overwritten)
 * ├── fact_order.sql                ← Custom Layer
 * └── _<concept>__models.yml
 */

export interface GenerationResult {
  success: boolean;
  generatedFiles: string[];
  skippedFiles: string[];
  errors: string[];
}

/**
 * Generate mart models from designer state
 */
export async function generateMartModels(
  projectPath: string,
  state: MartDesignerState
): Promise<GenerationResult> {
  const result: GenerationResult = {
    success: true,
    generatedFiles: [],
    skippedFiles: [],
    errors: []
  };

  const concept = state.concept || '_common';
  const martPath = path.join(projectPath, 'models', 'mart', concept);
  const basePath = path.join(martPath, '_base');

  // Ensure directories exist
  await ensureDirectory(martPath);
  await ensureDirectory(basePath);

  // Load hub business keys from YAML files for accurate column identification
  const hubBusinessKeys = await loadHubBusinessKeys(projectPath);

  // Process nodes
  for (const node of state.nodes) {
    try {
      if (node.type === 'dimension') {
        const dimConfig = node.data as DimensionConfig;
        await generateDimension(basePath, martPath, dimConfig, result);
      } else if (node.type === 'fact') {
        const factConfig = node.data as FactConfig;
        await generateFact(basePath, martPath, factConfig, result, hubBusinessKeys, state);
      }
    } catch (error) {
      result.errors.push(`Error generating ${node.id}: ${error}`);
      result.success = false;
    }
  }

  // Generate YAML schema
  try {
    await generateYamlSchema(martPath, concept, state, result);
  } catch (error) {
    result.errors.push(`Error generating YAML schema: ${error}`);
    result.success = false;
  }

  return result;
}

/**
 * Generate dimension model (base + final)
 */
async function generateDimension(
  basePath: string,
  martPath: string,
  config: DimensionConfig,
  result: GenerationResult
): Promise<void> {
  const dimName = config.name.startsWith('dim_') ? config.name : `dim_${config.name}`;
  const baseName = `_base_${dimName}`;

  // Generate base model (always overwrite)
  const baseContent = generateDimensionBaseSQL(config);
  const baseFile = path.join(basePath, `${baseName}.sql`);
  await fs.promises.writeFile(baseFile, baseContent, 'utf-8');
  result.generatedFiles.push(baseFile);

  // Generate final model (only if not exists)
  const finalFile = path.join(martPath, `${dimName}.sql`);
  if (!fs.existsSync(finalFile)) {
    const finalContent = generateDimensionFinalSQL(config, baseName);
    await fs.promises.writeFile(finalFile, finalContent, 'utf-8');
    result.generatedFiles.push(finalFile);
  } else {
    result.skippedFiles.push(finalFile);
  }
}

/**
 * Generate fact model (base + final)
 */
async function generateFact(
  basePath: string,
  martPath: string,
  config: FactConfig,
  result: GenerationResult,
  hubBusinessKeys: HubBusinessKeyCache,
  state: MartDesignerState
): Promise<void> {
  const factName = config.name.startsWith('fact_') ? config.name : `fact_${config.name}`;
  const baseName = `_base_${factName}`;

  // Generate base model (always overwrite)
  const baseContent = generateFactBaseSQL(config, hubBusinessKeys, state);
  const baseFile = path.join(basePath, `${baseName}.sql`);
  await fs.promises.writeFile(baseFile, baseContent, 'utf-8');
  result.generatedFiles.push(baseFile);

  // Generate final model (only if not exists)
  const finalFile = path.join(martPath, `${factName}.sql`);
  if (!fs.existsSync(finalFile)) {
    const finalContent = generateFactFinalSQL(config, baseName);
    await fs.promises.writeFile(finalFile, finalContent, 'utf-8');
    result.generatedFiles.push(finalFile);
  } else {
    result.skippedFiles.push(finalFile);
  }
}

/**
 * Generate base SQL for dimension (ephemeral model)
 * NOTE: Do NOT use CTEs in ephemeral models - dbt wraps them in CTEs causing nested CTE errors in SQL Server
 */
function generateDimensionBaseSQL(config: DimensionConfig): string {
  const dimName = config.name.startsWith('dim_') ? config.name : `dim_${config.name}`;
  const surrogateKey = `${dimName}_key`;
  const lines: string[] = [];

  // Determine business key - use config.businessKey or fallback to first attribute
  const businessKey = config.businessKey && config.businessKey.trim() !== ''
    ? config.businessKey
    : (config.attributes && config.attributes.length > 0 ? config.attributes[0].name : null);

  // Config block
  lines.push(`{{`);
  lines.push(`  config(`);
  lines.push(`    materialized='ephemeral'`);
  lines.push(`  )`);
  lines.push(`}}`);
  lines.push('');
  lines.push(`{# Base model for ${dimName} - DO NOT EDIT, this file is regenerated #}`);
  lines.push('');

  // Derive sources from attributes
  const sourceModels = getUniqueSourceModels(config.attributes);

  // Filter attributes - exclude BK from attributes list (it's shown separately)
  const filteredAttributes = config.attributes.filter(attr => attr.name !== businessKey);

  lines.push(`SELECT`);

  // Collect all SELECT columns first, then add commas appropriately
  const selectColumns: { comment?: string; line: string }[] = [];

  // Determine alias prefix for columns based on source
  const needsAlias = sourceModels.length > 1;
  const primaryAlias = needsAlias ? sanitizeAlias(sourceModels[0]) : '';
  const aliasPrefix = needsAlias ? `${primaryAlias}.` : '';

  // Surrogate key (auto-derived from dimension name)
  // Use ABS() + BIGINT for deterministic positive keys with no collision risk
  if (businessKey) {
    if (config.scdType === 'type2') {
      selectColumns.push({ comment: 'Surrogate Key', line: `ABS(CONVERT(BIGINT, HASHBYTES('MD5', CONCAT_WS('^^', ${aliasPrefix}${businessKey}, CONVERT(VARCHAR, load_datetime, 126))))) AS ${surrogateKey}` });
    } else {
      selectColumns.push({ comment: 'Surrogate Key', line: `ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(${aliasPrefix}${businessKey} AS NVARCHAR(MAX))))) AS ${surrogateKey}` });
    }
    // Business key
    selectColumns.push({ comment: 'Business Key', line: `${aliasPrefix}${businessKey}` });
  } else if (config.hashKey) {
    // No business key but hash key available - use hash key for surrogate
    selectColumns.push({ comment: 'Surrogate Key', line: `ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(${aliasPrefix}${config.hashKey} AS NVARCHAR(MAX))))) AS ${surrogateKey}` });
  } else {
    // No business key or hash key - fallback to ROW_NUMBER (not recommended)
    selectColumns.push({ comment: 'Surrogate Key', line: `ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS ${surrogateKey}` });
  }

  // Hash key (optional)
  if (config.includeHashKey && config.hashKey) {
    selectColumns.push({ comment: 'Hash Key', line: `${aliasPrefix}${config.hashKey}` });
  }

  // Attributes (BK already filtered out)
  if (filteredAttributes.length > 0) {
    filteredAttributes.forEach((attr, index) => {
      // Determine which source this attribute comes from
      const attrAlias = needsAlias && attr.sourceModel ? `${sanitizeAlias(attr.sourceModel)}.` : '';
      const colLine = attr.sourceColumn !== attr.name
        ? `${attrAlias}${attr.sourceColumn} AS ${attr.name}`
        : `${attrAlias}${attr.name}`;
      selectColumns.push({ comment: index === 0 ? 'Attributes' : undefined, line: colLine });
    });
  }

  // Output columns with proper comma handling
  selectColumns.forEach((col, index) => {
    if (col.comment) {
      lines.push(`  -- ${col.comment}`);
    }
    const comma = index < selectColumns.length - 1 ? ',' : '';
    lines.push(`  ${col.line}${comma}`);
  });

  // FROM clause - direct refs without CTEs
  if (config.sourceType === 'pit' && config.sourcePIT) {
    lines.push(`FROM {{ ref('${config.sourcePIT}') }}`);
  } else if (config.sourceType === 'seed' && config.sourceSeed) {
    lines.push(`FROM {{ ref('${config.sourceSeed}') }}`);
  } else if (sourceModels.length > 0) {
    const firstModel = sourceModels[0];
    const firstAlias = sanitizeAlias(firstModel);

    if (sourceModels.length === 1) {
      lines.push(`FROM {{ ref('${firstModel}') }}`);
    } else {
      // Multiple sources - use JOINs
      lines.push(`FROM {{ ref('${firstModel}') }} ${firstAlias}`);

      // Join remaining models
      const hashKey = config.hashKey || findCommonHashKey(sourceModels);
      sourceModels.slice(1).forEach((model) => {
        const alias = sanitizeAlias(model);
        lines.push(`LEFT JOIN {{ ref('${model}') }} ${alias} ON ${firstAlias}.${hashKey} = ${alias}.${hashKey}`);
      });
    }

    // SCD Type 1: Only use current records from satellites
    if (config.scdType === 'type1') {
      const satelliteModels = sourceModels.filter(m => m.startsWith('sat_'));
      if (satelliteModels.length > 0) {
        const satAlias = sourceModels.length === 1 ? '' : sanitizeAlias(satelliteModels[0]) + '.';
        lines.push(`WHERE ${satAlias}dss_is_current = 'Y'`);
      }
    }
  } else {
    lines.push(`FROM (SELECT 1 AS placeholder) empty -- No source defined yet`);
  }

  return lines.join('\n');
}

/**
 * Get unique source models from attributes
 */
function getUniqueSourceModels(attributes: DimensionConfig['attributes']): string[] {
  if (!attributes || attributes.length === 0) return [];
  const models = new Set<string>();
  attributes.forEach(attr => {
    if (attr.sourceModel) {
      models.add(attr.sourceModel);
    }
  });
  return Array.from(models);
}

/**
 * Sanitize model name for use as SQL alias
 */
function sanitizeAlias(modelName: string): string {
  return modelName.replace(/-/g, '_');
}

/**
 * Try to find a common hash key for joining models
 */
function findCommonHashKey(models: string[]): string {
  // Try to derive from hub name pattern
  const hubModel = models.find(m => m.startsWith('hub_'));
  if (hubModel) {
    return `hk_${hubModel.replace('hub_', '')}`;
  }
  // Default fallback
  return 'hk';
}

/**
 * Generate final SQL for dimension (custom layer)
 */
function generateDimensionFinalSQL(config: DimensionConfig, baseName: string): string {
  const dimName = config.name.startsWith('dim_') ? config.name : `dim_${config.name}`;
  const lines: string[] = [];

  lines.push(`{{`);
  lines.push(`  config(`);
  lines.push(`    materialized='${config.materialization || 'table'}'`);
  lines.push(`  )`);
  lines.push(`}}`);
  lines.push('');
  lines.push(`{# Final model for ${dimName} - Add custom transformations here #}`);
  lines.push('');
  lines.push(`SELECT *`);
  lines.push(`FROM {{ ref('${baseName}') }}`);
  lines.push('');
  lines.push(`{# Add your custom filters, transformations, or business logic below #}`);

  return lines.join('\n');
}

/**
 * Generate base SQL for fact (ephemeral model)
 * NOTE: Do NOT use CTEs in ephemeral models - dbt wraps them in CTEs causing nested CTE errors in SQL Server
 *
 * @param config - Fact configuration from the designer
 * @param hubBusinessKeys - Cache of hub business keys loaded from YAML (description: "Business Key")
 * @param state - Complete mart designer state (to access dimension SCD types)
 */
function generateFactBaseSQL(config: FactConfig, hubBusinessKeys: HubBusinessKeyCache, state: MartDesignerState): string {
  const factName = config.name.startsWith('fact_') ? config.name : `fact_${config.name}`;
  const lines: string[] = [];

  // Config block
  lines.push(`{{`);
  lines.push(`  config(`);
  lines.push(`    materialized='ephemeral'`);
  lines.push(`  )`);
  lines.push(`}}`);
  lines.push('');
  lines.push(`{# Base model for ${factName} - DO NOT EDIT, this file is regenerated #}`);
  lines.push('');

  // Derive sources from measures and degenerate dimensions
  const sourceModels = getFactSourceModels(config);
  const dimensionRefs = config.dimensionRefs || [];

  lines.push(`SELECT`);

  // Collect all columns with proper aliases
  const selectLines: string[] = [];

  // Foreign keys from dimensions
  if (dimensionRefs.length > 0) {
    selectLines.push(`  -- Foreign Keys`);
    dimensionRefs.forEach((ref) => {
      const dimName = ref.dimensionName.startsWith('dim_') ? ref.dimensionName : `dim_${ref.dimensionName}`;
      selectLines.push(`  ${dimName}.${ref.foreignKey}`);
    });
  }

  // Degenerate dimensions
  if (config.degenerateDimensions && config.degenerateDimensions.length > 0) {
    selectLines.push(`  -- Degenerate Dimensions`);
    config.degenerateDimensions.forEach((dd) => {
      if (dd.sourceColumn !== dd.name) {
        selectLines.push(`  sat.${dd.sourceColumn} AS ${dd.name}`);
      } else {
        selectLines.push(`  sat.${dd.name}`);
      }
    });
  }

  // Measures
  if (config.measures && config.measures.length > 0) {
    selectLines.push(`  -- Measures`);
    config.measures.forEach((measure) => {
      if (measure.sourceColumn !== measure.name) {
        selectLines.push(`  sat.${measure.sourceColumn} AS ${measure.name}`);
      } else {
        selectLines.push(`  sat.${measure.name}`);
      }
    });
  }

  // If no columns at all, select placeholder
  if (selectLines.length === 0) {
    selectLines.push(`  1 AS placeholder`);
  }

  // Add commas between select items (not comments)
  const outputLines: string[] = [];
  let lastDataLineIndex = -1;
  selectLines.forEach((line, index) => {
    if (!line.trim().startsWith('--')) {
      lastDataLineIndex = index;
    }
  });
  selectLines.forEach((line, index) => {
    if (!line.trim().startsWith('--') && index < lastDataLineIndex) {
      outputLines.push(line + ',');
    } else {
      outputLines.push(line);
    }
  });
  lines.push(...outputLines);

  // FROM clause - direct refs without CTEs
  if (config.sourceBridge) {
    lines.push(`FROM {{ ref('${config.sourceBridge}') }} bridge`);
    // Join dimensions
    for (const ref of dimensionRefs) {
      const dimName = ref.dimensionName.startsWith('dim_') ? ref.dimensionName : `dim_${ref.dimensionName}`;
      if (ref.factJoinColumn && ref.dimJoinColumn) {
        // Dimensions already filter on dss_is_current='Y' internally in their base model
        lines.push(`LEFT JOIN {{ ref('${dimName}') }} ${dimName} ON bridge.${ref.factJoinColumn} = ${dimName}.${ref.dimJoinColumn}`);
      } else {
        lines.push(`-- TODO: Configure join columns for ${ref.dimensionName}`);
      }
    }
  } else if (sourceModels.length > 0) {
    // Source is typically a satellite - check if we need to join to hub for BK
    const firstModel = sourceModels[0];
    const isSatellite = firstModel.startsWith('sat_');

    if (isSatellite) {
      // Satellite source - need to join to hub to get business keys
      const hubName = firstModel.replace('sat_', 'hub_');
      const entityName = firstModel.replace('sat_', '');  // e.g., "vorgang"
      const hashKey = `hk_${entityName}`;

      // Get the hub's business keys from YAML (identified by description: "Business Key")
      const hubBKs = hubBusinessKeys[hubName] || [];

      lines.push(`FROM {{ ref('${firstModel}') }} sat`);
      lines.push(`INNER JOIN {{ ref('${hubName}') }} hub ON sat.${hashKey} = hub.${hashKey}`);

      // Join dimensions - determine if join column is in hub or sat
      for (const ref of dimensionRefs) {
        const dimName = ref.dimensionName.startsWith('dim_') ? ref.dimensionName : `dim_${ref.dimensionName}`;
        if (ref.factJoinColumn && ref.dimJoinColumn) {
          // Check if the factJoinColumn is a Business Key in the hub (from YAML description)
          // If yes → column is in hub, otherwise → column is FK attribute in satellite
          const isInHub = hubBKs.includes(ref.factJoinColumn);
          const joinSource = isInHub ? 'hub' : 'sat';

          // Dimensions already filter on dss_is_current='Y' internally in their base model
          lines.push(`LEFT JOIN {{ ref('${dimName}') }} ${dimName} ON ${joinSource}.${ref.factJoinColumn} = ${dimName}.${ref.dimJoinColumn}`);
        } else {
          lines.push(`-- TODO: Configure join columns for ${ref.dimensionName}`);
        }
      }
      
      // Filter satellite to current records only
      lines.push(`WHERE sat.dss_is_current = 'Y'`);
    } else {
      // Non-satellite source (hub, link, etc.)
      lines.push(`FROM {{ ref('${firstModel}') }} src`);

      // Join dimensions
      for (const ref of dimensionRefs) {
        const dimName = ref.dimensionName.startsWith('dim_') ? ref.dimensionName : `dim_${ref.dimensionName}`;
        if (ref.factJoinColumn && ref.dimJoinColumn) {
          // Dimensions already filter on dss_is_current='Y' internally in their base model
          lines.push(`LEFT JOIN {{ ref('${dimName}') }} ${dimName} ON src.${ref.factJoinColumn} = ${dimName}.${ref.dimJoinColumn}`);
        } else {
          lines.push(`-- TODO: Configure join columns for ${ref.dimensionName}`);
        }
      }
    }
  } else if (config.sourceLink) {
    // Link as source
    lines.push(`FROM {{ ref('${config.sourceLink}') }} link`);

    // Join satellites if specified
    if (config.sourceSatellites && config.sourceSatellites.length > 0) {
      const linkHashKey = `hk_${config.sourceLink.replace('link_', '')}`;
      config.sourceSatellites.forEach((sat, index) => {
        lines.push(`LEFT JOIN {{ ref('${sat}') }} sat_${index + 1} ON link.${linkHashKey} = sat_${index + 1}.${linkHashKey}`);
      });
    }

    // Join dimensions
    for (const ref of dimensionRefs) {
      const dimName = ref.dimensionName.startsWith('dim_') ? ref.dimensionName : `dim_${ref.dimensionName}`;
      if (ref.factJoinColumn && ref.dimJoinColumn) {
        // Dimensions already filter on dss_is_current='Y' internally in their base model
        lines.push(`LEFT JOIN {{ ref('${dimName}') }} ${dimName} ON link.${ref.factJoinColumn} = ${dimName}.${ref.dimJoinColumn}`);
      } else {
        lines.push(`-- TODO: Configure join columns for ${ref.dimensionName}`);
      }
    }
  } else {
    lines.push(`FROM (SELECT 1 AS placeholder) empty -- No source defined yet`);
  }

  return lines.join('\n');
}

/**
 * Get unique source models from fact config (measures + degenerate dimensions)
 */
function getFactSourceModels(config: FactConfig): string[] {
  const models = new Set<string>();

  if (config.measures) {
    config.measures.forEach(m => {
      if (m.sourceModel) models.add(m.sourceModel);
    });
  }

  if (config.degenerateDimensions) {
    config.degenerateDimensions.forEach(d => {
      if (d.sourceModel) models.add(d.sourceModel);
    });
  }

  return Array.from(models);
}

/**
 * Generate final SQL for fact (custom layer)
 */
function generateFactFinalSQL(config: FactConfig, baseName: string): string {
  const factName = config.name.startsWith('fact_') ? config.name : `fact_${config.name}`;
  const lines: string[] = [];

  lines.push(`{{`);
  lines.push(`  config(`);
  lines.push(`    materialized='${config.materialization || 'table'}'`);
  if (config.materialization === 'incremental' && config.incrementalUniqueKey && config.incrementalUniqueKey.length > 0) {
    lines.push(`    , unique_key=['${config.incrementalUniqueKey.join("', '")}']`);
  }
  lines.push(`  )`);
  lines.push(`}}`);
  lines.push('');
  lines.push(`{# Final model for ${factName} - Add custom transformations here #}`);
  lines.push('');
  lines.push(`SELECT *`);
  lines.push(`FROM {{ ref('${baseName}') }}`);
  lines.push('');
  lines.push(`{# Add your custom filters, transformations, or business logic below #}`);

  return lines.join('\n');
}

/**
 * Generate YAML schema file
 */
async function generateYamlSchema(
  martPath: string,
  concept: string,
  state: MartDesignerState,
  result: GenerationResult
): Promise<void> {
  const yamlFile = path.join(martPath, `_${concept}__models.yml`);
  const lines: string[] = [];

  lines.push(`version: 2`);
  lines.push('');
  lines.push(`models:`);

  // Process dimensions
  for (const node of state.nodes) {
    if (node.type === 'dimension') {
      const config = node.data as DimensionConfig;
      const dimName = config.name.startsWith('dim_') ? config.name : `dim_${config.name}`;
      const surrogateKey = `${dimName}_key`;

      // Determine business key - use config.businessKey or fallback to first attribute
      const businessKey = config.businessKey && config.businessKey.trim() !== ''
        ? config.businessKey
        : (config.attributes && config.attributes.length > 0 ? config.attributes[0].name : null);

      // Filter BK from attributes (it's shown separately)
      const filteredAttributes = config.attributes?.filter(attr => attr.name !== businessKey) || [];

      lines.push(`  - name: ${dimName}`);
      lines.push(`    description: "Dimension table for ${config.name}"`);
      lines.push(`    columns:`);
      lines.push(`      - name: ${surrogateKey}`);
      lines.push(`        description: "Surrogate key"`);
      lines.push(`        data_tests:`);
      lines.push(`          - unique`);
      lines.push(`          - not_null`);

      if (businessKey) {
        lines.push(`      - name: ${businessKey}`);
        lines.push(`        description: "Business key"`);
      }

      for (const attr of filteredAttributes) {
        lines.push(`      - name: ${attr.name}`);
        if (attr.description) {
          lines.push(`        description: "${attr.description}"`);
        }
      }
      lines.push('');
    }
  }

  // Process facts
  for (const node of state.nodes) {
    if (node.type === 'fact') {
      const config = node.data as FactConfig;
      const factName = config.name.startsWith('fact_') ? config.name : `fact_${config.name}`;

      lines.push(`  - name: ${factName}`);
      lines.push(`    description: "Fact table for ${config.name}"`);
      lines.push(`    columns:`);

      if (config.dimensionRefs) {
        for (const ref of config.dimensionRefs) {
          lines.push(`      - name: ${ref.foreignKey}`);
          lines.push(`        description: "Foreign key to ${ref.dimensionName}"`);
        }
      }

      if (config.measures) {
        for (const measure of config.measures) {
          lines.push(`      - name: ${measure.name}`);
          lines.push(`        description: "Measure: ${measure.aggregation || 'SUM'}"`);
        }
      }
      lines.push('');
    }
  }

  await fs.promises.writeFile(yamlFile, lines.join('\n'), 'utf-8');
  result.generatedFiles.push(yamlFile);
}

/**
 * Ensure directory exists
 */
async function ensureDirectory(dirPath: string): Promise<void> {
  if (!fs.existsSync(dirPath)) {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Show generation result to user
 */
export function showGenerationResult(result: GenerationResult): void {
  if (result.success) {
    const message = `Generated ${result.generatedFiles.length} files. ${result.skippedFiles.length} files skipped (already exist).`;
    vscode.window.showInformationMessage(message);
  } else {
    const message = `Generation completed with errors:\n${result.errors.join('\n')}`;
    vscode.window.showErrorMessage(message);
  }

  // Log details to output channel
  const outputChannel = vscode.window.createOutputChannel('Mart Generator');
  outputChannel.appendLine('=== Mart Generation Result ===');
  outputChannel.appendLine(`Success: ${result.success}`);
  outputChannel.appendLine('');
  outputChannel.appendLine('Generated files:');
  result.generatedFiles.forEach(f => outputChannel.appendLine(`  + ${f}`));
  outputChannel.appendLine('');
  outputChannel.appendLine('Skipped files (already exist):');
  result.skippedFiles.forEach(f => outputChannel.appendLine(`  ~ ${f}`));

  if (result.errors.length > 0) {
    outputChannel.appendLine('');
    outputChannel.appendLine('Errors:');
    result.errors.forEach(e => outputChannel.appendLine(`  ! ${e}`));
  }

  outputChannel.show();
}
