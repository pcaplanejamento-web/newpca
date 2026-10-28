import { carimboDeclaracao, blocosDeclaracao, rotuloNumero, type RegistroDeclaracao } from "./declaracoes-core";
import type { DeclaracaoCompleta } from "./declaracoes";
import { gerarDocumentoPdf } from "./documento-pdf-gerar";

const SISTEMA = "Plataforma PCA";

/** O endereço da verificação pública de uma declaração. */
export const urlVerificacaoDeclaracao = (origem: string, codigo: string) => `${origem}/declaracao/verificar/${codigo}`;

/**
 * O PDF da DECLARAÇÃO, gerado no SERVIDOR a partir do retrato congelado (o PCA pode ter mudado depois) — a data dos
 * metadados é a da emissão. Cancelada, sai com o aviso em vermelho e o carimbo "CANCELADA".
 */
export async function pdfDaDeclaracao(d: DeclaracaoCompleta, origem: string): Promise<Uint8Array | null> {
  if (!d.conteudo) return null;
  const r: RegistroDeclaracao = {
    numero: d.numero,
    ano: d.ano,
    codigo: d.codigo,
    selo: d.selo,
    emitidoEm: d.emitidoEm,
    urlVerificacao: urlVerificacaoDeclaracao(origem, d.codigo),
    cancelada: d.cancelada,
  };
  return gerarDocumentoPdf(
    { titulo: `Declaração nº ${rotuloNumero(d.numero, d.ano)} — PCA ${d.conteudo.pca.ano ?? ""}`.trim(), blocos: blocosDeclaracao(d.conteudo, r) },
    {
      rodape: `Declaração nº ${rotuloNumero(d.numero, d.ano)} · código ${d.codigo} · ${SISTEMA}`,
      sistema: SISTEMA,
      carimbo: carimboDeclaracao(d.conteudo, r),
      data: new Date(`${d.emitidoEm.replace(" ", "T")}Z`),
      assunto: `Declaração de item no PCA · código ${d.codigo}`,
      palavras: [`codigo:${d.codigo}`, `selo:${d.selo}`],
    },
  );
}
