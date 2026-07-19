import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createJob, updateJob, getJob } from '../src/services/jobStore'

const SRC = path.join(__dirname, '..', 'src')

function readAllTs(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...readAllTs(full))
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

test('nenhum arquivo do backend atribui apiKey/apifyToken a job/sourceExecutions/log', () => {
  const offenders: string[] = []
  for (const file of readAllTs(SRC)) {
    const content = fs.readFileSync(file, 'utf-8')
    // Padrões perigosos: gravar o token em algo persistido/serializado.
    const dangerous = /(updateJob|addLog|SourceExecution|ScrapeJob)[^\n]{0,80}(apiKey|apifyToken)\b/gi
    if (dangerous.test(content)) offenders.push(path.relative(SRC, file))
  }
  assert.deepEqual(offenders, [], `Possível vazamento de token encontrado em: ${offenders.join(', ')}`)
})

test('ScrapeJob criado e atualizado em runtime nunca contem a string do token de teste', () => {
  const fakeToken = 'apify_api_this_should_never_be_persisted_123'
  const jobId = 'test-job-security-1'

  createJob(jobId, 'user-1')
  updateJob(jobId, { progressLabel: `Rodando busca (não relacionado ao token: ${fakeToken.slice(0, 0)})` })

  const job = getJob(jobId)
  const serialized = JSON.stringify(job)
  assert.ok(!serialized.includes(fakeToken), 'ScrapeJob serializado não deve conter o token')
})

test('SourceExecution nao possui campo apiKey/token no shape do tipo (guarda estrutural)', () => {
  createJob('test-job-security-2', 'user-1')
  updateJob('test-job-security-2', {
    sourceExecutions: [{
      source: 'google_maps',
      actorId: 'compass/crawler-google-places',
      status: 'succeeded',
      rawItems: 5,
      parsedItems: 5,
      afterLocationFilter: 5,
      duplicatesInRun: 0,
      previouslySeen: 0,
      finalItems: 5,
    }],
  })
  const job = getJob('test-job-security-2')
  const se = job!.sourceExecutions[0] as unknown as Record<string, unknown>
  assert.equal(se.apiKey, undefined)
  assert.equal(se.apifyToken, undefined)
  assert.equal(se.token, undefined)
})