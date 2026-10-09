/**
 * Núcleo PURO do DESCADASTRO por e-mail (sem env → testável): o link "Parar de receber este aviso" leva a pessoa, o tipo
 * e uma ASSINATURA (HMAC-SHA256 com a chave mestra do Worker) — ninguém descadastra outra pessoa trocando o número.
 * `tipo = "todos"` = desliga todos os e-mails desligáveis (o resumo diário).
 */

const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function assinarDescadastro(chave: string, usuarioId: number, tipo: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(`descadastro:${chave}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${usuarioId}:${tipo}`))).slice(0, 32);
}

/** A assinatura confere (comparação em tempo constante)? */
export async function descadastroValido(chave: string, usuarioId: number, tipo: string, assinatura: string): Promise<boolean> {
  const certa = await assinarDescadastro(chave, usuarioId, tipo);
  if (certa.length !== assinatura.length) return false;
  let dif = 0;
  for (let i = 0; i < certa.length; i++) dif |= certa.charCodeAt(i) ^ assinatura.charCodeAt(i);
  return dif === 0;
}

/** O caminho do descadastro (o link absoluto é montado com o endereço do sistema). */
export const caminhoDescadastro = (usuarioId: number, tipo: string, assinatura: string) =>
  `/api/notificacoes/descadastro?u=${usuarioId}&t=${encodeURIComponent(tipo)}&s=${encodeURIComponent(assinatura)}`;
