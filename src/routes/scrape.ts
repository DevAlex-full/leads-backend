import { Router, Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { validateScrapeRequest } from '../middlewares/validation'
import { createJob, getJob, cancelJob } from '../services/jobStore'
import { runScrapeJob } from '../services/scrapeOrchestrator'
import { generateMarkdown, generateCsv } from '../services/exporters'
import { ScrapeRequest } from '../lib/types'

const router = Router()

// POST /api/scrape/start
// Inicia um job de scraping — retorna jobId imediatamente
router.post('/start', validateScrapeRequest, (req: Request, res: Response) => {
  const jobId = uuid()
  const request = req.body as ScrapeRequest

  createJob(jobId)

  // Executa o scraping em background (não bloqueia a resposta)
  setImmediate(() => {
    runScrapeJob(jobId, request).catch(() => {
      // Erros já são tratados dentro do runScrapeJob
    })
  })

  res.status(202).json({
    success: true,
    data: { jobId },
  })
})

// GET /api/scrape/status/:jobId
// Retorna status, progresso e logs (sem os leads para economizar banda)
router.get('/status/:jobId', (req: Request, res: Response) => {
  const job = getJob(req.params.jobId)

  if (!job) {
    res.status(404).json({ success: false, error: 'Job não encontrado.' })
    return
  }

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
// Retorna os leads completos (apenas quando status = done)
router.get('/results/:jobId', (req: Request, res: Response) => {
  const job = getJob(req.params.jobId)

  if (!job) {
    res.status(404).json({ success: false, error: 'Job não encontrado.' })
    return
  }

  if (job.status !== 'done') {
    res.status(400).json({
      success: false,
      error: `Job ainda não concluído. Status atual: ${job.status}`,
    })
    return
  }

  res.json({
    success: true,
    data: {
      leads: job.leads,
      total: job.leads.length,
      bySource: countBySource(job.leads),
      byPriority: countByPriority(job.leads),
    },
  })
})

// GET /api/scrape/download/:jobId?format=md|csv
// Gera e retorna o arquivo para download
router.get('/download/:jobId', (req: Request, res: Response) => {
  const job = getJob(req.params.jobId)
  const format = (req.query.format as string) || 'md'

  if (!job) {
    res.status(404).json({ success: false, error: 'Job não encontrado.' })
    return
  }

  if (job.status !== 'done' || job.leads.length === 0) {
    res.status(400).json({ success: false, error: 'Sem leads disponíveis para download.' })
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  const niche = (req.query.niche as string) || 'leads'
  const safeNiche = niche.replace(/[^a-z0-9]/gi, '_').toLowerCase()

  if (format === 'csv') {
    const csv = generateCsv(job.leads)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="leads_${safeNiche}_${today}.csv"`)
    res.send('\uFEFF' + csv) // BOM para UTF-8 no Excel
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

  if (!cancelled) {
    res.status(400).json({ success: false, error: 'Job não encontrado ou já finalizado.' })
    return
  }

  res.json({ success: true, message: 'Job cancelado com sucesso.' })
})

// Helpers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countBySource(leads: any[]) {
  return leads.reduce((acc: Record<string, number>, l) => {
    acc[l.source] = (acc[l.source] || 0) + 1
    return acc
  }, {})
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countByPriority(leads: any[]) {
  return {
    high: leads.filter((l) => l.priority === 'high').length,
    normal: leads.filter((l) => l.priority === 'normal').length,
  }
}

export default router
