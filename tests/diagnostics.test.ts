import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStats, buildDiagnostics } from '../src/services/diagnostics'
import { SourceExecution } from '../src/lib/types'

function makeExec(overrides: Partial<SourceExecution> = {}): SourceExecution {
  return {
    source: 'google_maps',
    actorId: 'compass/crawler-google-places',
    status: 'succeeded',
    rawItems: 0,
    parsedItems: 0,
    afterLocationFilter: 0,
    duplicatesInRun: 0,
    previouslySeen: 0,
    finalItems: 0,
    ...overrides,
  }
}

// ── buildStats: contadores corretos ─────────────────────────────────────

test('contadores corretos no cenario feliz (equivalente ao exemplo do usuario)', () => {
  const execs = [makeExec({ rawItems: 453, parsedItems: 452, afterLocationFilter: 400 })]
  const stats = buildStats({
    sourceExecutions: execs,
    duplicateItems: 19,
    filteredByWebsite: 38,
    finalItems: 343,
  })
  assert.equal(stats.rawItems, 453)
  assert.equal(stats.parsedItems, 452)
  assert.equal(stats.invalidItems, 1) // 453 - 452
  assert.equal(stats.filteredByLocation, 52) // 452 - 400
  assert.equal(stats.filteredByWebsite, 38)
  assert.equal(stats.duplicateItems, 19)
  assert.equal(stats.finalItems, 343)
})

test('soma contadores de multiplas fontes corretamente', () => {
  const execs = [
    makeExec({ source: 'google_maps', rawItems: 100, parsedItems: 90, afterLocationFilter: 80 }),
    makeExec({ source: 'instagram', rawItems: 50, parsedItems: 45, afterLocationFilter: 40 }),
  ]
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: 5, filteredByWebsite: 10, finalItems: 105 })
  assert.equal(stats.rawItems, 150)
  assert.equal(stats.parsedItems, 135)
  assert.equal(stats.invalidItems, 15)
  assert.equal(stats.filteredByLocation, 15) // (90-80)+(45-40)
})

test('extraRawItems (ex.: leads do Python) somam em raw e parsed igualmente', () => {
  const execs = [makeExec({ rawItems: 100, parsedItems: 90, afterLocationFilter: 80 })]
  const stats = buildStats({
    sourceExecutions: execs, extraRawItems: 20, duplicateItems: 0, filteredByWebsite: 0, finalItems: 100,
  })
  assert.equal(stats.rawItems, 120)
  assert.equal(stats.parsedItems, 110)
})

// ── Nunca permitir numeros negativos ────────────────────────────────────

test('nunca produz numeros negativos mesmo com input inconsistente', () => {
  const execs = [makeExec({ rawItems: 10, parsedItems: 15, afterLocationFilter: 20 })] // parsedItems > rawItems (upstream bugado)
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: -5, filteredByWebsite: -1, finalItems: -3 })
  assert.ok(stats.invalidItems >= 0)
  assert.ok(stats.filteredByLocation >= 0)
  assert.ok(stats.duplicateItems >= 0)
  assert.ok(stats.filteredByWebsite >= 0)
  assert.ok(stats.finalItems >= 0)
})

// ── Garantir consistencia: finalItems <= parsedItems <= rawItems ────────

test('mantem a invariante finalItems <= parsedItems <= rawItems mesmo com finalItems super-relatado', () => {
  const execs = [makeExec({ rawItems: 50, parsedItems: 40, afterLocationFilter: 30 })]
  const stats = buildStats({
    sourceExecutions: execs, duplicateItems: 0, filteredByWebsite: 0, finalItems: 999, // inconsistente de propósito
  })
  assert.ok(stats.finalItems <= stats.parsedItems)
  assert.ok(stats.parsedItems <= stats.rawItems)
})

test('invariante se mantem em cenario normal de multiplas fontes', () => {
  const execs = [
    makeExec({ source: 'google_maps', rawItems: 453, parsedItems: 452, afterLocationFilter: 400 }),
    makeExec({ source: 'instagram', rawItems: 64, parsedItems: 60, afterLocationFilter: 55 }),
  ]
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: 19, filteredByWebsite: 38, finalItems: 343 })
  assert.ok(stats.finalItems <= stats.parsedItems)
  assert.ok(stats.parsedItems <= stats.rawItems)
})

// ── Zero resultados ──────────────────────────────────────────────────────

