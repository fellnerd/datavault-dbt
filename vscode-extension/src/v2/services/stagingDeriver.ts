/**
 * Staging Derivation Engine
 * 
 * Auto-generates the automate_dv.stage() YAML metadata from vault objects.
 * This is the key insight of v2: staging is DERIVED, not manually authored.
 * 
 * Flow: EntityConfigV2.objects → hashed_columns + derived_columns → stage() SQL
 */

import {
  EntityConfigV2,
  ColumnDefinition,
  SOURCE_SYSTEMS,
} from '../types';
import {
  DvObject,
  HubObject,
  SatelliteObject,
  LinkObject,
  MaSatelliteObject,
  DcSatelliteObject,
  hasHashKey,
  hasHashdiff,
  isHubChild,
} from '../types';

// ─── Constants ──────────────────────────────────────────────

const ALWAYS_ESCAPE = ['timestamp_landing-zone'];

const DATETIME_TYPES = new Set([
  'DATETIME', 'DATETIME2', 'SMALLDATETIME', 'DATE', 'TIME',
  'DATETIMEOFFSET',
]);

function isDateTimeType(dataType: string): boolean {
  const base = dataType.toUpperCase().replace(/\(.*\)/, '').trim();
  return DATETIME_TYPES.has(base);
}

/**
 * Resolve the source-system config for a given entity config.
 * Falls back to inferring the system from the source table / staging model name
 * when config.sourceSystem is missing or unknown (e.g. legacy configs saved with
 * sourceSystem "unknown"), so dss_record_source stays correct instead of
 * blindly defaulting to ewb_abacus.
 */
function resolveSourceConfig(config: EntityConfigV2) {
  const known = SOURCE_SYSTEMS[config.sourceSystem];
  if (known) return known;

  const haystack = `${config.sourceTable || ''} ${config.stagingModel || ''}`.toLowerCase();
  if (haystack.includes('idms')) return SOURCE_SYSTEMS.idms;
  if (haystack.includes('jira')) return SOURCE_SYSTEMS.jira;
  if (haystack.includes('adworks')) return SOURCE_SYSTEMS.adworks;
  return SOURCE_SYSTEMS.ewb_abacus;
}

// ─── Derived Columns ────────────────────────────────────────

interface DerivedColumnsResult {
  yamlLines: string[];
  /** Extra derived columns (e.g. PROJDAT_KEY) that need to be referenced in hashed_columns */
  derivedColumnMap: Map<string, string>;
}

function buildDerivedColumns(config: EntityConfigV2): DerivedColumnsResult {
  const lines: string[] = [];
  const derivedColumnMap = new Map<string, string>();

  const sourceConfig = resolveSourceConfig(config);

  // dss_record_source (static literal with ! prefix)
  lines.push(`  dss_record_source: "!${sourceConfig.recordSource}"`);

  // dss_load_date (safe cast from source)
  lines.push(`  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"`);

  // dss_create_datetime
  lines.push(`  dss_create_datetime: "GETDATE()"`);

  // dss_business_key — derived from all hub BKs
  const hubs = Object.values(config.objects).filter(o => o.type === 'hub') as HubObject[];
  if (hubs.length > 0) {
    const bkExpression = buildBusinessKeyExpression(hubs, config, sourceConfig.tenantPrefix || ['default', 'default']);
    lines.push(`  dss_business_key: "${bkExpression}"`);
  }

  // Derived columns for DATETIME business keys (need deterministic string representation)
  for (const hub of hubs) {
    const bks = Array.isArray(hub.srcNk) ? hub.srcNk : [hub.srcNk];
    for (const bk of bks) {
      const colDef = config.columns[bk];
      if (colDef && isDateTimeType(colDef.dataType)) {
        const derivedName = `${bk}_KEY`;
        const expression = `CONVERT(NVARCHAR(30), ${bk}, 126)`;
        lines.push(`  ${derivedName}: "${expression}"`);
        derivedColumnMap.set(bk, derivedName);
      }
    }
  }

  // _escape for reserved keywords + timestamp_landing-zone
  const escapeColumns = [...config.reservedKeywords, ...ALWAYS_ESCAPE];
  // Also check all source columns for reserved keywords not yet in the list
  for (const [name, def] of Object.entries(config.columns)) {
    if (def.reservedKeyword && !escapeColumns.includes(name)) {
      escapeColumns.push(name);
    }
  }

  if (escapeColumns.length > 0) {
    lines.push(`  _escape:`);
    if (escapeColumns.length === 1) {
      lines.push(`    source_column: "${escapeColumns[0]}"`);
    } else {
      lines.push(`    source_column:`);
      for (const col of escapeColumns) {
        lines.push(`      - "${col}"`);
      }
    }
    lines.push(`    escape: true`);
  }

  return { yamlLines: lines, derivedColumnMap };
}

