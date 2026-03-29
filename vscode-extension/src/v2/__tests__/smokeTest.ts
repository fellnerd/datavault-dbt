/**
 * Quick validation test for Entity Designer v2 core logic.
 * Run: npx ts-node src/v2/__tests__/smokeTest.ts
 */

import {
  EntityConfigV2,
  HubObject,
  SatelliteObject,
  LinkObject,
  EntityConfigV1,
} from '../types';
import { deriveStagingSql } from '../services/stagingDeriver';
import { generateSql, generateCurrentViewSql } from '../services/templateEngine';
import { validateConfig, generateAll } from '../services/entityGeneratorV2';
import { migrateV1toV2 } from '../services/configStoreV2';

// ─── Test Config: hub_projekt + sat_projekt__abacus ──────────

const testConfig: EntityConfigV2 = {
  version: 2,
  concept: '_common',
  sourceSystem: 'ewb_abacus',
  sourceTable: 'ext_ewb_proj_npo_main',
  stagingModel: 'ewb_proj_npo_main',
  objects: {
    hub_projekt: {
      type: 'hub',
      name: 'hub_projekt',
      sourceModel: 'ewb_proj_npo_main',
      srcPk: 'hk_projekt',
      srcNk: 'PROJNR',
      srcExtraColumns: ['dss_business_key', 'dss_create_datetime'],
    } as HubObject,
    sat_projekt__abacus: {
      type: 'satellite',
      name: 'sat_projekt__abacus',
      sourceModel: 'ewb_proj_npo_main',
      srcPk: 'hk_projekt',
      srcHashdiff: { sourceColumn: 'hd_projekt', alias: 'HASHDIFF' },
      srcPayload: ['refprojnr', 'inaktiv', 'projgroup', 'projname', 'statusdef', 'status', 'status1', 'creation'],
      srcExtraColumns: ['dss_create_datetime'],
      parentHub: 'hub_projekt',
      generateCurrentView: true,
    } as SatelliteObject,
  },
  columns: {
    PROJNR: { sourceName: 'PROJNR', dataType: 'DECIMAL(38,18)', nullable: false },
    REFPROJNR: { sourceName: 'REFPROJNR', dataType: 'DECIMAL(38,18)', nullable: true },
    INAKTIV: { sourceName: 'INAKTIV', dataType: 'DECIMAL(38,18)', nullable: true },
    PROJGROUP: { sourceName: 'PROJGROUP', dataType: 'DECIMAL(38,18)', nullable: true },
    PROJNAME: { sourceName: 'PROJNAME', dataType: 'NVARCHAR(4000)', nullable: true },
    STATUSDEF: { sourceName: 'STATUSDEF', dataType: 'NVARCHAR(4000)', nullable: true },
    STATUS: { sourceName: 'STATUS', dataType: 'NVARCHAR(4000)', nullable: true, reservedKeyword: true },
    STATUS1: { sourceName: 'STATUS1', dataType: 'NVARCHAR(4000)', nullable: true },
    CREATION: { sourceName: 'CREATION', dataType: 'DATE', nullable: true },
  },
  reservedKeywords: ['STATUS'],
  savedAt: new Date().toISOString(),
};

// ─── Tests ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

console.log('\n🧪 Entity Designer v2 — Smoke Tests\n');

// Test 1: Validation
console.log('1. Config Validation');
const validation = validateConfig(testConfig);
assert(validation.valid, 'Config is valid');
assert(validation.messages.length === 0, `No errors (got ${validation.messages.length})`);

// Test 2: Staging derivation
console.log('\n2. Staging SQL Derivation');
const stagingSql = deriveStagingSql(testConfig);
assert(stagingSql.includes('automate_dv.stage'), 'Uses automate_dv.stage() macro');
assert(stagingSql.includes('ext_ewb_proj_npo_main'), 'References source table');
assert(stagingSql.includes('hk_projekt'), 'Contains hub hash key');
assert(stagingSql.includes('hd_projekt'), 'Contains hashdiff');
assert(stagingSql.includes('!ewb_abacus'), 'Has dss_record_source');
assert(stagingSql.includes('STATUS'), 'Contains STATUS in _escape');
assert(stagingSql.includes('timestamp_landing-zone'), 'Contains timestamp_landing-zone in _escape');
assert(stagingSql.includes('is_hashdiff: true'), 'Hashdiff marked correctly');

