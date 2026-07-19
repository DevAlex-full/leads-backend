import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeText, sanitizeError, sanitizeUrl } from '../src/lib/sanitize'

test('redige token apify_api_ em qualquer posicao do texto', () => {
  const input = 'Falha ao chamar Apify com token apify_api_ABC123DEF456GHI789 no header'
  const out = sanitizeText(input)
  assert.ok(!out.includes('apify_api_ABC123DEF456GHI789'))
  assert.ok(out.includes('[REDACTED]'))
})

test('sanitiza URL contendo token em query string', () => {
  const url = 'https://api.apify.com/v2/datasets/xyz/items?token=apify_api_secret123456&clean=true'
  const out = sanitizeUrl(url)
  assert.ok(!out.includes('apify_api_secret123456'))
  assert.equal(out, 'https://api.apify.com/v2/datasets/xyz/items?token=[REDACTED]&clean=true')
})

test('sanitiza header Authorization Bearer', () => {
  const out = sanitizeText('Authorization: Bearer apify_api_xxxxxxxxxxxxxxxxxxxx')
  assert.ok(!out.includes('xxxxxxxxxxxxxxxxxxxx'))
})

test('sanitiza JWT completo', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMifQ.abc123signature'
  const out = sanitizeText(`token invalido: ${jwt}`)
  assert.ok(!out.includes(jwt))
})

test('sanitizeError extrai e sanitiza mensagem de Error', () => {
  const err = new Error('Apify startActor 401: token apify_api_leaked1234567890 invalido')
  const out = sanitizeError(err)
  assert.ok(!out.includes('apify_api_leaked1234567890'))
})

test('texto sem segredo permanece inalterado', () => {
  const input = 'Google Maps: dataset retornou 450 itens brutos'
  assert.equal(sanitizeText(input), input)
})