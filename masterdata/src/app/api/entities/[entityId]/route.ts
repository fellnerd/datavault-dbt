import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

interface Attribute {
  attr_id: string
  entity_id: string
  attr_name: string
  attr_label: string | null
  data_type: string
  is_required: boolean
  is_unique: boolean
  default_value: string | null
  sort_order: number
  validation_regex: string | null
}

// Mock attributes for the entity
const mockAttributes: Attribute[] = [
  { attr_id: 'attr-001', entity_id: 'entity-001', attr_name: 'customer_id', attr_label: 'Customer ID', data_type: 'INT', is_required: true, is_unique: true, default_value: null, sort_order: 1, validation_regex: null },
  { attr_id: 'attr-002', entity_id: 'entity-001', attr_name: 'customer_name', attr_label: 'Name', data_type: 'NVARCHAR(200)', is_required: true, is_unique: false, default_value: null, sort_order: 2, validation_regex: null },
  { attr_id: 'attr-003', entity_id: 'entity-001', attr_name: 'email', attr_label: 'Email', data_type: 'NVARCHAR(255)', is_required: false, is_unique: true, default_value: null, sort_order: 3, validation_regex: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' },
  { attr_id: 'attr-004', entity_id: 'entity-001', attr_name: 'phone', attr_label: 'Phone', data_type: 'NVARCHAR(50)', is_required: false, is_unique: false, default_value: null, sort_order: 4, validation_regex: null },
  { attr_id: 'attr-005', entity_id: 'entity-001', attr_name: 'address', attr_label: 'Address', data_type: 'NVARCHAR(500)', is_required: false, is_unique: false, default_value: null, sort_order: 5, validation_regex: null },
  { attr_id: 'attr-006', entity_id: 'entity-001', attr_name: 'city', attr_label: 'City', data_type: 'NVARCHAR(100)', is_required: false, is_unique: false, default_value: null, sort_order: 6, validation_regex: null },
  { attr_id: 'attr-007', entity_id: 'entity-001', attr_name: 'country', attr_label: 'Country', data_type: 'NVARCHAR(100)', is_required: true, is_unique: false, default_value: 'Germany', sort_order: 7, validation_regex: null },
  { attr_id: 'attr-008', entity_id: 'entity-001', attr_name: 'status', attr_label: 'Status', data_type: 'NVARCHAR(20)', is_required: true, is_unique: false, default_value: 'active', sort_order: 8, validation_regex: null },
  { attr_id: 'attr-009', entity_id: 'entity-001', attr_name: 'created_at', attr_label: 'Created At', data_type: 'DATETIME2', is_required: true, is_unique: false, default_value: 'GETUTCDATE()', sort_order: 9, validation_regex: null },
  { attr_id: 'attr-010', entity_id: 'entity-001', attr_name: 'updated_at', attr_label: 'Updated At', data_type: 'DATETIME2', is_required: false, is_unique: false, default_value: null, sort_order: 10, validation_regex: null },
]

// GET /api/entities/[entityId] - Get single entity with attributes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params
  logger.info({ entityId }, 'GET /api/entities/[entityId]')
  
  try {
    // Mock entity data
    const entity = {
      entity_id: entityId,
      model_id: 'model-001',
      model_name: 'CRM',
      entity_name: 'Customers',
      entity_description: 'Customer master data',
      business_key_attr: 'customer_id',
      created_by: 'admin',
      created_at: '2023-01-16T10:00:00Z',
      is_active: true,
    }
    
    // Return entity with its attributes
    return NextResponse.json({
      ...entity,
      attributes: mockAttributes,
    })
  } catch (error) {
    logger.error({ error, entityId }, 'Failed to fetch entity')
    return NextResponse.json(
      { error: 'Failed to fetch entity' },
      { status: 500 }
    )
  }
}

// PUT /api/entities/[entityId] - Update entity
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params
  logger.info({ entityId }, 'PUT /api/entities/[entityId]')
  
  try {
    const body = await request.json()
    const { name, description, business_key, is_active } = body
    
    // TODO: Update in database
    // await execute(`
    //   UPDATE mds_meta.entity 
    //   SET entity_name = @name, entity_description = @description,
    //       business_key_attr = @business_key, is_active = @is_active
    //   WHERE entity_id = @entity_id
    // `, { entity_id: entityId, name, description, business_key, is_active })
    
    return NextResponse.json({
      entity_id: entityId,
      entity_name: name,
      entity_description: description,
      business_key_attr: business_key,
      is_active: is_active ?? true,
      updated_at: new Date().toISOString(),
    })
  } catch (error) {
    logger.error({ error, entityId }, 'Failed to update entity')
    return NextResponse.json(
      { error: 'Failed to update entity' },
      { status: 500 }
    )
  }
}

// DELETE /api/entities/[entityId] - Delete (soft-delete) entity
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params
  logger.info({ entityId }, 'DELETE /api/entities/[entityId]')
  
  try {
    // TODO: Soft delete in database
    // await execute(`
    //   UPDATE mds_meta.entity SET is_active = 0 WHERE entity_id = @entity_id
    // `, { entity_id: entityId })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ error, entityId }, 'Failed to delete entity')
    return NextResponse.json(
      { error: 'Failed to delete entity' },
      { status: 500 }
    )
  }
}
