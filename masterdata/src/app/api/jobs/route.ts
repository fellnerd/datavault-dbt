/**
 * Jobs API Route
 * 
 * GET /api/jobs - Liste aller Jobs
 * POST /api/jobs - Neuen Job erstellen
 * DELETE /api/jobs/:id - Job abbrechen
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { addJob, getQueueStats, getRecentJobs, cancelJob } from '@/lib/queue';
import type { JobType } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/jobs
 * Holt Jobs mit Statistiken und Liste
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    const [stats, jobs] = await Promise.all([
      getQueueStats(),
      getRecentJobs(limit),
    ]);

    return NextResponse.json({
      stats,
      jobs,
    });
  } catch (error) {
    console.error('Failed to get jobs:', error);
    return NextResponse.json(
      { error: 'Failed to get jobs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/jobs
 * Erstellt einen neuen Job
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, target, params } = body;

    // Validate job type
    const validTypes: JobType[] = ['dbt-run', 'dbt-test', 'validate', 'deploy', 'import', 'export'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid job type: ${type}` },
        { status: 400 }
      );
    }

    // Add job to queue
    const job = await addJob(
      type,
      target || '*',
      session.user?.id || 'unknown',
      session.user?.name || 'Unknown User',
      params
    );

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (error) {
    console.error('Failed to create job:', error);
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs?id=xxx
 * Bricht einen Job ab
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('id');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID required' },
        { status: 400 }
      );
    }

    const cancelled = await cancelJob(jobId);

    if (cancelled) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'Cannot cancel job (may be already running or completed)' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Failed to cancel job:', error);
    return NextResponse.json(
      { error: 'Failed to cancel job' },
      { status: 500 }
    );
  }
}
