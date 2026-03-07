# Plan: Jobs-Seite Optimierung & Neue Features

Die aktuelle Jobs-Seite ist funktional solide implementiert. Basierend auf der Analyse hier der Verbesserungsplan:

---

## Schritt 1: UX-Verbesserungen (Quick Wins)

### 1. Filter & Suche hinzufügen

**Ziel:** Benutzer können Jobs schnell finden und filtern

**UI-Komponenten:**
```tsx
// Filterleiste unter Stats-Cards
<div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
  <InputGroup 
    leftIcon="search" 
    placeholder="Jobs suchen..." 
    value={searchQuery}
    onChange={e => setSearchQuery(e.target.value)}
  />
  <HTMLSelect value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
    <option value="all">Alle Status</option>
    <option value="running">Läuft</option>
    <option value="queued">Wartend</option>
    <option value="completed">Fertig</option>
    <option value="failed">Fehler</option>
  </HTMLSelect>
  <HTMLSelect value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
    <option value="all">Alle Typen</option>
    <option value="dbt-run">dbt Run</option>
    <option value="dbt-test">dbt Test</option>
    <option value="deploy">Deploy</option>
    <option value="schema-deploy">Schema Deploy</option>
    <option value="validate">Validierung</option>
  </HTMLSelect>
</div>
```

**State-Änderungen (page.tsx):**
```tsx
const [searchQuery, setSearchQuery] = useState('')
const [statusFilter, setStatusFilter] = useState<string>('all')
const [typeFilter, setTypeFilter] = useState<string>('all')

// Gefilterte Jobs
const filteredJobs = useMemo(() => {
  return jobs.filter(job => {
    const matchesSearch = !searchQuery || 
      job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.target?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || normalizeStatus(job.status) === statusFilter
    const matchesType = typeFilter === 'all' || job.type === typeFilter
    return matchesSearch && matchesStatus && matchesType
  })
}, [jobs, searchQuery, statusFilter, typeFilter])
```

**Dateien zu ändern:**
- `src/app/(app)/jobs/page.tsx` - Filter-UI und State hinzufügen

---

### 2. Pagination implementieren

**Ziel:** Mehr als 20 Jobs laden können mit "Mehr laden" Button

**API-Änderungen (route.ts):**
```tsx
// GET /api/jobs?limit=20&offset=0
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  
  // Jobs aus allen Kategorien holen mit Pagination
  const allJobs = await Promise.all([
    queue.getActive(offset, offset + limit),
    queue.getWaiting(offset, offset + limit),
    queue.getCompleted(offset, offset + limit),
    queue.getFailed(offset, offset + limit),
  ])
  
  return NextResponse.json({
    jobs: flattenAndSort(allJobs),
    hasMore: /* prüfen ob weitere Jobs existieren */,
    total: await queue.getJobCounts()
  })
}
```

**Hook-Änderungen (useJobs.ts):**
```tsx
export function useJobs(initialLimit = 20) {
  const [limit, setLimit] = useState(initialLimit)
  
  const query = useQuery({
    queryKey: ['jobs', limit],
    queryFn: () => fetchJobs({ limit }),
  })
  
  const loadMore = () => setLimit(prev => prev + 20)
  
  return { ...query, loadMore, hasMore: query.data?.hasMore }
}
```

**UI-Änderung (page.tsx):**
```tsx
{hasMore && (
  <Button 
    fill 
    minimal 
    icon="more" 
    onClick={loadMore}
    loading={isLoading}
  >
    Weitere Jobs laden
  </Button>
)}
```

**Dateien zu ändern:**
- `src/app/api/jobs/route.ts` - Pagination Parameter
- `src/hooks/useJobs.ts` - loadMore Funktion
- `src/app/(app)/jobs/page.tsx` - "Mehr laden" Button

---

### 3. Datum/Zeit-Filter

**Ziel:** Jobs nach Zeitraum filtern

**UI-Komponenten:**
```tsx
<ButtonGroup>
  <Button 
    active={dateFilter === 'today'} 
    onClick={() => setDateFilter('today')}
  >
    Heute
  </Button>
  <Button 
    active={dateFilter === 'week'} 
    onClick={() => setDateFilter('week')}
  >
    7 Tage
  </Button>
  <Button 
    active={dateFilter === 'month'} 
    onClick={() => setDateFilter('month')}
  >
    30 Tage
  </Button>
  <Button 
    active={dateFilter === 'all'} 
    onClick={() => setDateFilter('all')}
  >
    Alle
  </Button>
</ButtonGroup>
```

**Filter-Logik:**
```tsx
const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('all')

const getDateCutoff = (filter: string): Date | null => {
  const now = new Date()
  switch (filter) {
    case 'today': return new Date(now.setHours(0, 0, 0, 0))
    case 'week': return new Date(now.setDate(now.getDate() - 7))
    case 'month': return new Date(now.setDate(now.getDate() - 30))
    default: return null
  }
}

// In filteredJobs:
const cutoff = getDateCutoff(dateFilter)
const matchesDate = !cutoff || new Date(job.timestamp) >= cutoff
```

**Dateien zu ändern:**
- `src/app/(app)/jobs/page.tsx` - Datum-Filter UI und Logik

---

## Schritt 2: Neue Funktionalitäten

### 4. Job manuell starten (Dialog)

**Ziel:** Benutzer können Jobs direkt von der Jobs-Seite starten

