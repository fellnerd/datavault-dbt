import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, dbExecute } from '@/lib/db-server'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface Commit {
  id: number
  code: string
  description: string | null
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'deployed'
  entity_id: number
  entity_code?: string
  entity_name?: string
  record_count: number
  created_at: string
  created_by: string
  approved_at: string | null
  approved_by: string | null
  rejected_at: string | null
  rejected_by: string | null
  rejection_reason: string | null
  deployed_at: string | null
  deployed_by: string | null
}

// GET /api/commits - List commits
export async function GET(request: NextRequest) {
  logger.info('GET /api/commits')
  
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entity_id')
    const status = searchParams.get('status')
    
    let sql = `
      SELECT 
        c.id,
        c.code,
        c.description,
        c.status,
        c.entity_id,
        e.code AS entity_code,
        e.name AS entity_name,
        c.record_count,
        c.created_at,
        c.created_by,
        c.approved_at,
        c.approved_by,
        c.rejected_at,
        c.rejected_by,
        c.rejection_reason,
        c.deployed_at,
        c.deployed_by
      FROM [mds_stage].[commit] c
      INNER JOIN [mds_meta].[entity] e ON e.id = c.entity_id
      WHERE 1=1
    `
    
    const params: Record<string, unknown> = {}
    
    if (entityId) {
      sql += ` AND c.entity_id = @entityId`
      params.entityId = parseInt(entityId)
    }
    
    if (status) {
      sql += ` AND c.status = @status`
      params.status = status
    }
    
    sql += ` ORDER BY c.created_at DESC`
    
    const results = await dbQuery<Commit>(sql, params)
    
    // Compute summary stats
    const draft = results.filter(c => c.status === 'draft').length
    const pending = results.filter(c => c.status === 'pending').length
    const approved = results.filter(c => c.status === 'approved').length
    const deployed = results.filter(c => c.status === 'deployed').length
    
    // Get pending schema deployments count
    const schemaDeployments = await dbQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM mds_meta.schema_deployment WHERE status = 'pending'`
    )
    const schemaPending = schemaDeployments.length > 0 ? schemaDeployments[0].count : 0
    
    return NextResponse.json({
      data: results,
      total: results.length,
      summary: {
        total: results.length,
        draft,
        pending,
        approved,
        deployed,
        schema_pending: schemaPending
      }
    })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch commits')
    return NextResponse.json(
      { error: 'Failed to fetch commits', details: String(error) },
      { status: 500 }
    )
  }
}

// POST /api/commits - Create new commit (submit draft records)
export async function POST(request: NextRequest) {
  logger.info('POST /api/commits')
  
  try {
    const body = await request.json()
    const { 
      entity_id, 
      description,
      change_ids, // Optional: specific staged_record IDs to commit
      created_by = 'admin'
    } = body
    
    if (!entity_id) {
      return NextResponse.json(
        { error: 'entity_id is required' },
        { status: 400 }
      )
    }

    // Generate commit code
    const now = new Date()
    const code = `CMT-${entity_id}-${now.getTime()}`
    
    // Option 1: Commit specific change_ids
    if (change_ids && Array.isArray(change_ids) && change_ids.length > 0) {
      // Create a new commit
      await dbExecute(
        `INSERT INTO [mds_stage].[commit] (entity_id, code, description, status, record_count, created_at, created_by)
         VALUES (@entityId, @code, @description, 'pending', @recordCount, GETUTCDATE(), @createdBy)`,
        { 
          entityId: entity_id,
          code,
          description: description || null,
          recordCount: change_ids.length,
          createdBy: created_by
        }
      )
      
      // Get the new commit ID
      const newCommit = await dbQuery<{ id: number }>(
        `SELECT id FROM [mds_stage].[commit] WHERE code = @code`,
        { code }
      )
      
      if (newCommit.length === 0) {
        throw new Error('Failed to create commit')
      }
      
      const commitId = newCommit[0].id
      
      // Update the staged_records to point to this commit AND set status to 'committed'
      // Build a parameterized query for the IDs
      const idParams: Record<string, unknown> = { commitId }
      const idPlaceholders = change_ids.map((id: number, idx: number) => {
        idParams[`id${idx}`] = id
        return `@id${idx}`
      }).join(', ')
      
      await dbExecute(
        `UPDATE [mds_stage].[staged_record] 
         SET commit_id = @commitId, status = 'committed'
         WHERE id IN (${idPlaceholders}) AND entity_id = ${entity_id}`,
        idParams
      )
      
      // Fetch the created commit
      const result = await dbQuery<Commit>(
        `SELECT c.*, e.code AS entity_code, e.name AS entity_name
         FROM [mds_stage].[commit] c
         INNER JOIN [mds_meta].[entity] e ON e.id = c.entity_id
         WHERE c.id = @commitId`,
        { commitId }
      )
      
      return NextResponse.json(result[0], { status: 201 })
    }
    
    // Option 2: Commit all draft records for this entity (original behavior)
    // Check if there are draft records to commit
    const draftRecords = await dbQuery<{ count: number }>(
      `SELECT COUNT(*) as count 
       FROM [mds_stage].[staged_record] r
       JOIN [mds_stage].[commit] c ON c.id = r.commit_id
       WHERE c.entity_id = @entityId AND c.status = 'draft'`,
      { entityId: entity_id }
    )
    
    if (draftRecords[0].count === 0) {
      return NextResponse.json(
        { error: 'No draft records to commit' },
        { status: 400 }
      )
    }
    
    // Update the draft commit to pending
    await dbExecute(
      `UPDATE [mds_stage].[commit] 
       SET status = 'pending', 
           code = @code, 
           description = @description,
           record_count = (
             SELECT COUNT(*) FROM [mds_stage].[staged_record] 
             WHERE commit_id = [mds_stage].[commit].id
           )
       WHERE entity_id = @entityId AND status = 'draft'`,
      { 
        entityId: entity_id,
        code,
        description: description || null
      }
    )
    
    // Fetch the updated commit
    const updated = await dbQuery<Commit>(
      `SELECT c.*, e.code AS entity_code, e.name AS entity_name
       FROM [mds_stage].[commit] c
       INNER JOIN [mds_meta].[entity] e ON e.id = c.entity_id
       WHERE c.code = @code`,
      { code }
    )
    
    return NextResponse.json(updated[0], { status: 201 })
  } catch (error) {
    logger.error({ error }, 'Failed to create commit')
    return NextResponse.json(
      { error: 'Failed to create commit', details: String(error) },
      { status: 500 }
    )
  }
}

// PATCH /api/commits - Approve/Reject commit
export async function PATCH(request: NextRequest) {
  logger.info('PATCH /api/commits')
  
  try {
    const body = await request.json()
    const { 
      id,
      action, // 'approve' | 'reject' | 'deploy'
      rejection_reason,
      user = 'admin'
    } = body
    
    if (!id || !action) {
      return NextResponse.json(
        { error: 'id and action are required' },
        { status: 400 }
      )
    }
    
    let sql = ''
    const params: Record<string, unknown> = { id, user }
    
    switch (action) {
      case 'approve':
        sql = `UPDATE [mds_stage].[commit] 
               SET status = 'approved', approved_at = GETUTCDATE(), approved_by = @user
               WHERE id = @id AND status = 'pending'`
        break
      case 'reject':
        sql = `UPDATE [mds_stage].[commit] 
               SET status = 'rejected', rejected_at = GETUTCDATE(), rejected_by = @user, rejection_reason = @reason
               WHERE id = @id AND status = 'pending'`
        params.reason = rejection_reason || null
        break
      case 'deploy':
        sql = `UPDATE [mds_stage].[commit] 
               SET status = 'deployed', deployed_at = GETUTCDATE(), deployed_by = @user
               WHERE id = @id AND status = 'approved'`
        break
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: approve, reject, or deploy' },
          { status: 400 }
        )
    }
    
    await dbExecute(sql, params)
    
    // Fetch the updated commit
    const updated = await dbQuery<Commit>(
      `SELECT c.*, e.code AS entity_code, e.name AS entity_name
       FROM [mds_stage].[commit] c
       INNER JOIN [mds_meta].[entity] e ON e.id = c.entity_id
       WHERE c.id = @id`,
      { id }
    )
    
    return NextResponse.json(updated[0])
  } catch (error) {
    logger.error({ error }, 'Failed to update commit')
    return NextResponse.json(
      { error: 'Failed to update commit', details: String(error) },
      { status: 500 }
    )
  }
}
