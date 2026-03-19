/**
 * extractorService.ts
 * Cascata: Site → CNPJ (BrasilAPI) → DuckDuckGo → Instagram
 * 100% gratuito, sem chaves de API.
 */

import fetch from 'node-fetch'
import * as cheerio from 'cheerio'

const CONTACT_PATHS = [
  '/contato', '/contact', '/fale-conosco', '/sobre', '/about',
  '/quem-somos', '/atendimento', '/contacto', '/nos-contate',
]

const BLOCKED_EMAIL_DOMAINS = new Set([
  'example.com', 'seudominio.com', 'email.com', 'domain.com',
  'wixpress.com', 'wordpress.com', 'squarespace.com', 'wix.com',
  'hotmail.com.br', 'tempmail.com', 'mailinator.com',
])

const VALID_DDDS = new Set([
  11,12,13,14,15,16,17,18,19,
  21,22,24,27,28,
  31,32,33,34,35,37,38,
  41,42,43,44,45,46,47,48,49,
  51,53,54,55,
  61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,
  81,82,83,84,85,86,87,88,89,
  91,92,93,94,95,96,97,98,99,
])

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

export interface ExtractedData {
  emails: string[]
  phones: string[]
  whatsapp: string | null
  instagram: string | null
  facebook: string | null
  linkedin: string | null
  site: string | null
  cnpj: string | null
  razaoSocial: string | null
  bairro: string | null
  cep: string | null
}

function emptyData(): ExtractedData {
  return {
    emails: [], phones: [], whatsapp: null,
    instagram: null, facebook: null, linkedin: null,
    site: null, cnpj: null, razaoSocial: null, bairro: null, cep: null,
  }
}

// ── Validação ────────────────────────────────────────────────────

export function validateEmail(email: string): string | null {
  const low = email.toLowerCase().trim()
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(low)) return null
  const domain = low.split('@')[1]
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return null
  if (low.length > 80) return null
  return low
}

export function validatePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  const clean = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  if (clean.length !== 10 && clean.length !== 11) return null
  const ddd = parseInt(clean.slice(0, 2))
  if (!VALID_DDDS.has(ddd)) return null
  if (clean.length === 11 && clean[2] !== '9') return null
  return clean
}

function buildWhatsApp(phone: string): string | null {
  const digits = validatePhone(phone)
  if (!digits) return null
  return `https://wa.me/55${digits}`
}

function cleanInstagram(href: string): string | null {
  const SKIP = ['p', 'reel', 'explore', 'stories', 'tv', 'accounts']
  const m = href.match(/instagram\.com\/([a-zA-Z0-9._]+)\/?/)
  if (!m) return null
  if (SKIP.includes(m[1])) return null
  if (m[1].length < 2) return null
  return `https://www.instagram.com/${m[1]}`
}

function merge(base: ExtractedData, next: Partial<ExtractedData>): void {
  for (const e of (next.emails || [])) {
    if (!base.emails.includes(e)) base.emails.push(e)
  }
  for (const p of (next.phones || [])) {
    if (!base.phones.includes(p)) base.phones.push(p)
  }
  if (!base.whatsapp && next.whatsapp)     base.whatsapp     = next.whatsapp
  if (!base.instagram && next.instagram)   base.instagram   = next.instagram
  if (!base.facebook && next.facebook)     base.facebook     = next.facebook
  if (!base.linkedin && next.linkedin)     base.linkedin     = next.linkedin
  if (!base.site && next.site)             base.site         = next.site
  if (!base.cnpj && next.cnpj)             base.cnpj         = next.cnpj
  if (!base.razaoSocial && next.razaoSocial) base.razaoSocial = next.razaoSocial
  if (!base.bairro && next.bairro)         base.bairro       = next.bairro
  if (!base.cep && next.cep)               base.cep          = next.cep
}

function isComplete(d: ExtractedData): boolean {
  return Boolean(
    (d.emails.length > 0 || d.phones.length > 0 || d.whatsapp) &&
    (d.instagram || d.facebook)
  )
}

