"""
search_instagram.py — Busca perfis reais do Instagram via DuckDuckGo.
Sem API key — 100% gratuito.

Uso:
  python search_instagram.py --niche "barbearia" --city "São Paulo" --state "SP"
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
    extract_emails, extract_phones, build_whatsapp, format_phone,
    extract_whatsapp_link, lead_to_dict, validate_phone
)

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept-Language': 'pt-BR,pt;q=0.9',
}

VALID_USERNAME_RE = re.compile(r'^[a-zA-Z0-9._]{2,30}$')
SKIP_HANDLES = {'p', 'reel', 'explore', 'stories', 'tv', 'accounts', 'instagram'}


def is_valid_username(username: str) -> bool:
    """Valida se é um @ real do Instagram."""
    if not username or not VALID_USERNAME_RE.match(username):
        return False
    if '..' in username or username.startswith('.') or username.endswith('.'):
        return False
    if re.match(r'^[0-9]+$', username):  # só números
        return False
    if re.match(r'^[a-z]{1,2}[0-9]{6,}', username):  # hash tipo ab123456
        return False
    if len(re.findall(r'[a-zA-Z]', username)) < 2:  # menos de 2 letras
        return False
    if username in SKIP_HANDLES:
        return False
    return True


def extract_username_from_url(url: str) -> Optional[str]:
    """Extrai o @ de uma URL do Instagram."""
    m = re.search(r'instagram\.com/([a-zA-Z0-9._]+)/?', url)
    if m:
        handle = m.group(1)
        return handle if is_valid_username(handle) else None
    return None


def fetch_instagram_profile(username: str) -> dict:
    """Tenta extrair dados do perfil público do Instagram."""
    url = f'https://www.instagram.com/{username}/'
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return {}
        html = r.text

        # Extrai bio (geralmente em meta tags)
        soup = BeautifulSoup(html, 'html.parser')

        bio = ''
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc:
            bio = meta_desc.get('content', '')

        # Extrai dados da bio
        phones = extract_phones(bio)
        emails = extract_emails(bio)
        wa_link = extract_whatsapp_link(bio)

        # Tenta extrair link externo (site)
        website = ''
        m = re.search(r'"external_url":"([^"]+)"', html)
        if m:
            website = m.group(1)

        # Tenta nome completo
        full_name = ''
        m = re.search(r'"full_name":"([^"]+)"', html)
        if m:
            full_name = m.group(1)

        # Número de seguidores (indicador de relevância)
        followers = ''
        m = re.search(r'"edge_followed_by":\{"count":(\d+)\}', html)
        if m:
            followers = m.group(1)

        phone_fmt = format_phone(phones[0]) if phones else ''
        whatsapp = wa_link or (build_whatsapp(phones[0]) if phones else '') or ''

        return {
            'full_name': full_name,
            'bio': bio,
            'website': website,
            'phone': phone_fmt,
            'email': emails[0] if emails else '',
            'whatsapp': whatsapp,
            'followers': followers,
        }
    except Exception as e:
        print(f'[search_instagram] Erro ao buscar @{username}: {e}', file=sys.stderr)
        return {}


def search_ddg_instagram(niche: str, city: str) -> list[str]:
    """Busca perfis do Instagram via DuckDuckGo."""
    usernames = set()
    queries = [
        f'site:instagram.com "{niche}" "{city}"',
        f'site:instagram.com {niche} {city} barbearia',
        f'instagram.com {niche} {city} Brasil',
    ]

    for query in queries:
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=20, region='br-pt'))

            for r in results:
                url = r.get('href', '') or r.get('url', '')
                username = extract_username_from_url(url)
                if username:
                    usernames.add(username)

                # Tenta extrair @ do snippet
                snippet = r.get('body', '') + ' ' + r.get('title', '')
                for m in re.finditer(r'@([a-zA-Z0-9._]{2,30})', snippet):
                    handle = m.group(1)
                    if is_valid_username(handle):
                        usernames.add(handle)

            time.sleep(1)  # Rate limit
        except Exception as e:
            print(f'[search_instagram] DDG erro: {e}', file=sys.stderr)

    return list(usernames)


def search(niche: str, city: str, state: str, max_results: int = 30) -> list[dict]:
    """Busca perfis reais do Instagram para nicho + cidade."""
    print(f'[search_instagram] Buscando @s reais para {niche} em {city}/{state}', file=sys.stderr)

    usernames = search_ddg_instagram(niche, city)
    print(f'[search_instagram] {len(usernames)} perfis encontrados via DDG', file=sys.stderr)

    leads = []
    for username in list(usernames)[:max_results]:
        profile = fetch_instagram_profile(username)

        name = profile.get('full_name') or f'@{username}'

        lead = lead_to_dict(
            name=name,
            niche=niche,
            city=city,
            state=state,
            phone=profile.get('phone', ''),
            email=profile.get('email', ''),
            website=profile.get('website', ''),
            instagram=f'https://www.instagram.com/{username}',
            whatsapp=profile.get('whatsapp', ''),
            rating=profile.get('followers', ''),
            source='instagram_python',
        )
        leads.append(lead)
        time.sleep(0.5)  # Rate limit

    print(f'[search_instagram] {len(leads)} leads gerados', file=sys.stderr)
    return leads


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--niche',  required=True)
    parser.add_argument('--city',   required=True)
    parser.add_argument('--state',  required=True)
    parser.add_argument('--max',    type=int, default=30)
    args = parser.parse_args()

    leads = search(args.niche, args.city, args.state, args.max)
    print(json.dumps(leads, ensure_ascii=False))


if __name__ == '__main__':
    main()