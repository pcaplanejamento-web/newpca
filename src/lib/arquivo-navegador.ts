// Arquivos no NAVEGADOR (sem JSX): base64, gzip, o download de um Blob e o PDF de uma resposta da Centi — usados pela
// tela Automação.
import { type AchadoCenti, caminhosDoArquivo, ehPdf, linkDaResposta } from "./automacao-centi-core.ts";
import { arquivosDoZip, ehZip } from "./zip-ler.ts";

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
 * em base64, compactado ou a CHAVE do arquivo gerado — baixada pelos endereços conhecidos, com TODAS as chaves e links da
 * resposta (e o link que um deles devolver). O arquivo pode ser um ZIP de PDFs. `esperarMs`: a Centi pode gerar o arquivo
 * DEPOIS de responder (em segundo plano) — enquanto só der 404, espera e tenta de novo até o prazo. Sem PDF, o erro traz
 * cada tentativa (endereço → status · começo) e o esqueleto da resposta.
 */
export async function pdfDoAchado(
  a: AchadoCenti,
  baixar: BaixarCenti,
  opcoes: { esperarMs?: number; passoMs?: number; aoEsperar?: (s: number) => void } = {},
): Promise<{ pdf: Uint8Array } | { erro: string; amostra?: string }> {
  if (a.tipo === "pdf") return { pdf: a.bytes };
  if (a.tipo === "base64") return { pdf: deBase64(a.b64) };
  if (a.tipo === "gzip") {
    const b = await gunzip(deBase64(a.b64)).catch(() => null);
    const pdf = await pdfDosBytes(b);
    return pdf ? { pdf } : { erro: "Não consegui abrir o PDF compactado da Centi." };
  }
  if (a.tipo === "nada") return { erro: a.erro, amostra: a.amostra };
  const caminhos = caminhosDoArquivo(a);
  const inicio = Date.now();
  let ultimas: string[] = [];
  for (let rodada = 0; ; rodada++) {
    const tentativas: string[] = [];
    let soNaoAchou = true;
    for (const caminho of caminhos) {
      const d = await baixar(caminho);
      tentativas.push(`${caminho.split("?")[0].slice(0, 90)} → ${d.status || d.erro || "sem resposta"} · ${amostraBytes(d.bytes)}`);
      if (d.status !== 404) soNaoAchou = false;
      if (d.status >= 400 || !d.bytes) continue;
      const pdf = await pdfDosBytes(d.bytes).catch(() => null);
      if (pdf) return { pdf };
      const link = linkDaResposta(d.bytes);
      const c = link ? await baixar(link) : null;
      if (c) tentativas.push(`${link?.split("?")[0].slice(0, 90)} → ${c.status || c.erro || "sem resposta"} · ${amostraBytes(c.bytes)}`);
      const pdf2 = await pdfDosBytes(c?.bytes ?? null).catch(() => null);
      if (pdf2) return { pdf: pdf2 };
    }
    ultimas = tentativas;
    // Ainda não existe (404 em tudo): a Centi pode estar gerando — espera crescente até o prazo.
    const passou = Date.now() - inicio;
    const espera = Math.min(15_000, (opcoes.passoMs ?? 2_000) * (rodada + 1));
    if (!soNaoAchou || !opcoes.esperarMs || passou + espera > opcoes.esperarMs) break;
    opcoes.aoEsperar?.(Math.round((passou + espera) / 1000));
    await new Promise((ok) => setTimeout(ok, espera));
  }
  const s = Math.round((Date.now() - inicio) / 1000);
  return {
    erro: `A Centi gerou o arquivo, mas não consegui baixá-lo pela chave${s > 2 ? ` (tentei por ${s} s)` : ""}.`,
    amostra: [`arquivo: ${a.nome}`, ...ultimas, ...(a.amostra ? [`resposta: ${a.amostra}`] : [])].join("\n"),
  };
}

type PedirExtensao = (acao: string, dados: unknown, ms: number) => Promise<{ ok: boolean; b64?: string; status?: number; erro?: string }>;
/** O GET do arquivo pela extensão (só os endereços do arquivo gerado — a trava da extensão), na entidade pedida. */
export const baixarPelaExtensao =
  (pedir: PedirExtensao, entidade?: string): BaixarCenti =>
  async (caminho) => {
    const d = await pedir("pedir", { metodo: "GET", caminho, entidade }, 150_000);
    return { status: d.ok ? (d.status ?? 0) : 0, bytes: d.ok && d.b64 != null ? deBase64(d.b64) : null, erro: d.ok ? undefined : d.erro };
  };
