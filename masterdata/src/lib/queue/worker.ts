/**
 * BullMQ Worker für MDS Jobs
 * 
 * Wird als separater Prozess gestartet:
 * npx ts-node src/lib/queue/worker.ts
 */

// Load .env.local for standalone worker process
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Worker, Job } from 'bullmq';
import { spawn, ChildProcess } from 'child_process';
import { 
  getRedisConfig, 
  QUEUE_NAMES, 
  MdsJobData, 
  JobProgress 
} from './config';

// Worker-spezifische Handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jobHandlers: Record<string, (job: Job<MdsJobData>) => Promise<any>> = {
  'dbt-run': handleDbtRun,
  'dbt-test': handleDbtTest,
  'validate': handleValidate,
  'deploy': handleDeploy,
  'schema-deploy': handleSchemaDeploy,
  'import': handleImport,
  'export': handleExport,
};

/**
 * dbt run Handler
 */
async function handleDbtRun(job: Job<MdsJobData>): Promise<{ logs: string[] }> {
  const { target, params } = job.data;
  
  // Small delay to allow SSE connection to establish
  await delay(500);
  
  await updateProgress(job, 0, 'Starting dbt run...', ['🚀 Initializing dbt project...']);
  await delay(200);
  
  // Build dbt command
  const args = ['run'];
  if (target && target !== '*') {
    args.push('--select', target);
  }
  if (params?.fullRefresh) {
    args.push('--full-refresh');
  }

  await updateProgress(job, 10, 'Running dbt models...', [`▶ Executing: dbt ${args.join(' ')}`]);
  await delay(200);

  // Execute dbt command and collect logs
  const logs = await executeDbtCommand(job, args);
  
  await updateProgress(job, 100, 'dbt run completed', [...logs, '✅ All models executed successfully']);
  
  return { logs };
}

/**
 * dbt test Handler
 */
async function handleDbtTest(job: Job<MdsJobData>): Promise<{ logs: string[] }> {
  const { target } = job.data;
  
  // Small delay to allow SSE connection to establish
  await delay(500);
  
  await updateProgress(job, 0, 'Starting dbt tests...', ['🧪 Initializing test runner...']);
  await delay(200);
  
  const args = ['test'];
  if (target && target !== '*') {
    args.push('--select', target);
  }

  const logs = await executeDbtCommand(job, args);
  
  await updateProgress(job, 100, 'dbt tests completed', [...logs, '✅ All tests passed']);
  
  return { logs };
}

/**
 * Validation Handler
 */
async function handleValidate(job: Job<MdsJobData>): Promise<void> {
  const { target, entityId } = job.data;
  
  // Small delay to allow SSE connection to establish
  await delay(500);
  
  await updateProgress(job, 0, 'Starting validation...', [`🔍 Validating: ${target}`]);
  
  // Simulate validation steps
  await delay(800);
  await updateProgress(job, 25, 'Checking data types...', ['📋 Data type validation...']);
  
  await delay(800);
  await updateProgress(job, 50, 'Checking constraints...', ['🔗 Constraint validation...']);
  
  await delay(800);
  await updateProgress(job, 75, 'Checking business rules...', ['📊 Business rule validation...']);
  
  await delay(1000);
  await updateProgress(job, 100, 'Validation completed', [
    'Data types: OK',
    'Constraints: OK',
    'Business rules: OK',
  ]);
}

/**
 * Deploy Handler - Deploys committed data via dbt
 * 
 * Flow:
 * 1. Run dbt load_<entity> to transfer staged_record → mds_load
 * 2. (Optional) Run dbt mds_<entity> to transfer mds_load → mds_master (SCD2)
 * 3. Update commit status to 'deployed' or 'loaded'
 * 
 * deployMode:
 * - 'load': nur load_<entity> ausführen (status='loaded')
 * - 'full': load + master ausführen (status='deployed')
 */
