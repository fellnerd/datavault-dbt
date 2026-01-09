'use client'

import { useState, useEffect } from 'react'
import {
  Button,
  Tag,
  Card,
  Icon,
  ProgressBar,
  Callout,
  Spinner,
  Collapse,
  Dialog
} from '@blueprintjs/core'
import { Header } from '@/components/layout/Header'

interface Job {
  id: string
  type: 'dbt-run' | 'dbt-test' | 'validation' | 'deploy' | 'import'
  name: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  startedAt?: string
  completedAt?: string
  duration?: number
  triggeredBy: string
  target?: string
  logs?: string[]
  error?: string
}

const mockJobs: Job[] = [
  {
    id: 'job-001',
    type: 'dbt-run',
    name: 'Deploy Customer Entity',
    status: 'running',
    progress: 65,
    startedAt: '2024-01-08T11:45:00Z',
    triggeredBy: 'admin',
    target: 'hub_customer, sat_customer',
    logs: [
      '11:45:00 Starting dbt run...',
      '11:45:01 Running model hub_customer',
      '11:45:05 Model hub_customer completed',
      '11:45:06 Running model sat_customer',
      '11:45:08 Processing...'
    ]
  },
  {
    id: 'job-002',
    type: 'validation',
    name: 'Data Quality Check',
    status: 'queued',
    progress: 0,
    triggeredBy: 'scheduler',
    target: 'All Entities'
  },
  {
    id: 'job-003',
    type: 'dbt-test',
    name: 'Run Unit Tests',
    status: 'completed',
    progress: 100,
    startedAt: '2024-01-08T11:30:00Z',
    completedAt: '2024-01-08T11:32:15Z',
    duration: 135,
    triggeredBy: 'admin',
    target: 'test_*',
    logs: [
      '11:30:00 Starting dbt test...',
      '11:30:05 Running 12 tests...',
      '11:32:15 All tests passed!'
    ]
  },
  {
    id: 'job-004',
    type: 'deploy',
    name: 'Deploy to Production',
    status: 'completed',
    progress: 100,
    startedAt: '2024-01-08T10:00:00Z',
    completedAt: '2024-01-08T10:05:30Z',
    duration: 330,
    triggeredBy: 'approver',
    target: 'BATCH-2024-003',
    logs: [
      '10:00:00 Starting deployment...',
      '10:00:05 Executing DDL changes...',
      '10:02:00 Updating hub tables...',
      '10:04:00 Updating satellite tables...',
      '10:05:30 Deployment completed!'
    ]
  },
  {
    id: 'job-005',
    type: 'import',
    name: 'Import Customer CSV',
    status: 'failed',
    progress: 45,
    startedAt: '2024-01-08T09:00:00Z',
    completedAt: '2024-01-08T09:02:30Z',
    duration: 150,
    triggeredBy: 'editor',
    target: 'customers_q1_2024.csv',
    error: 'Row 234: Invalid country code "XY"',
    logs: [
      '09:00:00 Starting import...',
      '09:00:05 Reading file...',
      '09:00:10 Validating 500 rows...',
      '09:01:15 Processing rows 1-233...',
      '09:02:30 ERROR: Row 234: Invalid country code "XY"'
    ]
  },
  {
    id: 'job-006',
    type: 'dbt-run',
    name: 'Full Model Refresh',
    status: 'cancelled',
    progress: 20,
    startedAt: '2024-01-07T23:00:00Z',
    completedAt: '2024-01-07T23:05:00Z',
    duration: 300,
    triggeredBy: 'scheduler',
    target: '*',
    logs: [
      '23:00:00 Starting full refresh...',
      '23:02:00 Running staging models...',
      '23:05:00 Job cancelled by user'
    ]
  }
]

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>(mockJobs)
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set(['job-001']))
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [logsDialogOpen, setLogsDialogOpen] = useState(false)

  // Simulate running job progress
  useEffect(() => {
    const interval = setInterval(() => {
      setJobs(currentJobs => 
        currentJobs.map(job => {
          if (job.status === 'running' && job.progress < 100) {
            const newProgress = Math.min(job.progress + Math.random() * 5, 100)
            if (newProgress >= 100) {
              return {
                ...job,
                progress: 100,
                status: 'completed' as const,
                completedAt: new Date().toISOString(),
                duration: Math.floor((Date.now() - new Date(job.startedAt!).getTime()) / 1000),
                logs: [...(job.logs || []), `${new Date().toLocaleTimeString('de-DE')} Job completed successfully!`]
              }
            }
            return { ...job, progress: newProgress }
          }
          return job
        })
      )
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const runningJobs = jobs.filter(j => j.status === 'running')
  const queuedJobs = jobs.filter(j => j.status === 'queued')
  const completedJobs = jobs.filter(j => j.status === 'completed')
  const failedJobs = jobs.filter(j => j.status === 'failed')

  const getStatusIntent = (status: Job['status']) => {
    switch (status) {
      case 'running': return 'primary'
      case 'queued': return 'none'
      case 'completed': return 'success'
      case 'failed': return 'danger'
      case 'cancelled': return 'warning'
    }
  }

  const getTypeIcon = (type: Job['type']) => {
    switch (type) {
      case 'dbt-run': return 'play'
      case 'dbt-test': return 'lab-test'
      case 'validation': return 'tick-circle'
      case 'deploy': return 'cloud-upload'
      case 'import': return 'import'
    }
  }

  const toggleExpand = (jobId: string) => {
    const newExpanded = new Set(expandedJobs)
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId)
    } else {
      newExpanded.add(jobId)
    }
    setExpandedJobs(newExpanded)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const handleCancelJob = (job: Job) => {
    setJobs(jobs.map(j => 
      j.id === job.id 
        ? { ...j, status: 'cancelled' as const, completedAt: new Date().toISOString() }
        : j
    ))
  }

  const handleRetryJob = (job: Job) => {
    const newJob: Job = {
      ...job,
      id: `job-${Date.now()}`,
      status: 'queued',
      progress: 0,
      startedAt: undefined,
      completedAt: undefined,
      duration: undefined,
      error: undefined,
      logs: []
    }
    setJobs([newJob, ...jobs])
  }

  const JobCard = ({ job }: { job: Job }) => (
    <Card style={{ marginBottom: 12, padding: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          cursor: 'pointer'
        }}
        onClick={() => toggleExpand(job.id)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon
            icon={expandedJobs.has(job.id) ? 'chevron-down' : 'chevron-right'}
            size={16}
          />
          {job.status === 'running' ? (
            <Spinner size={16} intent="primary" />
          ) : (
            <Icon icon={getTypeIcon(job.type)} size={16} />
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>{job.name}</strong>
              <Tag minimal intent={getStatusIntent(job.status)}>
                {job.status}
              </Tag>
            </div>
            <div className="text-muted" style={{ fontSize: 11 }}>
              {job.type} • Target: {job.target || 'N/A'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {job.status === 'running' && (
            <div style={{ width: 100 }}>
              <ProgressBar 
                value={job.progress / 100} 
                intent="primary"
                stripes
                animate
              />
              <div className="text-muted" style={{ fontSize: 10, textAlign: 'center' }}>
                {Math.round(job.progress)}%
              </div>
            </div>
          )}
          <div className="text-muted" style={{ fontSize: 11 }}>
            <Icon icon="user" size={12} /> {job.triggeredBy}
          </div>
          {job.startedAt && (
            <div className="text-muted" style={{ fontSize: 11 }}>
              <Icon icon="time" size={12} /> {formatDate(job.startedAt)}
            </div>
          )}
          {job.duration && (
            <div className="text-muted" style={{ fontSize: 11 }}>
              {formatDuration(job.duration)}
            </div>
          )}
        </div>
      </div>

      <Collapse isOpen={expandedJobs.has(job.id)}>
        <div style={{
          borderTop: '1px solid var(--border-color, #e1e8ed)',
          padding: 16,
          background: 'var(--card-bg-secondary, #f5f8fa)'
        }}>
          {/* Error Message */}
          {job.error && (
            <Callout intent="danger" icon="error" style={{ marginBottom: 12 }}>
              {job.error}
            </Callout>
          )}

          {/* Progress for running jobs */}
          {job.status === 'running' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Progress</span>
                <span>{Math.round(job.progress)}%</span>
              </div>
              <ProgressBar 
                value={job.progress / 100} 
                intent="primary"
                stripes
                animate
              />
            </div>
          )}

          {/* Job Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div className="text-muted" style={{ fontSize: 10 }}>TYPE</div>
              <div>{job.type}</div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 10 }}>TARGET</div>
              <div><code>{job.target}</code></div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 10 }}>TRIGGERED BY</div>
              <div>{job.triggeredBy}</div>
            </div>
          </div>

          {/* Logs Preview */}
          {job.logs && job.logs.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="text-muted" style={{ fontSize: 10, marginBottom: 4 }}>LOGS (last 3)</div>
              <div style={{ 
                background: '#1c2127', 
                color: '#a7b6c2', 
                padding: 8, 
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: 11,
                maxHeight: 100,
                overflow: 'auto'
              }}>
                {job.logs.slice(-3).map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {job.logs && (
              <Button 
                small 
                icon="console"
                onClick={(e) => { 
                  e.stopPropagation()
                  setSelectedJob(job)
                  setLogsDialogOpen(true)
                }}
              >
                Full Logs
              </Button>
            )}
            {job.status === 'running' && (
              <Button 
                small 
                intent="danger"
                icon="stop"
                onClick={(e) => { e.stopPropagation(); handleCancelJob(job); }}
              >
                Cancel
              </Button>
            )}
            {(job.status === 'failed' || job.status === 'cancelled') && (
              <Button 
                small 
                icon="refresh"
                onClick={(e) => { e.stopPropagation(); handleRetryJob(job); }}
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      </Collapse>
    </Card>
  )

  return (
    <>
      <Header title="Jobs" breadcrumb={['Operations', 'Jobs']} />

      <div className="page-content">
        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div className="kpi-card" style={{ flex: 1 }}>
            <span className="kpi-label">Running</span>
            <span className="kpi-value" style={{ color: runningJobs.length > 0 ? 'var(--intent-primary, #137cbd)' : undefined }}>
              {runningJobs.length}
            </span>
          </div>
          <div className="kpi-card" style={{ flex: 1 }}>
            <span className="kpi-label">Queued</span>
            <span className="kpi-value">{queuedJobs.length}</span>
          </div>
          <div className="kpi-card" style={{ flex: 1 }}>
            <span className="kpi-label">Completed (24h)</span>
            <span className="kpi-value">{completedJobs.length}</span>
          </div>
          <div className="kpi-card" style={{ flex: 1 }}>
            <span className="kpi-label">Failed (24h)</span>
            <span className="kpi-value" style={{ color: failedJobs.length > 0 ? 'var(--intent-danger, #db3737)' : undefined }}>
              {failedJobs.length}
            </span>
          </div>
        </div>

        {/* Running Jobs Alert */}
        {runningJobs.length > 0 && (
          <Callout intent="primary" icon="info-sign" style={{ marginBottom: 16 }}>
            {runningJobs.length} job(s) currently running
          </Callout>
        )}

        {/* Job Queue Header */}
        <div className="section-header">
          <h2>Job Queue</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button small icon="play" intent="primary">
              Run dbt
            </Button>
            <Button small icon="lab-test">
              Run Tests
            </Button>
          </div>
        </div>

        {/* Running Jobs */}
        {runningJobs.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>
              <Spinner size={14} intent="primary" /> Running
            </h3>
            {runningJobs.map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}

        {/* Queued Jobs */}
        {queuedJobs.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>
              <Icon icon="time" /> Queued ({queuedJobs.length})
            </h3>
            {queuedJobs.map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}

        {/* Recent Jobs */}
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>
            <Icon icon="history" /> Recent Jobs
          </h3>
          {jobs
            .filter(j => j.status !== 'running' && j.status !== 'queued')
            .slice(0, 10)
            .map(job => (
              <JobCard key={job.id} job={job} />
            ))}
        </div>
      </div>

      {/* Full Logs Dialog */}
      <Dialog
        isOpen={logsDialogOpen}
        onClose={() => setLogsDialogOpen(false)}
        title={`Logs: ${selectedJob?.name}`}
        icon="console"
        style={{ width: 700 }}
      >
        <div className="bp5-dialog-body">
          {selectedJob && (
            <div style={{ 
              background: '#1c2127', 
              color: '#a7b6c2', 
              padding: 16, 
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 12,
              maxHeight: 400,
              overflow: 'auto'
            }}>
              {selectedJob.logs?.map((log, i) => (
                <div key={i} style={{ 
                  marginBottom: 4,
                  color: log.includes('ERROR') ? '#ff7373' : 
                         log.includes('completed') || log.includes('passed') ? '#3dcc91' : 
                         '#a7b6c2'
                }}>
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bp5-dialog-footer">
          <div className="bp5-dialog-footer-actions">
            <Button icon="download" onClick={() => {}}>Download</Button>
            <Button onClick={() => setLogsDialogOpen(false)}>Close</Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