test('zero resultados: dataset vazio gera stats zerados e diagnostico especifico', () => {
  const execs = [makeExec({ rawItems: 0, parsedItems: 0, afterLocationFilter: 0 })]
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: 0, filteredByWebsite: 0, finalItems: 0 })
  assert.equal(stats.rawItems, 0)
  assert.equal(stats.finalItems, 0)

  const diagnostics = buildDiagnostics(execs, stats, 'all')
  assert.ok(diagnostics.includes('Google Maps não retornou resultados.'))
  assert.ok(diagnostics.includes('0 leads finais.'))
})

// ── Actor falhando ───────────────────────────────────────────────────────

test('actor falhando: diagnostico reporta falha e o erro sanitizado, sem tentar somar contadores da fonte com falha', () => {
  const execs = [makeExec({ status: 'failed', error: 'Timeout na Apify.', rawItems: 0, parsedItems: 0 })]
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: 0, filteredByWebsite: 0, finalItems: 0 })
  const diagnostics = buildDiagnostics(execs, stats, 'all')

  assert.ok(diagnostics.includes('Google Maps Actor falhou.'))
  assert.ok(diagnostics.includes('Erro sanitizado: Timeout na Apify.'))
})

test('fontes pending/cancelled (nunca rodaram) nao geram diagnostico', () => {
  const execs = [
    makeExec({ status: 'pending' }),
    makeExec({ source: 'instagram', status: 'cancelled', warning: 'Fonte desabilitada via feature flag.' }),
  ]
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: 0, filteredByWebsite: 0, finalItems: 0 })
  const diagnostics = buildDiagnostics(execs, stats, 'all')
  // Só deve sobrar a linha final de resumo — nenhuma fonte "rodou" de fato.
  assert.deepEqual(diagnostics, ['0 leads finais.'])
})

// ── diagnostics produzidos corretamente (cenario completo do enunciado) ─

test('gera as linhas de diagnostico equivalentes ao exemplo do usuario', () => {
  const execs = [makeExec({ rawItems: 453, parsedItems: 452, afterLocationFilter: 400 })]
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: 19, filteredByWebsite: 38, finalItems: 343 })
  const diagnostics = buildDiagnostics(execs, stats, 'without_site')

  assert.deepEqual(diagnostics, [
    'Google Maps retornou 453 registros.',
    '1 itens descartados pelo parser (formato inválido).',
    '52 descartados por localização.',
    '38 descartados por possuir website.',
    '19 duplicados.',
    '343 leads finais.',
  ])
})

test('mensagem do filtro de website muda de acordo com siteFilter=with_site', () => {
  const execs = [makeExec({ rawItems: 10, parsedItems: 10, afterLocationFilter: 10 })]
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: 0, filteredByWebsite: 4, finalItems: 6 })
  const diagnostics = buildDiagnostics(execs, stats, 'with_site')
  assert.ok(diagnostics.includes('4 descartados por não possuir website.'))
})

// ── Nenhuma informacao sensivel aparece nos diagnostics ──────────────────

test('erro de fonte contendo token e sanitizado antes de entrar no diagnostico', () => {
  const execs = [makeExec({
    status: 'failed',
    error: 'Falha ao chamar Apify com token apify_api_LEAKED1234567890ABCDEF no header',
  })]
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: 0, filteredByWebsite: 0, finalItems: 0 })
  const diagnostics = buildDiagnostics(execs, stats, 'all')

  const joined = diagnostics.join(' | ')
  assert.ok(!joined.includes('apify_api_LEAKED1234567890ABCDEF'))
  assert.ok(joined.includes('[REDACTED]'))
})

test('URL com token em erro de fonte tambem e sanitizada no diagnostico', () => {
  const execs = [makeExec({
    status: 'failed',
    error: 'GET https://api.apify.com/v2/datasets/x/items?token=apify_api_shouldnotleak123&clean=true falhou com 401',
  })]
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: 0, filteredByWebsite: 0, finalItems: 0 })
  const diagnostics = buildDiagnostics(execs, stats, 'all')

  const joined = diagnostics.join(' | ')
  assert.ok(!joined.includes('apify_api_shouldnotleak123'))
})

test('JWT em erro de fonte e sanitizado no diagnostico', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMifQ.abc123signature'
  const execs = [makeExec({ status: 'failed', error: `Sessao invalida: ${jwt}` })]
  const stats = buildStats({ sourceExecutions: execs, duplicateItems: 0, filteredByWebsite: 0, finalItems: 0 })
  const diagnostics = buildDiagnostics(execs, stats, 'all')

  assert.ok(!diagnostics.join(' | ').includes(jwt))
})