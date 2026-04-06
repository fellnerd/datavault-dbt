/**
 * SQL Template Engine
 * 
 * Generates dbt SQL files from DvObject definitions.
 * Each function produces the complete file content for one automate_dv macro call.
 * Convention defaults (dss_*, post_hooks, config blocks) are built in.
 */

import {
  DvObject,
  HubObject,
  SatelliteObject,
  LinkObject,
  MaSatelliteObject,
  DcSatelliteObject,
  TLinkObject,
  EffSatelliteObject,
  ReferenceObject,
  PitObject,
  BridgeObject,
  XtsObject,
  isIncremental,
} from '../types';

// ─── Convention Constants ────────────────────────────────────

const DSS_LDTS = 'dss_load_date';
const DSS_SOURCE = 'dss_record_source';
const HUB_EXTRA = ['dss_business_key', 'dss_create_datetime'];
const SAT_EXTRA = ['dss_create_datetime'];
const HASHDIFF_ALIAS = 'HASHDIFF';

// ─── Config Block Generator ─────────────────────────────────

interface ConfigOptions {
  materialized: 'incremental' | 'view' | 'table';
  asColumnstore?: boolean;
  postHooks?: string[];
}

function generateConfigBlock(opts: ConfigOptions): string {
  const lines: string[] = [];
  lines.push(`{{ config(`);
  lines.push(`    materialized='${opts.materialized}',`);
  
  if (opts.materialized === 'incremental') {
    lines.push(`    as_columnstore=${opts.asColumnstore === true ? 'true' : 'false'},`);
  }

  if (opts.postHooks && opts.postHooks.length > 0) {
    if (opts.postHooks.length === 1) {
      lines.push(`    post_hook=["${opts.postHooks[0]}"]`);
    } else {
      lines.push(`    post_hook=[`);
      opts.postHooks.forEach((hook, i) => {
        const comma = i < opts.postHooks!.length - 1 ? ',' : '';
        lines.push(`        "${hook}"${comma}`);
      });
      lines.push(`    ]`);
    }
  } else {
    // Remove trailing comma from last line
    const lastIdx = lines.length - 1;
    lines[lastIdx] = lines[lastIdx].replace(/,$/, '');
  }

  lines.push(`) }}`);
  return lines.join('\n');
}

// ─── YAML Metadata Block ────────────────────────────────────

function yamlBlock(content: string): string {
  return `{%- set yaml_metadata -%}\n${content.trimEnd()}\n{%- endset -%}`;
}

function yamlParse(): string {
  return `{% set metadata_dict = fromyaml(yaml_metadata) %}`;
}

// ─── Hub Generator ──────────────────────────────────────────

export function generateHubSql(hub: HubObject): string {
  const entityName = hub.name.replace('hub_', '');
  const bks = Array.isArray(hub.srcNk) ? hub.srcNk : [hub.srcNk];
  
  const header = [
    `{# Hub: ${hub.name}`,
    `   Source: ${hub.sourceModel}`,
    `   Business Keys: ${bks.join(', ')}`,
    `#}`,
  ].join('\n');

  const config = generateConfigBlock({
    materialized: 'incremental',
    asColumnstore: false,
    postHooks: [`{{ create_hash_index('${hub.srcPk}') }}`],
  });

  const extraCols = hub.srcExtraColumns || HUB_EXTRA;
  const nkYaml = bks.length === 1
    ? `src_nk: "${bks[0].toLowerCase()}"`
    : `src_nk:\n${bks.map(k => `    - "${k.toLowerCase()}"`).join('\n')}`;
  const extraYaml = extraCols.length > 0
    ? `src_extra_columns:\n${extraCols.map(c => `    - "${c}"`).join('\n')}`
    : '';

  const yaml = [
    `source_model: "${hub.sourceModel}"`,
    `src_pk: "${hub.srcPk}"`,
    nkYaml,
    extraYaml,
    `src_ldts: "${hub.srcLdts || DSS_LDTS}"`,
    `src_source: "${hub.srcSource || DSS_SOURCE}"`,
  ].filter(Boolean).join('\n');

  const macroCall = [
    `{{ automate_dv.hub(src_pk=metadata_dict["src_pk"],`,
    `                   src_nk=metadata_dict["src_nk"],`,
    `                   src_ldts=metadata_dict["src_ldts"],`,
    `                   src_source=metadata_dict["src_source"],`,
    extraCols.length > 0
      ? `                   src_extra_columns=metadata_dict["src_extra_columns"],`
      : null,
    `                   source_model=metadata_dict["source_model"]) }}`,
  ].filter(Boolean).join('\n');

  return [header, '', config, '', yamlBlock(yaml), '', yamlParse(), '', macroCall, ''].join('\n');
}

