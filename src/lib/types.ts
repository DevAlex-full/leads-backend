export type Source = 'google_maps' | 'instagram' | 'linkedin' | 'facebook'
export type SiteFilter = 'all' | 'without_site' | 'with_site'

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
  priority: 'high' | 'normal'
  scrapedAt: string
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
  niche: string
  customSearchTerm?: string
  cities: string[]
  perCity: number
  sources: Source[]
  siteFilter: SiteFilter
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