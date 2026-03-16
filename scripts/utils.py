"""
utils.py — Funções utilitárias compartilhadas pelos scripts de busca.
"""

import re
import unicodedata
from typing import Optional

# DDDs válidos no Brasil
VALID_DDDS = {
    11,12,13,14,15,16,17,18,19,
    21,22,24,27,28,
    31,32,33,34,35,37,38,
    41,42,43,44,45,46,47,48,49,
    51,53,54,55,
    61,62,63,64,65,66,67,68,69,
    71,73,74,75,77,79,
    81,82,83,84,85,86,87,88,89,
    91,92,93,94,95,96,97,98,99,
}

BLOCKED_EMAIL_DOMAINS = {
    'example.com', 'seudominio.com', 'email.com', 'domain.com',
    'wixpress.com', 'wordpress.com', 'squarespace.com', 'wix.com',
    'tempmail.com', 'mailinator.com', 'guerrillamail.com',
}

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}


def normalize(s: str) -> str:
    """Remove acentos e normaliza para comparação."""
    if not s:
        return ''
    nfkd = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in nfkd if not unicodedata.combining(c)).strip()


def validate_email(email: str) -> Optional[str]:
    """Valida e limpa email."""
    if not email:
        return None
    low = email.lower().strip()
    if not re.match(r'^[\w._%+\-]+@[\w.\-]+\.[a-z]{2,}$', low):
        return None
    domain = low.split('@')[-1]
    if domain in BLOCKED_EMAIL_DOMAINS:
        return None
    if len(low) > 80:
        return None
    return low


def validate_phone(phone: str) -> Optional[str]:
    """Valida telefone BR — retorna dígitos limpos ou None."""
    if not phone:
        return None
    digits = re.sub(r'\D', '', phone)
    # Remove prefixo 55
    if digits.startswith('55') and len(digits) > 11:
        digits = digits[2:]
    if len(digits) not in (10, 11):
        return None
    ddd = int(digits[:2])
    if ddd not in VALID_DDDS:
        return None
    return digits


def is_mobile_phone(phone: str) -> bool:
    """Verifica se é celular BR (11 dígitos, começa com 9)."""
    digits = validate_phone(phone)
    if not digits:
        return False
    return len(digits) == 11 and digits[2] == '9'


def build_whatsapp(phone: str) -> Optional[str]:
    """Gera link WhatsApp apenas para celular válido."""
    digits = validate_phone(phone)
    if not digits or not is_mobile_phone(digits):
        return None
    return f'https://wa.me/55{digits}'


def format_phone(digits: str) -> str:
    """Formata dígitos de telefone BR."""
    if len(digits) == 11:
        return f'({digits[:2]}) {digits[2:7]}-{digits[7:]}'
    return f'({digits[:2]}) {digits[2:6]}-{digits[6:]}'


def extract_emails(text: str) -> list[str]:
    """Extrai emails válidos de um texto."""
    found = re.findall(r'[\w._%+\-]+@[\w.\-]+\.[a-z]{2,}', text, re.IGNORECASE)
    return [e for e in (validate_email(m) for m in found) if e]


def extract_phones(text: str) -> list[str]:
    """Extrai telefones válidos de um texto."""
    raw = re.findall(r'(?:\+?55\s?)?(?:\(?\d{2}\)?[\s\-]?)(?:9\s?\d{4}|\d{4})[\s\-]?\d{4}', text)
    return [d for d in (validate_phone(p) for p in raw) if d]


def extract_instagram(text: str) -> Optional[str]:
    """Extrai URL de perfil Instagram."""
    SKIP = {'p', 'reel', 'explore', 'stories', 'tv', 'accounts'}
    m = re.search(r'instagram\.com/([a-zA-Z0-9._]{2,30})/?', text)
    if m and m.group(1) not in SKIP:
        handle = m.group(1)
        if not re.match(r'^[0-9]+$', handle) and len(re.findall(r'[a-zA-Z]', handle)) >= 2:
            return f'https://www.instagram.com/{handle}'
    return None


def extract_whatsapp_link(text: str) -> Optional[str]:
    """Extrai link wa.me ou whatsapp.com de um texto."""
    m = re.search(r'https?://(wa\.me/\d+[^\s"\'<>]*|api\.whatsapp\.com/send[^\s"\'<>]*)', text, re.IGNORECASE)
    return m.group(0) if m else None


def lead_to_dict(
    name: str,
    niche: str,
    city: str,
    state: str,
    phone: str = '',
    email: str = '',
    address: str = '',
    website: str = '',
    instagram: str = '',
    facebook: str = '',
    linkedin: str = '',
    whatsapp: str = '',
    rating: str = '',
    reviews: str = '',
    category: str = '',
    source: str = 'python_script',
) -> dict:
    """Retorna dicionário de lead no formato padrão da aplicação."""
    # Gera WhatsApp se não tiver link mas tiver celular
    if not whatsapp and phone:
        whatsapp = build_whatsapp(phone) or ''

    return {
        'name': name.strip(),
        'niche': niche,
        'city': city,
        'state': state,
        'phone': phone,
        'email': email,
        'address': address,
        'website': website,
        'instagram': instagram,
        'facebook': facebook,
        'linkedin': linkedin,
        'whatsapp': whatsapp,
        'rating': rating,
        'reviews': reviews,
        'category': category or niche,
        'source': source,
        'priority': 'normal' if website else 'high',
        'scrapedAt': '',  # preenchido pelo runner
    }