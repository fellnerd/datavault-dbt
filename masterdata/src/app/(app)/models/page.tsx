'use client'

import { useState, useEffect } from 'react'
import { 
  Button, 
  Card, 
  Icon, 
  Tag, 
  Dialog, 
  FormGroup, 
  InputGroup,
  TextArea,
  Intent,
  Spinner,
  NonIdealState
} from '@blueprintjs/core'
import { Header } from '@/components/layout/Header'

interface Model {
  id: number
  code: string
  name: string
  description: string | null
  version: number
  status: 'draft' | 'active' | 'deprecated'
  source_database: string | null
  target_schema: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  entity_count: number
  record_count?: number
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newModel, setNewModel] = useState({ code: '', name: '', description: '' })

  // Fetch models from API
  const fetchModels = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/models')
      if (!res.ok) {
        throw new Error(`Error: ${res.status}`)
      }
      const json = await res.json()
      setModels(json.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchModels()
  }, [])

  const handleCreate = async () => {
    try {
      setIsCreating(true)
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newModel.code.toUpperCase().replace(/\s+/g, '_'),
          name: newModel.name,
          description: newModel.description
        })
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create model')
      }
      
      setNewModel({ code: '', name: '', description: '' })
      setIsCreateOpen(false)
      fetchModels() // Refresh list
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create model')
    } finally {
      setIsCreating(false)
    }
  }

  const getStatusIntent = (status: Model['status']): Intent => {
    switch (status) {
      case 'active': return 'success'
      case 'draft': return 'warning'
      case 'deprecated': return 'none'
      default: return 'none'
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <>
        <Header title="Models" breadcrumb={['Model Design', 'Models']} />
        <div className="page-content" style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={40} />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <Header title="Models" breadcrumb={['Model Design', 'Models']} />
        <div className="page-content">
          <NonIdealState
            icon="error"
            title="Failed to load models"
            description={error}
            action={<Button icon="refresh" onClick={fetchModels}>Retry</Button>}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Models" breadcrumb={['Model Design', 'Models']} />
      
      <div className="page-content">
        <div className="section-header">
          <h2>Data Models</h2>
          <Button 
            icon="add" 
            intent="primary"
            onClick={() => setIsCreateOpen(true)}
          >
            New Model
          </Button>
        </div>

        {models.length === 0 ? (
          <NonIdealState
            icon="cube"
            title="No models yet"
            description="Create your first data model to get started"
            action={<Button icon="add" intent="primary" onClick={() => setIsCreateOpen(true)}>Create Model</Button>}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {models.map((model) => (
              <Card key={model.id} className="model-card" elevation={0}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ 
                      width: 32, 
                      height: 32, 
                      borderRadius: 3, 
                      background: 'rgba(19, 124, 189, 0.1)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center' 
                    }}>
                      <Icon icon="cube" size={16} color="#137cbd" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{model.code}</div>
                      <Tag minimal intent={getStatusIntent(model.status)} style={{ marginTop: 2 }}>
                        {model.status}
                      </Tag>
                    </div>
                  </div>
                  <Button minimal small icon="more" />
                </div>

                <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>{model.name}</div>
                <p className="text-muted" style={{ fontSize: 11, marginBottom: 12, minHeight: 32 }}>
                  {model.description || 'No description'}
                </p>

                <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 300 }}>{model.entity_count}</div>
                    <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Entities</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 300 }}>{(model.record_count || 0).toLocaleString('de-DE')}</div>
                    <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Records</div>
                  </div>
                </div>

                <div className="card-footer" style={{ display: 'flex', gap: 6, paddingTop: 10 }}>
                  <Button small icon="th" text="Entities" />
                  <Button small icon="database" text="Data" />
                  {model.status === 'active' && (
                    <Button small icon="play" intent="success" text="Deploy" />
                  )}
                  {model.status === 'draft' && (
                    <Button small icon="tick" intent="primary" text="Activate" />
                  )}
                </div>

                <div className="text-muted" style={{ marginTop: 10, fontSize: 10 }}>
                  Created: {formatDate(model.created_at)} by {model.created_by}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Model Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Model"
        icon="cube"
        style={{ width: 420 }}
      >
        <div className="bp5-dialog-body">
          <FormGroup label="Model Code" labelFor="model-code" labelInfo="(required)" helperText="Unique identifier (e.g., CRM, PRODUCTS)">
            <InputGroup
              id="model-code"
              placeholder="e.g., CRM"
              value={newModel.code}
              onChange={(e) => setNewModel({ ...newModel, code: e.target.value.toUpperCase() })}
            />
          </FormGroup>
          <FormGroup label="Model Name" labelFor="model-name" labelInfo="(required)">
            <InputGroup
              id="model-name"
              placeholder="e.g., Customer Relationship Management"
              value={newModel.name}
              onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="Description" labelFor="model-desc">
            <TextArea
              id="model-desc"
              placeholder="Brief description of this data model..."
              fill
              autoResize
              value={newModel.description}
              onChange={(e) => setNewModel({ ...newModel, description: e.target.value })}
            />
          </FormGroup>
        </div>
        <div className="bp5-dialog-footer">
          <div className="bp5-dialog-footer-actions">
            <Button small onClick={() => setIsCreateOpen(false)} disabled={isCreating}>Cancel</Button>
            <Button 
              small
              intent="primary" 
              onClick={handleCreate}
              disabled={!newModel.code.trim() || !newModel.name.trim() || isCreating}
              loading={isCreating}
            >
              Create Model
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