**Neue Komponente `CreateJobDialog.tsx`:**
```tsx
interface CreateJobDialogProps {
  isOpen: boolean
  onClose: () => void
  onJobCreated: (jobId: string) => void
}

export function CreateJobDialog({ isOpen, onClose, onJobCreated }: CreateJobDialogProps) {
  const [jobType, setJobType] = useState<JobType>('dbt-run')
  const [target, setTarget] = useState('*')
  const [params, setParams] = useState<Record<string, any>>({})
  
  const jobTypeOptions = [
    { value: 'dbt-run', label: 'dbt Run', icon: 'build' },
    { value: 'dbt-test', label: 'dbt Test', icon: 'lab-test' },
    { value: 'validate', label: 'Validierung', icon: 'tick-circle' },
    { value: 'schema-deploy', label: 'Schema Deploy', icon: 'database' },
  ]
  
  // Dynamische Parameter je nach Job-Type
  const renderParams = () => {
    switch (jobType) {
      case 'dbt-run':
        return (
          <>
            <FormGroup label="Target (Model/Tag)">
              <InputGroup value={target} onChange={e => setTarget(e.target.value)} />
            </FormGroup>
            <Checkbox 
              label="Full Refresh" 
              checked={params.fullRefresh} 
              onChange={e => setParams({...params, fullRefresh: e.target.checked})}
            />
          </>
        )
      case 'dbt-test':
        return (
          <FormGroup label="Test-Selector">
            <InputGroup value={target} onChange={e => setTarget(e.target.value)} />
          </FormGroup>
        )
      // ... weitere Types
    }
  }
  
  const handleSubmit = async () => {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ type: jobType, target, params })
    })
    const { jobId } = await res.json()
    onJobCreated(jobId)
    onClose()
  }
  
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Neuer Job" icon="add">
      <div className={Classes.DIALOG_BODY}>
        <FormGroup label="Job-Typ">
          <HTMLSelect value={jobType} onChange={e => setJobType(e.target.value as JobType)}>
            {jobTypeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </HTMLSelect>
        </FormGroup>
        {renderParams()}
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button intent="primary" onClick={handleSubmit}>Job starten</Button>
      </div>
    </Dialog>
  )
}
```

**Integration in page.tsx:**
```tsx
const [createDialogOpen, setCreateDialogOpen] = useState(false)

// Im Header:
<Button icon="add" intent="primary" onClick={() => setCreateDialogOpen(true)}>
  Neuer Job
</Button>

// Nach Job-Erstellung:
const handleJobCreated = (jobId: string) => {
  startJobStream(jobId, 'Neuer Job')
  refetch()
}
```

**Dateien zu erstellen/ändern:**
- `src/components/jobs/CreateJobDialog.tsx` - Neue Komponente
- `src/app/(app)/jobs/page.tsx` - Dialog-Integration

---

### 5. Job-Details-Seite

**Ziel:** Separate Seite mit vollständigen Job-Informationen

**Neue Route `src/app/(app)/jobs/[id]/page.tsx`:**
```tsx
'use client'

import { useParams } from 'next/navigation'
import { useJob } from '@/hooks/useJobs'

export default function JobDetailPage() {
  const { id } = useParams()
  const { data: job, isLoading } = useJob(id as string)
  
  if (isLoading) return <Spinner />
  if (!job) return <NonIdealState icon="search" title="Job nicht gefunden" />
  
  return (
    <>
      <Header 
        title={job.name} 
        breadcrumb={['Operations', 'Jobs', job.id]} 
      />
      
      <div className="page-content">
        {/* Job-Info Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Card>
            <h4>Status</h4>
            <Tag large intent={getStatusIntent(job.status)}>{getStatusLabel(job.status)}</Tag>
          </Card>
          <Card>
            <h4>Typ</h4>
            <code>{job.type}</code>
          </Card>
          <Card>
            <h4>Dauer</h4>
            <span>{formatDuration(job.duration)}</span>
          </Card>
          <Card>
            <h4>Gestartet von</h4>
            <span>{job.triggeredBy}</span>
          </Card>
        </div>
        
        {/* Timeline */}
        <Card style={{ marginTop: 16 }}>
          <h3>Timeline</h3>
          <div className="timeline">
            <TimelineItem label="Erstellt" time={job.createdAt} />
            <TimelineItem label="Gestartet" time={job.startedAt} />
            <TimelineItem label="Beendet" time={job.completedAt} />
          </div>
        </Card>
        
        {/* Parameter */}
        <Card style={{ marginTop: 16 }}>
          <h3>Parameter</h3>
          <pre>{JSON.stringify(job.data?.params, null, 2)}</pre>
        </Card>
        
        {/* Vollständige Logs */}
        <Card style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3>Logs</h3>
            <Button small icon="download" onClick={() => downloadLogs(job)}>
              Download
            </Button>
          </div>
          <div className="log-terminal" style={{ height: 500 }}>
            {job.logs?.map((log, i) => (
              <div key={i} className={getLogClass(log)}>{log}</div>
            ))}
          </div>
        </Card>
        
        {/* Actions */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <Button icon="repeat" onClick={() => handleRerun(job)}>
            Erneut ausführen
          </Button>
          <Button icon="duplicate" onClick={() => handleClone(job)}>
            Mit anderen Parametern
          </Button>
        </div>
      </div>
    </>
  )
}
```

