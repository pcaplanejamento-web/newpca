import type { Item } from "./fluxo-core";

/** As automações que a PESSOA quer à mão na Mesa do sistema (preferência pessoal — `preferencias_tabela`). */
export const PREF_AUTOMACOES_MESA = "automacao:mesa";

/** Os ids gravados na preferência — tolerante a qualquer JSON (sem repetir, só inteiros positivos). */
export function idsAutomacoesMesa(valor: unknown): number[] {
  const ids = (valor as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

/** Liga/desliga um id na lista (a ordem de quem já estava fica). */
export function alternarAutomacaoMesa(ids: number[], id: number, ligado: boolean): number[] {
  const sem = ids.filter((x) => x !== id);
  return ligado ? [...sem, id] : sem;
}

/**
 * A ação da coluna Centi (Mesa e Análise) sobre a automação "Verificar DFDs na Centi": "conferir" = o Reconferir (nada do DFD
 * é alterado) · "corrigir" = o Corrigir automaticamente (corrige mesmo com a caixa "Corrigir" desligada). As duas verificam
 * SÓ o conteúdo — a situação e o centro de custo ficam para a execução completa.
 */
export type AcaoCenti = "conferir" | "corrigir";

/** O que a ação põe no host da execução (os nós leem — também dentro dos subfluxos). Sem ação: nada. */
export const hostDaAcaoCenti = (a?: AcaoCenti | null): Record<string, unknown> =>
  a === "conferir" ? { __soConferir: true, __verificacoes: ["conteudo"] } : a === "corrigir" ? { __corrigir: true, __verificacoes: ["conteudo"] } : {};

/** O que a Mesa manda à Automação: o fluxo, os DFDs de entrada (o Início do fluxo os entrega) e a ação da coluna Centi. */
export type DisparoMesa = { fluxoId: number; itens: Item[]; acao?: AcaoCenti };
const CHAVE_DISPARO = "automacao:disparo";

/** O evento que avisa a Automação já montada (em segundo plano) de um disparo novo. */
export const EVENTO_DISPARO_MESA = "automacao:disparo";

/** Grava o disparo na aba e avisa a Automação montada. `false` = o navegador recusou o armazenamento. */
export function gravarDisparoMesa(d: DisparoMesa): boolean {
  try {
    sessionStorage.setItem(CHAVE_DISPARO, JSON.stringify(d));
    window.dispatchEvent(new Event(EVENTO_DISPARO_MESA));
    return true;
  } catch {
    return false;
  }
}

/** Há um disparo esperando (sem consumi-lo)? */
export function temDisparoMesa(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_DISPARO) != null;
  } catch {
    return false;
  }
}

/** Um DFD da Mesa para a automação (o que o Início entrega). */
export type DfdParaAutomacao = { id: number; numero: string; planejamento?: string | null; protocoloId?: number | null };

/** Os DFDs (sem repetir, na ordem) cujo `campo` está em `ids` — as linhas de protocolos/itens viram os DFDs delas. */
export function dfdsDoAlvo(dfds: readonly DfdParaAutomacao[], campo: "id" | "protocoloId", ids: ReadonlySet<number>): Item[] {
  return dfds.filter((d) => d[campo] != null && ids.has(d[campo] as number)).map((d) => ({ id: d.id, numero: d.numero, planejamento: d.planejamento ?? "" }));
}

/** Lê e APAGA o disparo (roda uma vez só). */
export function lerDisparoMesa(): DisparoMesa | null {
  try {
    const t = sessionStorage.getItem(CHAVE_DISPARO);
    sessionStorage.removeItem(CHAVE_DISPARO);
    const d = t ? (JSON.parse(t) as DisparoMesa & { soConferir?: boolean }) : null;
    // `soConferir` = o formato de antes (uma aba aberta antes da atualização).
    const acao: AcaoCenti | null = d?.acao === "conferir" || d?.acao === "corrigir" ? d.acao : d?.soConferir === true ? "conferir" : null;
    return d && Number(d.fluxoId) > 0 && Array.isArray(d.itens) ? { fluxoId: Number(d.fluxoId), itens: d.itens, ...(acao ? { acao } : {}) } : null;
  } catch {
    return null;
  }
}
