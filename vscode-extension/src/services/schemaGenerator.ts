/**
 * Schema Generator Service
 * 
 * Generates and updates YAML schema files for dbt models.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { StagingConfig, YamlColumnDefinition } from '../types';

/**
 * YAML model definition structure
 */
interface YamlModel {
  name: string;
  description?: string;
  config?: {
    meta?: {
      entity_type?: string;
      source_type?: string;
      external_table?: string;
      business_keys?: string[];
      foreign_keys?: Array<{
        column: string;
        target_entity: string;
        target_hub: string;
      }>;
      dependent_child_keys?: Record<string, string[]>;
      multi_active_keys?: string[];
    };
  };
  columns?: YamlColumnDefinition[];
}

interface YamlSchema {
  version: number;
  models: YamlModel[];
}

/**
 * Generate column definitions for a staging model
 */
export function generateStagingColumns(config: StagingConfig): YamlColumnDefinition[] {
  const columns: YamlColumnDefinition[] = [];

  // For Pure Link Entity (link_only): No entity hash key, use combined link hash
  if (config.isPureLinkEntity && config.foreignKeys.length >= 2) {
    // Combined Link Hash Key
    const targetEntities = config.foreignKeys.map(fk => fk.targetEntity);
    const linkHashName = `hk_link_${targetEntities.join('_')}`;
    columns.push({
      name: linkHashName,
      description: 'Combined Link Hash Key (Primary Key)',
      data_type: 'char(64)',
      tests: ['not_null', 'unique']
    });

    // FK Hash Keys for each referenced entity
    for (const fk of config.foreignKeys) {
      columns.push({
        name: `hk_${fk.targetEntity}`,
        description: `Foreign Key to hub_${fk.targetEntity}`,
        data_type: 'char(64)',
        tests: ['not_null']
      });
    }

    // Link Satellite Hash Diff
    const hashDiffName = `hd_${targetEntities.join('_')}`;
    columns.push({
      name: hashDiffName,
      description: 'Hash Diff for Link Satellite change detection',
      data_type: 'char(64)',
      tests: ['not_null']
    });
  } else {
    // Standard entity: Entity Hash Key
    columns.push({
      name: `hk_${config.entityName}`,
      description: 'Hash Key (Primary Key)',
      data_type: 'char(64)',
      tests: ['not_null', 'unique']
    });

    // FK Hash Keys
    for (const fk of config.foreignKeys) {
      columns.push({
        name: `hk_${fk.targetEntity}`,
        description: `Foreign Key to hub_${fk.targetEntity}`,
        data_type: 'char(64)',
        tests: ['not_null']
      });
    }

    // Hash Diff
    columns.push({
      name: `hd_${config.entityName}`,
      description: 'Hash Diff for change detection',
      data_type: 'char(64)',
      tests: ['not_null']
    });
  }

  // Business Keys (only for standard entities)
  for (const bk of config.businessKeyColumns) {
    columns.push({
      name: bk,
      description: 'Business Key',
      tests: ['not_null']
    });
  }

  // FK Columns (for link_only entities, show the source columns)
  if (config.isPureLinkEntity) {
    for (const fk of config.foreignKeys) {
      columns.push({
        name: fk.sourceColumn,
        description: `FK to hub_${fk.targetEntity}`,
        tests: ['not_null']
      });
    }
  }

  // Payload columns
  for (const col of config.payloadColumns) {
    // Skip if already added as business key or FK
    if (config.businessKeyColumns.includes(col)) {
      continue;
    }
    if (config.foreignKeys.some(fk => fk.sourceColumn === col)) {
      continue;
    }
    columns.push({
      name: col,
      description: `Payload attribute`
    });
  }

  // Metadata columns
  columns.push({
    name: 'dss_record_source',
    description: 'Data source identifier',
    data_type: 'varchar(100)',
    tests: ['not_null']
  });

  columns.push({
    name: 'dss_load_date',
    description: 'Load timestamp',
    data_type: 'datetime2(7)',
    tests: ['not_null']
  });

  if (config.includeRunId) {
    columns.push({
      name: 'dss_run_id',
      description: 'dbt run identifier'
    });
  }

  return columns;
}

/**
 * Generate a complete model entry for _staging__models.yml
 * Includes entity configuration in the meta block for later use by Entity Designer
 */
