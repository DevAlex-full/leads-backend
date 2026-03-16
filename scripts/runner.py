"""
runner.py — Orquestra todos os scripts Python em paralelo e retorna JSON unificado.
Chamado pelo backend Node.js via child_process.

Uso:
  python runner.py --config '{"niches":["barbearia"],"cities":[{"name":"São Paulo","state":"SP"}],"sources":["maps","instagram","google","cnpj"],"max_per_city":30,"google_places_key":"AIza..."}'

Saída: JSON array de leads no stdout
Logs:  stderr (não interfere com o Node.js)
"""

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional

from utils import normalize


def run_maps(niche: str, city: str, state: str, key: str, max_r: int) -> list[dict]:
    if not key:
        print('[runner] Google Places key não configurada — pulando Maps Python', file=sys.stderr)
        return []
    from search_maps import search
    return search(niche, city, state, key, max_r)


def run_instagram(niche: str, city: str, state: str, max_r: int) -> list[dict]:
    from search_instagram import search
    return search(niche, city, state, max_r)


def run_google(niche: str, city: str, state: str, max_r: int) -> list[dict]:
    from search_google import search
    return search(niche, city, state, max_r)


def run_cnpj(niche: str, city: str, state: str, max_r: int) -> list[dict]:
    from enrich_cnpj import search_by_city_niche
    return search_by_city_niche(niche, city, state, max_r)


def deduplicate(leads: list[dict]) -> list[dict]:
    """Remove duplicatas por telefone, instagram ou nome+cidade."""
    seen = set()
    result = []
    for lead in leads:
        phone = ''.join(c for c in (lead.get('phone', '') or '') if c.isdigit())
        insta = (lead.get('instagram', '') or '').lower().rstrip('/')
        key = (
            f'phone:{phone}' if phone and len(phone) >= 10
            else f'ig:{insta}' if insta
            else f'name:{normalize(lead.get("name",""))}:{normalize(lead.get("city",""))}'
        )
        if key not in seen:
            seen.add(key)
            result.append(lead)
    return result


def sort_leads(leads: list[dict]) -> list[dict]:
    """Ordena: leads com mais dados primeiro."""
    def score(l: dict) -> int:
        s = 0
        if l.get('phone'):    s += 2
        if l.get('whatsapp'): s += 3
        if l.get('email'):    s += 3
        if l.get('instagram'):s += 2
        if l.get('facebook'): s += 1
        if l.get('website'):  s += 1
        return s
    return sorted(leads, key=score, reverse=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True, help='JSON config')
    args = parser.parse_args()

    try:
        config = json.loads(args.config)
    except json.JSONDecodeError as e:
        print(f'[runner] Config JSON inválido: {e}', file=sys.stderr)
        sys.exit(1)

    niches   = config.get('niches', [])
    cities   = config.get('cities', [])   # [{"name": "São Paulo", "state": "SP"}]
    sources  = config.get('sources', ['maps', 'cnpj'])
    max_per  = config.get('max_per_city', 30)
    gp_key   = config.get('google_places_key', '')

    if not niches or not cities:
        print('[runner] Niches e cities são obrigatórios', file=sys.stderr)
        print(json.dumps([]))
        sys.exit(0)

    all_leads: list[dict] = []
    tasks = []

    # Cria tasks para cada combinação nicho × cidade × fonte
    with ThreadPoolExecutor(max_workers=6) as executor:
        for niche in niches:
            for city_obj in cities:
                city  = city_obj.get('name', '')
                state = city_obj.get('state', '')
                if not city or not state:
                    continue

                if 'maps' in sources:
                    tasks.append(executor.submit(run_maps, niche, city, state, gp_key, max_per))
                if 'instagram' in sources:
                    tasks.append(executor.submit(run_instagram, niche, city, state, max_per // 2))
                if 'google' in sources:
                    tasks.append(executor.submit(run_google, niche, city, state, max_per))
                if 'cnpj' in sources:
                    tasks.append(executor.submit(run_cnpj, niche, city, state, max_per))

        for future in as_completed(tasks):
            try:
                result = future.result()
                if result:
                    all_leads.extend(result)
                    print(f'[runner] +{len(result)} leads ({len(all_leads)} total)', file=sys.stderr)
            except Exception as e:
                print(f'[runner] Task erro: {e}', file=sys.stderr)

    # Adiciona timestamp
    now = datetime.utcnow().isoformat() + 'Z'
    for lead in all_leads:
        if not lead.get('scrapedAt'):
            lead['scrapedAt'] = now

    # Deduplica e ordena
    deduped = deduplicate(all_leads)
    sorted_leads = sort_leads(deduped)

    print(f'[runner] Total final: {len(sorted_leads)} leads únicos (de {len(all_leads)} brutos)', file=sys.stderr)
    print(json.dumps(sorted_leads, ensure_ascii=False))


if __name__ == '__main__':
    main()