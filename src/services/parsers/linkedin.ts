import { Lead } from '../../lib/types'

function clean(v: unknown): string {
  return String(v || '').trim()
}

function extractPhone(text: string): string {
  const m = String(text || '').match(/(\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4})/)
  return m ? m[1] : ''
}

function extractEmail(text: string): string {
  const m = String(text || '').match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  return m ? m[0].toLowerCase() : ''
}

function extractWhatsApp(text: string, phone: string): string {
  const waLink = String(text || '').match(/https?:\/\/(wa\.me\/\d+|api\.whatsapp\.com\/send[^\s"]*)/i)
  if (waLink) return waLink[0]
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length >= 10) {
      const num = digits.startsWith('55') ? digits : `55${digits}`
      return `https://wa.me/${num}`
    }
  }
  return ''
}

function extractInstagram(links: string[]): string {
  for (const u of links) {
    if (u && u.includes('instagram.com')) return u.replace(/\/$/, '')
  }
  return ''
}

function extractFacebook(links: string[]): string {
  for (const u of links) {
    if (u && u.includes('facebook.com') && !u.includes('share')) return u.replace(/\/$/, '')
  }
  return ''
}

function parseLocation(location: string): { city: string; state: string } {
  if (!location) return { city: '', state: '' }
  const parts = location.split(',').map(p => p.trim())
  return { city: parts[0] || '', state: parts[1] || '' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseLinkedInItems(items: any[], niche: string): Lead[] {
  return items.map(item => {
    const description = clean(item.description || item.about || item.overview || '')
    const url = clean(item.url || item.profileUrl || item.companyUrl || '')

    // Coleta todos os links disponíveis
    const allLinks: string[] = [
      item.website, item.companyUrl,
      item.instagram, item.facebook,
      ...(item.socialLinks || []).map((l: { url?: string }) => l.url || ''),
    ].filter(Boolean).map(String)

    const loc = parseLocation(item.location || '')
    const phone   = clean(item.phone) || extractPhone(description)
    const email   = clean(item.email) || extractEmail(description)
    const website = clean(item.website || item.companyWebsite || '')
    const whatsapp = extractWhatsApp(description, phone)

    return {
      name:      clean(item.name || item.companyName || item.title),
      niche,
      city:      clean(item.city || loc.city),
      state:     clean(item.state || loc.state),
      phone,
      email,
      address:   clean(item.address || item.location || ''),
      website,
      instagram: extractInstagram(allLinks) || clean(item.instagram),
      linkedin:  url.includes('linkedin.com') ? url : '',
      facebook:  extractFacebook(allLinks) || clean(item.facebook),
      whatsapp,
      rating:    '',
      reviews:   clean(item.followers || item.followersCount || item.employeeCount || ''),
      category:  clean(item.industry || item.specialties || niche),
      source:    'linkedin' as const,
      priority:  website ? 'normal' : 'high',
      scrapedAt: new Date().toISOString(),
    } as Lead
  }).filter(l => Boolean(l.name))
}