async function fetchHtml(url: string, ms = 12000): Promise<string | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ms)
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: ctrl.signal as RequestInit['signal'] })
      clearTimeout(t)
      if (res.ok) {
        const ct = res.headers.get('content-type') || ''
        if (ct.includes('html') || !ct) return await res.text()
      }
    } catch { /* retry */ }
    if (i === 0) await new Promise(r => setTimeout(r, 800))
  }
  return null
}

function extractFromHtml(html: string): Partial<ExtractedData> {
  const $ = cheerio.load(html)
  $('script, style, noscript, head').remove()
  const text = $.root().text()

  const result: Partial<ExtractedData> = { emails: [], phones: [], whatsapp: null, instagram: null, facebook: null, linkedin: null }

  for (const m of text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)) {
    const v = validateEmail(m[0])
    if (v && !result.emails!.includes(v)) result.emails!.push(v)
  }

  for (const m of text.matchAll(/(?:\+?55\s?)?(?:\(?\d{2}\)?[\s\-]?)(?:9\s?\d{4}|\d{4})[\s\-]?\d{4}/g)) {
    const v = validatePhone(m[0])
    if (v && !result.phones!.includes(v)) result.phones!.push(v)
  }

  const wa = html.match(/https?:\/\/(?:api\.whatsapp\.com\/send[^\s"'<>]*|wa\.me\/\d+[^\s"'<>]*)/)
  if (wa) result.whatsapp = wa[0]
  else if (result.phones!.length) result.whatsapp = buildWhatsApp(result.phones![0])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $('a[href]').each((_: number, el: any) => {
    const href = $(el).attr('href') || ''
    if (!result.instagram && href.includes('instagram.com')) result.instagram = cleanInstagram(href)
    if (!result.facebook && href.includes('facebook.com') && !href.includes('share')) result.facebook = href.replace(/\/$/, '')
    if (!result.linkedin && href.includes('linkedin.com')) result.linkedin = href.replace(/\/$/, '')
  })

  return result
}

// ── ESTRATÉGIA 1: Site ───────────────────────────────────────────

export async function extractFromSite(siteUrl: string): Promise<Partial<ExtractedData>> {
  if (!siteUrl.startsWith('http')) siteUrl = 'https://' + siteUrl
  let base: string
  try { base = new URL(siteUrl).origin } catch { return {} }

  const result: Partial<ExtractedData> = { emails: [], phones: [], whatsapp: null, instagram: null, facebook: null, linkedin: null }

  const mainHtml = await fetchHtml(siteUrl)
  if (mainHtml) merge(result as ExtractedData, extractFromHtml(mainHtml))

  if (!isComplete(result as ExtractedData)) {
    const pages = await Promise.allSettled(CONTACT_PATHS.map(p => fetchHtml(base + p)))
    for (const r of pages) {
      if (r.status === 'fulfilled' && r.value) {
        merge(result as ExtractedData, extractFromHtml(r.value))
        if (isComplete(result as ExtractedData)) break
      }
    }
  }
  return result
}

// ── ESTRATÉGIA 2: BrasilAPI (CNPJ) ──────────────────────────────

export async function extractFromCNPJ(cnpj: string): Promise<Partial<ExtractedData>> {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return {}
  try {
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 10000)
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, { signal: ctrl.signal as RequestInit['signal'] })
    if (!res.ok) return {}
    const data = await res.json() as Record<string, unknown>

    const result: Partial<ExtractedData> = {
      emails: [], phones: [],
      razaoSocial: (data.razao_social as string) || null,
      bairro: (data.bairro as string) || null,
      cep: (data.cep as string) || null,
    }

    const email = data.email as string
    if (email) { const v = validateEmail(email); if (v) result.emails!.push(v) }

    const tel = (data.ddd_telefone_1 as string || '').replace(/\D/g, '')
    if (tel) { const v = validatePhone(tel); if (v) { result.phones!.push(v); result.whatsapp = buildWhatsApp(v) } }

    return result
  } catch { return {} }
}