**Neuer Hook `useJob` (useJobs.ts erweitern):**
```tsx
export function useJob(jobId: string) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => fetch(`/api/jobs/${jobId}`).then(r => r.json()),
    enabled: !!jobId
  })
}
```

**Link von JobCard zur Detail-Seite:**
```tsx
// In JobCard onClick:
<Button small minimal icon="share" onClick={() => router.push(`/jobs/${job.id}`)}>
  Details
</Button>
```

**Dateien zu erstellen/ändern:**
- `src/app/(app)/jobs/[id]/page.tsx` - Neue Detail-Seite
- `src/hooks/useJobs.ts` - useJob Hook
- `src/app/(app)/jobs/page.tsx` - Link zu Details

---

### 6. Bulk-Aktionen

**Ziel:** Mehrere Jobs gleichzeitig bearbeiten

**State-Änderungen:**
```tsx
const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
const [selectionMode, setSelectionMode] = useState(false)

const toggleSelection = (jobId: string) => {
  const newSelection = new Set(selectedJobs)
  if (newSelection.has(jobId)) {
    newSelection.delete(jobId)
  } else {
    newSelection.add(jobId)
  }
  setSelectedJobs(newSelection)
}

const selectAll = () => {
  setSelectedJobs(new Set(filteredJobs.map(j => j.id)))
}

const clearSelection = () => {
  setSelectedJobs(new Set())
  setSelectionMode(false)
}
```

**Bulk-Actions-Bar:**
```tsx
{selectedJobs.size > 0 && (
  <Card style={{ 
    position: 'sticky', 
    top: 0, 
    zIndex: 10, 
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  }}>
    <span>{selectedJobs.size} Jobs ausgewählt</span>
    <ButtonGroup>
      <Button icon="repeat" onClick={handleBulkRetry}>
        Alle wiederholen
      </Button>
      <Button icon="stop" intent="danger" onClick={handleBulkCancel}>
        Alle abbrechen
      </Button>
      <Button icon="cross" minimal onClick={clearSelection}>
        Auswahl aufheben
      </Button>
    </ButtonGroup>
  </Card>
)}
```

**API für Bulk-Operationen:**
```tsx
// POST /api/jobs/bulk
export async function POST(request: NextRequest) {
  const { action, jobIds } = await request.json()
  
  const results = await Promise.allSettled(
    jobIds.map(async (id: string) => {
      if (action === 'retry') {
        return retryJob(id)
      } else if (action === 'cancel') {
        return cancelJob(id)
      }
    })
  )
  
  return NextResponse.json({
    success: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length
  })
}
```

**Checkbox in JobCard:**
```tsx
{selectionMode && (
  <Checkbox
    checked={selectedJobs.has(job.id)}
    onChange={() => toggleSelection(job.id)}
    onClick={e => e.stopPropagation()}
  />
)}
```

**Dateien zu erstellen/ändern:**
- `src/app/(app)/jobs/page.tsx` - Selection-State und UI
- `src/app/api/jobs/bulk/route.ts` - Bulk-API Endpoint
- `src/hooks/useJobs.ts` - useBulkAction Hook

---

## Schritt 3: Monitoring & Status

### 7. Worker-Status-Anzeige

**Ziel:** Live-Indikator ob Worker läuft

**Neue API `src/app/api/jobs/worker-health/route.ts`:**
```tsx
import { getMdsQueue } from '@/lib/queue/config'

export async function GET() {
  const queue = getMdsQueue()
  
  try {
    // Worker-Info aus Redis holen
    const workers = await queue.getWorkers()
    const isPaused = await queue.isPaused()
    const counts = await queue.getJobCounts()
    
    // Letzte Aktivität prüfen
    const recentCompleted = await queue.getCompleted(0, 1)
    const lastActivity = recentCompleted[0]?.finishedOn 
      ? new Date(recentCompleted[0].finishedOn)
      : null
    
    const isHealthy = workers.length > 0 && !isPaused
    const isStale = lastActivity && (Date.now() - lastActivity.getTime()) > 5 * 60 * 1000
    
    return NextResponse.json({
      status: isHealthy ? (isStale ? 'idle' : 'healthy') : 'unhealthy',
      workers: workers.length,
      isPaused,
      lastActivity: lastActivity?.toISOString(),
      queuedJobs: counts.waiting + counts.delayed,
      activeJobs: counts.active
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      error: 'Failed to check worker health' 
    }, { status: 500 })
  }
}
```

**Hook `useWorkerHealth`:**
```tsx
export function useWorkerHealth() {
  return useQuery({
    queryKey: ['worker-health'],
    queryFn: () => fetch('/api/jobs/worker-health').then(r => r.json()),
    refetchInterval: 10000 // Alle 10 Sekunden
  })
}
```

**UI-Komponente `WorkerStatus`:**
```tsx
function WorkerStatus() {
  const { data: health, isLoading } = useWorkerHealth()
  
  if (isLoading) return <Spinner size={12} />
  
  const statusConfig = {
    healthy: { icon: 'pulse', intent: 'success', label: 'Worker aktiv' },
    idle: { icon: 'time', intent: 'warning', label: 'Worker idle' },
    unhealthy: { icon: 'offline', intent: 'danger', label: 'Worker offline' },
    error: { icon: 'error', intent: 'danger', label: 'Fehler' }
  }
  
  const config = statusConfig[health?.status] || statusConfig.error
  
  return (
    <Tooltip content={`${health?.workers || 0} Worker, ${health?.queuedJobs || 0} in Queue`}>
      <Tag icon={config.icon} intent={config.intent} minimal>
        {config.label}
      </Tag>
    </Tooltip>
  )
}
```

