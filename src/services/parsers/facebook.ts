import { Lead } from '../../lib/types'

function extractPhone(text: string): string {
  const m = String(text || '').match(/(\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4})/)
  return m ? m[1] : ''
}

function extractEmail(text: string): string {
  const m = String(text || '').match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  return m ? m[0] : ''
}

function extractWhatsapp(text: string, phone: string): string {
  const waLink = String(text || '').match(/https?:\/\/(wa\.me|api\.whatsapp\.com\/send[^"\s]*)/i)
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

function extractInstagram(about: string, links: string[]): string {
  const all = [about, ...links].join(' ')
  const m = all.match(/https?:\/\/(www\.)?instagram\.com\/[^\s"']+/i)
  return m ? m[0].replace(/\/$/, '') : ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFacebookItems(items: any[], niche: string): Lead[] {
  return items
    .map((item) => {
      const about = String(item.about || item.description || item.intro || '')
      const combined = about

      const phone = String(item.phone || '') || extractPhone(combined)
      const email = String(item.email || '') || extractEmail(combined)
      const website = String(item.website || item.externalUrl || '')
      const pageUrl = String(item.url || item.pageUrl || item.facebookUrl || '')
      const whatsapp = extractWhatsapp(combined, phone)

      const allLinks: string[] = [
        ...(item.socialLinks || []).map((l: {url?: string}) => String(l?.url || '')),
        website,
      ].filter(Boolean)

      // Endereço
      const addressParts = [
        item.street, item.streetNumber, item.city, item.state, item.country,
      ].filter(Boolean)
      const address = addressParts.join(', ') || String(item.address || item.location || '')

      return {
        name: String(item.title || item.name || item.pageName || ''),
        niche,
        city: String(item.city || ''),
        state: String(item.state || ''),
        phone,
        email,
        address,
        website,
        instagram: extractInstagram(combined, allLinks),
        linkedin: '',
        facebook: pageUrl.includes('facebook.com') ? pageUrl : '',
        whatsapp,
        rating: String(item.rating || item.starRating || ''),
        reviews: String(item.reviewsCount || item.likesCount || item.followersCount || ''),
        category: String(item.categories?.[0] || item.pageType || niche),
        source: 'facebook' as const,
        priority: website ? 'normal' : 'high',
        scrapedAt: new Date().toISOString(),
      } as Lead
    })
    .filter((l) => Boolean(l.name))
}