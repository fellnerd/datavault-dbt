'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Button,
  HTMLTable,
  Checkbox,
  Tag,
  NonIdealState,
  Tabs,
  Tab,
  ProgressBar,
  Callout,
  Dialog,
  DialogBody,
  DialogFooter
} from '@blueprintjs/core'
import { PageLayout } from '@/components/layout/PageLayout'
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard'

interface Commit {
  id: number
  code: string
  entity_id: number
  entity_name: string
  record_count: number
  status: 'pending' | 'approved' | 'rejected' | 'deployed'
  created_at: string
  created_by: string
  approved_at: string | null
  approved_by: string | null
  deployed_at: string | null
  deployed_by: string | null
}

interface DeploymentJob {
  id: string
  commitIds: number[]
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  startedAt?: string
  completedAt?: string
  logs: string[]
}

export default function DeployPage() {
  const [commits, setCommits] = useState<Commit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [selectedTab, setSelectedTab] = useState<string>('approved')
  const [selectedCommits, setSelectedCommits] = useState<Set<number>>(new Set())
  const [showDeployDialog, setShowDeployDialog] = useState(false)
  const [currentJob, setCurrentJob] = useState<DeploymentJob | null>(null)
  const [deploying, setDeploying] = useState(false)

  // Fetch commits
  useEffect(() => {
    fetchCommits()
  }, [])

  async function fetchCommits() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/commits')
      if (!res.ok) throw new Error('Failed to fetch commits')
      const data = await res.json()
      setCommits(data.data || data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Filter commits
  const approvedCommits = useMemo(() => 
    commits.filter(c => c.status === 'approved'), [commits])
  
  const deployedCommits = useMemo(() => 
    commits.filter(c => c.status === 'deployed'), [commits])

  // Calculate KPIs
  const kpis = useMemo(() => {
    const readyToDeploy = approvedCommits.length
    const totalRecords = approvedCommits.reduce((sum, c) => sum + (c.record_count || 0), 0)
    const deployedToday = deployedCommits.filter(c => 
      c.deployed_at && new Date(c.deployed_at).toDateString() === new Date().toDateString()
    ).length
    const totalDeployed = deployedCommits.length
    return { readyToDeploy, totalRecords, deployedToday, totalDeployed }
  }, [approvedCommits, deployedCommits])

  // Selection handlers
  function handleSelectAll(checked: boolean) {
    const targetCommits = selectedTab === 'approved' ? approvedCommits : deployedCommits
    if (checked) {
      setSelectedCommits(new Set(targetCommits.map(c => c.id)))
    } else {
      setSelectedCommits(new Set())
    }
  }

  function handleSelectRow(id: number, checked: boolean) {
    const newSelected = new Set(selectedCommits)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedCommits(newSelected)
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Deploy handler
  async function handleDeploy() {
    setShowDeployDialog(false)
    setDeploying(true)
    
    const commitIds = Array.from(selectedCommits)
    
    // Start deployment job UI
    setCurrentJob({
      id: `job-${Date.now()}`,
      commitIds,
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString(),
      logs: ['Starting deployment...']
    })

    try {
      // Deploy each commit
      for (let i = 0; i < commitIds.length; i++) {
        const commitId = commitIds[i]
        
        setCurrentJob(prev => prev ? {
          ...prev,
          progress: Math.round((i / commitIds.length) * 100),
          logs: [...prev.logs, `Deploying commit ${commitId}...`]
        } : null)

        const res = await fetch(`/api/commits/${commitId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'deployed' })
        })

        if (!res.ok) {
          throw new Error(`Failed to deploy commit ${commitId}`)
        }
      }

      // Complete
      setCurrentJob(prev => prev ? {
        ...prev,
        status: 'completed',
        progress: 100,
        completedAt: new Date().toISOString(),
        logs: [...prev.logs, 'Deployment completed successfully!']
      } : null)

      setSelectedCommits(new Set())
      await fetchCommits()

    } catch (err) {
      setCurrentJob(prev => prev ? {
        ...prev,
        status: 'failed',
        logs: [...prev.logs, `Error: ${err instanceof Error ? err.message : 'Unknown error'}`]
      } : null)
    } finally {
      setDeploying(false)
    }
  }

  const selectedTotal = useMemo(() => {
    return approvedCommits
      .filter(c => selectedCommits.has(c.id))
      .reduce((sum, c) => sum + (c.record_count || 0), 0)
  }, [approvedCommits, selectedCommits])

  const currentCommits = selectedTab === 'approved' ? approvedCommits : deployedCommits

  return (
    <PageLayout
      title="Deploy"
      breadcrumb={['Operations', 'Deploy']}
      loading={loading}
      loadingText="Lade Deployment-Daten..."
      error={error}
      onRetry={fetchCommits}
    >
      {/* KPI Cards */}
      <KpiGrid>
        <KpiCard label="Bereit zum Deploy" value={kpis.readyToDeploy} />
        <KpiCard label="Datensätze gesamt" value={kpis.totalRecords} />
        <KpiCard label="Heute deployed" value={kpis.deployedToday} />
        <KpiCard label="Insgesamt deployed" value={kpis.totalDeployed} />
      </KpiGrid>

      {/* Deployment Progress */}
      {currentJob && currentJob.status === 'running' && (
        <Callout intent="primary" icon="cloud-upload" title="Deployment läuft..." style={{ marginBottom: 16 }}>
          <ProgressBar
            value={currentJob.progress / 100}
            intent="primary"
            animate
            stripes
          />
          <pre style={{ 
            marginTop: 12, 
            background: 'var(--dark-gray5)', 
            padding: 12, 
            borderRadius: 4, 
            maxHeight: 120, 
            overflow: 'auto',
            fontSize: 12
          }}>
            {currentJob.logs.join('\n')}
          </pre>
        </Callout>
      )}

      {/* Deployment Complete */}
      {currentJob && currentJob.status === 'completed' && (
        <Callout intent="success" icon="tick-circle" title="Deployment erfolgreich!" style={{ marginBottom: 16 }}>
          {currentJob.commitIds.length} Commit(s) wurden erfolgreich in den Data Vault deployed.
          <Button 
            minimal 
            icon="cross" 
            style={{ float: 'right' }}
            onClick={() => setCurrentJob(null)}
          />
        </Callout>
      )}

      {/* Deployment Failed */}
      {currentJob && currentJob.status === 'failed' && (
        <Callout intent="danger" icon="error" title="Deployment fehlgeschlagen" style={{ marginBottom: 16 }}>
          <pre style={{ fontSize: 12 }}>{currentJob.logs.slice(-2).join('\n')}</pre>
          <Button 
            minimal 
            icon="cross" 
            style={{ float: 'right' }}
            onClick={() => setCurrentJob(null)}
          />
        </Callout>
      )}

      {/* Info Callout */}
      {approvedCommits.length > 0 && selectedCommits.size === 0 && (
        <Callout intent="primary" icon="info-sign" style={{ marginBottom: 16 }}>
          <strong>{approvedCommits.length} Commit(s) bereit zum Deployment</strong> - Wählen Sie 
          Commits aus und klicken Sie auf &quot;Deploy ausgewählte&quot; um die Änderungen in den Data Vault zu übertragen.
        </Callout>
      )}

      {/* Section Header */}
      <div className="section-header">
        <h2>Deployment Queue</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            icon="cloud-upload"
            intent="primary"
            text={`Deploy ausgewählte (${selectedCommits.size})`}
            disabled={selectedCommits.size === 0 || deploying}
            onClick={() => setShowDeployDialog(true)}
          />
          <Button
            icon="refresh"
            text="Aktualisieren"
            onClick={fetchCommits}
            minimal
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        id="deploy-tabs"
        selectedTabId={selectedTab}
        onChange={(newTab) => {
          setSelectedTab(newTab as string)
          setSelectedCommits(new Set())
        }}
      >
        <Tab id="approved" title={`Bereit zum Deploy (${approvedCommits.length})`} />
        <Tab id="deployed" title={`Deployed (${deployedCommits.length})`} />
      </Tabs>

      {/* Data Table */}
      <div className="data-table-container" style={{ marginTop: 16 }}>
        {currentCommits.length === 0 ? (
          <NonIdealState
            icon={selectedTab === 'approved' ? 'inbox' : 'cloud-upload'}
            title={selectedTab === 'approved' ? 'Keine Commits bereit' : 'Noch keine Deployments'}
            description={selectedTab === 'approved' 
              ? 'Es gibt keine genehmigten Commits, die deployed werden können.'
              : 'Es wurden noch keine Commits deployed.'
            }
          />
        ) : (
          <HTMLTable striped interactive style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <Checkbox
                    checked={selectedCommits.size === currentCommits.length && currentCommits.length > 0}
                    indeterminate={selectedCommits.size > 0 && selectedCommits.size < currentCommits.length}
                    onChange={(e) => handleSelectAll((e.target as HTMLInputElement).checked)}
                    disabled={selectedTab === 'deployed'}
                  />
                </th>
                <th>Commit-Code</th>
                <th>Entität</th>
                <th style={{ width: 100 }}>Datensätze</th>
                <th style={{ width: 100 }}>Status</th>
                <th>Erstellt</th>
                <th>Genehmigt</th>
                {selectedTab === 'deployed' && <th>Deployed</th>}
              </tr>
            </thead>
            <tbody>
              {currentCommits.map(commit => (
                <tr key={commit.id}>
                  <td>
                    <Checkbox
                      checked={selectedCommits.has(commit.id)}
                      onChange={(e) => handleSelectRow(commit.id, (e.target as HTMLInputElement).checked)}
                      disabled={selectedTab === 'deployed'}
                    />
                  </td>
                  <td><code>{commit.code}</code></td>
                  <td>{commit.entity_name}</td>
                  <td>{commit.record_count || 0}</td>
                  <td>
                    <Tag 
                      intent={commit.status === 'deployed' ? 'primary' : 'success'} 
                      minimal
                    >
                      {commit.status}
                    </Tag>
                  </td>
                  <td>
                    <div>{formatDate(commit.created_at)}</div>
                    <small style={{ color: 'var(--gray3)' }}>{commit.created_by}</small>
                  </td>
                  <td>
                    {commit.approved_at ? (
                      <>
                        <div>{formatDate(commit.approved_at)}</div>
                        <small style={{ color: 'var(--gray3)' }}>{commit.approved_by}</small>
                      </>
                    ) : '-'}
                  </td>
                  {selectedTab === 'deployed' && (
                    <td>
                      {commit.deployed_at ? (
                        <>
                          <div>{formatDate(commit.deployed_at)}</div>
                          <small style={{ color: 'var(--gray3)' }}>{commit.deployed_by}</small>
                        </>
                      ) : '-'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ fontSize: 12, color: '#a7b6c2' }}>
          {currentCommits.length} Commit(s)
          {selectedCommits.size > 0 && ` (${selectedCommits.size} ausgewählt, ${selectedTotal} Datensätze)`}
        </span>
      </div>

      {/* Deploy Confirmation Dialog */}
      <Dialog
        isOpen={showDeployDialog}
        onClose={() => setShowDeployDialog(false)}
        title="Deployment bestätigen"
        icon="cloud-upload"
      >
        <DialogBody>
          <p>Möchten Sie die folgenden Änderungen in den Data Vault deployen?</p>
          <ul>
            <li><strong>{selectedCommits.size}</strong> Commit(s)</li>
            <li><strong>{selectedTotal}</strong> Datensätze</li>
          </ul>
          <Callout intent="warning" icon="warning-sign">
            Dieser Vorgang kann nicht rückgängig gemacht werden. Die Daten werden 
            permanent in den Data Vault übertragen.
          </Callout>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button onClick={() => setShowDeployDialog(false)}>Abbrechen</Button>
              <Button intent="primary" icon="cloud-upload" onClick={handleDeploy}>
                Ja, deployen
              </Button>
            </>
          }
        />
      </Dialog>
    </PageLayout>
  )
}
