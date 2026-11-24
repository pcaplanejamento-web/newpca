import { PALETA_DECLARACAO } from "./declaracoes-core";
import { type OpcoesGerar, gerarDocumentoPdf } from "./documento-pdf-gerar";
import { itensDoTexto } from "./itens-dash-texto";
import { blocosDocumentoPca, carimboDocumento, type ConfigDocumentoPca, type DfdDocumento, type EmissaoDocumento } from "./pca-documento-core";

/** A margem lateral do documento oficial (2 cm — a mesma da declaração). */
const MARGEM = 56.7;
const SISTEMA = "Plataforma PCA";

/** O que o servidor entrega (a emissão pública ou a prévia do ADM). */
export type PacoteDocumento = {
  config: ConfigDocumentoPca;
  pca: { id: number; nome: string; ano: number | null };
  dados: { itensTexto: string; dfds: DfdDocumento[]; unidades: Record<string, string> };
  /** Ausente = a PRÉVIA (sem código, marcada). */
  emissao?: EmissaoDocumento | null;
};

/**
 * O PDF do DOCUMENTO OFICIAL do PCA, montado NO NAVEGADOR (milhares de páginas) com o andamento (`onProgresso`) e o
 * cancelamento (`sinal`). Sóbrio (a paleta da declaração), no papel timbrado quando configurado, com o carimbo da emissão em
 * cada página e a data FIXA da emissão nos metadados.
 */
export async function gerarPdfDocumentoPca(p: PacoteDocumento, o: Pick<OpcoesGerar, "onProgresso" | "sinal"> = {}): Promise<Uint8Array> {
  const emissao = p.emissao ?? null;
  const agora = new Date().toISOString();
  const dados = { pca: p.pca, itens: itensDoTexto(p.dados.itensTexto), dfds: p.dados.dfds, unidades: p.dados.unidades };
  const blocos = blocosDocumentoPca(dados, p.config, emissao, agora);
  const timbre = p.config.timbre ? (await import("./timbre-prefeitura")).TIMBRE_PREFEITURA : null;
  return gerarDocumentoPdf(
    { titulo: `Plano de Contratações Anual — ${p.pca.nome}`, blocos },
    {
      rodape: emissao ? `${p.pca.nome} · código ${emissao.codigo} · ${SISTEMA}` : `${p.pca.nome} · PRÉVIA · ${SISTEMA}`,
      sistema: SISTEMA,
      carimbo: carimboDocumento(dados, emissao),
      timbre: timbre ? { png: Uint8Array.from(atob(timbre.png), (c) => c.charCodeAt(0)), largura: timbre.largura, altura: timbre.altura } : undefined,
      margem: MARGEM,
      paleta: PALETA_DECLARACAO,
      data: new Date(emissao?.emitidoEm ?? agora),
      assunto: `Plano de Contratações Anual · ${p.pca.nome}${emissao ? ` · código ${emissao.codigo}` : " · prévia"}`,
      palavras: emissao ? [`codigo:${emissao.codigo}`, `selo:${emissao.selo}`] : ["previa"],
      // O total do andamento da montagem: as linhas de todas as tabelas.
      linhasTotal: blocos.reduce((n, b) => n + (b.tipo === "tabela" ? b.linhas.length : 0), 0),
      ...o,
    },
  );
}
