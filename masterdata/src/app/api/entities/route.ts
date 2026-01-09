import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, dbExecute } from '@/lib/db-server'
import { logger } from '@/lib/logger'

// Force Node.js runtime (not Edge)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Types matching database schema
export interface Entity {
  id: number
  model_id: number
  model_code?: string
  model_name?: string
  code: string
  name: string
  description: string | null
  source_table: string | null
  staging_view: string | null
  hub_name: string | null
  is_deployed: boolean
  last_deployed_at: string | null
  record_count: number | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  // Computed fields
  attribute_count?: number
}

// GET /api/entities - List all entities
export async function GET(request: NextRequest) {
  logger.info('GET /api/entities')
  
  try {
    const { searchParams } = new URL(request.url)
    const modelId = searchParams.get('model_id')
    
    let sql = `
      SELECT 
        e.id,
        e.model_id,
        m.code AS model_code,
        m.name AS model_name,
        e.code,
        e.name,
        e.description,
        e.source_table,
        e.staging_view,
        e.hub_name,
        e.is_deployed,
        e.last_deployed_at,
        e.record_count,
        e.created_at,
        e.created_by,
        e.updated_at,
        e.updated_by,
        (SELECT COUNT(*) FROM [mds_meta].[attribute] a WHERE a.entity_id = e.id) AS attribute_count
      FROM [mds_meta].[entity] e
      INNER JOIN [mds_meta].[model] m ON m.id = e.model_id
    `
    
    const params: Record<string, unknown> = {}
    
    if (modelId) {
      sql += ` WHERE e.model_id = @modelId`
      params.modelId = parseInt(modelId)
    }
    
    sql += ` ORDER BY m.name, e.name`
    
    const results = await dbQuery<Entity>(sql, params)
    
    return NextResponse.json({
      data: results,
      total: results.length,
    })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch entities')
    return NextResponse.json(
      { error: 'Failed to fetch entities', details: String(error) },
      { status: 500 }
    )
  }
}

// POST /api/entities - Create new entity
export async function POST(request: NextRequest) {
  logger.info('POST /api/entities')
  
  try {
    const body = await request.json()
    const { model_id, code, name, description, source_table, staging_view, hub_name } = body
    
    if (!model_id || !code || !name) {
      return NextResponse.json(
        { error: 'model_id, code and name are required' },
        { status: 400 }
      )
    }
    
    // Check if model exists
    const model = await dbQuery<{ id: number }>(
      'SELECT id FROM [mds_meta].[model] WHERE id = @modelId',
      { modelId: model_id }
    )
    if (model.length === 0) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      )
    }
    
    // Check for duplicate code in model
    const existing = await dbQuery<{ id: number }>(
      'SELECT id FROM [mds_meta].[entity] WHERE model_id = @modelId AND code = @code',
      { modelId: model_id, code }
    )
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Entity with this code already exists in this model' },
        { status: 409 }
      )
    }
    
    const currentUser = 'admin'
    
    await dbExecute(
      `INSERT INTO [mds_meta].[entity] 
        (model_id, code, name, description, source_table, staging_view, hub_name, created_by, updated_by)
       VALUES (@modelId, @code, @name, @description, @source_table, @staging_view, @hub_name, @user, @user)`,
      { 
        modelId: model_id,
        code, 
        name, 
        description: description || null,
        source_table: source_table || null,
        staging_view: staging_view || null,
        hub_name: hub_name || null,
        user: currentUser 
      }
    )
    
    // Fetch the created entity
    const created = await dbQuery<Entity>(
      `SELECT e.*, m.code AS model_code, m.name AS model_name
       FROM [mds_meta].[entity] e
       INNER JOIN [mds_meta].[model] m ON m.id = e.model_id
       WHERE e.model_id = @modelId AND e.code = @code`,
      { modelId: model_id, code }
    )
    
    return NextResponse.json(created[0], { status: 201 })
  } catch (error) {
    logger.error({ error }, 'Failed to create entity')
    return NextResponse.json(
      { error: 'Failed to create entity', details: String(error) },
      { status: 500 }
    )
  }
}
