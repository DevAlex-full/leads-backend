import { Router, Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { validateScrapeRequest } from '../middlewares/validation'
import { createJob, getJob, cancelJob } from '../services/jobStore'
import { runScrapeJob } from '../services/scrapeOrchestrator'
import { getUserLeadStats } from '../services/leadStore'
import { generateMarkdown, generateCsv } from '../services/exporters'
import { ScrapeRequest } from '../lib/types'

const router = Router()

// POST /api/scrape/start
router.post('/start', validateScrapeRequest, (req: Request, res: Response) => {
  const jobId = uuid()
  const request = req.body as ScrapeRequest
  const userId = req.user!.userId

  createJob(jobId)

  setImmediate(() => {
    runScrapeJob(jobId, { ...request, userId }).catch(() => {})
  })

  res.status(202).json({ success: true, data: { jobId } })
})

// GET /api/scrape/status/:jobId
router.get('/status/:jobId', (req: Request, res: Response) => {
  const job = getJob(req.params.jobId)
  if (!job) { res.status(404).json({ success: false, error: 'Job nao encontrado.' }); return }

  res.json({
    success: true,
    data: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      progressLabel: job.progressLabel,
      logs: job.logs,
      leadsCount: job.leads.length,
      error: job.error,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    },
  })
})

// GET /api/scrape/results/:jobId
router.get('/results/:jobId', (req: Request, res: Response) => {
  const job = getJob(req.params.jobId)
  if (!job) { res.status(404).json({ success: false, error: 'Job nao encontrado.' }); return }

  if (job.status !== 'done') {
    res.status(400).json({ success: false, error: `Job ainda nao concluido. Status: ${job.status}` })
    return
  }

  res.json({
    success: true,
    data: {
      leads: job.leads,
      total: job.leads.length,
      bySource: countByField(job.leads, 'source'),
      byPriority: { high: job.leads.filter((l) => l.priority === 'high').length, normal: job.leads.filter((l) => l.priority === 'normal').length },
    },
  })
})

// GET /api/scrape/stats — total acumulado do usuário
router.get('/stats', async (req: Request, res: Response) => {
  const userId = req.user!.userId
  try {
    const stats = await getUserLeadStats(userId)
    res.json({ success: true, data: stats })
  } catch {
    res.status(500).json({ success: false, error: 'Erro ao buscar estatisticas.' })
  }
})

// GET /api/scrape/download/:jobId
router.get('/download/:jobId', (req: Request, res: Response) => {
  const job = getJob(req.params.jobId)
  const format = (req.query.format as string) || 'md'

  if (!job || job.status !== 'done' || job.leads.length === 0) {
    res.status(400).json({ success: false, error: 'Sem leads disponiveis.' })
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  const niche = (req.query.niche as string) || 'leads'
  const safeNiche = niche.replace(/[^a-z0-9]/gi, '_').toLowerCase()

  if (format === 'csv') {
    const csv = generateCsv(job.leads)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="leads_${safeNiche}_${today}.csv"`)
    res.send('\uFEFF' + csv)
    return
  }

  const md = generateMarkdown(job.leads, niche)
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="leads_${safeNiche}_${today}.md"`)
  res.send(md)
})

// DELETE /api/scrape/cancel/:jobId
router.delete('/cancel/:jobId', (req: Request, res: Response) => {
  const cancelled = cancelJob(req.params.jobId)
  if (!cancelled) { res.status(400).json({ success: false, error: 'Job nao encontrado ou ja finalizado.' }); return }
  res.json({ success: true, message: 'Job cancelado.' })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countByField(items: any[], field: string): Record<string, number> {
  return items.reduce((acc: Record<string, number>, item) => {
    acc[item[field]] = (acc[item[field]] || 0) + 1
    return acc
  }, {})
}

export default router