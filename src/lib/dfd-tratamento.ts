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

// ---- Faltas CIRÚRGICAS + relatório em formato de DESPACHO (copiável) ----

/** Seções obrigatórias do DFD (fonte única — `faltasObrigatorias` no `dfd-validation`
 * também usa esta lista). O `rotulo` já indica a seção exata a corrigir. */
export const SECOES_OBRIGATORIAS: { kw: string; rotulo: string }[] = [
  { kw: "JUSTIFICATIVA", rotulo: "Justificativa da necessidade (Seção 3)" },
  { kw: "PREVISAO DE ENTREGA", rotulo: "Previsão de entrega/execução (Seção 5)" },
  { kw: "PRIORIDADE", rotulo: "Prioridade da compra/contratação (Seção 6)" },
  { kw: "FUNDAMENTACAO LEGAL", rotulo: "Fundamentação legal (Seção 7)" },
];

function temSecaoPreenchida(secoes: DfdSecao[], kw: string): boolean {
  return secoes.some((s) => norm(s.titulo).includes(kw) && s.texto.trim().length > 0);
}

/** Formata uma lista de nº de item ("3, 5, 8" — trunca se for enorme). */
function listaItens(nums: number[]): string {
  const s = nums.slice(0, 30).join(", ");
  return nums.length > 30 ? `${s} … (+${nums.length - 30})` : s;
}

/**
 * Faltas CIRÚRGICAS e ACIONÁVEIS de um DFD: aponta EXATAMENTE onde está o erro (quais
 * itens, qual seção) e O QUE fazer para corrigir. Puro/testável. Alimenta o relatório
 * (despacho) e o relatório do DFD.
 */
export function faltasCirurgicasDfd(d: {
  itens: DfdItemParseado[];
  secoes: DfdSecao[];
  reparticaoId?: number | null;
  assinaturaMotivo?: string | null;
}): string[] {
  const linhas: string[] = [];
  const nums = (its: DfdItemParseado[]) =>
    its.map((i) => i.item).filter((n): n is number => n != null);
  const semVU = d.itens.filter((i) => i.valorUnitario == null || i.valorUnitario <= 0);
  const semQtd = d.itens.filter((i) => i.quantidade == null);
  if (semVU.length > 0)
    linhas.push(`Informar o VALOR UNITÁRIO ${semVU.length === 1 ? "do item" : "dos itens"} ${listaItens(nums(semVU))} (Seção 4).`);
  if (semQtd.length > 0)
    linhas.push(`Informar a QUANTIDADE ${semQtd.length === 1 ? "do item" : "dos itens"} ${listaItens(nums(semQtd))} (Seção 4).`);
  if (d.reparticaoId == null) linhas.push("Vincular o DFD à repartição/Setor requisitante responsável.");
  for (const s of SECOES_OBRIGATORIAS)
    if (!temSecaoPreenchida(d.secoes, s.kw)) linhas.push(`Preencher a ${s.rotulo}.`);
  if (d.assinaturaMotivo) linhas.push(`Regularizar a assinatura digital: ${d.assinaturaMotivo}.`);
  return linhas;
}

/** Relatório de UM DFD (lista cirúrgica de pendências, copiável). Puro. */
export function linhasRelatorioDfd(info: {
  numero: string;
  planejamento?: string | null;
  tipo?: string | null;
  faltas: string[]; // de `faltasCirurgicasDfd`
}): string[] {
  const tipo = tipoCurtoDfd(info.tipo);
  const linhas: string[] = [
    `DFD ${info.numero}${tipo ? ` (${tipo})` : ""}${info.planejamento ? ` — Planejamento ${info.planejamento}` : ""}`,
  ];
  if (info.faltas.length === 0) {
    linhas.push("Sem pendências.");
    return linhas;
  }
  linhas.push("Pendências a corrigir:");
  info.faltas.forEach((f, i) => {
    linhas.push(`  ${i + 1}. ${f}`);
  });
  return linhas;
}

/**
 * Relatório de UM PROTOCOLO em formato de **DESPACHO DE DEVOLUÇÃO** — pronto para
 * copiar e devolver o processo para correção. Cada pendência é cirúrgica (aponta o
 * DFD/capa e o que fazer). Puro.
 */
export function linhasRelatorioProtocolo(info: {
  numero: string;
  idExterno?: string | null;
  interessado?: string | null;
  assunto?: string | null;
  capaMotivo?: string | null;
  dfds: { numero: string; tipo?: string | null; faltas: string[] }[]; // só os com pendência
}): string[] {
  const L: string[] = ["DESPACHO DE DEVOLUÇÃO PARA CORREÇÃO", ""];
  L.push(`Processo nº ${info.numero}${info.idExterno ? ` (Id ${info.idExterno})` : ""}`);
  if (info.interessado) L.push(`Interessado: ${info.interessado}`);
  if (info.assunto) L.push(`Assunto: ${info.assunto}`);
  L.push("");
  L.push(
    "Analisado o presente processo, constataram-se as pendências abaixo. Devolve-se para correção antes da protocolização:",
  );
  L.push("");
  let n = 1;
  if (info.capaMotivo) {
    L.push(`${n}. CAPA DO PROCESSO: ${info.capaMotivo}`);
    n++;
  }
  for (const d of info.dfds) {
    const tipo = tipoCurtoDfd(d.tipo);
    L.push(`${n}. DFD ${d.numero}${tipo ? ` (${tipo})` : ""}:`);
    for (const f of d.faltas) L.push(`   - ${f}`);
    n++;
  }
  if (n === 1) L.push("Nenhuma pendência encontrada.");
  L.push("");
  L.push("Sanadas as pendências, reencaminhe-se o processo para nova análise e protocolização.");
  return L;
}
