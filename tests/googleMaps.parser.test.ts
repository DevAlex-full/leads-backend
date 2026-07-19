import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseGoogleMapsItems } from '../src/services/parsers/googleMaps'

const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'google-maps-dataset.sample.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'))

test('parseia itens validos do dataset do Google Maps', () => {
  const leads = parseGoogleMapsItems(fixture, 'barbearia')
  // O 4º item da fixture não tem "title" nem "name" — deve ser descartado (missing_name).
  assert.equal(leads.length, 3)
})

test('extrai nome, cidade e estado corretamente quando o item tem city/state diretos', () => {
  const leads = parseGoogleMapsItems(fixture, 'barbearia')
  const first = leads.find(l => l.name === 'Barbearia Exemplo Central')
  assert.ok(first)
  assert.equal(first!.city, 'Campinas')
  assert.equal(first!.state, 'São Paulo')
  assert.equal(first!.website, 'https://barbeariaexemplo.com.br')
  assert.equal(first!.instagram, 'https://www.instagram.com/barbeariaexemplo')
})

test('faz fallback para parseAddress quando city/state vem vazio do actor', () => {
  const leads = parseGoogleMapsItems(fixture, 'barbearia')
  const second = leads.find(l => l.name === 'Barbearia Sem Endereco Estruturado')
  assert.ok(second)
  assert.equal(second!.city, 'Campinas')
  assert.equal(second!.state, 'SP')
})

test('itens sem nome (title/name) sao descartados', () => {
  const leads = parseGoogleMapsItems(fixture, 'barbearia')
  assert.ok(!leads.some(l => l.name === ''))
})

test('dataset vazio retorna array vazio sem lançar erro', () => {
  const leads = parseGoogleMapsItems([], 'barbearia')
  assert.deepEqual(leads, [])
})

test('leads sem website recebem priority high (mais quentes)', () => {
  const leads = parseGoogleMapsItems(fixture, 'barbearia')
  const noWebsite = leads.find(l => l.name === 'Barbearia Sem Endereco Estruturado')
  assert.equal(noWebsite!.priority, 'high')
})