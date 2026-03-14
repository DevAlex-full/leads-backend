import { Lead } from '../../lib/types'

function clean(v: unknown): string {
  return String(v || '').trim()
}

function extractInstagram(website: string, links: string[]): string {
  const all = [website, ...links].filter(Boolean)
  for (const u of all) {
    if (u.includes('instagram.com')) return u.replace(/\/$/, '')
  }
  return ''
}

function extractFacebook(website: string, links: string[]): string {
  const all = [website, ...links].filter(Boolean)
  for (const u of all) {
    if (u.includes('facebook.com') || u.includes('fb.com')) return u.replace(/\/$/, '')
  }
  return ''
}

function extractLinkedin(links: string[]): string {
  for (const u of links) {
    if (u.includes('linkedin.com')) return u.replace(/\/$/, '')
  }
  return ''
}

function extractEmail(text: string): string {
  const m = String(text || '').match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  return m ? m[0] : ''
}

function extractWhatsapp(phone: string, website: string, links: string[]): string {
  // Verifica links de WhatsApp direto
  const all = [website, ...links].filter(Boolean)
  for (const u of all) {
    if (u.includes('wa.me') || u.includes('whatsapp.com/send')) return u
  }
  // Formata número BR como link WhatsApp
  const digits = phone.replace(/\D/g, '')
  if (digits.length >= 10) {
    const num = digits.startsWith('55') ? digits : `55${digits}`
    return `https://wa.me/${num}`
  }
  return ''
}

function parseAddress(raw: string): { city: string; state: string } {
  if (!raw) return { city: '', state: '' }
  const parts = raw.split(',').map((p) => p.trim())
  // Formato típico: "Rua X, 123, Bairro, Cidade - SP, Brasil"
  // Tenta encontrar "Cidade - UF" ou "Cidade/UF"
  for (const part of parts.reverse()) {
    const m = part.match(/^([^-/]+)\s*[-/]\s*([A-Z]{2})/)
    if (m) return { city: m[1].trim(), state: m[2].trim() }
  }
  return { city: parts.at(-2) || '', state: '' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseGoogleMapsItems(items: any[], niche: string): Lead[] {
  return items
    .map((item) => {
      const website = clean(item.website)
      const phone = clean(item.phone || item.phoneUnformatted)
      const address = clean(item.address)

      // Coleta todos os links sociais disponíveis
      const socialLinks: string[] = [
        item.facebook, item.instagram, item.linkedin,
        ...(item.socialMedia || []),
        ...(item.additionalInfo?.urls || []),
      ].filter(Boolean).map(String)

      // Dados de localização
      const addrParsed = parseAddress(address)
      const city = clean(item.city || addrParsed.city)
      const state = clean(item.state || addrParsed.state)

      // Emails — tenta múltiplas fontes
      const email =
        clean(item.email) ||
        extractEmail(item.description || '') ||
        extractEmail(item.additionalInfo?.email || '') ||
        extractEmail((item.reviews || []).slice(0, 3).map((r: {text?: string}) => r.text || '').join(' '))

      const instagram = extractInstagram(website, socialLinks) || clean(item.instagramUrl)
      const facebook = extractFacebook(website, socialLinks) || clean(item.facebookUrl)
      const linkedin = extractLinkedin(socialLinks) || clean(item.linkedinUrl)
      const whatsapp = extractWhatsapp(phone, website, socialLinks)

      return {
        name: clean(item.title || item.name),
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
        rating: clean(item.totalScore || item.rating),
        reviews: clean(item.reviewsCount),
        category: clean(item.categoryName || item.categories?.[0]),
        source: 'google_maps' as const,
        priority: website ? 'normal' : 'high',
        scrapedAt: new Date().toISOString(),
      } as Lead
    })
    .filter((l) => Boolean(l.name))
}