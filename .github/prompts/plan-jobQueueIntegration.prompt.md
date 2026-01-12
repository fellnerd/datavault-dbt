# Plan: Job Queue Integration für Schema-Deploy

## Ziel
Schema-Deployments über BullMQ Job Queue mit echtem `generate_models.py` + `dbt run` Aufruf und Echtzeit-Streaming via SSE.

## Architektur

```
┌─────────────┐    POST /api/deploy/schema    ┌─────────────┐
│  Deploy UI  │ ─────────────────────────────▶│  Next.js    │
│  (Browser)  │                               │  API Route  │
└─────────────┘                               └──────┬──────┘
       ▲                                             │
       │ SSE Stream                                  │ queue.add('schema-deploy', {...})
       │                                             ▼
┌──────┴──────┐    GET /api/jobs/[id]/stream  ┌─────────────┐
│  Deploy UI  │ ◀─────────────────────────────│  Upstash    │
│  (Browser)  │                               │  Redis      │
└─────────────┘                               └──────┬──────┘
                                                     │
                                                     ▼
                                              ┌─────────────┐
                                              │  mds-worker │
                                              │  (Docker)   │
                                              └──────┬──────┘
                                                     │
                                    ┌────────────────┼────────────────┐
                                    ▼                ▼                ▼
                            generate_models.py   dbt run      Update DB Status
```

## Upstash Redis Credentials

```env
UPSTASH_REDIS_URL=rediss://default:AURdAAIncDFlYzVlMjgxMTczMjA0MjYyODA2YzZlMGFiMDAxNjQ1N3AxMTc1MDE@wired-sawfish-17501.upstash.io:6379
```

## Implementierungsschritte

### 1. Upstash Redis Konfiguration

**Datei:** `masterdata/src/lib/queue/config.ts`

```typescript
// Parse UPSTASH_REDIS_URL (rediss:// for TLS)
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port),
    password: parsed.password,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

const redisUrl = process.env.UPSTASH_REDIS_URL;
export const redisConnection = redisUrl 
  ? parseRedisUrl(redisUrl)
  : { host: 'localhost', port: 6379 };
```

**Datei:** `masterdata/.env.local`
```env
UPSTASH_REDIS_URL=rediss://default:AURdAAIncDFlYzVlMjgxMTczMjA0MjYyODA2YzZlMGFiMDAxNjQ1N3AxMTc1MDE@wired-sawfish-17501.upstash.io:6379
```

### 2. docker-compose.yml anpassen

**Änderungen:**
- ❌ Lokalen `redis` Service entfernen
- ✅ `UPSTASH_REDIS_URL` an beide Container übergeben

```yaml
services:
  mds-app:
    environment:
      - UPSTASH_REDIS_URL=${UPSTASH_REDIS_URL}
      # REDIS_HOST, REDIS_PORT entfernen
      
  mds-worker:
    environment:
      - UPSTASH_REDIS_URL=${UPSTASH_REDIS_URL}
      # REDIS_HOST, REDIS_PORT entfernen

# redis: Service komplett entfernen
```

### 3. Job Type hinzufügen

**Datei:** `masterdata/src/lib/queue/config.ts`

```typescript
export const JOB_TYPES = {
  DBT_RUN: 'dbt-run',
  DEPLOY: 'deploy',
  SCHEMA_DEPLOY: 'schema-deploy',  // NEU
  SYNC: 'sync',
} as const;

export const jobDefaults = {
  'schema-deploy': {
    attempts: 1,
    timeout: 30 * 60 * 1000, // 30 Minuten
    removeOnComplete: false,
    removeOnFail: false,
  },
  // ... andere
};
```

### 4. Worker Handler erstellen

**Datei:** `masterdata/src/lib/queue/worker.ts`

