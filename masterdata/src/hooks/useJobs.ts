import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Types
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface DbtJob {
  job_id: string
  commit_id: string | null
  command: string
  status: JobStatus
  started_at: string | null
  completed_at: string | null
  created_by: string
  logs: string[]
  exit_code: number | null
  models_run: number
  models_success: number
  models_error: number
}

// API functions
async function fetchJobs(status?: JobStatus): Promise<{ data: DbtJob[]; total: number }> {
  const url = status ? `/api/dbt/run?status=${status}` : '/api/dbt/run'
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch jobs')
  }
  return response.json()
}

async function fetchJob(jobId: string): Promise<DbtJob> {
  const response = await fetch(`/api/dbt/run/${jobId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch job')
  }
  return response.json()
}

async function startJob(data: {
  commit_id?: string
  command?: string
  models?: string[]
  full_refresh?: boolean
}): Promise<{ job_id: string; status: string }> {
  const response = await fetch('/api/dbt/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to start job')
  }
  return response.json()
}

async function cancelJob(jobId: string): Promise<void> {
  const response = await fetch(`/api/dbt/run/${jobId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to cancel job')
  }
}

async function retryJob(jobId: string): Promise<{ new_job_id: string }> {
  const response = await fetch(`/api/dbt/run/${jobId}`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Failed to retry job')
  }
  return response.json()
}

// Hooks
export function useJobs(status?: JobStatus) {
  return useQuery({
    queryKey: ['jobs', { status }],
    queryFn: () => fetchJobs(status),
    staleTime: 5 * 1000, // 5 seconds - jobs need frequent updates
    refetchInterval: 10 * 1000, // Auto-refresh every 10 seconds
  })
}

export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => fetchJob(jobId!),
    enabled: !!jobId,
    staleTime: 2 * 1000, // 2 seconds for active job
    refetchInterval: (query) => {
      // Refetch every 3 seconds if job is running or queued
      const job = query.state.data as DbtJob | undefined
      if (job && (job.status === 'running' || job.status === 'queued')) {
        return 3000
      }
      return false
    },
  })
}

export function useStartJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: startJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function useCancelJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: cancelJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function useRetryJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: retryJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
