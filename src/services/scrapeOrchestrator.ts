import { ScrapeRequest, Lead, Source, SiteFilter } from '../lib/types'
import { startActor, waitForRun, getDatasetItems } from './apify'
import { parseGoogleMapsItems } from './parsers/googleMaps'
import { parseInstagramItems } from './parsers/instagram'
import { parseLinkedInItems } from './parsers/linkedin'
import { parseFacebookItems } from './parsers/facebook'
import { updateJob, addLog, getJob } from './jobStore'
import { filterNewLeads, saveLeadFingerprints } from './leadStore'

interface ActorConfig {
  actorId: string
  buildInput: (niche: string, cities: string[], perCity: number) => object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse: (items: any[], niche: string) => Lead[]
  label: string
}

const ACTOR_CONFIGS: Record<Source, ActorConfig> = {
  google_maps: {
    actorId: 'compass/crawler-google-places',
    buildInput: (niche, cities, perCity) => ({
      searchStringsArray: cities.map((c) => `${niche} ${c} Brasil`),
      maxCrawledPlacesPerSearch: perCity,
      language: 'pt-BR',
      countryCode: 'br',
      includeHistogram: false,
      includeOpeningHours: false,
      includePeopleAlsoSearch: false,
    }),
    parse: parseGoogleMapsItems,
    label: 'Google Maps',
  },

  instagram: {
    actorId: 'apify/instagram-hashtag-scraper',
    buildInput: (niche) => ({
      hashtags: buildInstagramHashtags(niche),
      resultsLimit: 200,
      proxy: { useApifyProxy: true },
      expandOwnerDetails: true,
    }),
    parse: parseInstagramItems,
    label: 'Instagram',
  },

  // LinkedIn — usando actor público mais estável
  linkedin: {
    actorId: 'scrap3r/linkedin-companies-search',
    buildInput: (niche, cities) => ({
      searchQueries: cities.slice(0, 6).map((c) => `${niche} ${c} Brasil`),
      maxResults: 50,
      proxy: { useApifyProxy: true },
    }),
    parse: parseLinkedInItems,
    label: 'LinkedIn',
  },

  // Facebook — sem proxy residencial (não disponível no plano free)
  facebook: {
    actorId: 'apify/facebook-pages-scraper',
    buildInput: (niche, cities) => ({
      startUrls: cities.slice(0, 4).map((c) => ({
        url: `https://www.facebook.com/search/pages/?q=${encodeURIComponent(`${niche} ${c}`)}`,
      })),
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

function buildInstagramHashtags(niche: string): string[] {
  const base = niche.toLowerCase().replace(/\s+/g, '')
  return [base, `${base}brasil`, `${base}br`, `${base}sp`, `${base}rj`, `${base}bh`, `${base}oficial`, `${base}profissional`]
    .filter((v, i, a) => a.indexOf(v) === i).slice(0, 8)
}

// Filtra leads pelas cidades selecionadas
function filterByCities(leads: Lead[], cities: string[]): Lead[] {
  if (!cities.length) return leads
  const citySet = new Set(cities.map((c) => c.toLowerCase()))
  return leads.filter((l) => {
    const cityLower = (l.city || '').toLowerCase()
    const addrLower = (l.address || '').toLowerCase()
    return Array.from(citySet).some((c) => cityLower.includes(c) || addrLower.includes(c))
  })
}

// Aplica filtro de site (com/sem/todos)
function applySiteFilter(leads: Lead[], siteFilter: SiteFilter): Lead[] {
  if (siteFilter === 'without_site') return leads.filter((l) => !l.website)
  if (siteFilter === 'with_site') return leads.filter((l) => Boolean(l.website))
  return leads
}

// Deduplicação interna do job
function deduplicateLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>()
  return leads.filter((l) => {
    const phone = l.phone?.replace(/\D/g, '').trim()
    const key = (phone && phone.length >= 8)
      ? `phone:${phone}`
      : (l.instagram || l.linkedin || l.facebook || `${l.name}:${l.city}`).toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function runScrapeJob(jobId: string, request: ScrapeRequest & { userId: string }): Promise<void> {
  const { apiKey, niche, cities, perCity, sources, siteFilter, userId } = request
  const cancelSignal = { cancelled: false }
  const allLeads: Lead[] = []
  const totalSources = sources.length
  let completedSources = 0

  updateJob(jobId, { status: 'running', progress: 2, progressLabel: 'Iniciando...' })

  try {
    for (const source of sources) {
      const current = getJob(jobId)
      if (!current || current.status === 'cancelled') { cancelSignal.cancelled = true; break }

      const config = ACTOR_CONFIGS[source]
      const baseProgress = (completedSources / totalSources) * 85

      addLog(jobId, `Iniciando ${config.label}...`, 'info')
      updateJob(jobId, { progress: baseProgress + 2, progressLabel: `Iniciando ${config.label}...` })

      let runId: string
      try {
        const result = await startActor(apiKey, config.actorId, config.buildInput(niche, cities, perCity))
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
        datasetId = await waitForRun(apiKey, runId, (status, requestsFinished) => {
          pollCount++
          const pct = Math.min(baseProgress + 5 + pollCount * 2, baseProgress + 78)
          updateJob(jobId, { progress: pct, progressLabel: `${config.label}: ${status} (${requestsFinished} itens)...` })
          addLog(jobId, `${config.label} status: ${status} — ${requestsFinished} processados`, 'info')
        }, cancelSignal)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido'
        addLog(jobId, `ERRO no run ${config.label}: ${msg}`, 'error')
        completedSources++
        continue
      }

      addLog(jobId, `Baixando resultados ${config.label}...`, 'info')
      const items = await getDatasetItems(apiKey, datasetId)
      const parsed = config.parse(items, niche)

      // Filtra por cidade (Google Maps e Facebook têm dados de localização)
      const filteredByCities = (source === 'instagram' || source === 'linkedin')
        ? parsed
        : filterByCities(parsed, cities)

      allLeads.push(...filteredByCities)
      completedSources++
      addLog(jobId, `${config.label}: ${filteredByCities.length} leads encontrados`, 'success')
      updateJob(jobId, {
        progress: (completedSources / totalSources) * 85,
        progressLabel: `${config.label} concluido (${filteredByCities.length} leads)`,
      })
    }

    // 1. Deduplicação interna
    const dedupedInJob = deduplicateLeads(allLeads)

    // 2. Aplica filtro de site (com/sem/todos)
    const filteredBySite = applySiteFilter(dedupedInJob, siteFilter)
    if (siteFilter !== 'all') {
      const label = siteFilter === 'without_site' ? 'sem site' : 'com site'
      addLog(jobId, `Filtro aplicado: apenas leads ${label} (${filteredBySite.length} de ${dedupedInJob.length})`, 'info')
    }

    // 3. Deduplicação cross-sessão
    updateJob(jobId, { progress: 90, progressLabel: 'Verificando leads novos...' })
    const newLeads = await filterNewLeads(userId, filteredBySite)
    const removedCount = filteredBySite.length - newLeads.length
    if (removedCount > 0) {
      addLog(jobId, `${removedCount} leads ja vistos em sessoes anteriores — removidos`, 'info')
    }

    // 4. Ordena: sem site primeiro, depois por avaliação
    const sorted = newLeads.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1
      if (a.priority !== 'high' && b.priority === 'high') return 1
      return parseFloat(b.rating || '0') - parseFloat(a.rating || '0')
    })

    // 5. Salva fingerprints
    if (sorted.length > 0) {
      await saveLeadFingerprints(userId, sorted)
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