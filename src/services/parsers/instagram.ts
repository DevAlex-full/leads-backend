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

const VALID_DDDS_INSTA = new Set([
  11,12,13,14,15,16,17,18,19,21,22,24,27,28,
  31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,
  51,53,54,55,61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,
  91,92,93,94,95,96,97,98,99,
])

function buildWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const clean = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  // Só celular BR válido: 11 dígitos, DDD válido, começa com 9
  if (clean.length !== 11) return ''
  const ddd = parseInt(clean.slice(0, 2))
  if (!VALID_DDDS_INSTA.has(ddd)) return ''
  if (clean[2] !== '9') return ''
  return `https://wa.me/55${clean}`
}

function extractWhatsApp(text: string, phone: string): string {
  // Link direto de wa.me ou whatsapp na bio/links
  const waLink = String(text || '').match(
    /https?:\/\/(wa\.me\/\d+[^\s"'<>]*|api\.whatsapp\.com\/send[^\s"'<>]*)/i
  )
  if (waLink) return waLink[0]
  if (phone) return buildWhatsApp(phone)
  return ''
}

function extractFacebook(links: string[]): string {
  for (const u of links) {
    if (u && u.includes('facebook.com') && !u.includes('/share')) {
      return u.replace(/\/$/, '')
    }
  }
  return ''
}

function extractWebsite(item: Record<string, unknown>): string {
  // Tentativas em ordem de prioridade
  const candidates = [
    item.ownerExternalUrl,
    item.externalUrl,
    item.externalUrlShimmed,
    // Bio links (Linktree, site, etc.)
    ...(Array.isArray(item.ownerBioLinks)
      ? (item.ownerBioLinks as { url?: string }[]).map(l => l.url)
      : []),
    ...(Array.isArray(item.bioLinks)
      ? (item.bioLinks as { url?: string }[]).map(l => l.url)
      : []),
  ].filter(Boolean).map(String)

  for (const c of candidates) {
    if (c && !c.includes('instagram.com') && !c.includes('facebook.com')) return c
  }
  return ''
}

function extractCity(item: Record<string, unknown>): string {
  const bio = String(item.ownerBio || item.biography || '')
  // Tenta cidades comuns na bio
  const cityMatch = bio.match(/📍\s*([^,\n]+)|(?:localiz|cidade|cid\.|location)[:]\s*([^,\n]+)/i)
  if (cityMatch) return (cityMatch[1] || cityMatch[2] || '').trim()
  return clean(item.ownerCity || item.locationName || item.city)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseInstagramItems(items: any[], niche: string): Lead[] {
  return items.map(item => {
    // O actor instagram-hashtag-scraper retorna posts — os dados do dono estão em owner*
    // O actor instagram-profile-scraper retorna perfis diretamente
    // Cobrimos os dois formatos:

    // Username válido: apenas letras, números, ponto e underscore, 2-30 chars
    const rawUsername = clean(
      item.ownerUsername ||
      item.username ||
      (item.inputUrl ? String(item.inputUrl).split('/').filter(Boolean).pop() : '') ||
      ''
    )
    // Valida formato de @ real do Instagram
    // Username válido: letras/números/ponto/underscore, 2-30 chars
    // Rejeita: hashes de dataset (ex: vol.5kdgyfdrv2om7), IDs numéricos, muito curto
    const usernameValid = Boolean(rawUsername) &&
      /^[a-zA-Z0-9._]{2,30}$/.test(rawUsername) &&
      !rawUsername.includes('..') &&
      !rawUsername.startsWith('.') &&
      !rawUsername.endsWith('.') &&
      !/^[0-9]+$/.test(rawUsername) &&        // não é só números
      !/^[a-z]{1,2}[0-9]{6,}/.test(rawUsername) && // não é hash tipo "ab123456"
      (rawUsername.match(/[a-zA-Z]/g) || []).length >= 2 // tem ao menos 2 letras
    const username = usernameValid ? rawUsername : ''

    const fullName = clean(
      item.ownerFullName || item.fullName || item.name || ''
    )

    // Bio — fonte principal de contatos no Instagram
    const bio = clean(
      item.ownerBio || item.biography || item.description ||
      item.caption || item.alt || ''
    )

    const caption = clean(item.caption || item.alt || '')
    const combined = `${bio} ${caption}`

    // Todos os links disponíveis
    const bioLinks: { url?: string }[] = [
      ...(item.ownerBioLinks || []),
      ...(item.bioLinks || []),
    ]
    const allLinkUrls = bioLinks.map(l => l.url || '').filter(Boolean)

    const website  = extractWebsite(item as Record<string, unknown>)
    const phone    = clean(item.ownerPhone || item.phone || '') || extractPhone(combined)
    const email    = clean(item.ownerEmail || item.email || '') || extractEmail(combined)

    // WhatsApp — link direto na bio tem prioridade
    const whatsapp =
      extractWhatsApp(combined, '') ||
      extractWhatsApp(allLinkUrls.join(' '), phone) ||
      (phone ? buildWhatsApp(phone) : '')

    const facebook = extractFacebook(allLinkUrls) ||
      clean(item.ownerFacebook || item.facebookUrl || '')

    const city = extractCity(item as Record<string, unknown>)

    // Seguidores — indica relevância do perfil
    const followers = clean(
      item.ownerFollowersCount || item.followersCount ||
      item.followingCount || ''
    )

    return {
      name:      username ? `@${username}` : fullName,
      niche,
      city,
      state:     clean(item.state || ''),
      phone,
      email,
      address:   clean(item.address || ''),
      website,
      instagram: username ? `https://www.instagram.com/${username}` : '',
      linkedin:  '',
      facebook,
      whatsapp,
      rating:    followers,
      reviews:   clean(item.likesCount || item.commentsCount || ''),
      category:  niche,
      source:    'instagram' as const,
      priority:  website ? 'normal' : 'high',
      scrapedAt: new Date().toISOString(),
    } as Lead
  }).filter(l => Boolean(l.name))
}