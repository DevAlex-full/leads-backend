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

export interface ScrapeJob {
  id: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  progress: number
  progressLabel: string
  logs: LogEntry[]
  leads: Lead[]
  error?: string
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