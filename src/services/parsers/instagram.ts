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

const VALID_DDDS = new Set([
  11,12,13,14,15,16,17,18,19,21,22,24,27,28,
  31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,
  51,53,54,55,61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,
  91,92,93,94,95,96,97,98,99,
])

function buildWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const c = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  if (c.length !== 11) return ''
  const ddd = parseInt(c.slice(0, 2))
  if (!VALID_DDDS.has(ddd) || c[2] !== '9') return ''
  return `https://wa.me/55${c}`
}

function extractWhatsApp(text: string, phone: string): string {
  const m = String(text || '').match(
    /https?:\/\/(wa\.me\/\d+[^\s"'<>]*|api\.whatsapp\.com\/send[^\s"'<>]*)/i
  )
  if (m) return m[0]
  if (phone) return buildWhatsApp(phone)
  return ''
}

function extractFacebook(links: string[]): string {
  for (const u of links) {
    if (u?.includes('facebook.com') && !u.includes('/share')) return u.replace(/\/$/, '')
  }
  return ''
}

function extractWebsite(item: Record<string, unknown>): string {
  const candidates = [
    item.ownerExternalUrl, item.externalUrl, item.externalUrlShimmed,
    ...(Array.isArray(item.ownerBioLinks) ? (item.ownerBioLinks as {url?:string}[]).map(l => l.url) : []),
    ...(Array.isArray(item.bioLinks) ? (item.bioLinks as {url?:string}[]).map(l => l.url) : []),
  ].filter(Boolean).map(String)
  return candidates.find(c => c && !c.includes('instagram.com') && !c.includes('facebook.com')) || ''
}

// ── Base de cidades (200+) ────────────────────────────────────────
const CITIES_BR: [string, string, string][] = [
  ['sao paulo','Sao Paulo','SP'],['campinas','Campinas','SP'],
  ['ribeirao preto','Ribeirao Preto','SP'],['santo andre','Santo Andre','SP'],
  ['sorocaba','Sorocaba','SP'],['guarulhos','Guarulhos','SP'],
  ['sao bernardo do campo','Sao Bernardo do Campo','SP'],['osasco','Osasco','SP'],
  ['mogi das cruzes','Mogi das Cruzes','SP'],['sao jose dos campos','Sao Jose dos Campos','SP'],
  ['bauru','Bauru','SP'],['jundiai','Jundiai','SP'],['piracicaba','Piracicaba','SP'],
  ['santos','Santos','SP'],['sao jose do rio preto','Sao Jose do Rio Preto','SP'],
  ['americana','Americana','SP'],['diadema','Diadema','SP'],['limeira','Limeira','SP'],
  ['maua','Maua','SP'],['sao carlos','Sao Carlos','SP'],['franca','Franca','SP'],
  ['suzano','Suzano','SP'],['indaiatuba','Indaiatuba','SP'],['araraquara','Araraquara','SP'],
  ['presidente prudente','Presidente Prudente','SP'],
  ['rio de janeiro','Rio de Janeiro','RJ'],['niteroi','Niteroi','RJ'],
  ['nova iguacu','Nova Iguacu','RJ'],['duque de caxias','Duque de Caxias','RJ'],
  ['sao goncalo','Sao Goncalo','RJ'],['petropolis','Petropolis','RJ'],
  ['volta redonda','Volta Redonda','RJ'],['macae','Macae','RJ'],
  ['cabo frio','Cabo Frio','RJ'],['angra dos reis','Angra dos Reis','RJ'],
  ['belo horizonte','Belo Horizonte','MG'],['contagem','Contagem','MG'],
  ['uberlandia','Uberlandia','MG'],['juiz de fora','Juiz de Fora','MG'],
  ['betim','Betim','MG'],['montes claros','Montes Claros','MG'],
  ['uberaba','Uberaba','MG'],['governador valadares','Governador Valadares','MG'],
  ['curitiba','Curitiba','PR'],['londrina','Londrina','PR'],
  ['maringa','Maringa','PR'],['ponta grossa','Ponta Grossa','PR'],
  ['cascavel','Cascavel','PR'],['foz do iguacu','Foz do Iguacu','PR'],
  ['porto alegre','Porto Alegre','RS'],['caxias do sul','Caxias do Sul','RS'],
  ['pelotas','Pelotas','RS'],['canoas','Canoas','RS'],
  ['santa maria','Santa Maria','RS'],['novo hamburgo','Novo Hamburgo','RS'],
  ['florianopolis','Florianopolis','SC'],['joinville','Joinville','SC'],
  ['blumenau','Blumenau','SC'],['criciuma','Criciuma','SC'],
  ['itajai','Itajai','SC'],['chapeco','Chapeco','SC'],
  ['salvador','Salvador','BA'],['feira de santana','Feira de Santana','BA'],
  ['vitoria da conquista','Vitoria da Conquista','BA'],['camacari','Camacari','BA'],
  ['fortaleza','Fortaleza','CE'],['caucaia','Caucaia','CE'],
  ['juazeiro do norte','Juazeiro do Norte','CE'],['sobral','Sobral','CE'],
  ['recife','Recife','PE'],['caruaru','Caruaru','PE'],
  ['olinda','Olinda','PE'],['petrolina','Petrolina','PE'],
  ['jaboatao dos guararapes','Jaboatao dos Guararapes','PE'],
  ['natal','Natal','RN'],['maceio','Maceio','AL'],
  ['joao pessoa','Joao Pessoa','PB'],['teresina','Teresina','PI'],
  ['aracaju','Aracaju','SE'],['sao luis','Sao Luis','MA'],['imperatriz','Imperatriz','MA'],
  ['manaus','Manaus','AM'],['belem','Belem','PA'],['santarem','Santarem','PA'],
  ['porto velho','Porto Velho','RO'],['macapa','Macapa','AP'],
  ['boa vista','Boa Vista','RR'],['palmas','Palmas','TO'],['rio branco','Rio Branco','AC'],
  ['goiania','Goiania','GO'],['aparecida de goiania','Aparecida de Goiania','GO'],
  ['anapolis','Anapolis','GO'],['campo grande','Campo Grande','MS'],
  ['dourados','Dourados','MS'],['cuiaba','Cuiaba','MT'],['brasilia','Brasilia','DF'],
  ['vitoria','Vitoria','ES'],['vila velha','Vila Velha','ES'],['serra','Serra','ES'],
]

function normC(s: string): string {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim()
}

const UF_RE = /(^|[\s\-\/|,])(SP|RJ|MG|PR|RS|SC|BA|CE|PE|RN|AL|PB|PI|SE|MA|AM|PA|RO|GO|MS|MT|DF|ES|TO|RR|AC|AP)([\s\-\/|,.]|$)/

// ── Extração de cidade baseada nos campos REAIS do actor ──────────
// O actor instagram-hashtag-scraper NÃO retorna ownerBio.
// Campos disponíveis: caption, locationName, latestComments, firstComment

function extractCity(item: Record<string, unknown>, targetCities?: string[]): { city: string; state: string } {
  const targetNorms = (targetCities || []).map(c => normC(c))

  function findCity(text: string): { city: string; state: string } | null {
    const n = normC(text)
    if (!n) return null

    // Prioriza cidades-alvo do usuário
    for (const target of targetNorms) {
      const match = CITIES_BR.find(([norm]) => norm === target)
      if (match && n.includes(target)) return { city: match[1], state: match[2] }
    }

    // Busca todas as cidades conhecidas
    for (const [norm, original, uf] of CITIES_BR) {
      if (n === norm || n.startsWith(norm + ' ') || n.includes(' ' + norm + ' ') || n.endsWith(' ' + norm)) {
        return { city: original, state: uf }
      }
    }
    return null
  }

  function findUF(text: string): string {
    const m = text.match(UF_RE)
    return m ? m[2] : ''
  }

  function scanText(text: string): { city: string; state: string } | null {
    if (!text) return null

    // Padrão "Cidade - UF" ou "Cidade/UF" (ex: "Manaus - AM", "Sao Paulo/SP")
    const cityUF = text.match(/([A-Za-z\u00C0-\u00FF]+(?:\s[A-Za-z\u00C0-\u00FF]+)*)\s*[-\/]\s*(SP|RJ|MG|PR|RS|SC|BA|CE|PE|RN|AL|PB|PI|SE|MA|AM|PA|RO|GO|MS|MT|DF|ES|TO|RR|AC|AP)(?:\s|$|[^A-Z])/)
    if (cityUF) {
      const r = findCity(cityUF[1])
      if (r) return r
      // Mesmo sem estar na lista, retorna com a UF confirmada
      return { city: cityUF[1].trim(), state: cityUF[2] }
    }

    // Busca direta por cidade no texto
    const r = findCity(text)
    if (r) return r

    // Pelo menos a UF
    const uf = findUF(text)
    if (uf) return { city: '', state: uf }

    return null
  }

  // 1. caption do post
  const caption = clean(item.caption)
  if (caption) {
    // Split por emoji de localização (caractere unicode)
    const parts = caption.split('\u{1F4CD}') // 📍
      .concat(caption.split('\u{1F4CC}'))   // 📌
    if (parts.length > 1) {
      for (const part of parts.slice(1)) {
        const snippet = part.split('\n')[0].replace(/[|•·]/g, ' ').trim().slice(0, 60)
        const r = findCity(snippet) || scanText(snippet)
        if (r?.city || r?.state) return r
      }
    }
    const r = scanText(caption)
    if (r) return r
  }

  // 2. locationName (tag de localização do post)
  const locName = clean(item.locationName)
  if (locName) {
    const r = findCity(locName) || scanText(locName)
    if (r) return r
  }

  // 3. Comentários
  const comments = [
    ...(Array.isArray(item.latestComments) ? item.latestComments : []),
    item.firstComment,
  ].filter(Boolean)
  for (const c of comments) {
    const txt = clean((c as Record<string, unknown>)?.text || String(c || ''))
    const r = scanText(txt)
    if (r) return r
  }

  return { city: '', state: '' }
}

// ── Validação de username ─────────────────────────────────────────
function isValidUsername(raw: string): boolean {
  if (!raw) return false
  if (!/^[a-zA-Z0-9._]{2,30}$/.test(raw)) return false
  if (raw.includes('..') || raw.startsWith('.') || raw.endsWith('.')) return false
  if (/^[0-9]+$/.test(raw)) return false
  if (/^[a-z]{1,2}[0-9]{6,}/.test(raw)) return false
  if ((raw.match(/[a-zA-Z]/g) || []).length < 2) return false
  return true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseInstagramItems(items: any[], niche: string, targetCities?: string[]): Lead[] {
  // Log diagnóstico em dev
  if (items.length > 0 && process.env.NODE_ENV !== 'production') {
    const sample = items[0]
    const keys = Object.keys(sample)
    console.log(`[instagram parser] Campos: ${keys.join(', ')}`)
    const bioKeys = keys.filter(k => /bio|desc|caption|location|city|owner/i.test(k))
    bioKeys.forEach(k => {
      const v = sample[k]
      if (v && typeof v !== 'object') console.log(`[instagram parser] ${k} = "${String(v).slice(0, 100)}"`)
      else if (v) console.log(`[instagram parser] ${k} (obj) = ${JSON.stringify(v).slice(0, 150)}`)
    })
  }

  return items.map(item => {
    const rawUsername = clean(
      item.ownerUsername || item.username ||
      (item.inputUrl ? String(item.inputUrl).split('/').filter(Boolean).pop() : '') || ''
    )
    const username = isValidUsername(rawUsername) ? rawUsername : ''
    const fullName = clean(item.ownerFullName || item.fullName || item.name || '')

    const bio = clean(item.ownerBio || item.biography || item.description || '')
    const caption = clean(item.caption || item.alt || '')
    const combined = `${bio} ${caption}`

    const bioLinks: { url?: string }[] = [
      ...(item.ownerBioLinks || []),
      ...(item.bioLinks || []),
    ]
    const allLinkUrls = bioLinks.map(l => l.url || '').filter(Boolean)

    const website  = extractWebsite(item as Record<string, unknown>)
    const phone    = clean(item.ownerPhone || item.phone || '') || extractPhone(combined)
    const email    = clean(item.ownerEmail || item.email || '') || extractEmail(combined)
    const whatsapp =
      extractWhatsApp(combined, '') ||
      extractWhatsApp(allLinkUrls.join(' '), phone) ||
      (phone ? buildWhatsApp(phone) : '')
    const facebook = extractFacebook(allLinkUrls) ||
      clean(item.ownerFacebook || item.facebookUrl || '')

    const { city, state } = extractCity(item as Record<string, unknown>, targetCities)
    const followers = clean(item.ownerFollowersCount || item.followersCount || '')

    return {
      name:      username ? `@${username}` : fullName,
      niche,
      city,
      state,
      phone,
      email,
      address:   '',
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