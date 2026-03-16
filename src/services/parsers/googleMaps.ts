import { Lead } from '../../lib/types'

function clean(v: unknown): string {
  return String(v || '').trim()
}

function findSocial(links: string[], domain: string): string {
  for (const u of links) {
    if (u && u.includes(domain)) return u.replace(/\/$/, '')
  }
  return ''
}

function extractEmail(text: string): string {
  const m = String(text || '').match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  return m ? m[0].toLowerCase() : ''
}

const VALID_DDDS = new Set([
  11,12,13,14,15,16,17,18,19,21,22,24,27,28,
  31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,
  51,53,54,55,61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,
  91,92,93,94,95,96,97,98,99,
])

function isMobilePhone(digits: string): boolean {
  const clean = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  if (clean.length !== 11) return false
  const ddd = parseInt(clean.slice(0, 2))
  if (!VALID_DDDS.has(ddd)) return false
  return clean[2] === '9' // celular BR sempre começa com 9
}

function extractWhatsApp(phone: string, links: string[]): string {
  // 1. Link direto wa.me tem prioridade
  for (const u of links) {
    if (u && (u.includes('wa.me') || u.includes('whatsapp.com/send'))) return u
  }
  // 2. Só gera link de WhatsApp se for celular válido (11 dígitos com 9)
  const digits = phone.replace(/\D/g, '')
  if (isMobilePhone(digits)) {
    const num = digits.startsWith('55') ? digits : `55${digits}`
    return `https://wa.me/${num}`
  }
  return ''
}

function parseAddress(raw: string): { city: string; state: string } {
  if (!raw) return { city: '', state: '' }
  const parts = raw.split(',').map(p => p.trim())
  for (const part of [...parts].reverse()) {
    const m = part.match(/^([^-/]+)\s*[-/]\s*([A-Z]{2})/)
    if (m) return { city: m[1].trim(), state: m[2].trim() }
  }
  return { city: parts.at(-2) || '', state: '' }
}

function extractCNPJ(text: string): string {
  const m = String(text || '').match(/\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/)
  return m ? m[0].replace(/\D/g, '') : ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseGoogleMapsItems(items: any[], niche: string): Lead[] {
  return items.map(item => {
    const website  = clean(item.website)
    const phone    = clean(item.phone || item.phoneUnformatted)
    const address  = clean(item.address || item.street)

    // Coleta TODOS os links disponíveis no item
    const allLinks: string[] = [
      item.website,
      item.facebook, item.facebookUrl,
      item.instagram, item.instagramUrl,
      item.linkedin, item.linkedinUrl,
      item.twitter,
      ...(item.socialMedia || []),
      ...(item.additionalInfo?.urls || []),
      ...(item.url ? [item.url] : []),
    ].filter(Boolean).map(String)

    const addrParsed = parseAddress(address)
    const city  = clean(item.city  || addrParsed.city)
    const state = clean(item.state || addrParsed.state)

    // Email — múltiplas fontes
    const email =
      clean(item.email) ||
      extractEmail(item.description || '') ||
      extractEmail(item.additionalInfo?.email || '') ||
      extractEmail(clean(item.emailFromWebsite)) ||
      ''

    // Redes sociais — dados reais do actor, nunca inventados
    const instagram = findSocial(allLinks, 'instagram.com') || clean(item.instagramUrl)
    const facebook  = findSocial(allLinks, 'facebook.com')  || clean(item.facebookUrl)
    const linkedin  = findSocial(allLinks, 'linkedin.com')  || clean(item.linkedinUrl)
    const whatsapp  = extractWhatsApp(phone, allLinks)

    // CNPJ se disponível
    const cnpj = clean(item.cnpj) || extractCNPJ(item.description || '')

    return {
      name:     clean(item.title || item.name),
      niche,
      city,
      state,
      phone,
      email,
      address,
      website,
      instagram,
      linkedin,
      facebook,
      whatsapp,
      cnpj:     cnpj || undefined,
      rating:   clean(item.totalScore || item.rating),
      reviews:  clean(item.reviewsCount),
      category: clean(item.categoryName || item.categories?.[0]),
      source:   'google_maps' as const,
      priority: website ? 'normal' : 'high',
      scrapedAt: new Date().toISOString(),
    } as Lead
  }).filter(l => Boolean(l.name))
}