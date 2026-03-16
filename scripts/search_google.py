"""
search_google.py — Busca negócios via DuckDuckGo e extrai contatos dos sites.
Sem API key — 100% gratuito.

Uso:
  python search_google.py --niche "barbearia" --city "São Paulo" --state "SP"
"""

import argparse
import json
import re
import sys
import time
from typing import Optional
import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from utils import (
    validate_phone, build_whatsapp, format_phone,
    extract_emails, extract_phones, extract_instagram,
    extract_whatsapp_link, lead_to_dict
)

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Accept': 'text/html,application/xhtml+xml',
}

CONTACT_PATHS = [
    '/contato', '/contact', '/fale-conosco', '/sobre',
    '/about', '/quem-somos', '/atendimento',
]

SKIP_DOMAINS = {
    'google.com', 'google.com.br', 'facebook.com', 'instagram.com',
    'youtube.com', 'wikipedia.org', 'tripadvisor.com.br', 'guiamais.com.br',
    'yellowpages.com', 'yelp.com', 'foursquare.com', 'linkedin.com',
    'ifood.com.br', 'rappi.com.br', 'getninjas.com.br',
}


def get_domain(url: str) -> str:
    m = re.match(r'https?://(?:www\.)?([^/]+)', url)
    return m.group(1).lower() if m else ''


def should_skip(url: str) -> bool:
    domain = get_domain(url)
    return any(skip in domain for skip in SKIP_DOMAINS)


def fetch_page(url: str, timeout: int = 10) -> Optional[str]:
    """Faz GET com timeout e retorna HTML ou None."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        if r.status_code == 200 and 'html' in r.headers.get('content-type', ''):
            return r.text
    except Exception:
        pass
    return None


def extract_from_html(html: str, base_url: str = '') -> dict:
    """Extrai todos os contatos de um HTML."""
    soup = BeautifulSoup(html, 'html.parser')
    for tag in soup(['script', 'style', 'noscript']):
        tag.decompose()

    text = soup.get_text(' ', strip=True)

    emails   = extract_emails(text)
    phones   = extract_phones(text)
    wa_link  = extract_whatsapp_link(html)
    instagram = None
    facebook  = None

    for a in soup.find_all('a', href=True):
        href = a['href']
        if not instagram and 'instagram.com' in href:
            instagram = extract_instagram(href)
        if not facebook and 'facebook.com' in href and 'share' not in href:
            facebook = href.rstrip('/')

    phone_fmt = format_phone(phones[0]) if phones else ''
    if not wa_link and phones:
        wa_link = build_whatsapp(phones[0]) or ''

    return {
        'emails': emails,
        'phones': phones,
        'phone_fmt': phone_fmt,
        'whatsapp': wa_link or '',
        'instagram': instagram or '',
        'facebook': facebook or '',
    }


def enrich_website(url: str) -> dict:
    """Visita site e tenta extrair contatos da home + /contato."""
    try:
        base = re.match(r'https?://[^/]+', url)
        base_url = base.group(0) if base else ''
    except Exception:
        base_url = ''

    result = {'emails': [], 'phones': [], 'phone_fmt': '', 'whatsapp': '', 'instagram': '', 'facebook': ''}

    # Home
    html = fetch_page(url)
    if html:
        data = extract_from_html(html, base_url)
        _merge(result, data)

    # Subpáginas de contato
    if not _is_complete(result) and base_url:
        for path in CONTACT_PATHS:
            html = fetch_page(base_url + path, timeout=8)
            if html:
                data = extract_from_html(html, base_url)
                _merge(result, data)
                if _is_complete(result):
                    break
            time.sleep(0.2)

    return result


def _merge(base: dict, new: dict) -> None:
    for e in new.get('emails', []):
        if e not in base['emails']:
            base['emails'].append(e)
    for p in new.get('phones', []):
        if p not in base['phones']:
            base['phones'].append(p)
    for f in ('phone_fmt', 'whatsapp', 'instagram', 'facebook'):
        if not base.get(f) and new.get(f):
            base[f] = new[f]


def _is_complete(data: dict) -> bool:
    return bool(
        (data.get('emails') or data.get('phones') or data.get('whatsapp'))
        and (data.get('instagram') or data.get('facebook'))
    )


def ddg_search(query: str, max_results: int = 10) -> list[dict]:
    """Busca no DuckDuckGo e retorna resultados."""
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results, region='br-pt'))
    except Exception as e:
        print(f'[search_google] DDG erro: {e}', file=sys.stderr)
        return []


def search(niche: str, city: str, state: str, max_results: int = 40) -> list[dict]:
    """Busca leads via DuckDuckGo + visita sites para extrair contatos."""
    print(f'[search_google] Buscando {niche} em {city}/{state}', file=sys.stderr)

    found_urls: list[tuple[str, str]] = []  # (url, name)
    queries = [
        f'"{niche}" "{city}" contato telefone WhatsApp',
        f'"{niche}" site {city} {state} Brasil',
        f'{niche} {city} {state} site:*.com.br',
    ]

    for query in queries:
        results = ddg_search(query, max_results=15)
        for r in results:
            url  = r.get('href', '') or r.get('url', '')
            name = r.get('title', '').split(' - ')[0].split(' | ')[0].strip()
            if url and not should_skip(url) and url not in [u for u, _ in found_urls]:
                found_urls.append((url, name))
        time.sleep(1)

    print(f'[search_google] {len(found_urls)} sites para visitar', file=sys.stderr)

    leads = []
    seen_phones = set()
    seen_insta  = set()

    for url, name in found_urls[:max_results]:
        print(f'[search_google] Visitando: {url}', file=sys.stderr)
        contacts = enrich_website(url)

        # Deduplica por telefone ou instagram
        phone = contacts.get('phones', [None])[0] or ''
        insta = contacts.get('instagram', '')
        key = phone or insta or url
        if key in seen_phones:
            continue
        seen_phones.add(key)

        lead = lead_to_dict(
            name=name or url,
            niche=niche,
            city=city,
            state=state,
            phone=contacts.get('phone_fmt', ''),
            email=contacts.get('emails', [''])[0] if contacts.get('emails') else '',
            website=url,
            instagram=insta,
            facebook=contacts.get('facebook', ''),
            whatsapp=contacts.get('whatsapp', ''),
            source='google_search_python',
        )
        leads.append(lead)
        time.sleep(0.5)

    print(f'[search_google] {len(leads)} leads gerados', file=sys.stderr)
    return leads


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--niche',  required=True)
    parser.add_argument('--city',   required=True)
    parser.add_argument('--state',  required=True)
    parser.add_argument('--max',    type=int, default=40)
    args = parser.parse_args()

    leads = search(args.niche, args.city, args.state, args.max)
    print(json.dumps(leads, ensure_ascii=False))


if __name__ == '__main__':
    main()