**Integration im Header:**
```tsx
<Header title="Jobs" breadcrumb={['Operations', 'Jobs']}>
  <WorkerStatus />
</Header>
```

**Dateien zu erstellen/ändern:**
- `src/app/api/jobs/worker-health/route.ts` - Health-Check API
- `src/hooks/useWorkerHealth.ts` - Neuer Hook
- `src/components/jobs/WorkerStatus.tsx` - Status-Komponente
- `src/app/(app)/jobs/page.tsx` - Integration

---

### 8. Job-Metriken Dashboard

**Ziel:** Übersicht über Job-Performance und Trends

**Neue API `src/app/api/jobs/metrics/route.ts`:**
```tsx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '7')
  
  const queue = getMdsQueue()
  const completed = await queue.getCompleted(0, 1000)
  const failed = await queue.getFailed(0, 1000)
  
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  
  // Jobs im Zeitraum filtern
  const recentCompleted = completed.filter(j => j.finishedOn && j.finishedOn > cutoff)
  const recentFailed = failed.filter(j => j.finishedOn && j.finishedOn > cutoff)
  
  // Metriken berechnen
  const byType = groupBy(recentCompleted, j => j.name)
  const avgDuration = Object.fromEntries(
    Object.entries(byType).map(([type, jobs]) => [
      type,
      Math.round(jobs.reduce((sum, j) => sum + (j.finishedOn! - j.processedOn!), 0) / jobs.length / 1000)
    ])
  )
  
  // Tägliche Statistiken
  const dailyStats = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const dayStart = new Date(date.setHours(0, 0, 0, 0)).getTime()
    const dayEnd = dayStart + 24 * 60 * 60 * 1000
    
    return {
      date: new Date(dayStart).toISOString().split('T')[0],
      completed: recentCompleted.filter(j => j.finishedOn! >= dayStart && j.finishedOn! < dayEnd).length,
      failed: recentFailed.filter(j => j.finishedOn! >= dayStart && j.finishedOn! < dayEnd).length
    }
  }).reverse()
  
  return NextResponse.json({
    totalCompleted: recentCompleted.length,
    totalFailed: recentFailed.length,
    successRate: Math.round(recentCompleted.length / (recentCompleted.length + recentFailed.length) * 100),
    avgDurationByType: avgDuration,
    dailyStats
  })
}
```

**Metrics-Komponente:**
```tsx
function JobMetrics() {
  const { data: metrics } = useJobMetrics(7)
  
  return (
    <Card style={{ marginBottom: 16 }}>
      <h3>Job-Metriken (7 Tage)</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <div className="kpi-card">
          <span className="kpi-label">Erfolgsrate</span>
          <span className="kpi-value" style={{ color: metrics?.successRate > 90 ? 'green' : 'orange' }}>
            {metrics?.successRate}%
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Abgeschlossen</span>
          <span className="kpi-value">{metrics?.totalCompleted}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Fehlgeschlagen</span>
          <span className="kpi-value" style={{ color: metrics?.totalFailed > 0 ? 'red' : undefined }}>
            {metrics?.totalFailed}
          </span>
        </div>
      </div>
      
      {/* Einfaches Bar-Chart für Daily Stats */}
      <div style={{ display: 'flex', gap: 4, height: 100, alignItems: 'flex-end' }}>
        {metrics?.dailyStats.map(day => (
          <Tooltip key={day.date} content={`${day.date}: ${day.completed} OK, ${day.failed} Fehler`}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ 
                background: 'var(--intent-success)', 
                height: day.completed * 5,
                borderRadius: 2
              }} />
              <div style={{ 
                background: 'var(--intent-danger)', 
                height: day.failed * 5,
                borderRadius: 2
              }} />
            </div>
          </Tooltip>
        ))}
      </div>
      
      {/* Durchschnittliche Dauer pro Type */}
      <h4 style={{ marginTop: 16 }}>Ø Laufzeit pro Typ</h4>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(metrics?.avgDurationByType || {}).map(([type, seconds]) => (
          <Tag key={type} minimal>
            {type}: {formatDuration(seconds)}
          </Tag>
        ))}
      </div>
    </Card>
  )
}
```

**Dateien zu erstellen/ändern:**
- `src/app/api/jobs/metrics/route.ts` - Metrics API
- `src/hooks/useJobMetrics.ts` - Neuer Hook
- `src/components/jobs/JobMetrics.tsx` - Metrics-Komponente
- `src/app/(app)/jobs/page.tsx` - Integration (collapsible)

---

## Schritt 4: Erweiterte Features

### 9. "Add to Queue" Button auf Commits/Deploy-Seiten

**Ziel:** Jobs können zur Warteschlange hinzugefügt werden, ohne sofort ausgeführt zu werden

**Konzept:**
- Neben dem "Deploy"-Button gibt es einen "In Warteschlange"-Button
- Job wird mit Status `paused` oder `delayed` erstellt
- Auf der Jobs-Seite kann der Job:
  - Sofort gestartet werden
  - Bearbeitet werden (Parameter ändern)
  - Eingeplant werden (Cron/Zeitpunkt)
  - Gelöscht werden

