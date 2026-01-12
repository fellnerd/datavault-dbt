/**
 * SSE Stream Endpoint for Job Logs
 * 
 * GET /api/jobs/[jobId]/stream
 * 
 * Returns a Server-Sent Events stream with real-time job logs and status updates.
 * Uses BullMQ QueueEvents to subscribe to job progress.
 */

import { NextRequest } from 'next/server';
import { QueueEvents } from 'bullmq';
import { getRedisConfig, QUEUE_NAMES } from '@/lib/queue/config';
import { getMdsQueue } from '@/lib/queue/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StreamMessage {
  type: 'log' | 'progress' | 'completed' | 'failed' | 'status';
  message?: string;
  progress?: number;
  result?: unknown;
  error?: string;
  timestamp: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Check if queue is in mock mode
  if (process.env.QUEUE_MOCK === 'true') {
    return new Response(
      JSON.stringify({ error: 'Queue is in mock mode - SSE not available' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      let queueEvents: QueueEvents | null = null;
      let closed = false;

      const sendMessage = (msg: StreamMessage) => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
          } catch {
            // Stream might be closed
            closed = true;
          }
        }
      };

      const cleanup = () => {
        closed = true;
        if (queueEvents) {
          queueEvents.close().catch(() => {});
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      try {
        // First, check if job exists and get initial state
        const queue = getMdsQueue();
        const job = await queue.getJob(jobId);
        
        if (!job) {
          sendMessage({
            type: 'failed',
            error: `Job ${jobId} not found`,
            timestamp: new Date().toISOString()
          });
          cleanup();
          return;
        }

        // Send initial status
        const state = await job.getState();
        sendMessage({
          type: 'status',
          message: `Job state: ${state}`,
          progress: typeof job.progress === 'number' ? job.progress : 0,
          timestamp: new Date().toISOString()
        });

        // If job is already completed or failed, send final status and close
        if (state === 'completed') {
          sendMessage({
            type: 'completed',
            result: job.returnvalue,
            timestamp: new Date().toISOString()
          });
          cleanup();
          return;
        }

        if (state === 'failed') {
          sendMessage({
            type: 'failed',
            error: job.failedReason || 'Job failed',
            timestamp: new Date().toISOString()
          });
          cleanup();
          return;
        }

        // Create QueueEvents listener for active/waiting jobs
        queueEvents = new QueueEvents(QUEUE_NAMES.MDS_JOBS, {
          connection: getRedisConfig(),
        });

        // Listen for progress updates (includes logs)
        queueEvents.on('progress', ({ jobId: jid, data }) => {
          if (jid === jobId) {
            // Handle structured log messages from worker
            if (data && typeof data === 'object' && 'log' in data) {
              const logData = data as { log: string; timestamp?: string };
              sendMessage({
                type: 'log',
                message: String(logData.log),
                timestamp: logData.timestamp || new Date().toISOString()
              });
            } else if (data && typeof data === 'object' && 'percent' in data) {
              // Handle JobProgress format
              const progress = data as { percent: number; message: string; logs: string[] };
              sendMessage({
                type: 'progress',
                progress: progress.percent,
                message: progress.message,
                timestamp: new Date().toISOString()
              });
            }
          }
        });

        // Listen for completion
        queueEvents.on('completed', ({ jobId: jid, returnvalue }) => {
          if (jid === jobId) {
            sendMessage({
              type: 'completed',
              result: returnvalue,
              timestamp: new Date().toISOString()
            });
            cleanup();
          }
        });

        // Listen for failure
        queueEvents.on('failed', ({ jobId: jid, failedReason }) => {
          if (jid === jobId) {
            sendMessage({
              type: 'failed',
              error: failedReason || 'Job failed',
              timestamp: new Date().toISOString()
            });
            cleanup();
          }
        });

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          console.log(`[SSE] Client disconnected for job ${jobId}`);
          cleanup();
        });

        // Keep-alive ping every 30 seconds
        const keepAlive = setInterval(() => {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
            } catch {
              clearInterval(keepAlive);
              cleanup();
            }
          } else {
            clearInterval(keepAlive);
          }
        }, 30000);

      } catch (error) {
        console.error(`[SSE] Error setting up stream for job ${jobId}:`, error);
        sendMessage({
          type: 'failed',
          error: error instanceof Error ? error.message : 'Failed to setup stream',
          timestamp: new Date().toISOString()
        });
        cleanup();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
