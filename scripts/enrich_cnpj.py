"""
enrich_cnpj.py — Busca e enriquece leads via BrasilAPI (CNPJ).
100% gratuito, sem API key.

Uso:
  python enrich_cnpj.py --niche "barbearia" --city "São Paulo" --state "SP"
  python enrich_cnpj.py --cnpj "12345678000195"  # CNPJ específico
"""

import argparse
import json
import sys
import time
from typing import Optional
import requests
from utils import validate_phone, build_whatsapp, format_phone, validate_email, lead_to_dict

BRASILAPI_CNPJ = 'https://brasilapi.com.br/api/cnpj/v1/{}'
BRASILAPI_SEARCH = 'https://brasilapi.com.br/api/cnpj/v1/search'

# CNAEs relacionados a cada nicho (principais)
NICHE_CNAES: dict[str, list[str]] = {
    'barbearia':          ['9602502', '9602501'],
    'salão de beleza':    ['9602501', '9602502'],
    'clínica estética':   ['8690901', '8690999'],
    'pet shop':           ['4789004', '7500100'],
    'academia':           ['9313100'],
    'odontologia':        ['8630508'],
    'fisioterapia':       ['8650004'],
    'advocacia':          ['6911701'],
    'contabilidade':      ['6920601'],
    'restaurante':        ['5611201', '5611202', '5611203'],
    'padaria':            ['1091101'],
    'farmácia':           ['4771701'],
    'supermercado':       ['4711301', '4711302'],
    'auto peças':         ['4530701'],
    'oficina':            ['4520001', '4520002'],
    'imobiliária':        ['6821801'],
    'escola':             ['8513900', '8520100'],
    'médico':             ['8610101'],
    'psicologia':         ['8650005'],
    'nutrição':           ['8650006'],
}


def get_cnae_for_niche(niche: str) -> list[str]:
    """Retorna CNAEs relevantes para um nicho."""
    niche_lower = niche.lower()
    for key, cnaes in NICHE_CNAES.items():
        if key in niche_lower or niche_lower in key:
            return cnaes
    return []


def fetch_by_cnpj(cnpj: str) -> Optional[dict]:
    """Busca dados de um CNPJ específico."""
    digits = ''.join(c for c in cnpj if c.isdigit())
    if len(digits) != 14:
        return None
    try:
        r = requests.get(BRASILAPI_CNPJ.format(digits), timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f'[enrich_cnpj] Erro CNPJ {digits}: {e}', file=sys.stderr)
    return None


def parse_cnpj_result(data: dict, niche: str) -> Optional[dict]:
    """Converte resultado da BrasilAPI em lead padronizado."""
    if not data or data.get('situacao_cadastral') != 'ATIVA':
        return None

    name = data.get('nome_fantasia') or data.get('razao_social', '')
    if not name:
        return None

    # Endereço
    parts = [
        data.get('logradouro', ''), data.get('numero', ''),
        data.get('bairro', ''), data.get('municipio', ''),
        data.get('uf', ''),
    ]
    address = ', '.join(p for p in parts if p)
    city  = data.get('municipio', '').title()
    state = data.get('uf', '').upper()

    # Telefone
    tel_raw  = data.get('ddd_telefone_1', '') + data.get('telefone_1', '')
    tel2_raw = data.get('ddd_telefone_2', '') + data.get('telefone_2', '')
    phone_digits = validate_phone(tel_raw) or validate_phone(tel2_raw) or ''
    phone_fmt = format_phone(phone_digits) if phone_digits else ''
    whatsapp  = build_whatsapp(phone_digits) or ''

    # Email
    email_raw = data.get('email', '')
    email = validate_email(email_raw) or ''

    return lead_to_dict(
        name=name.title(),
        niche=niche,
        city=city,
        state=state,
        phone=phone_fmt,
        email=email,
        address=address,
        whatsapp=whatsapp,
        category=data.get('cnae_fiscal_descricao', niche),
        source='cnpj_brasilapi',
    )


def search_by_city_niche(niche: str, city: str, state: str, max_results: int = 50) -> list[dict]:
    """
    Busca CNPJs ativos de um nicho em uma cidade via BrasilAPI.
    Usa CNAEs mapeados para cada nicho.
    """
    cnaes = get_cnae_for_niche(niche)
    if not cnaes:
        print(f'[enrich_cnpj] Sem CNAE mapeado para nicho: {niche}', file=sys.stderr)
        return []

    print(f'[enrich_cnpj] Buscando CNPJs para {niche} em {city}/{state}', file=sys.stderr)
    leads = []
    seen  = set()

    for cnae in cnaes:
        try:
            r = requests.get(BRASILAPI_SEARCH, params={
                'cnae': cnae,
                'municipio': city.upper(),
                'uf': state.upper(),
                'situacao_cadastral': 'ATIVA',
            }, timeout=15)

            if r.status_code != 200:
                continue

            results = r.json()
            if not isinstance(results, list):
                continue

            for item in results[:max_results]:
                cnpj = item.get('cnpj', '')
                if cnpj in seen:
                    continue
                seen.add(cnpj)

                # Busca detalhes completos
                details = fetch_by_cnpj(cnpj)
                if details:
                    lead = parse_cnpj_result(details, niche)
                    if lead:
                        lead['cnpj'] = cnpj
                        leads.append(lead)
                time.sleep(0.2)

        except Exception as e:
            print(f'[enrich_cnpj] Erro CNAE {cnae}: {e}', file=sys.stderr)

        if len(leads) >= max_results:
            break

    print(f'[enrich_cnpj] {len(leads)} leads via CNPJ', file=sys.stderr)
    return leads


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--niche',  default='')
    parser.add_argument('--city',   default='')
    parser.add_argument('--state',  default='')
    parser.add_argument('--cnpj',   default='', help='CNPJ específico para enriquecer')
    parser.add_argument('--max',    type=int, default=50)
    args = parser.parse_args()

    if args.cnpj:
        data = fetch_by_cnpj(args.cnpj)
        lead = parse_cnpj_result(data, args.niche or 'negócio') if data else None
        print(json.dumps([lead] if lead else [], ensure_ascii=False))
    else:
        if not args.niche or not args.city or not args.state:
            print('Erro: --niche, --city e --state são obrigatórios', file=sys.stderr)
            sys.exit(1)
        leads = search_by_city_niche(args.niche, args.city, args.state, args.max)
        print(json.dumps(leads, ensure_ascii=False))


if __name__ == '__main__':
    main()