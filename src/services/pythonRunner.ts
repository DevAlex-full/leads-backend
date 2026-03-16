import { spawn } from 'child_process'
import path from 'path'
import { Lead } from '../lib/types'

const SCRIPTS_DIR = path.join(__dirname, '../../scripts')
const PYTHON_CMD  = process.env.PYTHON_CMD || 'python3'

export interface PythonRunConfig {
  niches: string[]
  cities: { name: string; state: string }[]
  sources: ('maps' | 'instagram' | 'google' | 'cnpj')[]
  maxPerCity: number
  googlePlacesKey?: string
}

export async function runPythonScripts(config: PythonRunConfig): Promise<Lead[]> {
  const configJson = JSON.stringify({
    niches: config.niches,
    cities: config.cities,
    sources: config.sources,
    max_per_city: config.maxPerCity,
    google_places_key: config.googlePlacesKey || '',
  })

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    const proc = spawn(PYTHON_CMD, [
      path.join(SCRIPTS_DIR, 'runner.py'),
      '--config', configJson,
    ], {
      cwd: SCRIPTS_DIR,
      env: { ...process.env },
    })

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => {
      const msg = d.toString()
      stderr += msg
      // Log em tempo real do progresso Python
      msg.split('\n').filter(Boolean).forEach(line => {
        console.log(`[python] ${line}`)
      })
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[pythonRunner] Python saiu com código ${code}`)
        console.error(`[pythonRunner] stderr: ${stderr.slice(-500)}`)
        resolve([])
        return
      }

      try {
        const leads = JSON.parse(stdout.trim()) as Lead[]
        console.log(`[pythonRunner] ${leads.length} leads recebidos do Python`)
        resolve(leads)
      } catch (e) {
        console.error(`[pythonRunner] Erro ao parsear JSON do Python: ${e}`)
        console.error(`[pythonRunner] stdout: ${stdout.slice(-300)}`)
        resolve([])
      }
    })

    proc.on('error', (err) => {
      console.error(`[pythonRunner] Erro ao spawnar Python: ${err.message}`)
      console.error(`[pythonRunner] Certifique-se que '${PYTHON_CMD}' está instalado`)
      resolve([])
    })

    // Timeout de 10 minutos — scripts podem ser lentos
    setTimeout(() => {
      proc.kill()
      console.warn('[pythonRunner] Timeout — encerrando scripts Python')
      try {
        const partial = JSON.parse(stdout.trim()) as Lead[]
        resolve(partial)
      } catch {
        resolve([])
      }
    }, 10 * 60 * 1000)
  })
}

export function isPythonConfigured(): boolean {
  const hasGoogleKey = Boolean(process.env.GOOGLE_PLACES_KEY)
  return hasGoogleKey || process.env.PYTHON_ENABLED === 'true'
}