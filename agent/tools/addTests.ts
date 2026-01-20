/**
 * Tool: Add Tests
 * 
 * Adds dbt tests to schema.yml for a model.
 */

import { z } from 'zod';
import { readYaml, writeYaml, PATHS, getRelativePath } from '../utils/fileOperations.js';

export const addTestsSchema = z.object({
  modelName: z.string().describe('Name des Models (z.B. "hub_company")'),
  tests: z.array(z.object({
    column: z.string().describe('Spalten-Name'),
    testTypes: z.array(z.enum(['not_null', 'unique', 'accepted_values', 'relationships'])).describe('Test-Typen'),
    acceptedValues: z.array(z.string()).optional().describe('Erlaubte Werte (für accepted_values Test)'),
    relationshipTo: z.string().optional().describe('Ziel-Model (für relationships Test)'),
    relationshipField: z.string().optional().describe('Ziel-Feld (für relationships Test)'),
  })).describe('Tests für Spalten'),
});

export type AddTestsInput = z.infer<typeof addTestsSchema>;

interface SchemaYaml {
  version?: number;
  models?: Array<{
    name: string;
    columns?: Array<{
      name: string;
      tests?: Array<string | object>;
    }>;
  }>;
}

export async function addTests(input: AddTestsInput): Promise<string> {
  const { modelName, tests } = input;
  
  let schema: SchemaYaml;
  try {
    schema = await readYaml<SchemaYaml>(PATHS.schemaYml);
  } catch {
    schema = { version: 2, models: [] };
  }
  
  if (!schema.models) {
    schema.models = [];
  }
  
  // Find or create model entry
  let model = schema.models.find(m => m.name === modelName);
  if (!model) {
    model = { name: modelName, columns: [] };
    schema.models.push(model);
  }
  
  if (!model.columns) {
    model.columns = [];
  }
  
  // Process each test
  const addedTests: string[] = [];
  
  for (const test of tests) {
    // Find or create column
    let column = model.columns.find(c => c.name === test.column);
    if (!column) {
      column = { name: test.column, tests: [] };
      model.columns.push(column);
    }
    
    if (!column.tests) {
      column.tests = [];
    }
    
    // Add each test type
    for (const testType of test.testTypes) {
      if (testType === 'not_null' || testType === 'unique') {
        if (!column.tests.includes(testType)) {
          column.tests.push(testType);
          addedTests.push(`${test.column}: ${testType}`);
        }
      } else if (testType === 'accepted_values' && test.acceptedValues) {
        const existingAV = column.tests.find(
          t => typeof t === 'object' && 'accepted_values' in t
        );
        if (!existingAV) {
          column.tests.push({
            accepted_values: { values: test.acceptedValues }
          });
          addedTests.push(`${test.column}: accepted_values [${test.acceptedValues.join(', ')}]`);
        }
      } else if (testType === 'relationships' && test.relationshipTo && test.relationshipField) {
        const existingRel = column.tests.find(
          t => typeof t === 'object' && 'relationships' in t
        );
        if (!existingRel) {
          column.tests.push({
            relationships: {
              to: `ref('${test.relationshipTo}')`,
              field: test.relationshipField
            }
          });
          addedTests.push(`${test.column}: relationships → ${test.relationshipTo}.${test.relationshipField}`);
        }
      }
    }
  }
  
  await writeYaml(PATHS.schemaYml, schema);
  
  if (addedTests.length === 0) {
    return `ℹ️ Keine neuen Tests hinzugefügt für ${modelName} (bereits vorhanden)`;
  }
  
  return `✅ Tests hinzugefügt zu ${getRelativePath(PATHS.schemaYml)}

Model: ${modelName}
Hinzugefügte Tests:
${addedTests.map(t => `  • ${t}`).join('\n')}

Nächste Schritte:
1. Tests ausführen: dbt test --select ${modelName}`;
}

export const addTestsTool = {
  name: 'add_tests',
  description: `Fügt dbt Tests zu schema.yml hinzu.
Unterstützte Tests: not_null, unique, accepted_values, relationships`,
  input_schema: {
    type: 'object' as const,
    properties: {
      modelName: {
        type: 'string',
        description: 'Name des Models (z.B. "hub_company")',
      },
      tests: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            column: { type: 'string', description: 'Spalten-Name' },
            testTypes: {
              type: 'array',
              items: { type: 'string', enum: ['not_null', 'unique', 'accepted_values', 'relationships'] },
            },
            acceptedValues: { type: 'array', items: { type: 'string' } },
            relationshipTo: { type: 'string' },
            relationshipField: { type: 'string' },
          },
          required: ['column', 'testTypes'],
        },
        description: 'Tests für Spalten',
      },
    },
    required: ['modelName', 'tests'],
  },
};
