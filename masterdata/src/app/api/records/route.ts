import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, dbExecute } from '@/lib/db-server'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface StagedRecord {
  id: number
  commit_id: number
  entity_id: number
  entity_code?: string
  entity_name?: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  business_key: string
  business_key_hash: string
  data: string // JSON string
  previous_data: string | null
  validation_status: string
  validation_errors: string | null
  created_at: string
  created_by: string
}

// GET /api/records - List staged records
export async function GET(request: NextRequest) {
  logger.info('GET /api/records')
  
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entity_id')
    const commitId = searchParams.get('commit_id')
    const status = searchParams.get('status')
    
    let sql = `
      SELECT 
        r.id,
        r.commit_id,
        r.entity_id,
        e.code AS entity_code,
        e.name AS entity_name,
        r.operation,
        r.business_key,
        r.business_key_hash,
        r.data,
        r.previous_data,
        r.status AS validation_status,
        r.validation_errors,
        r.created_at,
        r.created_by
      FROM [mds_stage].[staged_record] r
      INNER JOIN [mds_meta].[entity] e ON e.id = r.entity_id
      WHERE 1=1
    `
    
    const params: Record<string, unknown> = {}
    
    if (entityId) {
      sql += ` AND r.entity_id = @entityId`
      params.entityId = parseInt(entityId)
    }
    
    if (commitId) {
      sql += ` AND r.commit_id = @commitId`
      params.commitId = parseInt(commitId)
    }
    
    if (status) {
      sql += ` AND r.status = @status`
      params.status = status
    }
    
    sql += ` ORDER BY r.created_at DESC`
    
    const results = await dbQuery<StagedRecord>(sql, params)
    
    // Parse JSON data for each record
    const records = results.map(r => ({
      ...r,
      data: r.data ? JSON.parse(r.data) : {},
      previous_data: r.previous_data ? JSON.parse(r.previous_data) : null
    }))
    
    // Compute summary stats
    const draft = records.filter(r => r.validation_status === 'pending').length
    const validated = records.filter(r => r.validation_status === 'valid').length
    const invalid = records.filter(r => r.validation_status === 'invalid').length
    
    return NextResponse.json({
      data: records,
      total: records.length,
      summary: {
        total: records.length,
        draft,
        validated,
        invalid
      }
    })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch records')
    return NextResponse.json(
      { error: 'Failed to fetch records', details: String(error) },
      { status: 500 }
    )
  }
}

// POST /api/records - Create new staged record
export async function POST(request: NextRequest) {
  logger.info('POST /api/records')
  
  try {
    const body = await request.json()
    const { 
      entity_id, 
      operation = 'INSERT',
      business_key,
      data,
      created_by = 'admin'
    } = body
    
    if (!entity_id || !business_key || !data) {
      return NextResponse.json(
        { error: 'entity_id, business_key and data are required' },
        { status: 400 }
      )
    }
    
    // Check if entity exists
    const entity = await dbQuery<{ id: number }>(
      'SELECT id FROM [mds_meta].[entity] WHERE id = @entityId',
      { entityId: entity_id }
    )
    if (entity.length === 0) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      )
    }
    
    // Get or create a pending commit for this entity
    let commit = await dbQuery<{ id: number }>(
      `SELECT id FROM [mds_stage].[commit] 
       WHERE entity_id = @entityId AND status = 'pending'`,
      { entityId: entity_id }
    )
    
    let commitId: number
    if (commit.length === 0) {
      // Create new pending commit with auto-generated code
      const commitCode = `COMMIT-${entity_id}-${Date.now()}`
      await dbExecute(
        `INSERT INTO [mds_stage].[commit] (code, entity_id, status, record_count, created_by)
         VALUES (@code, @entityId, 'pending', 0, @user)`,
        { code: commitCode, entityId: entity_id, user: created_by }
      )
      const newCommit = await dbQuery<{ id: number }>(
        `SELECT id FROM [mds_stage].[commit] 
         WHERE entity_id = @entityId AND status = 'pending'
         ORDER BY id DESC`,
        { entityId: entity_id }
      )
      commitId = newCommit[0].id
    } else {
      commitId = commit[0].id
    }
    
    // Calculate business key hash
    const dataJson = JSON.stringify(data)
    
    await dbExecute(
      `INSERT INTO [mds_stage].[staged_record] 
        (commit_id, entity_id, operation, business_key, business_key_hash, payload, data, status, created_by)
       VALUES (
         @commitId, 
         @entityId, 
         @operation, 
         @businessKey, 
         CONVERT(CHAR(64), HASHBYTES('SHA2_256', @businessKey), 2),
         @data,
         @data, 
         'pending', 
         @user
       )`,
      { 
        commitId,
        entityId: entity_id,
        operation,
        businessKey: business_key,
        data: dataJson,
        user: created_by 
      }
    )
    
    // Update record_count in the commit
    await dbExecute(
      `UPDATE [mds_stage].[commit] 
       SET record_count = (SELECT COUNT(*) FROM [mds_stage].[staged_record] WHERE commit_id = @commitId)
       WHERE id = @commitId`,
      { commitId }
    )
    
    // Fetch the created record
    const created = await dbQuery<StagedRecord>(
      `SELECT TOP 1 r.*, e.code AS entity_code, e.name AS entity_name
       FROM [mds_stage].[staged_record] r
       INNER JOIN [mds_meta].[entity] e ON e.id = r.entity_id
       WHERE r.commit_id = @commitId AND r.business_key = @businessKey
       ORDER BY r.id DESC`,
      { commitId, businessKey: business_key }
    )
    
    return NextResponse.json({
      ...created[0],
      data: JSON.parse(created[0].data),
      previous_data: created[0].previous_data ? JSON.parse(created[0].previous_data) : null
    }, { status: 201 })
  } catch (error) {
    logger.error({ error }, 'Failed to create record')
    return NextResponse.json(
      { error: 'Failed to create record', details: String(error) },
      { status: 500 }
    )
  }
}
