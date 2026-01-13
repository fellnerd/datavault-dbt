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
      business_key: providedBusinessKey,
      data,
      created_by = 'admin'
    } = body
    
    if (!entity_id || !data) {
      return NextResponse.json(
        { error: 'entity_id and data are required' },
        { status: 400 }
      )
    }
    
    // Check if entity exists and get business key attribute
    const entity = await dbQuery<{ id: number; code: string }>(
      'SELECT id, code FROM [mds_meta].[entity] WHERE id = @entityId',
      { entityId: entity_id }
    )
    if (entity.length === 0) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      )
    }
    
    // Get business key attribute for this entity
    const bkAttribute = await dbQuery<{ code: string }>(
      `SELECT code FROM [mds_meta].[attribute] 
       WHERE entity_id = @entityId AND is_business_key = 1`,
      { entityId: entity_id }
    )
    
    // Extract business_key from data if not provided
    let business_key = providedBusinessKey
    if (!business_key && bkAttribute.length > 0) {
      const bkCode = bkAttribute[0].code
      business_key = data[bkCode]
    }
    
    if (!business_key) {
      return NextResponse.json(
        { error: 'business_key is required (either directly or in data with a business key attribute)' },
        { status: 400 }
      )
    }
    
    // Calculate business key hash
    const dataJson = JSON.stringify(data)
    
    // Create staged_record WITHOUT commit_id - commit is assigned later when user clicks "Commit"
    await dbExecute(
      `INSERT INTO [mds_stage].[staged_record] 
        (entity_id, operation, business_key, business_key_hash, payload, data, status, created_by)
       VALUES (
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
        entityId: entity_id,
        operation,
        businessKey: business_key,
        data: dataJson,
        user: created_by 
      }
    )
    
    // Fetch the created record
    const created = await dbQuery<StagedRecord>(
      `SELECT TOP 1 r.*, e.code AS entity_code, e.name AS entity_name
       FROM [mds_stage].[staged_record] r
       INNER JOIN [mds_meta].[entity] e ON e.id = r.entity_id
       WHERE r.entity_id = @entityId AND r.business_key = @businessKey
       ORDER BY r.id DESC`,
      { entityId: entity_id, businessKey: business_key }
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