// Test 3: Hub SQL generation
console.log('\n3. Hub SQL Generation');
const hubSql = generateSql(testConfig.objects.hub_projekt);
assert(hubSql.includes('automate_dv.hub'), 'Uses automate_dv.hub() macro');
assert(hubSql.includes('hk_projekt'), 'Has hash key');
assert(hubSql.includes('projnr'), 'Has natural key (lowercased)');
assert(hubSql.includes("materialized='incremental'"), 'Is incremental');
assert(hubSql.includes('as_columnstore=false'), 'No columnstore');
assert(hubSql.includes('create_hash_index'), 'Has post_hook');
assert(hubSql.includes('dss_business_key'), 'Has extra columns');

// Test 4: Satellite SQL generation
console.log('\n4. Satellite SQL Generation');
const satSql = generateSql(testConfig.objects.sat_projekt__abacus);
assert(satSql.includes('automate_dv.sat'), 'Uses automate_dv.sat() macro');
assert(satSql.includes('hk_projekt'), 'Has parent hub FK');
assert(satSql.includes('hd_projekt'), 'Has hashdiff');
assert(satSql.includes('HASHDIFF'), 'Hashdiff alias is HASHDIFF');
assert(satSql.includes('update_satellite_current_flag'), 'Has current flag post_hook');
assert(satSql.includes('refprojnr'), 'Has payload column');

// Test 5: Current View generation
console.log('\n5. Current View Generation');
const viewSql = generateCurrentViewSql(testConfig.objects.sat_projekt__abacus as SatelliteObject);
assert(viewSql.includes('satellite_current_view'), 'Uses satellite_current_view macro');
assert(viewSql.includes('sat_projekt__abacus'), 'References satellite model');
assert(viewSql.includes('hk_projekt'), 'References hash key column');

// Test 6: Full generation (dry run)
console.log('\n6. Full Generation (dry run)');
const result = generateAll(testConfig, { projectPath: '/tmp/test', writeToDisk: false });
assert(result.success || result.errors.length === 0, `Generation ${result.success ? 'succeeded' : 'failed'}`);
assert(result.files.length >= 4, `Generated ${result.files.length} files (expected ≥4)`);
const fileTypes = result.files.map(f => f.fileType);
assert(fileTypes.includes('staging'), 'Has staging file');
assert(fileTypes.includes('hub'), 'Has hub file');
assert(fileTypes.includes('satellite'), 'Has satellite file');
assert(fileTypes.includes('current_view'), 'Has current view file');

// Test 7: v1 → v2 migration
console.log('\n7. v1 → v2 Migration');
const v1Config: EntityConfigV1 = {
  concept: '_common',
  entityName: 'projekt',
  sourceTable: 'ext_ewb_proj_npo_main',
  columns: [
    { name: 'PROJNR', sourceName: 'PROJNR', dataType: 'DECIMAL(38,18)', columnType: 'hub', includeInHashDiff: false, nullable: false },
    { name: 'PROJNAME', sourceName: 'PROJNAME', dataType: 'NVARCHAR(4000)', columnType: 'satellite', includeInHashDiff: true, nullable: true },
    { name: 'STATUS', sourceName: 'STATUS', dataType: 'NVARCHAR(4000)', columnType: 'satellite', includeInHashDiff: true, nullable: true },
  ],
  savedAt: '2025-01-01T00:00:00.000Z',
};
const migrated = migrateV1toV2(v1Config);
assert(migrated.version === 2, 'Migrated to version 2');
assert(migrated.sourceSystem === 'ewb_abacus', 'Detected source system');
assert('hub_projekt' in migrated.objects, 'Created hub object');
assert(Object.values(migrated.objects).some(o => o.type === 'satellite'), 'Created satellite object');
assert(migrated.reservedKeywords.includes('STATUS'), 'Detected STATUS as reserved keyword');

// Summary
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'─'.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