// ── ESTRATÉGIA 3: DuckDuckGo ─────────────────────────────────────

export async function extractFromSearch(name: string, city: string): Promise<Partial<ExtractedData>> {
  const result: Partial<ExtractedData> = { emails: [], phones: [], whatsapp: null, instagram: null, facebook: null, linkedin: null, site: null }
  const discoveredUrls: string[] = []

  for (const query of [`"${name}" ${city} contato email WhatsApp`, `"${name}" ${city} site oficial`]) {
    try {
      const { search } = await import('duck-duck-scrape')
      const ddg = await search(query, { locale: 'br-pt', safeSearch: 0 as 0 })
      for (const r of (ddg.results || []).slice(0, 5)) {
        merge(result as ExtractedData, extractFromHtml(`<p>${r.description || ''}</p>`))
        const url = r.url || ''
        const skip = ['google.', 'facebook.com', 'instagram.com', 'youtube.', 'wikipedia.', 'tripadvisor.']
        if (url && !skip.some(s => url.includes(s))) discoveredUrls.push(url)
        if (!result.instagram && r.url?.includes('instagram.com')) result.instagram = cleanInstagram(r.url)
      }
    } catch { /* rate limit — continua */ }
  }

  for (const url of discoveredUrls.slice(0, 2)) {
    if (isComplete(result as ExtractedData)) break
    const siteData = await extractFromSite(url)
    merge(result as ExtractedData, siteData)
    if (!result.site && ((siteData.emails?.length ?? 0) > 0 || (siteData.phones?.length ?? 0) > 0)) result.site = url
  }

  return result
}

// ── ESTRATÉGIA 4: Busca direcionada de Instagram por nome + cidade ──────

export async function findInstagramByName(name: string, city: string): Promise<string | null> {
  // Busca específica: "nome da empresa" cidade instagram
  const queries = [
    `"${name}" instagram.com`,
    `"${name}" ${city} instagram`,
    `site:instagram.com "${name}" ${city}`,
  ]

  for (const query of queries) {
    try {
      const { search } = await import('duck-duck-scrape')
      const ddg = await search(query, { locale: 'br-pt', safeSearch: 0 as 0 })
      for (const r of (ddg.results || []).slice(0, 5)) {
        const url = r.url || ''
        if (url.includes('instagram.com')) {
          const m = url.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})\/? /)
          if (m) {
            const handle = m[1]
            const skip = ['p', 'reel', 'explore', 'stories', 'tv', 'accounts']
            if (!skip.includes(handle) && !/^[0-9]+$/.test(handle)) {
              return `https://www.instagram.com/${handle}`
            }
          }
        }
        // Tenta extrair do snippet
        const snippet = r.description || ''
        const snipMatch = snippet.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/)
        if (snipMatch && !['p','reel','explore'].includes(snipMatch[1])) {
          return `https://www.instagram.com/${snipMatch[1]}`
        }
      }
    } catch { /* continua */ }
  }
  return null
}

// ── CASCATA PRINCIPAL ────────────────────────────────────────────

export async function enrichLeadData(
  name: string,
  city: string,
  website?: string | null,
  cnpj?: string | null,
): Promise<ExtractedData> {
  const result = emptyData()

  // Etapa 1: Site
  if (website) merge(result, await extractFromSite(website))

  // Etapa 2: CNPJ
  if (!isComplete(result) && cnpj) {
    const cnpjData = await extractFromCNPJ(cnpj)
    merge(result, cnpjData)
    if (cnpjData.site && !website) merge(result, await extractFromSite(cnpjData.site))
  }

  // Etapa 3: DuckDuckGo
  if (!isComplete(result)) merge(result, await extractFromSearch(name, city))


  // ── Etapa 4: Busca Instagram por nome+cidade se ainda não tiver ────
  if (!result.instagram) {
    const ig = await findInstagramByName(name, city)
    if (ig) result.instagram = ig
  }

  // WhatsApp fallback
  if (!result.whatsapp && result.phones.length > 0) {
    result.whatsapp = buildWhatsApp(result.phones[0])
  }

  return result
}