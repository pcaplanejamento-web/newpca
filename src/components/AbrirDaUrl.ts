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
