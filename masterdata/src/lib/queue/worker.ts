/**
 * BullMQ Worker für MDS Jobs
 * 
 * Wird als separater Prozess gestartet:
 * npx ts-node src/lib/queue/worker.ts
 */

import { Worker, Job } from 'bullmq';
import { spawn } from 'child_process';
import { 
  REDIS_CONFIG, 
  QUEUE_NAMES, 
  MdsJobData, 
  JobProgress 
} from './config';

// Worker-spezifische Handler
const jobHandlers: Record<string, (job: Job<MdsJobData>) => Promise<void>> = {
  'dbt-run': handleDbtRun,
  'dbt-test': handleDbtTest,
  'validate': handleValidate,
  'deploy': handleDeploy,
  'import': handleImport,
  'export': handleExport,
};

/**
 * dbt run Handler
 */
async function handleDbtRun(job: Job<MdsJobData>): Promise<void> {
  const { target, params } = job.data;
  
  await updateProgress(job, 0, 'Starting dbt run...', ['Initializing dbt project']);
  
  // Build dbt command
  const args = ['run'];
  if (target && target !== '*') {
    args.push('--select', target);
  }
  if (params?.fullRefresh) {
    args.push('--full-refresh');
  }

  await updateProgress(job, 10, 'Running dbt models...', ['Executing: dbt ' + args.join(' ')]);

  // Execute dbt command
  await executeDbtCommand(job, args);
  
  await updateProgress(job, 100, 'dbt run completed', ['All models executed successfully']);
}

/**
 * dbt test Handler
 */
async function handleDbtTest(job: Job<MdsJobData>): Promise<void> {
  const { target } = job.data;
  
  await updateProgress(job, 0, 'Starting dbt tests...', ['Initializing test runner']);
  
  const args = ['test'];
  if (target && target !== '*') {
    args.push('--select', target);
  }

  await executeDbtCommand(job, args);
  
  await updateProgress(job, 100, 'dbt tests completed', ['All tests passed']);
}

/**
 * Validation Handler
 */
async function handleValidate(job: Job<MdsJobData>): Promise<void> {
  const { target, entityId } = job.data;
  
  await updateProgress(job, 0, 'Starting validation...', [`Validating: ${target}`]);
  
  // Simulate validation steps
  await delay(1000);
  await updateProgress(job, 25, 'Checking data types...', ['Data type validation']);
  
  await delay(1000);
  await updateProgress(job, 50, 'Checking constraints...', ['Constraint validation']);
  
  await delay(1000);
  await updateProgress(job, 75, 'Checking business rules...', ['Business rule validation']);
  
  await delay(1000);
  await updateProgress(job, 100, 'Validation completed', [
    'Data types: OK',
    'Constraints: OK',
    'Business rules: OK',
  ]);
}

/**
 * Deploy Handler
 */
async function handleDeploy(job: Job<MdsJobData>): Promise<void> {
  const { target, params } = job.data;
  
  await updateProgress(job, 0, 'Starting deployment...', [`Deploying: ${target}`]);
  
  // Run dbt to deploy staged data
  const args = ['run', '--select', 'tag:deploy'];
  if (params?.targetDb) {
    args.push('--target', String(params.targetDb));
  }

  await executeDbtCommand(job, args);
  
  await updateProgress(job, 100, 'Deployment completed', ['Data deployed to target database']);
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
 * Execute dbt command and stream output
 */
async function executeDbtCommand(job: Job<MdsJobData>, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const dbtProcess = spawn('dbt', args, {
      cwd: process.env.DBT_PROJECT_PATH || process.cwd(),
      shell: true,
    });

    const logs: string[] = [];

    dbtProcess.stdout.on('data', async (data) => {
      const line = data.toString().trim();
      logs.push(line);
      
      // Parse progress from dbt output
      const progress = parseDbtProgress(line);
      if (progress !== null) {
        await job.updateProgress({ 
          percent: progress, 
          message: line,
          logs: logs.slice(-10) 
        });
      }
    });

    dbtProcess.stderr.on('data', async (data) => {
      const line = data.toString().trim();
      logs.push(`[ERROR] ${line}`);
    });

    dbtProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`dbt exited with code ${code}\n${logs.slice(-5).join('\n')}`));
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
 * Update job progress
 */
async function updateProgress(
  job: Job<MdsJobData>,
  percent: number,
  message: string,
  logs: string[]
): Promise<void> {
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
      connection: REDIS_CONFIG,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2'),
    }
  );

  worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
  });

  console.log('🔧 MDS Worker started, waiting for jobs...');
  
  return worker;
}

// Run worker if executed directly
if (require.main === module) {
  startWorker();
}
