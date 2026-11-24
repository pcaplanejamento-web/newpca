import { PALETA_DECLARACAO } from "./declaracoes-core";
import type { BlocoDoc } from "./documento-pdf-core";
import { type OpcoesGerar, type OpcoesMontagem, gerarDocumentoPdf, paginasDoDocumento } from "./documento-pdf-gerar";
import { itensDoTexto } from "./itens-dash-texto";
import { blocosDocumentoPca, carimboDocumento, type ConfigDocumentoPca, type DadosDocumento, type DfdDocumento, type EmissaoDocumento } from "./pca-documento-core";

/** A margem lateral do documento oficial (2 cm — a mesma da declaração). */
const MARGEM = 56.7;
const SISTEMA = "Plataforma PCA";
/** A paleta do documento oficial (sóbria, a da declaração) — o arquivo e a prévia. */
export const PALETA_DOCUMENTO_PCA = PALETA_DECLARACAO;

/** O que o servidor entrega (a emissão pública ou a prévia do ADM). */
export type PacoteDocumento = {
  config: ConfigDocumentoPca;
  pca: { id: number; nome: string; ano: number | null };
  dados: { itensTexto: string; dfds: DfdDocumento[]; unidades: Record<string, string> };
  /** Ausente = a PRÉVIA (sem código, marcada). */
  emissao?: EmissaoDocumento | null;
};

/** O TIMBRE (PNG em base64) — carregado só quando o documento o usa. */
export async function timbreDoDocumento(cfg: Pick<ConfigDocumentoPca, "timbre">) {
  return cfg.timbre ? (await import("./timbre-prefeitura")).TIMBRE_PREFEITURA : null;
}

/**
 * A MONTAGEM do documento — os blocos e as opções das páginas, a MESMA no arquivo (`gerarPdfDocumentoPca`) e na prévia da
 * tela (`paginasDocumentoPca`): o que a prévia mostra é o que o PDF desenha. `previa` = só as primeiras linhas das listas
 * longas (os NÚMEROS seguem os do PCA inteiro). `dados` já lidos evitam ler o texto dos itens de novo.
 */
export function montagemDocumentoPca(
  p: PacoteDocumento,
  agora: string,
  timbre: { largura: number; altura: number } | null,
  opcoes: { dados?: DadosDocumento; previa?: { itens: number; dfds: number } } = {},
): { doc: { titulo: string; blocos: BlocoDoc[] }; montagem: OpcoesMontagem; dados: DadosDocumento } {
  const emissao = p.emissao ?? null;
  const dados = opcoes.dados ?? { pca: p.pca, itens: itensDoTexto(p.dados.itensTexto), dfds: p.dados.dfds, unidades: p.dados.unidades };
  return {
    doc: { titulo: `Plano de Contratações Anual — ${p.pca.nome}`, blocos: blocosDocumentoPca(dados, p.config, emissao, agora, opcoes.previa) },
    montagem: {
      rodape: emissao ? `${p.pca.nome} · código ${emissao.codigo} · ${SISTEMA}` : `${p.pca.nome} · PRÉVIA · ${SISTEMA}`,
      carimbo: carimboDocumento(dados, emissao),
      timbre: timbre ? { largura: timbre.largura, altura: timbre.altura } : undefined,
      margem: MARGEM,
    },
    dados,
  };
}

/**
 * O PDF do DOCUMENTO OFICIAL do PCA, montado NO NAVEGADOR (milhares de páginas) com o andamento (`onProgresso`) e o
 * cancelamento (`sinal`). Sóbrio (a paleta da declaração), no papel timbrado quando configurado, com o carimbo da emissão em
 * cada página e a data FIXA da emissão nos metadados.
 */
export async function gerarPdfDocumentoPca(p: PacoteDocumento, o: Pick<OpcoesGerar, "onProgresso" | "sinal"> = {}): Promise<Uint8Array> {
  const emissao = p.emissao ?? null;
  const agora = new Date().toISOString();
  const timbre = await timbreDoDocumento(p.config);
  const { doc, montagem } = montagemDocumentoPca(p, agora, timbre);
  return gerarDocumentoPdf(doc, {
    ...montagem,
    sistema: SISTEMA,
    timbre: timbre ? { png: Uint8Array.from(atob(timbre.png), (c) => c.charCodeAt(0)), largura: timbre.largura, altura: timbre.altura } : undefined,
    paleta: PALETA_DOCUMENTO_PCA,
    data: new Date(emissao?.emitidoEm ?? agora),
    assunto: `Plano de Contratações Anual · ${p.pca.nome}${emissao ? ` · código ${emissao.codigo}` : " · prévia"}`,
    palavras: emissao ? [`codigo:${emissao.codigo}`, `selo:${emissao.selo}`] : ["previa"],
    // O total do andamento da montagem: as linhas de todas as tabelas.
    linhasTotal: doc.blocos.reduce((n, b) => n + (b.tipo === "tabela" ? b.linhas.length : 0), 0),
    ...o,
  });
}

/** As PÁGINAS da prévia da tela — exatamente as do arquivo (mesmos blocos, mesmas medidas, mesmo timbre e carimbo). */
export async function paginasDocumentoPca(p: PacoteDocumento, agora: string, opcoes: { dados?: DadosDocumento; previa?: { itens: number; dfds: number } } = {}) {
  const timbre = await timbreDoDocumento(p.config);
  const { doc, montagem } = montagemDocumentoPca(p, agora, timbre, opcoes);
  const paginas = await paginasDoDocumento(doc, montagem);
  return { ...paginas, timbre: timbre ? `data:image/png;base64,${timbre.png}` : null };
}
