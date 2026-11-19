import { cifrarComAad, decifrar, decifrarComAad } from "./cripto.ts";

/**
 * O LOGIN DA CENTI — a parte PURA (testada em `tests/centi-login.test.ts`): o formato do que é cifrado, o dono amarrado
 * como dado adicional e a leitura do formato antigo (as preferências, antes da migração `0195`).
 */
export type LoginCenti = { usuario: string; senha: string; auto: boolean };

/** O propósito da chave derivada da mestra (HKDF): só este cofre usa esta chave. */
export const PROPOSITO_LOGIN_CENTI = "pca/centi-login/v2";

/** O dado adicional: o blob só abre na linha da MESMA pessoa. */
export const aadLoginCenti = (usuarioId: number) => `centi-login:u${usuarioId}`;

export const cifrarLoginCenti = (chave: Uint8Array, usuarioId: number, l: Pick<LoginCenti, "usuario" | "senha">) =>
  cifrarComAad(chave, JSON.stringify({ usuario: l.usuario, senha: l.senha }), aadLoginCenti(usuarioId));

function lerJson(claro: string | null): { usuario: string; senha: string; auto?: boolean } | null {
  if (!claro) return null;
  try {
    const j = JSON.parse(claro) as { usuario?: unknown; senha?: unknown; auto?: unknown };
    return typeof j.usuario === "string" && typeof j.senha === "string" && j.usuario && j.senha
      ? { usuario: j.usuario, senha: j.senha, ...(typeof j.auto === "boolean" ? { auto: j.auto } : {}) }
      : null;
  } catch {
    return null;
  }
}

/**
 * Abre o blob: o formato novo ("v2:", com o dono) pela chave derivada; o ANTIGO (o `cifrarSegredo` das preferências)
 * pela chave dos segredos — `legado` avisa que deve ser regravado no novo. `null` = não abre (outro dono, chave errada).
 */
export async function abrirLoginCenti(
  chave: Uint8Array,
  chaveLegada: Uint8Array,
  usuarioId: number,
  blob: string,
): Promise<{ usuario: string; senha: string; auto?: boolean; legado: boolean } | null> {
  if (blob.startsWith("v2:")) {
    const j = lerJson(await decifrarComAad(chave, blob, aadLoginCenti(usuarioId)));
    return j ? { ...j, legado: false } : null;
  }
  const j = lerJson(await decifrar(chaveLegada, blob));
  return j ? { ...j, legado: true } : null;
}

/** O usuário à vista na tela: só o começo ("jo•••"). */
export function mascararUsuario(u: string): string {
  const t = u.trim();
  if (!t) return "";
  return `${t.slice(0, Math.min(2, Math.max(1, t.length - 2)))}•••`;
}

/**
 * O pedido veio da EXTENSÃO? O `Origin` dela (`chrome-extension://<id fixo>`) — página nenhuma o imita. Um pedido de
 * ESCRITA (POST/PUT) SEM `Origin` também vale: o navegador SEMPRE põe o `Origin` da página num POST/PUT, então nenhuma
 * página manda assim (e o `Sec-Fetch-Site`, quando vem, tem de ser "none" — nunca o de uma página). Um GET nunca vale: num
 * GET o navegador não põe o `Origin` nem para a extensão nem para a página do sistema — não dá para separar as duas.
 */
export function pedidoDaExtensao(metodo: string, origem: string | null, secFetchSite: string | null, extensao: string): boolean {
  if (origem) return origem === extensao;
  const m = metodo.toUpperCase();
  if (m === "GET" || m === "HEAD") return false;
  return !secFetchSite || secFetchSite === "none";
}

// ---------------------------------------------------------------- A ENTREGA SELADA À EXTENSÃO
// A senha NUNCA sai do servidor em claro: ela vai SELADA à chave da extensão que pediu. A extensão gera um par ECDH P-256
// com a parte privada NÃO EXTRAÍVEL (fica no IndexedDB dela) e manda a pública no pedido. Na entrega, o servidor cria um
// par efêmero, deriva o segredo (ECDH → HKDF-SHA256) e cifra com AES-GCM, com a impressão da chave como dado adicional:
// só aquela extensão abre o pacote.

export const SAL_ENTREGA = "pca/centi-entrega/v1";
export const aadEntrega = (impressao: string) => `centi-entrega:${impressao}`;
export type Selado = { epk: string; iv: string; ct: string };

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (u: ArrayBuffer) => [...new Uint8Array(u)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A chave pública da extensão (base64 do ponto P-256 sem compressão: 65 bytes começando em 0x04) → a IMPRESSÃO (SHA-256
 * hex). `null` = não é uma chave P-256 válida. */
export async function impressaoDaChave(publica: string): Promise<string | null> {
  try {
    const raw = deB64(publica);
    if (raw.length !== 65 || raw[0] !== 4) return null;
    await crypto.subtle.importKey("raw", raw as BufferSource, { name: "ECDH", namedCurve: "P-256" }, true, []);
    return hex(await crypto.subtle.digest("SHA-256", raw as BufferSource));
  } catch {
    return null;
  }
}

async function chaveDaEntrega(segredo: ArrayBuffer, impressao: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", segredo, "HKDF", false, ["deriveKey"]);
  const enc = new TextEncoder();
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(SAL_ENTREGA) as BufferSource, info: enc.encode(aadEntrega(impressao)) as BufferSource },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Sela `texto` para a chave pública da extensão (o lado do SERVIDOR). */
export async function selarParaChave(publica: string, impressao: string, texto: string): Promise<Selado> {
  const destino = await crypto.subtle.importKey("raw", deB64(publica) as BufferSource, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const efemera = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const segredo = await crypto.subtle.deriveBits({ name: "ECDH", public: destino } as EcdhKeyDeriveParams, efemera.privateKey, 256);
  const k = await chaveDaEntrega(segredo, impressao);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: new TextEncoder().encode(aadEntrega(impressao)) as BufferSource },
    k,
    new TextEncoder().encode(texto),
  );
  return { epk: b64(new Uint8Array(await crypto.subtle.exportKey("raw", efemera.publicKey))), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

/** Abre o pacote com a chave PRIVADA (o lado da EXTENSÃO — a mesma conta de `background.js`, aqui para os testes). */
export async function abrirSelado(privada: CryptoKey, impressao: string, s: Selado): Promise<string | null> {
  try {
    const epk = await crypto.subtle.importKey("raw", deB64(s.epk) as BufferSource, { name: "ECDH", namedCurve: "P-256" }, true, []);
    const segredo = await crypto.subtle.deriveBits({ name: "ECDH", public: epk } as EcdhKeyDeriveParams, privada, 256);
    const k = await chaveDaEntrega(segredo, impressao);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: deB64(s.iv) as BufferSource, additionalData: new TextEncoder().encode(aadEntrega(impressao)) as BufferSource },
      k,
      deB64(s.ct) as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** O motivo da PAUSA é um código fixo (nunca o texto da Centi, que pode trazer o usuário). */
export const MOTIVO_PAUSA = {
  recusado: "A Centi recusou o usuário ou a senha — confira e salve de novo.",
  verificacao: "A Centi pediu uma verificação (captcha, código ou troca de senha) — entre à mão na aba da automação e salve de novo.",
} as const;
export type CodigoPausa = keyof typeof MOTIVO_PAUSA;
