/**
 * Validate Model Tool - Validates Data Vault models for conventions and completeness
 * 
 * Checks:
 * - Naming conventions (hub_, sat_, link_, stg_, etc.)
 * - Required columns (hash keys, metadata)
 * - Dependencies (hub exists for satellite)
 * - SQL syntax basics
 */

import type Anthropic from '@anthropic-ai/sdk';
import { scanProject } from '../projectScanner.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { 
  getConceptPaths, 
  getAvailableConcepts, 
  PATHS,
  fileExists 
} from '../utils/fileOperations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

interface ValidateModelInput {
  model?: string;
  type?: 'all' | 'hubs' | 'satellites' | 'links' | 'staging';
}

interface ValidationResult {
  model: string;
  type: string;
  errors: string[];
  warnings: string[];
  passed: boolean;
}

export const validateModelTool: Anthropic.Messages.Tool = {
  name: 'validate_model',
  description: `Validiert Data Vault Models auf Konventionen und Vollständigkeit.
Prüft:
- Namenskonventionen (hub_, sat_, link_, stg_)
- Erforderliche Spalten (Hash Keys, Metadata)
- Dependencies (Hub existiert für Satellite)
- SQL Syntax

Beispiel: validate_model() - Validiert alle Models
Beispiel: validate_model(model="sat_company") - Validiert ein Model
Beispiel: validate_model(type="satellites") - Validiert alle Satellites`,
  input_schema: {
    type: 'object' as const,
    properties: {
      model: {
        type: 'string',
        description: 'Spezifisches Model zum Validieren (optional)',
      },
      type: {
        type: 'string',
        enum: ['all', 'hubs', 'satellites', 'links', 'staging'],
        description: 'Typ der Models zum Validieren (default: all)',
      },
    },
    required: [],
  },
};

