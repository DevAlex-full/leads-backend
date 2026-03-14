import { Router } from 'express'

const router = Router()

router.get('/', (_req, res) => {
  res.json({
  success: true,
  data: {
    status: 'ok',
    service: 'leads-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  },
})
})

export default router