function buildBusinessKeyExpression(
  hubs: HubObject[],
  config: EntityConfigV2,
  tenantPrefix: string[],
): string {
  // Collect all BK columns from all hubs
  const allBks: string[] = [];
  for (const hub of hubs) {
    const bks = Array.isArray(hub.srcNk) ? hub.srcNk : [hub.srcNk];
    allBks.push(...bks);
  }

  const prefixParts = tenantPrefix.map(p => `'${p}'`).join(', ');
  const bkParts = allBks.map(bk => {
    return `ISNULL(LTRIM(RTRIM(CAST(${bk} AS NVARCHAR(MAX)))), '-1')`;
  }).join(`, '||', `);

  // Composite case: needs explicit || separator
  if (allBks.length > 1) {
    const innerConcat = allBks.map(bk =>
      `ISNULL(LTRIM(RTRIM(CAST(${bk} AS NVARCHAR(MAX)))), '-1')`
    ).join(`, '||', `);
    return `CONCAT_WS('||', ${prefixParts}, ISNULL(LTRIM(RTRIM(CAST(CONCAT(${allBks.map(bk => `${bk}`).join(`, '||', `)}) AS NVARCHAR(MAX)))), '-1'))`;
  }

  return `CONCAT_WS('||', ${prefixParts}, ${bkParts})`;
}

// ─── Hashed Columns ─────────────────────────────────────────

interface HashedColumnsResult {
  yamlLines: string[];
}

function buildHashedColumns(
  config: EntityConfigV2,
  derivedColumnMap: Map<string, string>,
): HashedColumnsResult {
  const lines: string[] = [];
  const objects = Object.values(config.objects);

  // Hub hash keys
  for (const obj of objects) {
    if (obj.type === 'hub') {
      const hub = obj as HubObject;
      const bks = Array.isArray(hub.srcNk) ? hub.srcNk : [hub.srcNk];
      
      // Replace datetime BKs with derived column names
      const resolvedBks = bks.map(bk => derivedColumnMap.get(bk) || bk);
      
      if (resolvedBks.length === 1) {
        lines.push(`  ${hub.srcPk}: "${resolvedBks[0]}"`);
      } else {
        lines.push(`  ${hub.srcPk}:`);
        for (const bk of resolvedBks) {
          lines.push(`    - "${bk}"`);
        }
      }
    }
  }

  // Link hash keys
  for (const obj of objects) {
    if (obj.type === 'link' || obj.type === 't_link') {
      const link = obj as LinkObject;
      // Link hash key is composed of all FK hub BKs
      const fkBks = resolveLinkBks(link, config, derivedColumnMap);
      
      lines.push(`  ${link.srcPk}:`);
      for (const bk of fkBks) {
        lines.push(`    - "${bk}"`);
      }
    }
  }

  // Individual hub hash keys needed for links (FK references)
  // These may already be generated above; collect unique ones
  const generatedHks = new Set(objects.filter(o => o.type === 'hub').map(o => (o as HubObject).srcPk));
  
  for (const obj of objects) {
    if (obj.type === 'link' || obj.type === 't_link') {
      const link = obj as LinkObject;
      for (const fk of link.srcFk) {
        if (!generatedHks.has(fk)) {
          // This FK references an external hub — we need its BK columns
          // For now, add as single-column hash (user must configure)
          // In practice, the hub might be defined in same config or externally
          const externalHub = findExternalHubBk(fk, config);
          if (externalHub) {
            if (externalHub.length === 1) {
              lines.push(`  ${fk}: "${externalHub[0]}"`);
            } else {
              lines.push(`  ${fk}:`);
              for (const bk of externalHub) {
                lines.push(`    - "${bk}"`);
              }
            }
            generatedHks.add(fk);
          }
        }
      }
    }
  }

  // Satellite hash diffs
  for (const obj of objects) {
    if (obj.type === 'satellite' || obj.type === 'ma_satellite' || obj.type === 'dc_satellite') {
      const sat = obj as SatelliteObject | MaSatelliteObject | DcSatelliteObject;
      const hdName = sat.srcHashdiff.sourceColumn;
      const payloadCols = sat.srcPayload
        .map(c => c.toUpperCase())
        .sort(); // automate_dv sorts hashdiff columns alphabetically
      
      lines.push(`  ${hdName}:`);
      lines.push(`    is_hashdiff: true`);
      lines.push(`    columns:`);
      for (const col of payloadCols) {
        lines.push(`      - "${col}"`);
      }
    }
  }

  return { yamlLines: lines };
}