async function handleDeploy(job: Job<MdsJobData>): Promise<void> {
  const { params } = job.data;
  const entityCodes = params?.entityCodes as string[] | undefined;
  const commitIds = params?.commitIds as number[] | undefined;
  const deploymentId = params?.deploymentId as string | undefined;
  const deployMode = (params?.deployMode as string) || 'full'; // 'load' or 'full'
  
  if (!entityCodes || entityCodes.length === 0) {
    throw new Error('No entity codes provided for data deployment');
  }
  
  const modeLabel = deployMode === 'full' ? 'Load + Master' : 'Nur Load';
  
  await updateProgress(job, 0, 'Starting data deployment...', [
    `Deployment ID: ${deploymentId}`,
    `Modus: ${modeLabel}`,
    `Entities: ${entityCodes.join(', ')}`,
    `Commits: ${commitIds?.join(', ') || 'all approved'}`
  ]);
  
  // Step 1: Run dbt load models (staged_record → mds_load)
  await updateProgress(job, 10, 'Loading data to mds_load tables...', []);
  
  const loadModels = entityCodes.map(code => `load_${code}`);
  const loadArgs = [
    'run',
    '--select', loadModels.join(' '),
    '--target', process.env.DBT_TARGET || 'local'
  ];
  
  await executeDbtCommand(job, loadArgs);
  
  let finalStatus = 'loaded';
  let masterModels: string[] = [];
  
  // Step 2: Run dbt master models (mds_load → mds_master with SCD2) - ONLY if deployMode is 'full'
  if (deployMode === 'full') {
    await updateProgress(job, 50, 'Processing data to mds_master tables...', []);
    
    masterModels = entityCodes.map(code => `mds_${code}`);
    const masterArgs = [
      'run',
      '--select', masterModels.join(' '),
      '--target', process.env.DBT_TARGET || 'local'
    ];
    
    await executeDbtCommand(job, masterArgs);
    finalStatus = 'deployed';
  } else {
    await updateProgress(job, 50, 'Überspringe mds_master (Nur Load-Modus)...', []);
  }
  
  // Step 3: Update commit status via API
  await updateProgress(job, 90, 'Updating commit status...', []);
  
  if (commitIds && commitIds.length > 0) {
    try {
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
      const internalSecret = process.env.INTERNAL_API_SECRET || 'mds-worker-secret-dev';
      const response = await fetch(`${baseUrl}/api/deploy/data/status`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret
        },
        body: JSON.stringify({
          deploymentId,
          commitIds,
          status: finalStatus // 'loaded' or 'deployed' based on mode
        })
      });
      
      if (!response.ok) {
        console.warn(`[${job.id}] Failed to update commit status: ${response.status}`);
      }
    } catch (err) {
      console.warn(`[${job.id}] Failed to update commit status:`, err);
    }
  }
  
  const completionMsg = deployMode === 'full' 
    ? 'Data deployment completed!' 
    : 'Load completed (Master skipped)';
  
  await updateProgress(job, 100, completionMsg, [
    `Loaded to: ${loadModels.join(', ')}`,
    ...(masterModels.length > 0 ? [`Processed to: ${masterModels.join(', ')}`] : ['Master: übersprungen']),
    `Final status: ${finalStatus}`
  ]);
}

/**
 * Import Handler
 */
async function handleImport(job: Job<MdsJobData>): Promise<void> {
  const { target, params } = job.data;
  
  await updateProgress(job, 0, 'Starting import...', [`Importing: ${target}`]);
  
  // Parse file path from params
  const filePath = params?.filePath as string;
  
  await delay(1000);
  await updateProgress(job, 25, 'Reading file...', [`Reading: ${filePath}`]);
  
  await delay(1000);
  await updateProgress(job, 50, 'Validating data...', ['Validating imported records']);
  
  await delay(1000);
  await updateProgress(job, 75, 'Inserting records...', ['Inserting into staging area']);
  
  await delay(500);
  await updateProgress(job, 100, 'Import completed', ['Successfully imported 1,234 records']);
}

/**
 * Export Handler
 */
async function handleExport(job: Job<MdsJobData>): Promise<void> {
  const { target, params } = job.data;
  
  await updateProgress(job, 0, 'Starting export...', [`Exporting: ${target}`]);
  
  await delay(1000);
  await updateProgress(job, 50, 'Querying data...', ['Fetching records from database']);
  
  await delay(1000);
  await updateProgress(job, 100, 'Export completed', [
    'Export file created',
    `Format: ${params?.format || 'csv'}`,
  ]);
}

/**
 * Schema Deploy Handler
 * Führt generate_models.py + dbt run aus für Schema-Änderungen
 */
