'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Button, 
  HTMLTable, 
  Tag, 
  Icon,
  Dialog,
  FormGroup,
  InputGroup,
  HTMLSelect,
  Checkbox,
  Spinner,
  NonIdealState
} from '@blueprintjs/core'
import { Header } from '@/components/layout/Header'

interface Entity {
  id: number
  code: string
  name: string
  description: string | null
  model_id: number
  model_code: string
  is_versioned: boolean
  status: 'draft' | 'active' | 'deprecated'
  primary_key_attribute: string | null
  attribute_count: number
  created_at: string
  created_by: string
}

interface Model {
  id: number
  code: string
  name: string
}

export default function EntitiesPage() {
  const router = useRouter()
  const [entities, setEntities] = useState<Entity[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterModel, setFilterModel] = useState<string>('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editEntity, setEditEntity] = useState<Entity | null>(null)
  const [newEntity, setNewEntity] = useState({
    code: '',
    name: '',
    model_id: 0,
    is_versioned: true
  })

  // Fetch entities and models from API
  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [entitiesRes, modelsRes] = await Promise.all([
        fetch('/api/entities'),
        fetch('/api/models')
      ])
      
      if (!entitiesRes.ok || !modelsRes.ok) {
        throw new Error('Failed to load data')
      }
      
      const entitiesJson = await entitiesRes.json()
      const modelsJson = await modelsRes.json()
      
      setEntities(entitiesJson.data || [])
      setModels(modelsJson.data || [])
      
      // Set default model for create dialog
      if (modelsJson.data?.length > 0 && newEntity.model_id === 0) {
        setNewEntity(prev => ({ ...prev, model_id: modelsJson.data[0].id }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entities')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredEntities = filterModel 
    ? entities.filter(e => e.model_code === filterModel)
    : entities

  const handleCreate = async () => {
    try {
      setIsCreating(true)
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newEntity.code.toLowerCase().replace(/\s+/g, '_'),
          name: newEntity.name,
          model_id: newEntity.model_id,
          is_versioned: newEntity.is_versioned
        })
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create entity')
      }
      
      setNewEntity({ code: '', name: '', model_id: models[0]?.id || 0, is_versioned: true })
      setIsCreateOpen(false)
      fetchData() // Refresh list
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create entity')
    } finally {
      setIsCreating(false)
    }
  }

  const handleOpenEdit = (entity: Entity) => {
    setEditEntity(entity)
    setIsEditOpen(true)
  }

  const handleEditEntity = async () => {
    if (!editEntity) return
    try {
      setIsEditing(true)
      const res = await fetch(`/api/entities/${editEntity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editEntity.name,
          description: editEntity.description,
          is_versioned: editEntity.is_versioned
        })
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update entity')
      }
      
      setEditEntity(null)
      setIsEditOpen(false)
      fetchData() // Refresh list
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update entity')
    } finally {
      setIsEditing(false)
    }
  }

  const handleDeleteEntity = async (entityId: number, entityCode: string) => {
    if (!confirm(`Are you sure you want to delete entity "${entityCode}"? This cannot be undone.`)) {
      return
    }
    
    try {
      const res = await fetch(`/api/entities/${entityId}`, {
        method: 'DELETE'
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete entity')
      }
      
      fetchData() // Refresh list
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete entity')
    }
  }

  if (loading) {
    return (
      <>
        <Header title="Entities" breadcrumb={['Model Design', 'Entities']} />
        <div className="page-content" style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={40} />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <Header title="Entities" breadcrumb={['Model Design', 'Entities']} />
        <div className="page-content">
          <NonIdealState
            icon="error"
            title="Failed to load entities"
            description={error}
            action={<Button icon="refresh" onClick={fetchData}>Retry</Button>}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Entities" breadcrumb={['Model Design', 'Entities']} />
      
      <div className="page-content">
        <div className="section-header">
          <h2>Entity Definitions</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <HTMLSelect 
              value={filterModel} 
              onChange={(e) => setFilterModel(e.target.value)}
              options={[
                { value: '', label: 'All Models' },
                ...models.map(m => ({ value: m.code, label: m.name }))
              ]}
            />
            <Button 
              icon="add" 
              intent="primary"
              onClick={() => setIsCreateOpen(true)}
              disabled={models.length === 0}
            >
              New Entity
            </Button>
          </div>
        </div>

        {entities.length === 0 ? (
          <NonIdealState
            icon="th"
            title="No entities yet"
            description={models.length === 0 ? "Create a model first, then add entities" : "Create your first entity to get started"}
            action={models.length > 0 && <Button icon="add" intent="primary" onClick={() => setIsCreateOpen(true)}>Create Entity</Button>}
          />
        ) : (
          <>
            <div className="data-table-container">
              <HTMLTable striped interactive style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Model</th>
                    <th>Attributes</th>
                    <th>History</th>
                    <th>Status</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntities.map((entity) => (
                    <tr key={entity.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon icon="th" size={14} className="text-muted" />
                          <div>
                            <div style={{ fontWeight: 500 }}>{entity.name}</div>
                            <div className="text-muted" style={{ fontSize: 11 }}>{entity.code}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Tag minimal>{entity.model_code}</Tag>
                      </td>
                      <td>{entity.attribute_count}</td>
                      <td>
                        {entity.is_versioned ? (
                          <Icon icon="time" size={14} intent="success" />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <Tag 
                          minimal 
                          intent={entity.status === 'active' ? 'success' : entity.status === 'draft' ? 'warning' : 'none'}
                        >
                          {entity.status}
                        </Tag>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button minimal small icon="edit" title="Edit" onClick={() => handleOpenEdit(entity)} />
                          <Button minimal small icon="column-layout" title="Attributes" onClick={() => router.push(`/attributes?entity_id=${entity.id}`)} />
                          <Button minimal small icon="database" title="Data" onClick={() => router.push(`/data?entity_id=${entity.id}`)} />
                          <Button minimal small icon="trash" title="Delete" intent="danger" onClick={() => handleDeleteEntity(entity.id, entity.code)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            </div>

            <div className="text-muted" style={{ marginTop: 16, fontSize: 13 }}>
              Showing {filteredEntities.length} of {entities.length} entities
            </div>
          </>
        )}
      </div>

      {/* Create Entity Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Entity"
        icon="th"
      >
        <div className="bp5-dialog-body">
          <FormGroup label="Entity Code" labelFor="entity-code" labelInfo="(required)" helperText="Technical name (e.g., customer, product)">
            <InputGroup
              id="entity-code"
              placeholder="e.g., customer"
              value={newEntity.code}
              onChange={(e) => setNewEntity({ ...newEntity, code: e.target.value.toLowerCase() })}
            />
          </FormGroup>
          <FormGroup label="Display Name" labelFor="entity-name" labelInfo="(required)">
            <InputGroup
              id="entity-name"
              placeholder="e.g., Customers"
              value={newEntity.name}
              onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="Model" labelFor="entity-model">
            <HTMLSelect
              id="entity-model"
              fill
              value={newEntity.model_id}
              onChange={(e) => setNewEntity({ ...newEntity, model_id: Number(e.target.value) })}
              options={models.map(m => ({ value: m.id, label: m.name }))}
            />
          </FormGroup>
          <FormGroup>
            <Checkbox
              checked={newEntity.is_versioned}
              onChange={(e) => setNewEntity({ ...newEntity, is_versioned: e.target.checked })}
              label="Enable SCD2 History (versioned records)"
            />
          </FormGroup>
        </div>
        <div className="bp5-dialog-footer">
          <div className="bp5-dialog-footer-actions">
            <Button onClick={() => setIsCreateOpen(false)} disabled={isCreating}>Cancel</Button>
            <Button 
              intent="primary" 
              onClick={handleCreate}
              disabled={!newEntity.code.trim() || !newEntity.name.trim() || isCreating}
              loading={isCreating}
            >
              Create Entity
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Entity Dialog */}
      <Dialog
        isOpen={isEditOpen}
        onClose={() => { setIsEditOpen(false); setEditEntity(null); }}
        title="Edit Entity"
        icon="edit"
      >
        <div className="bp5-dialog-body">
          <FormGroup label="Entity Code" labelFor="edit-entity-code" helperText="Code cannot be changed">
            <InputGroup
              id="edit-entity-code"
              value={editEntity?.code || ''}
              disabled
            />
          </FormGroup>
          <FormGroup label="Display Name" labelFor="edit-entity-name" labelInfo="(required)">
            <InputGroup
              id="edit-entity-name"
              placeholder="e.g., Customers"
              value={editEntity?.name || ''}
              onChange={(e) => editEntity && setEditEntity({ ...editEntity, name: e.target.value })}
            />
          </FormGroup>
          <FormGroup>
            <Checkbox
              checked={editEntity?.is_versioned ?? true}
              onChange={(e) => editEntity && setEditEntity({ ...editEntity, is_versioned: e.target.checked })}
              label="Enable SCD2 History (versioned records)"
            />
          </FormGroup>
        </div>
        <div className="bp5-dialog-footer">
          <div className="bp5-dialog-footer-actions">
            <Button onClick={() => { setIsEditOpen(false); setEditEntity(null); }} disabled={isEditing}>Cancel</Button>
            <Button 
              intent="primary" 
              onClick={handleEditEntity}
              disabled={!editEntity?.name?.trim() || isEditing}
              loading={isEditing}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