export async function validateModel(input: ValidateModelInput): Promise<string> {
  const { model, type = 'all' } = input;
  const metadata = await scanProject();
  
  const results: ValidationResult[] = [];
  
  if (model) {
    // Validate specific model
    const result = await validateSingleModel(model);
    results.push(result);
  } else {
    // Validate by type
    if (type === 'all' || type === 'hubs') {
      for (const hub of metadata.hubs) {
        results.push(await validateHub(hub.fullName, hub.filePath));
      }
    }
    
    if (type === 'all' || type === 'satellites') {
      for (const sat of metadata.satellites) {
        results.push(await validateSatellite(sat.fullName, sat.filePath, sat.parentHub));
      }
    }
    
    if (type === 'all' || type === 'links') {
      for (const link of metadata.links) {
        results.push(await validateLink(link.fullName, link.filePath, link.connectedHubs));
      }
    }
    
    if (type === 'all' || type === 'staging') {
      const stagingDir = path.join(PROJECT_ROOT, 'models', 'staging');
      try {
        const files = await fs.readdir(stagingDir);
        for (const file of files) {
          if (file.endsWith('.sql') && file.startsWith('stg_')) {
            const name = file.replace('.sql', '');
            results.push(await validateStaging(name, path.join('models', 'staging', file)));
          }
        }
      } catch {}
    }
  }
  
  // Format output
  const lines: string[] = ['# 🔍 Validierungsergebnis\n'];
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const warnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  
  lines.push('## Zusammenfassung');
  lines.push(`| Status | Anzahl |`);
  lines.push(`|--------|--------|`);
  lines.push(`| ✅ Bestanden | ${passed} |`);
  lines.push(`| ❌ Fehlgeschlagen | ${failed} |`);
  lines.push(`| ⚠️ Warnungen | ${warnings} |`);
  lines.push('');
  
  // Show failures first
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    lines.push('## ❌ Fehler');
    for (const result of failures) {
      lines.push(`### ${result.model} (${result.type})`);
      for (const error of result.errors) {
        lines.push(`- ❌ ${error}`);
      }
      for (const warning of result.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push('');
    }
  }
  
  // Show warnings
  const withWarnings = results.filter(r => r.passed && r.warnings.length > 0);
  if (withWarnings.length > 0) {
    lines.push('## ⚠️ Warnungen');
    for (const result of withWarnings) {
      lines.push(`### ${result.model}`);
      for (const warning of result.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push('');
    }
  }
  
  // List passed
  const passedResults = results.filter(r => r.passed && r.warnings.length === 0);
  if (passedResults.length > 0) {
    lines.push('## ✅ Bestanden');
    for (const result of passedResults) {
      lines.push(`- ${result.model}`);
    }
  }
  
  return lines.join('\n');
}

async function validateSingleModel(model: string): Promise<ValidationResult> {
  // Find actual file path by searching all concept directories
  let filePath: string | null = null;
  
  if (model.startsWith('hub_') || model.startsWith('sat_') || 
      model.startsWith('eff_sat_') || model.startsWith('link_')) {
    const concepts = await getAvailableConcepts();
    
    for (const concept of concepts) {
      const conceptPaths = getConceptPaths(concept);
      let testPath: string;
      
      if (model.startsWith('hub_')) {
        testPath = path.join(conceptPaths.hubs, `${model}.sql`);
      } else if (model.startsWith('sat_') || model.startsWith('eff_sat_')) {
        testPath = path.join(conceptPaths.satellites, `${model}.sql`);
      } else if (model.startsWith('link_')) {
        testPath = path.join(conceptPaths.links, `${model}.sql`);
      } else {
        continue;
      }
      
      if (await fileExists(testPath)) {
        filePath = path.relative(PROJECT_ROOT, testPath);
        break;
      }
    }
  } else if (model.startsWith('stg_')) {
    filePath = `models/staging/${model}.sql`;
  }
  
  if (!filePath) {
    return {
      model,
      type: 'unknown',
      errors: ['Model-Datei nicht gefunden'],
      warnings: [],
      passed: false,
    };
  }
  
  if (model.startsWith('hub_')) {
    return validateHub(model, filePath);
  }
  if (model.startsWith('sat_') || model.startsWith('eff_sat_')) {
    return validateSatellite(model, filePath, undefined);
  }
  if (model.startsWith('link_')) {
    return validateLink(model, filePath, []);
  }
  if (model.startsWith('stg_')) {
    return validateStaging(model, filePath);
  }
  
  return {
    model,
    type: 'unknown',
    errors: ['Unbekannter Model-Typ. Erwartet: hub_, sat_, link_, stg_'],
    warnings: [],
    passed: false,
  };
}

async function validateHub(name: string, filePath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check naming
  if (!name.startsWith('hub_')) {
    errors.push(`Name muss mit "hub_" beginnen: ${name}`);
  }
  
  // Check file exists
  const fullPath = path.join(PROJECT_ROOT, filePath);
  let sql = '';
  try {
    sql = await fs.readFile(fullPath, 'utf-8');
  } catch {
    errors.push(`Datei nicht gefunden: ${filePath}`);
    return { model: name, type: 'hub', errors, warnings, passed: false };
  }
  
  const entityName = name.replace('hub_', '');
  
  // Check required columns
  if (!sql.includes(`hk_${entityName}`)) {
    errors.push(`Hash Key hk_${entityName} nicht gefunden`);
  }
  
  if (!sql.includes('dss_load_date')) {
    warnings.push('Metadata-Spalte dss_load_date nicht gefunden');
  }
  
  if (!sql.includes('dss_record_source')) {
    warnings.push('Metadata-Spalte dss_record_source nicht gefunden');
  }
  
  // Check for ref to staging
  if (!sql.includes(`stg_${entityName}`) && !sql.includes(`ref('stg_`)) {
    warnings.push(`Keine Referenz auf Staging View stg_${entityName} gefunden`);
  }
  
  return {
    model: name,
    type: 'hub',
    errors,
    warnings,
    passed: errors.length === 0,
  };
}

async function validateSatellite(name: string, filePath: string, parentHub: string | undefined): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check naming
  if (!name.startsWith('sat_') && !name.startsWith('eff_sat_')) {
    errors.push(`Name muss mit "sat_" oder "eff_sat_" beginnen: ${name}`);
  }
  
  // Check file exists
  const fullPath = path.join(PROJECT_ROOT, filePath);
  let sql = '';
  try {
    sql = await fs.readFile(fullPath, 'utf-8');
  } catch {
    errors.push(`Datei nicht gefunden: ${filePath}`);
    return { model: name, type: 'satellite', errors, warnings, passed: false };
  }
  
  const entityName = name.replace('eff_sat_', '').replace('sat_', '');
  
  // Check for hash key reference
  if (!sql.includes(`hk_${entityName}`) && !sql.includes(`hk_`)) {
    warnings.push(`Hash Key Referenz nicht gefunden`);
  }
  
  // Check for hash diff (satellites should have it)
  if (!name.startsWith('eff_sat_') && !sql.includes(`hd_${entityName}`) && !sql.includes('hd_')) {
    warnings.push(`Hash Diff hd_${entityName} nicht gefunden`);
  }
  
  // Check metadata
  if (!sql.includes('dss_load_date')) {
    warnings.push('Metadata-Spalte dss_load_date nicht gefunden');
  }
  
  // Check parent hub exists
  if (parentHub) {
    const hubPath = path.join(PROJECT_ROOT, 'models', 'raw_vault', 'hubs', `${parentHub}.sql`);
    try {
      await fs.access(hubPath);
    } catch {
      errors.push(`Parent Hub ${parentHub} existiert nicht`);
    }
  }
  
  return {
    model: name,
    type: 'satellite',
    errors,
    warnings,
    passed: errors.length === 0,
  };
}

