"use client";

import { createContext, type ReactNode, useCallback, useContext } from "react";
import type { AcaoPapel } from "@/lib/papeis-catalogo";
import { type ComponentesRetirados, retirado } from "@/lib/papeis-componentes-core";

const Ctx = createContext<ComponentesRetirados>({});

/** Os COMPONENTES retirados pelo papel de quem está logado (o Administrador = nenhum) — no layout do painel. */
export function ComponentesPapel({ retirados, children }: { retirados: ComponentesRetirados; children: ReactNode }) {
  return <Ctx.Provider value={retirados}>{children}</Ctx.Provider>;
}

/** O componente deixa a ação? (`"dfd.dashboard"`, `"visualizar"`). Sem provedor = sim. A ação na TELA segue o `pode`. */
export function useComponente() {
  const r = useContext(Ctx);
  return useCallback((chave: string, acao: AcaoPapel = "visualizar") => !retirado(r, chave, acao), [r]);
}
