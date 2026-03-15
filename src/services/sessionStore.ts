import { supabase } from '../lib/supabase'
import { Lead } from '../lib/types'

export interface ScrapingSession {
  id: string
  user_id: string
  niche: string
  cities: string[]
  sources: string[]
  site_filter: string
  total_leads: number
  leads: Lead[]
  created_at: string
}

export type SessionSummary = Omit<ScrapingSession, 'leads'>

// Salva uma sessão completa com todos os leads no Supabase
export async function saveSession(
  userId: string,
  niche: string,
  cities: string[],
  sources: string[],
  siteFilter: string,
  leads: Lead[]
): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_sessions')
    .insert({
      user_id: userId,
      niche,
      cities,
      sources,
      site_filter: siteFilter,
      total_leads: leads.length,
      leads: leads as unknown as object,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[sessionStore] Erro ao salvar sessao:', error.message)
    return null
  }

  return data?.id ?? null
}

// Lista sessões do usuário (sem os leads — só metadados)
export async function listUserSessions(
  userId: string,
  limit = 20
): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from('scrape_sessions')
    .select('id, user_id, niche, cities, sources, site_filter, total_leads, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as SessionSummary[]
}

// Busca uma sessão completa com os leads para download
export async function getSessionWithLeads(
  sessionId: string,
  userId: string
): Promise<ScrapingSession | null> {
  const { data, error } = await supabase
    .from('scrape_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  if (error || !data) return null
  return data as ScrapingSession
}

// Remove uma sessão
export async function deleteSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('scrape_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)

  return !error
}