/**
 * Data Vault 2.1 Object Type Definitions
 * 
 * Maps 1:1 to automate_dv macro parameters.
 * Each interface represents one DV object type with its exact
 * automate_dv macro parameter set + our convention extensions.
 */

// ─── DV Object Types ─────────────────────────────────────────

export type DvObjectType =
  | 'hub'
  | 'satellite'
  | 'link'
  | 'ma_satellite'
  | 'dc_satellite'
  | 't_link'
  | 'eff_satellite'
  | 'reference'
  | 'pit'
  | 'bridge'
  | 'xts';

export type GenerationPriority = 'P1' | 'P2' | 'P3';

// ─── Base Interface (shared by all vault objects) ────────────

export interface DvObjectBase {
  type: DvObjectType;
  /** Object name without schema, e.g. "hub_projekt" */
  name: string;
  /** Source staging model name, e.g. "ewb_proj_npo_main" */
  sourceModel: string;
  /** Convention: always "dss_load_date" */
  srcLdts?: string;
  /** Convention: always "dss_record_source" */
  srcSource?: string;
}

// ─── Hub ─────────────────────────────────────────────────────
// automate_dv.hub(src_pk, src_nk, src_extra_columns, src_ldts, src_source, source_model)

export interface HubObject extends DvObjectBase {
  type: 'hub';
  /** Hash key column name, e.g. "hk_projekt" — auto-derived from entity name */
  srcPk: string;
  /** Natural/Business key column(s), e.g. ["PROJNR"] or ["PROJNR", "CODE"] */
  srcNk: string | string[];
  /** Convention: ["dss_business_key", "dss_create_datetime"] */
  srcExtraColumns?: string[];
}

// ─── Satellite ───────────────────────────────────────────────
// automate_dv.sat(src_pk, src_hashdiff, src_payload, src_extra_columns, src_eff, src_ldts, src_source, source_model)

export interface HashdiffConfig {
  sourceColumn: string;
  /** Convention: always "HASHDIFF" */
  alias: string;
}

export interface SatelliteObject extends DvObjectBase {
  type: 'satellite';
  /** FK to parent Hub hash key, e.g. "hk_projekt" */
  srcPk: string;
  /** Hash diff configuration */
  srcHashdiff: HashdiffConfig;
  /** Payload attribute columns (lowercased in generated SQL) */
  srcPayload: string[];
  /** Convention: ["dss_create_datetime"] */
  srcExtraColumns?: string[];
  /** Optional effective date column */
  srcEff?: string;
  /** Parent hub object name, e.g. "hub_projekt" */
  parentHub: string;
  /** Generate a _current_v view alongside? Default: true */
  generateCurrentView?: boolean;
}

// ─── Link ────────────────────────────────────────────────────
// automate_dv.link(src_pk, src_fk, src_extra_columns, src_ldts, src_source, source_model)

export interface LinkObject extends DvObjectBase {
  type: 'link';
  /** Link hash key, e.g. "hk_link_zeiterfassung_person" */
  srcPk: string;
  /** Foreign keys to hub hash keys, e.g. ["hk_zeiterfassung", "hk_person"] */
  srcFk: string[];
  srcExtraColumns?: string[];
}

// ─── Multi-Active Satellite ──────────────────────────────────
// automate_dv.ma_sat(src_pk, src_cdk, src_hashdiff, src_payload, src_extra_columns, src_eff, src_ldts, src_source, source_model)

export interface MaSatelliteObject extends DvObjectBase {
  type: 'ma_satellite';
  srcPk: string;
  /** Child Dependent Key(s) — distinguishes multiple active records */
  srcCdk: string | string[];
  srcHashdiff: HashdiffConfig;
  srcPayload: string[];
  srcExtraColumns?: string[];
  srcEff?: string;
  parentHub: string;
  generateCurrentView?: boolean;
}

// ─── DC Satellite (Dependent Child on Link) ──────────────────
// Uses automate_dv.sat() but attached to a Link instead of Hub

export interface DcSatelliteObject extends DvObjectBase {
  type: 'dc_satellite';
  /** FK to parent Link hash key */
  srcPk: string;
  srcHashdiff: HashdiffConfig;
  /** Includes DCK columns + attributes */
  srcPayload: string[];
  srcExtraColumns?: string[];
  /** Parent link object name, e.g. "link_beleg_lieferant" */
  parentLink: string;
  generateCurrentView?: boolean;
}

// ─── Transactional Link ──────────────────────────────────────
// automate_dv.t_link(src_pk, src_fk, src_payload, src_extra_columns, src_eff, src_ldts, src_source, source_model)

export interface TLinkObject extends DvObjectBase {
  type: 't_link';
  srcPk: string;
  srcFk: string[];
  srcPayload?: string[];
  srcExtraColumns?: string[];
  /** Transaction date — required for t_link */
  srcEff: string;
}

// ─── Effectivity Satellite ───────────────────────────────────
// automate_dv.eff_sat(src_pk, src_dfk, src_sfk, src_extra_columns, src_start_date, src_end_date, src_eff, src_ldts, src_source, source_model)

