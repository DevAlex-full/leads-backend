import { ScrapeRequest, Lead, Source } from '../lib/types'
import { startActor, waitForRun, getDatasetItems } from './apify'
import { parseGoogleMapsItems } from './parsers/googleMaps'
import { parseInstagramItems } from './parsers/instagram'
import { parseLinkedInItems } from './parsers/linkedin'
import { parseFacebookItems } from './parsers/facebook'
import { updateJob, addLog, getJob } from './jobStore'

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
      language: 'pt',
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
    }),
    parse: parseInstagramItems,
    label: 'Instagram',
  },
  linkedin: {
    actorId: 'curious_coder/linkedin-search-scraper',
    buildInput: (niche, cities) => ({
      searchQueries: cities.slice(0, 5).map((c) => `${niche} ${c}`),
      maxResults: 100,
      searchType: 'companies',
    }),
    parse: parseLinkedInItems,
    label: 'LinkedIn',
  },
  facebook: {
    actorId: 'apify/facebook-pages-scraper',
    buildInput: (niche, cities) => ({
      startUrls: [],
      searchTerms: cities.slice(0, 5).map((c) => `${niche} ${c}`),
      maxPagesPerSearchTerm: 20,
    }),
    parse: parseFacebookItems,
    label: 'Facebook Pages',
  },
}

function buildInstagramHashtags(niche: string): string[] {
  const base = niche.toLowerCase().replace(/\s+/g, '')
  return [
    base,
    `${base}brasil`,
    `${base}br`,
    `${base}sp`,
    `${base}rj`,
    `${base}bh`,
    niche.replace(/\s+/g, ''),
  ].slice(0, 8)
}

function deduplicateLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>()
  return leads.filter((l) => {
    const key = (l.phone || l.instagram || l.linkedin || l.name)
      .toLowerCase()
      .trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function runScrapeJob(
  jobId: string,
  request: ScrapeRequest
): Promise<void> {
  const { apiKey, niche, cities, perCity, sources } = request
  const cancelSignal = { cancelled: false }
  const allLeads: Lead[] = []

  const totalSources = sources.length
  let completedSources = 0

  updateJob(jobId, { status: 'running', progress: 2, progressLabel: 'Iniciando...' })

  try {
    for (const source of sources) {
      // Verifica se o job foi cancelado
      const current = getJob(jobId)
      if (!current || current.status === 'cancelled') {
        cancelSignal.cancelled = true
        break
      }

      const config = ACTOR_CONFIGS[source]
      const baseProgress = (completedSources / totalSources) * 90

      addLog(jobId, `Iniciando ${config.label}...`, 'info')
      updateJob(jobId, {
        progress: baseProgress + 2,
        progressLabel: `Iniciando ${config.label}...`,
      })

      const input = config.buildInput(niche, cities, perCity)
      const { runId } = await startActor(apiKey, config.actorId, input)
      addLog(jobId, `Run ${config.label} iniciado: ${runId}`, 'info')

      let pollCount = 0
      const datasetId = await waitForRun(
        apiKey,
        runId,
        (status, requestsFinished) => {
          pollCount++
          const pct = Math.min(baseProgress + 5 + pollCount * 2, baseProgress + 80)
          updateJob(jobId, {
            progress: pct,
            progressLabel: `${config.label}: ${status} (${requestsFinished} itens)...`,
          })
          addLog(jobId, `${config.label} status: ${status} — ${requestsFinished} processados`, 'info')
        },
        cancelSignal
      )

      addLog(jobId, `Baixando resultados ${config.label}...`, 'info')
      const items = await getDatasetItems(apiKey, datasetId)
      const parsed = config.parse(items, niche)
      allLeads.push(...parsed)

      completedSources++
      addLog(jobId, `${config.label}: ${parsed.length} leads encontrados`, 'success')
      updateJob(jobId, {
        progress: (completedSources / totalSources) * 90,
        progressLabel: `${config.label} concluído (${parsed.length} leads)`,
      })
    }

    // Deduplicação e ordenação
    const deduped = deduplicateLeads(allLeads)
    const sorted = deduped.sort((a, b) =>
      a.priority === 'high' && b.priority !== 'high' ? -1 : 1
    )

    addLog(jobId, `Total deduplicado: ${sorted.length} leads`, 'success')

    const wasCancelled = getJob(jobId)?.status === 'cancelled'
    updateJob(jobId, {
      status: wasCancelled ? 'cancelled' : 'done',
      progress: 100,
      progressLabel: wasCancelled
        ? 'Cancelado pelo usuário.'
        : `Concluído! ${sorted.length} leads encontrados.`,
      leads: sorted,
      finishedAt: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    addLog(jobId, `ERRO: ${message}`, 'error')
    updateJob(jobId, {
      status: 'failed',
      error: message,
      finishedAt: new Date().toISOString(),
    })
  }
}
