"use client";

import { createContext, type ReactNode, useCallback, useContext } from "react";
import type { AcaoPapel } from "@/lib/papeis-catalogo";
import { type ComponentesRetirados, retirado } from "@/lib/papeis-componentes-core";

const Ctx = createContext<ComponentesRetirados>({});
const CtxExibicao = createContext<{ vinculosExpandidos: boolean }>({ vinculosExpandidos: false });

/** Os COMPONENTES retirados pelo papel de quem está logado (o Administrador = nenhum) e as PREFERÊNCIAS de exibição do
 * papel (como as telas abrem) — no layout do painel. */
export function ComponentesPapel({
  retirados,
  exibicao = { vinculosExpandidos: false },
  children,
}: {
  retirados: ComponentesRetirados;
  exibicao?: { vinculosExpandidos: boolean };
  children: ReactNode;
}) {
  return (
    <Ctx.Provider value={retirados}>
      <CtxExibicao.Provider value={exibicao}>{children}</CtxExibicao.Provider>
    </Ctx.Provider>
  );
}

/** Como o papel quer que as telas ABRAM (Configurações → Papéis → Detalhes → Exibição). */
export const useExibicaoPapel = () => useContext(CtxExibicao);

/** O componente deixa a ação? (`"dfd.dashboard"`, `"visualizar"`). Sem provedor = sim. A ação na TELA segue o `pode`. */
export function useComponente() {
  const r = useContext(Ctx);
  return useCallback((chave: string, acao: AcaoPapel = "visualizar") => !retirado(r, chave, acao), [r]);
}
