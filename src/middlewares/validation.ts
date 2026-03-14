import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'

export const scrapeSchema = z.object({
  apiKey: z
    .string({ required_error: 'apiKey e obrigatorio' })
    .min(10, 'apiKey invalida')
    .startsWith('apify_api_', 'apiKey deve comecar com apify_api_'),
  niche: z
    .string({ required_error: 'niche e obrigatorio' })
    .min(2, 'niche deve ter ao menos 2 caracteres')
    .max(80, 'niche muito longo'),
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
})

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
  req.body = result.data
  next()
}