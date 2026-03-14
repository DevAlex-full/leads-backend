import { Lead } from '../../lib/types'

function extractPhone(text: string): string {
  const m = text?.match(/(\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4})/)
  return m ? m[1] : ''
}

function extractEmail(text: string): string {
  const m = text?.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  return m ? m[0] : ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFacebookItems(items: any[], niche: string): Lead[] {
  return items
    .map((item) => {
      const about: string = item.about || item.description || ''
      const pageUrl: string = item.url || item.pageUrl || ''

      return {
        name: item.title || item.name || item.pageName || '',
        niche,
        city: item.city || '',
        state: item.state || '',
        phone: item.phone || extractPhone(about),
        email: item.email || extractEmail(about),
        address: item.address || '',
        website: item.website || '',
        instagram: item.instagramUrl || '',
        linkedin: '',
        facebook: pageUrl.includes('facebook.com') ? pageUrl : '',
        rating: String(item.rating || ''),
        reviews: String(item.reviewsCount || item.likesCount || ''),
        source: 'facebook',
        priority: item.website ? 'normal' : 'high',
        scrapedAt: new Date().toISOString(),
      } as Lead
    })
    .filter((l) => Boolean(l.name))
}
