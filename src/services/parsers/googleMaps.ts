import { Lead } from '../../lib/types'

function extractInstagram(url: string): string {
  if (url && url.includes('instagram.com')) return url
  return ''
}

function extractEmail(text: string): string {
  const m = text?.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  return m ? m[0] : ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseGoogleMapsItems(items: any[], niche: string): Lead[] {
  return items
    .map((item) => {
      const website: string = item.website || ''
      const address: string = item.address || ''

      // Tenta extrair cidade e estado do endereço
      const parts = address.split(',').map((p: string) => p.trim())
      const city = item.city || parts.at(-2) || ''
      const state = item.state || parts.at(-1)?.replace(/\d{5}-\d{3}/, '').trim() || ''

      const email =
        item.email ||
        extractEmail(item.description || '') ||
        extractEmail(item.categoryName || '')

      return {
        name: item.title || item.name || '',
        niche,
        city,
        state,
        phone: item.phone || item.phoneUnformatted || '',
        email,
        address,
        website,
        instagram: extractInstagram(website) || item.instagramUrl || '',
        linkedin: '',
        facebook: item.facebookUrl || '',
        rating: String(item.totalScore || item.rating || ''),
        reviews: String(item.reviewsCount || ''),
        source: 'google_maps',
        priority: website ? 'normal' : 'high',
        scrapedAt: new Date().toISOString(),
      } as Lead
    })
    .filter((l) => Boolean(l.name))
}
