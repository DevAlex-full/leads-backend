/**
 * enricherService.ts
 * Jobs persistidos no Supabase — sobrevivem a reinicializações do servidor.
 * Cascata completa: Site → CNPJ → DuckDuckGo → Instagram
 */

import { supabase } from '../lib/supabase'
import { enrichLeadData } from './extractorService'
import { Lead } from '../lib/types'

const MAX_CONCURRENT = parseInt(process.env.ENRICHER_CONCURRENT || '5')
const MAX_LEADS      = parseInt(process.env.ENRICHER_MAX_LEADS || '500')

// ── Tipos ────────────────────────────────────────────────────────

export interface EnrichJob {
  id: string
  status: 'running' | 'done' | 'failed'
  total: number
  enriched: number
  progress: number
  error?: string
  startedAt: string
  finishedAt?: string
}

// ── Supabase helpers ─────────────────────────────────────────────

async function createJob(jobId: string, sessionId: string, userId: string, total: number): Promise<void> {
  await supabase.from('enrich_jobs').upsert({
    id: jobId,
    user_id: userId,
    session_id: sessionId,
    status: 'running',
    total,
    enriched: 0,
    progress: 0,
    started_at: new Date().toISOString(),
  })
}

async function updateJob(jobId: string, updates: Partial<{
  status: string; enriched: number; progress: number; total: number; error: string; finished_at: string; session_id: string
}>): Promise<void> {
  await supabase.from('enrich_jobs').update(updates).eq('id', jobId)
}

export async function getEnrichJob(jobId: string): Promise<EnrichJob | null> {
  const { data } = await supabase
    .from('enrich_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (!data) return null
  return {
    id: data.id,
    status: data.status,
    total: data.total,
    enriched: data.enriched,
    progress: data.progress,
    error: data.error,
    startedAt: data.started_at,
    finishedAt: data.finished_at,
  }
}

// ── Aplica dados enriquecidos ao lead ─────────────────────────────

function applyEnrichment(lead: Lead, data: Awaited<ReturnType<typeof enrichLeadData>>): Lead {
  const updated = { ...lead, enriched: true } as Lead & { enriched: boolean }

  if (!lead.email && data.emails[0]) updated.email = data.emails[0]

  if (!lead.phone && data.phones[0]) {
    const d = data.phones[0]
    updated.phone = d.length === 11
      ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
      : `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  }

  if (!lead.whatsapp && data.whatsapp) updated.whatsapp = data.whatsapp
  if (!lead.instagram && data.instagram) updated.instagram = data.instagram
  if (!lead.facebook && data.facebook) updated.facebook = data.facebook
  if (!lead.linkedin && data.linkedin) updated.linkedin = data.linkedin

  // Descobriu site que não tinha
  if (!lead.website && data.site) {
    updated.website = data.site
    updated.priority = 'normal'
  }

  // Dados do CNPJ
  if (!lead.address && data.bairro) updated.address = data.bairro

  return updated as Lead
}

// ── Semáforo de concorrência ─────────────────────────────────────

async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = []
  let i = 0
  async function worker() {
    while (i < tasks.length) {
      const idx = i++
      results[idx] = await tasks[idx]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

// ── Enriquece uma sessão ─────────────────────────────────────────

async function runEnrichSession(jobId: string, sessionId: string, userId: string): Promise<void> {
  try {
    // Busca os leads da sessão
    const { data: session } = await supabase
      .from('scrape_sessions')
      .select('leads')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single()

    if (!session?.leads?.length) {
      await updateJob(jobId, { status: 'done', finished_at: new Date().toISOString() })
      return
    }

    const leads: Lead[] = (session.leads as Lead[]).slice(0, MAX_LEADS)
    const total = leads.length
    await updateJob(jobId, { total })

    let enrichedCount = 0
    let progress = 0

    const tasks = leads.map((lead, idx) => async () => {
      try {
        const cnpj = (lead as Lead & { cnpj?: string }).cnpj || null
        const data = await enrichLeadData(lead.name, lead.city, lead.website, cnpj)
        const updated = applyEnrichment(lead, data)
        leads[idx] = updated

        // Verifica se houve melhoria real
        const improved = (
          (!lead.email && updated.email) ||
          (!lead.phone && updated.phone) ||
          (!lead.whatsapp && (updated as Lead & { whatsapp?: string }).whatsapp) ||
          (!lead.instagram && updated.instagram) ||
          (!lead.facebook && updated.facebook)
        )
        if (improved) enrichedCount++
      } catch {
        // Lead falhou — marca como processado sem dados novos
      }

      progress++
      // Atualiza progresso a cada 10 leads ou no final
      if (progress % 10 === 0 || progress === total) {
        await updateJob(jobId, { progress, enriched: enrichedCount }).catch(() => {})
      }
    })

    await withConcurrency(tasks, MAX_CONCURRENT)

    // Salva todos os leads atualizados de volta na sessão
    await supabase
      .from('scrape_sessions')
      .update({ leads })
      .eq('id', sessionId)

    await updateJob(jobId, {
      status: 'done',
      total,
      enriched: enrichedCount,
      progress: total,
      finished_at: new Date().toISOString(),
    })
  } catch (err) {
    await updateJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Erro desconhecido',
      finished_at: new Date().toISOString(),
    })
  }
}

// ── Enriquece todas as sessões do usuário ─────────────────────────

async function runEnrichAll(jobId: string, userId: string): Promise<void> {
  try {
    const { data: sessions } = await supabase
      .from('scrape_sessions')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!sessions?.length) {
      await updateJob(jobId, { status: 'done', finished_at: new Date().toISOString() })
      return
    }

    let totalEnriched = 0
    for (const s of sessions) {
      // Enriquece cada sessão sequencialmente
      await runEnrichSession(`${jobId}_${s.id}`, s.id, userId)
      const sub = await getEnrichJob(`${jobId}_${s.id}`)
      totalEnriched += sub?.enriched ?? 0
    }

    await updateJob(jobId, {
      status: 'done',
      enriched: totalEnriched,
      total: sessions.length,
      progress: sessions.length,
      finished_at: new Date().toISOString(),
    })
  } catch (err) {
    await updateJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Erro desconhecido',
      finished_at: new Date().toISOString(),
    })
  }
}

// ── API pública ──────────────────────────────────────────────────

export async function startEnrichJob(sessionId: string, userId: string): Promise<string> {
  const jobId = `enrich_${sessionId}`
  await createJob(jobId, sessionId, userId, 0)
  setImmediate(() => runEnrichSession(jobId, sessionId, userId))
  return jobId
}

export async function startEnrichAllJob(userId: string): Promise<string> {
  const jobId = `enrich_all_${userId}_${Date.now()}`
  await createJob(jobId, userId as unknown as string, userId, 0)
  setImmediate(() => runEnrichAll(jobId, userId))
  return jobId
}