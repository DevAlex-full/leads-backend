import { ScrapeRequest, Lead, Source, SiteFilter } from '../lib/types'
import { startActor, waitForRun, getDatasetItems } from './apify'
import { parseGoogleMapsItems } from './parsers/googleMaps'
import { parseInstagramItems } from './parsers/instagram'
import { parseLinkedInItems } from './parsers/linkedin'
import { parseFacebookItems } from './parsers/facebook'
import { updateJob, addLog, getJob } from './jobStore'
import { filterNewLeads, saveLeadFingerprints } from './leadStore'
import { saveSession } from './sessionStore'
import { startEnrichJob } from './enricherService'
import { runPythonScripts, isPythonConfigured } from './pythonRunner'

interface ActorConfig {
  actorId: string
  buildInput: (niches: string[], cities: string[], perCity: number) => object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse: (items: any[], niche: string, cities?: string[]) => Lead[]
  label: string
}

// Coordenadas das principais cidades BR para o actor Google Maps
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'são paulo': { lat: -23.5505, lng: -46.6333 },
  'campinas': { lat: -22.9056, lng: -47.0608 },
  'ribeirão preto': { lat: -21.1775, lng: -47.8103 },
  'santo andré': { lat: -23.6618, lng: -46.5322 },
  'sorocaba': { lat: -23.5015, lng: -47.4526 },
  'rio de janeiro': { lat: -22.9068, lng: -43.1729 },
  'niterói': { lat: -22.8833, lng: -43.1036 },
  'nova iguaçu': { lat: -22.7593, lng: -43.4510 },
  'belo horizonte': { lat: -19.9191, lng: -43.9386 },
  'contagem': { lat: -19.9317, lng: -44.0536 },
  'curitiba': { lat: -25.4284, lng: -49.2733 },
  'porto alegre': { lat: -30.0346, lng: -51.2177 },
  'florianópolis': { lat: -27.5954, lng: -48.5480 },
  'joinville': { lat: -26.3045, lng: -48.8487 },
  'salvador': { lat: -12.9714, lng: -38.5014 },
  'fortaleza': { lat: -3.7172, lng: -38.5433 },
  'recife': { lat: -8.0476, lng: -34.8770 },
  'natal': { lat: -5.7945, lng: -35.2110 },
  'maceió': { lat: -9.6658, lng: -35.7350 },
  'joão pessoa': { lat: -7.1195, lng: -34.8450 },
  'teresina': { lat: -5.0920, lng: -42.8038 },
  'aracaju': { lat: -10.9472, lng: -37.0731 },
  'são luís': { lat: -2.5297, lng: -44.3028 },
  'manaus': { lat: -3.1190, lng: -60.0217 },
  'belém': { lat: -1.4558, lng: -48.5044 },
  'porto velho': { lat: -8.7619, lng: -63.9039 },
  'goiânia': { lat: -16.6869, lng: -49.2648 },
  'campo grande': { lat: -20.4697, lng: -54.6201 },
  'cuiabá': { lat: -15.5989, lng: -56.0949 },
  'brasília': { lat: -15.7801, lng: -47.9292 },
}

function getCityCoords(city: string): { lat: number; lng: number } | null {
  const key = city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  return CITY_COORDS[city.toLowerCase()] ||
    Object.entries(CITY_COORDS).find(([k]) =>
      k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(key) ||
      key.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    )?.[1] || null
}

