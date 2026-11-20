import re
import unicodedata


def has_contact(value):
    plain = ''.join(c for c in unicodedata.normalize('NFKD', value.lower()) if not unicodedata.combining(c) and c not in '\u200b\u200c\u200d')
    compact = re.sub(r'[^a-z0-9@./]', '', plain)
    if re.search(r'(?:wh[a@]ts(?:app)?|wats(?:app)?|zapzap|chama(?:me)?(?:no|pelo)?zap|wa\.?me/|api\.whatsapp|meu(?:telefone|celular|numero)|(?:me)?passa(?:seu|teu)(?:telefone|celular|numero))', compact) or re.search(r'\bzap\b', plain):
        return True
    plain = re.sub(r'\b(?:[0-3]?\d/[01]?\d/\d{4}|\d{4}-[01]\d-[0-3]\d)\b', ' data ', plain)
    plain = re.sub(r'\b(?:dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)\b', '##', plain)
    digits = re.sub(r'\b(?:zero|um|uma|dois|duas|tres|quatro|cinco|seis|meia|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)\b', '#', plain)
    return bool(re.search(r'(?:[\d#][\s().,+/–—-]*(?:e\s+)?){8}', digits))
