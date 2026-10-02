// Arquivos no NAVEGADOR (sem JSX): base64, gzip, o download de um Blob e o PDF de uma resposta da Centi — usados pela
// tela Automação.
import { type AchadoCenti, caminhosDoArquivo, ehPdf, linkDaResposta } from "./automacao-centi-core";

export const deBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function gunzip(bytes: Uint8Array) {
  const st = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(st).arrayBuffer());
}

export const comoBlob = (b: Uint8Array, tipo = "application/pdf") => new Blob([b as Uint8Array<ArrayBuffer>], { type: tipo });

export function baixarNoNavegador(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Um GET de arquivo pela extensão (a API da Centi): os bytes, ou null quando não veio. */
export type BaixarCenti = (caminho: string) => Promise<Uint8Array | null>;

/**
 * O PDF a partir do que a Centi respondeu (o "Processar" do Emitir DFD ou o "Emitir documentos" do protocolo): o PDF cru,
 * em base64, compactado ou a CHAVE do arquivo gerado — baixada pelos endereços conhecidos (e o link que um deles devolver).
 */
export async function pdfDoAchado(a: AchadoCenti, baixar: BaixarCenti): Promise<{ pdf: Uint8Array } | { erro: string; amostra?: string }> {
  if (a.tipo === "pdf") return { pdf: a.bytes };
  if (a.tipo === "base64") return { pdf: deBase64(a.b64) };
  if (a.tipo === "gzip") {
    const b = await gunzip(deBase64(a.b64)).catch(() => null);
    return b && ehPdf(b) ? { pdf: b } : { erro: "Não consegui abrir o PDF compactado da Centi." };
  }
  if (a.tipo === "nada") return { erro: a.erro, amostra: a.amostra };
  for (const caminho of caminhosDoArquivo(a)) {
    const b = await baixar(caminho);
    if (!b) continue;
    if (ehPdf(b)) return { pdf: b };
    const link = linkDaResposta(b);
    const c = link ? await baixar(link) : null;
    if (c && ehPdf(c)) return { pdf: c };
  }
  return { erro: "A Centi gerou o PDF, mas não consegui baixá-lo pela chave." };
}

type PedirExtensao = (acao: string, dados: unknown, ms: number) => Promise<{ ok: boolean; b64?: string; status?: number }>;
/** O GET do arquivo pela extensão (só os endereços do arquivo gerado — a trava da extensão), na entidade pedida. */
export const baixarPelaExtensao =
  (pedir: PedirExtensao, entidade?: string): BaixarCenti =>
  async (caminho) => {
    const d = await pedir("pedir", { metodo: "GET", caminho, entidade }, 150_000);
    return d.ok && d.b64 != null && (d.status ?? 0) < 400 ? deBase64(d.b64) : null;
  };
