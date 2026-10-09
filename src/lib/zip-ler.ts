// LER um ZIP (núcleo puro, testado): a Centi pode entregar os documentos de um protocolo num .zip. Lê o diretório central
// (sem ZIP64), devolve as entradas e descomprime STORE (0) e DEFLATE (8 — o `DecompressionStream` do navegador/Node).

export type EntradaZip = { nome: string; metodo: number; dados: Uint8Array };

export const ehZip = (b: Uint8Array | null | undefined) => !!b && b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;

/** As entradas do ZIP (as pastas ficam de fora); ZIP inválido = []. */
export function entradasZip(b: Uint8Array): EntradaZip[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  if (fim < 0) return [];
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const out: EntradaZip[] = [];
  for (let k = 0; k < total && p + 46 <= b.length; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const metodo = v.getUint16(p + 10, true);
    const tamanho = v.getUint32(p + 20, true);
    const nNome = v.getUint16(p + 28, true);
    const nExtra = v.getUint16(p + 30, true);
    const nComent = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nNome));
    p += 46 + nNome + nExtra + nComent;
    if (local + 30 > b.length || v.getUint32(local, true) !== 0x04034b50 || nome.endsWith("/")) continue;
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (ini + tamanho > b.length) continue;
    out.push({ nome, metodo, dados: b.subarray(ini, ini + tamanho) });
  }
  return out;
}

/** O conteúdo de uma entrada (STORE ou DEFLATE); outro método = null. */
export async function conteudoZip(e: EntradaZip): Promise<Uint8Array | null> {
  if (e.metodo === 0) return e.dados;
  if (e.metodo !== 8) return null;
  const st = new Blob([e.dados as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(st).arrayBuffer());
}

/** Os arquivos do ZIP que satisfazem `aceitar` (ex.: os PDFs), na ordem natural dos nomes. */
export async function arquivosDoZip(b: Uint8Array, aceitar: (c: Uint8Array) => boolean): Promise<{ nome: string; dados: Uint8Array }[]> {
  const r: { nome: string; dados: Uint8Array }[] = [];
  for (const e of entradasZip(b)) {
    const c = await conteudoZip(e).catch(() => null);
    if (c && aceitar(c)) r.push({ nome: e.nome, dados: c });
  }
  return r.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}
