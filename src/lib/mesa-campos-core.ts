import { mascararTexto } from "./dados-pessoais-core.ts";
import type { VisaoMesa } from "./mesa-visao-core.ts";
import type { TabelaMesa } from "./papeis-detalhes-core.ts";

/**
 * CAMPOS da Mesa que viram COLUNAS (núcleo PURO, testado): TODO dado do protocolo e do DFD que a lista não traz — lidos
 * SOB DEMANDA (`POST /api/mesa/campos`) só para as linhas à vista e só das colunas LIGADAS. A tabela de DFDs ganha também
 * os do protocolo de origem e a de itens, os do DFD e do protocolo de origem (pela relação — o item não tem mais nada
 * além do que já está na lista). As colunas abrem OCULTAS (`colunasPadraoOcultas`) — a Mesa abre como sempre.
 */
export type EntidadeCampos = "protocolo" | "dfd";
export type TipoCampo = "texto" | "longo" | "numero" | "moeda" | "data";
export type CampoMesa = {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  /** `pessoal` = segue "Dados pessoais" do papel (mascarados); `valores` = segue "Valores" (sem ele, não sai). */
  sensivel?: "pessoal" | "valores";
};

/** As seções padrão do DFD (as chaves de `SECOES_PADRAO`, `parse-dfd-comum.ts`) — cada uma vira uma coluna de texto. */
export const SECOES_CAMPO: readonly { chave: string; rotulo: string }[] = [
  { chave: "area", rotulo: "Área requisitante" },
  { chave: "identificacao", rotulo: "Identificação da demanda" },
  { chave: "justificativa", rotulo: "Justificativa" },
  { chave: "quantidade", rotulo: "Quantidade" },
  { chave: "previsao", rotulo: "Previsão de entrega" },
  { chave: "prioridade", rotulo: "Prioridade (texto)" },
  { chave: "fundamentacao", rotulo: "Fundamentação legal" },
  { chave: "equipe", rotulo: "Equipe de planejamento" },
  { chave: "demandante", rotulo: "Demandante" },
  { chave: "autorizacao", rotulo: "Autorização" },
];

export const CAMPOS: Record<EntidadeCampos, readonly CampoMesa[]> = {
  protocolo: [
    { chave: "interessado", rotulo: "Interessado", tipo: "texto" },
    { chave: "documento", rotulo: "CPF/CNPJ", tipo: "texto", sensivel: "pessoal" },
    { chave: "observacao", rotulo: "Observação", tipo: "longo" },
    { chave: "dataCapa", rotulo: "Data da capa", tipo: "texto" },
    { chave: "valorCapa", rotulo: "Valor da capa", tipo: "moeda", sensivel: "valores" },
    { chave: "local", rotulo: "Local", tipo: "texto" },
    { chave: "orgao", rotulo: "Órgão do protocolo", tipo: "texto" },
    { chave: "arquivo", rotulo: "Arquivo do protocolo", tipo: "texto" },
    { chave: "enviadoEm", rotulo: "Enviado ao PCA em", tipo: "data" },
    { chave: "enviadoPor", rotulo: "Enviado ao PCA por", tipo: "texto" },
    { chave: "incorporadoEm", rotulo: "Incorporado em", tipo: "data" },
    { chave: "atualizadoEm", rotulo: "Protocolo atualizado em", tipo: "data" },
  ],
  dfd: [
    { chave: "objeto", rotulo: "Objeto", tipo: "texto" },
    { chave: "orgaoEntidade", rotulo: "Órgão/Entidade", tipo: "texto" },
    { chave: "setor", rotulo: "Setor requisitante", tipo: "texto" },
    { chave: "responsavel", rotulo: "Responsável do DFD", tipo: "texto", sensivel: "pessoal" },
    { chave: "matricula", rotulo: "Matrícula", tipo: "texto", sensivel: "pessoal" },
    { chave: "email", rotulo: "E-mail", tipo: "texto", sensivel: "pessoal" },
    { chave: "telefone", rotulo: "Telefone", tipo: "texto", sensivel: "pessoal" },
    { chave: "anoProprio", rotulo: "Ano do PCA do DFD", tipo: "numero" },
    { chave: "contrato", rotulo: "Nº do contrato", tipo: "texto" },
    { chave: "ata", rotulo: "Nº da ARP", tipo: "texto" },
    { chave: "licitacao", rotulo: "Nº da licitação", tipo: "texto" },
    { chave: "arquivo", rotulo: "Arquivo do DFD", tipo: "texto" },
    { chave: "criadoEm", rotulo: "DFD importado em", tipo: "data" },
    { chave: "criadoPor", rotulo: "DFD importado por", tipo: "texto" },
    { chave: "atualizadoEm", rotulo: "DFD atualizado em", tipo: "data" },
    { chave: "execucaoEm", rotulo: "Centi verificada em", tipo: "data" },
    { chave: "conferenciaMotivo", rotulo: "Motivo da conferência Centi", tipo: "longo" },
    ...SECOES_CAMPO.map((s) => ({ chave: `secao:${s.chave}`, rotulo: s.rotulo, tipo: "longo" as const })),
  ],
};