/** Resolve link FK hash keys to their BK columns for hashing */
function resolveLinkBks(
  link: LinkObject,
  config: EntityConfigV2,
  derivedColumnMap: Map<string, string>,
): string[] {
  const result: string[] = [];
  
  for (const fk of link.srcFk) {
    // Find the hub in this config that produces this FK
    const hub = Object.values(config.objects).find(
      o => o.type === 'hub' && (o as HubObject).srcPk === fk
    ) as HubObject | undefined;
    
    if (hub) {
      const bks = Array.isArray(hub.srcNk) ? hub.srcNk : [hub.srcNk];
      for (const bk of bks) {
        result.push(derivedColumnMap.get(bk) || bk);
      }
    } else {
      // External hub — try to find BK from config columns
      const externalBks = findExternalHubBk(fk, config);
      if (externalBks) {
        result.push(...externalBks);
      }
    }
  }

  return result;
}

/** Try to find BK columns for an external hub reference */
function findExternalHubBk(hk: string, config: EntityConfigV2): string[] | null {
  // hk format: hk_<entity> — try to find a matching column in source
  const entity = hk.replace('hk_', '');
  // Common patterns: PROJNR for projekt, EMPL_NR for person, INR for adresse
  // Check if any source column looks like a FK to this entity
  for (const [colName, _colDef] of Object.entries(config.columns)) {
    const lower = colName.toLowerCase();
    if (lower === entity || lower === `${entity}nr` || lower === `${entity}_nr` ||
        lower === `${entity}id` || lower === `${entity}_id`) {
      return [colName];
    }
  }
  return null;
}

// ─── Full Staging SQL Generation ────────────────────────────

export function deriveStagingSql(config: EntityConfigV2): string {
  const { yamlLines: derivedLines, derivedColumnMap } = buildDerivedColumns(config);
  const { yamlLines: hashedLines } = buildHashedColumns(config, derivedColumnMap);

  // Build header comment
  const objectNames = Object.keys(config.objects);
  const header = [
    `/*`,
    ` * Staging Model: ${config.stagingModel}`,
    ` *`,
    ` * Source: ${config.sourceTable} (${config.sourceSystem})`,
    ` * Objects: ${objectNames.join(', ')}`,
    ` *`,
    ` * Uses automate_dv.stage() macro for standardized staging.`,
    ` */`,
  ].join('\n');

  // Build YAML metadata
  const yamlContent = [
    `source_model:`,
    `  staging: "${config.sourceTable}"`,
    ``,
    `derived_columns:`,
    ...derivedLines,
    ``,
    `hashed_columns:`,
    ...hashedLines,
  ].join('\n');

  const macroCall = [
    `{{ automate_dv.stage(include_source_columns=true,`,
    `                     source_model=metadata_dict['source_model'],`,
    `                     derived_columns=metadata_dict['derived_columns'],`,
    `                     hashed_columns=metadata_dict['hashed_columns']) }}`,
  ].join('\n');

  return [
    header,
    '',
    `{%- set yaml_metadata -%}`,
    yamlContent,
    `{%- endset -%}`,
    '',
    `{% set metadata_dict = fromyaml(yaml_metadata) %}`,
    '',
    macroCall,
    '',
  ].join('\n');
}

// ─── Validation ─────────────────────────────────────────────

export interface StagingValidationMessage {
  severity: 'error' | 'warning';
  message: string;
}

export function validateStagingDerivation(config: EntityConfigV2): StagingValidationMessage[] {
  const messages: StagingValidationMessage[] = [];
  const objects = Object.values(config.objects);

  // Check: at least one object defined
  if (objects.length === 0) {
    messages.push({ severity: 'warning', message: 'No DV objects defined — staging will have no hashed columns' });
  }

  // Check: hub BK columns exist in source
  for (const obj of objects) {
    if (obj.type === 'hub') {
      const hub = obj as HubObject;
      const bks = Array.isArray(hub.srcNk) ? hub.srcNk : [hub.srcNk];
      for (const bk of bks) {
        if (!config.columns[bk]) {
          messages.push({
            severity: 'error',
            message: `Hub "${hub.name}": BK column "${bk}" not found in source columns`,
          });
        }
      }
    }
  }

  // Check: satellite payload columns exist in source
  for (const obj of objects) {
    if (obj.type === 'satellite' || obj.type === 'ma_satellite') {
      const sat = obj as SatelliteObject | MaSatelliteObject;
      for (const col of sat.srcPayload) {
        const upper = col.toUpperCase();
        if (!config.columns[upper] && !config.columns[col]) {
          messages.push({
            severity: 'warning',
            message: `Satellite "${sat.name}": payload column "${col}" not found in source`,
          });
        }
      }
    }
  }

  // Check: link FKs reference valid hubs
  for (const obj of objects) {
    if (obj.type === 'link') {
      const link = obj as LinkObject;
      for (const fk of link.srcFk) {
        const localHub = objects.find(o => o.type === 'hub' && (o as HubObject).srcPk === fk);
        if (!localHub) {
          // External hub reference — warn but don't error
          messages.push({
            severity: 'warning',
            message: `Link "${link.name}": FK "${fk}" references external hub (not in this config)`,
          });
        }
      }
    }
  }

  return messages;
}