// ─── Satellite Generator ────────────────────────────────────

export function generateSatSql(sat: SatelliteObject): string {
  const entityName = sat.name.replace(/^sat_/, '');
  const parentEntity = sat.parentHub.replace('hub_', '');

  const header = [
    `{# Satellite: ${sat.name}`,
    `   Source: ${sat.sourceModel}`,
    `   Parent Hub: ${sat.parentHub}`,
    `   Payload: ${sat.srcPayload.length} columns`,
    `#}`,
  ].join('\n');

  const postHooks = [
    `{{ create_hash_index('${sat.srcPk}') }}`,
    `{{ update_satellite_current_flag(this, '${sat.srcPk}') }}`,
  ];

  const config = generateConfigBlock({
    materialized: 'incremental',
    asColumnstore: false,
    postHooks,
  });

  const extraCols = sat.srcExtraColumns || SAT_EXTRA;
  const payloadYaml = sat.srcPayload.map(c => `    - "${c}"`).join('\n');
  const extraYaml = extraCols.length > 0
    ? `src_extra_columns:\n${extraCols.map(c => `    - "${c}"`).join('\n')}`
    : '';
  const effYaml = sat.srcEff ? `src_eff: "${sat.srcEff}"` : '';

  const yaml = [
    `source_model: "${sat.sourceModel}"`,
    `src_pk: "${sat.srcPk}"`,
    `src_hashdiff:`,
    `    source_column: "${sat.srcHashdiff.sourceColumn}"`,
    `    alias: "${sat.srcHashdiff.alias || HASHDIFF_ALIAS}"`,
    `src_payload:`,
    payloadYaml,
    extraYaml,
    effYaml,
    `src_ldts: "${sat.srcLdts || DSS_LDTS}"`,
    `src_source: "${sat.srcSource || DSS_SOURCE}"`,
  ].filter(Boolean).join('\n');

  const macroCall = [
    `{{ automate_dv.sat(src_pk=metadata_dict["src_pk"],`,
    `                   src_hashdiff=metadata_dict["src_hashdiff"],`,
    `                   src_payload=metadata_dict["src_payload"],`,
    `                   src_ldts=metadata_dict["src_ldts"],`,
    `                   src_source=metadata_dict["src_source"],`,
    extraCols.length > 0
      ? `                   src_extra_columns=metadata_dict["src_extra_columns"],`
      : null,
    sat.srcEff
      ? `                   src_eff=metadata_dict["src_eff"],`
      : null,
    `                   source_model=metadata_dict["source_model"]) }}`,
  ].filter(Boolean).join('\n');

  return [header, '', config, '', yamlBlock(yaml), '', yamlParse(), '', macroCall, ''].join('\n');
}

// ─── Current View Generator ─────────────────────────────────

export function generateCurrentViewSql(sat: SatelliteObject | MaSatelliteObject | DcSatelliteObject): string {
  const satModel = sat.name;
  const hkColumn = sat.srcPk;

  return [
    `{# Current View: ${satModel}_current_v`,
    `   Satellite: ${satModel}`,
    `#}`,
    '',
    `{{ config(materialized='view') }}`,
    '',
    `{{ satellite_current_view(`,
    `    satellite_model='${satModel}',`,
    `    hashkey_column='${hkColumn}'`,
    `) }}`,
    '',
  ].join('\n');
}

// ─── Link Generator ─────────────────────────────────────────

export function generateLinkSql(link: LinkObject): string {
  const header = [
    `{# Link: ${link.name}`,
    `   Source: ${link.sourceModel}`,
    `   Foreign Keys: ${link.srcFk.join(', ')}`,
    `#}`,
  ].join('\n');

  const config = generateConfigBlock({
    materialized: 'incremental',
    asColumnstore: false,
    postHooks: [`{{ create_hash_index('${link.srcPk}') }}`],
  });

  const fkYaml = link.srcFk.map(fk => `    - "${fk}"`).join('\n');
  const extraYaml = link.srcExtraColumns && link.srcExtraColumns.length > 0
    ? `src_extra_columns:\n${link.srcExtraColumns.map(c => `    - "${c}"`).join('\n')}`
    : '';

  const yaml = [
    `source_model: "${link.sourceModel}"`,
    `src_pk: "${link.srcPk}"`,
    `src_fk:`,
    fkYaml,
    extraYaml,
    `src_ldts: "${link.srcLdts || DSS_LDTS}"`,
    `src_source: "${link.srcSource || DSS_SOURCE}"`,
  ].filter(Boolean).join('\n');

  const macroCall = [
    `{{ automate_dv.link(src_pk=metadata_dict["src_pk"],`,
    `                    src_fk=metadata_dict["src_fk"],`,
    `                    src_ldts=metadata_dict["src_ldts"],`,
    `                    src_source=metadata_dict["src_source"],`,
    link.srcExtraColumns && link.srcExtraColumns.length > 0
      ? `                    src_extra_columns=metadata_dict["src_extra_columns"],`
      : null,
    `                    source_model=metadata_dict["source_model"]) }}`,
  ].filter(Boolean).join('\n');

  return [header, '', config, '', yamlBlock(yaml), '', yamlParse(), '', macroCall, ''].join('\n');
}

