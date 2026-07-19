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
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    // O token da Apify é fornecido pelo usuário por requisição — nunca configurado globalmente.
    apifyAuthenticationMode: 'user-provided-token',
    googleMapsEnabled: process.env.SOURCE_GOOGLE_MAPS_ENABLED !== 'false',
  },
})
})

export default router