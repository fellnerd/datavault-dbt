import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/lib/logger'

// Types
interface DataRow {
  row_id: string
  entity_id: string
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  created_by: string
  created_at: string
  modified_by: string | null
  modified_at: string | null
  approved_by: string | null
  approved_at: string | null
  commit_id: string | null
  data: Record<string, unknown>
}

// Mock data rows
let dataRows: DataRow[] = [
  {
    row_id: 'row-001',
    entity_id: 'entity-001',
    status: 'approved',
    created_by: 'admin',
    created_at: '2023-01-20T10:00:00Z',
    modified_by: null,
    modified_at: null,
    approved_by: 'approver',
    approved_at: '2023-01-21T14:30:00Z',
    commit_id: 'commit-001',
    data: {
      customer_id: 1001,
      customer_name: 'Acme Corp',
      email: 'contact@acme.com',
      phone: '+49 123 456789',
      address: 'Hauptstraße 1',
      city: 'München',
      country: 'Germany',
      status: 'active',
    },
  },
  {
    row_id: 'row-002',
    entity_id: 'entity-001',
    status: 'approved',
    created_by: 'admin',
    created_at: '2023-01-20T10:05:00Z',
    modified_by: null,
    modified_at: null,
    approved_by: 'approver',
    approved_at: '2023-01-21T14:30:00Z',
    commit_id: 'commit-001',
    data: {
      customer_id: 1002,
      customer_name: 'TechStart GmbH',
      email: 'info@techstart.de',
      phone: '+49 89 123456',
      address: 'Bahnhofstraße 42',
      city: 'Berlin',
      country: 'Germany',
      status: 'active',
    },
  },
  {
    row_id: 'row-003',
    entity_id: 'entity-001',
    status: 'pending',
    created_by: 'editor1',
    created_at: '2023-02-15T09:00:00Z',
    modified_by: null,
    modified_at: null,
    approved_by: null,
    approved_at: null,
    commit_id: null,
    data: {
      customer_id: 1003,
      customer_name: 'NewClient AG',
      email: 'hello@newclient.ch',
      phone: '+41 44 123456',
      address: 'Bahnhofplatz 5',
      city: 'Zürich',
      country: 'Switzerland',
      status: 'active',
    },
  },
  {
    row_id: 'row-004',
    entity_id: 'entity-001',
    status: 'draft',
    created_by: 'editor2',
    created_at: '2023-02-16T14:20:00Z',
    modified_by: 'editor2',
    modified_at: '2023-02-16T15:00:00Z',
    approved_by: null,
    approved_at: null,
    commit_id: null,
    data: {
      customer_id: 1004,
      customer_name: 'Draft Company',
      email: 'draft@example.com',
      phone: '',
      address: '',
      city: 'Hamburg',
      country: 'Germany',
      status: 'draft',
    },
  },
]

// GET /api/data/[entityId] - List data rows for entity
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params
  logger.info({ entityId }, 'GET /api/data/[entityId]')
  
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const search = searchParams.get('search')
    
    // Filter data
    let results = dataRows.filter(r => r.entity_id === entityId)
    
    if (status) {
      results = results.filter(r => r.status === status)
    }
    
    if (search) {
      const searchLower = search.toLowerCase()
      results = results.filter(r => 
        JSON.stringify(r.data).toLowerCase().includes(searchLower)
      )
    }
    
    // Pagination
    const total = results.length
    const start = (page - 1) * pageSize
    const paginatedResults = results.slice(start, start + pageSize)
    
    return NextResponse.json({
      data: paginatedResults,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    logger.error({ error, entityId }, 'Failed to fetch data')
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    )
  }
}

// POST /api/data/[entityId] - Create new data row(s)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params
  logger.info({ entityId }, 'POST /api/data/[entityId]')
  
  try {
    const body = await request.json()
    const { rows } = body // Can be single row or array
    
    const rowsToCreate = Array.isArray(rows) ? rows : [rows]
    const createdRows: DataRow[] = []
    
    for (const rowData of rowsToCreate) {
      const newRow: DataRow = {
        row_id: uuidv4(),
        entity_id: entityId,
        status: 'draft',
        created_by: 'admin', // TODO: Get from session
        created_at: new Date().toISOString(),
        modified_by: null,
        modified_at: null,
        approved_by: null,
        approved_at: null,
        commit_id: null,
        data: rowData,
      }
      
      dataRows.push(newRow)
      createdRows.push(newRow)
    }
    
    // TODO: Insert into database
    // Use dynamic SQL or EAV pattern based on entity attributes
    
    return NextResponse.json({
      data: createdRows,
      created: createdRows.length,
    }, { status: 201 })
  } catch (error) {
    logger.error({ error, entityId }, 'Failed to create data')
    return NextResponse.json(
      { error: 'Failed to create data' },
      { status: 500 }
    )
  }
}

// PUT /api/data/[entityId] - Batch update rows (for bulk status changes)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params
  logger.info({ entityId }, 'PUT /api/data/[entityId] (batch)')
  
  try {
    const body = await request.json()
    const { row_ids, status } = body
    
    if (!Array.isArray(row_ids) || row_ids.length === 0) {
      return NextResponse.json(
        { error: 'row_ids array is required' },
        { status: 400 }
      )
    }
    
    const validStatuses = ['draft', 'pending', 'approved', 'rejected']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }
    
    let updated = 0
    for (const rowId of row_ids) {
      const row = dataRows.find(r => r.row_id === rowId && r.entity_id === entityId)
      if (row) {
        row.status = status
        row.modified_by = 'admin' // TODO: Get from session
        row.modified_at = new Date().toISOString()
        updated++
      }
    }
    
    return NextResponse.json({
      success: true,
      updated,
    })
  } catch (error) {
    logger.error({ error, entityId }, 'Failed to update data')
    return NextResponse.json(
      { error: 'Failed to update data' },
      { status: 500 }
    )
  }
}

// DELETE /api/data/[entityId] - Batch delete rows
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params
  logger.info({ entityId }, 'DELETE /api/data/[entityId]')
  
  try {
    const body = await request.json()
    const { row_ids } = body
    
    if (!Array.isArray(row_ids) || row_ids.length === 0) {
      return NextResponse.json(
        { error: 'row_ids array is required' },
        { status: 400 }
      )
    }
    
    // Only allow deleting draft rows
    const deletedIds: string[] = []
    dataRows = dataRows.filter(r => {
      if (row_ids.includes(r.row_id) && r.entity_id === entityId && r.status === 'draft') {
        deletedIds.push(r.row_id)
        return false
      }
      return true
    })
    
    return NextResponse.json({
      success: true,
      deleted: deletedIds.length,
      deleted_ids: deletedIds,
    })
  } catch (error) {
    logger.error({ error, entityId }, 'Failed to delete data')
    return NextResponse.json(
      { error: 'Failed to delete data' },
      { status: 500 }
    )
  }
}
