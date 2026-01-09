import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, dbExecute } from '@/lib/db-server'
import { logger } from '@/lib/logger'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Deploy API - Orchestriert den vollständigen Deploy-Workflow:
 * 
 * 1. staged_record (JSON) → mds_load.<entity> (strukturiert)
 * 2. dbt run → mds_master.<entity> (SCD2 historisiert)
 * 3. commit.status → 'deployed'
 * 
 * Architektur laut Plan:
 * mds_stage.staged_record (JSON, temporär)
 *    ↓ Deploy API
 * mds_load.<entity> (strukturiert, dynamisch erstellt)
 *    ↓ dbt run
 * mds_master.<entity> (SCD2 historisiert)
 *    ↓
 * mds_view.v_<entity> → Data Vault Source
 */

interface StagedRecord {
  id: number
  commit_id: number
  entity_id: number
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  business_key: string
  business_key_hash: string
  data: string // JSON
  previous_data: string | null
  created_at: string
  created_by: string
}

interface Entity {
  id: number
  code: string
  name: string
}

interface Attribute {
  id: number
  code: string
  name: string
  data_type: string
  max_length: number | null
  is_required: boolean
  is_business_key: boolean
  sort_order: number
}

// POST /api/deploy - Deploy approved commits
export async function POST(request: NextRequest) {
  logger.info('POST /api/deploy')
  
  try {
    const body = await request.json()
    const { 
      commit_ids, // Array of commit IDs to deploy
      user = 'admin'
    } = body
    
    if (!commit_ids || !Array.isArray(commit_ids) || commit_ids.length === 0) {
      return NextResponse.json(
        { error: 'commit_ids array is required' },
        { status: 400 }
      )
    }
    
    const deploymentId = uuidv4()
    const results: Array<{
      commit_id: number
      entity_id: number
      entity_name: string
      records_deployed: number
      status: 'success' | 'failed'
      error?: string
    }> = []
    
    // Process each commit
    for (const commitId of commit_ids) {
      try {
        // 1. Verify commit is approved
        const commits = await dbQuery<{ id: number; status: string; entity_id: number }>(
          `SELECT id, status, entity_id FROM mds_stage.[commit] WHERE id = @commitId`,
          { commitId }
        )
        
        if (commits.length === 0) {
          results.push({
            commit_id: commitId,
            entity_id: 0,
            entity_name: 'Unknown',
            records_deployed: 0,
            status: 'failed',
            error: 'Commit not found'
          })
          continue
        }
        
        const commit = commits[0]
        
        if (commit.status !== 'approved') {
          results.push({
            commit_id: commitId,
            entity_id: commit.entity_id,
            entity_name: 'Unknown',
            records_deployed: 0,
            status: 'failed',
            error: `Commit status is '${commit.status}', expected 'approved'`
          })
          continue
        }
        
        // 2. Get entity details
        const entities = await dbQuery<Entity>(
          `SELECT id, code, name
           FROM mds_meta.entity WHERE id = @entityId`,
          { entityId: commit.entity_id }
        )
        
        if (entities.length === 0) {
          results.push({
            commit_id: commitId,
            entity_id: commit.entity_id,
            entity_name: 'Unknown',
            records_deployed: 0,
            status: 'failed',
            error: 'Entity not found'
          })
          continue
        }
        
        const entity = entities[0]
        
        // 3. Ensure mds_load table exists for this entity
        await ensureLoadTable(entity)
        
        // 4. Get staged records for this commit
        const stagedRecords = await dbQuery<StagedRecord>(
          `SELECT id, commit_id, entity_id, operation, business_key, 
                  business_key_hash, data, previous_data, created_at, created_by
           FROM mds_stage.staged_record
           WHERE commit_id = @commitId`,
          { commitId }
        )
        
        // 5. Transfer data to mds_load table
        let recordsDeployed = 0
        for (const record of stagedRecords) {
          await transferToLoadTable(entity, record, deploymentId, user)
          recordsDeployed++
        }
        
        // 6. Update commit status to 'deployed'
        await dbExecute(
          `UPDATE mds_stage.[commit] 
           SET status = 'deployed', deployed_at = GETUTCDATE(), deployed_by = @user
           WHERE id = @commitId`,
          { commitId, user }
        )
        
        results.push({
          commit_id: commitId,
          entity_id: entity.id,
          entity_name: entity.name,
          records_deployed: recordsDeployed,
          status: 'success'
        })
        
        logger.info({ commitId, entityName: entity.name, recordsDeployed }, 'Commit deployed')
        
      } catch (error) {
        logger.error({ error, commitId }, 'Failed to deploy commit')
        results.push({
          commit_id: commitId,
          entity_id: 0,
          entity_name: 'Unknown',
          records_deployed: 0,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    // 7. Log deployment
    await dbExecute(
      `INSERT INTO mds_load.deployment_log 
       (entity_id, commit_ids, status, records_deployed, deployed_by)
       VALUES (@entityId, @commitIds, @status, @recordsDeployed, @user)`,
      {
        entityId: results[0]?.entity_id || 0,
        commitIds: commit_ids.join(','),
        status: results.every(r => r.status === 'success') ? 'completed' : 'failed',
        recordsDeployed: results.reduce((sum, r) => sum + r.records_deployed, 0),
        user
      }
    )
    
    // 8. TODO: Trigger dbt run for master table generation
    // This would be done via BullMQ job queue in production
    // await triggerDbtJob(entities, deploymentId)
    
    const totalRecords = results.reduce((sum, r) => sum + r.records_deployed, 0)
    const successCount = results.filter(r => r.status === 'success').length
    
    return NextResponse.json({
      deployment_id: deploymentId,
      commits_processed: results.length,
      commits_success: successCount,
      commits_failed: results.length - successCount,
      total_records: totalRecords,
      results,
      message: successCount === results.length 
        ? 'All commits deployed successfully'
        : `${successCount} of ${results.length} commits deployed successfully`
    })
    
  } catch (error) {
    logger.error({ error }, 'Failed to process deployment')
    return NextResponse.json(
      { error: 'Failed to process deployment', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * Ensure the mds_load table exists for the entity
 * Creates it dynamically based on entity attributes
 * Also adds any missing attribute columns if table already exists
 */
async function ensureLoadTable(entity: Entity): Promise<void> {
  const tableName = `load_${entity.code.toLowerCase()}`
  
  // Get entity attributes for DDL generation
  const attributes = await dbQuery<Attribute>(
    `SELECT id, code, name, data_type, max_length, is_required, is_business_key, sort_order
     FROM mds_meta.attribute 
     WHERE entity_id = @entityId
     ORDER BY sort_order`,
    { entityId: entity.id }
  )
  
  // Check if table exists
  const tableExists = await dbQuery<{ exists: number }>(
    `SELECT CASE WHEN EXISTS (
       SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = 'mds_load' AND TABLE_NAME = '${tableName}'
     ) THEN 1 ELSE 0 END AS [exists]`
  )
  
  if (tableExists[0].exists === 1) {
    logger.debug({ tableName: `mds_load.${tableName}` }, 'Load table already exists, checking for missing columns')
    
    // Get existing columns
    const existingColumns = await dbQuery<{ column_name: string }>(
      `SELECT COLUMN_NAME as column_name FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = 'mds_load' AND TABLE_NAME = '${tableName}'`
    )
    const existingColumnNames = new Set(existingColumns.map(c => c.column_name.toLowerCase()))
    
    // Add any missing attribute columns
    for (const attr of attributes) {
      if (!existingColumnNames.has(attr.code.toLowerCase())) {
        const colDef = getColumnDefinition(attr)
        logger.info({ tableName, column: attr.code }, 'Adding missing column to load table')
        await dbExecute(`ALTER TABLE mds_load.[${tableName}] ADD ${colDef}`)
      }
    }
    return
  }
  
  // Generate CREATE TABLE DDL
  const ddl = generateLoadTableDDL(entity, attributes)
  
  logger.info({ tableName, ddl }, 'Creating load table')
  await dbExecute(ddl)
}

/**
 * Get SQL column definition for an attribute
 */
function getColumnDefinition(attr: Attribute): string {
  let colDef = `[${attr.code}] `
  
  switch (attr.data_type.toUpperCase()) {
    case 'STRING':
    case 'TEXT':
    case 'NVARCHAR':
      colDef += `NVARCHAR(${attr.max_length || 'MAX'})`
      break
    case 'INT':
    case 'INTEGER':
      colDef += 'INT'
      break
    case 'BIGINT':
      colDef += 'BIGINT'
      break
    case 'DECIMAL':
    case 'NUMBER':
      colDef += 'DECIMAL(18,6)'
      break
    case 'DATE':
      colDef += 'DATE'
      break
    case 'DATETIME':
      colDef += 'DATETIME2'
      break
    case 'BOOLEAN':
    case 'BIT':
      colDef += 'BIT'
      break
    case 'REFERENCE':
      // Reference is stored as the foreign key value (typically string or int)
      colDef += 'NVARCHAR(500)'
      break
    default:
      colDef += 'NVARCHAR(MAX)'
  }
  
  return colDef
}

/**
 * Generate CREATE TABLE DDL for entity load table
 */
function generateLoadTableDDL(entity: Entity, attributes: Attribute[]): string {
  const columns: string[] = [
    'load_id BIGINT IDENTITY(1,1) PRIMARY KEY',
    'business_key NVARCHAR(500) NOT NULL',
    'business_key_hash CHAR(64) NOT NULL',
    'operation NVARCHAR(10) NOT NULL', // INSERT, UPDATE, DELETE
  ]
  
  // Add attribute columns using the helper function
  for (const attr of attributes) {
    // For load tables, all attribute columns are nullable
    // since data may be incomplete in staging
    // NOT NULL constraints are enforced in master tables (dbt)
    columns.push(getColumnDefinition(attr))
  }
  
  // Add metadata columns
  columns.push(
    'deployment_id NVARCHAR(100)',
    'source_staged_record_id BIGINT',
    'load_user NVARCHAR(100) NOT NULL',
    'load_timestamp DATETIME2 DEFAULT GETUTCDATE()',
    'is_processed BIT DEFAULT 0'
  )
  
  const tableName = `load_${entity.code.toLowerCase()}`
  
  return `
    CREATE TABLE mds_load.[${tableName}] (
      ${columns.join(',\n      ')}
    );
    
    CREATE INDEX IX_${tableName}_business_key ON mds_load.[${tableName}](business_key);
    CREATE INDEX IX_${tableName}_business_key_hash ON mds_load.[${tableName}](business_key_hash);
    CREATE INDEX IX_${tableName}_is_processed ON mds_load.[${tableName}](is_processed);
  `
}

/**
 * Transfer a staged record to the entity's load table
 */
async function transferToLoadTable(
  entity: Entity, 
  record: StagedRecord, 
  deploymentId: string,
  user: string
): Promise<void> {
  const tableName = `mds_load.load_${entity.code.toLowerCase()}`
  
  // Parse JSON data
  const data = JSON.parse(record.data || '{}')
  
  // Get entity attributes
  const attributes = await dbQuery<{ code: string }>(
    `SELECT code FROM mds_meta.attribute 
     WHERE entity_id = @entityId
     ORDER BY sort_order`,
    { entityId: entity.id }
  )
  
  // Build INSERT statement dynamically
  const columns = ['business_key', 'business_key_hash', 'operation']
  const values = ['@business_key', '@business_key_hash', '@operation']
  const params: Record<string, unknown> = {
    business_key: record.business_key,
    business_key_hash: record.business_key_hash,
    operation: record.operation
  }
  
  // Add attribute values from JSON
  for (const attr of attributes) {
    columns.push(`[${attr.code}]`)
    values.push(`@attr_${attr.code}`)
    params[`attr_${attr.code}`] = data[attr.code] ?? null
  }
  
  // Add metadata
  columns.push('deployment_id', 'source_staged_record_id', 'load_user')
  values.push('@deployment_id', '@source_id', '@load_user')
  params.deployment_id = deploymentId
  params.source_id = record.id
  params.load_user = user
  
  const sql = `
    INSERT INTO ${tableName} (${columns.join(', ')})
    VALUES (${values.join(', ')})
  `
  
  await dbExecute(sql, params)
}

// GET /api/deploy - Get deployment history
export async function GET(request: NextRequest) {
  logger.info('GET /api/deploy')
  
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    
    const deployments = await dbQuery<{
      id: number
      entity_id: number
      commit_ids: string
      status: string
      records_deployed: number
      started_at: string
      completed_at: string
      deployed_by: string
    }>(
      `SELECT TOP (@limit) *
       FROM mds_load.deployment_log
       ORDER BY started_at DESC`,
      { limit }
    )
    
    return NextResponse.json({
      data: deployments,
      total: deployments.length
    })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch deployment history')
    return NextResponse.json(
      { error: 'Failed to fetch deployment history' },
      { status: 500 }
    )
  }
}
