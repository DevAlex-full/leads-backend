import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'

export const scrapeSchema = z.object({
  apiKey: z
    .string({ required_error: 'apiKey é obrigatório' })
    .min(10, 'apiKey inválida — muito curta')
    .startsWith('apify_api_', 'apiKey inválida — deve começar com apify_api_'),

  niche: z
    .string({ required_error: 'niche é obrigatório' })
    .min(2, 'niche deve ter ao menos 2 caracteres')
    .max(80, 'niche muito longo'),

  cities: z
    .array(z.string().min(2))
    .min(1, 'Selecione ao menos uma cidade')
    .max(50, 'Máximo de 50 cidades por vez'),

  perCity: z
    .number({ required_error: 'perCity é obrigatório' })
    .int()
    .min(5, 'Mínimo 5 leads por cidade')
    .max(100, 'Máximo 100 leads por cidade'),

  sources: z
    .array(z.enum(['google_maps', 'instagram', 'linkedin', 'facebook']))
    .min(1, 'Selecione ao menos uma fonte'),
})

export function validateScrapeRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = scrapeSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: 'Dados inválidos',
      details: result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
    return
  }
  req.body = result.data
  next()
}
