import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { corsMiddleware } from './middlewares/cors'
import { requireAuth } from './middlewares/authMiddleware'
import scrapeRouter from './routes/scrape'
import authRouter from './routes/auth'
import adminRouter from './routes/admin'
import healthRouter from './routes/health'
import historyRouter from './routes/history'
import enrichRouter from './routes/enrich'
import { seedAdminIfNeeded } from './services/authService'

const app = express()
const PORT = process.env.PORT || 3001

app.use(helmet())
app.use(corsMiddleware)
app.use(express.json({ limit: '10mb' })) // aumentado para suportar payload de leads

const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false })
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' }, standardHeaders: true, legacyHeaders: false })
const scrapeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, message: { success: false, error: 'Muitas requisicoes. Aguarde 15 minutos.' }, standardHeaders: true, legacyHeaders: false })

app.use(generalLimiter)

app.use('/health', healthRouter)
app.use('/api/auth', authLimiter, authRouter)
app.use('/api/scrape', requireAuth, scrapeLimiter, scrapeRouter)
app.use('/api/history', requireAuth, historyRouter)
app.use('/api/enrich', requireAuth, enrichRouter)
app.use('/api/admin', adminRouter)

app.use((_req, res) => { res.status(404).json({ success: false, error: 'Rota nao encontrada.' }) })
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message)
  res.status(500).json({ success: false, error: err.message || 'Erro interno.' })
})

app.listen(PORT, async () => {
  console.log(`leads-backend rodando em http://localhost:${PORT}`)
  console.log(`  ALLOWED_ORIGIN: ${process.env.ALLOWED_ORIGIN || 'nao definido'}`)
  try { await seedAdminIfNeeded() } catch (err) { console.warn('Seed admin falhou:', (err as Error).message) }
})

export default app