/**
 * Sanitização central de logs e mensagens de erro.
 *
 * Regra: NENHUM segredo (token Apify, JWT, Supabase service role key, senha)
 * pode chegar a console.log, ScrapeJob, SourceExecution ou resposta HTTP.
 *
 * Usar sempre que uma string vier de uma fonte externa (Apify, stack trace,
 * corpo de erro HTTP) antes de logar ou persistir.
 */

const SECRET_PATTERNS: RegExp[] = [
  // token=apify_api_xxx ou apiKey=... em query string
  /([?&](?:token|apiKey|apifyToken)=)[^&\s"']+/gi,
  // tokens Apify em qualquer posição (apify_api_ + 20-40 alfanuméricos)
  /apify_api_[a-zA-Z0-9]{10,}/g,
  // Authorization: Bearer xxx
  /(authorization["']?\s*[:=]\s*["']?Bearer\s+)[^\s"']+/gi,
  // JWT (três blocos base64url separados por ponto)
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  // service_role / secret / password / senha como chave=valor
  /(["']?(?:service_role|secret|password|senha)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
]

export function sanitizeText(input: unknown): string {
  let text = typeof input === 'string' ? input : String(input ?? '')
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix?: string) =>
      prefix ? `${prefix}[REDACTED]` : '[REDACTED]'
    )
  }
  return text
}

/** Sanitiza uma mensagem de erro (Error | unknown) para uso em logs e respostas públicas. */
export function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return sanitizeText(raw)
}

/** Sanitiza uma URL antes de logar (remove token de query string). */
export function sanitizeUrl(url: string): string {
  return sanitizeText(url)
}