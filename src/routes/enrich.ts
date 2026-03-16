import { Router, Request, Response } from 'express'
import {
  startEnrichJob,
  startEnrichAllJob,
  getEnrichJob,
} from '../services/enricherService'

const router = Router()

// POST /api/enrich/session/:sessionId
router.post('/session/:sessionId', (req: Request, res: Response) => {
  const userId = req.user!.userId
  const { sessionId } = req.params
  const jobId = startEnrichJob(sessionId, userId)
  res.json({ success: true, data: { jobId } })
})

// POST /api/enrich/all
router.post('/all', (req: Request, res: Response) => {
  const userId = req.user!.userId
  const jobId = startEnrichAllJob(userId)
  res.json({ success: true, data: { jobId } })
})

// GET /api/enrich/job/:jobId
router.get('/job/:jobId', (req: Request, res: Response) => {
  const job = getEnrichJob(req.params.jobId)
  if (!job) { res.status(404).json({ success: false, error: 'Job nao encontrado.' }); return }
  res.json({ success: true, data: job })
})

export default router