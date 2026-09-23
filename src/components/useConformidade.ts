"use client";

import { useEffect, useState } from "react";
import type { ConferenciaItem, ItemConferivel } from "@/lib/catalogo-conferencia";
import { conferirItensCliente } from "@/lib/catalogo-conferir-cliente";

/**
 * Conformidade dos itens do DFD ABERTO com o catálogo (veredito por código) — conferida no servidor
 * de forma PREGUIÇOSA: só o DFD aberto, ao abrir/trocar de itens ou de tipo (a lista fica leve). O
 * MESMO hook em todo banner de DFD (avulso, protocolo em análise, protocolo gravado, DFD gravado).
 * Sem itens (ou banner fechado) ⇒ `undefined` (sem a coluna "Catálogo").
 */
export function useConformidade(itens: ItemConferivel[] | undefined, tipo: string | null): Map<string, ConferenciaItem> | undefined {
  const [conformidade, setConformidade] = useState<Map<string, ConferenciaItem>>();
  useEffect(() => {
    if (!itens || itens.length === 0) {
      setConformidade(undefined);
      return;
    }
    const ac = new AbortController();
    setConformidade(undefined);
    conferirItensCliente(itens, tipo, ac.signal).then((m) => {
      if (!ac.signal.aborted) setConformidade(m);
    });
    return () => ac.abort();
  }, [itens, tipo]);
  return conformidade;
}
