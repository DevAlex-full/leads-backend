export type Source = 'google_maps' | 'instagram' | 'linkedin' | 'facebook'
export type SiteFilter = 'all' | 'without_site' | 'with_site'
export type Priority = 'high' | 'normal'

export interface Lead {
  name: string
  niche: string
  city: string
  state: string
  phone: string
  email: string
  address: string
  website: string
  instagram: string
  linkedin: string
  facebook: string
  whatsapp: string
  rating: string
  reviews: string
  category: string
  source: Source
  priority: Priority
  scrapedAt: string
  // Campos extras do enriquecimento
  cnpj?: string
  razaoSocial?: string
  bairro?: string
  cep?: string
  enriched?: boolean
}

export type SourceExecutionStatus =
  | 'pending'
  | 'starting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type ScrapeErrorCode =
  | 'APIFY_TOKEN_MISSING'
  | 'APIFY_TOKEN_INVALID_FORMAT'
  | 'APIFY_UNAUTHORIZED'
  | 'APIFY_USAGE_LIMIT_REACHED'
  | 'APIFY_ACTOR_INPUT_INVALID'
  | 'APIFY_RUN_FAILED'
  | 'APIFY_RUN_ABORTED'
  | 'APIFY_RUN_TIMEOUT'
  | 'APIFY_DATASET_NOT_FOUND'
  | 'APIFY_DATASET_EMPTY'
  | 'APIFY_HTTP_ERROR'
  | 'SCRAPE_ALL_SOURCES_FAILED'
  | 'SCRAPE_PARTIAL_SUCCESS'
  | 'PARSER_RETURNED_ZERO'
  | 'LOCATION_FILTER_REMOVED_ALL'
  | 'SITE_FILTER_REMOVED_ALL'
  | 'REQUIRED_FIELDS_REMOVED_ALL'

// Observabilidade por fonte/execução do Actor — NUNCA deve conter o token da Apify.
export interface SourceExecution {
  source: Source
  actorId: string
  status: SourceExecutionStatus
  runId?: string
  datasetId?: string
  rawItems: number
  parsedItems: number
  afterLocationFilter: number
  duplicatesInRun: number
  previouslySeen: number
  finalItems: number
  startedAt?: string
  finishedAt?: string
  warning?: string
  errorCode?: ScrapeErrorCode
  error?: string
}

export interface ScrapeJob {
  id: string
  userId?: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  progress: number
  progressLabel: string
  logs: LogEntry[]
  leads: Lead[]
  error?: string
  errorCode?: ScrapeErrorCode
  warning?: string
  sourceExecutions: SourceExecution[]
  createdAt: string
  finishedAt?: string
}

export interface LogEntry {
  time: string
  message: string
  type: 'info' | 'success' | 'error'
}

export interface ScrapeRequest {
  apiKey: string
  niches: string[]
  cities: string[]
  perCity: number
  sources: Source[]
  siteFilter: SiteFilter
  requiredFields?: string[]   // campos obrigatórios: email, instagram, whatsapp, phone, etc.
  // Quando true (padrão), leads já vistos em buscas anteriores são mantidos no resultado.
  // Quando false, são removidos (deduplicação cross-sessão) e contados em previouslySeen.
  includePreviouslySeen?: boolean
}

export interface ApifyRunResponse {
  data: {
    id: string
    status: string
    defaultDatasetId: string
    stats?: { requestsFinished: number; requestsFailed: number }
  }
}

export interface ApifyRunStatus {
  data: {
    id: string
    status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT'
    defaultDatasetId: string
    stats?: { requestsFinished: number }
  }
}