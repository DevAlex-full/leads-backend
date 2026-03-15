import { Router, Request, Response } from 'express'
import { listUserSessions, getSessionWithLeads, deleteSession } from '../services/sessionStore'
import { generateMarkdown, generateCsv } from '../services/exporters'

const router = Router()

// GET /api/history — lista sessões do usuário (sem os leads)
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId

  const sessions = await listUserSessions(userId, 50)

  res.json({
    success: true,
    data: {
      sessions,
      total: sessions.length,
    },
  })
})

// GET /api/history/:sessionId/download?format=md|csv — baixa leads de uma sessão
router.get('/:sessionId/download', async (req: Request, res: Response) => {
  const userId = req.user!.userId
  const { sessionId } = req.params
  const format = (req.query.format as string) || 'md'

  const session = await getSessionWithLeads(sessionId, userId)

  if (!session) {
    res.status(404).json({ success: false, error: 'Sessao nao encontrada.' })
    return
  }

  if (!session.leads || session.leads.length === 0) {
    res.status(400).json({ success: false, error: 'Esta sessao nao possui leads.' })
    return
  }

  const date = new Date(session.created_at).toISOString().slice(0, 10)
  const safeNiche = session.niche.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const filename = `leads_${safeNiche}_${date}`

  if (format === 'csv') {
    const csv = generateCsv(session.leads)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`)
    res.send('\uFEFF' + csv)
    return
  }

  const md = generateMarkdown(session.leads, session.niche)
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.md"`)
  res.send(md)
})

// DELETE /api/history/:sessionId — remove uma sessão
router.delete('/:sessionId', async (req: Request, res: Response) => {
  const userId = req.user!.userId
  const { sessionId } = req.params

  const deleted = await deleteSession(sessionId, userId)

  if (!deleted) {
    res.status(404).json({ success: false, error: 'Sessao nao encontrada.' })
    return
  }

  res.json({ success: true, message: 'Sessao removida com sucesso.' })
})

export default router