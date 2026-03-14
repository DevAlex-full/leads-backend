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
  // Link direto de WhatsApp na bio
  const waLink = String(text || '').match(/https?:\/\/(wa\.me|api\.whatsapp\.com\/send[^"\s]*)/i)
  if (waLink) return waLink[0]
  // Número de telefone formatado como link
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length >= 10) {
      const num = digits.startsWith('55') ? digits : `55${digits}`
      return `https://wa.me/${num}`
    }
  }
  return ''
}

function extractFacebook(text: string, links: string[]): string {
  const all = [text, ...links].join(' ')
  const m = all.match(/https?:\/\/(www\.)?facebook\.com\/[^\s"']+/i)
  return m ? m[0].replace(/\/$/, '') : ''
}

function extractWebsite(externalUrl: string, bio: string): string {
  if (externalUrl) return externalUrl
  // Tenta extrair URL da bio
  const m = String(bio || '').match(/https?:\/\/[^\s]+/i)
  return m ? m[0] : ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseInstagramItems(items: any[], niche: string): Lead[] {
  return items
    .map((item) => {
      const bio = String(item.ownerBio || item.biography || item.caption || '')
      const caption = String(item.caption || item.alt || '')
      const combined = `${bio} ${caption}`

      const username = String(item.ownerUsername || item.username || '')
      const fullName = String(item.ownerFullName || item.fullName || '')
      const name = username ? `@${username}` : fullName

      const externalUrl = String(item.ownerExternalUrl || item.externalUrl || '')
      const phone = extractPhone(combined)
      const email = extractEmail(combined)
      const website = extractWebsite(externalUrl, bio)
      const whatsapp = extractWhatsapp(combined, phone)

      // Links adicionais do perfil
      const profileLinks: string[] = [
        ...(item.ownerBioLinks || []).map((l: {url?: string}) => l.url || ''),
        externalUrl,
      ].filter(Boolean)

      return {
        name,
        niche,
        city: '',
        state: '',
        phone,
        email,
        address: '',
        website,
        instagram: username ? `https://instagram.com/${username}` : '',
        linkedin: '',
        facebook: extractFacebook(combined, profileLinks),
        whatsapp,
        rating: String(item.likesCount || ''),
        reviews: String(item.commentsCount || ''),
        category: niche,
        source: 'instagram' as const,
        priority: website ? 'normal' : 'high',
        scrapedAt: new Date().toISOString(),
      } as Lead
    })
    .filter((l) => Boolean(l.name))
}