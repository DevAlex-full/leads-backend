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

// ── Base de cidades brasileiras (200+ cidades) ──────────────────
// Formato: [normalizado, original, UF]
const CITIES_BR: [string, string, string][] = [
  // SP
  ['sao paulo','São Paulo','SP'],['campinas','Campinas','SP'],
  ['ribeirao preto','Ribeirão Preto','SP'],['santo andre','Santo André','SP'],
  ['sorocaba','Sorocaba','SP'],['guarulhos','Guarulhos','SP'],
  ['sao bernardo do campo','São Bernardo do Campo','SP'],['osasco','Osasco','SP'],
  ['mogi das cruzes','Mogi das Cruzes','SP'],['sao jose dos campos','São José dos Campos','SP'],
  ['bauru','Bauru','SP'],['jundiai','Jundiaí','SP'],['piracicaba','Piracicaba','SP'],
  ['carapicuiba','Carapicuíba','SP'],['santos','Santos','SP'],
  ['sao jose do rio preto','São José do Rio Preto','SP'],['marilia','Marília','SP'],
  ['americana','Americana','SP'],['diadema','Diadema','SP'],['limeira','Limeira','SP'],
  ['maua','Mauá','SP'],['sao carlos','São Carlos','SP'],['itaquaquecetuba','Itaquaquecetuba','SP'],
  ['cotia','Cotia','SP'],['franca','Franca','SP'],['suzano','Suzano','SP'],
  ['taboao da serra','Taboão da Serra','SP'],['sumare','Sumaré','SP'],
  ['indaiatuba','Indaiatuba','SP'],['araraquara','Araraquara','SP'],
  ['catanduva','Catanduva','SP'],['araçatuba','Araçatuba','SP'],
  ['presidente prudente','Presidente Prudente','SP'],
  // RJ
  ['rio de janeiro','Rio de Janeiro','RJ'],['niteroi','Niterói','RJ'],
  ['nova iguacu','Nova Iguaçu','RJ'],['duque de caxias','Duque de Caxias','RJ'],
  ['sao goncalo','São Gonçalo','RJ'],['belford roxo','Belford Roxo','RJ'],
  ['campos dos goytacazes','Campos dos Goytacazes','RJ'],['petropolis','Petrópolis','RJ'],
  ['volta redonda','Volta Redonda','RJ'],['macae','Macaé','RJ'],
  ['cabo frio','Cabo Frio','RJ'],['angra dos reis','Angra dos Reis','RJ'],
  ['nova friburgo','Nova Friburgo','RJ'],['teresopolis','Teresópolis','RJ'],
  ['mesquita','Mesquita','RJ'],['nilópolis','Nilópolis','RJ'],
  // MG
  ['belo horizonte','Belo Horizonte','MG'],['contagem','Contagem','MG'],
  ['uberlandia','Uberlândia','MG'],['juiz de fora','Juiz de Fora','MG'],
  ['betim','Betim','MG'],['montes claros','Montes Claros','MG'],
  ['ribeirao das neves','Ribeirão das Neves','MG'],['uberaba','Uberaba','MG'],
  ['governador valadares','Governador Valadares','MG'],['ipatinga','Ipatinga','MG'],
  ['sete lagoas','Sete Lagoas','MG'],['divinopolis','Divinópolis','MG'],
  ['santa luzia','Santa Luzia','MG'],['ibirite','Ibirité','MG'],
  ['pocos de caldas','Poços de Caldas','MG'],['barbacena','Barbacena','MG'],
  // PR
  ['curitiba','Curitiba','PR'],['londrina','Londrina','PR'],
  ['maringa','Maringá','PR'],['ponta grossa','Ponta Grossa','PR'],
  ['cascavel','Cascavel','PR'],['sao jose dos pinhais','São José dos Pinhais','PR'],
  ['foz do iguacu','Foz do Iguaçu','PR'],['colombo','Colombo','PR'],
  ['guarapuava','Guarapuava','PR'],['paranagua','Paranaguá','PR'],
  // RS
  ['porto alegre','Porto Alegre','RS'],['caxias do sul','Caxias do Sul','RS'],
  ['pelotas','Pelotas','RS'],['canoas','Canoas','RS'],
  ['santa maria','Santa Maria','RS'],['gravataí','Gravataí','RS'],
  ['viamao','Viamão','RS'],['novo hamburgo','Novo Hamburgo','RS'],
  ['sao leopoldo','São Leopoldo','RS'],['rio grande','Rio Grande','RS'],
  // SC
  ['florianopolis','Florianópolis','SC'],['joinville','Joinville','SC'],
  ['blumenau','Blumenau','SC'],['sao jose','São José','SC'],
  ['chapeco','Chapecó','SC'],['criciuma','Criciúma','SC'],
  ['itajai','Itajaí','SC'],['lages','Lages','SC'],
  // BA
  ['salvador','Salvador','BA'],['feira de santana','Feira de Santana','BA'],
  ['vitoria da conquista','Vitória da Conquista','BA'],['camacari','Camaçari','BA'],
  ['itabuna','Itabuna','BA'],['ilheus','Ilhéus','BA'],['jequie','Jequié','BA'],
  // CE
  ['fortaleza','Fortaleza','CE'],['caucaia','Caucaia','CE'],
  ['juazeiro do norte','Juazeiro do Norte','CE'],['maracanau','Maracanaú','CE'],
  ['sobral','Sobral','CE'],['crato','Crato','CE'],
  // PE
  ['recife','Recife','PE'],['caruaru','Caruaru','PE'],
  ['olinda','Olinda','PE'],['petrolina','Petrolina','PE'],
  ['paulista','Paulista','PE'],['jaboatao dos guararapes','Jaboatão dos Guararapes','PE'],
  // Demais estados
  ['natal','Natal','RN'],['maceio','Maceió','AL'],
  ['joao pessoa','João Pessoa','PB'],['teresina','Teresina','PI'],
  ['aracaju','Aracaju','SE'],['sao luis','São Luís','MA'],
  ['imperatriz','Imperatriz','MA'],
  ['manaus','Manaus','AM'],['belem','Belém','PA'],
  ['santarem','Santarém','PA'],['ananindeua','Ananindeua','PA'],
  ['porto velho','Porto Velho','RO'],['macapa','Macapá','AP'],
  ['boa vista','Boa Vista','RR'],['palmas','Palmas','TO'],
  ['rio branco','Rio Branco','AC'],
  ['goiania','Goiânia','GO'],['aparecida de goiania','Aparecida de Goiânia','GO'],
  ['anapolis','Anápolis','GO'],['campo grande','Campo Grande','MS'],
  ['dourados','Dourados','MS'],['cuiaba','Cuiabá','MT'],
  ['varzea grande','Várzea Grande','MT'],['brasilia','Brasília','DF'],
  ['vitoria','Vitória','ES'],['vila velha','Vila Velha','ES'],
  ['serra','Serra','ES'],['cariacica','Cariacica','ES'],
]

