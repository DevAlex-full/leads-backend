import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'

export const scrapeSchema = z.object({
  apiKey: z
    .string({ required_error: 'apiKey e obrigatorio' })
    .trim()
    .min(10, 'apiKey invalida')
    .max(200, 'apiKey invalida')
    .startsWith('apify_api_', 'apiKey deve comecar com apify_api_')
    // eslint-disable-next-line no-control-regex
    .regex(/^[^\x00-\x1F\s]+$/, 'apiKey contem caracteres invalidos'),
  // Aceita niches (array) — 1 a 3 nichos
  niches: z
    .array(z.string().min(2).max(80))
    .min(1, 'Selecione ao menos 1 nicho')
    .max(3, 'Maximo de 3 nichos'),
  cities: z
    .array(z.string().min(2))
    .min(1, 'Selecione ao menos uma cidade')
    .max(50, 'Maximo de 50 cidades'),
  perCity: z
    .number({ required_error: 'perCity e obrigatorio' })
    .int().min(5).max(100),
  sources: z
    .array(z.enum(['google_maps', 'instagram', 'linkedin', 'facebook']))
    .min(1, 'Selecione ao menos uma fonte'),
  siteFilter: z
    .enum(['all', 'without_site', 'with_site'])
    .default('all'),
  requiredFields: z
    .array(z.string())
    .optional(),
  includePreviouslySeen: z
    .boolean()
    .optional()
    .default(true),
})

// Protege a conta Apify do usuário de estouro de custo/uso — a mesma
// situação que zerou a conta Apify em produção ($5.89 de $5.00 gastos).
const MAX_ESTIMATED_RESULTS = Number(process.env.MAX_ESTIMATED_RESULTS || 2000)

export function validateScrapeRequest(req: Request, res: Response, next: NextFunction): void {
  const result = scrapeSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: 'Dados invalidos',
      details: result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    })
    return
  }

  const { niches, cities, perCity, sources } = result.data
  const estimated = niches.length * cities.length * perCity * sources.length
  if (estimated > MAX_ESTIMATED_RESULTS) {
    res.status(400).json({
      success: false,
      error: `Esta busca poderia solicitar até ${estimated} resultados, acima do limite de ${MAX_ESTIMATED_RESULTS}. Reduza nichos, cidades, fontes ou o limite por cidade.`,
    })
    return
  }

  req.body = result.data
  next()
}