// ─── MA Satellite Generator ─────────────────────────────────

export function generateMaSatSql(maSat: MaSatelliteObject): string {
  const header = [
    `{# Multi-Active Satellite: ${maSat.name}`,
    `   Source: ${maSat.sourceModel}`,
    `   Parent Hub: ${maSat.parentHub}`,
    `   CDK: ${Array.isArray(maSat.srcCdk) ? maSat.srcCdk.join(', ') : maSat.srcCdk}`,
    `#}`,
  ].join('\n');

  const postHooks = [
    `{{ create_hash_index('${maSat.srcPk}') }}`,
    `{{ update_satellite_current_flag(this, '${maSat.srcPk}') }}`,
  ];

  const config = generateConfigBlock({
    materialized: 'incremental',
    asColumnstore: false,
    postHooks,
  });

  const cdks = Array.isArray(maSat.srcCdk) ? maSat.srcCdk : [maSat.srcCdk];
  const cdkYaml = cdks.length === 1
    ? `src_cdk: "${cdks[0]}"`
    : `src_cdk:\n${cdks.map(c => `    - "${c}"`).join('\n')}`;
  const payloadYaml = maSat.srcPayload.map(c => `    - "${c}"`).join('\n');
  const extraCols = maSat.srcExtraColumns || SAT_EXTRA;
  const extraYaml = extraCols.length > 0
    ? `src_extra_columns:\n${extraCols.map(c => `    - "${c}"`).join('\n')}`
    : '';

  const yaml = [
    `source_model: "${maSat.sourceModel}"`,
    `src_pk: "${maSat.srcPk}"`,
    cdkYaml,
    `src_hashdiff:`,
    `    source_column: "${maSat.srcHashdiff.sourceColumn}"`,
    `    alias: "${maSat.srcHashdiff.alias || HASHDIFF_ALIAS}"`,
    `src_payload:`,
    payloadYaml,
    extraYaml,
    maSat.srcEff ? `src_eff: "${maSat.srcEff}"` : '',
    `src_ldts: "${maSat.srcLdts || DSS_LDTS}"`,
    `src_source: "${maSat.srcSource || DSS_SOURCE}"`,
  ].filter(Boolean).join('\n');

  const macroCall = [
    `{{ automate_dv.ma_sat(src_pk=metadata_dict["src_pk"],`,
    `                      src_cdk=metadata_dict["src_cdk"],`,
    `                      src_hashdiff=metadata_dict["src_hashdiff"],`,
    `                      src_payload=metadata_dict["src_payload"],`,
    `                      src_ldts=metadata_dict["src_ldts"],`,
    `                      src_source=metadata_dict["src_source"],`,
    extraCols.length > 0
      ? `                      src_extra_columns=metadata_dict["src_extra_columns"],`
      : null,
    maSat.srcEff
      ? `                      src_eff=metadata_dict["src_eff"],`
      : null,
    `                      source_model=metadata_dict["source_model"]) }}`,
  ].filter(Boolean).join('\n');

  return [header, '', config, '', yamlBlock(yaml), '', yamlParse(), '', macroCall, ''].join('\n');
}

// ─── DC Satellite Generator (uses sat macro on link) ────────

export function generateDcSatSql(dc: DcSatelliteObject): string {
  // DC satellites use automate_dv.sat() but attached to a link
  const sat: SatelliteObject = {
    ...dc,
    type: 'satellite',
    parentHub: dc.parentLink, // conceptual parent is link, not hub
  };
  
  const header = [
    `{# DC Satellite: ${dc.name}`,
    `   Source: ${dc.sourceModel}`,
    `   Parent Link: ${dc.parentLink}`,
    `#}`,
  ].join('\n');

  // Use sat generator but replace the header
  const satSql = generateSatSql(sat);
  const lines = satSql.split('\n');
  // Replace the first 5 lines (Satellite header) with DC header
  const headerLines = header.split('\n');
  return [...headerLines, ...lines.slice(headerLines.length)].join('\n');
}

