import { type DfdParseado, type DfdSecao, norm } from "./parse-dfd-comum.ts";
import { normPrevisao, normPrioridade } from "./normalize.ts";

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
