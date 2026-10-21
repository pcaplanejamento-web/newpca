import { baixarSeguro } from "./busca-segura";
import { LIMITE_DOCUMENTO_ADM } from "./compactar-pdf-core";
import { ehPdf, urlPdfDoGoogle } from "./link-documento-core";

/** Baixa AGORA o PDF de um link do Google (Docs/Drive compartilhado com o link). Lança com a mensagem para a tela. */
export async function pdfDoGoogle(link: string): Promise<{ bytes: Uint8Array; nome?: string }> {
  const url = urlPdfDoGoogle(link);
  if (!url) throw new Error("Use um link do Google Docs ou do Google Drive.");
  const r = await baixarSeguro(url, { accept: "application/pdf", maxBytes: LIMITE_DOCUMENTO_ADM, quem: "O Google", binario: true, tempoMs: 30000 });
  if (!ehPdf(r.bytes)) throw new Error("O link não entregou um PDF — compartilhe como “Qualquer pessoa com o link”.");
  return { bytes: r.bytes, nome: r.nome };
}
