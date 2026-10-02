// Arquivos no NAVEGADOR (sem JSX): base64, gzip, o download de um Blob e o PDF de uma resposta da Centi — usados pela
// tela Automação.
import { type AchadoCenti, caminhosDoArquivo, ehPdf, linkDaResposta } from "./automacao-centi-core";
import { arquivosDoZip, ehZip } from "./zip-ler";

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

/** Une PDFs na ordem (pdf-lib, carregado só aqui) e confere as páginas no fim. */
export async function novaUniao() {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  let n = 0;
  let paginas = 0;
  return {
    async adicionar(b: Uint8Array) {
      const d = await PDFDocument.load(b, { ignoreEncryption: true });
      for (const pg of await doc.copyPages(d, d.getPageIndices())) doc.addPage(pg);
      paginas += d.getPageCount();
      n++;
    },
    get vazio() {
      return n === 0;
    },
    async salvar() {
      if (doc.getPageCount() !== paginas) throw new Error("páginas");
      return doc.save();
    },
  };
}

/** O PDF de um arquivo da Centi: o próprio PDF, ou o(s) PDF(s) de um ZIP (vários = unidos na ordem dos nomes). */
export async function pdfDosBytes(b: Uint8Array | null): Promise<Uint8Array | null> {
  if (!b) return null;
  if (ehPdf(b)) return b;
  if (!ehZip(b)) return null;
  const pdfs = await arquivosDoZip(b, ehPdf);
  if (pdfs.length <= 1) return pdfs[0]?.dados ?? null;
  const u = await novaUniao();
  for (const x of pdfs) await u.adicionar(x.dados);
  return u.salvar();
}

/** O começo de uma resposta, legível (para o diagnóstico de um download que não deu PDF). */
export function amostraBytes(b: Uint8Array | null): string {
  if (!b?.length) return "vazio";
  const t = new TextDecoder().decode(b.subarray(0, 120)).replace(/[^\x20-\x7e\u00c0-\u00ff]+/g, "·");
  return `${b.length} bytes: ${t.slice(0, 80)}`;
}

/** Um GET de arquivo pela extensão (a API da Centi): o status e os bytes (null = sem resposta). */
export type DownloadCenti = { status: number; bytes: Uint8Array | null; erro?: string };
export type BaixarCenti = (caminho: string) => Promise<DownloadCenti>;

/**
 * O PDF a partir do que a Centi respondeu (o "Processar" do Emitir DFD ou o "Emitir documentos" do protocolo): o PDF cru,
 * em base64, compactado ou a CHAVE do arquivo gerado — baixada pelos endereços conhecidos (e o link que um deles devolver).
 * O arquivo baixado pode ser um ZIP de PDFs. Sem PDF, o erro traz cada tentativa (endereço → status e o começo).
 */
export async function pdfDoAchado(a: AchadoCenti, baixar: BaixarCenti): Promise<{ pdf: Uint8Array } | { erro: string; amostra?: string }> {
  if (a.tipo === "pdf") return { pdf: a.bytes };
  if (a.tipo === "base64") return { pdf: deBase64(a.b64) };
  if (a.tipo === "gzip") {
    const b = await gunzip(deBase64(a.b64)).catch(() => null);
    const pdf = await pdfDosBytes(b);
    return pdf ? { pdf } : { erro: "Não consegui abrir o PDF compactado da Centi." };
  }
  if (a.tipo === "nada") return { erro: a.erro, amostra: a.amostra };
  const tentativas: string[] = [];
  const tentar = async (caminho: string) => {
    const d = await baixar(caminho);
    tentativas.push(`${caminho.split("?")[0].slice(0, 90)} → ${d.status || d.erro || "sem resposta"} · ${amostraBytes(d.bytes)}`);
    return d.status < 400 ? d.bytes : null;
  };
  for (const caminho of caminhosDoArquivo(a)) {
    const b = await tentar(caminho);
    if (!b) continue;
    const pdf = await pdfDosBytes(b).catch(() => null);
    if (pdf) return { pdf };
    const link = linkDaResposta(b);
    const c = link ? await tentar(link) : null;
    const pdf2 = await pdfDosBytes(c).catch(() => null);
    if (pdf2) return { pdf: pdf2 };
  }
  return { erro: "A Centi gerou o arquivo, mas não consegui baixá-lo pela chave.", amostra: [`arquivo: ${a.nome}`, ...tentativas].join("\n") };
}

type PedirExtensao = (acao: string, dados: unknown, ms: number) => Promise<{ ok: boolean; b64?: string; status?: number; erro?: string }>;
/** O GET do arquivo pela extensão (só os endereços do arquivo gerado — a trava da extensão), na entidade pedida. */
export const baixarPelaExtensao =
  (pedir: PedirExtensao, entidade?: string): BaixarCenti =>
  async (caminho) => {
    const d = await pedir("pedir", { metodo: "GET", caminho, entidade }, 150_000);
    return { status: d.ok ? (d.status ?? 0) : 0, bytes: d.ok && d.b64 != null ? deBase64(d.b64) : null, erro: d.ok ? undefined : d.erro };
  };