async function validateLink(name: string, filePath: string, connectedHubs: string[]): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check naming
  if (!name.startsWith('link_')) {
    errors.push(`Name muss mit "link_" beginnen: ${name}`);
  }
  
  // Check file exists
  const fullPath = path.join(PROJECT_ROOT, filePath);
  let sql = '';
  try {
    sql = await fs.readFile(fullPath, 'utf-8');
  } catch {
    errors.push(`Datei nicht gefunden: ${filePath}`);
    return { model: name, type: 'link', errors, warnings, passed: false };
  }
  
  const linkName = name.replace('link_', '');
  
  // Check for link hash key
  if (!sql.includes(`hk_${linkName}`) && !sql.includes('hk_link')) {
    warnings.push(`Link Hash Key hk_${linkName} nicht gefunden`);
  }
  
  // Check connected hubs exist
  for (const hub of connectedHubs) {
    const hubPath = path.join(PROJECT_ROOT, 'models', 'raw_vault', 'hubs', `${hub}.sql`);
    try {
      await fs.access(hubPath);
    } catch {
      errors.push(`Verbundener Hub ${hub} existiert nicht`);
    }
  }
  
  if (connectedHubs.length < 2) {
    warnings.push('Link sollte mindestens 2 Hubs verbinden');
  }
  
  return {
    model: name,
    type: 'link',
    errors,
    warnings,
    passed: errors.length === 0,
  };
}

async function validateStaging(name: string, filePath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check naming
  if (!name.startsWith('stg_')) {
    errors.push(`Name muss mit "stg_" beginnen: ${name}`);
  }
  
  // Check file exists
  const fullPath = path.join(PROJECT_ROOT, filePath);
  let sql = '';
  try {
    sql = await fs.readFile(fullPath, 'utf-8');
  } catch {
    errors.push(`Datei nicht gefunden: ${filePath}`);
    return { model: name, type: 'staging', errors, warnings, passed: false };
  }
  
  const entityName = name.replace('stg_', '');
  
  // Check for hash calculation
  if (!sql.includes('HASHBYTES') && !sql.includes('SHA2_256')) {
    warnings.push('Keine HASHBYTES/SHA2_256 Hash-Berechnung gefunden');
  }
  
  // Check for hash key
  if (!sql.includes(`hk_${entityName}`)) {
    warnings.push(`Hash Key hk_${entityName} nicht definiert`);
  }
  
  // Check for source reference
  if (!sql.includes('source(')) {
    errors.push('Keine source() Referenz gefunden');
  }
  
  // Check for metadata columns
  if (!sql.includes('dss_record_source')) {
    warnings.push('Metadata-Spalte dss_record_source nicht definiert');
  }
  
  return {
    model: name,
    type: 'staging',
    errors,
    warnings,
    passed: errors.length === 0,
  };
}
