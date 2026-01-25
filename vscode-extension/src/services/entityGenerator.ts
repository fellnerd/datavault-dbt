/**
 * Entity Generator Service
 * 
 * Generates Hub, Satellite, and Link SQL files for Data Vault 2.0
 * Using automate_dv macros for standardized patterns
 * 
 * Key responsibility: When Links are configured, this service also
 * regenerates the staging view to include all necessary hash keys:
 * - hk_<entity> (Entity Hash Key)
 * - hk_<target> (FK Hash Keys for each link target)
 * - hk_link_<source>_<target> (Link Hash Keys)
 * - hd_<entity> (Hash Diff for regular satellite)
 * - hd_<entity>_<target>_dc (Hash Diff for DC satellites)
 * 
 * @see https://automate-dv.readthedocs.io/en/latest/tutorial/
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { EntityDesignConfig, DesignerColumnDefinition, GeneratedFile, GenerationResult, StagingConfig, ForeignKeyMapping, SourceType } from '../types';
import { generateStagingSql } from './stagingGenerator';

/**
 * Generate Data Vault objects from entity design configuration
 */
export async function generateDataVaultObjects(
  config: EntityDesignConfig,
  projectPath: string,
  targets: ('hub' | 'satellite' | 'links' | 'dc_satellite' | 'ma_satellite')[]
): Promise<GenerationResult> {
  const generatedFiles: GeneratedFile[] = [];
  const errors: string[] = [];

  try {
    // Map UI column types to internal types (handle both old and new naming)
    const businessKeys = config.columns.filter(c => 
      c.columnType === 'business_key' || c.columnType === 'hub'
    );
    const attributes = config.columns.filter(c => 
      (c.columnType === 'attribute' || c.columnType === 'satellite') &&
      // Exclude hash columns from payload - they are handled separately
      !c.name.toLowerCase().startsWith('hk_') &&
      !c.name.toLowerCase().startsWith('hd_')
    );
    const foreignKeys = config.columns.filter(c => 
      c.columnType === 'foreign_key' || c.columnType === 'link'
    );
    const dependentChildKeys = config.columns.filter(c => 
      c.columnType === 'dependent_child'
    );
    const multiActiveKeys = config.columns.filter(c => 
      c.columnType === 'multi_active'
    );

    // Check if this is a Pure Dependent Child entity (no Hub, only Link + DC Sat)
    const isPureDependentChild = dependentChildKeys.length > 0 && 
                                  businessKeys.length === 0 && 
                                  foreignKeys.length > 0;

    // Validate basic requirements
    // Exception: Pure Dependent Child entities don't need a BK (they have no Hub)
    if (businessKeys.length === 0 && targets.includes('hub') && !isPureDependentChild) {
      errors.push('At least one Business Key is required for Hub generation');
      return { success: false, files: [], errors };
    }

    // For Pure DC: Remove 'hub' and 'satellite' from targets if present
    let effectiveTargets = [...targets];
    if (isPureDependentChild) {
      effectiveTargets = effectiveTargets.filter(t => t !== 'hub' && t !== 'satellite');
      // Ensure we have link and dc_satellite
      if (!effectiveTargets.includes('links')) {
        effectiveTargets.push('links');
      }
      if (!effectiveTargets.includes('dc_satellite')) {
        effectiveTargets.push('dc_satellite');
      }
    }

    // ============================================
    // REGENERATE STAGING if Links/DC are configured
    // ============================================
    // When we have Links, the staging view needs additional hashes:
    // - hk_<target> for each FK (so Link can reference it)
    // - hk_link_<source>_<target> for each Link
    // - hd_<entity>_<target>_dc for DC Satellites
    if (foreignKeys.length > 0) {
      const stagingFile = await regenerateStaging(
        config,
        businessKeys,
        attributes,
        foreignKeys,
        dependentChildKeys,
        multiActiveKeys,
        projectPath,
        config.sourceType  // Pass sourceType from config
      );
      generatedFiles.push(stagingFile);
    }

    // Generate Hub using automate_dv.hub macro
    if (effectiveTargets.includes('hub') && businessKeys.length > 0) {
      const hubFile = await generateHub(config, businessKeys, projectPath);
      generatedFiles.push(hubFile);
    }

    // Generate Satellite using automate_dv.sat macro
    if (effectiveTargets.includes('satellite') && attributes.length > 0) {
      const satFile = await generateSatellite(config, attributes, projectPath);
      generatedFiles.push(satFile);
    }

    // Generate Links using automate_dv.link macro
    if (effectiveTargets.includes('links') && foreignKeys.length > 0) {
      for (const fk of foreignKeys) {
        if (fk.foreignKeyTarget) {
          // Find DCKs associated with this link
          const targetEntity = fk.foreignKeyTarget.replace('hub_', '').replace(/^.*\./, '');
          const linkDCKs = dependentChildKeys.filter(dck => 
            dck.dependentChildForLink === fk.foreignKeyTarget
          );
          const linkFile = await generateLink(config, fk, businessKeys, linkDCKs, projectPath);
          generatedFiles.push(linkFile);
        }
      }
    }

    // Generate Dependent Child Satellites using automate_dv.sat macro with DCK in payload
    if (effectiveTargets.includes('dc_satellite') && dependentChildKeys.length > 0) {
      // Group DCKs by their target link
      const dcksByLink = new Map<string, DesignerColumnDefinition[]>();
      for (const dck of dependentChildKeys) {
        if (dck.dependentChildForLink) {
          const existing = dcksByLink.get(dck.dependentChildForLink) || [];
          existing.push(dck);
          dcksByLink.set(dck.dependentChildForLink, existing);
        }
      }

      // Generate DC Sat for each link with DCKs
      for (const [targetHub, dcks] of dcksByLink) {
        // Find the link FK column for this hub
        const linkedFK = foreignKeys.find(fk => fk.foreignKeyTarget === targetHub);
        if (linkedFK) {
          const dcSatFile = await generateDependentChildSatellite(
            config, 
            linkedFK, 
            dcks, 
            attributes, 
            projectPath
          );
          generatedFiles.push(dcSatFile);
        }
      }
    }

    // Generate Multi-Active Satellites using automate_dv.ma_sat macro
    if (effectiveTargets.includes('ma_satellite') && multiActiveKeys.length > 0) {
      const maSatFile = await generateMultiActiveSatellite(
        config, 
        multiActiveKeys, 
        attributes, 
        projectPath
      );
      generatedFiles.push(maSatFile);
    }

    return {
      success: errors.length === 0,
      files: generatedFiles,
      errors
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Generation failed: ${errorMessage}`);
    return { success: false, files: generatedFiles, errors };
  }
}

/**
 * Regenerate Staging SQL with all required hash keys for Links/DC/MA
 * 
 * When Links are configured, the staging view needs:
 * - hk_<entity> (Entity's own hash key from BK)
 * - hk_<target> (FK hash key for each link target)
 * - hk_link_<source>_<target> (Link hash key for each link)
 * - hd_<entity> (Hash diff for regular satellite)
 * - hd_<entity>_<target>_dc (Hash diff for DC satellites, if DCK configured)
 */
async function regenerateStaging(
  config: EntityDesignConfig,
  businessKeys: DesignerColumnDefinition[],
  attributes: DesignerColumnDefinition[],
  foreignKeys: DesignerColumnDefinition[],
  dependentChildKeys: DesignerColumnDefinition[],
  multiActiveKeys: DesignerColumnDefinition[],
  projectPath: string,
  sourceType?: SourceType
): Promise<GeneratedFile> {
  const { concept, entityName, sourceTable } = config;
  
  // Build FK mappings from Designer columns
  const fkMappings: ForeignKeyMapping[] = foreignKeys
    .filter(fk => fk.foreignKeyTarget)
    .map(fk => {
      const targetHub = fk.foreignKeyTarget!;
      // Extract target entity from hub name: "concept.hub_entity" or "hub_entity" → "entity"
      const targetEntity = targetHub.replace('hub_', '').replace(/^.*\./, '');
      return {
        sourceColumn: fk.name.toLowerCase(),
        targetEntity,
        targetHub,
        autoDetected: false  // These are manually configured in Entity Designer
      };
    });
  
  // Build DCK mappings grouped by target hub
  const dckByHub: Record<string, string[]> = {};
  for (const dck of dependentChildKeys) {
    if (dck.dependentChildForLink) {
      const hubKey = dck.dependentChildForLink;
      if (!dckByHub[hubKey]) {
        dckByHub[hubKey] = [];
      }
      dckByHub[hubKey].push(dck.name.toLowerCase());
    }
  }
  
  // Build payload columns (all attributes + DCKs + MA keys)
  // Exclude metadata and hash columns
  const payloadColumns = config.columns
    .filter(c => 
      (c.columnType === 'attribute' || c.columnType === 'satellite' || 
       c.columnType === 'dependent_child' || c.columnType === 'multi_active' ||
       c.columnType === 'foreign_key' || c.columnType === 'link') &&
      !c.name.toLowerCase().startsWith('hk_') &&
      !c.name.toLowerCase().startsWith('hd_') &&
      !c.name.toLowerCase().startsWith('dss_')
    )
    .map(c => c.name.toLowerCase());
  
  // Hash diff columns = attributes that have includeInHashDiff = true
  const hashDiffColumns = attributes
    .filter(a => a.includeInHashDiff)
    .map(a => a.name.toLowerCase());
  
  // If no explicit hashDiff selection, use all attributes
  const effectiveHashDiffColumns = hashDiffColumns.length > 0 
    ? hashDiffColumns 
    : attributes.map(a => a.name.toLowerCase());
  
  // Determine the actual source table name based on sourceType
  // For seeds: use the seed name (e.g., "test_jira_comments")
  // For external tables: use the external table name (e.g., "ext_jira_comments_seed")
  let actualSourceTable = sourceTable || `ext_${concept}_${entityName}`;
  if (sourceType === 'seed') {
    // For seeds, derive name from entityName: "comments_seed" -> "test_jira_comments" 
    // Or check if sourceTable already looks like a seed name (doesn't start with ext_)
    if (sourceTable && !sourceTable.startsWith('ext_')) {
      actualSourceTable = sourceTable;  // Already a seed name
    } else {
      // Convert from ext_ convention to test_ convention
      // ext_jira_comments_seed -> test_jira_comments
      actualSourceTable = `test_${concept}_${entityName.replace(/_seed$/, '')}`;
    }
  }
  
  // Build column mappings for aliases (sourceName -> name)
  // Only include columns where source differs from target
  const columnMappings: Record<string, string> = {};
  for (const col of config.columns) {
    const sourceName = col.sourceName || col.name;
    const targetName = col.name.toLowerCase();
    if (sourceName.toLowerCase() !== targetName) {
      columnMappings[sourceName] = targetName;
    }
  }
  
  // Build staging config
  const stagingConfig: StagingConfig = {
    concept,
    entityName,
    externalTable: actualSourceTable,
    sourceType: sourceType || 'external_table',  // Default to external_table for backward compatibility
    businessKeyColumns: businessKeys.map(bk => (bk.sourceName || bk.name).toUpperCase()),  // Use SOURCE name for SQL
    businessKeySeparator: '^^',
    payloadColumns,
    columnMappings,  // Add the alias mappings
    hashDiffColumns: effectiveHashDiffColumns,
    hashDiffSeparator: '^^',
    foreignKeys: fkMappings,
    recordSourceDefault: concept,
    includeRunId: config.columns.some(c => c.name.toLowerCase() === 'dss_run_id'),
    dependentChildKeys: Object.keys(dckByHub).length > 0 ? dckByHub : undefined,
    multiActiveKeys: multiActiveKeys.length > 0 ? multiActiveKeys.map(m => m.name.toLowerCase()) : undefined
  };
  
  // Generate SQL using the staging generator
  const sql = generateStagingSql(stagingConfig);
  
  // Write to staging folder
  const filePath = path.join(
    projectPath,
    'models',
    'staging',
    `${concept}_${entityName}.sql`
  );
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  
  // Write file (overwrites existing)
  await fs.writeFile(filePath, sql, 'utf-8');
  
  return { path: filePath, content: sql, type: 'staging' };
}

/**
 * Generate Hub SQL file using automate_dv.hub macro
 * @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_hubs/
 */
async function generateHub(
  config: EntityDesignConfig,
  businessKeys: DesignerColumnDefinition[],
  projectPath: string
): Promise<GeneratedFile> {
  const { concept, entityName } = config;
  const hubName = `hub_${entityName}`;
  const hashKeyName = `hk_${entityName.toLowerCase()}`;
  const stagingRef = `${concept}_${entityName}`;
  
  // Build natural key list - can be single or composite (lowercase to match staging)
  const naturalKeys = businessKeys.map(bk => `"${bk.name.toLowerCase()}"`);
  const nkConfig = naturalKeys.length === 1 
    ? naturalKeys[0]
    : `\n    - ${naturalKeys.join('\n    - ')}`;

  const sql = `{#
    Hub: ${hubName}
    Source: ${stagingRef}
    Business Keys: ${businessKeys.map(bk => bk.name).join(', ')}
    
    Generated by Entity Designer using automate_dv.hub macro
    @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_hubs/
#}

{{ config(
    materialized='incremental',
    as_columnstore=false
) }}

{%- set yaml_metadata -%}
source_model: "${stagingRef}"
src_pk: "${hashKeyName}"
src_nk: ${nkConfig}
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.hub(
    src_pk=metadata_dict["src_pk"],
    src_nk=metadata_dict["src_nk"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
`;

  const filePath = path.join(
    projectPath,
    'models',
    'raw_vault',
    concept,
    'hubs',
    `${hubName}.sql`
  );

  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  
  // Write file
  await fs.writeFile(filePath, sql, 'utf-8');

  return { path: filePath, content: sql, type: 'hub' };
}

/**
 * Generate Satellite SQL file using automate_dv.sat macro
 * @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_satellites/
 */
async function generateSatellite(
  config: EntityDesignConfig,
  attributes: DesignerColumnDefinition[],
  projectPath: string
): Promise<GeneratedFile> {
  const { concept, entityName } = config;
  const satName = `sat_${entityName}`;
  const hashKeyName = `hk_${entityName.toLowerCase()}`;
  const hashDiffName = `hd_${entityName.toLowerCase()}`;
  const stagingRef = `${concept}_${entityName}`;

  // Build payload list (lowercase to match staging)
  const payloadColumns = attributes.map(a => `"${a.name.toLowerCase()}"`);
  const payloadConfig = payloadColumns.length === 1
    ? payloadColumns[0]
    : `\n    - ${payloadColumns.join('\n    - ')}`;

  const sql = `{#
    Satellite: ${satName}
    Parent Hub: hub_${entityName}
    Source: ${stagingRef}
    Payload: ${attributes.map(a => a.name).join(', ')}
    
    Generated by Entity Designer using automate_dv.sat macro
    @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_satellites/
#}

{{ config(
    materialized='incremental',
    as_columnstore=false
) }}

{%- set yaml_metadata -%}
source_model: "${stagingRef}"
src_pk: "${hashKeyName}"
src_hashdiff: 
  source_column: "${hashDiffName}"
  alias: "hashdiff"
src_payload: ${payloadConfig}
src_eff: "dss_load_date"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.sat(
    src_pk=metadata_dict["src_pk"],
    src_hashdiff=metadata_dict["src_hashdiff"],
    src_payload=metadata_dict["src_payload"],
    src_eff=metadata_dict["src_eff"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
`;

  const filePath = path.join(
    projectPath,
    'models',
    'raw_vault',
    concept,
    'satellites',
    `${satName}.sql`
  );

  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  
  // Write file
  await fs.writeFile(filePath, sql, 'utf-8');

  return { path: filePath, content: sql, type: 'satellite' };
}

/**
 * Generate Link SQL file using automate_dv.link macro
 * 
 * Two types of links:
 * 1. Standard Link: Source Hub ↔ Target Hub (both have BKs)
 *    - src_fk: [hk_source, hk_target]
 *    - src_pk: hk_link_source_target = HASH(source_bk, target_fk)
 * 
 * 2. Dependent Child Link: Only Target Hub (source has no BK, uses DCK)
 *    - src_fk: [hk_target] (only one!)
 *    - src_pk: hk_link_source_target = HASH(target_fk, dck_columns)
 *    - src_payload: DCK columns (these identify the dependent child)
 * 
 * @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_links/
 * @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_dep_child/
 */
async function generateLink(
  config: EntityDesignConfig,
  foreignKey: DesignerColumnDefinition,
  businessKeys: DesignerColumnDefinition[],
  dependentChildKeys: DesignerColumnDefinition[],
  projectPath: string
): Promise<GeneratedFile> {
  const { concept, entityName } = config;
  const targetHubFull = foreignKey.foreignKeyTarget!;
  
  // Parse target hub - can be "concept.hub_name" or just "hub_name"
  let targetConcept: string;
  let targetHub: string;
  if (targetHubFull.includes('.')) {
    [targetConcept, targetHub] = targetHubFull.split('.');
  } else {
    targetConcept = concept;
    targetHub = targetHubFull;
  }
  
  // Extract target entity name from hub name (e.g., "hub_country" -> "country")
  const targetEntity = targetHub.replace('hub_', '');
  
  const linkName = `link_${entityName}_${targetEntity}`;
  const linkHashKey = `hk_${linkName.toLowerCase()}`;
  const sourceHashKey = `hk_${entityName.toLowerCase()}`;
  const targetHashKey = `hk_${targetEntity.toLowerCase()}`;
  const stagingRef = `${concept}_${entityName}`;

  // Determine if this is a DC Link (no source BK, only target FK + DCK)
  const hasDCKs = dependentChildKeys.length > 0;
  const isPureDCLink = hasDCKs && businessKeys.length === 0;
  
  // Build src_fk based on link type
  let srcFkConfig: string;
  let linkTypeNote: string;
  
  if (isPureDCLink) {
    // DC Link: Only target FK (source is identified by DCK, not its own hub)
    // The Link PK hash = HASH(FK + DCK) is calculated in staging
    // DCK columns are stored in the DC Satellite, NOT in the link
    srcFkConfig = `"${targetHashKey}"`;
    linkTypeNote = `
    Link Type: Dependent Child Link (Pure DC)
    - Source entity has no own Business Key
    - Identified by: Target FK (${foreignKey.name}) + DCK (${dependentChildKeys.map(d => d.name).join(', ')})
    - Link PK hash includes DCK columns (calculated in staging)
    - DCK values are stored in the DC Satellite, not the link`;
  } else {
    // Standard Link: Both source and target hubs
    srcFkConfig = `\n    - "${sourceHashKey}"\n    - "${targetHashKey}"`;
    linkTypeNote = hasDCKs 
      ? `\n    DCK Columns: ${dependentChildKeys.map(d => d.name).join(', ')} (included in Link PK hash)`
      : '';
  }

  const sql = `{#
    Link: ${linkName}
    ${isPureDCLink ? 'Parent' : 'Source'} Hub: ${isPureDCLink ? targetConcept + '.' + targetHub : 'hub_' + entityName}
    ${isPureDCLink ? 'Dependent Child' : 'Target Hub'}: ${isPureDCLink ? entityName + ' (no own hub)' : targetConcept + '.' + targetHub}
    Driving Key: ${foreignKey.name}${linkTypeNote}
    Source: ${stagingRef}
    
    Note: In automate_dv, links don't store payload columns.
    DCK columns are only used for the link hash calculation in staging.
    The actual DCK values are stored in the DC Satellite.
    
    Generated by Entity Designer using automate_dv.link macro
    @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_links/
#}

{{ config(
    materialized='incremental',
    as_columnstore=false
) }}

{%- set yaml_metadata -%}
source_model: "${stagingRef}"
src_pk: "${linkHashKey}"
src_fk: ${srcFkConfig}
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.link(
    src_pk=metadata_dict["src_pk"],
    src_fk=metadata_dict["src_fk"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
`;

  const filePath = path.join(
    projectPath,
    'models',
    'raw_vault',
    concept,
    'links',
    `${linkName}.sql`
  );

  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  
  // Write file
  await fs.writeFile(filePath, sql, 'utf-8');

  return { path: filePath, content: sql, type: 'link' };
}

/**
 * Generate Dependent Child Satellite SQL file using automate_dv.sat macro
 * 
 * A Dependent Child Satellite is a satellite on a Link that requires additional
 * keys (DCKs) to uniquely identify records. The Link hash + DCKs form the PK.
 * 
 * Naming convention: sat_<link>_dc (e.g., sat_order_product_dc)
 * 
 * @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_dep_child/
 */
async function generateDependentChildSatellite(
  config: EntityDesignConfig,
  linkForeignKey: DesignerColumnDefinition,
  dependentChildKeys: DesignerColumnDefinition[],
  attributes: DesignerColumnDefinition[],
  projectPath: string
): Promise<GeneratedFile> {
  const { concept, entityName } = config;
  const targetHubFull = linkForeignKey.foreignKeyTarget!;
  
  // Parse target hub
  let targetHub: string;
  if (targetHubFull.includes('.')) {
    [, targetHub] = targetHubFull.split('.');
  } else {
    targetHub = targetHubFull;
  }
  const targetEntity = targetHub.replace('hub_', '');
  
  const linkName = `link_${entityName}_${targetEntity}`;
  const dcSatName = `sat_${entityName}_${targetEntity}_dc`;
  const linkHashKey = `hk_${linkName.toLowerCase()}`;
  const hashDiffName = `hd_${dcSatName.toLowerCase().replace('sat_', '')}`;
  const stagingRef = `${concept}_${entityName}`;

  // DCKs become part of the payload for DC Satellites
  const dckPayload = dependentChildKeys.map(dck => `"${dck.name.toLowerCase()}"`);
  
  // Combine DCKs with regular attributes for payload
  const attrPayload = attributes.map(a => `"${a.name.toLowerCase()}"`);
  const allPayload = [...dckPayload, ...attrPayload];
  const payloadConfig = allPayload.length === 1
    ? allPayload[0]
    : `\n    - ${allPayload.join('\n    - ')}`;

  const sql = `{#
    Dependent Child Satellite: ${dcSatName}
    Parent Link: ${linkName}
    DCK Columns: ${dependentChildKeys.map(d => d.name).join(', ')}
    Payload: ${[...dependentChildKeys, ...attributes].map(a => a.name).join(', ')}
    Source: ${stagingRef}
    
    A Dependent Child Satellite tracks changes to link relationships
    that require additional keys (DCKs) for uniqueness.
    The Link Hash Key + DCK columns form the composite primary key.
    
    Generated by Entity Designer using automate_dv.sat macro
    @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_dep_child/
#}

{{ config(
    materialized='incremental',
    as_columnstore=false
) }}

{%- set yaml_metadata -%}
source_model: "${stagingRef}"
src_pk: "${linkHashKey}"
src_hashdiff: 
  source_column: "${hashDiffName}"
  alias: "hashdiff"
src_payload: ${payloadConfig}
src_eff: "dss_load_date"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.sat(
    src_pk=metadata_dict["src_pk"],
    src_hashdiff=metadata_dict["src_hashdiff"],
    src_payload=metadata_dict["src_payload"],
    src_eff=metadata_dict["src_eff"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
`;

  const filePath = path.join(
    projectPath,
    'models',
    'raw_vault',
    concept,
    'satellites',
    `${dcSatName}.sql`
  );

  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  
  // Write file
  await fs.writeFile(filePath, sql, 'utf-8');

  return { path: filePath, content: sql, type: 'dc_satellite' };
}

/**
 * Generate Multi-Active Satellite SQL file using automate_dv.ma_sat macro
 * 
 * A Multi-Active Satellite allows multiple valid records for the same
 * business key at the same time, distinguished by a Child Dependent Key (CDK).
 * 
 * Use case: Multiple phone numbers, addresses, or roles per person
 * 
 * @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_multi_active_satellites/
 */
async function generateMultiActiveSatellite(
  config: EntityDesignConfig,
  multiActiveKeys: DesignerColumnDefinition[],
  attributes: DesignerColumnDefinition[],
  projectPath: string
): Promise<GeneratedFile> {
  const { concept, entityName } = config;
  const maSatName = `sat_${entityName}_ma`;
  const hashKeyName = `hk_${entityName.toLowerCase()}`;
  const hashDiffName = `hd_${entityName.toLowerCase()}_ma`;
  const stagingRef = `${concept}_${entityName}`;

  // Build MA CDK list - these columns distinguish concurrent records
  const cdkColumns = multiActiveKeys.map(ma => `"${ma.name.toLowerCase()}"`);
  const cdkConfig = cdkColumns.length === 1
    ? cdkColumns[0]
    : `\n    - ${cdkColumns.join('\n    - ')}`;

  // Build payload list (regular attributes)
  const payloadColumns = attributes.map(a => `"${a.name.toLowerCase()}"`);
  const payloadConfig = payloadColumns.length > 0
    ? (payloadColumns.length === 1
      ? payloadColumns[0]
      : `\n    - ${payloadColumns.join('\n    - ')}`)
    : '[]';

  const sql = `{#
    Multi-Active Satellite: ${maSatName}
    Parent Hub: hub_${entityName}
    CDK (Child Dependent Keys): ${multiActiveKeys.map(m => m.name).join(', ')}
    Payload: ${attributes.map(a => a.name).join(', ') || '(none)'}
    Source: ${stagingRef}
    
    A Multi-Active Satellite allows multiple concurrent valid records
    for the same business key. The CDK columns distinguish each record.
    
    Example use cases:
    - Multiple phone numbers per customer
    - Multiple addresses per employee
    - Multiple roles per user
    
    Generated by Entity Designer using automate_dv.ma_sat macro
    @see https://automate-dv.readthedocs.io/en/latest/tutorial/tut_multi_active_satellites/
#}

{{ config(
    materialized='incremental',
    as_columnstore=false
) }}

{%- set yaml_metadata -%}
source_model: "${stagingRef}"
src_pk: "${hashKeyName}"
src_cdk: ${cdkConfig}
src_hashdiff: 
  source_column: "${hashDiffName}"
  alias: "hashdiff"
src_payload: ${payloadConfig}
src_eff: "dss_load_date"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.ma_sat(
    src_pk=metadata_dict["src_pk"],
    src_cdk=metadata_dict["src_cdk"],
    src_hashdiff=metadata_dict["src_hashdiff"],
    src_payload=metadata_dict["src_payload"],
    src_eff=metadata_dict["src_eff"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
`;

  const filePath = path.join(
    projectPath,
    'models',
    'raw_vault',
    concept,
    'satellites',
    `${maSatName}.sql`
  );

  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  
  // Write file
  await fs.writeFile(filePath, sql, 'utf-8');

  return { path: filePath, content: sql, type: 'ma_satellite' };
}

/**
 * Generate YAML schema documentation for generated models
 */
export async function generateSchemaYaml(
  config: EntityDesignConfig,
  generatedFiles: GeneratedFile[],
  projectPath: string
): Promise<GeneratedFile> {
  const { concept, entityName } = config;
  const businessKeys = config.columns.filter(c => 
    c.columnType === 'business_key' || c.columnType === 'hub'
  );
  const attributes = config.columns.filter(c => 
    c.columnType === 'attribute' || c.columnType === 'satellite'
  );
  const dependentChildKeys = config.columns.filter(c => 
    c.columnType === 'dependent_child'
  );
  const multiActiveKeys = config.columns.filter(c => 
    c.columnType === 'multi_active'
  );

  // Build YAML content
  let yamlContent = `version: 2

models:`;

  // Add Hub model
  if (generatedFiles.some(f => f.type === 'hub')) {
    yamlContent += `
  - name: hub_${entityName}
    description: |
      Hub for ${entityName} entity.
      Generated by Entity Designer using automate_dv.hub macro.
    columns:
      - name: hk_${entityName.toLowerCase()}
        description: Hash Key (Primary Key)
        data_type: char(64)
        tests:
          - not_null
          - unique`;
    
    for (const bk of businessKeys) {
      yamlContent += `
      - name: ${bk.name.toLowerCase()}
        description: Business Key
        data_type: ${bk.dataType || 'nvarchar(max)'}
        tests:
          - not_null`;
    }

    yamlContent += `
      - name: dss_load_date
        description: Load timestamp
        data_type: datetime2(7)
        tests:
          - not_null
      - name: dss_record_source
        description: Data source identifier
        data_type: varchar(100)
        tests:
          - not_null`;
  }

  // Add Satellite model
  if (generatedFiles.some(f => f.type === 'satellite')) {
    yamlContent += `

  - name: sat_${entityName}
    description: |
      Satellite for ${entityName} attributes.
      Generated by Entity Designer using automate_dv.sat macro.
    columns:
      - name: hk_${entityName.toLowerCase()}
        description: Hash Key (FK to Hub)
        data_type: char(64)
        tests:
          - not_null
      - name: hashdiff
        description: Hash Diff for change detection (aliased from hd_${entityName.toLowerCase()})
        data_type: char(64)
        tests:
          - not_null`;

    for (const attr of attributes) {
      yamlContent += `
      - name: ${attr.name.toLowerCase()}
        description: ${attr.name} attribute
        data_type: ${attr.dataType || 'nvarchar(max)'}`;
    }

    yamlContent += `
      - name: effective_from
        description: Business effectivity date
        data_type: datetime2(7)
      - name: dss_load_date
        description: Load timestamp
        data_type: datetime2(7)
        tests:
          - not_null
      - name: dss_record_source
        description: Data source identifier
        data_type: varchar(100)
        tests:
          - not_null`;
  }

  // Add Link models
  const linkFiles = generatedFiles.filter(f => f.type === 'link');
  for (const linkFile of linkFiles) {
    const linkName = path.basename(linkFile.path, '.sql');
    yamlContent += `

  - name: ${linkName}
    description: |
      Link relationship.
      Generated by Entity Designer using automate_dv.link macro.
    columns:
      - name: hk_${linkName.toLowerCase()}
        description: Link Hash Key (Primary Key)
        data_type: char(64)
        tests:
          - not_null
          - unique
      - name: hk_${entityName.toLowerCase()}
        description: FK to source Hub
        data_type: char(64)
        tests:
          - not_null
      - name: dss_load_date
        description: Load timestamp
        data_type: datetime2(7)
        tests:
          - not_null
      - name: dss_record_source
        description: Data source identifier
        data_type: varchar(100)
        tests:
          - not_null`;
  }

  yamlContent += '\n';

  const filePath = path.join(
    projectPath,
    'models',
    'raw_vault',
    concept,
    `_${concept}__models.yml`
  );

  // Check if file exists and merge if needed
  try {
    const existingContent = await fs.readFile(filePath, 'utf-8');
    
    // Parse model names we're trying to add
    const newModelNames = new Set<string>();
    if (generatedFiles.some(f => f.type === 'hub')) {
      newModelNames.add(`hub_${entityName}`);
    }
    if (generatedFiles.some(f => f.type === 'satellite')) {
      newModelNames.add(`sat_${entityName}`);
    }
    for (const linkFile of linkFiles) {
      newModelNames.add(path.basename(linkFile.path, '.sql'));
    }
    // Add DC Satellites
    const dcSatFiles = generatedFiles.filter(f => f.type === 'dc_satellite');
    for (const dcSatFile of dcSatFiles) {
      newModelNames.add(path.basename(dcSatFile.path, '.sql'));
    }
    // Add MA Satellites
    const maSatFiles = generatedFiles.filter(f => f.type === 'ma_satellite');
    for (const maSatFile of maSatFiles) {
      newModelNames.add(path.basename(maSatFile.path, '.sql'));
    }
    
    // Check which models already exist in the YAML
    const existingModelMatches = existingContent.matchAll(/^\s*-\s*name:\s*(\S+)/gm);
    const existingModels = new Set([...existingModelMatches].map(m => m[1]));
    
    // Filter to only new models that don't exist yet
    const modelsToAdd: string[] = [];
    for (const modelName of newModelNames) {
      if (!existingModels.has(modelName)) {
        modelsToAdd.push(modelName);
      }
    }
    
    if (modelsToAdd.length === 0) {
      console.log('[Entity Generator] All models already exist in YAML, skipping');
      return { path: filePath, content: existingContent, type: 'schema' };
    }
    
    // Build YAML for only the new models
    let newModelsYaml = '';
    
    if (modelsToAdd.includes(`hub_${entityName}`)) {
      newModelsYaml += buildHubYaml(entityName, businessKeys);
    }
    if (modelsToAdd.includes(`sat_${entityName}`)) {
      newModelsYaml += buildSatelliteYaml(entityName, attributes);
    }
    for (const linkFile of linkFiles) {
      const linkName = path.basename(linkFile.path, '.sql');
      if (modelsToAdd.includes(linkName)) {
        newModelsYaml += buildLinkYaml(linkName, entityName, linkFile);
      }
    }
    
    // DC Satellites (reuse filtered files from above)
    for (const dcSatFile of dcSatFiles) {
      const dcSatName = path.basename(dcSatFile.path, '.sql');
      if (modelsToAdd.includes(dcSatName)) {
        newModelsYaml += buildDCSatelliteYaml(dcSatName, entityName, dependentChildKeys, attributes, dcSatFile);
      }
    }
    
    // MA Satellites (reuse filtered files from above)
    for (const maSatFile of maSatFiles) {
      const maSatName = path.basename(maSatFile.path, '.sql');
      if (modelsToAdd.includes(maSatName)) {
        newModelsYaml += buildMASatelliteYaml(maSatName, entityName, multiActiveKeys, attributes);
      }
    }
    
    // Append new models to existing content (before final newline)
    const mergedContent = existingContent.trimEnd() + '\n' + newModelsYaml;
    await fs.writeFile(filePath, mergedContent, 'utf-8');
    console.log(`[Entity Generator] Merged ${modelsToAdd.length} new models into YAML`);
    
    return { path: filePath, content: mergedContent, type: 'schema' };
    
  } catch {
    // File doesn't exist, create it
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, yamlContent, 'utf-8');
    console.log('[Entity Generator] Created new YAML file');
  }

  return { path: filePath, content: yamlContent, type: 'schema' };
}

/**
 * Build YAML content for a Hub model
 */
function buildHubYaml(entityName: string, businessKeys: DesignerColumnDefinition[]): string {
  let yaml = `
  - name: hub_${entityName}
    description: |
      Hub for ${entityName} entity.
      Generated by Entity Designer using automate_dv.hub macro.
    columns:
      - name: hk_${entityName.toLowerCase()}
        description: Hash Key (Primary Key)
        data_type: char(64)
        tests:
          - not_null
          - unique`;
  
  for (const bk of businessKeys) {
    yaml += `
      - name: ${bk.name.toLowerCase()}
        description: Business Key
        data_type: ${bk.dataType || 'NVARCHAR(MAX)'}
        tests:
          - not_null`;
  }

  yaml += `
      - name: dss_load_date
        description: Load timestamp
        data_type: datetime2(7)
        tests:
          - not_null
      - name: dss_record_source
        description: Data source identifier
        data_type: varchar(100)
        tests:
          - not_null
`;
  return yaml;
}

/**
 * Build YAML content for a Satellite model
 */
function buildSatelliteYaml(entityName: string, attributes: DesignerColumnDefinition[]): string {
  let yaml = `
  - name: sat_${entityName}
    description: |
      Satellite for ${entityName} attributes.
      Generated by Entity Designer using automate_dv.sat macro.
    columns:
      - name: hk_${entityName.toLowerCase()}
        description: Hash Key (FK to Hub)
        data_type: char(64)
        tests:
          - not_null
      - name: hashdiff
        description: Hash Diff for change detection
        data_type: char(64)
        tests:
          - not_null`;

  for (const attr of attributes) {
    yaml += `
      - name: ${attr.name.toLowerCase()}
        description: ${attr.name} attribute
        data_type: ${attr.dataType || 'NVARCHAR(MAX)'}`;
  }

  yaml += `
      - name: effective_from
        description: Business effectivity date
        data_type: datetime2(7)
      - name: dss_load_date
        description: Load timestamp
        data_type: datetime2(7)
        tests:
          - not_null
      - name: dss_record_source
        description: Data source identifier
        data_type: varchar(100)
        tests:
          - not_null
`;
  return yaml;
}

/**
 * Build YAML content for a Link model
 */
function buildLinkYaml(linkName: string, sourceEntityName: string, linkFile: GeneratedFile): string {
  // Extract target hub from link file content
  const fkMatch = linkFile.content.match(/src_fk:\s*\n\s*-\s*"([^"]+)"\s*\n\s*-\s*"([^"]+)"/);
  const fks = fkMatch ? [fkMatch[1], fkMatch[2]] : [`hk_${sourceEntityName.toLowerCase()}`];
  
  let yaml = `
  - name: ${linkName}
    description: |
      Link relationship.
      Generated by Entity Designer using automate_dv.link macro.
    columns:
      - name: hk_${linkName.toLowerCase()}
        description: Link Hash Key (Primary Key)
        data_type: char(64)
        tests:
          - not_null
          - unique`;

  for (const fk of fks) {
    yaml += `
      - name: ${fk}
        description: FK to Hub
        data_type: char(64)
        tests:
          - not_null`;
  }

  yaml += `
      - name: dss_load_date
        description: Load timestamp
        data_type: datetime2(7)
        tests:
          - not_null
      - name: dss_record_source
        description: Data source identifier
        data_type: varchar(100)
        tests:
          - not_null
`;
  return yaml;
}

/**
 * Build YAML content for a Dependent Child Satellite model
 */
function buildDCSatelliteYaml(
  dcSatName: string, 
  sourceEntityName: string, 
  dependentChildKeys: DesignerColumnDefinition[],
  attributes: DesignerColumnDefinition[],
  dcSatFile: GeneratedFile
): string {
  // Extract link hash key from DC Sat file
  const pkMatch = dcSatFile.content.match(/src_pk:\s*"([^"]+)"/);
  const linkHashKey = pkMatch ? pkMatch[1] : `hk_link_${sourceEntityName.toLowerCase()}`;
  
  let yaml = `
  - name: ${dcSatName}
    description: |
      Dependent Child Satellite for ${sourceEntityName} link relationship.
      Contains DCK columns that make link records unique at a more granular level.
      Generated by Entity Designer using automate_dv.sat macro.
    columns:
      - name: ${linkHashKey}
        description: Link Hash Key (FK to Link)
        data_type: char(64)
        tests:
          - not_null
      - name: hashdiff
        description: Hash Diff for change detection
        data_type: char(64)
        tests:
          - not_null`;

  // Add DCK columns
  for (const dck of dependentChildKeys) {
    yaml += `
      - name: ${dck.name.toLowerCase()}
        description: Dependent Child Key
        data_type: ${dck.dataType || 'NVARCHAR(MAX)'}
        tests:
          - not_null`;
  }

  // Add attribute columns
  for (const attr of attributes) {
    yaml += `
      - name: ${attr.name.toLowerCase()}
        description: ${attr.name} attribute
        data_type: ${attr.dataType || 'NVARCHAR(MAX)'}`;
  }

  yaml += `
      - name: effective_from
        description: Business effectivity date
        data_type: datetime2(7)
      - name: dss_load_date
        description: Load timestamp
        data_type: datetime2(7)
        tests:
          - not_null
      - name: dss_record_source
        description: Data source identifier
        data_type: varchar(100)
        tests:
          - not_null
`;
  return yaml;
}

/**
 * Build YAML content for a Multi-Active Satellite model
 */
function buildMASatelliteYaml(
  maSatName: string, 
  sourceEntityName: string, 
  multiActiveKeys: DesignerColumnDefinition[],
  attributes: DesignerColumnDefinition[]
): string {
  const hashKeyName = `hk_${sourceEntityName.toLowerCase()}`;
  
  let yaml = `
  - name: ${maSatName}
    description: |
      Multi-Active Satellite for ${sourceEntityName} entity.
      Allows multiple concurrent valid records per business key.
      CDK columns distinguish each concurrent record.
      Generated by Entity Designer using automate_dv.ma_sat macro.
    columns:
      - name: ${hashKeyName}
        description: Hash Key (FK to Hub)
        data_type: char(64)
        tests:
          - not_null
      - name: hashdiff
        description: Hash Diff for change detection
        data_type: char(64)
        tests:
          - not_null`;

  // Add CDK (Child Dependent Key) columns
  for (const cdk of multiActiveKeys) {
    yaml += `
      - name: ${cdk.name.toLowerCase()}
        description: Child Dependent Key (CDK) - distinguishes concurrent records
        data_type: ${cdk.dataType || 'NVARCHAR(MAX)'}
        tests:
          - not_null`;
  }

  // Add attribute columns
  for (const attr of attributes) {
    yaml += `
      - name: ${attr.name.toLowerCase()}
        description: ${attr.name} attribute
        data_type: ${attr.dataType || 'NVARCHAR(MAX)'}`;
  }

  yaml += `
      - name: effective_from
        description: Business effectivity date
        data_type: datetime2(7)
      - name: dss_load_date
        description: Load timestamp
        data_type: datetime2(7)
        tests:
          - not_null
      - name: dss_record_source
        description: Data source identifier
        data_type: varchar(100)
        tests:
          - not_null
`;
  return yaml;
}
