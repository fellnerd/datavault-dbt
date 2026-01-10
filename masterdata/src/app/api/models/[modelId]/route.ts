import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { dbQuery, dbExecute } from '@/lib/db-server'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Model {
  id: number
  code: string
  name: string
  description: string | null
  version: number
  status: string
  source_database: string | null
  target_schema: string | null
  created_at: string
  created_by: string
  updated_at: string | null
  updated_by: string | null
}

// GET /api/models/[modelId] - Get single model
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  const { modelId } = await params
  logger.info({ modelId }, 'GET /api/models/[modelId]')
  
  try {
    const results = await dbQuery<Model>(
      'SELECT * FROM mds_meta.model WHERE id = @id',
      { id: parseInt(modelId) }
    )
    
    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(results[0])
  } catch (error) {
    logger.error({ error, modelId }, 'Failed to fetch model')
    return NextResponse.json(
      { error: 'Failed to fetch model' },
      { status: 500 }
    )
  }
}

// PUT /api/models/[modelId] - Update model
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  const { modelId } = await params
  logger.info({ modelId }, 'PUT /api/models/[modelId]')
  
  try {
    const body = await request.json()
    const { name, description, status, source_database, target_schema } = body
    
    // Build dynamic update query
    const updates: string[] = []
    const queryParams: Record<string, unknown> = { id: parseInt(modelId) }
    
    if (name !== undefined) {
      updates.push('name = @name')
      queryParams.name = name
    }
    if (description !== undefined) {
      updates.push('description = @description')
      queryParams.description = description
    }
    if (status !== undefined) {
      updates.push('status = @status')
      queryParams.status = status
    }
    if (source_database !== undefined) {
      updates.push('source_database = @source_database')
      queryParams.source_database = source_database
    }
    if (target_schema !== undefined) {
      updates.push('target_schema = @target_schema')
      queryParams.target_schema = target_schema
    }
    
    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }
    
    // Always update updated_at and updated_by
    updates.push('updated_at = GETUTCDATE()')
    updates.push('updated_by = @updated_by')
    queryParams.updated_by = 'admin'
    
    await dbExecute(
      `UPDATE mds_meta.model SET ${updates.join(', ')} WHERE id = @id`,
      queryParams
    )
    
    // Cascade status changes to entities
    if (status === 'draft' || status === 'deprecated') {
      // Deactivate all entities when model is deactivated
      await dbExecute(
        `UPDATE mds_meta.entity 
         SET status = @status, 
             updated_at = GETUTCDATE(), 
             updated_by = @updated_by 
         WHERE model_id = @id AND status = 'active'`,
        { id: parseInt(modelId), status, updated_by: 'admin' }
      )
      logger.info({ modelId, status }, 'Cascaded deactivation to entities')
    } else if (status === 'active') {
      // Activate all draft entities when model is activated
      await dbExecute(
        `UPDATE mds_meta.entity 
         SET status = 'active', 
             updated_at = GETUTCDATE(), 
             updated_by = @updated_by 
         WHERE model_id = @id AND status = 'draft'`,
        { id: parseInt(modelId), updated_by: 'admin' }
      )
      logger.info({ modelId }, 'Cascaded activation to entities')
    }
    
    return NextResponse.json({
      model_id: modelId,
      updated_at: new Date().toISOString(),
    })
  } catch (error) {
    logger.error({ error, modelId }, 'Failed to update model')
    return NextResponse.json(
      { error: 'Failed to update model' },
      { status: 500 }
    )
  }
}

// DELETE /api/models/[modelId] - Delete model
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  const { modelId } = await params
  logger.info({ modelId }, 'DELETE /api/models/[modelId]')
  
  try {
    // Check if model has entities
    const entities = await dbQuery<{count: number}>(
      'SELECT COUNT(*) as count FROM mds_meta.entity WHERE model_id = @id',
      { id: parseInt(modelId) }
    )
    
    if (entities[0].count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete model with existing entities. Delete entities first.' },
        { status: 400 }
      )
    }
    
    await dbExecute(
      'DELETE FROM mds_meta.model WHERE id = @id',
      { id: parseInt(modelId) }
    )
    
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ error, modelId }, 'Failed to delete model')
    return NextResponse.json(
      { error: 'Failed to delete model' },
      { status: 500 }
    )
  }
}
