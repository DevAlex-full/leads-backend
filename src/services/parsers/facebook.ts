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
    if (u && u.includes('instagram.com') && !u.includes('/p/') && !u.includes('/reel/')) {
      return u.replace(/\/$/, '')
    }
  }
  return ''
}

function extractLinkedin(links: string[]): string {
  for (const u of links) {
    if (u && u.includes('linkedin.com')) return u.replace(/\/$/, '')
  }
  return ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFacebookItems(items: any[], niche: string): Lead[] {
  return items.map(item => {
    const about    = clean(item.about || item.description || item.intro || item.pageDescription || '')
    const combined = about

    // Coleta todos os links e redes sociais disponíveis
    const allLinks: string[] = [
      item.website, item.externalUrl,
      item.instagram, item.instagramUrl,
      item.linkedin, item.linkedinUrl,
      item.whatsappUrl,
      ...(item.socialLinks || []).map((l: { url?: string }) => String(l?.url || '')),
      ...(item.links || []).map((l: string | { url?: string }) =>
        typeof l === 'string' ? l : (l?.url || '')
      ),
    ].filter(Boolean).map(String)

    const phone   = clean(item.phone || item.phoneNumber) || extractPhone(combined)
    const email   = clean(item.email) || extractEmail(combined)
    const website = clean(item.website || item.externalUrl || '')
    const pageUrl = clean(item.url || item.pageUrl || item.facebookUrl || '')

    // WhatsApp — direto do actor ou construído a partir do telefone
    const whatsapp =
      clean(item.whatsappUrl || item.whatsapp) ||
      extractWhatsApp(allLinks.join(' '), phone) ||
      extractWhatsApp(combined, phone)

    // Instagram real — só do que o actor retornou
    const instagram =
      clean(item.instagram || item.instagramUrl) ||
      extractInstagram(allLinks)

    const linkedin = clean(item.linkedin || item.linkedinUrl) || extractLinkedin(allLinks)

    const addressParts = [
      item.street, item.streetNumber, item.city, item.state,
    ].filter(Boolean)
    const address = addressParts.join(', ') || clean(item.address || item.location || '')

    return {
      name:      clean(item.title || item.name || item.pageName || ''),
      niche,
      city:      clean(item.city || ''),
      state:     clean(item.state || ''),
      phone,
      email,
      address,
      website,
      instagram,
      linkedin,
      facebook:  pageUrl.includes('facebook.com') ? pageUrl : '',
      whatsapp,
      rating:    clean(item.rating || item.starRating || ''),
      reviews:   clean(item.reviewsCount || item.likesCount || item.followersCount || ''),
      category:  clean(item.categories?.[0] || item.pageType || niche),
      source:    'facebook' as const,
      priority:  website ? 'normal' : 'high',
      scrapedAt: new Date().toISOString(),
    } as Lead
  }).filter(l => Boolean(l.name))
}