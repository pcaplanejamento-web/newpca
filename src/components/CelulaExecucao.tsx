"use client";

import { contarDivergencias, divergenciasDoMotivo } from "@/lib/conferencia-dfd-centi";
import { classeExecucao } from "@/lib/execucao-centi";
import { Badge, type Tone } from "./Badge";
import { BotaoCopiar } from "./BotaoCopiar";
import { Dropdown } from "./Dropdown";

const TOM: Record<"executado" | "cancelado" | "outro", Tone> = { executado: "emerald", cancelado: "red", outro: "amber" };

/** A EXECUÇÃO do DFD na Centi (a situação do planejamento na CM002): verde = executado · vermelho = cancelado · âmbar =
 * outra situação · "—" = ainda não verificado. Na Mesa (DFDs/Itens) e na tarefa "Verificar execução" da Automação. */
export const rotuloConferencia = (s: string | null | undefined) => (s === "convergente" ? "Convergente" : s === "divergente" ? "Divergente" : "Não conferido");

/** A conferência do DFD com a Centi: convergente (verde) | divergente (vermelho). Tocar no DIVERGENTE abre o painel com
 * TODAS as divergências encontradas (uma por linha, agrupadas por origem) e "Copiar". */
export function CelulaConferenciaCenti({ status, motivo }: { status: string | null | undefined; motivo?: string | null }) {
  if (status !== "convergente" && status !== "divergente") return <span className="text-faint" title="Ainda não conferido com a Centi">—</span>;
  const selo = (
    <Badge tone={status === "convergente" ? "emerald" : "red"} dot>
      {rotuloConferencia(status)}
    </Badge>
  );
  const grupos = status === "divergente" ? divergenciasDoMotivo(motivo) : [];
  if (!grupos.length) return <span title={status === "convergente" ? "Confere com a Centi" : "Divergente — sem detalhes gravados"}>{selo}</span>;
  const total = contarDivergencias(grupos);
  const texto = grupos.map((g) => [g.titulo, ...g.itens.map((i) => `- ${i}`)].filter(Boolean).join("\n")).join("\n\n");
  return (
    <Dropdown
      papel="dialog"
      ariaLabel={`Divergências com a Centi (${total})`}
      title="Ver todas as divergências"
      width={440}
      triggerClassName="cursor-pointer min-h-11 desktop:min-h-0 hover:opacity-80"
      trigger={selo}
    >
      {/* O painel PARA o clique: numa célula, o toque atravessaria o portal e abriria a linha. */}
      <div role="none" className="-m-2 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-text">
            Divergências com a Centi <span className="font-normal text-muted">({total})</span>
          </p>
          <BotaoCopiar texto={texto} rotulo="Copiar" titulo="Copiar todas as divergências" />
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto overscroll-contain pr-1">
          {grupos.map((g, gi) => (
            <section key={gi} className="space-y-1">
              {g.titulo && <p className="text-[12px] font-medium text-muted">{g.titulo}</p>}
              <ol className="space-y-1">
                {g.itens.map((it, i) => (
                  <li key={i} className="flex gap-2 rounded-control bg-surface-2 px-2 py-1.5 text-[12.5px] leading-snug text-text">
                    <span aria-hidden="true" className="mt-[5px] size-1.5 shrink-0 rounded-full bg-[var(--danger)]" />
                    <span className="min-w-0 break-words">{it}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </Dropdown>
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