function normC(s: string): string {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim()
}

// ── Extração de cidade — estratégia em 6 camadas ─────────────────
function extractCity(item: Record<string, unknown>, targetCities?: string[]): { city: string; state: string } {

  // Prepara lista de cidades-alvo (selecionadas pelo usuário) para priorizar
  const targetNorms = (targetCities || []).map(c => normC(c))

  // Função que busca cidade no texto
  function findCityInText(text: string): { city: string; state: string } | null {
    const n = normC(text)
    if (!n) return null

    // Primeiro tenta as cidades-alvo (maior chance de acerto)
    for (const target of targetNorms) {
      const match = CITIES_BR.find(([norm]) => norm === target)
      if (match && n.includes(target)) return { city: match[1], state: match[2] }
    }

    // Depois tenta todas as cidades conhecidas (match exato primeiro)
    for (const [norm, original, uf] of CITIES_BR) {
      if (n === norm) return { city: original, state: uf }
    }
    // Match parcial (cidade está contida no texto)
    for (const [norm, original, uf] of CITIES_BR) {
      const wordBoundary = new RegExp(`(^|[^a-z])${norm}($|[^a-z])`)
      if (wordBoundary.test(n)) return { city: original, state: uf }
    }

    return null
  }

  // ── Camada 1: Campos diretos do actor ────────────────────────
  const directFields = [
    item.ownerCity, item.locationName, item.city,
    item.location, item.ownerLocation, item.place,
  ]
  for (const f of directFields) {
    const v = clean(f)
    if (!v) continue
    const found = findCityInText(v)
    if (found) return found
    // UF explícita
    const uf = v.match(/\b(SP|RJ|MG|PR|RS|SC|BA|CE|PE|RN|AL|PB|PI|SE|MA|AM|PA|RO|GO|MS|MT|DF|ES|TO|RR|AC|AP)\b/)
    if (uf) return { city: '', state: uf[1] }
  }

  // ── Camada 2: Localização dos posts (locationName de cada post) ──
  const posts: Record<string, unknown>[] = (item.latestPosts as Record<string, unknown>[]) ||
    (item.posts as Record<string, unknown>[]) || []
  for (const post of posts.slice(0, 12)) {
    const postLocation = clean(post.locationName || post.location || post.city || '')
    if (postLocation) {
      const found = findCityInText(postLocation)
      if (found) return found
    }
  }

  // ── Camada 3: Bio com padrão de localização ──────────────────
  const bio = String(item.ownerBio || item.biography || item.description || '')

  // Emoji de localização 📍 → captura o que vem depois
  const emojiPatterns = [
    /📍\s*([^\n|•·,\n]{2,40})/,
    /🏙️?\s*([^\n|•·,\n]{2,40})/,
    /📌\s*([^\n|•·,\n]{2,40})/,
    /🌎\s*([^\n|•·,\n]{2,40})/,
    /🇧🇷\s*([^\n|•·,\n]{2,40})/,
  ]
  for (const pattern of emojiPatterns) {
    const m = bio.match(pattern)
    if (m) {
      const found = findCityInText(m[1])
      if (found) return found
    }
  }

  // Padrões textuais: "em São Paulo", "- SP", "| Campinas", "São Paulo - SP"
  const textPatterns = [
    /\bem\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/,
    /[-|•·]\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)\s*[-|•·\/,]/,
    /([A-ZÀ-Ú][a-zà-ú]+(?:\s[A-ZÀ-Ú][a-zà-ú]+)?)\s*[–-]\s*([A-Z]{2})\b/,
    /\bde\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/,
  ]
  for (const pattern of textPatterns) {
    const m = bio.match(pattern)
    if (m) {
      const found = findCityInText(m[1])
      if (found) return found
    }
  }

  // Busca direta na bio (todas as cidades conhecidas)
  const found = findCityInText(bio)
  if (found) return found

  // ── Camada 4: Captions dos posts ─────────────────────────────
  for (const post of posts.slice(0, 6)) {
    const caption = clean(post.caption || post.alt || post.description || '')
    if (!caption) continue
    // Emoji location no caption
    for (const pattern of emojiPatterns) {
      const m = caption.match(pattern)
      if (m) {
        const r = findCityInText(m[1])
        if (r) return r
      }
    }
    const r = findCityInText(caption)
    if (r) return r
  }

  // ── Camada 5: Apenas UF na bio ──────────────────────────────
  const ufM = bio.match(/\b(SP|RJ|MG|PR|RS|SC|BA|CE|PE|RN|AL|PB|PI|SE|MA|AM|PA|RO|GO|MS|MT|DF|ES|TO|RR|AC|AP)\b/)
  if (ufM) return { city: '', state: ufM[1] }

  return { city: '', state: '' }
}

