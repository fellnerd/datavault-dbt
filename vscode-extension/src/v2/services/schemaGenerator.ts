/**
 * Schema Generator
 * 
 * Generates _staging__models.yml and _common__models.yml entries
 * for all DV objects in an EntityConfigV2.
 */

import {
  EntityConfigV2,
} from '../types';
import {
  DvObject,
  HubObject,
  SatelliteObject,
  LinkObject,
  MaSatelliteObject,
  DcSatelliteObject,
  ReferenceObject,
} from '../types';

// ─── Staging Schema Entry ───────────────────────────────────

export function generateStagingSchemaEntry(config: EntityConfigV2): string {
  const hubs = Object.values(config.objects).filter(o => o.type === 'hub') as HubObject[];
  const hub = hubs[0]; // Primary hub for this staging model
  if (!hub) { return ''; }

  const bks = Array.isArray(hub.srcNk) ? hub.srcNk : [hub.srcNk];
  const entityName = hub.name.replace('hub_', '');

  // Determine entity_type
  const hasMa = Object.values(config.objects).some(o => o.type === 'ma_satellite');
  const hasDc = Object.values(config.objects).some(o => o.type === 'dc_satellite');
  let entityType = 'standard';
  if (hasMa) { entityType = 'multi_active'; }
  else if (hasDc) { entityType = 'dependent_child'; }

  const lines: string[] = [];
  lines.push(`  - name: ${config.stagingModel}`);
  lines.push(`    description: "Staging: ${config.sourceTable.replace('ext_', '').replace(/_/g, '.')}"`);
  lines.push(`    config:`);
  lines.push(`      meta:`);
  lines.push(`        entity_type: ${entityType}`);
  lines.push(`        source_type: external_table`);
  lines.push(`        external_table: ${config.sourceTable}`);
  lines.push(`        business_keys:`);
  for (const bk of bks) {
    lines.push(`          - ${bk}`);
  }

  // Foreign keys (from links)
  const links = Object.values(config.objects).filter(o => o.type === 'link') as LinkObject[];
  if (links.length > 0) {
    lines.push(`        foreign_keys:`);
    for (const link of links) {
      for (const fk of link.srcFk) {
        if (fk === hub.srcPk) { continue; } // Skip self-reference
        const targetEntity = fk.replace('hk_', '');
        lines.push(`          - column: ${fk}`);
        lines.push(`            target_entity: ${targetEntity}`);
        lines.push(`            target_hub: hub_${targetEntity}`);
      }
    }
  }

  // Column tests
  lines.push(`    columns:`);

  // Hash Key tests
  lines.push(`      - name: ${hub.srcPk}`);
  lines.push(`        description: "Hash Key (SHA2_256)"`);
  lines.push(`        tests:`);
  lines.push(`          - not_null`);
  lines.push(`          - unique`);

  // Hash Diff tests (per satellite)
  const sats = Object.values(config.objects).filter(o =>
    o.type === 'satellite' || o.type === 'ma_satellite' || o.type === 'dc_satellite'
  ) as (SatelliteObject | MaSatelliteObject | DcSatelliteObject)[];
  
  for (const sat of sats) {
    lines.push(`      - name: ${sat.srcHashdiff.sourceColumn}`);
    lines.push(`        description: "Hash Diff (SHA2_256)"`);
    lines.push(`        tests:`);
    lines.push(`          - not_null`);
  }

  // Business Key tests
  for (const bk of bks) {
    lines.push(`      - name: ${bk}`);
    lines.push(`        tests:`);
    lines.push(`          - not_null`);
  }

  // Metadata column tests
  lines.push(`      - name: dss_record_source`);
  lines.push(`        tests:`);
  lines.push(`          - not_null`);
  lines.push(`      - name: dss_load_date`);
  lines.push(`        tests:`);
  lines.push(`          - not_null`);

  return lines.join('\n');
}

// ─── Vault Schema Entries ───────────────────────────────────

export function generateVaultSchemaEntry(obj: DvObject, concept: string): string {
  const lines: string[] = [];

  switch (obj.type) {
    case 'hub': {
      const hub = obj as HubObject;
      const bks = Array.isArray(hub.srcNk) ? hub.srcNk : [hub.srcNk];
      lines.push(`  - name: ${hub.name}`);
      lines.push(`    description: "Hub: ${hub.name.replace('hub_', '')} (BK: ${bks.join(', ')})"`);
      lines.push(`    columns:`);
      lines.push(`      - name: ${hub.srcPk}`);
      lines.push(`        description: "Hash Key (PK)"`);
      lines.push(`        tests:`);
      lines.push(`          - not_null`);
      lines.push(`          - unique`);
      for (const bk of bks) {
        lines.push(`      - name: ${bk.toLowerCase()}`);
        lines.push(`        description: "Business Key"`);
        lines.push(`        tests:`);
        lines.push(`          - not_null`);
      }
      break;
    }

    case 'satellite': {
      const sat = obj as SatelliteObject;
      lines.push(`  - name: ${sat.name}`);
      lines.push(`    description: "Satellite: ${sat.name} (Parent: ${sat.parentHub})"`);
      lines.push(`    columns:`);
      lines.push(`      - name: ${sat.srcPk}`);
      lines.push(`        description: "Hash Key (FK to ${sat.parentHub})"`);
      lines.push(`        tests:`);
      lines.push(`          - not_null`);
      lines.push(`      - name: HASHDIFF`);
      lines.push(`        description: "Hash Diff (change detection)"`);
      lines.push(`        tests:`);
      lines.push(`          - not_null`);
      break;
    }

    case 'link': {
      const link = obj as LinkObject;
      lines.push(`  - name: ${link.name}`);
      lines.push(`    description: "Link: ${link.name} (FKs: ${link.srcFk.join(', ')})"`);
      lines.push(`    columns:`);
      lines.push(`      - name: ${link.srcPk}`);
      lines.push(`        description: "Link Hash Key (PK)"`);
      lines.push(`        tests:`);
      lines.push(`          - not_null`);
      lines.push(`          - unique`);
      for (const fk of link.srcFk) {
        lines.push(`      - name: ${fk}`);
        lines.push(`        description: "FK to ${fk.replace('hk_', 'hub_')}"`);
        lines.push(`        tests:`);
        lines.push(`          - not_null`);
      }
      break;
    }

    case 'reference': {
      const ref = obj as ReferenceObject;
      const pks = Array.isArray(ref.primaryKey) ? ref.primaryKey : [ref.primaryKey];
      lines.push(`  - name: ${ref.name}`);
      lines.push(`    description: "Reference Table: ${ref.name}"`);
      lines.push(`    columns:`);
      for (const pk of pks) {
        lines.push(`      - name: ${pk.toLowerCase()}`);
        lines.push(`        description: "Primary Key"`);
        lines.push(`        tests:`);
        lines.push(`          - not_null`);
        lines.push(`          - unique`);
      }
      break;
    }

    default:
      lines.push(`  - name: ${obj.name}`);
      lines.push(`    description: "${obj.type}: ${obj.name}"`);
  }

  return lines.join('\n');
}

// ─── Current View Schema Entry ──────────────────────────────

export function generateCurrentViewSchemaEntry(satName: string): string {
  return [
    `  - name: ${satName}_current_v`,
    `    description: "Current view for ${satName}"`,
  ].join('\n');
}
