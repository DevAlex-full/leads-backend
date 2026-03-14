import { supabase } from '../lib/supabase'
import { Lead } from '../lib/types'

// Gera um fingerprint único para cada lead
// Prioridade: phone > instagram > linkedin > facebook > name+city
function makeFingerprint(lead: Lead): string {
  const phone = lead.phone?.replace(/\D/g, '').trim()
  if (phone && phone.length >= 8) return `phone:${phone}`
  if (lead.instagram) return `ig:${lead.instagram.toLowerCase().replace(/\/$/, '')}`
  if (lead.linkedin) return `li:${lead.linkedin.toLowerCase().replace(/\/$/, '')}`
  if (lead.facebook) return `fb:${lead.facebook.toLowerCase().replace(/\/$/, '')}`
  // Fallback: nome + cidade normalizado
  const key = `${lead.name}:${lead.city}`.toLowerCase().replace(/\s+/g, '')
  return `name:${key}`
}

// Filtra leads que o usuário ainda não viu (deduplicação cross-sessão)
export async function filterNewLeads(
  userId: string,
  leads: Lead[]
): Promise<Lead[]> {
  if (!leads.length) return []

  const fingerprints = leads.map(makeFingerprint)

  // Busca quais fingerprints já existem para esse usuário
  const { data: existing } = await supabase
    .from('scraped_leads')
    .select('fingerprint')
    .eq('user_id', userId)
    .in('fingerprint', fingerprints)

  const existingSet = new Set((existing || []).map((r: { fingerprint: string }) => r.fingerprint))

  // Retorna apenas leads novos
  return leads.filter((lead) => !existingSet.has(makeFingerprint(lead)))
}

// Salva novos leads no Supabase para deduplicação futura
export async function saveLeadFingerprints(
  userId: string,
  leads: Lead[]
): Promise<void> {
  if (!leads.length) return

  const rows = leads.map((lead) => ({
    user_id: userId,
    fingerprint: makeFingerprint(lead),
    niche: lead.niche,
    name: lead.name,
    city: lead.city,
    source: lead.source,
  }))

  // upsert com onConflict ignora duplicatas silenciosamente
  await supabase
    .from('scraped_leads')
    .upsert(rows, { onConflict: 'user_id,fingerprint', ignoreDuplicates: true })
}

// Retorna o total acumulado de leads únicos do usuário
export async function getUserLeadStats(userId: string): Promise<{
  total: number
  byNiche: Record<string, number>
  bySource: Record<string, number>
  lastScrapedAt: string | null
}> {
  const { data, error } = await supabase
    .from('scraped_leads')
    .select('niche, source, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error || !data) {
    return { total: 0, byNiche: {}, bySource: {}, lastScrapedAt: null }
  }

  const byNiche: Record<string, number> = {}
  const bySource: Record<string, number> = {}

  for (const row of data as { niche: string; source: string; created_at: string }[]) {
    byNiche[row.niche] = (byNiche[row.niche] || 0) + 1
    bySource[row.source] = (bySource[row.source] || 0) + 1
  }

  return {
    total: data.length,
    byNiche,
    bySource,
    lastScrapedAt: data[0]?.created_at ?? null,
  }
}