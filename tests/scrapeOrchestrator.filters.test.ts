import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterByCities, applySiteFilter, deduplicateLeads } from '../src/services/scrapeOrchestrator'
import { Lead } from '../src/lib/types'

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    name: 'Lead Teste',
    niche: 'barbearia',
    city: 'Campinas',
    state: 'SP',
    phone: '',
    email: '',
    address: '',
    website: '',
    instagram: '',
    linkedin: '',
    facebook: '',
    whatsapp: '',
    rating: '',
    reviews: '',
    category: '',
    source: 'google_maps',
    priority: 'normal',
    scrapedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ── filterByCities: locationMatch ───────────────────────────────────

test('exact: cidade e UF batem exatamente -> mantido', () => {
  const leads = [makeLead({ city: 'Campinas', state: 'SP' })]
  assert.equal(filterByCities(leads, ['Campinas']).length, 1)
})

test('reconhece variacoes de formato de cidade/estado (nome completo do estado)', () => {
  const leads = [makeLead({ city: 'Campinas', state: 'São Paulo' })]
  assert.equal(filterByCities(leads, ['Campinas']).length, 1)
})

test('probable: cidade bate mas sem estado no lead -> mantido (nao e mismatch)', () => {
  const leads = [makeLead({ city: 'Campinas', state: '' })]
  assert.equal(filterByCities(leads, ['Campinas']).length, 1)
})

test('mismatch comprovado: cidade e estado diferentes dos permitidos -> removido', () => {
  const leads = [makeLead({ city: 'Sorocaba', state: 'SP' })]
  assert.equal(filterByCities(leads, ['Campinas']).length, 0)
})

test('cidade dentro do endereco completo com UF correta -> mantido', () => {
  const leads = [makeLead({ city: '', state: '', address: 'Av. Norte-Sul, 456, Campinas - SP' })]
  assert.equal(filterByCities(leads, ['Campinas']).length, 1)
})

test('nenhuma cidade selecionada -> nao filtra nada', () => {
  const leads = [makeLead({ city: 'Qualquer', state: 'XX' })]
  assert.equal(filterByCities(leads, []).length, 1)
})

// ── applySiteFilter ──────────────────────────────────────────────────

test('siteFilter=all mantem leads com e sem site', () => {
  const leads = [makeLead({ website: 'https://a.com' }), makeLead({ website: '' })]
  assert.equal(applySiteFilter(leads, 'all').length, 2)
})

test('siteFilter=without_site remove leads com site', () => {
  const leads = [makeLead({ website: 'https://a.com' }), makeLead({ website: '' })]
  assert.equal(applySiteFilter(leads, 'without_site').length, 1)
})

test('siteFilter=with_site remove leads sem site', () => {
  const leads = [makeLead({ website: 'https://a.com' }), makeLead({ website: '' })]
  assert.equal(applySiteFilter(leads, 'with_site').length, 1)
})

// ── deduplicateLeads (mesma execucao) ─────────────────────────────────

test('deduplica por telefone quando presente', () => {
  const leads = [
    makeLead({ name: 'A', phone: '(19) 99999-1234' }),
    makeLead({ name: 'B', phone: '19999991234' }), // mesmo telefone, formatado diferente
  ]
  assert.equal(deduplicateLeads(leads).length, 1)
})

test('deduplica por instagram quando nao ha telefone', () => {
  const leads = [
    makeLead({ name: 'A', phone: '', instagram: 'https://instagram.com/x' }),
    makeLead({ name: 'B', phone: '', instagram: 'https://instagram.com/x' }),
  ]
  assert.equal(deduplicateLeads(leads).length, 1)
})

test('leads distintos sem telefone/instagram nao sao unificados incorretamente', () => {
  const leads = [
    makeLead({ name: 'A', city: 'Campinas', phone: '' }),
    makeLead({ name: 'B', city: 'Campinas', phone: '' }),
  ]
  assert.equal(deduplicateLeads(leads).length, 2)
})