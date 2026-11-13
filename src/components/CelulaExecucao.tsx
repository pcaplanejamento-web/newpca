"use client";

import { useState } from "react";
import { contarDivergencias, divergenciasDoMotivo, type GrupoDivergencias, tiposDivergencia, tiposDoMotivo } from "@/lib/conferencia-dfd-centi";
import { classeExecucao } from "@/lib/execucao-centi";
import { Badge, type Tone } from "./Badge";
import { BotaoCopiar } from "./BotaoCopiar";
import { ChipsEscolha } from "./ChipsEscolha";
import { Dropdown } from "./Dropdown";

const TOM: Record<"executado" | "cancelado" | "outro", Tone> = { executado: "emerald", cancelado: "red", outro: "amber" };

/** A EXECUÇÃO do DFD na Centi (a situação do planejamento na CM002): verde = executado · vermelho = cancelado · âmbar =
 * outra situação · "—" = ainda não verificado. Na Mesa (DFDs/Itens) e na tarefa "Verificar execução" da Automação. */
export const rotuloConferencia = (s: string | null | undefined) => (s === "convergente" ? "Convergente" : s === "divergente" ? "Divergente" : "Não conferido");

/** Os valores do FILTRO da coluna Centi: o status e, no divergente, cada TIPO de divergência ("Divergente · Valor total"). */
export const valoresConferencia = (s: string | null | undefined, motivo?: string | null): string[] => [
  rotuloConferencia(s),
  ...(s === "divergente" ? tiposDoMotivo(motivo).map((t) => `Divergente · ${t}`) : []),
];

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
  return (
    <Dropdown
      papel="dialog"
      ariaLabel={`Divergências com a Centi (${total})`}
      title="Ver todas as divergências"
      width={440}
      triggerClassName="cursor-pointer min-h-11 desktop:min-h-0 hover:opacity-80"
      trigger={selo}
    >
      <PainelDivergencias grupos={grupos} total={total} />
    </Dropdown>
  );
}

const TODOS = "__todos";

/** O painel das divergências: os TIPOS em chips (filtram a lista e o "Copiar") + a lista agrupada por origem. */
function PainelDivergencias({ grupos, total }: { grupos: GrupoDivergencias[]; total: number }) {
  const [tipo, setTipo] = useState<string>(TODOS);
  const conta = new Map<string, number>();
  for (const g of grupos) for (const i of g.itens) for (const t of tiposDivergencia(i)) conta.set(t, (conta.get(t) ?? 0) + 1);
  const ativo = tipo !== TODOS && conta.has(tipo) ? tipo : TODOS;
  const vistos =
    ativo === TODOS ? grupos : grupos.map((g) => ({ ...g, itens: g.itens.filter((i) => tiposDivergencia(i).includes(ativo)) })).filter((g) => g.itens.length);
  const nVistos = ativo === TODOS ? total : (conta.get(ativo) ?? 0);
  const texto = vistos.map((g) => [g.titulo, ...g.itens.map((i) => `- ${i}`)].filter(Boolean).join("\n")).join("\n\n");
  return (
    /* O painel PARA o clique: numa célula, o toque atravessaria o portal e abriria a linha. */
    <div role="none" className="-m-2 p-2" onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-text">
          Divergências com a Centi <span className="font-normal text-muted">({ativo === TODOS ? total : `${nVistos} de ${total}`})</span>
        </p>
        <BotaoCopiar texto={texto} rotulo="Copiar" titulo={ativo === TODOS ? "Copiar todas as divergências" : `Copiar as divergências de ${ativo}`} />
      </div>
      {conta.size > 1 && (
        <div className="mb-2">
          <ChipsEscolha
            rolar
            ariaLabel="Filtrar por tipo de divergência"
            valor={ativo}
            onEscolher={(v) => setTipo(v === ativo ? TODOS : v)}
            opcoes={[{ value: TODOS, label: "Todas", conta: total }, ...[...conta].map(([t, n]) => ({ value: t, label: t, conta: n }))]}
          />
        </div>
      )}
      <div className="max-h-[60vh] space-y-3 overflow-y-auto overscroll-contain pr-1">
        {vistos.map((g, gi) => (
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
