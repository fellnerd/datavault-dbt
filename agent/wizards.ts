/**
 * Wizard System - Structured parameter input for dbt actions
 * 
 * Instead of free-form prompts, users select options from menus
 * based on the actual project structure.
 */

import { input, select, checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { 
  scanProject, 
  ProjectMetadata, 
  HubInfo, 
  SatelliteInfo,
  getSatellitesForHub,
  getLinksForHub,
  formatMetadataSummary,
  scanStagingModels,
  getStagingForEntity,
  StagingInfo,
  getAvailableAttributesForSatellite,
  getExternalTableColumns,
} from './projectScanner.js';
import * as ui from './ui.js';

// ============================================================================
// Types
// ============================================================================

export interface MartWizardResult {
  type: 'mart';
  viewName: string;
  schema: string;              // Business context (customer, project, etc.)
  description: string;
  sourceHubs: string[];        // Selected hubs
  sourceSatellites: string[];  // Selected satellites
  sourceLinks: string[];       // Selected links
  includeCurrentFlag: boolean; // Filter on dss_is_current = 'Y'
  excludeGhosts: boolean;      // WHERE object_id > 0
}

export interface HubWizardResult {
  type: 'hub';
  entityName: string;
  businessKeyColumn: string;
  sourceTable: string;         // External table name
  description: string;
}

export interface SatelliteWizardResult {
  type: 'satellite';
  entityName: string;
  parentHub: string;
  attributes: string[];
  isExtended: boolean;         // sat_*_ext pattern
  sourceStaging: string;
  description: string;
}

export interface LinkWizardResult {
  type: 'link';
  name: string;
  hub1: string;
  hub2: string;
  degenerateAttributes?: string[];
  sourceStaging: string;
  description: string;
}

export interface EntityWizardResult {
  type: 'entity';
  entityName: string;
  externalTable: string;
  businessKeyColumns: string[];  // Can be composite key
  attributeColumns: string[];
  createStaging: boolean;
  createHub: boolean;
  createSatellite: boolean;
  recordSource: string;
}

export type EditAction = 
  | 'add_attribute'
  | 'remove_attribute'
  | 'add_to_hashdiff'
  | 'remove_from_hashdiff'
  | 'change_source'
  | 'add_fk'
  | 'custom';

export interface EditWizardResult {
  type: 'edit';
  modelName: string;
  modelType: 'staging' | 'hub' | 'satellite' | 'link' | 'mart';
  currentContent: string;
  filePath: string;
  editAction: EditAction;
  // Action-specific data
  attributeName?: string;       // Single attribute (for remove, hashdiff operations)
  attributeNames?: string[];    // Multiple attributes (for add_attribute)
  attributeType?: string;
  includeInHashDiff?: boolean;
  sourceModel?: string;
  fkColumn?: string;
  fkTargetHub?: string;
  customDescription?: string;
}

export interface DeleteWizardResult {
  type: 'delete';
  modelName: string;
  modelType: 'staging' | 'hub' | 'satellite' | 'link' | 'mart' | 'seed';
  filePath: string;
  confirmed: boolean;
}

export type WizardResult = 
  | MartWizardResult 
  | HubWizardResult 
  | SatelliteWizardResult 
  | LinkWizardResult 
  | EntityWizardResult
  | EditWizardResult
  | DeleteWizardResult;

// ============================================================================
// Entity Wizard (Complete: Staging + Hub + Satellite)
// ============================================================================

/**
 * Interactive wizard for creating a complete entity
 * Creates: External Table entry, Staging View, Hub, Satellite
 */
export async function runEntityWizard(): Promise<EntityWizardResult | null> {
  console.log('');
  console.log(ui.box('Entity Wizard - Komplette Entity erstellen', 'info'));
  console.log('');
  
  // Scan project
  console.log(chalk.gray('  Analysiere Projekt-Struktur...'));
  const metadata = await scanProject();
  console.log(chalk.green('  [OK] Projekt gescannt'));
  console.log('');
  
  // Show existing entities
  if (metadata.hubs.length > 0) {
    console.log(chalk.gray('  Existierende Hubs:'));
    metadata.hubs.forEach(h => console.log(chalk.gray(`    - ${h.fullName}`)));
    console.log('');
  }

  // Step 1: Entity name
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  [1/6] Entity Name'));
  console.log(chalk.gray('  Dieser Name wird fuer alle Objekte verwendet:'));
  console.log(chalk.gray('    ext_<name>, stg_<name>, hub_<name>, sat_<name>'));
  console.log('');

  const entityName = await input({
    message: 'Entity Name (z.B. "product", "employee"):',
    validate: (v) => {
      if (!v || v.trim() === '') return 'Name erforderlich';
      if (!/^[a-z][a-z0-9_]*$/.test(v)) return 'Nur lowercase, Zahlen und Underscore';
      if (metadata.hubs.some(h => h.name === v)) return `hub_${v} existiert bereits`;
      return true;
    },
  });

  // Step 2: External Table
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  [2/6] External Table'));
  console.log(chalk.gray('  Name der External Table in ADLS (Parquet)'));
  console.log('');

  const externalTable = await input({
    message: 'External Table Name:',
    default: `ext_${entityName}`,
    validate: (v) => {
      if (!v.startsWith('ext_')) return 'Muss mit ext_ beginnen';
      return true;
    },
  });

  // Step 3: Business Key(s)
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  [3/6] Business Key(s)'));
  console.log(chalk.gray('  Spalte(n) die die Entity eindeutig identifizieren'));
  console.log(chalk.gray('  (mehrere kommasepariert, z.B.: tenant_id, object_id)'));
  console.log('');

  const businessKeyInput = await input({
    message: 'Business Key Spalte(n):',
    default: 'object_id',
    validate: (v) => v.trim() !== '' || 'Mindestens ein Business Key erforderlich',
  });
  
  const businessKeyColumns = businessKeyInput.split(',').map(s => s.trim()).filter(s => s);

  // Step 4: Attribute columns
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  [4/6] Attribute'));
  console.log(chalk.gray('  Spalten die im Satellite gespeichert werden'));
  console.log(chalk.gray('  (kommasepariert, z.B.: name, description, status)'));
  console.log('');

  const attributesInput = await input({
    message: 'Attribute (kommasepariert):',
    default: 'name',
    validate: (v) => v.trim() !== '' || 'Mindestens ein Attribut erforderlich',
  });
  
  const attributeColumns = attributesInput.split(',').map(s => s.trim()).filter(s => s);

  // Step 5: Record Source
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  [5/6] Record Source'));
  console.log(chalk.gray('  Identifiziert die Datenquelle (fuer dss_record_source)'));
  console.log(chalk.gray('  z.B. system_name, source_db, api_endpoint'));
  console.log('');

  // Default: derive from external table (ext_company -> company_src)
  const defaultSource = externalTable.replace(/^ext_/, '') + '_src';
  
  const recordSource = await input({
    message: 'Record Source:',
    default: defaultSource,
  });

  // Step 6: Confirm components
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  [6/6] Komponenten'));
  console.log('');

  const createStaging = await confirm({
    message: `Staging View erstellen (stg_${entityName})?`,
    default: true,
  });

  const createHub = await confirm({
    message: `Hub erstellen (hub_${entityName})?`,
    default: true,
  });

  const createSatellite = await confirm({
    message: `Satellite erstellen (sat_${entityName})?`,
    default: true,
  });

  // Summary
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Zusammenfassung'));
  console.log('');
  console.log(`  Entity:        ${entityName}`);
  console.log(`  External:      ${externalTable}`);
  console.log(`  Business Keys: ${businessKeyColumns.join(', ')}`);
  console.log(`  Attribute:     ${attributeColumns.join(', ')}`);
  console.log(`  Source:        ${recordSource}`);
  console.log('');
  console.log('  Zu erstellen:');
  if (createStaging) console.log(chalk.green(`    [+] stg_${entityName}.sql`));
  if (createHub) console.log(chalk.green(`    [+] hub_${entityName}.sql`));
  if (createSatellite) console.log(chalk.green(`    [+] sat_${entityName}.sql`));
  console.log('');

  const proceed = await confirm({
    message: 'Entity erstellen?',
    default: true,
  });

  if (!proceed) {
    console.log(chalk.yellow('  [CANCEL] Abgebrochen'));
    return null;
  }

  return {
    type: 'entity',
    entityName,
    externalTable,
    businessKeyColumns,
    attributeColumns,
    createStaging,
    createHub,
    createSatellite,
    recordSource,
  };
}

// ============================================================================
// Mart Wizard
// ============================================================================

/**
 * Interactive wizard for creating a Mart view
 */
export async function runMartWizard(): Promise<MartWizardResult | null> {
  console.log('');
  console.log(ui.box('Mart View Wizard', 'info'));
  console.log('');
  
  // Scan project first
  console.log(chalk.gray('  Analysiere Projekt-Struktur...'));
  const metadata = await scanProject();
  console.log(chalk.green('  ✓ Projekt gescannt'));
  console.log('');
  console.log(chalk.gray(formatMetadataSummary(metadata)));
  console.log('');

  if (metadata.hubs.length === 0) {
    console.log(chalk.red('  ✗ Keine Hubs gefunden. Erstelle zuerst einen Hub.'));
    return null;
  }

  // Step 1: Select business context (schema)
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 1: Business Context (Schema)'));
  console.log(chalk.gray('  Namenskonvention: mart_<context>.v_<name>'));
  console.log('');

  const schema = await select({
    message: 'Fuer welchen Business Context?',
    choices: [
      { name: 'customer   - Kunden/Mandanten-bezogene Views', value: 'customer' },
      { name: 'project    - Projekt-bezogene Views', value: 'project' },
      { name: 'reporting  - Allgemeine Reports', value: 'reporting' },
      { name: 'reference  - Referenz/Lookup Views', value: 'reference' },
      { name: '(andere)   - Eigenen Namen eingeben', value: '_custom' },
    ],
  });

  let finalSchema = schema;
  if (schema === '_custom') {
    finalSchema = await input({
      message: 'Schema-Name (ohne mart_ Prefix):',
      validate: (v) => /^[a-z][a-z0-9_]*$/.test(v) || 'Nur lowercase, Zahlen und Underscore',
    });
  }

  // Step 2: Select primary hub
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 2: Primaerer Hub'));
  console.log(chalk.gray('  Die View wird auf diesem Hub basieren.'));
  console.log('');

  const hubChoices = metadata.hubs.map(h => ({
    name: `${h.fullName} ${h.businessKey ? chalk.gray(`(BK: ${h.businessKey})`) : ''}`,
    value: h.fullName,
  }));

  const primaryHub = await select({
    message: 'Welcher Hub ist die Basis?',
    choices: hubChoices,
  });

  // Step 3: Select satellites
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 3: Satellites'));
  console.log(chalk.gray('  Welche Attribute sollen einbezogen werden?'));
  console.log('');

  const hubSatellites = getSatellitesForHub(metadata, primaryHub);
  const otherSatellites = metadata.satellites.filter(s => !hubSatellites.includes(s));

  let selectedSatellites: string[] = [];

  if (hubSatellites.length > 0) {
    const satChoices = hubSatellites.map(s => ({
      name: `${s.fullName} ${s.attributes.length > 0 ? chalk.gray(`(${s.attributes.slice(0, 3).join(', ')}${s.attributes.length > 3 ? '...' : ''})`) : ''}`,
      value: s.fullName,
      checked: !s.isEffectivity, // Pre-select regular satellites
    }));

    selectedSatellites = await checkbox({
      message: `Satellites von ${primaryHub}:`,
      choices: satChoices,
    });
  }

  // Optionally add satellites from other hubs (via joins)
  if (otherSatellites.length > 0) {
    const addOther = await confirm({
      message: 'Auch Satellites von anderen Hubs einbeziehen (via Links)?',
      default: false,
    });

    if (addOther) {
      const otherChoices = otherSatellites.map(s => ({
        name: `${s.fullName} ${chalk.gray(`(${s.parentHub || 'unknown'})`)}`,
        value: s.fullName,
      }));

      const otherSelected = await checkbox({
        message: 'Weitere Satellites:',
        choices: otherChoices,
      });

      selectedSatellites.push(...otherSelected);
    }
  }

  // Step 4: Select links (optional)
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 4: Links (optional)'));
  console.log(chalk.gray('  Beziehungen zu anderen Entitaeten'));
  console.log('');

  const hubLinks = getLinksForHub(metadata, primaryHub);
  let selectedLinks: string[] = [];

  if (hubLinks.length > 0) {
    const linkChoices = hubLinks.map(l => ({
      name: `${l.fullName} ${chalk.gray(`-> ${l.connectedHubs.filter(h => h !== primaryHub).join(', ')}`)}`,
      value: l.fullName,
    }));

    selectedLinks = await checkbox({
      message: 'Welche Links einbeziehen?',
      choices: linkChoices,
    });
  } else {
    console.log(chalk.gray('  Keine Links fuer diesen Hub vorhanden.'));
  }

  // Step 5: View name
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 5: View Name'));
  console.log('');

  // Suggest a name based on hub
  const hubBaseName = primaryHub.replace('hub_', '');
  const suggestedName = `v_${hubBaseName}_current`;

  const viewName = await input({
    message: 'View Name:',
    default: suggestedName,
    validate: (v) => /^v_[a-z][a-z0-9_]*$/.test(v) || 'Format: v_<name> (lowercase)',
  });

  // Step 6: Options
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 6: Optionen'));
  console.log('');

  const includeCurrentFlag = await confirm({
    message: 'Nur aktuelle Records (dss_is_current = Y)?',
    default: true,
  });

  const excludeGhosts = await confirm({
    message: 'Ghost Records ausschliessen (object_id > 0)?',
    default: true,
  });

  // Step 7: Description
  console.log('');
  const description = await input({
    message: 'Kurze Beschreibung der View:',
    default: `${hubBaseName.charAt(0).toUpperCase() + hubBaseName.slice(1)} mit aktuellen Attributen`,
  });

  // Summary
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Zusammenfassung'));
  console.log('');
  console.log(`  Schema:      mart_${finalSchema}`);
  console.log(`  View:        ${viewName}`);
  console.log(`  Basis Hub:   ${primaryHub}`);
  console.log(`  Satellites:  ${selectedSatellites.length > 0 ? selectedSatellites.join(', ') : '(keine)'}`);
  console.log(`  Links:       ${selectedLinks.length > 0 ? selectedLinks.join(', ') : '(keine)'}`);
  console.log(`  Filter:      ${[includeCurrentFlag ? 'current only' : '', excludeGhosts ? 'no ghosts' : ''].filter(Boolean).join(', ') || '(keine)'}`);
  console.log('');

  const proceed = await confirm({
    message: 'View erstellen?',
    default: true,
  });

  if (!proceed) {
    console.log(chalk.yellow('  Abgebrochen.'));
    return null;
  }

  return {
    type: 'mart',
    viewName,
    schema: finalSchema,
    description,
    sourceHubs: [primaryHub],
    sourceSatellites: selectedSatellites,
    sourceLinks: selectedLinks,
    includeCurrentFlag,
    excludeGhosts,
  };
}

// ============================================================================
// Hub Wizard
// ============================================================================

/**
 * Interactive wizard for creating a Hub
 */
export async function runHubWizard(): Promise<HubWizardResult | null> {
  console.log('');
  console.log(ui.box('Hub Wizard', 'info'));
  console.log('');
  
  // Scan project
  console.log(chalk.gray('  Analysiere Projekt-Struktur...'));
  const metadata = await scanProject();
  console.log(chalk.green('  ✓ Projekt gescannt'));
  console.log('');
  
  // Show existing hubs
  if (metadata.hubs.length > 0) {
    console.log(chalk.gray('  Existierende Hubs:'));
    metadata.hubs.forEach(h => console.log(chalk.gray(`    - ${h.fullName}`)));
    console.log('');
  }

  // Step 1: Entity name
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 1: Entity Name'));
  console.log(chalk.gray('  Der Hub wird hub_<name> heissen.'));
  console.log('');

  const entityName = await input({
    message: 'Entity Name (z.B. "product", "employee"):',
    validate: (v) => {
      if (!/^[a-z][a-z0-9_]*$/.test(v)) return 'Nur lowercase, Zahlen und Underscore';
      if (metadata.hubs.some(h => h.name === v)) return `hub_${v} existiert bereits!`;
      return true;
    },
  });

  // Step 2: Source table (external table or staging)
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 2: Quelltabelle'));
  console.log('');

  const sourceTable = await input({
    message: 'External Table Name (z.B. "ext_product"):',
    default: `ext_${entityName}`,
  });

  // Step 3: Business Key
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 3: Business Key'));
  console.log(chalk.gray('  Welche Spalte identifiziert die Entity eindeutig?'));
  console.log('');

  const businessKeyColumn = await input({
    message: 'Business Key Spalte:',
    default: 'object_id',
  });

  // Step 4: Description
  console.log('');
  const description = await input({
    message: 'Beschreibung:',
    default: `Business Entity: ${entityName}`,
  });

  // Summary
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Zusammenfassung'));
  console.log('');
  console.log(`  Hub:          hub_${entityName}`);
  console.log(`  Quelle:       ${sourceTable}`);
  console.log(`  Business Key: ${businessKeyColumn}`);
  console.log(`  Hash Key:     hk_${entityName}`);
  console.log('');

  const proceed = await confirm({
    message: 'Hub erstellen?',
    default: true,
  });

  if (!proceed) {
    return null;
  }

  return {
    type: 'hub',
    entityName,
    businessKeyColumn,
    sourceTable,
    description,
  };
}

// ============================================================================
// Satellite Wizard
// ============================================================================

/**
 * Interactive wizard for creating a Satellite
 */
export async function runSatelliteWizard(): Promise<SatelliteWizardResult | null> {
  console.log('');
  console.log(ui.box('Satellite Wizard', 'info'));
  console.log('');
  
  // Scan project
  console.log(chalk.gray('  Analysiere Projekt-Struktur...'));
  const metadata = await scanProject();
  console.log(chalk.green('  ✓ Projekt gescannt'));
  console.log('');

  if (metadata.hubs.length === 0) {
    console.log(chalk.red('  ✗ Keine Hubs gefunden. Erstelle zuerst einen Hub.'));
    return null;
  }

  // Step 1: Parent Hub
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 1: Parent Hub'));
  console.log(chalk.gray('  Zu welchem Hub gehoert dieser Satellite?'));
  console.log('');

  const hubChoices = metadata.hubs.map(h => {
    const existingSats = getSatellitesForHub(metadata, h.fullName);
    return {
      name: `${h.fullName} ${chalk.gray(`(${existingSats.length} Satellites)`)}`,
      value: h.fullName,
    };
  });

  const parentHub = await select({
    message: 'Parent Hub:',
    choices: hubChoices,
  });

  // Step 2: Satellite type
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 2: Satellite Typ'));
  console.log('');

  const hubBaseName = parentHub.replace('hub_', '');
  const existingSats = getSatellitesForHub(metadata, parentHub);
  
  const satType = await select({
    message: 'Welcher Typ?',
    choices: [
      { name: `sat_${hubBaseName} - Haupt-Satellite (Basis-Attribute)`, value: 'main' },
      { name: `sat_${hubBaseName}_ext - Erweiterungs-Satellite`, value: 'ext' },
      { name: '(benutzerdefiniert)', value: 'custom' },
    ],
  });

  let entityName = hubBaseName;
  let isExtended = false;

  if (satType === 'ext') {
    isExtended = true;
    const extSuffix = await input({
      message: 'Suffix fuer Erweiterung (z.B. "client" -> sat_company_client_ext):',
      default: 'ext',
    });
    entityName = `${hubBaseName}_${extSuffix}`;
  } else if (satType === 'custom') {
    entityName = await input({
      message: 'Satellite Name (ohne sat_ Prefix):',
      validate: (v) => /^[a-z][a-z0-9_]*$/.test(v) || 'Nur lowercase, Zahlen und Underscore',
    });
  }

  // Check for existing
  if (existingSats.some(s => s.name === entityName)) {
    console.log(chalk.yellow(`  ⚠ sat_${entityName} existiert bereits!`));
    const overwrite = await confirm({ message: 'Trotzdem fortfahren?', default: false });
    if (!overwrite) return null;
  }

  // Step 3: Source Staging
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 3: Staging View (Quelle)'));
  console.log('');

  const sourceStaging = await input({
    message: 'Staging View:',
    default: `stg_${hubBaseName}`,
  });

  // Step 4: Attributes - Try to load from Staging
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 4: Attribute'));
  console.log(chalk.gray('  Welche Spalten sollen in den Satellite?'));
  console.log('');

  // Try to get attributes from staging
  const stagingEntityName = sourceStaging.replace(/^stg_/, '');
  const stagingInfo = await getStagingForEntity(stagingEntityName);
  
  let attributes: string[] = [];
  
  if (stagingInfo && stagingInfo.payloadColumns.length > 0) {
    console.log(chalk.green(`  ✓ ${stagingInfo.payloadColumns.length} Attribute aus ${sourceStaging} gefunden`));
    console.log('');
    
    // Show as checkbox selection (all selected by default)
    const selectedAttributes = await checkbox({
      message: 'Attribute auswählen (Space = an/aus, Enter = bestätigen):',
      choices: stagingInfo.payloadColumns.map(col => ({
        name: col,
        value: col,
        checked: true,  // All selected by default
      })),
      pageSize: 15,
    });
    
    attributes = selectedAttributes;
    
    if (attributes.length === 0) {
      console.log(chalk.yellow('  ⚠ Keine Attribute ausgewählt!'));
      const enterManually = await confirm({ message: 'Attribute manuell eingeben?', default: true });
      if (enterManually) {
        const attributesInput = await input({
          message: 'Attribute (kommasepariert):',
          validate: (v) => v.trim().length > 0 || 'Mindestens ein Attribut erforderlich',
        });
        attributes = attributesInput.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
      } else {
        return null;
      }
    }
  } else {
    console.log(chalk.yellow(`  ⚠ Keine Attribute in ${sourceStaging} gefunden (oder Staging existiert nicht)`));
    console.log(chalk.gray('  Bitte Attribute manuell eingeben (kommasepariert)'));
    console.log('');
    
    const attributesInput = await input({
      message: 'Attribute:',
      validate: (v) => v.trim().length > 0 || 'Mindestens ein Attribut erforderlich',
    });

    attributes = attributesInput.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
  }

  // Step 5: Description
  console.log('');
  const description = await input({
    message: 'Beschreibung:',
    default: `Attribute fuer ${hubBaseName}`,
  });

  // Summary
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Zusammenfassung'));
  console.log('');
  console.log(`  Satellite:    sat_${entityName}`);
  console.log(`  Parent Hub:   ${parentHub}`);
  console.log(`  Attribute:    ${attributes.join(', ')}`);
  console.log(`  Quelle:       ${sourceStaging}`);
  console.log(`  Hash Diff:    hd_${entityName}`);
  console.log('');

  const proceed = await confirm({
    message: 'Satellite erstellen?',
    default: true,
  });

  if (!proceed) {
    return null;
  }

  return {
    type: 'satellite',
    entityName,
    parentHub,
    attributes,
    isExtended,
    sourceStaging,
    description,
  };
}

// ============================================================================
// Link Wizard
// ============================================================================

/**
 * Interactive wizard for creating a Link
 */
export async function runLinkWizard(): Promise<LinkWizardResult | null> {
  console.log('');
  console.log(ui.box('Link Wizard', 'info'));
  console.log('');
  
  // Scan project
  console.log(chalk.gray('  Analysiere Projekt-Struktur...'));
  const metadata = await scanProject();
  console.log(chalk.green('  ✓ Projekt gescannt'));
  console.log('');

  if (metadata.hubs.length < 2) {
    console.log(chalk.red('  ✗ Mindestens 2 Hubs erforderlich fuer einen Link.'));
    return null;
  }

  // Step 1: First Hub
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 1: Erster Hub'));
  console.log('');

  const hubChoices = metadata.hubs.map(h => ({
    name: h.fullName,
    value: h.fullName,
  }));

  const hub1 = await select({
    message: 'Hub 1:',
    choices: hubChoices,
  });

  // Step 2: Second Hub
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 2: Zweiter Hub'));
  console.log('');

  const hub2Choices = hubChoices.filter(c => c.value !== hub1);
  
  // Add option for reference table
  hub2Choices.push({ name: '(Referenz-Tabelle / Seed)', value: '_ref' });

  const hub2Selection = await select({
    message: 'Hub 2 (oder Referenz):',
    choices: hub2Choices,
  });

  let hub2 = hub2Selection;
  if (hub2Selection === '_ref') {
    if (metadata.seeds.length > 0) {
      const seedChoices = metadata.seeds.map(s => ({ name: s.name, value: s.name }));
      hub2 = await select({
        message: 'Welche Referenz-Tabelle?',
        choices: seedChoices,
      });
    } else {
      hub2 = await input({
        message: 'Referenz-Tabelle Name:',
        default: 'ref_',
      });
    }
  }

  // Step 3: Link name
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Schritt 3: Link Name'));
  console.log('');

  const hub1Base = hub1.replace('hub_', '');
  const hub2Base = hub2.replace('hub_', '').replace('ref_', '');
  const suggestedName = `${hub1Base}_${hub2Base}`;

  const linkName = await input({
    message: 'Link Name (ohne link_ Prefix):',
    default: suggestedName,
  });

  // Step 4: Source
  console.log('');
  const sourceStaging = await input({
    message: 'Staging View (Quelle):',
    default: `stg_${hub1Base}`,
  });

  // Step 5: Description
  const description = await input({
    message: 'Beschreibung:',
    default: `Beziehung zwischen ${hub1Base} und ${hub2Base}`,
  });

  // Summary
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Zusammenfassung'));
  console.log('');
  console.log(`  Link:         link_${linkName}`);
  console.log(`  Verbindet:    ${hub1} <-> ${hub2}`);
  console.log(`  Quelle:       ${sourceStaging}`);
  console.log('');

  const proceed = await confirm({
    message: 'Link erstellen?',
    default: true,
  });

  if (!proceed) {
    return null;
  }

  return {
    type: 'link',
    name: linkName,
    hub1,
    hub2,
    sourceStaging,
    description,
  };
}

// ============================================================================
// Convert Wizard Result to LLM Prompt
// ============================================================================

/**
 * Convert wizard result to a structured prompt for Claude
 */
export function wizardResultToPrompt(result: WizardResult): string {
  switch (result.type) {
    case 'mart':
      return `Erstelle eine Mart View mit folgenden Parametern:

**View Details:**
- Name: ${result.viewName}
- Schema: mart_${result.schema}
- Beschreibung: ${result.description}

**Datenquellen:**
- Basis Hub: ${result.sourceHubs.join(', ')}
- Satellites: ${result.sourceSatellites.join(', ') || '(keine)'}
- Links: ${result.sourceLinks.join(', ') || '(keine)'}

**Filter:**
- Nur aktuelle Records: ${result.includeCurrentFlag ? 'Ja (dss_is_current = Y)' : 'Nein'}
- Ghost Records ausschliessen: ${result.excludeGhosts ? 'Ja (object_id > 0)' : 'Nein'}

Erstelle die View nach Data Vault 2.1 Best Practices:
- Flache, denormalisierte Struktur
- LEFT JOINs zu Satellites
- Klare Spalten-Aliase
- Config-Block am Anfang mit materialized='view'`;

    case 'hub':
      return `Erstelle einen Hub mit folgenden Parametern:

**Hub Details:**
- Name: hub_${result.entityName}
- Business Key: ${result.businessKeyColumn}
- Hash Key: hk_${result.entityName}
- Quell-Tabelle: ${result.sourceTable}
- Beschreibung: ${result.description}

Erstelle den Hub nach Data Vault 2.1 Best Practices:
- SHA2_256 Hash fuer hk_${result.entityName}
- dss_load_date, dss_record_source Metadata-Spalten
- Korrekte Config mit materialized='incremental', unique_key='hk_${result.entityName}'`;

    case 'satellite':
      return `Erstelle einen Satellite mit folgenden Parametern:

**Satellite Details:**
- Name: sat_${result.entityName}
- Parent Hub: ${result.parentHub}
- Hash Key: hk_${result.parentHub.replace('hub_', '')}
- Hash Diff: hd_${result.entityName}
- Attribute: ${result.attributes.join(', ')}
- Quelle: ${result.sourceStaging}
- Beschreibung: ${result.description}

Erstelle den Satellite nach Data Vault 2.1 Best Practices:
- SHA2_256 Hash fuer hd_${result.entityName} (aus allen Attributen)
- dss_load_date, dss_record_source, dss_is_current Spalten
- Config mit materialized='incremental'
- Change Detection via Hash Diff`;

    case 'link':
      return `Erstelle einen Link mit folgenden Parametern:

**Link Details:**
- Name: link_${result.name}
- Verbindet: ${result.hub1} <-> ${result.hub2}
- Hash Key: hk_link_${result.name}
- Quelle: ${result.sourceStaging}
- Beschreibung: ${result.description}

Erstelle den Link nach Data Vault 2.1 Best Practices:
- SHA2_256 Hash aus beiden Hub Keys
- dss_load_date, dss_record_source Metadata-Spalten
- Config mit materialized='incremental', unique_key='hk_link_${result.name}'`;

    case 'entity':
      return `Entity ${result.entityName} wird direkt erstellt (kein Claude-Prompt nötig)`;
    
    case 'edit':
      // Edit wird jetzt strukturiert über executeEditWithAI verarbeitet
      return `Bearbeite das Model ${result.modelName}.

**Aktion:** ${result.editAction}
**Datei:** ${result.filePath}
${result.attributeNames && result.attributeNames.length > 0 ? `**Attribute:** ${result.attributeNames.join(', ')}` : ''}
${result.attributeName ? `**Attribut:** ${result.attributeName}` : ''}
${result.customDescription ? `**Beschreibung:** ${result.customDescription}` : ''}

**Aktueller Inhalt:**
\`\`\`sql
${result.currentContent}
\`\`\`

Bitte verwende das edit_model Tool um die Datei zu aktualisieren.
Beachte:
- Azure SQL Server Syntax
- Data Vault 2.1 Namenskonventionen
- Hash-Berechnungen korrekt anpassen wenn Spalten geändert werden`;

    case 'delete':
      return `Model ${result.modelName} wird direkt gelöscht (kein Claude-Prompt nötig)`;
  }
}

// ============================================================================
// Edit Object Wizard
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Get edit action choices based on model type
 */
function getEditActionsForType(modelType: string): { name: string; value: EditAction }[] {
  const commonActions: { name: string; value: EditAction }[] = [
    { name: '📝 Benutzerdefinierte Änderung...', value: 'custom' },
  ];
  
  switch (modelType) {
    case 'staging':
      return [
        { name: '➕ Attribut hinzufügen (Spalte aus External Table)', value: 'add_attribute' },
        { name: '➖ Attribut entfernen', value: 'remove_attribute' },
        { name: '🔗 Foreign Key hinzufügen (hk_* zu anderem Hub)', value: 'add_fk' },
        { name: '🔄 Source ändern (External Table)', value: 'change_source' },
        ...commonActions,
      ];
    case 'satellite':
      return [
        { name: '➕ Attribut hinzufügen', value: 'add_attribute' },
        { name: '➖ Attribut entfernen', value: 'remove_attribute' },
        { name: '🔐 Attribut zu Hash Diff hinzufügen', value: 'add_to_hashdiff' },
        { name: '🔓 Attribut aus Hash Diff entfernen', value: 'remove_from_hashdiff' },
        { name: '🔄 Source Staging ändern', value: 'change_source' },
        ...commonActions,
      ];
    case 'hub':
      return [
        { name: '🔄 Source Staging ändern', value: 'change_source' },
        ...commonActions,
      ];
    case 'link':
      return [
        { name: '➕ Degenerate Attribut hinzufügen', value: 'add_attribute' },
        { name: '🔄 Source Staging ändern', value: 'change_source' },
        ...commonActions,
      ];
    case 'mart':
      return [
        { name: '➕ Spalte/Berechnung hinzufügen', value: 'add_attribute' },
        { name: '➖ Spalte entfernen', value: 'remove_attribute' },
        ...commonActions,
      ];
    default:
      return commonActions;
  }
}

/**
 * Extract current attributes from model content
 */
function extractCurrentAttributes(content: string, modelType: string): string[] {
  const attributes: string[] = [];
  
  if (modelType === 'satellite' || modelType === 'staging') {
    // Look for hashdiff_columns
    const hashdiffMatch = content.match(/\{%-?\s*set\s+hashdiff_columns\s*=\s*\[([\s\S]*?)\]\s*-?%\}/i);
    if (hashdiffMatch) {
      const columnsStr = hashdiffMatch[1];
      const columnMatches = columnsStr.matchAll(/'([^']+)'/g);
      for (const match of columnMatches) {
        attributes.push(match[1]);
      }
    }
    
    // Look for -- Payload section
    const payloadMatch = content.match(/--\s*(?:PAYLOAD|Payload)[:\s]*([\s\S]*?)(?:--\s*=|FROM|WHERE)/i);
    if (payloadMatch && attributes.length === 0) {
      const payloadSection = payloadMatch[1];
      const colMatches = payloadSection.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*[,\n]/gim);
      for (const match of colMatches) {
        const col = match[1].toLowerCase();
        if (!col.startsWith('hk_') && !col.startsWith('hd_') && !col.startsWith('dss_') && !col.startsWith('src')) {
          if (!attributes.includes(col)) {
            attributes.push(col);
          }
        }
      }
    }
  }
  
  return attributes;
}

