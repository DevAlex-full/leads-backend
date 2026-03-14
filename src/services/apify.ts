import fetch from 'node-fetch'
import { ApifyRunResponse, ApifyRunStatus } from '../lib/types'

const BASE = 'https://api.apify.com/v2'

function headers(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

export async function startActor(
  apiKey: string,
  actorId: string,
  input: object
): Promise<{ runId: string }> {
  const res = await fetch(`${BASE}/acts/${encodeURIComponent(actorId)}/runs`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Apify startActor ${res.status}: ${body}`)
  }

  const data = (await res.json()) as ApifyRunResponse
  return { runId: data.data.id }
}

export async function getRunStatus(
  apiKey: string,
  runId: string
): Promise<{ status: string; datasetId: string; requestsFinished: number }> {
  const res = await fetch(`${BASE}/actor-runs/${runId}`, {
    headers: headers(apiKey),
  })

  if (!res.ok) {
    throw new Error(`Apify getRunStatus ${res.status}`)
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
  const res = await fetch(
    `${BASE}/datasets/${datasetId}/items?limit=${limit}&clean=true`,
    { headers: headers(apiKey) }
  )

  if (!res.ok) {
    throw new Error(`Apify getDataset ${res.status}`)
  }

  const raw = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Array.isArray(raw) ? raw : (raw as any).items ?? []
}

export async function waitForRun(
  apiKey: string,
  runId: string,
  onPoll: (status: string, requestsFinished: number) => void,
  cancelSignal: { cancelled: boolean },
  intervalMs = 5000
): Promise<string> {
  while (!cancelSignal.cancelled) {
    await sleep(intervalMs)
    const { status, datasetId, requestsFinished } = await getRunStatus(apiKey, runId)
    onPoll(status, requestsFinished)

    if (status === 'SUCCEEDED') return datasetId
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Actor run ${status}`)
    }
  }
  throw new Error('Job cancelado pelo usuário.')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
