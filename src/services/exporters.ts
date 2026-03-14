import { Lead } from '../lib/types'

export function generateMarkdown(leads: Lead[], niche: string): string {
  const today = new Date().toLocaleDateString('pt-BR')
  const hot = leads.filter((l) => l.priority === 'high')
  const normal = leads.filter((l) => l.priority === 'normal')

  let md = `# Leads — ${capitalize(niche)} · Brasil\n\n`
  md += `> Gerado em ${today} via Apify Multi-Source Scraper\n\n`
  md += `| Métrica | Valor |\n|---------|-------|\n`
  md += `| Total de leads | **${leads.length}** |\n`
  md += `| Sem site (prioridade alta) | **${hot.length}** |\n`
  md += `| Com Instagram | **${leads.filter((l) => l.instagram).length}** |\n`
  md += `| Com LinkedIn | **${leads.filter((l) => l.linkedin).length}** |\n`
  md += `| Com Facebook | **${leads.filter((l) => l.facebook).length}** |\n`
  md += `| Com e-mail | **${leads.filter((l) => l.email).length}** |\n`
  md += `| Fontes | **${[...new Set(leads.map((l) => sourceLabel(l.source)))].join(', ')}** |\n\n`
  md += `---\n\n`

  md += `## 🔥 Prioridade Alta — Sem Site (${hot.length})\n\n`
  if (hot.length) {
    md += buildTable(hot)
  } else {
    md += `_Nenhum lead sem site encontrado._\n`
  }

  md += `\n---\n\n## 📋 Com Site (${normal.length})\n\n`
  if (normal.length) {
    md += buildTable(normal, true)
  } else {
    md += `_Nenhum lead com site encontrado._\n`
  }

  md += `\n---\n\n## 💬 Scripts de Abordagem\n\n`
  md += `### WhatsApp — Negócio sem site\n\n`
  md += `\`\`\`\nOlá [Nome]! Vi vocês no Google e percebi que ainda não têm um sistema de agendamento online. Nosso app pode ajudar bastante — posso mostrar em 10 minutos? Sem compromisso!\n\`\`\`\n\n`
  md += `### E-mail frio\n\n`
  md += `\`\`\`\nAssunto: [Nome] — Mais clientes com agendamento online?\n\nOlá, encontrei o(a) [Nome] e quero compartilhar algo que pode ajudar: nosso sistema de agendamento online reduz faltas e organiza a agenda automaticamente. Posso enviar um teste gratuito de 14 dias?\n\`\`\`\n\n`
  md += `_Gerado automaticamente · Powered by Apify_\n`

  return md
}

function buildTable(leads: Lead[], includeWebsite = false): string {
  const cols = ['#', 'Nome', 'Cidade/UF', 'Telefone', 'E-mail', 'Instagram', 'LinkedIn', 'Facebook', ...(includeWebsite ? ['Site'] : []), 'Avaliação', 'Fonte']
  let t = `| ${cols.join(' | ')} |\n`
  t += `| ${cols.map(() => '---').join(' | ')} |\n`
  leads.forEach((l, i) => {
    const loc = [l.city, l.state].filter(Boolean).join('/')
    const insta = l.instagram ? `[ver](${l.instagram})` : '—'
    const li = l.linkedin ? `[ver](${l.linkedin})` : '—'
    const fb = l.facebook ? `[ver](${l.facebook})` : '—'
    const site = l.website ? `[site](${l.website})` : '—'
    const rating = l.rating ? `${l.rating}/5 (${l.reviews})` : '—'
    const cols = [String(i + 1), l.name, loc || '—', l.phone || '—', l.email || '—', insta, li, fb, ...(includeWebsite ? [site] : []), rating, sourceLabel(l.source)]
    t += `| ${cols.join(' | ')} |\n`
  })
  return t
}

export function generateCsv(leads: Lead[]): string {
  const headers = [
    'Nome', 'Nicho', 'Cidade', 'UF', 'Telefone', 'Email',
    'Endereço', 'Site', 'Instagram', 'LinkedIn', 'Facebook',
    'Avaliação', 'Avaliações', 'Prioridade', 'Fonte', 'Coletado em',
  ]
  const rows = leads.map((l) => [
    l.name, l.niche, l.city, l.state, l.phone, l.email,
    l.address, l.website, l.instagram, l.linkedin, l.facebook,
    l.rating, l.reviews,
    l.priority === 'high' ? 'Alta (sem site)' : 'Normal',
    sourceLabel(l.source),
    l.scrapedAt,
  ])
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`
  return [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n')
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    google_maps: 'Google Maps',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    facebook: 'Facebook',
  }
  return map[source] || source
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
