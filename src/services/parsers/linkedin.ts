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
export function parseLinkedInItems(items: any[], niche: string): Lead[] {
  return items
    .map((item) => {
      const description: string = item.description || item.about || ''
      const url: string = item.url || item.profileUrl || ''

      return {
        name: item.name || item.companyName || '',
        niche,
        city: item.city || item.location?.split(',')[0] || '',
        state: item.state || item.location?.split(',')[1]?.trim() || '',
        phone: item.phone || extractPhone(description),
        email: item.email || extractEmail(description),
        address: item.address || item.location || '',
        website: item.website || item.companyUrl || '',
        instagram: '',
        linkedin: url.includes('linkedin.com') ? url : '',
        facebook: '',
        rating: '',
        reviews: String(item.followers || item.employeeCount || ''),
        source: 'linkedin',
        priority: (item.website || item.companyUrl) ? 'normal' : 'high',
        scrapedAt: new Date().toISOString(),
      } as Lead
    })
    .filter((l) => Boolean(l.name))
}
