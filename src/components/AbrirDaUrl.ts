"use client";

import { useEffect, useRef } from "react";

/**
 * O `?abrir=` da URL (o link de um resultado da PESQUISA DO SISTEMA): `aplicar(valor)` abre o registro na tela quando os
 * dados estão `prontos`; o parâmetro sai da URL depois (recarregar não reabre), sem nova renderização. Uma vez por chegada.
 * `param` = outro nome quando a tela de fora também lê o `abrir` (a visão dentro do Catálogo, a planilha dentro de Órgãos).
 */
export function useAbrirDaUrl(aplicar: (valor: string) => void, prontos = true, param = "abrir") {
  const feito = useRef(false);
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;
  useEffect(() => {
    if (feito.current || !prontos) return;
    const u = new URL(window.location.href);
    const valor = u.searchParams.get(param);
    feito.current = true;
    if (!valor) return;
    aplicarRef.current(valor);
    u.searchParams.delete(param);
    window.history.replaceState(window.history.state, "", u.pathname + u.search);
  }, [prontos, param]);
}

/**
 * O `?abrir=<id>` de uma TABELA que carrega as linhas depois (empenhos, liquidações, pagamentos): guarda o id e, quando as
 * `linhas` chegam, abre a linha dele (`abrir`). Uma vez por chegada; a linha fora do que foi carregado não abre nada.
 */
export function useAbrirLinhaDaUrl<T extends { id: number }>(linhas: T[] | null, abrir: (linha: T) => void) {
  const pendente = useRef<number | null>(null);
  useAbrirDaUrl((v) => {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) pendente.current = n;
  });
  const abrirRef = useRef(abrir);
  abrirRef.current = abrir;
  useEffect(() => {
    if (pendente.current == null || !linhas) return;
    const l = linhas.find((x) => x.id === pendente.current);
    pendente.current = null;
    if (l) abrirRef.current(l);
  }, [linhas]);
}

/** A pesquisa da tela pública pede para abrir algo NA PRÓPRIA página (mesmo PCA e aba) — sem recarregar. */
export const EVENTO_ABRIR_PUBLICO = "pesquisa-publica:abrir";

/**
 * O `?abrir=tipo:id` da TELA PÚBLICA: o da URL (chegando de outra aba) e o da pesquisa do cabeçalho na própria página
 * (`EVENTO_ABRIR_PUBLICO`). `ativo` = só onde a pesquisa pública existe (o mesmo componente no painel não lê nada).
 */
export function useAbrirPublico(aplicar: (valor: string) => void, ativo: boolean, prontos = true) {
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;
  useAbrirDaUrl((v) => aplicarRef.current(v), ativo && prontos);
  useEffect(() => {
    if (!ativo) return;
    const ouvir = (e: Event) => {
      const v = (e as CustomEvent<string>).detail;
      if (typeof v === "string") aplicarRef.current(v);
    };
    window.addEventListener(EVENTO_ABRIR_PUBLICO, ouvir);
    return () => window.removeEventListener(EVENTO_ABRIR_PUBLICO, ouvir);
  }, [ativo]);
}
