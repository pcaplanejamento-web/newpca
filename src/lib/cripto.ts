import { fromHex, toHex } from "./password.ts";

/**
 * Cifra simétrica AES-GCM para os SEGREDOS das integrações (API keys, tokens).
 * 100% Web Crypto, SEM env/DB → puro e testável (recebe a CHAVE em bytes). O wrapper
 * que lê a chave mestra do ambiente fica em `integracoes-segredos.ts`.
 *
 * Formato do blob cifrado: "<ivHex>:<ctHex>" (IV aleatório de 12 bytes por operação).
 */

const IV_BYTES = 12; // nonce padrão do AES-GCM
const enc = new TextEncoder();
const dec = new TextDecoder();

async function importarChave(chaveBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", chaveBytes as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Deriva uma chave AES de 32 bytes a partir de qualquer string mestra (SHA-256). */
export async function chaveDeSegredo(mestra: string): Promise<Uint8Array> {
  const bits = await crypto.subtle.digest("SHA-256", enc.encode(mestra));
  return new Uint8Array(bits);
}

/** Cifra `texto` com AES-GCM. Devolve "<ivHex>:<ctHex>". */
export async function cifrar(chaveBytes: Uint8Array, texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await importarChave(chaveBytes);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(texto));
  return `${toHex(iv)}:${toHex(new Uint8Array(ct))}`;
}

/** Decifra um blob "<ivHex>:<ctHex>". Devolve `null` em qualquer erro (blob corrompido, chave errada). */
export async function decifrar(chaveBytes: Uint8Array, blob: string): Promise<string | null> {
  try {
    const [ivHex, ctHex] = String(blob).split(":");
    if (!ivHex || !ctHex) return null;
    const key = await importarChave(chaveBytes);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromHex(ivHex) as BufferSource },
      key,
      fromHex(ctHex) as BufferSource,
    );
    return dec.decode(pt);
  } catch {
    return null;
  }
}