```typescript
async function handleSchemaDeploy(job: Job): Promise<JobResult> {
  const { entities, deploymentId } = job.data;
  const logs: string[] = [];
  
  try {
    // 1. Status auf 'deploying' setzen
    await updateDeploymentStatus(deploymentId, 'deploying');
    
    // 2. generate_models.py ausführen
    job.log('🔧 Running generate_models.py...');
    const genResult = await runCommand('python', [
      '/app/scripts/generate_models.py',
      '--entities', entities.join(',')
    ], (line) => job.log(line));
    
    if (genResult.exitCode !== 0) {
      throw new Error(`generate_models.py failed: ${genResult.stderr}`);
    }
    
    // 3. dbt run ausführen
    job.log('🚀 Running dbt run...');
    const dbtResult = await runCommand('dbt', [
      'run',
      '--select', entities.map(e => `hub_${e} sat_${e}`).join(' '),
      '--profiles-dir', '/app/.dbt',
      '--project-dir', '/app/dbt'
    ], (line) => job.log(line));
    
    if (dbtResult.exitCode !== 0) {
      throw new Error(`dbt run failed: ${dbtResult.stderr}`);
    }
    
    // 4. NUR bei Erfolg: Entity-Status auf 'active' setzen
    await updateEntityStatus(entities, 'active');
    await updateDeploymentStatus(deploymentId, 'deployed');
    
    return { success: true, message: 'Schema deployed successfully' };
    
  } catch (error) {
    // Bei Fehler: Status auf 'failed' setzen, NICHT auf 'active'
    await updateDeploymentStatus(deploymentId, 'failed', error.message);
    throw error;
  }
}

// Helper: Subprocess mit Streaming
async function runCommand(
  cmd: string, 
  args: string[], 
  onLine: (line: string) => void
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      const line = data.toString();
      stdout += line;
      onLine(line);
    });
    
    proc.stderr.on('data', (data) => {
      const line = data.toString();
      stderr += line;
      onLine(`[stderr] ${line}`);
    });
    
    proc.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
```

### 5. SSE Endpoint erstellen