const ACTOR_CONFIGS: Record<Source, ActorConfig> = {
  google_maps: {
    actorId: 'compass/crawler-google-places',
    buildInput: (niches, cities, perCity) => {
      // Gera uma busca por cidade — se tiver coordenadas, usa location bias para precisão máxima
      const searches = cities.flatMap(c => {
        const coords = getCityCoords(c)
        return niches.map(n => ({
          searchString: `${n} em ${c}`,
          ...(coords ? { lat: coords.lat, lng: coords.lng, zoom: 12 } : {}),
        }))
      })
      // Actor aceita dois formatos: searchStringsArray (simples) ou startUrls com geo
      const hasCoords = cities.some(c => getCityCoords(c))
      if (hasCoords) {
        return {
          searchStringsArray: cities.flatMap(c => niches.map(n => `${n} em ${c}`)),
          maxCrawledPlacesPerSearch: perCity,
          language: 'pt-BR',
          countryCode: 'br',
          // Raio restrito à cidade — evita resultados de cidades vizinhas
          maxAutomaticZoomOut: 1,
          includeHistogram: false,
          includeOpeningHours: false,
          includePeopleAlsoSearch: false,
          // Campos adicionais para capturar Instagram
          additionalInfo: true,
          scrapeContacts: true,
        }
      }
      return {
        searchStringsArray: cities.flatMap(c => niches.map(n => `${n} em ${c}`)),
        maxCrawledPlacesPerSearch: perCity,
        language: 'pt-BR',
        countryCode: 'br',
        includeHistogram: false,
        includeOpeningHours: false,
        includePeopleAlsoSearch: false,
        additionalInfo: true,
        scrapeContacts: true,
      }
    },
    parse: parseGoogleMapsItems,
    label: 'Google Maps',
  },
  instagram: {
    actorId: 'apify/instagram-hashtag-scraper',
    buildInput: (niches) => ({
      hashtags: buildInstagramHashtags(niches),
      resultsLimit: 200,
      proxy: { useApifyProxy: true },
      expandOwnerDetails: true,
    }),
    parse: parseInstagramItems,
    label: 'Instagram',
  },
  linkedin: {
    actorId: 'scrap3r/linkedin-companies-search',
    buildInput: (niches, cities) => ({
      searchQueries: cities.slice(0, 6).flatMap(c =>
        niches.map(n => `${n} ${c} Brasil`)
      ),
      maxResults: 50,
      proxy: { useApifyProxy: true },
    }),
    parse: parseLinkedInItems,
    label: 'LinkedIn',
  },
  facebook: {
    actorId: 'apify/facebook-pages-scraper',
    buildInput: (niches, cities) => ({
      startUrls: cities.slice(0, 4).flatMap(c =>
        niches.slice(0, 2).map(n => ({
          url: `https://www.facebook.com/search/pages/?q=${encodeURIComponent(`${n} ${c}`)}`,
        }))
      ),
      maxPosts: 0,
      maxPostComments: 0,
      maxReviews: 0,
      maxImages: 0,
      proxy: { useApifyProxy: true },
    }),
    parse: parseFacebookItems,
    label: 'Facebook Pages',
  },
}

function buildInstagramHashtags(niches: string[]): string[] {
  const tags: string[] = []
  for (const niche of niches) {
    const base = niche.toLowerCase().replace(/\s+/g, '')
    tags.push(base, `${base}brasil`, `${base}br`, `${base}sp`, `${base}oficial`)
  }
  return [...new Set(tags)].slice(0, 15)
}

// Normaliza string removendo acentos e caracteres especiais
function norm(s: string): string {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim()
}

// Extrai sigla UF de 2 letras de qualquer formato de estado
function toUF(s: string): string {
  const n = norm(s).trim()
  // Já é UF de 2 letras
  if (/^[a-z]{2}$/.test(n)) return n
  // Mapa de estados BR por extenso → UF
  const stateMap: Record<string, string> = {
    'sao paulo':'sp','rio de janeiro':'rj','minas gerais':'mg','bahia':'ba',
    'parana':'pr','rio grande do sul':'rs','pernambuco':'pe','ceara':'ce',
    'para':'pa','santa catarina':'sc','goias':'go','maranhao':'ma',
    'amazonas':'am','espirito santo':'es','mato grosso':'mt','mato grosso do sul':'ms',
    'rio grande do norte':'rn','alagoas':'al','piaui':'pi','paraiba':'pb',
    'sergipe':'se','rondonia':'ro','tocantins':'to','acre':'ac','amapa':'ap',
    'roraima':'rr','distrito federal':'df',
  }
  return stateMap[n] || n.slice(0, 2)
}

// Mapa cidade → UF (30 principais cidades do app)
const CITY_TO_UF: Record<string, string> = {
  'sao paulo':'sp','campinas':'sp','ribeirao preto':'sp','santo andre':'sp',
  'sorocaba':'sp','guarulhos':'sp','osasco':'sp','sao bernardo do campo':'sp',
  'rio de janeiro':'rj','niteroi':'rj','nova iguacu':'rj',
  'belo horizonte':'mg','contagem':'mg','uberlandia':'mg',
  'curitiba':'pr','porto alegre':'rs','florianopolis':'sc','joinville':'sc',
  'salvador':'ba','fortaleza':'ce','recife':'pe','natal':'rn',
  'maceio':'al','joao pessoa':'pb','teresina':'pi','aracaju':'se',
  'sao luis':'ma','manaus':'am','belem':'pa','porto velho':'ro',
  'goiania':'go','campo grande':'ms','cuiaba':'mt','brasilia':'df',
}

