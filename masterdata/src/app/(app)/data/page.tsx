'use client'

import { useState, useEffect } from 'react'
import { 
  Button, 
  HTMLTable, 
  Tag, 
  Dialog,
  FormGroup,
  InputGroup,
  HTMLSelect,
  Checkbox,
  Tabs,
  Tab,
  Spinner,
  NonIdealState,
  Callout
} from '@blueprintjs/core'
import { Header } from '@/components/layout/Header'

// Define a type for dynamic data values
type DataValue = string | number | boolean | null

interface Entity {
  id: number
  code: string
  name: string
  model_code: string
}

interface Attribute {
  id: number
  entity_id: number
  code: string
  name: string
  data_type: string
  is_required: boolean
  is_business_key: boolean
}

interface StagedRecord {
  id: number
  entity_id: number
  entity_name: string
  operation: string
  business_key: string
  data: Record<string, DataValue>
  validation_status: string
  created_at: string
  created_by: string
}

interface Summary {
  total: number
  draft: number
  validated: number
  invalid: number
}

export default function DataEntryPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [records, setRecords] = useState<StagedRecord[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, draft: 0, validated: 0, invalid: 0 })
  const [selectedEntityId, setSelectedEntityId] = useState<number>(0)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editRecord, setEditRecord] = useState<StagedRecord | null>(null)
  const [editData, setEditData] = useState<Record<string, DataValue>>({})
  const [selectedRecord, setSelectedRecord] = useState<StagedRecord | null>(null)
  const [newRecord, setNewRecord] = useState<Record<string, DataValue>>({})
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<number>>(new Set())
  const [isCommitting, setIsCommitting] = useState(false)

  // Fetch entities on mount
  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const res = await fetch('/api/entities')
        if (!res.ok) throw new Error('Failed to load entities')
        const json = await res.json()
        setEntities(json.data || [])
        if (json.data?.length > 0) {
          setSelectedEntityId(json.data[0].id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load entities')
      } finally {
        setLoading(false)
      }
    }
    fetchEntities()
  }, [])

  // Fetch attributes and records when entity changes
  useEffect(() => {
    if (!selectedEntityId) return
    
    const fetchData = async () => {
      try {
        setLoading(true)
        const [attrsRes, recordsRes] = await Promise.all([
          fetch(`/api/attributes?entity_id=${selectedEntityId}`),
          fetch(`/api/records?entity_id=${selectedEntityId}`)
        ])
        
        if (!attrsRes.ok || !recordsRes.ok) throw new Error('Failed to load data')
        
        const attrsJson = await attrsRes.json()
        const recordsJson = await recordsRes.json()
        
        setAttributes(attrsJson.data || [])
        setRecords(recordsJson.data || [])
        setSummary(recordsJson.summary || { total: 0, draft: 0, validated: 0, invalid: 0 })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [selectedEntityId])

  const filteredRecords = records.filter(r => !filterStatus || r.validation_status === filterStatus)

  const selectedEntity = entities.find(e => e.id === selectedEntityId)
  const businessKeyAttr = attributes.find(a => a.is_business_key)

  const handleCreate = async () => {
    if (!selectedEntityId || !businessKeyAttr) return
    
    try {
      setIsCreating(true)
      const businessKey = String(newRecord[businessKeyAttr.code] || '')
      
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: selectedEntityId,
          operation: 'INSERT',
          business_key: businessKey,
          data: newRecord
        })
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create record')
      }
      
      setNewRecord({})
      setIsCreateOpen(false)
      // Refresh records
      const recordsRes = await fetch(`/api/records?entity_id=${selectedEntityId}`)
      const recordsJson = await recordsRes.json()
      setRecords(recordsJson.data || [])
      setSummary(recordsJson.summary || summary)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create record')
    } finally {
      setIsCreating(false)
    }
  }

  const handleOpenEdit = (record: StagedRecord) => {
    setEditRecord(record)
    setEditData(record.data as Record<string, DataValue>)
    setIsEditOpen(true)
  }

  const handleEditRecord = async () => {
    if (!editRecord) return
    try {
      setIsEditing(true)
      const res = await fetch(`/api/records/${editRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: editData
        })
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update record')
      }
      
      setEditRecord(null)
      setEditData({})
      setIsEditOpen(false)
      // Refresh records
      const recordsRes = await fetch(`/api/records?entity_id=${selectedEntityId}`)
      const recordsJson = await recordsRes.json()
      setRecords(recordsJson.data || [])
      setSummary(recordsJson.summary || summary)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update record')
    } finally {
      setIsEditing(false)
    }
  }

  const handleDeleteRecord = async (recordId: number) => {
    if (!confirm('Are you sure you want to delete this record?')) {
      return
    }
    
    try {
      const res = await fetch(`/api/records/${recordId}`, {
        method: 'DELETE'
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete record')
      }
      
      // Refresh records
      const recordsRes = await fetch(`/api/records?entity_id=${selectedEntityId}`)
      const recordsJson = await recordsRes.json()
      setRecords(recordsJson.data || [])
      setSummary(recordsJson.summary || summary)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete record')
    }
  }

  const handleToggleRecord = (recordId: number) => {
    setSelectedRecordIds(prev => {
      const next = new Set(prev)
      if (next.has(recordId)) {
        next.delete(recordId)
      } else {
        next.add(recordId)
      }
      return next
    })
  }

  const handleToggleAll = () => {
    if (selectedRecordIds.size === filteredRecords.length) {
      setSelectedRecordIds(new Set())
    } else {
      setSelectedRecordIds(new Set(filteredRecords.map(r => r.id)))
    }
  }

  const handleCommitSelected = async () => {
    if (selectedRecordIds.size === 0) return
    try {
      setIsCommitting(true)
      const res = await fetch('/api/commits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: selectedEntityId,
          change_ids: Array.from(selectedRecordIds)
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create commit')
      }
      // Clear selection and refresh
      setSelectedRecordIds(new Set())
      const recordsRes = await fetch(`/api/records?entity_id=${selectedEntityId}`)
      const recordsJson = await recordsRes.json()
      setRecords(recordsJson.data || [])
      setSummary(recordsJson.summary || summary)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to commit records')
    } finally {
      setIsCommitting(false)
    }
  }

  const getStatusIntent = (status: string) => {
    switch (status) {
      case 'valid': return 'success'
      case 'pending': return 'warning'
      case 'invalid': return 'danger'
      default: return 'none'
    }
  }

  if (loading && entities.length === 0) {
    return (
      <>
        <Header title="Data Entry" breadcrumb={['Data Management', 'Data Entry']} />
        <div className="page-content" style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={40} />
        </div>
      </>
    )
  }

  if (error && entities.length === 0) {
    return (
      <>
        <Header title="Data Entry" breadcrumb={['Data Management', 'Data Entry']} />
        <div className="page-content">
          <NonIdealState
            icon="error"
            title="Failed to load data"
            description={error}
            action={<Button icon="refresh" onClick={() => window.location.reload()}>Retry</Button>}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Data Entry" breadcrumb={['Data Management', 'Data Entry']} />
      
      <div className="page-content">
        <div className="section-header">
          <h2>Master Data Records</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <HTMLSelect 
              value={selectedEntityId} 
              onChange={(e) => setSelectedEntityId(Number(e.target.value))}
              options={entities.map(e => ({ value: e.id, label: e.name }))}
            />
            <HTMLSelect 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              options={[
                { value: '', label: 'All Status' },
                { value: 'pending', label: 'Pending' },
                { value: 'valid', label: 'Valid' },
                { value: 'invalid', label: 'Invalid' }
              ]}
            />
            <Button 
              icon="add" 
              intent="primary"
              small
              onClick={() => setIsCreateOpen(true)}
              disabled={!selectedEntityId || attributes.length === 0}
            >
              Add Record
            </Button>
          </div>
        </div>

        {entities.length === 0 && (
          <Callout intent="warning" icon="info-sign" style={{ marginBottom: 16 }}>
            No entities found. Create an entity first in the Entities page.
          </Callout>
        )}

        {selectedEntityId > 0 && attributes.length === 0 && (
          <Callout intent="warning" icon="info-sign" style={{ marginBottom: 16 }}>
            No attributes defined for {selectedEntity?.name}. Create attributes first in the Attributes page.
          </Callout>
        )}

        {/* Stats Cards */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div className="kpi-card" style={{ flex: 1 }}>
            <span className="kpi-label">Total Records</span>
            <span className="kpi-value">{summary.total}</span>
          </div>
          <div className="kpi-card" style={{ flex: 1 }}>
            <span className="kpi-label">Draft</span>
            <span className="kpi-value">{summary.draft}</span>
          </div>
          <div className="kpi-card" style={{ flex: 1 }}>
            <span className="kpi-label">Validated</span>
            <span className="kpi-value">{summary.validated}</span>
          </div>
          <div className="kpi-card" style={{ flex: 1 }}>
            <span className="kpi-label">Invalid</span>
            <span className="kpi-value">{summary.invalid}</span>
          </div>
        </div>

        <div className="data-table-container">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Spinner size={30} /></div>
          ) : filteredRecords.length === 0 ? (
            <NonIdealState
              icon="database"
              title="No Records"
              description={`No staged records found for ${selectedEntity?.name || 'this entity'}.`}
            />
          ) : (
            <HTMLTable striped interactive style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <Checkbox 
                      checked={filteredRecords.length > 0 && selectedRecordIds.size === filteredRecords.length}
                      indeterminate={selectedRecordIds.size > 0 && selectedRecordIds.size < filteredRecords.length}
                      onChange={handleToggleAll}
                    />
                  </th>
                  <th>Business Key</th>
                  {attributes.slice(0, 4).map(attr => (
                    <th key={attr.id}>{attr.name}</th>
                  ))}
                  <th>Operation</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} onClick={() => setSelectedRecord(record)} style={{ cursor: 'pointer' }}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Checkbox 
                        checked={selectedRecordIds.has(record.id)}
                        onChange={() => handleToggleRecord(record.id)}
                      />
                    </td>
                    <td><strong>{record.business_key}</strong></td>
                    {attributes.slice(0, 4).map(attr => (
                      <td key={attr.id}>
                        {String(record.data[attr.code] ?? '-')}
                      </td>
                    ))}
                    <td>
                      <Tag minimal>{record.operation}</Tag>
                    </td>
                    <td>
                      <Tag minimal intent={getStatusIntent(record.validation_status)}>
                        {record.validation_status}
                      </Tag>
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {new Date(record.created_at).toLocaleDateString()}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button minimal small icon="edit" title="Edit" onClick={() => handleOpenEdit(record)} disabled={record.validation_status !== 'pending'} />
                        <Button minimal small icon="trash" title="Delete" intent="danger" onClick={() => handleDeleteRecord(record.id)} disabled={record.validation_status !== 'pending'} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          )}
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-muted" style={{ fontSize: 11 }}>
            {filteredRecords.length} records{selectedRecordIds.size > 0 && ` (${selectedRecordIds.size} selected)`}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button 
              small 
              icon="git-commit" 
              disabled={selectedRecordIds.size === 0}
              loading={isCommitting}
              onClick={handleCommitSelected}
            >
              Commit Selected
            </Button>
            <Button small icon="export">Export</Button>
          </div>
        </div>
      </div>

      {/* Create Record Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={`Add ${selectedEntity?.name || 'Record'}`}
        icon="add"
        style={{ width: 500 }}
      >
        <div className="bp5-dialog-body">
          {attributes.map(attr => (
            <FormGroup 
              key={attr.id} 
              label={attr.name} 
              labelFor={attr.code}
              labelInfo={attr.is_required ? '(required)' : ''}
              helperText={attr.is_business_key ? 'Business Key' : undefined}
            >
              <InputGroup
                id={attr.code}
                type={attr.data_type === 'integer' || attr.data_type === 'decimal' ? 'number' : 'text'}
                placeholder={`Enter ${attr.name.toLowerCase()}`}
                value={String(newRecord[attr.code] ?? '')}
                onChange={(e) => setNewRecord({ 
                  ...newRecord, 
                  [attr.code]: attr.data_type === 'integer' ? parseInt(e.target.value) || '' :
                               attr.data_type === 'decimal' ? parseFloat(e.target.value) || '' :
                               e.target.value 
                })}
                intent={attr.is_business_key ? 'primary' : 'none'}
              />
            </FormGroup>
          ))}
        </div>
        <div className="bp5-dialog-footer">
          <div className="bp5-dialog-footer-actions">
            <Button small onClick={() => { setIsCreateOpen(false); setNewRecord({}); }}>Cancel</Button>
            <Button 
              small
              intent="primary" 
              onClick={handleCreate}
              loading={isCreating}
              disabled={!businessKeyAttr || !newRecord[businessKeyAttr.code]}
            >
              Add Record
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Record Detail Panel */}
      <Dialog
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title={`Record: ${selectedRecord?.business_key}`}
        icon="document"
        style={{ width: 550 }}
      >
        {selectedRecord && (
          <>
            <div className="bp5-dialog-body">
              <Tabs>
                <Tab id="data" title="Data" panel={
                  <div style={{ paddingTop: 16 }}>
                    {attributes.map(attr => (
                      <div key={attr.id} style={{ display: 'flex', marginBottom: 12 }}>
                        <span className="text-muted" style={{ width: 140, fontSize: 13 }}>{attr.name}</span>
                        <span style={{ fontWeight: 500 }}>
                          {String(selectedRecord.data[attr.code] ?? '-')}
                        </span>
                      </div>
                    ))}
                  </div>
                } />
                <Tab id="meta" title="Metadata" panel={
                  <div style={{ paddingTop: 16 }}>
                    <div style={{ display: 'flex', marginBottom: 12 }}>
                      <span className="text-muted" style={{ width: 140, fontSize: 13 }}>Business Key</span>
                      <span>{selectedRecord.business_key}</span>
                    </div>
                    <div style={{ display: 'flex', marginBottom: 12 }}>
                      <span className="text-muted" style={{ width: 140, fontSize: 13 }}>Operation</span>
                      <Tag>{selectedRecord.operation}</Tag>
                    </div>
                    <div style={{ display: 'flex', marginBottom: 12 }}>
                      <span className="text-muted" style={{ width: 140, fontSize: 13 }}>Status</span>
                      <Tag intent={getStatusIntent(selectedRecord.validation_status)}>{selectedRecord.validation_status}</Tag>
                    </div>
                    <div style={{ display: 'flex', marginBottom: 12 }}>
                      <span className="text-muted" style={{ width: 140, fontSize: 13 }}>Created</span>
                      <span>{new Date(selectedRecord.created_at).toLocaleString()} by {selectedRecord.created_by}</span>
                    </div>
                  </div>
                } />
              </Tabs>
            </div>
            <div className="bp5-dialog-footer">
              <div className="bp5-dialog-footer-actions">
                <Button small onClick={() => setSelectedRecord(null)}>Close</Button>
                <Button small icon="edit" onClick={() => { setSelectedRecord(null); handleOpenEdit(selectedRecord); }}>Edit</Button>
              </div>
            </div>
          </>
        )}
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog
        isOpen={isEditOpen}
        onClose={() => { setIsEditOpen(false); setEditRecord(null); setEditData({}); }}
        title={`Edit Record: ${editRecord?.business_key || ''}`}
        icon="edit"
        style={{ width: 500 }}
      >
        <div className="bp5-dialog-body">
          {attributes.map(attr => (
            <FormGroup 
              key={attr.id} 
              label={attr.name} 
              labelFor={`edit-${attr.code}`}
              labelInfo={attr.is_required ? '(required)' : ''}
              helperText={attr.is_business_key ? 'Business Key' : undefined}
            >
              <InputGroup
                id={`edit-${attr.code}`}
                type={attr.data_type === 'integer' || attr.data_type === 'decimal' ? 'number' : 'text'}
                placeholder={`Enter ${attr.name.toLowerCase()}`}
                value={String(editData[attr.code] ?? '')}
                onChange={(e) => setEditData({ 
                  ...editData, 
                  [attr.code]: attr.data_type === 'integer' ? parseInt(e.target.value) || '' :
                               attr.data_type === 'decimal' ? parseFloat(e.target.value) || '' :
                               e.target.value 
                })}
                intent={attr.is_business_key ? 'primary' : 'none'}
              />
            </FormGroup>
          ))}
        </div>
        <div className="bp5-dialog-footer">
          <div className="bp5-dialog-footer-actions">
            <Button small onClick={() => { setIsEditOpen(false); setEditRecord(null); setEditData({}); }} disabled={isEditing}>Cancel</Button>
            <Button 
              small
              intent="primary" 
              onClick={handleEditRecord}
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