**Neuer Job-Status: `queued-paused`**
```tsx
// In config.ts - Erweiterter MdsJobData
interface MdsJobData {
  // ... existing fields
  queuedOnly?: boolean // Job wurde nur zur Queue hinzugefügt, nicht gestartet
  scheduledFor?: string // ISO-Timestamp für geplante Ausführung
  editableUntilStart?: boolean // Parameter können vor Start geändert werden
}
```

**API-Änderung für "Add to Queue":**
```tsx
// POST /api/jobs - Erweiterung
export async function POST(request: NextRequest) {
  const { type, target, params, queueOnly, scheduledFor } = await request.json()
  
  const jobOptions: JobsOptions = {
    // Standard-Optionen...
  }
  
  if (queueOnly) {
    // Job wird pausiert erstellt - wartet auf manuelle Freigabe
    jobOptions.delay = scheduledFor 
      ? new Date(scheduledFor).getTime() - Date.now()
      : undefined
    
    // Markiere Job als "nur in Queue"
    const jobData: MdsJobData = {
      type,
      target,
      params,
      queuedOnly: true,
      scheduledFor,
      editableUntilStart: true,
      userId: session.user.id,
      userName: session.user.name
    }
    
    const job = await queue.add(type, jobData, {
      ...jobOptions,
      // Pausiert starten wenn kein scheduledFor
      ...(queueOnly && !scheduledFor ? { delay: Number.MAX_SAFE_INTEGER } : {})
    })
    
    return NextResponse.json({ 
      jobId: job.id, 
      status: 'queued',
      message: 'Job zur Warteschlange hinzugefügt'
    })
  }
  
  // Normale sofortige Ausführung
  const job = await addJob(type, target, session.user.id, session.user.name, params)
  return NextResponse.json({ jobId: job.id, status: 'active' })
}
```

**UI auf Commits-Seite (`commits/page.tsx`):**
```tsx
// Bestehender Deploy-Dialog erweitern
<div className={Classes.DIALOG_FOOTER}>
  <div className={Classes.DIALOG_FOOTER_ACTIONS}>
    <Button onClick={() => setDeployDialogOpen(false)}>
      Abbrechen
    </Button>
    
    {/* Neuer "Add to Queue" Button */}
    <Popover
      content={
        <Menu>
          <MenuItem 
            icon="time" 
            text="In Warteschlange" 
            onClick={() => handleDeploy({ queueOnly: true })}
          />
          <MenuItem 
            icon="calendar" 
            text="Zeitpunkt planen..." 
            onClick={() => setScheduleDialogOpen(true)}
          />
        </Menu>
      }
      position="bottom"
    >
      <Button icon="add-to-artifact" rightIcon="caret-down">
        Zur Queue
      </Button>
    </Popover>
    
    {/* Bestehender Deploy Button */}
    <Button 
      intent="primary" 
      icon="cloud-upload" 
      onClick={() => handleDeploy({ queueOnly: false })}
      loading={deploying}
    >
      Jetzt deployen
    </Button>
  </div>
</div>
```

**Erweiterte handleDeploy Funktion:**
```tsx
const handleDeploy = async (options: { queueOnly: boolean; scheduledFor?: string }) => {
  if (!deployCommit) return
  
  try {
    setDeploying(true)
    
    const deployRes = await fetch('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_ids: [deployCommit.id],
        deploy_mode: deployMode,
        queueOnly: options.queueOnly,
        scheduledFor: options.scheduledFor
      })
    })
    
    const result = await deployRes.json()
    
    if (options.queueOnly) {
      // Erfolgs-Toast anzeigen
      AppToaster.show({
        intent: 'success',
        icon: 'tick',
        message: (
          <span>
            Job zur Warteschlange hinzugefügt. 
            <a href="/jobs" style={{ marginLeft: 8 }}>Zur Jobs-Seite →</a>
          </span>
        )
      })
      setDeployDialogOpen(false)
      fetchCommits()
    } else {
      // Bestehende Live-Streaming Logik...
      startJobStream(result.job_id)
    }
  } catch (err) {
    // Error handling...
  } finally {
    setDeploying(false)
  }
}
```

**Schedule-Dialog für geplante Ausführung:**
```tsx
function ScheduleDeployDialog({ isOpen, onClose, onSchedule }) {
  const [scheduleType, setScheduleType] = useState<'datetime' | 'delay'>('datetime')
  const [scheduledFor, setScheduledFor] = useState<Date>(new Date())
  const [delayMinutes, setDelayMinutes] = useState(30)
  
  const handleSubmit = () => {
    let targetTime: Date
    if (scheduleType === 'datetime') {
      targetTime = scheduledFor
    } else {
      targetTime = new Date(Date.now() + delayMinutes * 60 * 1000)
    }
    onSchedule(targetTime.toISOString())
    onClose()
  }
  
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Deployment planen" icon="calendar">
      <div className={Classes.DIALOG_BODY}>
        <RadioGroup 
          selectedValue={scheduleType} 
          onChange={e => setScheduleType(e.currentTarget.value as any)}
        >
          <Radio value="datetime" label="Zu einem bestimmten Zeitpunkt" />
          <Radio value="delay" label="Nach einer Verzögerung" />
        </RadioGroup>
        
        {scheduleType === 'datetime' ? (
          <FormGroup label="Datum & Uhrzeit">
            <DateInput3
              value={scheduledFor.toISOString()}
              onChange={date => setScheduledFor(new Date(date))}
              timePrecision="minute"
              minDate={new Date()}
            />
          </FormGroup>
        ) : (
          <FormGroup label="Verzögerung (Minuten)">
            <NumericInput 
              value={delayMinutes} 
              onValueChange={setDelayMinutes}
              min={1}
              max={1440}
            />
            <div className="text-muted">
              Ausführung: {new Date(Date.now() + delayMinutes * 60 * 1000).toLocaleString('de-DE')}
            </div>
          </FormGroup>
        )}
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button intent="primary" onClick={handleSubmit}>Planen</Button>
      </div>
    </Dialog>
  )
}
```