/** Teto de ids e de campos por pedido (a régua da rota e do cliente). */
export const MAX_IDS_CAMPOS = 500;
export const MAX_CAMPOS_PEDIDO = 40;

/** A chave da COLUNA de um campo extra: `x:p:<campo>` (protocolo) | `x:d:<campo>` (DFD). */
export const chaveColuna = (e: EntidadeCampos, campo: string) => `x:${e === "protocolo" ? "p" : "d"}:${campo}`;

/** A coluna extra → entidade + campo (`null` = não é coluna extra). */
export function lerChaveColuna(k: string): { entidade: EntidadeCampos; campo: string } | null {
  const m = /^x:([pd]):(.+)$/.exec(k);
  if (!m) return null;
  const entidade: EntidadeCampos = m[1] === "p" ? "protocolo" : "dfd";
  return CAMPOS[entidade].some((c) => c.chave === m[2]) ? { entidade, campo: m[2] } : null;
}

/** As entidades cujos campos entram em cada tabela da Mesa (a tabela de DFDs com o protocolo de origem; a de itens, com
 * o DFD e o protocolo de origem). A Consolidada fica como está. */
export const ENTIDADES_DA_TABELA: Partial<Record<TabelaMesa, readonly EntidadeCampos[]>> = {
  protocolos: ["protocolo"],
  dfds: ["dfd", "protocolo"],
  itens: ["dfd", "protocolo"],
};

/** O GRUPO de uma coluna extra no seletor de colunas. */
export const GRUPO_ENTIDADE: Record<EntidadeCampos, string> = { protocolo: "Protocolo (mais dados)", dfd: "DFD (mais dados)" };

/** O campo pode SAIR para o papel? (`valores` só com Valores; `pessoal` sai mascarado em `valorParaPapel`). */
export const campoPermitido = (c: CampoMesa, vis: Pick<VisaoMesa, "valores">) => c.sensivel !== "valores" || vis.valores;

/** Os campos da entidade que o papel pode receber. */
export const camposPermitidos = (e: EntidadeCampos, vis: Pick<VisaoMesa, "valores">) => CAMPOS[e].filter((c) => campoPermitido(c, vis));

/** As colunas extras de uma tabela que abrem OCULTAS (todas — a Mesa abre como sempre). */
export const colunasPadraoOcultas = (t: TabelaMesa): string[] =>
  (ENTIDADES_DA_TABELA[t] ?? []).flatMap((e) => CAMPOS[e].map((c) => chaveColuna(e, c.chave)));

/** As colunas extras que o papel NÃO vê (somem da tabela, do seletor, dos filtros e das edições). */
export const colunasNaoPermitidas = (t: TabelaMesa, vis: Pick<VisaoMesa, "valores">): string[] =>
  (ENTIDADES_DA_TABELA[t] ?? []).flatMap((e) => CAMPOS[e].filter((c) => !campoPermitido(c, vis)).map((c) => chaveColuna(e, c.chave)));

const MASCARA = "•••";

/** O valor como SAI para o papel: o pessoal mascarado com "Mascarar" (inteiro quando é o próprio dado; texto livre pela
 * régua `mascararTexto`). */
export function valorParaPapel(c: CampoMesa, v: string | number | null, vis: Pick<VisaoMesa, "dadosPessoais">): string | number | null {
  if (v == null || v === "") return null;
  if (vis.dadosPessoais !== "mascarar") return v;
  if (c.sensivel === "pessoal") return MASCARA;
  return typeof v === "string" && (c.tipo === "longo" || c.tipo === "texto") ? mascararTexto(v) : v;
}

/** Os campos pedidos que existem e o papel pode receber (sem repetir, na ordem do catálogo). */
export function camposDoPedido(e: EntidadeCampos, pedidos: readonly string[], vis: Pick<VisaoMesa, "valores">): CampoMesa[] {
  const quer = new Set(pedidos);
  return camposPermitidos(e, vis).filter((c) => quer.has(c.chave));
}