// ── Validação de username ────────────────────────────────────────
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
  // Log diagnóstico — mostra TODOS os campos do primeiro item para ajustar o parser
  if (items.length > 0) {
    const sample = items[0]
    const allKeys = Object.keys(sample)
    console.log(`[instagram parser] Campos disponíveis: ${allKeys.join(', ')}`)
    // Campos candidatos a ter a bio/cidade
    const bioKeys = allKeys.filter(k => /bio|desc|about|caption|text|location|city|place|address|owner|profile/i.test(k))
    bioKeys.forEach(k => {
      const val = sample[k]
      if (val && typeof val !== 'object') {
        console.log(`[instagram parser] ${k} = "${String(val).slice(0, 120)}"`)
      } else if (val && typeof val === 'object') {
        console.log(`[instagram parser] ${k} (objeto) = ${JSON.stringify(val).slice(0, 200)}`)
      }
    })
  }

  return items.map(item => {

    // Username
    const rawUsername = clean(
      item.ownerUsername || item.username ||
      (item.inputUrl ? String(item.inputUrl).split('/').filter(Boolean).pop() : '') || ''
    )
    const username = isValidUsername(rawUsername) ? rawUsername : ''

    const fullName = clean(item.ownerFullName || item.fullName || item.name || '')

    const bio = clean(
      item.ownerBio || item.biography || item.description ||
      item.caption || item.alt || ''
    )
    const caption   = clean(item.caption || item.alt || '')
    const combined  = `${bio} ${caption}`

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

    // ── Cidade com estratégia em 6 camadas ─────────────────────
    const { city, state } = extractCity(item as Record<string, unknown>, targetCities)

    const followers = clean(
      item.ownerFollowersCount || item.followersCount || item.followingCount || ''
    )

    return {
      name:      username ? `@${username}` : fullName,
      niche,
      city,
      state,
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