**Anpassungen auf Jobs-Seite für pausierte Jobs:**

```tsx
// Neue Kategorie für pausierte/geplante Jobs
const pausedJobs = jobs.filter(j => j.data?.queuedOnly && !j.processedOn)
const scheduledJobs = jobs.filter(j => j.data?.scheduledFor && new Date(j.data.scheduledFor) > new Date())

// UI-Sektion für pausierte Jobs
{pausedJobs.length > 0 && (
  <div style={{ marginBottom: 24 }}>
    <h3 style={{ fontSize: 14, marginBottom: 8 }}>
      <Icon icon="pause" /> Wartend auf Freigabe ({pausedJobs.length})
    </h3>
    {pausedJobs.map(job => (
      <JobCard 
        key={job.id} 
        job={job} 
        showActions={['start', 'edit', 'schedule', 'delete']}
      />
    ))}
  </div>
)}

// Actions für pausierte Jobs in JobCard
{job.data?.queuedOnly && !job.processedOn && (
  <ButtonGroup>
    <Button 
      small 
      intent="primary" 
      icon="play" 
      onClick={() => handleStartPausedJob(job)}
    >
      Jetzt starten
    </Button>
    <Button 
      small 
      icon="edit" 
      onClick={() => handleEditJob(job)}
    >
      Bearbeiten
    </Button>
    <Button 
      small 
      icon="calendar" 
      onClick={() => handleScheduleJob(job)}
    >
      Planen
    </Button>
    <Button 
      small 
      intent="danger" 
      icon="trash" 
      onClick={() => handleDeleteJob(job)}
    >
      Löschen
    </Button>
  </ButtonGroup>
)}
```

**API für pausierte Job-Aktionen:**
```tsx
// POST /api/jobs/[jobId]/start - Pausierte Job starten
export async function startPausedJob(jobId: string) {
  const queue = getMdsQueue()
  const job = await queue.getJob(jobId)
  
  if (!job) throw new Error('Job not found')
  
  // Job aus "paused" Status in "waiting" verschieben
  await job.changeDelay(0) // Sofort ausführen
  
  // queuedOnly Flag entfernen
  await job.updateData({
    ...job.data,
    queuedOnly: false
  })
  
  return { success: true, jobId }
}

// PUT /api/jobs/[jobId] - Job-Parameter bearbeiten
export async function PUT(request: NextRequest, { params }) {
  const { jobId } = await params
  const updates = await request.json()
  
  const queue = getMdsQueue()
  const job = await queue.getJob(jobId)
  
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  
  // Nur editierbar wenn noch nicht gestartet
  if (!job.data.editableUntilStart || job.processedOn) {
    return NextResponse.json({ error: 'Job kann nicht mehr bearbeitet werden' }, { status: 400 })
  }
  
  await job.updateData({
    ...job.data,
    ...updates,
    target: updates.target || job.data.target,
    params: { ...job.data.params, ...updates.params }
  })
  
  return NextResponse.json({ success: true })
}

// PUT /api/jobs/[jobId]/schedule - Zeitpunkt ändern
export async function scheduleJob(jobId: string, scheduledFor: string) {
  const queue = getMdsQueue()
  const job = await queue.getJob(jobId)
  
  if (!job) throw new Error('Job not found')
  
  const delay = new Date(scheduledFor).getTime() - Date.now()
  await job.changeDelay(Math.max(0, delay))
  
  await job.updateData({
    ...job.data,
    scheduledFor,
    queuedOnly: false // Wird automatisch zur geplanten Zeit ausgeführt
  })
  
  return { success: true }
}
```

**Edit-Dialog für pausierte Jobs:**
```tsx
function EditJobDialog({ job, isOpen, onClose, onSave }) {
  const [target, setTarget] = useState(job.data?.target || '*')
  const [params, setParams] = useState(job.data?.params || {})
  
  // Dynamische Parameter je nach Job-Type
  const renderParamsEditor = () => {
    switch (job.name) {
      case 'deploy':
        return (
          <>
            <FormGroup label="Deploy-Modus">
              <HTMLSelect 
                value={params.deployMode || 'full'} 
                onChange={e => setParams({...params, deployMode: e.target.value})}
              >
                <option value="load">Nur Load</option>
                <option value="full">Load + Master</option>
              </HTMLSelect>
            </FormGroup>
            <FormGroup label="Entity Codes">
              <TagInput
                values={params.entityCodes || []}
                onChange={values => setParams({...params, entityCodes: values})}
              />
            </FormGroup>
          </>
        )
      case 'dbt-run':
        return (
          <>
            <FormGroup label="Target (Model/Tag)">
              <InputGroup value={target} onChange={e => setTarget(e.target.value)} />
            </FormGroup>
            <Checkbox
              label="Full Refresh"
              checked={params.fullRefresh}
              onChange={e => setParams({...params, fullRefresh: e.target.checked})}
            />
          </>
        )
      // ... weitere Types
    }
  }
  
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Job bearbeiten" icon="edit">
      <div className={Classes.DIALOG_BODY}>
        <Callout intent="primary" icon="info-sign" style={{ marginBottom: 16 }}>
          Job-Parameter können nur bearbeitet werden, solange der Job noch nicht gestartet wurde.
        </Callout>
        
        <FormGroup label="Job-Typ">
          <Tag large>{job.name}</Tag>
        </FormGroup>
        
        {renderParamsEditor()}
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button intent="primary" onClick={() => onSave({ target, params })}>
          Speichern
        </Button>
      </div>
    </Dialog>
  )
}
```

