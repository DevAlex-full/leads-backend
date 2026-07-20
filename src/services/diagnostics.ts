import { Source, SourceExecution, ScrapeStats, SiteFilter } from '../lib/types'
import { sanitizeText } from '../lib/sanitize'

// Deve ficar em sincronia com os labels de ACTOR_CONFIGS em scrapeOrchestrator.ts.
// Duplicado aqui de propósito para manter este módulo puro e sem dependências
// do orquestrador (evita import circular e mantém 100% testável isoladamente).
const SOURCE_LABELS: Record<Source, string> = {
  google_maps: 'Google Maps',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook Pages',
}

/** Nunca permite números negativos — blindagem contra contagens fora de sincronia. */
function nonNegative(n: number): number {
  return Math.max(0, Number.isFinite(n) ? n : 0)
}

export interface BuildStatsInput {
  sourceExecutions: SourceExecution[]
  // Leads adicionados por fontes que não passam pelo pipeline padrão do Actor
  // (hoje: Python/CNPJ). Contam como raw+parsed 1:1, pois chegam já finalizados
  // e não passam por parser nem filtro de localização.
  extraRawItems?: number
  duplicateItems: number
  filteredByWebsite: number
  finalItems: number
}

/**
 * Agrega os contadores por-fonte (SourceExecution) em um objeto único de
 * estatísticas do job inteiro. Função pura — não lê nem grava o ScrapeJob.
 *
 * Garante por construção (e reforça com clamps defensivos):
 *   0 <= finalItems <= parsedItems <= rawItems
 */
export function buildStats(input: BuildStatsInput): ScrapeStats {
  const extraRawItems = nonNegative(input.extraRawItems ?? 0)

  const rawItems = nonNegative(
    input.sourceExecutions.reduce((sum, se) => sum + nonNegative(se.rawItems), 0) + extraRawItems
  )
  const parsedItemsRaw = nonNegative(
    input.sourceExecutions.reduce((sum, se) => sum + nonNegative(se.parsedItems), 0) + extraRawItems
  )
  // Blindagem: parser nunca deveria "inventar" itens além do raw, mas nunca confiamos
  // cegamente em upstream — clampa para garantir a invariante mesmo em cenário inesperado.
  const parsedItems = Math.min(parsedItemsRaw, rawItems)
  const invalidItems = nonNegative(rawItems - parsedItems)

  const filteredByLocation = nonNegative(
    input.sourceExecutions.reduce(
      (sum, se) => sum + nonNegative(se.parsedItems - se.afterLocationFilter),
      0
    )
  )

  const duplicateItems = nonNegative(input.duplicateItems)
  const filteredByWebsite = nonNegative(input.filteredByWebsite)
  const finalItemsRaw = nonNegative(input.finalItems)
  const finalItems = Math.min(finalItemsRaw, parsedItems)

  return {
    rawItems,
    parsedItems,
    invalidItems,
    duplicateItems,
    filteredByLocation,
    filteredByWebsite,
    finalItems,
  }
}

/**
 * Gera mensagens legíveis descrevendo o que aconteceu em cada etapa do
 * pipeline. Toda string passa por sanitizeText antes de ser retornada —
 * nenhum diagnóstico pode conter token, Authorization, JWT ou URL com token,
 * mesmo que o texto de origem (ex.: erro de uma fonte) já devesse estar limpo.
 */
export function buildDiagnostics(
  sourceExecutions: SourceExecution[],
  stats: ScrapeStats,
  siteFilter: SiteFilter
): string[] {
  const lines: string[] = []

  for (const se of sourceExecutions) {
    // Fontes nunca iniciadas (desabilitadas por feature flag ou não chegaram
    // a rodar por cancelamento antecipado) não geram diagnóstico — não houve execução real.
    if (se.status === 'pending' || se.status === 'cancelled') continue

    const label = SOURCE_LABELS[se.source] ?? se.source

    if (se.status === 'failed') {
      lines.push(sanitizeText(`${label} Actor falhou.`))
      lines.push(sanitizeText(`Erro sanitizado: ${se.error || 'erro desconhecido'}`))
      continue
    }

    if (se.status === 'succeeded') {
      lines.push(
        se.rawItems === 0
          ? sanitizeText(`${label} não retornou resultados.`)
          : sanitizeText(`${label} retornou ${se.rawItems} registros.`)
      )
    }
  }

  if (stats.invalidItems > 0) {
    lines.push(`${stats.invalidItems} itens descartados pelo parser (formato inválido).`)
  }
  if (stats.filteredByLocation > 0) {
    lines.push(`${stats.filteredByLocation} descartados por localização.`)
  }
  if (stats.filteredByWebsite > 0) {
    const reason =
      siteFilter === 'without_site' ? 'possuir website' :
      siteFilter === 'with_site' ? 'não possuir website' :
      'filtro de website'
    lines.push(`${stats.filteredByWebsite} descartados por ${reason}.`)
  }
  if (stats.duplicateItems > 0) {
    lines.push(`${stats.duplicateItems} duplicados.`)
  }

  lines.push(`${stats.finalItems} leads finais.`)

  return lines
}