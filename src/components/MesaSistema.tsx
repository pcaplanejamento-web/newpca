"use client";

import { type ComponentProps, useMemo } from "react";
import type { DfdNaLista } from "@/lib/dfd";
import { listasDoTexto } from "@/lib/mesa-listas";
import type { ProtocoloResumo } from "@/lib/protocolo";
import { DfdsView } from "./DfdsView";

/** As listas grandes da Mesa (protocolos + DFDs) lidas do ÚNICO texto que o servidor manda (`mesa-listas.ts`) — UM
 * `JSON.parse` por carga do servidor (o texto muda a cada carga: as listas são novas, como antes). */
export function useListasMesa(listas: string) {
  return useMemo(() => listasDoTexto<ProtocoloResumo, DfdNaLista>(listas), [listas]);
}

/**
 * A MESA DO SISTEMA (`/painel/mesa`): a `DfdsView` com as listas lidas do texto do servidor (`carregarMesa`). Invólucro
 * fino — a API da `DfdsView` não muda; só as listas chegam como texto (menos CPU no Worker).
 */
export function MesaSistema({ listas, ...mesa }: Omit<ComponentProps<typeof DfdsView>, "protocolos" | "dfds"> & { listas: string }) {
  const { protocolos, dfds } = useListasMesa(listas);
  return <DfdsView {...mesa} protocolos={protocolos} dfds={dfds} />;
}
