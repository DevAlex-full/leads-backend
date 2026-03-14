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
export function parseInstagramItems(items: any[], niche: string): Lead[] {
  return items
    .map((item) => {
      const caption: string = item.caption || item.alt || ''
      const bio: string = item.ownerBio || item.biography || ''
      const combined = `${caption} ${bio}`
      const username: string = item.ownerUsername || item.username || ''

      return {
        name: username ? `@${username}` : (item.ownerFullName || ''),
        niche,
        city: '',
        state: '',
        phone: extractPhone(combined),
        email: extractEmail(combined),
        address: '',
        website: item.ownerExternalUrl || item.externalUrl || '',
        instagram: username ? `https://instagram.com/${username}` : '',
        linkedin: '',
        facebook: '',
        rating: '',
        reviews: String(item.likesCount || ''),
        source: 'instagram',
        priority: (item.ownerExternalUrl || item.externalUrl) ? 'normal' : 'high',
        scrapedAt: new Date().toISOString(),
      } as Lead
    })
    .filter((l) => Boolean(l.name))
}
