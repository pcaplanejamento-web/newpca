"use client";

import { useEffect, useRef } from "react";

/**
 * O `?abrir=` da URL (o link de um resultado da PESQUISA DO SISTEMA): `aplicar(valor)` abre o registro na tela quando os
 * dados estão `prontos`; o parâmetro sai da URL depois (recarregar não reabre), sem nova renderização. Uma vez por chegada.
 */
export function useAbrirDaUrl(aplicar: (valor: string) => void, prontos = true) {
  const feito = useRef(false);
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;
  useEffect(() => {
    if (feito.current || !prontos) return;
    const u = new URL(window.location.href);
    const valor = u.searchParams.get("abrir");
    feito.current = true;
    if (!valor) return;
    aplicarRef.current(valor);
    u.searchParams.delete("abrir");
    window.history.replaceState(window.history.state, "", u.pathname + u.search);
  }, [prontos]);
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
