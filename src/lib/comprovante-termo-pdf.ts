import { gerarDocumentoPdf } from "./documento-pdf-gerar";
import { blocosComprovante, carimboComprovante, rotuloVersaoTermo } from "./termo-uso-core";
import type { AceiteRegistro } from "./termo-uso";

/** Nome fixo do produtor do comprovante — muda os bytes se trocar (os PDFs já baixados deixam de conferir). */
const SISTEMA_COMPROVANTE = "Plataforma PCA";

/**
 * O COMPROVANTE do aceite em PDF, gerado no SERVIDOR e DETERMINÍSTICO: o mesmo registro + o mesmo texto + a mesma origem
 * dão SEMPRE os mesmos bytes (data dos metadados = a do aceite, nada da hora em que foi gerado). Assim a verificação
 * pública refaz o arquivo e compara o SHA-256 do PDF enviado — qualquer edição é detectada.
 */
export async function pdfDoComprovante(a: AceiteRegistro, termo: { textoFinal: string; publicadoEm: string | null }, origem: string): Promise<Uint8Array> {
  const urlVerificacao = `${origem}/termo/verificar/${a.codigo}`;
  const dados = { ...a, aparelho: a.aparelhoNome, urlVerificacao, teste: !!a.teste };
  return gerarDocumentoPdf(
    { titulo: `${rotuloVersaoTermo(a.versao, termo.publicadoEm)} (comprovante de aceite)`, blocos: blocosComprovante(termo.textoFinal, dados) },
    {
      rodape: `Comprovante de aceite · código ${a.codigo} · ${SISTEMA_COMPROVANTE}`,
      sistema: SISTEMA_COMPROVANTE,
      carimbo: carimboComprovante(dados),
      data: new Date(a.em),
      assunto: `Comprovante de assinatura eletrônica · código ${a.codigo}`,
      palavras: [`codigo:${a.codigo}`, `selo:${a.selo}`, `texto:${a.hash}`],
    },
  );
}

/** SHA-256 (hex) dos bytes de um arquivo. */
export async function sha256Arquivo(b: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
