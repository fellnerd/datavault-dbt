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
import { EntityDesignConfig, DesignerColumnDefinition, GeneratedFile, GenerationResult, StagingConfig, ForeignKeyMapping, SourceType, LambdaVaultConfig } from '../types';
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
    // Helper to check if column has a type (primary or additional)
    const hasType = (col: DesignerColumnDefinition, type: string): boolean => {
      if (col.columnType === type) return true;
      return col.additionalTypes?.includes(type as DesignerColumnDefinition['columnType']) ?? false;
    };
    
    // Map UI column types to internal types (handle both old and new naming)
    // Also include columns with additionalTypes
    const businessKeys = config.columns.filter(c => 
      hasType(c, 'business_key') || hasType(c, 'hub')
    );
    const attributes = config.columns.filter(c => 
      (hasType(c, 'attribute') || hasType(c, 'satellite')) &&
      // Exclude hash columns from payload - they are handled separately
      !c.name.toLowerCase().startsWith('hk_') &&
      !c.name.toLowerCase().startsWith('hd_')
    );
    const foreignKeys = config.columns.filter(c => 
      hasType(c, 'foreign_key') || hasType(c, 'link')
    );
    const dependentChildKeys = config.columns.filter(c => 
      hasType(c, 'dependent_child')
    );
    const multiActiveKeys = config.columns.filter(c => 
      hasType(c, 'multi_active')
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
    as_columnstore=false,
    post_hook=["{{ create_hash_index('${hashKeyName}') }}"]
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
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('${hashKeyName}') }}",
        "{{ update_satellite_current_flag(this, '${hashKeyName}') }}"
    ]
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
    as_columnstore=false,
    post_hook=["{{ create_hash_index('${linkHashKey}') }}"]
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
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('${linkHashKey}') }}",
        "{{ update_satellite_current_flag(this, '${linkHashKey}') }}"
    ]
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
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('${hashKeyName}') }}",
        "{{ update_satellite_current_flag(this, '${hashKeyName}') }}"
    ]
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
  
  // Helper to check if column has a type (primary or additional)
  const hasType = (col: DesignerColumnDefinition, type: string): boolean => {
    if (col.columnType === type) return true;
    return col.additionalTypes?.includes(type as DesignerColumnDefinition['columnType']) ?? false;
  };
  
  const businessKeys = config.columns.filter(c => 
    hasType(c, 'business_key') || hasType(c, 'hub')
  );
  // Include columns that are satellite OR have satellite in additionalTypes
  const attributes = config.columns.filter(c => 
    hasType(c, 'attribute') || hasType(c, 'satellite')
  );
  const dependentChildKeys = config.columns.filter(c => 
    hasType(c, 'dependent_child')
  );
  const multiActiveKeys = config.columns.filter(c => 
    hasType(c, 'multi_active')
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
          - not_null
      - name: dss_is_current
        description: Current record flag (Y=current, N=historical)
        data_type: char(1)
        tests:
          - not_null
          - accepted_values:
              values: ['Y', 'N']
      - name: dss_end_date
        description: End date when record was superseded
        data_type: datetime2(7)`;
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

  // Check if file exists and merge/update if needed
  try {
    const existingContent = await fs.readFile(filePath, 'utf-8');
    
    // Parse the YAML to work with structured data
    const yaml = await import('yaml');
    let existingYaml: { version?: number; models?: Array<{ name: string; [key: string]: unknown }> };
    try {
      existingYaml = yaml.parse(existingContent) || { version: 2, models: [] };
    } catch {
      // If parsing fails, start fresh
      existingYaml = { version: 2, models: [] };
    }
    
    if (!existingYaml.models) {
      existingYaml.models = [];
    }
    
    // Build a map of existing models by name for quick lookup
    const existingModelsMap = new Map<string, number>();
    existingYaml.models.forEach((m, idx) => {
      if (m.name) {
        existingModelsMap.set(m.name, idx);
      }
    });
    
    // Parse model names we're trying to add/update
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
    
    // Build new model definitions
    const newModelDefs: Array<{ name: string; description: string; columns: unknown[] }> = [];
    
    if (newModelNames.has(`hub_${entityName}`)) {
      newModelDefs.push(buildHubYamlObject(entityName, businessKeys));
    }
    if (newModelNames.has(`sat_${entityName}`)) {
      newModelDefs.push(buildSatelliteYamlObject(entityName, attributes));
    }
    for (const linkFile of linkFiles) {
      const linkName = path.basename(linkFile.path, '.sql');
      if (newModelNames.has(linkName)) {
        newModelDefs.push(buildLinkYamlObject(linkName, entityName, linkFile));
      }
    }
    for (const dcSatFile of dcSatFiles) {
      const dcSatName = path.basename(dcSatFile.path, '.sql');
      if (newModelNames.has(dcSatName)) {
        newModelDefs.push(buildDCSatelliteYamlObject(dcSatName, entityName, dependentChildKeys, attributes, dcSatFile));
      }
    }
    for (const maSatFile of maSatFiles) {
      const maSatName = path.basename(maSatFile.path, '.sql');
      if (newModelNames.has(maSatName)) {
        newModelDefs.push(buildMASatelliteYamlObject(maSatName, entityName, multiActiveKeys, attributes));
      }
    }
    
    // Update or add models
    let addedCount = 0;
    let updatedCount = 0;
    for (const newModel of newModelDefs) {
      const existingIdx = existingModelsMap.get(newModel.name);
      if (existingIdx !== undefined) {
        // Update existing model
        existingYaml.models[existingIdx] = newModel;
        updatedCount++;
        console.log(`[Entity Generator] Updated model: ${newModel.name}`);
      } else {
        // Add new model
        existingYaml.models.push(newModel);
        addedCount++;
        console.log(`[Entity Generator] Added model: ${newModel.name}`);
      }
    }
    
    // Write back the YAML
    const mergedContent = yaml.stringify(existingYaml, { 
      indent: 2,
      lineWidth: 0,  // Prevent line wrapping
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN'
    });
    await fs.writeFile(filePath, mergedContent, 'utf-8');
    console.log(`[Entity Generator] YAML updated: ${addedCount} added, ${updatedCount} updated`);
    
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

/**
 * Build YAML Object for a Hub model (for YAML merge/update)
 */
function buildHubYamlObject(entityName: string, businessKeys: DesignerColumnDefinition[]): { name: string; description: string; columns: unknown[] } {
  const columns: unknown[] = [
    {
      name: `hk_${entityName.toLowerCase()}`,
      description: 'Hash Key (Primary Key)',
      data_type: 'char(64)',
      tests: ['not_null', 'unique']
    }
  ];

  for (const bk of businessKeys) {
    columns.push({
      name: bk.name.toLowerCase(),
      description: 'Business Key',
      data_type: bk.dataType || 'NVARCHAR(MAX)',
      tests: ['not_null']
    });
  }

  columns.push(
    { name: 'dss_load_date', description: 'Load timestamp', data_type: 'datetime2(7)', tests: ['not_null'] },
    { name: 'dss_record_source', description: 'Data source identifier', data_type: 'varchar(100)', tests: ['not_null'] }
  );

  return {
    name: `hub_${entityName}`,
    description: `Hub for ${entityName} entity.\nGenerated by Entity Designer using automate_dv.hub macro.\n`,
    columns
  };
}

/**
 * Build YAML Object for a Satellite model (for YAML merge/update)
 */
function buildSatelliteYamlObject(entityName: string, attributes: DesignerColumnDefinition[]): { name: string; description: string; columns: unknown[] } {
  const columns: unknown[] = [
    {
      name: `hk_${entityName.toLowerCase()}`,
      description: 'Hash Key (FK to Hub)',
      data_type: 'char(64)',
      tests: ['not_null']
    },
    {
      name: 'hashdiff',
      description: 'Hash Diff for change detection',
      data_type: 'char(64)',
      tests: ['not_null']
    }
  ];

  for (const attr of attributes) {
    columns.push({
      name: attr.name.toLowerCase(),
      description: `${attr.name} attribute`,
      data_type: attr.dataType || 'NVARCHAR(MAX)'
    });
  }

  columns.push(
    { name: 'effective_from', description: 'Business effectivity date', data_type: 'datetime2(7)' },
    { name: 'dss_load_date', description: 'Load timestamp', data_type: 'datetime2(7)', tests: ['not_null'] },
    { name: 'dss_record_source', description: 'Data source identifier', data_type: 'varchar(100)', tests: ['not_null'] },
    { name: 'dss_is_current', description: 'Current record flag (Y=current, N=historical)', data_type: 'char(1)', tests: ['not_null', { accepted_values: { values: ['Y', 'N'] } }] },
    { name: 'dss_end_date', description: 'End date when record was superseded', data_type: 'datetime2(7)' }
  );

  return {
    name: `sat_${entityName}`,
    description: `Satellite for ${entityName} attributes.\nGenerated by Entity Designer using automate_dv.sat macro.\n`,
    columns
  };
}

/**
 * Build YAML Object for a Link model (for YAML merge/update)
 */
function buildLinkYamlObject(linkName: string, sourceEntityName: string, linkFile: GeneratedFile): { name: string; description: string; columns: unknown[] } {
  // Extract target hub from link file content
  const fkMatch = linkFile.content.match(/src_fk:\s*\n\s*-\s*"([^"]+)"\s*\n\s*-\s*"([^"]+)"/);
  const fks = fkMatch ? [fkMatch[1], fkMatch[2]] : [`hk_${sourceEntityName.toLowerCase()}`];

  const columns: unknown[] = [
    {
      name: `hk_${linkName.toLowerCase()}`,
      description: 'Link Hash Key (Primary Key)',
      data_type: 'char(64)',
      tests: ['not_null', 'unique']
    }
  ];

  for (const fk of fks) {
    columns.push({
      name: fk,
      description: 'FK to Hub',
      data_type: 'char(64)',
      tests: ['not_null']
    });
  }

  columns.push(
    { name: 'dss_load_date', description: 'Load timestamp', data_type: 'datetime2(7)', tests: ['not_null'] },
    { name: 'dss_record_source', description: 'Data source identifier', data_type: 'varchar(100)', tests: ['not_null'] }
  );

  return {
    name: linkName,
    description: `Link relationship.\nGenerated by Entity Designer using automate_dv.link macro.\n`,
    columns
  };
}

/**
 * Build YAML Object for a DC Satellite model (for YAML merge/update)
 */
function buildDCSatelliteYamlObject(
  dcSatName: string,
  sourceEntityName: string,
  dependentChildKeys: DesignerColumnDefinition[],
  attributes: DesignerColumnDefinition[],
  dcSatFile: GeneratedFile
): { name: string; description: string; columns: unknown[] } {
  // Extract link hash key from DC Sat file
  const pkMatch = dcSatFile.content.match(/src_pk:\s*"([^"]+)"/);
  const linkHashKey = pkMatch ? pkMatch[1] : `hk_link_${sourceEntityName.toLowerCase()}`;

  const columns: unknown[] = [
    {
      name: linkHashKey,
      description: 'Link Hash Key (FK to Link)',
      data_type: 'char(64)',
      tests: ['not_null']
    },
    {
      name: 'hashdiff',
      description: 'Hash Diff for change detection',
      data_type: 'char(64)',
      tests: ['not_null']
    }
  ];

  // Add DCK columns
  for (const dck of dependentChildKeys) {
    columns.push({
      name: dck.name.toLowerCase(),
      description: 'Dependent Child Key',
      data_type: dck.dataType || 'NVARCHAR(MAX)',
      tests: ['not_null']
    });
  }

  // Add attribute columns
  for (const attr of attributes) {
    columns.push({
      name: attr.name.toLowerCase(),
      description: `${attr.name} attribute`,
      data_type: attr.dataType || 'NVARCHAR(MAX)'
    });
  }

  columns.push(
    { name: 'effective_from', description: 'Business effectivity date', data_type: 'datetime2(7)' },
    { name: 'dss_load_date', description: 'Load timestamp', data_type: 'datetime2(7)', tests: ['not_null'] },
    { name: 'dss_record_source', description: 'Data source identifier', data_type: 'varchar(100)', tests: ['not_null'] },
    { name: 'dss_is_current', description: 'Current record flag (Y=current, N=historical)', data_type: 'char(1)', tests: ['not_null', { accepted_values: { values: ['Y', 'N'] } }] },
    { name: 'dss_end_date', description: 'End date when record was superseded', data_type: 'datetime2(7)' }
  );

  return {
    name: dcSatName,
    description: `Dependent Child Satellite for ${sourceEntityName} link relationship.\nContains DCK columns that make link records unique at a more granular level.\nGenerated by Entity Designer using automate_dv.sat macro.\n`,
    columns
  };
}

/**
 * Build YAML Object for a MA Satellite model (for YAML merge/update)
 */
function buildMASatelliteYamlObject(
  maSatName: string,
  sourceEntityName: string,
  multiActiveKeys: DesignerColumnDefinition[],
  attributes: DesignerColumnDefinition[]
): { name: string; description: string; columns: unknown[] } {
  const hashKeyName = `hk_${sourceEntityName.toLowerCase()}`;

  const columns: unknown[] = [
    {
      name: hashKeyName,
      description: 'Hash Key (FK to Hub)',
      data_type: 'char(64)',
      tests: ['not_null']
    },
    {
      name: 'hashdiff',
      description: 'Hash Diff for change detection',
      data_type: 'char(64)',
      tests: ['not_null']
    }
  ];

  // Add CDK columns
  for (const cdk of multiActiveKeys) {
    columns.push({
      name: cdk.name.toLowerCase(),
      description: 'Child Dependent Key (CDK) - distinguishes concurrent records',
      data_type: cdk.dataType || 'NVARCHAR(MAX)',
      tests: ['not_null']
    });
  }

  // Add attribute columns
  for (const attr of attributes) {
    columns.push({
      name: attr.name.toLowerCase(),
      description: `${attr.name} attribute`,
      data_type: attr.dataType || 'NVARCHAR(MAX)'
    });
  }

  columns.push(
    { name: 'effective_from', description: 'Business effectivity date', data_type: 'datetime2(7)' },
    { name: 'dss_load_date', description: 'Load timestamp', data_type: 'datetime2(7)', tests: ['not_null'] },
    { name: 'dss_record_source', description: 'Data source identifier', data_type: 'varchar(100)', tests: ['not_null'] },
    { name: 'dss_is_current', description: 'Current record flag (Y=current, N=historical)', data_type: 'char(1)', tests: ['not_null', { accepted_values: { values: ['Y', 'N'] } }] },
    { name: 'dss_end_date', description: 'End date when record was superseded', data_type: 'datetime2(7)' }
  );

  return {
    name: maSatName,
    description: `Multi-Active Satellite for ${sourceEntityName} entity.\nAllows multiple concurrent valid records per business key.\nCDK columns distinguish each concurrent record.\nGenerated by Entity Designer using automate_dv.ma_sat macro.\n`,
    columns
  };
}

// ============================================
// LAMBDA VAULT - VIRTUAL VIEW GENERATION
// ============================================

/**
 * Generate Virtual Views for Lambda Vault pattern
 * Creates v_hub_* and v_sat_* views that UNION base + delta staging
 * 
 * Lambda Vault enables near-real-time queries by combining:
 * - Base staging (persisted data from batch load)
 * - Delta staging (real-time data from API/streaming)
 * 
 * @param config Entity design configuration
 * @param lambdaConfig Lambda Vault configuration (delta model + mappings)
 * @param projectPath Path to dbt project
 * @returns Array of generated virtual view files
 */

async function loadStagingColumnsFromYaml(projectPath: string, modelName: string): Promise<string[]> {
  const yamlPath = path.join(projectPath, 'models', 'staging', '_staging__models.yml');
  try {
    const content = await fs.readFile(yamlPath, 'utf-8');
    const yaml = require('js-yaml');
    const parsed = yaml.load(content) as { models?: Array<{ name: string; columns?: Array<{ name: string }> }> };
    
    if (!parsed?.models) return [];
    
    const model = parsed.models.find(m => m.name === modelName);
    if (!model?.columns) return [];
    
    return model.columns.map(c => c.name);
  } catch {
    return [];
  }
}

export async function generateVirtualViews(
  config: EntityDesignConfig,
  lambdaConfig: LambdaVaultConfig,
  projectPath: string
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  const { concept, entityName, columns } = config;
  const { deltaStagingModel, columnMappings } = lambdaConfig;

  // Build column mapping lookup (base -> delta)
  const mappingLookup = new Map<string, string>();
  columnMappings.forEach(m => {
    mappingLookup.set(m.baseColumn.toLowerCase(), m.deltaColumn);
  });

  // Load delta staging columns from _staging__models.yml
  const deltaColumns = await loadStagingColumnsFromYaml(projectPath, deltaStagingModel);
  const deltaColsLower = new Set(deltaColumns.map(c => c.toLowerCase()));

  // Get business keys and satellite attributes
  const businessKeys = columns.filter(c => c.columnType === 'hub' || c.columnType === 'business_key');
  const attributes = columns.filter(c => 
    (c.columnType === 'satellite' || c.columnType === 'attribute') &&
    !c.name.toLowerCase().startsWith('hk_') &&
    !c.name.toLowerCase().startsWith('hd_')
  );

  // Get foreign keys for links
  const foreignKeys = columns.filter(c => c.columnType === 'link' || c.columnType === 'foreign_key');
  
  // Get dependent child keys
  const dcKeys = columns.filter(c => c.columnType === 'dependent_child');
  
  // Get multi-active keys (CDK columns)
  const maKeys = columns.filter(c => c.columnType === 'multi_active' || c.multiActiveSequence);

  // Base staging model name
  const baseStagingModel = `${concept}_${entityName}`;

  // Ensure virtual directory exists
  const virtualDir = path.join(projectPath, 'models', 'raw_vault', concept, 'virtual');
  await fs.mkdir(virtualDir, { recursive: true });

  // ============================================
  // Generate Virtual Hub View
  // ============================================
  const vHubContent = generateVirtualHubSql(
    entityName,
    baseStagingModel,
    deltaStagingModel,
    businessKeys,
    mappingLookup,
    deltaColsLower,
    concept
  );

  const vHubPath = path.join(virtualDir, `v_hub_${entityName}.sql`);
  await fs.writeFile(vHubPath, vHubContent, 'utf-8');

  files.push({
    path: vHubPath,
    content: vHubContent,
    type: 'virtual_hub'
  });

  // ============================================
  // Generate Virtual Satellite View
  // Determines type: Standard, DC, or MA
  // ============================================
  const satelliteType = dcKeys.length > 0 ? 'dc' : (maKeys.length > 0 ? 'ma' : 'standard');
  
  const vSatContent = generateVirtualSatelliteSql(
    entityName,
    baseStagingModel,
    deltaStagingModel,
    businessKeys,
    attributes,
    mappingLookup,
    deltaColsLower,
    concept,
    satelliteType,
    maKeys,  // CDK columns for MA Sat
    dcKeys   // DC columns for DC Sat
  );

  const vSatPath = path.join(virtualDir, `v_sat_${entityName}.sql`);
  await fs.writeFile(vSatPath, vSatContent, 'utf-8');

  files.push({
    path: vSatPath,
    content: vSatContent,
    type: 'virtual_satellite'
  });

  // ============================================
  // Generate Virtual Link Views (one per FK)
  // ============================================
  for (const fk of foreignKeys) {
    if (!fk.foreignKeyTarget) continue;
    
    // Extract target entity name from foreignKeyTarget (e.g., 'hub_company' -> 'company')
    const targetEntity = fk.foreignKeyTarget.replace(/^hub_/, '');
    const linkName = `${entityName}_${targetEntity}`;
    
    const vLinkContent = generateVirtualLinkSql(
      entityName,
      targetEntity,
      linkName,
      fk,
      baseStagingModel,
      deltaStagingModel,
      mappingLookup,
      deltaColsLower,
      concept
    );

    const vLinkPath = path.join(virtualDir, `v_link_${linkName}.sql`);
    await fs.writeFile(vLinkPath, vLinkContent, 'utf-8');

    files.push({
      path: vLinkPath,
      content: vLinkContent,
      type: 'virtual_link'
    });
  }

  console.log(`[Entity Generator] Generated ${files.length} virtual views for Lambda Vault`);
  return files;
}

/**
 * Generate SQL for Virtual Hub view
 */
function generateVirtualHubSql(
  entityName: string,
  baseStagingModel: string,
  deltaStagingModel: string,
  businessKeys: DesignerColumnDefinition[],
  mappingLookup: Map<string, string>,
  deltaColsLower: Set<string>,
  concept: string
): string {
  const hashKeyName = `hk_${entityName}`;
  const bkNames = businessKeys.map(bk => bk.name.toLowerCase());

  // Build SELECT columns for base
  const baseSelect = [
    `    base.${hashKeyName}`,
    ...bkNames.map(bk => `    base.${bk}`),
    '    base.dss_load_date',
    '    base.dss_record_source'
  ].join(',\n');

  // Build SELECT columns for delta (with mapping, NULL for missing)
  const deltaHashKey = mappingLookup.get(hashKeyName) || (deltaColsLower.has(hashKeyName) ? hashKeyName : null);
  const deltaSelect = [
    deltaHashKey ? `    delta.${deltaHashKey} AS ${hashKeyName}` : `    NULL AS ${hashKeyName}`,
    ...bkNames.map(bk => {
      const deltaBk = mappingLookup.get(bk) || (deltaColsLower.has(bk) ? bk : null);
      if (!deltaBk) return `    NULL AS ${bk}`;
      return deltaBk !== bk ? `    delta.${deltaBk} AS ${bk}` : `    delta.${bk}`;
    }),
    '    delta.dss_load_date',
    '    delta.dss_record_source'
  ].join(',\n');

  return `{{
  config(
    materialized='view',
    schema='vault_${concept}'
  )
}}

{#
  Virtual Hub View for Lambda Vault Pattern
  =========================================
  Combines persisted Hub data with real-time delta data for near-real-time queries.
  
  Base Staging: ${baseStagingModel} (batch-loaded, persisted)
  Delta Staging: ${deltaStagingModel} (real-time API/streaming)
  
  Generated by Entity Designer - Lambda Vault
#}

WITH base_hub AS (
  SELECT DISTINCT
${baseSelect}
  FROM {{ ref('hub_${entityName}') }} base
),

delta_staging AS (
  SELECT DISTINCT
${deltaSelect}
  FROM {{ ref('${deltaStagingModel}') }} delta
  WHERE delta.${deltaHashKey || hashKeyName} NOT IN (SELECT ${hashKeyName} FROM base_hub)
)

SELECT * FROM base_hub
UNION ALL
SELECT * FROM delta_staging
`;
}

/**
 * Generate SQL for Virtual Satellite view
 * Supports: Standard Sat, DC Sat (on Link), MA Sat (with CDK)
 */
function generateVirtualSatelliteSql(
  entityName: string,
  baseStagingModel: string,
  deltaStagingModel: string,
  businessKeys: DesignerColumnDefinition[],
  attributes: DesignerColumnDefinition[],
  mappingLookup: Map<string, string>,
  deltaColsLower: Set<string>,
  concept: string,
  satelliteType: 'standard' | 'dc' | 'ma' = 'standard',
  maKeys: DesignerColumnDefinition[] = [],
  dcKeys: DesignerColumnDefinition[] = []
): string {
  const hashKeyName = `hk_${entityName}`;
  const hashDiffName = `hd_${entityName}`;
  const attrNames = attributes.map(a => a.name.toLowerCase());
  
  // For MA Sat: CDK column names for PARTITION BY
  const cdkNames = maKeys.map(c => c.name.toLowerCase());

  // Build SELECT columns for base (automate_dv satellites don't have effective_from)
  const baseSelect = [
    `    base.${hashKeyName}`,
    '    base.hashdiff',
    ...attrNames.map(attr => `    base.${attr}`),
    '    base.dss_load_date',
    '    base.dss_record_source'
  ].join(',\n');

  // Build SELECT columns for delta (with mapping, NULL for missing)
  const deltaHashKey = mappingLookup.get(hashKeyName) || (deltaColsLower.has(hashKeyName) ? hashKeyName : null);
  const deltaHashDiff = mappingLookup.get(hashDiffName) || (deltaColsLower.has(hashDiffName) ? hashDiffName : null);
  const deltaSelect = [
    deltaHashKey ? `    delta.${deltaHashKey} AS ${hashKeyName}` : `    NULL AS ${hashKeyName}`,
    deltaHashDiff ? `    delta.${deltaHashDiff} AS hashdiff` : `    NULL AS hashdiff`,
    ...attrNames.map(attr => {
      const deltaAttr = mappingLookup.get(attr) || (deltaColsLower.has(attr) ? attr : null);
      if (!deltaAttr) return `    NULL AS ${attr}`;
      return deltaAttr !== attr ? `    delta.${deltaAttr} AS ${attr}` : `    delta.${attr}`;
    }),
    '    delta.dss_load_date',
    '    delta.dss_record_source'
  ].join(',\n');

  // For WHERE clause, use mapped columns
  const whereHashKey = deltaHashKey || hashKeyName;
  const whereHashDiff = deltaHashDiff || hashDiffName;

  // Build final SELECT column list for ranked CTE
  const finalSelectCols = [
    hashKeyName,
    'hashdiff',
    ...attrNames,
    'dss_load_date',
    'dss_record_source'
  ].map(col => `    ${col}`).join(',\n');

  // PARTITION BY clause depends on satellite type:
  // - Standard/DC: PARTITION BY hk_entity (one current per entity)
  // - MA: PARTITION BY hk_entity, cdk1, cdk2, ... (one current per entity+CDK combo)
  let partitionByClause: string;
  if (satelliteType === 'ma' && cdkNames.length > 0) {
    partitionByClause = `${hashKeyName}, ${cdkNames.join(', ')}`;
  } else {
    partitionByClause = hashKeyName;
  }

  // Satellite type description for comment
  const satTypeDesc = satelliteType === 'ma' 
    ? 'Multi-Active Satellite (allows multiple current records per entity+CDK)'
    : satelliteType === 'dc'
    ? 'Dependent Child Satellite (hangs on Link, not Hub)'
    : 'Standard Satellite';

  return `{{
  config(
    materialized='view',
    schema='vault_${concept}'
  )
}}

{#
  Virtual Satellite View for Lambda Vault Pattern
  ===============================================
  Type: ${satTypeDesc}
  
  Combines persisted Satellite data with real-time delta data for near-real-time queries.
  
  dss_is_current is DYNAMICALLY calculated based on the latest dss_load_date.
  ${satelliteType === 'ma' ? `For MA Sat: PARTITION BY includes CDK columns (${cdkNames.join(', ')})` : ''}
  
  Base Satellite: sat_${entityName} (batch-loaded, persisted)
  Delta Staging: ${deltaStagingModel} (real-time API/streaming)
  
  Generated by Entity Designer - Lambda Vault
#}

WITH base_sat AS (
  SELECT
${baseSelect}
  FROM {{ ref('sat_${entityName}') }} base
),

delta_staging AS (
  -- Delta records that are newer than what's in the satellite
  SELECT
${deltaSelect}
  FROM {{ ref('${deltaStagingModel}') }} delta
  WHERE NOT EXISTS (
    SELECT 1 FROM base_sat b 
    WHERE b.${hashKeyName} = delta.${whereHashKey}
      AND b.hashdiff = delta.${whereHashDiff}
  )
),

combined AS (
  SELECT * FROM base_sat
  UNION ALL
  SELECT * FROM delta_staging
),

ranked AS (
  -- Calculate dss_is_current dynamically
  -- ${satelliteType === 'ma' ? 'MA Sat: Multiple current records allowed per entity (one per CDK combination)' : 'Only the latest record per entity is current'}
  SELECT
${finalSelectCols},
    ROW_NUMBER() OVER (
      PARTITION BY ${partitionByClause}
      ORDER BY dss_load_date DESC
    ) AS rn,
    LEAD(dss_load_date) OVER (
      PARTITION BY ${partitionByClause}
      ORDER BY dss_load_date
    ) AS next_load_date
  FROM combined
)

SELECT
${finalSelectCols},
  CASE WHEN rn = 1 THEN 'Y' ELSE 'N' END AS dss_is_current,
  next_load_date AS dss_end_date
FROM ranked
`;
}

/**
 * Generate SQL for Virtual Link view
 */
function generateVirtualLinkSql(
  sourceEntityName: string,
  targetEntityName: string,
  linkName: string,
  fkColumn: DesignerColumnDefinition,
  baseStagingModel: string,
  deltaStagingModel: string,
  mappingLookup: Map<string, string>,
  deltaColsLower: Set<string>,
  concept: string
): string {
  const linkHashKey = `hk_link_${linkName}`;
  const sourceHashKey = `hk_${sourceEntityName}`;
  const targetHashKey = `hk_${targetEntityName}`;

  // Delta column mappings
  const deltaLinkHk = mappingLookup.get(linkHashKey) || (deltaColsLower.has(linkHashKey) ? linkHashKey : null);
  const deltaSourceHk = mappingLookup.get(sourceHashKey) || (deltaColsLower.has(sourceHashKey) ? sourceHashKey : null);
  const deltaTargetHk = mappingLookup.get(targetHashKey) || (deltaColsLower.has(targetHashKey) ? targetHashKey : null);

  // If we can't find the delta hash keys, try with _delta suffix
  const deltaLinkHkFinal = deltaLinkHk || (deltaColsLower.has(`${linkHashKey}_delta`) ? `${linkHashKey}_delta` : linkHashKey);
  const deltaSourceHkFinal = deltaSourceHk || (deltaColsLower.has(`${sourceHashKey}_delta`) ? `${sourceHashKey}_delta` : sourceHashKey);
  const deltaTargetHkFinal = deltaTargetHk || (deltaColsLower.has(`${targetHashKey}_delta`) ? `${targetHashKey}_delta` : targetHashKey);

  return `{{
  config(
    materialized='view',
    schema='vault_${concept}'
  )
}}

{#
  Virtual Link View for Lambda Vault Pattern
  ==========================================
  Combines persisted Link data with real-time delta data for near-real-time queries.
  
  Links: ${sourceEntityName} <-> ${targetEntityName}
  
  Base Link: link_${linkName} (batch-loaded, persisted)
  Delta Staging: ${deltaStagingModel} (real-time API/streaming)
  
  Generated by Entity Designer - Lambda Vault
#}

WITH base_link AS (
  SELECT
    base.${linkHashKey},
    base.${sourceHashKey},
    base.${targetHashKey},
    base.dss_load_date,
    base.dss_record_source
  FROM {{ ref('link_${linkName}') }} base
),

delta_staging AS (
  SELECT
    delta.${deltaLinkHkFinal} AS ${linkHashKey},
    delta.${deltaSourceHkFinal} AS ${sourceHashKey},
    delta.${deltaTargetHkFinal} AS ${targetHashKey},
    delta.dss_load_date,
    delta.dss_record_source
  FROM {{ ref('${deltaStagingModel}') }} delta
  WHERE delta.${deltaLinkHkFinal} NOT IN (SELECT ${linkHashKey} FROM base_link)
)

SELECT * FROM base_link
UNION ALL
SELECT * FROM delta_staging
`;
}