**Datei:** `masterdata/src/app/api/jobs/[jobId]/stream/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { QueueEvents } from 'bullmq';
import { redisConnection } from '@/lib/queue/config';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const queueEvents = new QueueEvents('mds-jobs', { connection: redisConnection });
      
      // Job-Logs streamen
      queueEvents.on('progress', ({ jobId: jid, data }) => {
        if (jid === jobId && data?.log) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'log', message: data.log })}\n\n`));
        }
      });
      
      // Job abgeschlossen
      queueEvents.on('completed', ({ jobId: jid, returnvalue }) => {
        if (jid === jobId) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'completed', result: returnvalue })}\n\n`));
          controller.close();
          queueEvents.close();
        }
      });
      
      // Job fehlgeschlagen
      queueEvents.on('failed', ({ jobId: jid, failedReason }) => {
        if (jid === jobId) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'failed', error: failedReason })}\n\n`));
          controller.close();
          queueEvents.close();
        }
      });
      
      // Cleanup bei Client-Disconnect
      request.signal.addEventListener('abort', () => {
        queueEvents.close();
        controller.close();
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### 6. Deploy API anpassen

**Datei:** `masterdata/src/app/api/deploy/schema/route.ts`

```typescript
import { getQueue } from '@/lib/queue';
import { JOB_TYPES } from '@/lib/queue/config';

export async function POST(request: NextRequest) {
  const { entities } = await request.json();
  
  // 1. Deployment-Record erstellen
  const deploymentId = crypto.randomUUID();
  await sql`
    INSERT INTO mds_meta.schema_deployment (id, entity_name, status)
    SELECT ${deploymentId}, unnest(${entities}::text[]), 'queued'
  `;
  
  // 2. Job in Queue einfügen
  const queue = getQueue();
  const job = await queue.add(
    JOB_TYPES.SCHEMA_DEPLOY,
    { entities, deploymentId },
    { jobId: deploymentId }
  );
  
  return NextResponse.json({ 
    success: true, 
    jobId: job.id,
    message: 'Deployment queued' 
  });
}
```

### 7. Deploy Page SSE Integration

**Datei:** `masterdata/src/app/deploy/page.tsx`

```typescript
const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
const [isDeploying, setIsDeploying] = useState(false);

async function handleDeploy() {
  setIsDeploying(true);
  setDeploymentLogs([]);
  
  // 1. Job starten
  const res = await fetch('/api/deploy/schema', {
    method: 'POST',
    body: JSON.stringify({ entities: pendingDeployments.map(d => d.entity_name) }),
  });
  const { jobId } = await res.json();
  
  // 2. SSE Stream öffnen
  const eventSource = new EventSource(`/api/jobs/${jobId}/stream`);
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'log') {
      setDeploymentLogs(prev => [...prev, data.message]);
    } else if (data.type === 'completed') {
      setDeploymentLogs(prev => [...prev, '✅ Deployment completed!']);
      setIsDeploying(false);
      eventSource.close();
      refreshData();
    } else if (data.type === 'failed') {
      setDeploymentLogs(prev => [...prev, `❌ Deployment failed: ${data.error}`]);
      setIsDeploying(false);
      eventSource.close();
    }
  };
  
  eventSource.onerror = () => {
    setIsDeploying(false);
    eventSource.close();
  };
}
```

### 8. Jobs Page - Echte Daten

**Datei:** `masterdata/src/app/api/jobs/route.ts`

```typescript
import { getQueue } from '@/lib/queue';

export async function GET() {
  const queue = getQueue();
  
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaiting(),
    queue.getActive(),
    queue.getCompleted(0, 50),
    queue.getFailed(0, 50),
  ]);
  
  const jobs = [...waiting, ...active, ...completed, ...failed].map(job => ({
    id: job.id,
    name: job.name,
    status: job.finishedOn ? (job.failedReason ? 'failed' : 'completed') : 
            job.processedOn ? 'active' : 'waiting',
    progress: job.progress,
    data: job.data,
    createdAt: job.timestamp,
    finishedAt: job.finishedOn,
    error: job.failedReason,
  }));
  
  return NextResponse.json(jobs);
}
```

## Dateiübersicht

| Datei | Aktion | Beschreibung |
|-------|--------|--------------|
| `masterdata/.env.local` | UPDATE | Upstash Redis URL hinzufügen |
| `masterdata/src/lib/queue/config.ts` | UPDATE | URL-Parser, schema-deploy Job Type |
| `docker-compose.yml` | UPDATE | Redis-Service entfernen, Env-Vars anpassen |
| `masterdata/src/lib/queue/worker.ts` | UPDATE | handleSchemaDeploy Handler |
| `masterdata/src/app/api/jobs/[jobId]/stream/route.ts` | CREATE | SSE Endpoint |
| `masterdata/src/app/api/deploy/schema/route.ts` | UPDATE | Job Queue statt direktes Update |
| `masterdata/src/app/deploy/page.tsx` | UPDATE | SSE Integration für Logs |
| `masterdata/src/app/api/jobs/route.ts` | UPDATE | Echte Queue-Daten |

## Wichtige Regeln

1. **Entity-Status nur bei Erfolg**: `status = 'active'` wird NUR gesetzt wenn sowohl `generate_models.py` als auch `dbt run` erfolgreich sind
2. **Upstash TLS**: Immer `rediss://` (mit doppeltem s) für TLS-Verbindung
3. **Job.log()**: Für Echtzeit-Streaming, nicht console.log
4. **Keine lokale Redis**: Upstash für Dev und Prod verwenden

## Nächste Schritte nach Implementierung

1. [ ] `.env.local` Upstash URL eintragen
2. [ ] `docker-compose up --build` testen
3. [ ] Manueller Test: Entity erstellen → Deploy → Logs prüfen
4. [ ] Jobs-Seite verifizieren
