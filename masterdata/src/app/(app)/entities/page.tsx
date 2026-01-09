'use client'

import { useState, useEffect } from 'react'
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
  const [entities, setEntities] = useState<Entity[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterModel, setFilterModel] = useState<string>('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
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
                          <Button minimal small icon="edit" title="Edit" />
                          <Button minimal small icon="column-layout" title="Attributes" />
                          <Button minimal small icon="database" title="Data" />
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
    </>
  )
}
