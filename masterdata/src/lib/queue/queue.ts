/**
 * BullMQ Queue Instance
 * 
 * Singleton Queue für MDS Jobs
 */

import { Queue } from 'bullmq';
import { 
  getRedisConfig, 
  QUEUE_NAMES, 
  DEFAULT_JOB_OPTIONS, 
  JOB_TYPE_OPTIONS,
  MdsJobData,
  JobType 
} from './config';

// Singleton Queue Instance
let mdsQueue: Queue<MdsJobData> | null = null;

/**
 * Get or create the MDS Job Queue
 */
export function getMdsQueue(): Queue<MdsJobData> {
  if (!mdsQueue) {
    // Check if we're in mock mode
    if (process.env.QUEUE_MOCK === 'true') {
      console.log('📦 Queue mock mode - not connecting to Redis');
      // Return a mock queue that doesn't actually connect
      return createMockQueue();
    }
    
    const redisConfig = getRedisConfig();
    console.log('🔌 Connecting to Redis:', { 
      host: redisConfig.host, 
      port: redisConfig.port, 
      tls: !!redisConfig.tls 
    });
    
    mdsQueue = new Queue<MdsJobData>(QUEUE_NAMES.MDS_JOBS, {
      connection: redisConfig,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    console.log('📬 MDS Job Queue initialized');
  }

  return mdsQueue;
}

/**
 * Add a job to the queue
 */
export async function addJob(
  type: JobType,
  target: string,
  userId: string,
  userName: string,
  params?: Record<string, unknown>
): Promise<{ id: string; name: string }> {
  console.log('⏳ addJob called:', { type, target, userId });
  
  const queue = getMdsQueue();
  console.log('✅ Got queue instance');
  
  const jobData: MdsJobData = {
    type,
    target,
    userId,
    userName,
    params,
    createdAt: new Date().toISOString(),
  };

  const jobOptions = JOB_TYPE_OPTIONS[type];
  console.log('⏳ Calling queue.add()...');
  
  const job = await queue.add(type, jobData, {
    priority: jobOptions.priority,
    timeout: jobOptions.timeout,
  });
  
  console.log('✅ queue.add() completed, job.id:', job.id);

  console.log(`📬 Job added: ${type} - ${target} (${job.id})`);

  return {
    id: job.id || '',
    name: job.name,
  };
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const queue = getMdsQueue();
  
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
  };
}

/**
 * Get recent jobs
 */
export async function getRecentJobs(limit: number = 20) {
  const queue = getMdsQueue();
  
  const [active, waiting, completed, failed] = await Promise.all([
    queue.getActive(0, limit),
    queue.getWaiting(0, limit),
    queue.getCompleted(0, limit),
    queue.getFailed(0, limit),
  ]);

  const allJobs = [...active, ...waiting, ...completed, ...failed]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit);

  return allJobs.map(job => ({
    id: job.id,
    name: job.name,
    data: job.data,
    state: job.finishedOn ? (job.failedReason ? 'failed' : 'completed') : 
           job.processedOn ? 'active' : 'waiting',
    progress: job.progress,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
  }));
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const queue = getMdsQueue();
  const job = await queue.getJob(jobId);
  
  if (!job) {
    return false;
  }

  // Can only cancel waiting or delayed jobs
  const state = await job.getState();
  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
    return true;
  }

  return false;
}

/**
 * Create a mock queue for development without Redis
 */
function createMockQueue(): Queue<MdsJobData> {
  // Create a proxy that returns mock data
  const mockJobs: Array<{
    id: string;
    name: string;
    data: MdsJobData;
    state: string;
    progress: number;
    timestamp: number;
  }> = [
    {
      id: 'mock-1',
      name: 'dbt-run',
      data: {
        type: 'dbt-run',
        target: 'hub_customer, sat_customer',
        userId: 'admin',
        userName: 'Admin',
        createdAt: new Date().toISOString(),
      },
      state: 'active',
      progress: 73,
      timestamp: Date.now() - 60000,
    },
    {
      id: 'mock-2',
      name: 'validate',
      data: {
        type: 'validate',
        target: 'All Entities',
        userId: 'scheduler',
        userName: 'Scheduler',
        createdAt: new Date().toISOString(),
      },
      state: 'waiting',
      progress: 0,
      timestamp: Date.now() - 30000,
    },
  ];

  return {
    add: async (name: string, data: MdsJobData) => {
      const id = `mock-${Date.now()}`;
      mockJobs.push({
        id,
        name,
        data,
        state: 'waiting',
        progress: 0,
        timestamp: Date.now(),
      });
      return { id, name };
    },
    getWaitingCount: async () => mockJobs.filter(j => j.state === 'waiting').length,
    getActiveCount: async () => mockJobs.filter(j => j.state === 'active').length,
    getCompletedCount: async () => 2,
    getFailedCount: async () => 1,
    getDelayedCount: async () => 0,
    getActive: async () => mockJobs.filter(j => j.state === 'active'),
    getWaiting: async () => mockJobs.filter(j => j.state === 'waiting'),
    getCompleted: async () => [],
    getFailed: async () => [],
    getJob: async (id: string) => mockJobs.find(j => j.id === id),
  } as unknown as Queue<MdsJobData>;
}

/**
 * Close the queue connection
 */
export async function closeQueue() {
  if (mdsQueue) {
    await mdsQueue.close();
    mdsQueue = null;
    console.log('📬 MDS Job Queue closed');
  }
}
