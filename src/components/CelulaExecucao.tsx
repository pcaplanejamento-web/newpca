"use client";

import { classeExecucao } from "@/lib/execucao-centi";
import { Badge, type Tone } from "./Badge";

const TOM: Record<"executado" | "cancelado" | "outro", Tone> = { executado: "emerald", cancelado: "red", outro: "amber" };

/** A EXECUÇÃO do DFD na Centi (a situação do planejamento na CM002): verde = executado · vermelho = cancelado · âmbar =
 * outra situação · "—" = ainda não verificado. Na Mesa (DFDs/Itens) e na tarefa "Verificar execução" da Automação. */
export const rotuloConferencia = (s: string | null | undefined) => (s === "convergente" ? "Convergente" : s === "divergente" ? "Divergente" : "Não conferido");

/** A conferência do DFD com a CM002 (Automação): convergente (verde) | divergente (vermelho, o motivo na dica). */
export function CelulaConferenciaCenti({ status, motivo }: { status: string | null | undefined; motivo?: string | null }) {
  if (status !== "convergente" && status !== "divergente") return <span className="text-faint" title="Ainda não conferido com a CM002">—</span>;
  return (
    <span title={motivo || (status === "convergente" ? "Confere com a CM002" : undefined)}>
      <Badge tone={status === "convergente" ? "emerald" : "red"} dot>
        {rotuloConferencia(status)}
      </Badge>
    </span>
  );
}

export function CelulaExecucao({ situacao }: { situacao: string | null | undefined }) {
  const c = classeExecucao(situacao);
  if (!c || !situacao) return <span className="text-faint" title="Ainda não verificado na Centi (Automação → Verificar execução)">—</span>;
  return (
    <Badge tone={TOM[c]} dot>
      {situacao}
    </Badge>
  );
}
