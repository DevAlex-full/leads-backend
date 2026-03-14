import { ScrapeJob, LogEntry } from '../lib/types'

const jobs = new Map<string, ScrapeJob>()

// Limpa jobs com mais de 2 horas automaticamente
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  for (const [id, job] of jobs.entries()) {
    if (new Date(job.createdAt).getTime() < cutoff) {
      jobs.delete(id)
    }
  }
}, 30 * 60 * 1000)

export function createJob(id: string): ScrapeJob {
  const job: ScrapeJob = {
    id,
    status: 'pending',
    progress: 0,
    progressLabel: 'Aguardando início...',
    logs: [],
    leads: [],
    createdAt: new Date().toISOString(),
  }
  jobs.set(id, job)
  return job
}

export function getJob(id: string): ScrapeJob | undefined {
  return jobs.get(id)
}

export function updateJob(id: string, updates: Partial<ScrapeJob>): void {
  const job = jobs.get(id)
  if (!job) return
  Object.assign(job, updates)
}

export function addLog(id: string, message: string, type: LogEntry['type'] = 'info'): void {
  const job = jobs.get(id)
  if (!job) return
  job.logs.push({ time: new Date().toLocaleTimeString('pt-BR'), message, type })
  // Mantém apenas os últimos 100 logs em memória
  if (job.logs.length > 100) job.logs = job.logs.slice(-100)
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id)
  if (!job || job.status === 'done' || job.status === 'failed') return false
  job.status = 'cancelled'
  return true
}
