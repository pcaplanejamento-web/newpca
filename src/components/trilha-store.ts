"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * O que a TELA informa à trilha do cabeçalho: o nome do espaço (quadro, PCA, orçamento) e os banners abertos
 * (protocolo › DFD › tarefa), na ordem fixa. Armazém de módulo com assinatura — só a trilha re-renderiza.
 */
export type NivelAberto = { chave: string; rotulo: string; ordem: number };

const ORDEM: Record<string, number> = { protocolo: 1, dfd: 2, item: 3, tarefa: 4 };
let detalhe: string | null = null;
let abertos: NivelAberto[] = [];
let retrato: { detalhe: string | null; abertos: NivelAberto[] } = { detalhe, abertos };
const ouvintes = new Set<() => void>();

function avisar() {
  retrato = { detalhe, abertos };
  for (const f of ouvintes) f();
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

const VAZIO = { detalhe: null, abertos: [] as NivelAberto[] };

export function useTrilhaTela() {
  return useSyncExternalStore(assinar, () => retrato, () => VAZIO);
}

/** O nome do espaço aberto (o mesmo do `useOndeDetalhe`). */
export function useDetalheTrilha(texto: string | null | undefined) {
  useEffect(() => {
    if (!texto) return;
    detalhe = texto;
    avisar();
    return () => {
      if (detalhe === texto) {
        detalhe = null;
        avisar();
      }
    };
  }, [texto]);
}

/** Um banner aberto (`tipo:id`) com o rótulo — some quando o banner fecha. */
export function useNivelAberto(tipo: string, id: number | null | undefined, rotulo: string) {
  useEffect(() => {
    if (id == null || !rotulo) return;
    const chave = `${tipo}:${id}`;
    abertos = [...abertos.filter((a) => a.chave !== chave), { chave, rotulo, ordem: ORDEM[tipo] ?? 9 }].sort((a, b) => a.ordem - b.ordem);
    avisar();
    return () => {
      abertos = abertos.filter((a) => a.chave !== chave);
      avisar();
    };
  }, [tipo, id, rotulo]);
}
