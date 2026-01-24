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

  // Hash Key
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

  // Business Keys
  for (const bk of config.businessKeyColumns) {
    columns.push({
      name: bk,
      description: 'Business Key',
      tests: ['not_null']
    });
  }

  // Payload columns
  for (const col of config.payloadColumns) {
    // Skip if already added as business key
    if (config.businessKeyColumns.includes(col)) {
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
 */
export function generateModelYaml(config: StagingConfig): YamlModel {
  const modelName = `${config.concept}_${config.entityName}`;
  
  return {
    name: modelName,
    description: `Staging view for ${config.entityName} from ${config.concept}`,
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