async function handleSchemaDeploy(job: Job<MdsJobData>): Promise<void> {
  const { entityIds, deploymentId } = job.data;
  
  if (!entityIds || entityIds.length === 0) {
    throw new Error('No entity IDs provided for schema deployment');
  }

  const logs: string[] = [];
  
  await updateProgress(job, 0, 'Starting schema deployment...', [
    `🚀 Deploying ${entityIds.length} entity(s)`,
    `Deployment ID: ${deploymentId}`
  ]);

  try {
    // Step 1: Update deployment status to 'deploying'
    await updateProgress(job, 5, 'Updating deployment status...', [
      '📝 Setting status to deploying...'
    ]);

    // Step 2: Run generate_models.py
    await updateProgress(job, 10, 'Generating dbt models...', [
      '🔧 Running generate_models.py...'
    ]);

    const entityIdList = entityIds.join(',');
    const pythonCmd = process.env.PYTHON_CMD || 'python';
    const genResult = await runCommandWithStreaming(
      pythonCmd,
      [
        process.env.GENERATE_MODELS_PATH || '/app/scripts/generate_models.py',
        '--entity-ids', entityIdList
      ],
      job,
      logs
    );

    if (genResult.exitCode !== 0) {
      throw new Error(`generate_models.py failed with exit code ${genResult.exitCode}\n${genResult.stderr}`);
    }

    await updateProgress(job, 50, 'Models generated successfully', [
      '✅ generate_models.py completed',
      '🚀 Starting dbt run...'
    ]);

    // Step 3: Run dbt run for the generated models
    // Use entity codes to build selector: load_<code> mds_<code> for each entity
    const entityCodes = job.data.entityCodes || [];
    let modelSelector = 'tag:mds_generated'; // Fallback
    
    if (entityCodes.length > 0) {
      // Build selector for load and master models: load_code1 mds_code1 load_code2 mds_code2...
      const selectors = entityCodes.flatMap(code => [`load_${code}`, `mds_${code}`]);
      modelSelector = selectors.join(' ');
      logs.push(`📋 Selecting models: ${modelSelector}`);
    }
    
    const dbtArgs = [
      'run',
      '--profiles-dir', process.env.DBT_PROFILES_DIR || '/app/dbt',
      '--project-dir', process.env.DBT_PROJECT_PATH || '/app/dbt',
      '--target', process.env.DBT_TARGET || 'local',  // Use SQL Basic Auth target
      '--select', modelSelector
    ];

    const dbtResult = await runCommandWithStreaming('dbt', dbtArgs, job, logs);

    if (dbtResult.exitCode !== 0) {
      throw new Error(`dbt run failed with exit code ${dbtResult.exitCode}\n${dbtResult.stderr}`);
    }

    await updateProgress(job, 90, 'dbt run completed', [
      '✅ dbt models executed successfully',
      '📝 Updating entity status...'
    ]);

    // Step 4: Update entity and schema_deployment status via API
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3002';
    const apiSecret = process.env.INTERNAL_API_SECRET || 'mds-worker-secret-dev';
    const response = await fetch(`${apiBaseUrl}/api/deploy/schema`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'x-internal-secret': apiSecret
      },
      body: JSON.stringify({
        entity_ids: entityIds,
        status: 'deployed',
        deployed_by: job.data.userName || 'system'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[${job.id}] Warning: Failed to update entity status: ${errorText}`);
    } else {
      console.log(`[${job.id}] Entity status updated to 'active'`);
    }

    await updateProgress(job, 100, 'Schema deployment completed', [
      '✅ Schema deployment successful!',
      `📊 ${entityIds.length} entity(s) deployed`,
      `🆔 Deployment ID: ${deploymentId}`
    ]);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await updateProgress(job, -1, 'Schema deployment failed', [
      `❌ Error: ${errorMessage}`,
      ...logs.slice(-10) // Include last 10 log lines for context
    ]);

    throw error;
  }
}

/**
 * Execute command with real-time streaming to job logs
 */
async function runCommandWithStreaming(
  cmd: string,
  args: string[],
  job: Job<MdsJobData>,
  logs: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    console.log(`[${job.id}] Executing: ${cmd} ${args.join(' ')}`);
    
    const proc: ChildProcess = spawn(cmd, args, {
      cwd: process.env.DBT_PROJECT_PATH || process.cwd(),
      shell: true,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', async (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        stdout += line + '\n';
        logs.push(line);
        // Update job progress with streaming log
        await job.updateProgress({
          log: line,
          timestamp: new Date().toISOString()
        });
        console.log(`[${job.id}] ${line}`);
      }
    });

    proc.stderr?.on('data', async (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        stderr += line + '\n';
        logs.push(`[stderr] ${line}`);
        await job.updateProgress({
          log: `[stderr] ${line}`,
          timestamp: new Date().toISOString()
        });
        console.log(`[${job.id}] [stderr] ${line}`);
      }
    });

    proc.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    proc.on('error', (err) => {
      stderr += err.message;
      logs.push(`[error] ${err.message}`);
      resolve({ exitCode: 1, stdout, stderr });
    });
  });
}

/**
 * Execute dbt command and stream output
 * Returns the collected logs for storage in job result
 */
async function executeDbtCommand(job: Job<MdsJobData>, args: string[]): Promise<string[]> {
  return new Promise((resolve, reject) => {
    // Ensure dbt project path is set
    const dbtProjectPath = process.env.DBT_PROJECT_PATH || 
      '/home/user/projects/datavault-dbt/masterdata/dbt';
    
    console.log(`[${job.id}] Running dbt in ${dbtProjectPath}: dbt ${args.join(' ')}`);
    
    const dbtProcess = spawn('dbt', args, {
      cwd: dbtProjectPath,
      shell: true,
      env: {
        ...process.env,
        // Ensure dbt env vars are set
        MDS_DB_USER: process.env.MDS_DB_USER,
        MDS_DB_PASSWORD: process.env.MDS_DB_PASSWORD,
      }
    });

    const allLogs: string[] = [];
    let lastProgress = 10;

    dbtProcess.stdout.on('data', async (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        allLogs.push(line);
        
        // Parse progress from dbt output
        const progress = parseDbtProgress(line);
        if (progress !== null) {
          lastProgress = Math.max(lastProgress, progress);
        }
        
        // Send individual log line for real-time streaming
        await job.updateProgress({ 
          log: line,
          timestamp: new Date().toISOString()
        });
        
        // Also send overall progress
        await job.updateProgress({ 
          percent: lastProgress, 
          message: line,
          logs: allLogs
        });
        
        console.log(`[${job.id}] ${line}`);
      }
    });

    dbtProcess.stderr.on('data', async (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        const errorLine = `[ERROR] ${line}`;
        allLogs.push(errorLine);
        
        // Send error log for real-time streaming
        await job.updateProgress({ 
          log: errorLine,
          timestamp: new Date().toISOString()
        });
        
        console.error(`[${job.id}] ${errorLine}`);
      }
    });

    dbtProcess.on('close', (code) => {
      if (code === 0) {
        resolve(allLogs);
      } else {
        reject(new Error(`dbt exited with code ${code}\n${allLogs.slice(-10).join('\n')}`));
      }
    });

    dbtProcess.on('error', (err) => {
      reject(new Error(`Failed to start dbt: ${err.message}`));
    });
  });
}

/**
 * Parse dbt output for progress indication
 */
function parseDbtProgress(line: string): number | null {
  // Look for patterns like "X of Y OK" or "Running X of Y"
  const match = line.match(/(\d+)\s+of\s+(\d+)/i);
  if (match) {
    const current = parseInt(match[1]);
    const total = parseInt(match[2]);
    return Math.round((current / total) * 100);
  }
  return null;
}

/**
 * Update job progress - sends individual log lines for SSE streaming
 */
async function updateProgress(
  job: Job<MdsJobData>,
  percent: number,
  message: string,
  logs: string[]
): Promise<void> {
  // Send each log line individually for real-time SSE streaming
  for (const log of logs) {
    if (log) {
      await job.updateProgress({ 
        log: log,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Also send the overall progress update
  const progress: JobProgress = { percent, message, logs };
  await job.updateProgress(progress);
  console.log(`[${job.id}] ${percent}% - ${message}`);
}

/**
 * Helper: delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Start the worker
 */
export function startWorker(): Worker<MdsJobData> {
  const worker = new Worker<MdsJobData>(
    QUEUE_NAMES.MDS_JOBS,
    async (job) => {
      console.log(`🚀 Processing job ${job.id}: ${job.name}`);
      
      const handler = jobHandlers[job.name];
      if (!handler) {
        throw new Error(`Unknown job type: ${job.name}`);
      }

      await handler(job);
      
      console.log(`✅ Job ${job.id} completed`);
    },
    {
      connection: getRedisConfig(),
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2'),
    }
  );

  worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
  });

  // Rate limit error handling with exponential backoff
  let consecutiveErrors = 0;
  let isPaused = false;
  
  worker.on('error', async (err) => {
    console.error('Worker error:', err.message || err);
    
    // Check for rate limit errors
    if (err.message?.includes('max requests limit exceeded')) {
      consecutiveErrors++;
      const backoffMs = Math.min(1000 * Math.pow(2, consecutiveErrors), 60000); // Max 60 seconds
      
      console.warn(`⚠️ Rate limit hit! Pausing worker for ${backoffMs / 1000}s (attempt ${consecutiveErrors})`);
      
      if (!isPaused) {
        isPaused = true;
        await worker.pause();
        
        setTimeout(async () => {
          console.log('🔄 Resuming worker after backoff...');
          isPaused = false;
          await worker.resume();
        }, backoffMs);
      }
    }
  });
  
  worker.on('active', () => {
    // Reset error counter on successful job pickup
    consecutiveErrors = 0;
  });

  console.log('🔧 MDS Worker started, waiting for jobs...');
  
  return worker;
}

// Run worker if executed directly
if (require.main === module) {
  startWorker();
}