export interface EffSatelliteObject extends DvObjectBase {
  type: 'eff_satellite';
  /** Link hash key */
  srcPk: string;
  /** Driver Foreign Key — entity whose relationships change */
  srcDfk: string | string[];
  /** Secondary Foreign Key — the related entity */
  srcSfk: string | string[];
  srcExtraColumns?: string[];
  srcStartDate: string;
  srcEndDate: string;
  srcEff: string;
}

// ─── Reference Table ─────────────────────────────────────────
// No automate_dv macro — custom SQL

export interface ReferenceObject extends DvObjectBase {
  type: 'reference';
  /** Primary key column(s) */
  primaryKey: string | string[];
  /** Display/attribute columns */
  columns: string[];
  /** Optional WHERE filter, e.g. "DATASET = 2" */
  filter?: string;
  /** Use SELECT DISTINCT? */
  distinct?: boolean;
}

// ─── PIT (Point-in-Time) ────────────────────────────────────
// automate_dv.pit(src_pk, src_extra_columns, as_of_dates_table, satellites, stage_tables_ldts, src_ldts, source_model)

export interface PitSatelliteRef {
  pk: Record<string, string>;
  ldts: Record<string, string>;
}

export interface PitObject extends DvObjectBase {
  type: 'pit';
  srcPk: string;
  srcExtraColumns?: string[];
  asOfDatesTable: string;
  satellites: Record<string, PitSatelliteRef>;
  stageTablesLdts: string[];
}

// ─── Bridge ──────────────────────────────────────────────────
// automate_dv.bridge(src_pk, src_extra_columns, as_of_dates_table, bridge_walk, stage_tables_ldts, src_ldts, source_model)

export interface BridgeStep {
  bridgeLinkPk: string;
  bridgeLoadDate: string;
  bridgeEndDate: string;
}

export interface BridgeObject extends DvObjectBase {
  type: 'bridge';
  srcPk: string;
  srcExtraColumns?: string[];
  asOfDatesTable: string;
  bridgeWalk: Record<string, BridgeStep>;
  stageTablesLdts: string[];
}

// ─── XTS (Extended Tracked Set) ──────────────────────────────
// automate_dv.xts(src_pk, src_satellite, src_extra_columns, src_ldts, src_source, source_model)

export interface XtsSatelliteRef {
  satName: Record<string, string>;
  hashdiff: Record<string, string>;
}

export interface XtsObject extends DvObjectBase {
  type: 'xts';
  srcPk: string;
  srcSatellite: Record<string, XtsSatelliteRef>;
  srcExtraColumns?: string[];
}

// ─── Union Type ──────────────────────────────────────────────

export type DvObject =
  | HubObject
  | SatelliteObject
  | LinkObject
  | MaSatelliteObject
  | DcSatelliteObject
  | TLinkObject
  | EffSatelliteObject
  | ReferenceObject
  | PitObject
  | BridgeObject
  | XtsObject;

// ─── Type Guards ─────────────────────────────────────────────

export function isHub(obj: DvObject): obj is HubObject { return obj.type === 'hub'; }
export function isSatellite(obj: DvObject): obj is SatelliteObject { return obj.type === 'satellite'; }
export function isLink(obj: DvObject): obj is LinkObject { return obj.type === 'link'; }
export function isMaSatellite(obj: DvObject): obj is MaSatelliteObject { return obj.type === 'ma_satellite'; }
export function isDcSatellite(obj: DvObject): obj is DcSatelliteObject { return obj.type === 'dc_satellite'; }
export function isTLink(obj: DvObject): obj is TLinkObject { return obj.type === 't_link'; }
export function isEffSatellite(obj: DvObject): obj is EffSatelliteObject { return obj.type === 'eff_satellite'; }
export function isReference(obj: DvObject): obj is ReferenceObject { return obj.type === 'reference'; }
export function isPit(obj: DvObject): obj is PitObject { return obj.type === 'pit'; }
export function isBridge(obj: DvObject): obj is BridgeObject { return obj.type === 'bridge'; }
export function isXts(obj: DvObject): obj is XtsObject { return obj.type === 'xts'; }

/** Objects that produce hash keys in staging */
export function hasHashKey(obj: DvObject): obj is HubObject | LinkObject | TLinkObject {
  return obj.type === 'hub' || obj.type === 'link' || obj.type === 't_link';
}

/** Objects that produce hash diffs in staging */
export function hasHashdiff(obj: DvObject): obj is SatelliteObject | MaSatelliteObject | DcSatelliteObject {
  return obj.type === 'satellite' || obj.type === 'ma_satellite' || obj.type === 'dc_satellite';
}

/** Objects attached to a Hub */
export function isHubChild(obj: DvObject): obj is SatelliteObject | MaSatelliteObject {
  return obj.type === 'satellite' || obj.type === 'ma_satellite';
}

/** Objects that are incremental (all vault tables) */
export function isIncremental(obj: DvObject): boolean {
  return obj.type !== 'reference';
}
