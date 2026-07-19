import fetch from 'node-fetch'
import { ApifyRunResponse, ApifyRunStatus, ScrapeErrorCode } from '../lib/types'
import { sanitizeError } from '../lib/sanitize'

const BASE = 'https://api.apify.com/v2'
const HTTP_TIMEOUT_MS = Number(process.env.APIFY_HTTP_TIMEOUT_MS || 30000)
const RUN_TIMEOUT_MS = Number(process.env.APIFY_RUN_TIMEOUT_MS || 600000)

/** Erro tipado da Apify — nunca carrega o token, apenas um errorCode classificado. */
export class ApifyError extends Error {
  constructor(public code: ScrapeErrorCode, message: string) {
    super(sanitizeError(message))
    this.name = 'ApifyError'
  }
}

function headers(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    // Token é enviado via header, nunca em query string — evita vazamento em logs de acesso.
    Authorization: `Bearer ${apiKey}`,
  }
}

function classifyHttpError(status: number, body: string): ApifyError {
  if (status === 401 || status === 403) {
    return new ApifyError('APIFY_UNAUTHORIZED', 'Token Apify inválido, expirado ou sem permissão.')
  }
  if (status === 402 || /usage limit|monthly.*limit/i.test(body)) {
    return new ApifyError('APIFY_USAGE_LIMIT_REACHED', 'O limite de uso da conta Apify associada a este token foi atingido.')
  }
  if (status === 400) {
    return new ApifyError('APIFY_ACTOR_INPUT_INVALID', 'A Apify rejeitou o input enviado ao Actor (schema inválido).')
  }
  if (status === 404) {
    return new ApifyError('APIFY_DATASET_NOT_FOUND', 'Run ou dataset não encontrado na Apify.')
  }
  return new ApifyError('APIFY_HTTP_ERROR', `Erro HTTP ${status} ao chamar a Apify.`)
}

async function fetchWithTimeout(url: string, init: Parameters<typeof fetch>[1]): Promise<ReturnType<typeof fetch> extends Promise<infer R> ? R : never> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function startActor(
  apiKey: string,
  actorId: string,
  input: object
): Promise<{ runId: string }> {
  const res = await fetchWithTimeout(`${BASE}/acts/${encodeURIComponent(actorId)}/runs`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    // Corpo de erro pode conter detalhes do schema — nunca contém o token (não fizemos echo dele).
    const body = (await res.text()).slice(0, 500)
    throw classifyHttpError(res.status, body)
  }

  const data = (await res.json()) as ApifyRunResponse
  return { runId: data.data.id }
}

export async function getRunStatus(
  apiKey: string,
  runId: string
): Promise<{ status: string; datasetId: string; requestsFinished: number }> {
  const res = await fetchWithTimeout(`${BASE}/actor-runs/${runId}`, {
    headers: headers(apiKey),
  })

  if (!res.ok) {
    const body = (await res.text()).slice(0, 500)
    throw classifyHttpError(res.status, body)
  }

  const data = (await res.json()) as ApifyRunStatus
  return {
    status: data.data.status,
    datasetId: data.data.defaultDatasetId,
    requestsFinished: data.data.stats?.requestsFinished ?? 0,
  }
}

export async function getDatasetItems(
  apiKey: string,
  datasetId: string,
  limit = 2000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  if (!datasetId) {
    throw new ApifyError('APIFY_DATASET_NOT_FOUND', 'A run foi concluída sem defaultDatasetId.')
  }

  const res = await fetchWithTimeout(
    `${BASE}/datasets/${datasetId}/items?limit=${limit}&clean=true`,
    { headers: headers(apiKey) }
  )

  if (!res.ok) {
    const body = (await res.text()).slice(0, 500)
    throw classifyHttpError(res.status, body)
  }

  const raw = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Array.isArray(raw) ? raw : (raw as any).items ?? []
}

export async function abortRun(apiKey: string, runId: string): Promise<void> {
  try {
    await fetchWithTimeout(`${BASE}/actor-runs/${runId}/abort`, {
      method: 'POST',
      headers: headers(apiKey),
    })
  } catch {
    // abortar é best-effort — não deve derrubar o fluxo de cancelamento
  }
}

export async function waitForRun(
  apiKey: string,
  runId: string,
  onPoll: (status: string, requestsFinished: number) => void,
  cancelSignal: { cancelled: boolean },
  intervalMs = Number(process.env.APIFY_POLL_INTERVAL_MS || 5000)
): Promise<string> {
  const deadline = Date.now() + RUN_TIMEOUT_MS

  while (!cancelSignal.cancelled) {
    if (Date.now() > deadline) {
      await abortRun(apiKey, runId)
      throw new ApifyError('APIFY_RUN_TIMEOUT', `Run excedeu o timeout de ${RUN_TIMEOUT_MS / 1000}s e foi abortada.`)
    }

    await sleep(intervalMs)
    const { status, datasetId, requestsFinished } = await getRunStatus(apiKey, runId)
    onPoll(status, requestsFinished)

    if (status === 'SUCCEEDED') return datasetId
    if (status === 'FAILED') throw new ApifyError('APIFY_RUN_FAILED', 'A execução do Actor falhou na Apify.')
    if (status === 'ABORTED') throw new ApifyError('APIFY_RUN_ABORTED', 'A execução do Actor foi abortada.')
    if (status === 'TIMED-OUT') throw new ApifyError('APIFY_RUN_TIMEOUT', 'A execução do Actor atingiu o timeout na Apify.')
  }

  await abortRun(apiKey, runId)
  throw new Error('Job cancelado pelo usuário.')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}