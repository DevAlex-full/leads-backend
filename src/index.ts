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

// Render fica atrás de proxy reverso — necessário para rate limit e IPs corretos
app.set('trust proxy', 1)

const PORT = process.env.PORT || 3001

app.use(helmet())
app.use(corsMiddleware)
app.use(express.json({ limit: '10mb' }))

// Rate limiters com validação desabilitada para evitar crash no Render
const limiterOpts = { validate: { xForwardedForHeader: false } }

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  standardHeaders: true, legacyHeaders: false,
  ...limiterOpts,
})
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' },
  standardHeaders: true, legacyHeaders: false,
  ...limiterOpts,
})
const scrapeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 500,
  message: { success: false, error: 'Muitas requisicoes. Aguarde 15 minutos.' },
  standardHeaders: true, legacyHeaders: false,
  ...limiterOpts,
})

app.use(generalLimiter)

app.use('/health', healthRouter)
app.use('/api/auth', authLimiter, authRouter)
app.use('/api/scrape', requireAuth, scrapeLimiter, scrapeRouter)
app.use('/api/history', requireAuth, historyRouter)
app.use('/api/enrich', requireAuth, enrichRouter)
app.use('/api/admin', adminRouter)

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Rota nao encontrada.' })
})
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message)
  res.status(500).json({ success: false, error: err.message || 'Erro interno.' })
})

// Captura erros não tratados para não crashar o servidor
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

app.listen(PORT, async () => {
  console.log(`leads-backend rodando em http://localhost:${PORT}`)
  console.log(`  ORIGEM_PERMITIDA: ${process.env.ALLOWED_ORIGIN}`)
  await seedAdminIfNeeded()
})