function filterByCities(leads: Lead[], cities: string[]): Lead[] {
  if (!cities.length) return leads

  // Prepara estrutura de busca: { cityNorm, uf }
  const allowed = cities.map(c => ({
    city: norm(c),
    uf: CITY_TO_UF[norm(c)] || '',
  }))

  // Conjunto de UFs permitidos
  const allowedUFs = new Set(allowed.map(a => a.uf).filter(Boolean))

  return leads.filter(l => {
    const lCity  = norm(l.city  || '')
    const lState = toUF(l.state || '')
    const lAddr  = norm(l.address || '')

    for (const { city, uf } of allowed) {
      // 1. Cidade e estado batem — caso ideal
      if (lCity === city && (!uf || !lState || lState === uf)) return true

      // 2. Cidade bate (sem estado disponível no lead)
      if (lCity === city) return true

      // 3. Cidade está no endereço junto com estado correto
      if (lAddr.includes(city) && (!uf || lAddr.includes(uf) || lState === uf)) return true
    }

    // 4. Rejeição por estado — se temos UFs permitidos e o lead tem estado,
    //    e o estado do lead NÃO está nos UFs permitidos → rejeita
    if (allowedUFs.size > 0 && lState && !allowedUFs.has(lState)) {
      return false
    }

    // 5. Sem estado no lead e nenhuma cidade bateu — rejeita
    return false
  })
}

function applySiteFilter(leads: Lead[], siteFilter: SiteFilter): Lead[] {
  if (siteFilter === 'without_site') return leads.filter(l => !l.website)
  if (siteFilter === 'with_site') return leads.filter(l => Boolean(l.website))
  return leads
}

function deduplicateLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>()
  return leads.filter(l => {
    const phone = l.phone?.replace(/\D/g, '').trim()
    const key = (phone && phone.length >= 8)
      ? `phone:${phone}`
      : (l.instagram || l.linkedin || l.facebook || `${l.name}:${l.city}`).toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function runScrapeJob(
  jobId: string,
  request: ScrapeRequest & { userId: string }
): Promise<void> {
  const { apiKey, niches, cities, perCity, sources, siteFilter, userId, requiredFields } = request
  const cancelSignal = { cancelled: false }
  const allLeads: Lead[] = []
  const totalSources = sources.length
  let completedSources = 0

  updateJob(jobId, { status: 'running', progress: 2, progressLabel: 'Iniciando...' })

  const nicheLabel = niches.join(', ')
  addLog(jobId, `Nichos: ${nicheLabel}`, 'info')


  try {
    for (const source of sources) {
      const current = getJob(jobId)
      if (!current || current.status === 'cancelled') { cancelSignal.cancelled = true; break }

      const config = ACTOR_CONFIGS[source]
      const baseProgress = (completedSources / totalSources) * 82

      addLog(jobId, `Iniciando ${config.label}...`, 'info')
      updateJob(jobId, { progress: baseProgress + 2, progressLabel: `Iniciando ${config.label}...` })

      let runId: string
      try {
        const result = await startActor(
          apiKey,
          config.actorId,
          config.buildInput(niches, cities, perCity)
        )
        runId = result.runId
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido'
        addLog(jobId, `ERRO ao iniciar ${config.label}: ${msg}`, 'error')
        addLog(jobId, `Pulando ${config.label} e continuando...`, 'info')
        completedSources++
        continue
      }

      addLog(jobId, `Run ${config.label} iniciado: ${runId}`, 'info')

      let pollCount = 0
      let datasetId: string
      try {
        datasetId = await waitForRun(
          apiKey, runId,
          (status, requestsFinished) => {
            pollCount++
            const pct = Math.min(baseProgress + 5 + pollCount * 2, baseProgress + 75)
            updateJob(jobId, { progress: pct, progressLabel: `${config.label}: ${status} (${requestsFinished} itens)...` })
            addLog(jobId, `${config.label} status: ${status} — ${requestsFinished} processados`, 'info')
          },
          cancelSignal
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido'
        addLog(jobId, `ERRO no run ${config.label}: ${msg}`, 'error')
        completedSources++
        continue
      }

      addLog(jobId, `Baixando resultados ${config.label}...`, 'info')
      const items = await getDatasetItems(apiKey, datasetId)

      // Parseia para cada nicho e combina — garante que cada lead tem seu nicho correto
      let parsed: Lead[] = []
      if (niches.length === 1) {
        parsed = config.parse(items, niches[0], cities)
      } else {
        // Para múltiplos nichos, associa cada lead ao nicho mais provável pelo nome
        parsed = items.map(item => {
          const name = String(item.title || item.name || item.username || '').toLowerCase()
          const matchedNiche = niches.find(n =>
            name.includes(n.toLowerCase().split(' ')[0])
          ) || niches[0]
          return config.parse([item], matchedNiche, cities)[0]
        }).filter(Boolean) as Lead[]
      }

      // Filtra por cidade para todas as fontes
      let filteredByCities: Lead[]
      if (source === 'instagram') {
        // Instagram: MANTER todos os leads — cidade é extraída da bio/posts e pode ser enriquecida depois
        // Separar leads COM cidade compatível dos SEM cidade para priorização
        const withCity = filterByCities(parsed, cities)
        const withoutCity = parsed.filter(l => !l.city && !l.state)
        const wrongCity = parsed.filter(l => (l.city || l.state) && !withCity.includes(l))

        // Inclui: cidade certa + sem cidade (não sabemos ainda) — exclui: cidade errada confirmada
        filteredByCities = [...withCity, ...withoutCity]
        addLog(jobId, `Instagram: ${parsed.length} perfis → ${withCity.length} cidade certa + ${withoutCity.length} sem cidade (${wrongCity.length} descartados por cidade errada)`, 'info')
      } else {
        filteredByCities = filterByCities(parsed, cities)
        const removed = parsed.length - filteredByCities.length
        addLog(jobId, `Filtro de cidade: ${parsed.length} leads brutos → ${filteredByCities.length} nas cidades selecionadas (${removed} removidos)`, 'info')
        if (removed > 0) {
          const examples = parsed
            .filter(l => !filteredByCities.includes(l))
            .slice(0, 3)
            .map(l => `${l.name}(${l.city}/${l.state})`)
            .join(', ')
          if (examples) addLog(jobId, `Removidos ex: ${examples}`, 'info')
        }
      }

      allLeads.push(...filteredByCities)
      completedSources++
      addLog(jobId, `${config.label}: ${filteredByCities.length} leads encontrados`, 'success')
      updateJob(jobId, {
        progress: (completedSources / totalSources) * 82,
        progressLabel: `${config.label} concluido (${filteredByCities.length} leads)`,
      })
    }

    // Python scripts em paralelo (se configurado)
    if (isPythonConfigured()) {
      addLog(jobId, 'Iniciando busca Python (Google Places + CNPJ + DuckDuckGo)...', 'info')
      updateJob(jobId, { progress: 83, progressLabel: 'Scripts Python rodando...' })

      // Mapeia cidades para formato do Python
      const citiesForPython = cities.map(c => {
        const parts = c.split(/[\s,]+/)
        const state = parts.length > 1 ? parts[parts.length - 1] : ''
        const name  = parts.slice(0, -1).join(' ') || c
        return { name, state }
      })

      try {
        const pythonLeads = await runPythonScripts({
          niches,
          cities: citiesForPython,
          sources: ['maps', 'cnpj', 'google'],
          maxPerCity: Math.min(perCity, 30),
          googlePlacesKey: process.env.GOOGLE_PLACES_KEY,
        })
        if (pythonLeads.length > 0) {
          allLeads.push(...pythonLeads)
          addLog(jobId, `Python: +${pythonLeads.length} leads adicionais encontrados`, 'success')
        }
      } catch (err) {
        addLog(jobId, `Python: falhou silenciosamente — ${err instanceof Error ? err.message : 'erro'}`, 'error')
      }
    }

    // 1. Deduplicação interna
    const dedupedInJob = deduplicateLeads(allLeads)

    // 2. Filtro de site
    const filteredBySite = applySiteFilter(dedupedInJob, siteFilter)
    if (siteFilter !== 'all') {
      const label = siteFilter === 'without_site' ? 'sem site' : 'com site'
      addLog(jobId, `Filtro: apenas leads ${label} (${filteredBySite.length} de ${dedupedInJob.length})`, 'info')
    }

    // 3. Deduplicação cross-sessão
    updateJob(jobId, { progress: 86, progressLabel: 'Verificando leads novos...' })
    const newLeads = await filterNewLeads(userId, filteredBySite)
    const removedCount = filteredBySite.length - newLeads.length
    if (removedCount > 0) addLog(jobId, `${removedCount} leads ja vistos — removidos`, 'info')

    // 4. Ordenação
    const sorted = newLeads.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1
      if (a.priority !== 'high' && b.priority === 'high') return 1
      return parseFloat(b.rating || '0') - parseFloat(a.rating || '0')
    })

    // 5. Salva fingerprints
    if (sorted.length > 0) await saveLeadFingerprints(userId, sorted)

    // 6. Salva sessão completa
    updateJob(jobId, { progress: 94, progressLabel: 'Salvando sessao no historico...' })
    const sessionId = await saveSession(userId, nicheLabel, cities, sources, siteFilter, sorted)

    if (sessionId) {
      addLog(jobId, `Sessao salva no historico (id: ${sessionId.slice(0, 8)}...)`, 'success')
      addLog(jobId, 'Iniciando enriquecimento automatico dos leads...', 'info')
      startEnrichJob(sessionId, userId)
    }

    addLog(jobId, `Total: ${sorted.length} leads novos encontrados`, 'success')

    const wasCancelled = getJob(jobId)?.status === 'cancelled'
    updateJob(jobId, {
      status: wasCancelled ? 'cancelled' : 'done',
      progress: 100,
      progressLabel: wasCancelled ? 'Cancelado.' : `Concluido! ${sorted.length} leads novos encontrados.`,
      leads: sorted,
      finishedAt: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    addLog(jobId, `ERRO: ${message}`, 'error')
    updateJob(jobId, { status: 'failed', error: message, finishedAt: new Date().toISOString() })
  }
}