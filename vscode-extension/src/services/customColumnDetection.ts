import * as fs from 'fs';
import * as path from 'path';
import { CustomColumn } from '../types';

/**
 * Custom Column Detection Service
 *
 * Detects custom columns added manually to the final model layer.
 * This allows the Mart Designer to show which columns were added
 * outside of the designer (in the SQL file directly).
 *
 * Detection Strategy:
 * 1. Read the final model SQL file (e.g., dim_company.sql)
 * 2. Find SELECT columns after "base.*"
 * 3. Parse column aliases (expression AS name)
 * 4. Mark as custom columns
 */

/**
 * Detect custom columns in a final model SQL file
 */
export async function detectCustomColumns(
  projectPath: string,
  concept: string,
  modelName: string
): Promise<CustomColumn[]> {
  const finalPath = path.join(
    projectPath,
    'models',
    'mart',
    concept,
    `${modelName}.sql`
  );

  // Check if file exists
  if (!fs.existsSync(finalPath)) {
    return [];
  }

  try {
    const content = await fs.promises.readFile(finalPath, 'utf-8');
    return parseCustomColumns(content);
  } catch (error) {
    console.error(`[CustomColumnDetection] Error reading ${finalPath}:`, error);
    return [];
  }
}

/**
 * Parse custom columns from SQL content
 */
function parseCustomColumns(content: string): CustomColumn[] {
  const columns: CustomColumn[] = [];

  // Remove comments (both -- and /* */)
  const cleanContent = removeComments(content);

  // Find the SELECT clause after base.*
  const selectMatch = cleanContent.match(/SELECT[\s\S]*?FROM/i);
  if (!selectMatch) {
    return columns;
  }

  const selectClause = selectMatch[0];

  // Check if there's a base.* pattern
  const baseStarMatch = selectClause.match(/base\.\*/i);
  if (!baseStarMatch) {
    // No base.* found - might be fully custom or different pattern
    return columns;
  }

  // Get everything after base.*
  const afterBaseStar = selectClause.substring(
    selectClause.indexOf('base.*') + 6,
    selectClause.lastIndexOf('FROM')
  );

  // Parse column definitions
  // Pattern: , <expression> AS <name>
  const columnRegex = /,\s*([^,]+?)\s+AS\s+(\w+)/gi;
  let match;

  while ((match = columnRegex.exec(afterBaseStar)) !== null) {
    const expression = match[1].trim();
    const name = match[2].trim();

    // Skip if it's just referencing base columns
    if (expression.toLowerCase().startsWith('base.')) {
      continue;
    }

    columns.push({
      name,
      expression,
      addedManually: true,
      dataType: inferDataType(expression)
    });
  }

  return columns;
}

/**
 * Remove SQL comments from content
 */
function removeComments(content: string): string {
  // Remove single-line comments
  let result = content.replace(/--.*$/gm, '');

  // Remove multi-line comments (non-greedy)
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove Jinja comments
  result = result.replace(/\{#[\s\S]*?#\}/g, '');

  return result;
}

/**
 * Infer data type from SQL expression
 */
function inferDataType(expression: string): string | undefined {
  const expr = expression.toUpperCase();

  // String functions
  if (expr.includes('CONCAT') || expr.includes('UPPER') || expr.includes('LOWER') ||
      expr.includes('TRIM') || expr.includes('SUBSTRING') || expr.includes('REPLACE')) {
    return 'NVARCHAR(MAX)';
  }

  // Numeric functions
  if (expr.includes('SUM') || expr.includes('AVG') || expr.includes('COUNT') ||
      expr.includes('ROUND')) {
    return 'DECIMAL(18,2)';
  }

  // Date functions
  if (expr.includes('DATEADD') || expr.includes('DATEDIFF') || expr.includes('GETDATE') ||
      expr.includes('CONVERT') && expr.includes('DATE')) {
    return 'DATE';
  }

  // CASE expressions often return various types
  if (expr.includes('CASE')) {
    // Check for string results
    if (expr.includes("'")) {
      return 'NVARCHAR(255)';
    }
    return undefined;
  }

  // ROW_NUMBER, RANK, etc.
  if (expr.includes('ROW_NUMBER') || expr.includes('RANK') || expr.includes('DENSE_RANK')) {
    return 'INT';
  }

  return undefined;
}

/**
 * Check if a model has custom columns
 */
export async function hasCustomColumns(
  projectPath: string,
  concept: string,
  modelName: string
): Promise<boolean> {
  const columns = await detectCustomColumns(projectPath, concept, modelName);
  return columns.length > 0;
}

/**
 * Get summary of custom columns for a model
 */
export async function getCustomColumnSummary(
  projectPath: string,
  concept: string,
  modelName: string
): Promise<{ hasCustom: boolean; count: number; names: string[] }> {
  const columns = await detectCustomColumns(projectPath, concept, modelName);
  return {
    hasCustom: columns.length > 0,
    count: columns.length,
    names: columns.map(c => c.name)
  };
}

/**
 * Detect custom columns for all models in a concept
 */
export async function detectAllCustomColumns(
  projectPath: string,
  concept: string
): Promise<Map<string, CustomColumn[]>> {
  const result = new Map<string, CustomColumn[]>();
  const martPath = path.join(projectPath, 'models', 'mart', concept);

  if (!fs.existsSync(martPath)) {
    return result;
  }

  try {
    const files = await fs.promises.readdir(martPath);
    const sqlFiles = files.filter(f =>
      f.endsWith('.sql') &&
      !f.startsWith('_base_') &&
      !f.startsWith('_')
    );

    for (const file of sqlFiles) {
      const modelName = file.replace('.sql', '');
      const columns = await detectCustomColumns(projectPath, concept, modelName);
      if (columns.length > 0) {
        result.set(modelName, columns);
      }
    }
  } catch (error) {
    console.error(`[CustomColumnDetection] Error scanning ${martPath}:`, error);
  }

  return result;
}
