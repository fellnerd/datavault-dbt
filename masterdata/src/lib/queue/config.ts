/**
 * BullMQ Queue Configuration
 * 
 * Job Queue für asynchrone Operationen:
 * - dbt-run: dbt Models ausführen
 * - dbt-test: dbt Tests ausführen  
 * - validate: Datenvalidierung
 * - deploy: Deployment zu Target-DB
 * - import: CSV/Excel Import
 * - export: CSV/Excel Export
 */

import { ConnectionOptions } from 'bullmq';

// Redis Connection Configuration
export const REDIS_CONFIG: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
};

// Queue Names
export const QUEUE_NAMES = {
  MDS_JOBS: 'mds-jobs',
  MDS_SCHEDULED: 'mds-scheduled',
} as const;

// Job Types
export type JobType = 
  | 'dbt-run'
  | 'dbt-test'
  | 'validate'
  | 'deploy'
  | 'import'
  | 'export';

// Job Data Interface
export interface MdsJobData {
  type: JobType;
  target: string;
  userId: string;
  userName: string;
  modelId?: number;
  entityId?: number;
  params?: Record<string, unknown>;
  createdAt: string;
}

// Job Progress Interface
export interface JobProgress {
  percent: number;
  message: string;
  logs: string[];
}

// Default Job Options
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // 24 hours
    count: 100,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // 7 days
    count: 500,
  },
};

// Job Type Specific Options
export const JOB_TYPE_OPTIONS: Record<JobType, { timeout: number; priority: number }> = {
  'dbt-run': { timeout: 30 * 60 * 1000, priority: 2 },    // 30 min
  'dbt-test': { timeout: 15 * 60 * 1000, priority: 3 },   // 15 min
  'validate': { timeout: 10 * 60 * 1000, priority: 1 },   // 10 min, highest priority
  'deploy': { timeout: 60 * 60 * 1000, priority: 4 },     // 1 hour
  'import': { timeout: 30 * 60 * 1000, priority: 2 },     // 30 min
  'export': { timeout: 15 * 60 * 1000, priority: 3 },     // 15 min
};