**Dateien zu erstellen/ändern:**
- `src/app/(app)/commits/page.tsx` - "Zur Queue" Button hinzufügen
- `src/app/(app)/deploy/page.tsx` - "Zur Queue" Button hinzufügen (falls vorhanden)
- `src/app/api/jobs/route.ts` - `queueOnly` Parameter unterstützen
- `src/app/api/jobs/[jobId]/route.ts` - PUT für Bearbeitung, POST für Start
- `src/app/api/jobs/[jobId]/schedule/route.ts` - Zeitplanung ändern
- `src/app/(app)/jobs/page.tsx` - Pausierte Jobs Sektion und Actions
- `src/components/jobs/EditJobDialog.tsx` - Job-Bearbeitung
- `src/components/jobs/ScheduleDeployDialog.tsx` - Zeitplanung

---

### 11. Job-Scheduling (Cron)

**Ziel:** Wiederkehrende Jobs planen

**Datenmodell für Schedules (DB-Tabelle oder Redis):**
```sql
CREATE TABLE mds_job_schedule (
  id INT IDENTITY PRIMARY KEY,
  name NVARCHAR(100) NOT NULL,
  job_type NVARCHAR(50) NOT NULL,
  target NVARCHAR(200),
  params NVARCHAR(MAX), -- JSON
  cron_expression NVARCHAR(50) NOT NULL, -- z.B. "0 6 * * *"
  is_active BIT DEFAULT 1,
  last_run DATETIME2,
  next_run DATETIME2,
  created_by NVARCHAR(100),
  created_at DATETIME2 DEFAULT GETUTCDATE()
)
```

**Schedule-Manager (separater Prozess):**
```tsx
// src/lib/queue/scheduler.ts
import { CronJob } from 'cron'
import { addJob } from './config'

interface Schedule {
  id: number
  name: string
  jobType: JobType
  target: string
  params: Record<string, any>
  cronExpression: string
  isActive: boolean
}

const activeJobs = new Map<number, CronJob>()

export async function loadSchedules() {
  const schedules = await db.query<Schedule>('SELECT * FROM mds_job_schedule WHERE is_active = 1')
  
  for (const schedule of schedules) {
    const job = new CronJob(
      schedule.cronExpression,
      async () => {
        console.log(`[Scheduler] Running scheduled job: ${schedule.name}`)
        await addJob(schedule.jobType, schedule.target, 'scheduler', 'Scheduled', schedule.params)
        await db.query('UPDATE mds_job_schedule SET last_run = GETUTCDATE() WHERE id = @id', { id: schedule.id })
      },
      null,
      true,
      'Europe/Berlin'
    )
    activeJobs.set(schedule.id, job)
  }
}

export function stopSchedule(id: number) {
  const job = activeJobs.get(id)
  if (job) {
    job.stop()
    activeJobs.delete(id)
  }
}
```

**API-Endpoints:**
```tsx
// GET /api/jobs/schedules - Alle Schedules
// POST /api/jobs/schedules - Neuen Schedule erstellen
// PUT /api/jobs/schedules/[id] - Schedule aktualisieren
// DELETE /api/jobs/schedules/[id] - Schedule löschen
// POST /api/jobs/schedules/[id]/run - Sofort ausführen
```

**UI - Schedule-Dialog:**
```tsx
function ScheduleDialog({ isOpen, onClose }) {
  const [name, setName] = useState('')
  const [jobType, setJobType] = useState<JobType>('dbt-run')
  const [target, setTarget] = useState('*')
  const [cronExpression, setCronExpression] = useState('0 6 * * *')
  
  // Cron-Presets
  const cronPresets = [
    { label: 'Täglich 06:00', value: '0 6 * * *' },
    { label: 'Stündlich', value: '0 * * * *' },
    { label: 'Alle 15 Min', value: '*/15 * * * *' },
    { label: 'Montag 08:00', value: '0 8 * * 1' },
  ]
  
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Job planen">
      <div className={Classes.DIALOG_BODY}>
        <FormGroup label="Name">
          <InputGroup value={name} onChange={e => setName(e.target.value)} />
        </FormGroup>
        <FormGroup label="Job-Typ">
          <HTMLSelect value={jobType} onChange={e => setJobType(e.target.value as JobType)}>
            {/* Options */}
          </HTMLSelect>
        </FormGroup>
        <FormGroup label="Zeitplan">
          <HTMLSelect value={cronExpression} onChange={e => setCronExpression(e.target.value)}>
            {cronPresets.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            <option value="custom">Benutzerdefiniert...</option>
          </HTMLSelect>
          {cronExpression === 'custom' && (
            <InputGroup 
              placeholder="* * * * *" 
              onChange={e => setCronExpression(e.target.value)}
            />
          )}
        </FormGroup>
        <Callout intent="primary" icon="time">
          Nächste Ausführung: {getNextRun(cronExpression)}
        </Callout>
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button intent="primary" onClick={handleSave}>Speichern</Button>
      </div>
    </Dialog>
  )
}
```