// ─── Transactional Link Generator ───────────────────────────

export function generateTLinkSql(tLink: TLinkObject): string {
  const header = [
    `{# Transactional Link: ${tLink.name}`,
    `   Source: ${tLink.sourceModel}`,
    `   Transaction Date: ${tLink.srcEff}`,
    `#}`,
  ].join('\n');

  const config = generateConfigBlock({
    materialized: 'incremental',
    asColumnstore: false,
    postHooks: [`{{ create_hash_index('${tLink.srcPk}') }}`],
  });

  const fkYaml = tLink.srcFk.map(fk => `    - "${fk}"`).join('\n');
  const payloadYaml = tLink.srcPayload && tLink.srcPayload.length > 0
    ? `src_payload:\n${tLink.srcPayload.map(c => `    - "${c}"`).join('\n')}`
    : '';
  const extraYaml = tLink.srcExtraColumns && tLink.srcExtraColumns.length > 0
    ? `src_extra_columns:\n${tLink.srcExtraColumns.map(c => `    - "${c}"`).join('\n')}`
    : '';

  const yaml = [
    `source_model: "${tLink.sourceModel}"`,
    `src_pk: "${tLink.srcPk}"`,
    `src_fk:`,
    fkYaml,
    payloadYaml,
    extraYaml,
    `src_eff: "${tLink.srcEff}"`,
    `src_ldts: "${tLink.srcLdts || DSS_LDTS}"`,
    `src_source: "${tLink.srcSource || DSS_SOURCE}"`,
  ].filter(Boolean).join('\n');

  const macroCall = [
    `{{ automate_dv.t_link(src_pk=metadata_dict["src_pk"],`,
    `                      src_fk=metadata_dict["src_fk"],`,
    tLink.srcPayload && tLink.srcPayload.length > 0
      ? `                      src_payload=metadata_dict["src_payload"],`
      : null,
    tLink.srcExtraColumns && tLink.srcExtraColumns.length > 0
      ? `                      src_extra_columns=metadata_dict["src_extra_columns"],`
      : null,
    `                      src_eff=metadata_dict["src_eff"],`,
    `                      src_ldts=metadata_dict["src_ldts"],`,
    `                      src_source=metadata_dict["src_source"],`,
    `                      source_model=metadata_dict["source_model"]) }}`,
  ].filter(Boolean).join('\n');

  return [header, '', config, '', yamlBlock(yaml), '', yamlParse(), '', macroCall, ''].join('\n');
}

// ─── Effectivity Satellite Generator ────────────────────────

export function generateEffSatSql(effSat: EffSatelliteObject): string {
  const header = [
    `{# Effectivity Satellite: ${effSat.name}`,
    `   Source: ${effSat.sourceModel}`,
    `   Driver FK: ${Array.isArray(effSat.srcDfk) ? effSat.srcDfk.join(', ') : effSat.srcDfk}`,
    `#}`,
  ].join('\n');

  const config = generateConfigBlock({
    materialized: 'incremental',
    asColumnstore: false,
    postHooks: [`{{ create_hash_index('${effSat.srcPk}') }}`],
  });

  const dfkYaml = Array.isArray(effSat.srcDfk)
    ? `src_dfk:\n${effSat.srcDfk.map(k => `    - "${k}"`).join('\n')}`
    : `src_dfk: "${effSat.srcDfk}"`;
  const sfkYaml = Array.isArray(effSat.srcSfk)
    ? `src_sfk:\n${effSat.srcSfk.map(k => `    - "${k}"`).join('\n')}`
    : `src_sfk: "${effSat.srcSfk}"`;
  const extraYaml = effSat.srcExtraColumns && effSat.srcExtraColumns.length > 0
    ? `src_extra_columns:\n${effSat.srcExtraColumns.map(c => `    - "${c}"`).join('\n')}`
    : '';

  const yaml = [
    `source_model: "${effSat.sourceModel}"`,
    `src_pk: "${effSat.srcPk}"`,
    dfkYaml,
    sfkYaml,
    extraYaml,
    `src_start_date: "${effSat.srcStartDate}"`,
    `src_end_date: "${effSat.srcEndDate}"`,
    `src_eff: "${effSat.srcEff}"`,
    `src_ldts: "${effSat.srcLdts || DSS_LDTS}"`,
    `src_source: "${effSat.srcSource || DSS_SOURCE}"`,
  ].filter(Boolean).join('\n');

  const macroCall = [
    `{{ automate_dv.eff_sat(src_pk=metadata_dict["src_pk"],`,
    `                       src_dfk=metadata_dict["src_dfk"],`,
    `                       src_sfk=metadata_dict["src_sfk"],`,
    effSat.srcExtraColumns && effSat.srcExtraColumns.length > 0
      ? `                       src_extra_columns=metadata_dict["src_extra_columns"],`
      : null,
    `                       src_start_date=metadata_dict["src_start_date"],`,
    `                       src_end_date=metadata_dict["src_end_date"],`,
    `                       src_eff=metadata_dict["src_eff"],`,
    `                       src_ldts=metadata_dict["src_ldts"],`,
    `                       src_source=metadata_dict["src_source"],`,
    `                       source_model=metadata_dict["source_model"]) }}`,
  ].filter(Boolean).join('\n');

  return [header, '', config, '', yamlBlock(yaml), '', yamlParse(), '', macroCall, ''].join('\n');
}

