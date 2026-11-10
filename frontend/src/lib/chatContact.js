const phoneWords = /\b(?:zero|um|uma|dois|duas|tres|quatro|cinco|seis|meia|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)\b/g;
export const contactNotice = "Mantenha a conversa no ServiçoJá. Telefones e convites para WhatsApp são bloqueados.";
export function hasContact(value) {
  const plain = String(value || "").normalize("NFKD").replace(/[\u0300-\u036f\u200b-\u200d]/g, "").toLowerCase();
  const compact = plain.replace(/[^a-z0-9@./]/g, "");
  if (/(?:wh[a@]ts(?:app)?|wats(?:app)?|zapzap|chama(?:me)?(?:no|pelo)?zap|wa\.?me/|api\.whatsapp|meu(?:telefone|celular|numero)|(?:me)?passa(?:seu|teu)(?:telefone|celular|numero))/.test(compact) || /\bzap\b/.test(plain)) return true;
  const digits = plain
    .replace(/\b(?:[0-3]?\d\/[01]?\d\/\d{4}|\d{4}-[01]\d-[0-3]\d)\b/g, " data ")
    .replace(/\b(?:dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)\b/g, "##")
    .replace(phoneWords, "#");
  return /(?:[\d#][\s().,+/–—-]*(?:e\s+)?){8}/.test(digits);
}