/**
 * Extract all column names used in a SQL file
 */
function extractAllColumnsFromSQL(sql: string): string[] {
  const columns: string[] = [];
  
  // Match column names in SELECT (after SELECT, before FROM)
  const selectMatch = sql.match(/SELECT\s+([\s\S]*?)FROM/i);
  if (selectMatch) {
    const selectPart = selectMatch[1];
    
    // Match patterns like:
    // column_name,
    // column_name AS alias,
    // src.column_name,
    const colMatches = selectPart.matchAll(/(?:^|\n)\s*(?:\w+\.)?([a-z_][a-z0-9_]*)\s*(?:,|AS|\n|$)/gim);
    for (const match of colMatches) {
      const col = match[1].toLowerCase();
      if (!columns.includes(col) && !col.startsWith('convert') && col !== 'as') {
        columns.push(col);
      }
    }
    
    // Also extract from CONCAT/HASHBYTES arguments
    const hashMatches = selectPart.matchAll(/CAST\(([a-z_][a-z0-9_]*)\s+AS/gi);
    for (const match of hashMatches) {
      const col = match[1].toLowerCase();
      if (!columns.includes(col)) {
        columns.push(col);
      }
    }
  }
  
  return columns;
}

/**
 * Wizard for editing an existing object
 */
export async function runEditWizard(): Promise<EditWizardResult | null> {
  console.log('');
  console.log(ui.box('Objekt bearbeiten', 'info'));
  console.log('');
  
  // Scan all models
  const metadata = await scanProject();
  const stagingModels = await scanStagingModels();
  
  // Build choices
  const modelChoices: { name: string; value: { name: string; type: string; path: string } }[] = [];
  
  // Add staging
  for (const stg of stagingModels) {
    modelChoices.push({
      name: `[STG] ${stg.fullName}`,
      value: { name: stg.fullName, type: 'staging', path: stg.filePath },
    });
  }
  
  // Add hubs
  for (const hub of metadata.hubs) {
    modelChoices.push({
      name: `[HUB] ${hub.fullName}`,
      value: { name: hub.fullName, type: 'hub', path: path.join(PROJECT_ROOT, hub.filePath) },
    });
  }
  
  // Add satellites
  for (const sat of metadata.satellites) {
    modelChoices.push({
      name: `[SAT] ${sat.fullName}`,
      value: { name: sat.fullName, type: 'satellite', path: path.join(PROJECT_ROOT, sat.filePath) },
    });
  }
  
  // Add links
  for (const link of metadata.links) {
    modelChoices.push({
      name: `[LNK] ${link.fullName}`,
      value: { name: link.fullName, type: 'link', path: path.join(PROJECT_ROOT, link.filePath) },
    });
  }
  
  // Add marts
  for (const mart of metadata.marts) {
    modelChoices.push({
      name: `[MRT] ${mart.name}`,
      value: { name: mart.name, type: 'mart', path: path.join(PROJECT_ROOT, mart.filePath) },
    });
  }
  
  if (modelChoices.length === 0) {
    console.log(chalk.yellow('Keine Models gefunden.'));
    return null;
  }
  
  modelChoices.push({ name: chalk.gray('← Abbrechen'), value: { name: '', type: '', path: '' } });
  
  // Select model
  const selectedModel = await select({
    message: 'Welches Model bearbeiten?',
    choices: modelChoices,
    pageSize: 15,
  });
  
  if (!selectedModel.name) return null;
  
  // Read current content
  let currentContent = '';
  try {
    currentContent = await fs.readFile(selectedModel.path, 'utf-8');
  } catch {
    console.log(chalk.red(`Fehler: Datei nicht lesbar: ${selectedModel.path}`));
    return null;
  }
  
  // Show current attributes
  const currentAttributes = extractCurrentAttributes(currentContent, selectedModel.type);
  if (currentAttributes.length > 0) {
    console.log('');
    console.log(chalk.cyan('Aktuelle Attribute:'));
    console.log(chalk.gray('  ' + currentAttributes.join(', ')));
  }
  
  // Show edit action menu based on model type
  console.log('');
  const editActions = getEditActionsForType(selectedModel.type);
  
  const selectedAction = await select({
    message: 'Was möchtest du tun?',
    choices: [
      ...editActions,
      { name: chalk.gray('← Abbrechen'), value: 'cancel' as EditAction },
    ],
  });
  
  if (selectedAction === 'cancel' as unknown) return null;
  
  // Collect action-specific data
  const result: EditWizardResult = {
    type: 'edit',
    modelName: selectedModel.name,
    modelType: selectedModel.type as 'staging' | 'hub' | 'satellite' | 'link' | 'mart',
    currentContent,
    filePath: selectedModel.path,
    editAction: selectedAction,
  };
  
  // Action-specific prompts
  switch (selectedAction) {
    case 'add_attribute': {
      if (selectedModel.type === 'satellite') {
        // Use new function to get available attributes from External Table
        const { available, source } = await getAvailableAttributesForSatellite(
          selectedModel.name,
          currentAttributes
        );
        
        if (available.length > 0) {
          console.log('');
          console.log(chalk.green(`✓ ${available.length} verfügbare Attribute aus ${source}`));
          console.log(chalk.gray('  (Leertaste = auswählen, Enter = bestätigen)'));
          
          const selectedAttrs = await checkbox({
            message: 'Welche Attribute hinzufügen?',
            choices: available.map(a => ({ name: a, value: a })),
            pageSize: 15,
          });
          
          if (selectedAttrs.length === 0) {
            // User selected nothing, ask for manual input
            const manualAttr = await input({
              message: 'Attribut-Name (oder leer für Abbruch):',
              validate: (v) => v === '' || /^[a-z_][a-z0-9_]*$/i.test(v) || 'Ungültiger Spaltenname',
            });
            if (manualAttr === '') return null;
            result.attributeNames = [manualAttr];
          } else {
            result.attributeNames = selectedAttrs;
          }
        } else {
          console.log(chalk.yellow('Keine weiteren Attribute in der External Table gefunden.'));
          const manualAttr = await input({
            message: 'Attribut-Name:',
            validate: (v) => /^[a-z_][a-z0-9_]*$/i.test(v) || 'Ungültiger Spaltenname',
          });
          result.attributeNames = [manualAttr];
        }
      } else if (selectedModel.type === 'staging') {
        // For staging: get columns from external table that aren't in staging yet
        const entityName = selectedModel.name.replace(/^stg_/, '');
        const extTableName = `ext_${entityName}`;
        const extColumns = await getExternalTableColumns(extTableName);
        
        // Filter out already used and metadata
        const usedInStaging = extractAllColumnsFromSQL(currentContent);
        const available = extColumns.filter(c => 
          !c.startsWith('dss_') && 
          !usedInStaging.map(u => u.toLowerCase()).includes(c.toLowerCase())
        );
        
        if (available.length > 0) {
          console.log('');
          console.log(chalk.green(`✓ ${available.length} verfügbare Spalten aus ${extTableName}`));
          console.log(chalk.gray('  (Leertaste = auswählen, Enter = bestätigen)'));
          
          const selectedAttrs = await checkbox({
            message: 'Welche Spalten hinzufügen?',
            choices: available.map(a => ({ name: a, value: a })),
            pageSize: 15,
          });
          
          if (selectedAttrs.length === 0) {
            const manualAttr = await input({
              message: 'Spalten-Name (oder leer für Abbruch):',
              validate: (v) => v === '' || /^[a-z_][a-z0-9_]*$/i.test(v) || 'Ungültiger Spaltenname',
            });
            if (manualAttr === '') return null;
            result.attributeNames = [manualAttr];
          } else {
            result.attributeNames = selectedAttrs;
          }
        } else {
          const manualAttr = await input({
            message: 'Spalten-Name:',
            validate: (v) => /^[a-z_][a-z0-9_]*$/i.test(v) || 'Ungültiger Spaltenname',
          });
          result.attributeNames = [manualAttr];
        }
      } else {
        const manualAttr = await input({
          message: 'Attribut-Name:',
          validate: (v) => /^[a-z_][a-z0-9_]*$/i.test(v) || 'Ungültiger Spaltenname',
        });
        result.attributeNames = [manualAttr];
      }
      
      // Ask about hash diff for satellites
      if (selectedModel.type === 'satellite') {
        result.includeInHashDiff = await confirm({
          message: 'Alle in Hash Diff einbeziehen (Change Detection)?',
          default: true,
        });
      }
      break;
    }
    
    case 'remove_attribute': {
      if (currentAttributes.length === 0) {
        console.log(chalk.yellow('Keine Attribute gefunden zum Entfernen.'));
        return null;
      }
      
      const attrToRemove = await select({
        message: 'Welches Attribut entfernen?',
        choices: currentAttributes.map(a => ({ name: a, value: a })),
      });
      result.attributeName = attrToRemove;
      break;
    }
    
    case 'add_to_hashdiff':
    case 'remove_from_hashdiff': {
      if (currentAttributes.length === 0) {
        console.log(chalk.yellow('Keine Attribute gefunden.'));
        return null;
      }
      
      const attrForHashdiff = await select({
        message: selectedAction === 'add_to_hashdiff' 
          ? 'Welches Attribut zu Hash Diff hinzufügen?' 
          : 'Welches Attribut aus Hash Diff entfernen?',
        choices: currentAttributes.map(a => ({ name: a, value: a })),
      });
      result.attributeName = attrForHashdiff;
      break;
    }
    
    case 'add_fk': {
      // Get available hubs for FK
      if (metadata.hubs.length === 0) {
        console.log(chalk.yellow('Keine Hubs gefunden für FK.'));
        return null;
      }
      
      result.fkColumn = await input({
        message: 'FK Spalte in External Table (z.B. country_id):',
        validate: (v) => /^[a-z_][a-z0-9_]*$/i.test(v) || 'Ungültiger Spaltenname',
      });
      
      const targetHub = await select({
        message: 'Ziel-Hub:',
        choices: metadata.hubs.map(h => ({ name: h.fullName, value: h.fullName })),
      });
      result.fkTargetHub = targetHub;
      break;
    }
    
    case 'change_source': {
      if (selectedModel.type === 'staging') {
        result.sourceModel = await input({
          message: 'Neue External Table (z.B. ext_product):',
          validate: (v) => v.trim() !== '' || 'Name erforderlich',
        });
      } else {
        // For satellite/hub/link - choose from available staging models
        if (stagingModels.length === 0) {
          console.log(chalk.yellow('Keine Staging Models gefunden.'));
          return null;
        }
        
        const newSource = await select({
          message: 'Neue Source (Staging View):',
          choices: stagingModels.map(s => ({ name: s.fullName, value: s.fullName })),
        });
        result.sourceModel = newSource;
      }
      break;
    }
    
    case 'custom': {
      result.customDescription = await input({
        message: 'Beschreibe die gewünschte Änderung:',
        validate: (v) => v.trim() !== '' || 'Beschreibung erforderlich',
      });
      break;
    }
  }
  
  // Summary
  console.log('');
  console.log(ui.divider());
  console.log(chalk.cyan.bold('  Zusammenfassung'));
  console.log('');
  console.log(chalk.white(`  Model: ${result.modelName}`));
  console.log(chalk.white(`  Aktion: ${selectedAction}`));
  if (result.attributeNames && result.attributeNames.length > 0) {
    console.log(chalk.white(`  Attribute: ${result.attributeNames.join(', ')}`));
  }
  if (result.attributeName) {
    console.log(chalk.white(`  Attribut: ${result.attributeName}`));
  }
  if (result.includeInHashDiff !== undefined) {
    console.log(chalk.white(`  Hash Diff: ${result.includeInHashDiff ? 'Ja' : 'Nein'}`));
  }
  if (result.sourceModel) {
    console.log(chalk.white(`  Neue Source: ${result.sourceModel}`));
  }
  if (result.fkColumn && result.fkTargetHub) {
    console.log(chalk.white(`  FK: ${result.fkColumn} → ${result.fkTargetHub}`));
  }
  console.log('');
  
  const proceed = await confirm({
    message: 'Änderung durchführen?',
    default: true,
  });
  
  if (!proceed) return null;
  
  return result;
}

// ============================================================================
// Delete Object Wizard
// ============================================================================

/**
 * Wizard for deleting an existing object
 */
export async function runDeleteWizard(): Promise<DeleteWizardResult | null> {
  console.log('');
  console.log(ui.box('⚠️  Objekt löschen', 'warning'));
  console.log('');
  console.log(chalk.yellow('ACHTUNG: Gelöschte Dateien können nicht wiederhergestellt werden!'));
  console.log('');
  
  // Scan all models
  const metadata = await scanProject();
  const stagingModels = await scanStagingModels();
  
  // Build choices
  const modelChoices: { name: string; value: { name: string; type: string; path: string } }[] = [];
  
  // Add staging
  for (const stg of stagingModels) {
    modelChoices.push({
      name: `[STG] ${stg.fullName}`,
      value: { name: stg.fullName, type: 'staging', path: stg.filePath },
    });
  }
  
  // Add hubs
  for (const hub of metadata.hubs) {
    modelChoices.push({
      name: `[HUB] ${hub.fullName}`,
      value: { name: hub.fullName, type: 'hub', path: path.join(PROJECT_ROOT, hub.filePath) },
    });
  }
  
  // Add satellites
  for (const sat of metadata.satellites) {
    modelChoices.push({
      name: `[SAT] ${sat.fullName}`,
      value: { name: sat.fullName, type: 'satellite', path: path.join(PROJECT_ROOT, sat.filePath) },
    });
  }
  
  // Add links
  for (const link of metadata.links) {
    modelChoices.push({
      name: `[LNK] ${link.fullName}`,
      value: { name: link.fullName, type: 'link', path: path.join(PROJECT_ROOT, link.filePath) },
    });
  }
  
  // Add marts
  for (const mart of metadata.marts) {
    modelChoices.push({
      name: `[MRT] ${mart.name}`,
      value: { name: mart.name, type: 'mart', path: path.join(PROJECT_ROOT, mart.filePath) },
    });
  }
  
  // Add seeds
  for (const seed of metadata.seeds) {
    modelChoices.push({
      name: `[REF] ${seed.name}`,
      value: { name: seed.name, type: 'seed', path: path.join(PROJECT_ROOT, seed.filePath) },
    });
  }
  
  if (modelChoices.length === 0) {
    console.log(chalk.yellow('Keine Models gefunden.'));
    return null;
  }
  
  modelChoices.push({ name: chalk.gray('← Abbrechen'), value: { name: '', type: '', path: '' } });
  
  // Select model
  const selectedModel = await select({
    message: 'Welches Model löschen?',
    choices: modelChoices,
    pageSize: 15,
  });
  
  if (!selectedModel.name) return null;
  
  // Confirm deletion
  console.log('');
  console.log(chalk.red(`Du bist dabei, ${selectedModel.name} zu löschen!`));
  console.log(chalk.gray(`Pfad: ${selectedModel.path}`));
  console.log('');
  
  const confirmed = await confirm({
    message: `${selectedModel.name} wirklich löschen?`,
    default: false,
  });
  
  if (!confirmed) {
    console.log(chalk.gray('Löschung abgebrochen.'));
    return null;
  }
  
  return {
    type: 'delete',
    modelName: selectedModel.name,
    modelType: selectedModel.type as 'staging' | 'hub' | 'satellite' | 'link' | 'mart' | 'seed',
    filePath: selectedModel.path,
    confirmed: true,
  };
}

// ============================================================================
// Enhanced Satellite Wizard (with attribute selection from Staging)
// ============================================================================

/**
 * Get attributes from staging model for satellite creation
 */
export async function getAttributesFromStaging(entityName: string): Promise<string[]> {
  const staging = await getStagingForEntity(entityName);
  if (staging) {
    return staging.payloadColumns;
  }
  return [];
}