// ─── Reference Table Generator ──────────────────────────────

export function generateReferenceSql(ref: ReferenceObject): string {
  const pks = Array.isArray(ref.primaryKey) ? ref.primaryKey : [ref.primaryKey];

  const header = [
    `{# Reference Table: ${ref.name}`,
    `   Source: ${ref.sourceModel}`,
    `   Primary Key: ${pks.join(', ')}`,
    `#}`,
  ].join('\n');

  const allCols = [...pks, ...ref.columns];
  const selectCols = allCols.map(c => `        ${c}`).join(',\n');
  
  const whereClause = ref.filter ? `\n    WHERE ${ref.filter}` : '';
  const distinct = ref.distinct ? 'DISTINCT\n' : '';

  const sql = [
    header,
    '',
    `WITH source AS (`,
    `    SELECT * FROM {{ source('staging', '${ref.sourceModel.replace(/^ewb_/, 'ext_ewb_').replace(/^adworks_/, 'ext_adworks_')}') }}`,
    `),`,
    '',
    `deduplicated AS (`,
    `    SELECT ${distinct}${selectCols}`,
    `    FROM source${whereClause}`,
    `),`,
    '',
    `staged AS (`,
    `    SELECT`,
    allCols.map(c => `        ${c}`).join(',\n') + ',',
    `        '${ref.sourceModel.includes('ewb') ? 'ewb_abacus' : 'adworks'}' AS dss_record_source,`,
    `        GETDATE() AS dss_load_date`,
    `    FROM deduplicated`,
    `)`,
    '',
    `SELECT * FROM staged`,
    '',
  ].join('\n');

  return sql;
}

// ─── Dispatch: Generate SQL for any DV object ───────────────

export function generateSql(obj: DvObject): string {
  switch (obj.type) {
    case 'hub': return generateHubSql(obj);
    case 'satellite': return generateSatSql(obj);
    case 'link': return generateLinkSql(obj);
    case 'ma_satellite': return generateMaSatSql(obj);
    case 'dc_satellite': return generateDcSatSql(obj);
    case 't_link': return generateTLinkSql(obj);
    case 'eff_satellite': return generateEffSatSql(obj);
    case 'reference': return generateReferenceSql(obj);
    default:
      throw new Error(`Unsupported DV object type: ${(obj as DvObject).type}`);
  }
}

// ─── File Path Generator ────────────────────────────────────

export function getModelPath(concept: string, obj: DvObject): string {
  switch (obj.type) {
    case 'hub':
      return `models/raw_vault/${concept}/hubs/${obj.name}.sql`;
    case 'satellite':
    case 'ma_satellite':
    case 'dc_satellite':
      return `models/raw_vault/${concept}/satellites/${obj.name}.sql`;
    case 'link':
    case 't_link':
      return `models/raw_vault/${concept}/links/${obj.name}.sql`;
    case 'eff_satellite':
      return `models/raw_vault/${concept}/satellites/${obj.name}.sql`;
    case 'reference':
      return `models/raw_vault/${concept}/refs/${obj.name}.sql`;
    default:
      return `models/raw_vault/${concept}/${obj.name}.sql`;
  }
}

export function getCurrentViewPath(concept: string, satName: string): string {
  return `models/raw_vault/${concept}/satellites/${satName}_current_v.sql`;
}

export function getStagingPath(stagingModel: string): string {
  return `models/staging/${stagingModel}.sql`;
}