**Dateien zu erstellen:**
- `src/lib/queue/scheduler.ts` - Cron-Manager
- `src/app/api/jobs/schedules/route.ts` - CRUD API
- `src/app/api/jobs/schedules/[id]/route.ts` - Einzelner Schedule
- `src/components/jobs/ScheduleDialog.tsx` - UI
- `src/components/jobs/ScheduleList.tsx` - Liste geplanter Jobs

---

### 12. Job-Dependencies (Pipelines)

**Ziel:** Jobs können von anderen Jobs abhängen

**Erweitertes Job-Datenmodell:**
```tsx
interface MdsJobData {
  // ... existing fields
  dependsOn?: string[] // Job-IDs die vorher fertig sein müssen
  pipelineId?: string // Gruppierung zusammengehöriger Jobs
  pipelineStep?: number // Position in der Pipeline
}
```

**Pipeline-Erstellung:**
```tsx
// POST /api/jobs/pipeline
export async function POST(request: NextRequest) {
  const { name, steps } = await request.json()
  // steps: [{ type: 'dbt-run', target: 'staging' }, { type: 'dbt-run', target: 'marts' }]
  
  const pipelineId = crypto.randomUUID()
  const jobs: string[] = []
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const job = await addJob(
      step.type,
      step.target,
      session.user.id,
      session.user.name,
      {
        ...step.params,
        pipelineId,
        pipelineStep: i,
        dependsOn: i > 0 ? [jobs[i - 1]] : undefined
      }
    )
    jobs.push(job.id)
  }
  
  return NextResponse.json({ pipelineId, jobs })
}
```

**Worker-Anpassung für Dependencies:**
```tsx
// In worker.ts - vor Job-Ausführung
async function checkDependencies(job: Job<MdsJobData>): Promise<boolean> {
  const { dependsOn } = job.data
  if (!dependsOn || dependsOn.length === 0) return true
  
  const queue = getMdsQueue()
  for (const depId of dependsOn) {
    const depJob = await queue.getJob(depId)
    if (!depJob) continue
    
    const state = await depJob.getState()
    if (state === 'failed') {
      throw new Error(`Dependency job ${depId} failed`)
    }
    if (state !== 'completed') {
      // Job zurück in Queue stellen mit Delay
      await job.moveToDelayed(Date.now() + 5000)
      return false
    }
  }
  return true
}
```

**Pipeline-Visualisierung:**
```tsx
function PipelineView({ pipelineId }: { pipelineId: string }) {
  const { data: jobs } = usePipelineJobs(pipelineId)
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {jobs?.map((job, i) => (
        <React.Fragment key={job.id}>
          <div style={{ 
            padding: 8, 
            border: '1px solid',
            borderColor: getStatusColor(job.status),
            borderRadius: 4
          }}>
            <Icon icon={getTypeIcon(job.type)} />
            <div>{job.target}</div>
            <Tag minimal intent={getStatusIntent(job.status)}>
              {getStatusLabel(job.status)}
            </Tag>
          </div>
          {i < jobs.length - 1 && (
            <Icon icon="arrow-right" color="gray" />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
```

**Dateien zu erstellen/ändern:**
- `src/lib/queue/config.ts` - MdsJobData erweitern
- `src/lib/queue/worker.ts` - Dependency-Check
- `src/app/api/jobs/pipeline/route.ts` - Pipeline API
- `src/components/jobs/PipelineView.tsx` - Visualisierung
- `src/components/jobs/CreatePipelineDialog.tsx` - Pipeline-Builder

---

## Implementierungs-Reihenfolge

| Phase | Features | Aufwand | Abhängigkeiten |
|-------|----------|---------|----------------|
| **Phase 1** | 1 (Filter), 2 (Pagination), 7 (Worker-Status) | 1-2 Tage | Keine |
| **Phase 2** | 3 (Datum-Filter), 4 (Job-Dialog), 8 (Metriken) | 2-3 Tage | Phase 1 |
| **Phase 3** | 5 (Detail-Seite), 6 (Bulk-Aktionen), **9 (Add to Queue)** | 2-3 Tage | Phase 1 |
| **Phase 4** | 11 (Scheduling), 12 (Pipelines) | 3-4 Tage | Phase 1-3, besonders 9 |

---

## Nächste Schritte

- [ ] **Phase 1.1:** Filter & Suche implementieren
- [ ] **Phase 1.2:** Pagination hinzufügen  
- [ ] **Phase 1.7:** Worker-Status-Anzeige
- [ ] **Phase 2.3:** Datum-Filter
- [ ] **Phase 2.4:** "Neuer Job" Dialog
- [ ] **Phase 2.8:** Job-Metriken Dashboard
- [ ] **Phase 3.5:** Job-Details-Seite
- [ ] **Phase 3.6:** Bulk-Aktionen
- [ ] **Phase 3.9:** "Add to Queue" Button auf Commits/Deploy-Seiten
- [ ] **Phase 4.11:** Job-Scheduling (Cron)
- [ ] **Phase 4.12:** Job-Dependencies (Pipelines)
