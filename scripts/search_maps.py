"""
search_maps.py — Busca negócios via OpenStreetMap (Overpass API).
100% gratuito, sem API key, sem billing.

Uso:
  python search_maps.py --niche "barbearia" --city "São Paulo" --state "SP" --max 60
"""

import argparse
import json
import sys
import time
from typing import Optional
import requests
from utils import (
    validate_phone, build_whatsapp, format_phone,
    validate_email, lead_to_dict, normalize
)

OVERPASS_URL  = 'https://overpass-api.de/api/interpreter'
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

HEADERS = {
    'User-Agent': 'AxLead-ScraperBot/1.0 (lead generation research)',
    'Accept-Language': 'pt-BR,pt;q=0.9',
}

NICHE_TAGS: dict[str, list[tuple[str, str]]] = {
    'barbearia':        [('shop', 'hairdresser'), ('amenity', 'barbers')],
    'salão de beleza':  [('shop', 'hairdresser'), ('shop', 'beauty')],
    'clínica estética': [('amenity', 'beauty_salon'), ('shop', 'beauty')],
    'pet shop':         [('shop', 'pet'), ('amenity', 'veterinary')],
    'academia':         [('leisure', 'fitness_centre')],
    'odontologia':      [('amenity', 'dentist')],
    'fisioterapia':     [('amenity', 'physiotherapist')],
    'restaurante':      [('amenity', 'restaurant'), ('amenity', 'fast_food')],
    'padaria':          [('shop', 'bakery')],
    'farmácia':         [('amenity', 'pharmacy')],
    'supermercado':     [('shop', 'supermarket')],
    'oficina':          [('shop', 'car_repair')],
    'imobiliária':      [('amenity', 'real_estate_agent')],
    'escola':           [('amenity', 'school')],
    'médico':           [('amenity', 'clinic'), ('amenity', 'doctors')],
    'psicologia':       [('healthcare', 'psychologist')],
    'advocacia':        [('office', 'lawyer')],
    'contabilidade':    [('office', 'accountant')],
}


def get_tags(niche: str) -> list[tuple[str, str]]:
    niche_lower = niche.lower()
    for key, tags in NICHE_TAGS.items():
        if key in niche_lower or niche_lower in key:
            return tags
    return [('name', niche)]


def get_bbox(city: str, state: str) -> Optional[tuple]:
    try:
        r = requests.get(NOMINATIM_URL, params={
            'q': f'{city}, {state}, Brasil',
            'format': 'json', 'limit': 1,
        }, headers=HEADERS, timeout=10)
        data = r.json()
        if data:
            b = data[0].get('boundingbox', [])
            if len(b) == 4:
                return (float(b[0]), float(b[2]), float(b[1]), float(b[3]))
    except Exception as e:
        print(f'[search_maps] bbox erro: {e}', file=sys.stderr)
    return None


def overpass_query(tags: list, bbox: tuple) -> str:
    s, w, n, e = bbox
    bb = f'{s},{w},{n},{e}'
    parts = []
    for k, v in tags:
        if v == 'yes':
            parts += [f'node["{k}"]({bb});', f'way["{k}"]({bb});']
        else:
            parts += [f'node["{k}"="{v}"]({bb});', f'way["{k}"="{v}"]({bb});']
    return f'[out:json][timeout:60];\n(\n{"".join(parts)}\n);\nout body center;\n'


def parse_element(el: dict, niche: str, city: str, state: str) -> Optional[dict]:
    tags = el.get('tags', {})
    name = tags.get('name') or tags.get('brand') or ''
    if not name:
        return None

    phone_raw = tags.get('phone') or tags.get('contact:phone') or tags.get('contact:mobile') or ''
    phone_d = validate_phone(phone_raw) or ''
    phone   = format_phone(phone_d) if phone_d else ''
    whatsapp = tags.get('contact:whatsapp') or tags.get('whatsapp') or build_whatsapp(phone_d) or ''

    website  = tags.get('website') or tags.get('contact:website') or tags.get('url') or ''
    email_r  = tags.get('email') or tags.get('contact:email') or ''
    email    = validate_email(email_r) or ''

    ig_raw = tags.get('contact:instagram') or tags.get('instagram') or ''
    if ig_raw:
        handle = ig_raw.lstrip('@').strip('/')
        instagram = f'https://www.instagram.com/{handle}' if '/' not in handle else ig_raw
    else:
        instagram = ''

    facebook = tags.get('contact:facebook') or tags.get('facebook') or ''

    addr = ', '.join(filter(None, [
        tags.get('addr:street',''), tags.get('addr:housenumber',''),
        tags.get('addr:suburb',''), tags.get('addr:city',''),
    ]))

    return lead_to_dict(
        name=name, niche=niche,
        city=tags.get('addr:city') or city,
        state=tags.get('addr:state') or state,
        phone=phone, email=email, address=addr,
        website=website, instagram=instagram,
        facebook=facebook, whatsapp=whatsapp,
        category=tags.get('amenity') or tags.get('shop') or tags.get('office') or niche,
        source='openstreetmap',
    )


def search(niche: str, city: str, state: str, api_key: str = '', max_results: int = 60) -> list[dict]:
    print(f'[search_maps] OpenStreetMap: {niche} em {city}/{state}', file=sys.stderr)

    bbox = get_bbox(city, state)
    if not bbox:
        print('[search_maps] Bbox não encontrada', file=sys.stderr)
        return []
    time.sleep(1)

    tags = get_tags(niche)
    query = overpass_query(tags, bbox)

    try:
        r = requests.post(OVERPASS_URL, data={'data': query}, headers=HEADERS, timeout=60)
        elements = r.json().get('elements', [])
        print(f'[search_maps] {len(elements)} elementos OSM', file=sys.stderr)
    except Exception as e:
        print(f'[search_maps] Overpass erro: {e}', file=sys.stderr)
        return []

    leads = []
    seen: set[str] = set()
    for el in elements:
        lead = parse_element(el, niche, city, state)
        if not lead:
            continue
        key = normalize(lead['name'])
        if key in seen:
            continue
        seen.add(key)
        leads.append(lead)
        if len(leads) >= max_results:
            break

    print(f'[search_maps] {len(leads)} leads em {city}/{state}', file=sys.stderr)
    return leads


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--niche',  required=True)
    parser.add_argument('--city',   required=True)
    parser.add_argument('--state',  required=True)
    parser.add_argument('--key',    default='')
    parser.add_argument('--max',    type=int, default=60)
    args = parser.parse_args()
    leads = search(args.niche, args.city, args.state, args.key, args.max)
    print(json.dumps(leads, ensure_ascii=False))


if __name__ == '__main__':
    main()