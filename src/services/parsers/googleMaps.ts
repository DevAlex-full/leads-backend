import { Lead } from '../../lib/types'

function clean(v: unknown): string {
  return String(v || '').trim()
}

function extractInstagramFromUrl(url: string): string {
  if (!url) return ''
  const m = url.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})\/?/)
  if (!m) return ''
  const skip = ['p', 'reel', 'explore', 'stories', 'tv', 'accounts', 'share']
  if (skip.includes(m[1])) return ''
  if (/^[0-9]+$/.test(m[1])) return ''
  if (m[1].length < 2) return ''
  return `https://www.instagram.com/${m[1]}`
}

function findInstagram(item: Record<string, unknown>): string {
  // 1. Campos diretos do actor
  const directFields = [
    item.instagramUrl, item.instagram,
    item['contact:instagram'], item.instagram_url,
  ]
  for (const f of directFields) {
    const v = clean(f)
    if (v) {
      const ig = extractInstagramFromUrl(v) || (v.startsWith('@') ? `https://www.instagram.com/${v.slice(1)}` : '')
      if (ig) return ig
    }
  }

  // 2. socialMedia array (campo mais comum do compass/crawler-google-places)
  const socialMedia = (item.socialMedia as unknown[]) || []
  for (const s of socialMedia) {
    const url = typeof s === 'string' ? s : clean((s as Record<string,unknown>)?.url)
    if (url.includes('instagram.com')) {
      const ig = extractInstagramFromUrl(url)
      if (ig) return ig
    }
  }

  // 3. additionalInfo — onde o actor guarda dados extras das abas do Maps
  const info = (item.additionalInfo as Record<string, unknown>) || {}
  const infoStr = JSON.stringify(info)
  if (infoStr.includes('instagram')) {
    const m = infoStr.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/)
    if (m && !['p','reel','explore','stories'].includes(m[1])) {
      return `https://www.instagram.com/${m[1]}`
    }
  }

  // 4. urls array
  const urls = (item.urls as unknown[]) || (item.additionalInfo as Record<string,unknown>)?.urls as unknown[] || []
  for (const u of urls) {
    const url = typeof u === 'string' ? u : clean((u as Record<string,unknown>)?.url)
    if (url.includes('instagram.com')) {
      const ig = extractInstagramFromUrl(url)
      if (ig) return ig
    }
  }

  // 5. website — às vezes o site DELES é o instagram
  const website = clean(item.website)
  if (website.includes('instagram.com')) {
    return extractInstagramFromUrl(website)
  }

  // 6. Varredura geral no item inteiro (último recurso)
  const raw = JSON.stringify(item)
  const matches = raw.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/g) || []
  for (const match of matches) {
    const ig = extractInstagramFromUrl('https://www.' + match)
    if (ig) return ig
  }

  return ''
}

function findFacebook(item: Record<string, unknown>, allLinks: string[]): string {
  const direct = clean(item.facebookUrl || item.facebook || item['contact:facebook'])
  if (direct && direct.includes('facebook.com')) return direct.replace(/\/$/, '')

  for (const u of allLinks) {
    if (u.includes('facebook.com') && !u.includes('share') && !u.includes('sharer')) {
      return u.replace(/\/$/, '')
    }
  }

  // Varredura geral
  const raw = JSON.stringify(item)
  const m = raw.match(/https?:\/\/(?:www\.)?facebook\.com\/(?!share|sharer|dialog|login|watch|photo|video)([a-zA-Z0-9.]+)/)
  return m ? m[0].replace(/\/$/, '') : ''
}

function findLinkedin(item: Record<string, unknown>, allLinks: string[]): string {
  const direct = clean(item.linkedinUrl || item.linkedin || item['contact:linkedin'])
  if (direct && direct.includes('linkedin.com')) return direct.replace(/\/$/, '')
  return allLinks.find(u => u.includes('linkedin.com'))?.replace(/\/$/, '') || ''
}

function isMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  const clean2 = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  if (clean2.length !== 11) return false
  const DDDS = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99])
  return DDDS.has(parseInt(clean2.slice(0, 2))) && clean2[2] === '9'
}

function buildWA(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const clean2 = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  if (!isMobile(clean2)) return ''
  return `https://wa.me/55${clean2}`
}

function extractEmail(text: string): string {
  const m = String(text || '').match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  return m ? m[0].toLowerCase() : ''
}

function extractCNPJ(text: string): string {
  const m = String(text || '').match(/\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/)
  return m ? m[0].replace(/\D/g, '') : ''
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseGoogleMapsItems(items: any[], niche: string): Lead[] {
  // Log do primeiro item para debug (apenas em dev)
  if (items.length > 0 && process.env.NODE_ENV !== 'production') {
    const sample = items[0]
    const keys = Object.keys(sample)
    console.log(`[googleMaps] Campos disponíveis no actor: ${keys.join(', ')}`)
    // Mostra campos relacionados a social media
    const socialKeys = keys.filter(k => /instagram|social|facebook|linkedin|url|link/i.test(k))
    if (socialKeys.length) {
      console.log(`[googleMaps] Campos sociais:`, socialKeys.map(k => `${k}=${JSON.stringify(sample[k])?.slice(0, 80)}`).join(' | '))
    }
  }

  return items.map(item => {
    const website = clean(item.website)
    const phone   = clean(item.phone || item.phoneUnformatted)
    const address = clean(item.address || item.street)

    // Todos os links disponíveis no item
    const allLinks: string[] = [
      item.website, item.facebook, item.facebookUrl,
      item.instagram, item.instagramUrl, item.linkedin, item.linkedinUrl,
      ...(Array.isArray(item.socialMedia) ? item.socialMedia.map((s: unknown) =>
        typeof s === 'string' ? s : (s as Record<string,unknown>)?.url || '') : []),
      ...(Array.isArray((item.additionalInfo as Record<string,unknown>)?.urls)
        ? ((item.additionalInfo as Record<string,unknown>).urls as unknown[]).map((u: unknown) =>
            typeof u === 'string' ? u : (u as Record<string,unknown>)?.url || '')
        : []),
    ].filter(Boolean).map(String)

    const addrParsed = parseAddress(address)
    const city  = clean(item.city  || addrParsed.city)
    const state = clean(item.state || addrParsed.state)

    const email =
      clean(item.email) ||
      extractEmail(item.description || '') ||
      extractEmail(item.additionalInfo ? JSON.stringify(item.additionalInfo) : '') ||
      ''

    const instagram = findInstagram(item as Record<string, unknown>)
    const facebook  = findFacebook(item as Record<string, unknown>, allLinks)
    const linkedin  = findLinkedin(item as Record<string, unknown>, allLinks)
    const whatsapp  = buildWA(phone) ||
      allLinks.find(u => u.includes('wa.me') || u.includes('whatsapp.com/send')) || ''
    const cnpj = extractCNPJ(item.description || '') || undefined

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
      cnpj,
      rating:   clean(item.totalScore || item.rating),
      reviews:  clean(item.reviewsCount),
      category: clean(item.categoryName || item.categories?.[0]),
      source:   'google_maps' as const,
      priority: website ? 'normal' : 'high',
      scrapedAt: new Date().toISOString(),
    } as Lead
  }).filter(l => Boolean(l.name))
}