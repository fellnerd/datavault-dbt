/**
 * Tool: Add Attribute
 * 
 * Adds a new attribute to an existing satellite.
 */

import { z } from 'zod';
import { readFile, writeFile, PATHS, getRelativePath, fileExists } from '../utils/fileOperations.js';
import * as path from 'path';

export const addAttributeSchema = z.object({
  entityName: z.string().describe('Name der Entity (z.B. "company")'),
  attributeName: z.string().describe('Name des neuen Attributs'),
  dataType: z.string().describe('SQL Server Datentyp (z.B. "NVARCHAR(100)", "INT", "DECIMAL(18,2)")'),
  includeInHashDiff: z.boolean().describe('Im Hash Diff für Change Detection?'),
});

export type AddAttributeInput = z.infer<typeof addAttributeSchema>;

export async function addAttribute(input: AddAttributeInput): Promise<string> {
  const { entityName, attributeName, dataType, includeInHashDiff } = input;
  
  const results: string[] = [];
  const warnings: string[] = [];
  
  // 1. Check sources.yml for external table
  const sourcesPath = PATHS.sourcesYml;
  let sourcesContent = await readFile(sourcesPath);
  const extTablePattern = new RegExp(`ext_${entityName}|ext_company_${entityName}`, 'i');
  
  if (!extTablePattern.test(sourcesContent)) {
    warnings.push(`⚠️ External Table für ${entityName} nicht in sources.yml gefunden. Manuell hinzufügen!`);
  } else {
    results.push(`ℹ️ sources.yml: Spalte "${attributeName}" mit Typ "${dataType}" manuell hinzufügen`);
  }
  
  // 2. Update staging view
  const stagingPath = path.join(PATHS.staging, `stg_${entityName}.sql`);
  if (await fileExists(stagingPath)) {
    let stagingContent = await readFile(stagingPath);
    
    // Check if already exists
    if (stagingContent.includes(attributeName)) {
      warnings.push(`⚠️ Attribut "${attributeName}" existiert bereits in stg_${entityName}.sql`);
    } else {
      // Find hashdiff_columns and add if needed
      if (includeInHashDiff) {
        const hashdiffMatch = stagingContent.match(/hashdiff_columns\s*=\s*\[\s*([\s\S]*?)\]/);
        if (hashdiffMatch) {
          const lastColumn = hashdiffMatch[1].trim().replace(/,\s*$/, '');
          const newHashdiff = `hashdiff_columns = [\n${lastColumn},\n    '${attributeName}'\n]`;
          stagingContent = stagingContent.replace(/hashdiff_columns\s*=\s*\[\s*[\s\S]*?\]/, newHashdiff);
          results.push(`✅ stg_${entityName}.sql: "${attributeName}" zu hashdiff_columns hinzugefügt`);
        }
      }
      
      // Add to PAYLOAD section
      const payloadMatch = stagingContent.match(/(-- PAYLOAD[\s\S]*?)(-- =+\s*\n\s*-- METADATA)/);
      if (payloadMatch) {
        const beforePayload = payloadMatch[1];
        const afterPayload = payloadMatch[2];
        const newPayload = beforePayload.trimEnd() + `,\n        ${attributeName},\n        \n        ${afterPayload}`;
        stagingContent = stagingContent.replace(payloadMatch[0], newPayload);
        results.push(`✅ stg_${entityName}.sql: "${attributeName}" zu PAYLOAD hinzugefügt`);
        await writeFile(stagingPath, stagingContent);
      } else {
        warnings.push(`⚠️ PAYLOAD-Sektion in stg_${entityName}.sql nicht gefunden. Manuell hinzufügen!`);
      }
    }
  } else {
    warnings.push(`⚠️ Staging View stg_${entityName}.sql nicht gefunden`);
  }
  
  // 3. Update satellite
  const satPath = path.join(PATHS.satellites, `sat_${entityName}.sql`);
  if (await fileExists(satPath)) {
    let satContent = await readFile(satPath);
    
    if (satContent.includes(attributeName)) {
      warnings.push(`⚠️ Attribut "${attributeName}" existiert bereits in sat_${entityName}.sql`);
    } else {
      // Find source_data CTE and add column
      const sourceDataMatch = satContent.match(/(SELECT\s+[\s\S]*?)(FROM\s*\{\{\s*ref\('stg_)/);
      if (sourceDataMatch) {
        const selectPart = sourceDataMatch[1].trimEnd();
        const fromPart = sourceDataMatch[2];
        const newSelect = selectPart + `,\n        ${attributeName}\n    ${fromPart}`;
        satContent = satContent.replace(sourceDataMatch[0], newSelect);
        
        // Also add to new_records SELECT
        const newRecordsMatch = satContent.match(/(new_records AS \(\s*SELECT[\s\S]*?)(FROM source_data)/);
        if (newRecordsMatch) {
          const nrSelect = newRecordsMatch[1].trimEnd();
          const nrFrom = newRecordsMatch[2];
          const newNrSelect = nrSelect + `,\n        src.${attributeName}\n    ${nrFrom}`;
          satContent = satContent.replace(newRecordsMatch[0], newNrSelect);
        }
        
        await writeFile(satPath, satContent);
        results.push(`✅ sat_${entityName}.sql: "${attributeName}" hinzugefügt`);
      } else {
        warnings.push(`⚠️ SELECT in sat_${entityName}.sql nicht erkannt. Manuell hinzufügen!`);
      }
    }
  } else {
    warnings.push(`⚠️ Satellite sat_${entityName}.sql nicht gefunden`);
  }
  
  // Build response
  const allResults = [...results, ...warnings];
  
  return `📦 Attribut "${attributeName}" hinzufügen zu Entity "${entityName}"

${allResults.join('\n')}

Nächste Schritte:
1. sources.yml: Spalte zur External Table hinzufügen:
   - name: ${attributeName}
     data_type: ${dataType}
     
2. External Table aktualisieren:
   dbt run-operation stage_external_sources

3. Models mit full-refresh bauen (Schema-Änderung!):
   dbt run --full-refresh --select stg_${entityName} sat_${entityName}

4. Tests ausführen:
   dbt test --select sat_${entityName}`;
}

export const addAttributeTool = {
  name: 'add_attribute',
  description: `Fügt ein neues Attribut zu einer bestehenden Entity hinzu.
Aktualisiert: sources.yml (manuell), Staging View, Satellite.
WICHTIG: Nach Schema-Änderungen ist --full-refresh erforderlich!`,
  input_schema: {
    type: 'object' as const,
    properties: {
      entityName: {
        type: 'string',
        description: 'Name der Entity (z.B. "company")',
      },
      attributeName: {
        type: 'string',
        description: 'Name des neuen Attributs',
      },
      dataType: {
        type: 'string',
        description: 'SQL Server Datentyp (z.B. "NVARCHAR(100)", "INT")',
      },
      includeInHashDiff: {
        type: 'boolean',
        description: 'Im Hash Diff für Change Detection?',
      },
    },
    required: ['entityName', 'attributeName', 'dataType', 'includeInHashDiff'],
  },
};