export function generateModelYaml(config: StagingConfig): YamlModel {
  const modelName = `${config.concept}_${config.entityName}`;
  
  // Build meta configuration
  const meta: YamlModel['config'] = {
    meta: {
      entity_type: config.entityType || 'standard',
      source_type: config.sourceType || 'external_table',
      external_table: config.externalTable,
      business_keys: config.businessKeyColumns.length > 0 ? config.businessKeyColumns : undefined,
      foreign_keys: config.foreignKeys.length > 0 
        ? config.foreignKeys.map(fk => ({
            column: fk.sourceColumn,
            target_entity: fk.targetEntity,
            target_hub: fk.targetHub
          }))
        : undefined,
      dependent_child_keys: config.dependentChildKeys,
      multi_active_keys: config.multiActiveKeys
    }
  };

  // Clean up undefined values from meta
  const cleanMeta = Object.fromEntries(
    Object.entries(meta.meta!).filter(([_, v]) => v !== undefined)
  );

  return {
    name: modelName,
    description: `Staging view for ${config.entityName} from ${config.concept}`,
    config: { meta: cleanMeta },
    columns: generateStagingColumns(config)
  };
}

/**
 * Add or update a model in the staging schema YAML file
 */
export async function updateStagingSchemaYaml(
  projectPath: string,
  config: StagingConfig
): Promise<{ success: boolean; filePath: string; error?: string }> {
  const schemaPath = path.join(projectPath, 'models', 'staging', '_staging__models.yml');
  
  try {
    let schema: YamlSchema;
    
    if (fs.existsSync(schemaPath)) {
      // Read existing schema
      const content = fs.readFileSync(schemaPath, 'utf-8');
      const parsed = YAML.parse(content);
      
      // Ensure proper structure
      schema = {
        version: parsed?.version || 2,
        models: Array.isArray(parsed?.models) ? [...parsed.models] : []
      };
    } else {
      // Create new schema file
      schema = {
        version: 2,
        models: []
      };
    }

    const modelName = `${config.concept}_${config.entityName}`;
    const newModel = generateModelYaml(config);

    // Find existing model index
    const existingIndex = schema.models.findIndex(m => m.name === modelName);
    
    if (existingIndex >= 0) {
      // Update existing model - replace entirely
      schema.models[existingIndex] = newModel;
    } else {
      // Add new model
      schema.models.push(newModel);
      // Sort alphabetically
      schema.models.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Write updated schema with proper YAML formatting
    const doc = new YAML.Document(schema);
    const yamlContent = doc.toString({
      indent: 2,
      lineWidth: 0,
      singleQuote: false
    });

    // Ensure directory exists
    const dir = path.dirname(schemaPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(schemaPath, yamlContent, 'utf-8');

    return {
      success: true,
      filePath: schemaPath
    };
  } catch (error) {
    return {
      success: false,
      filePath: schemaPath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check if a staging model already exists in the schema
 */
export function stagingModelExists(projectPath: string, concept: string, entityName: string): boolean {
  const schemaPath = path.join(projectPath, 'models', 'staging', '_staging__models.yml');
  
  if (!fs.existsSync(schemaPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(schemaPath, 'utf-8');
    const schema = YAML.parse(content) as YamlSchema;
    
    const modelName = `${concept}_${entityName}`;
    return schema.models?.some(m => m.name === modelName) ?? false;
  } catch {
    return false;
  }
}

/**
 * Remove a model from the staging schema YAML file
 */
export async function removeFromStagingSchemaYaml(
  projectPath: string,
  modelName: string
): Promise<{ success: boolean; error?: string }> {
  const schemaPath = path.join(projectPath, 'models', 'staging', '_staging__models.yml');
  
  if (!fs.existsSync(schemaPath)) {
    return { success: true }; // Nothing to remove
  }

  try {
    const content = fs.readFileSync(schemaPath, 'utf-8');
    const parsed = YAML.parse(content);
    
    const schema: YamlSchema = {
      version: parsed?.version || 2,
      models: Array.isArray(parsed?.models) ? [...parsed.models] : []
    };

    // Find and remove the model
    const initialLength = schema.models.length;
    schema.models = schema.models.filter(m => m.name !== modelName);
    
    if (schema.models.length === initialLength) {
      // Model was not found, but that's OK
      return { success: true };
    }

    // Write updated schema
    const doc = new YAML.Document(schema);
    const yamlContent = doc.toString({
      indent: 2,
      lineWidth: 0,
      singleQuote: false
    });

    fs.writeFileSync(schemaPath, yamlContent, 'utf-8');

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
