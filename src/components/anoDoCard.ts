"use client";

import { useCallback, useEffect, useState } from "react";

const chave = (cardId: number) => `empenhos:ano:${cardId}`;
const EVENTO = "empenhos:ano";

/**
 * O ANO de trabalho do card — UM só para a Importação, o Testar da Configuração e o "Buscar na Centi" dos Vínculos
 * (guardado neste aparelho; vale entre as abas). Fora dos anos do card, volta ao primeiro deles.
 */
export function useAnoDoCard(cardId: number, anos: number[]): [number, (ano: number) => void] {
  const padrao = anos[0] ?? new Date().getFullYear();
  const lista = anos.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: a lista é comparada pelo conteúdo (o array pode ser novo a cada render).
  const valido = useCallback((n: number) => (lista.split(",").map(Number).includes(n) ? n : padrao), [lista, padrao]);
  const [ano, setAnoLocal] = useState(padrao);
  useEffect(() => {
    const ler = () => {
      try {
        setAnoLocal(valido(Number(localStorage.getItem(chave(cardId)))));
      } catch {
        setAnoLocal(padrao);
      }
    };
    ler();
    window.addEventListener(EVENTO, ler);
    return () => window.removeEventListener(EVENTO, ler);
  }, [cardId, valido, padrao]);
  const setAno = useCallback(
    (n: number) => {
      const v = valido(n);
      setAnoLocal(v);
      try {
        localStorage.setItem(chave(cardId), String(v));
      } catch {}
      window.dispatchEvent(new Event(EVENTO));
    },
    [cardId, valido],
  );
  return [valido(ano), setAno];
}
