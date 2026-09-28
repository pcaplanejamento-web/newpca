"use client";

import { useEffect, useState } from "react";

/**
 * Um CONJUNTO de ids guardado NO APARELHO (conveniência — `localStorage`, lido depois da montagem, com try/catch): as
 * listas RECOLHIDAS de um quadro e as SEÇÕES recolhidas das grades de quadros. Sem `chave`, nada é guardado.
 */
export function useSetLocal<T extends string | number>(chave: string | undefined): [Set<T>, (v: T) => void] {
  const [ids, setIds] = useState<Set<T>>(new Set());
  useEffect(() => {
    if (!chave) return;
    try {
      const v = JSON.parse(localStorage.getItem(chave) ?? "[]");
      if (Array.isArray(v)) setIds(new Set(v.filter((x): x is T => typeof x === "number" || typeof x === "string")));
    } catch {
      // sem armazenamento: nada guardado
    }
  }, [chave]);
  const alternar = (id: T) =>
    setIds((atual) => {
      const n = new Set(atual);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        if (chave) localStorage.setItem(chave, JSON.stringify([...n]));
      } catch {
        // sem armazenamento: vale só nesta tela
      }
      return n;
    });
  return [ids, alternar];
}
