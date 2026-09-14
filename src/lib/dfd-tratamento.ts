import { normPrevisao, normPrioridade, valoresBatem } from "./normalize.ts";
import {
  type DfdItemParseado,
  type DfdParseado,
  type DfdSecao,
  norm,
  tipoCurtoDfd,
} from "./parse-dfd-comum.ts";

/**
 * Tratamento das seções TRATÁVEIS do DFD (PRIORIDADE §6, PREVISÃO §5, FUNDAMENTAÇÃO
 * §7). Puro/testável. As seções vivem em `DfdParseado.secoes` ({numero,titulo,texto})
 * e são localizadas por KEYWORD do título (igual à validação `faltasObrigatorias`).
 */

export type CampoTratavel = "prioridade" | "previsao" | "fundamentacao";

export const TRATAVEIS: { campo: CampoTratavel; kw: string; titulo: string; numero: number }[] = [
  { campo: "prioridade", kw: "PRIORIDADE", titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", numero: 6 },
  { campo: "previsao", kw: "PREVISAO DE ENTREGA", titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", numero: 5 },
  { campo: "fundamentacao", kw: "FUNDAMENTACAO LEGAL", titulo: "FUNDAMENTAÇÃO LEGAL", numero: 7 },
];

export function acharSecao(secoes: DfdSecao[], kw: string): number {
  return secoes.findIndex((s) => norm(s.titulo).includes(kw));
}

export function textoSecao(secoes: DfdSecao[], kw: string): string {
  const i = acharSecao(secoes, kw);
  return i >= 0 ? secoes[i].texto : "";
}

/** Grava (ou cria, se faltava) o texto de uma seção — mantendo a ordem. */
export function setTextoSecao(
  secoes: DfdSecao[],
  cfg: { kw: string; titulo: string; numero: number },
  texto: string,
): DfdSecao[] {
  const i = acharSecao(secoes, cfg.kw);
  if (i >= 0) {
    const n = [...secoes];
    n[i] = { ...n[i], texto };
    return n;
  }
  return [...secoes, { numero: cfg.numero, titulo: cfg.titulo, texto }];
}

/**
 * Aplica a normalização AUTOMÁTICA das seções tratáveis (PRIORIDADE/PREVISÃO) —
 * grava o texto canônico e devolve quais campos foram auto-corrigidos. Rodar ao
 * parsear (conferência), para o usuário ver o valor padronizado e poder ajustar.
 */
export function normalizarSecoesDfd(dfd: DfdParseado): { dfd: DfdParseado; auto: CampoTratavel[] } {
  let secoes = dfd.secoes;
  const auto: CampoTratavel[] = [];
  const [pCfg, vCfg] = TRATAVEIS;

  const p = normPrioridade(textoSecao(secoes, pCfg.kw));
  if (p.valor && p.auto) {
    secoes = setTextoSecao(secoes, pCfg, p.valor);
    auto.push("prioridade");
  }
  const v = normPrevisao(textoSecao(secoes, vCfg.kw));
  if (v.valor && v.auto) {
    secoes = setTextoSecao(secoes, vCfg, v.valor);
    auto.push("previsao");
  }
  return { dfd: secoes === dfd.secoes ? dfd : { ...dfd, secoes }, auto };
}

// ---- Estado por DFD (para a tabela do protocolo) ----
export type EstadoDfd = "pendente" | "regular" | "regularizado" | "editado" | "erro";

/** Precedência: erro (faltas) > editado > regularizado (auto) > regular. */
export function estadoDfd(faltas: number, auto: boolean, editado: boolean): EstadoDfd {
  if (faltas > 0) return "erro";
  if (editado) return "editado";
  if (auto) return "regularizado";
  return "regular";
}

export const ESTADO_ROTULO: Record<EstadoDfd, string> = {
  pendente: "Pendente",
  regular: "Regular",
  regularizado: "Regularizado",
  editado: "Editado",
  erro: "Com erro",
};

/** Cor semântica por estado (token). Regularizado automaticamente = verde (é um sucesso). */
export function estadoCor(e: EstadoDfd): string {
  if (e === "erro") return "var(--danger)";
  if (e === "editado") return "var(--info)";
  if (e === "regularizado") return "var(--ok)";
  if (e === "regular") return "var(--ok)";
  return "var(--muted)";
}

// ---- Estado/Situação de um PROTOCOLO já gravado (para a tabela de protocolos) ----
// ESTADO = integridade do valor da capa × somatória dos DFDs; SITUAÇÃO = conteúdo.
export type EstadoProtocolo = "regular" | "atencao";

export function estadoProtocolo(p: {
  valorCapa: number | null;
  valorTotal: number;
  totalDfds: number;
}): EstadoProtocolo {
  if (p.totalDfds === 0) return "regular"; // sem DFDs: nada a conferir
  if (p.valorCapa == null || p.valorCapa <= 0 || !valoresBatem(p.valorCapa, p.valorTotal)) return "atencao";
  return "regular";
}

export const ESTADO_PROTOCOLO_ROTULO: Record<EstadoProtocolo, string> = {
  regular: "Regular",
  atencao: "Atenção",
};

export function estadoProtocoloCor(e: EstadoProtocolo): string {
  return e === "atencao" ? "var(--warn)" : "var(--ok)";
}

export type SituacaoProtocolo = "vazio" | "preenchido";

export function situacaoProtocolo(p: { totalDfds: number }): SituacaoProtocolo {
  return p.totalDfds > 0 ? "preenchido" : "vazio";
}

export const SITUACAO_PROTOCOLO_ROTULO: Record<SituacaoProtocolo, string> = {
  vazio: "Vazio",
  preenchido: "Com DFDs",
};

// ---- Estado por ITEM da tabela (mesma ideia do estado por DFD) ----
export type EstadoItem = "erro" | "regular";

/** Faltas de um item da Seção 4 (o que impede o DFD de ser importado). */
export function faltasDoItem(it: DfdItemParseado): string[] {
  const faltas: string[] = [];
  if (it.valorUnitario == null || it.valorUnitario <= 0) faltas.push("valor unitário");
  if (it.quantidade == null) faltas.push("quantidade");
  return faltas;
}

/** Um item está com erro quando falta algo essencial (valor unitário/quantidade). */
export function itemComErro(it: DfdItemParseado): boolean {
  return faltasDoItem(it).length > 0;
}

export function estadoItem(it: DfdItemParseado): EstadoItem {
  return itemComErro(it) ? "erro" : "regular";
}

export const ESTADO_ITEM_ROTULO: Record<EstadoItem, string> = { erro: "Com erro", regular: "Regular" };

export function estadoItemCor(e: EstadoItem): string {
  return e === "erro" ? "var(--danger)" : "var(--ok)";
}

// ---- Relatório de erros (texto copiável) ----

/** Linhas do relatório de erros de UM DFD (copiável). Puro. */
export function linhasRelatorioDfd(info: {
  numero: string;
  planejamento?: string | null;
  tipo?: string | null;
  faltas: string[];
  itensComErro: { item: number | null; codigo: string | null; faltas: string[] }[];
  assinaturaMotivo?: string | null;
}): string[] {
  const linhas: string[] = [];
  const tipo = tipoCurtoDfd(info.tipo);
  linhas.push(
    `DFD ${info.numero}${tipo ? ` (${tipo})` : ""}${info.planejamento ? ` — Planejamento ${info.planejamento}` : ""}`,
  );
  if (info.faltas.length > 0) {
    linhas.push("Dados obrigatórios faltando:");
    for (const f of info.faltas) linhas.push(`  - ${f}`);
  }
  if (info.assinaturaMotivo) {
    linhas.push("Assinatura digital:");
    linhas.push(`  - ${info.assinaturaMotivo}`);
  }
  if (info.itensComErro.length > 0) {
    linhas.push(`Itens com pendência (${info.itensComErro.length}):`);
    for (const it of info.itensComErro) {
      linhas.push(`  - item ${it.item ?? "?"}${it.codigo ? ` (cód. ${it.codigo})` : ""}: falta ${it.faltas.join(", ")}`);
    }
  }
  if (linhas.length === 1) linhas.push("Sem erros.");
  return linhas;
}

/** Linhas do relatório de erros de UM PROTOCOLO (copiável). Puro. */
export function linhasRelatorioProtocolo(info: {
  numero: string;
  idExterno?: string | null;
  capaMotivo?: string | null;
  dfdsComErro: { numero: string; motivo: string }[];
}): string[] {
  const linhas: string[] = [];
  linhas.push(`Protocolo ${info.numero}${info.idExterno ? ` — Id ${info.idExterno}` : ""}`);
  if (info.capaMotivo) {
    linhas.push("Capa:");
    linhas.push(`  - ${info.capaMotivo}`);
  }
  if (info.dfdsComErro.length > 0) {
    linhas.push(`DFDs com erro (${info.dfdsComErro.length}):`);
    for (const d of info.dfdsComErro) linhas.push(`  - DFD ${d.numero}: ${d.motivo}`);
  }
  if (linhas.length === 1) linhas.push("Sem erros.");
  return linhas;
}
