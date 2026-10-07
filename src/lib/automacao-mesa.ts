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

/** O que a Mesa manda à Automação: o fluxo e os DFDs de entrada (o Início do fluxo os entrega). */
export type DisparoMesa = { fluxoId: number; itens: Item[] };
const CHAVE_DISPARO = "automacao:disparo";

/** Grava o disparo na aba (a Automação o lê ao abrir). `false` = o navegador recusou o armazenamento. */
export function gravarDisparoMesa(d: DisparoMesa): boolean {
  try {
    sessionStorage.setItem(CHAVE_DISPARO, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** Lê e APAGA o disparo (roda uma vez só). */
export function lerDisparoMesa(): DisparoMesa | null {
  try {
    const t = sessionStorage.getItem(CHAVE_DISPARO);
    sessionStorage.removeItem(CHAVE_DISPARO);
    const d = t ? (JSON.parse(t) as DisparoMesa) : null;
    return d && Number(d.fluxoId) > 0 && Array.isArray(d.itens) ? { fluxoId: Number(d.fluxoId), itens: d.itens } : null;
  } catch {
    return null;
  }
}
