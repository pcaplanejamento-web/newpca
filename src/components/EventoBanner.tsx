"use client";

import { dataBR } from "@/lib/format";
import { COR_ESTADO_PRAZO, estadoPrazo, type EventoCalendario, ROTULO_ESTADO_PRAZO, ROTULO_TIPO_EVENTO, rotuloData, rotuloTicket } from "@/lib/tarefas-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { IconCalendar, IconClock, IconKanban, IconPencil, IconRepetir, IconTrash } from "./icons";

const DIAS_LONGOS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
/** "quinta-feira, 25/09/2026". */
export const dataPorExtenso = (d: string) => `${DIAS_LONGOS[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${dataBR(d)}`;

/**
 * O BANNER de um evento do Calendário (o corpo de um painel do `Modal`): título na cor, o TIPO, quando (por extenso — dia
 * inteiro, horário ou o período), local, descrição e a TAREFA de origem (ticket, título, quadro, prazo no semáforo) com
 * **"Ver tarefa"** (abre o banner da tarefa ao lado). O evento cadastrado tem Editar/Excluir; o do período e o da
 * recorrência explicam de onde vêm.
 */
export function EventoBanner({
  evento: e,
  cor,
  quadroNome,
  hoje,
  onVerTarefa,
  onEditar,
  onExcluir,
  tarefaAberta = false,
}: {
  evento: EventoCalendario;
  cor: string;
  quadroNome?: string;
  hoje: string;
  onVerTarefa: () => void;
  onEditar?: () => void;
  onExcluir?: () => void;
  /** O banner da tarefa já está ao lado. */
  tarefaAberta?: boolean;
}) {
  const estado = estadoPrazo(e.tarefaPrazo, hoje, e.concluida);
  const quando =
    e.inicio !== e.fim
      ? `${dataPorExtenso(e.inicio)} → ${dataPorExtenso(e.fim)}`
      : `${dataPorExtenso(e.inicio)}${e.diaInteiro || !e.horaInicio ? " · dia inteiro" : ` · ${e.horaInicio}${e.horaFim ? `–${e.horaFim}` : ""}`}`;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 h-4 w-4 shrink-0 rounded-[4px]" style={{ background: cor }} />
        <div className="min-w-0 space-y-1">
          <h3 className="text-[17px] font-semibold leading-snug text-text">{e.titulo}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{e.tipo === "evento" ? "Evento" : ROTULO_TIPO_EVENTO[e.tipo]}</Badge>
            {e.recorrente && (
              <Badge tone="blue">
                <IconRepetir className="h-3 w-3" />
                Recorrente
              </Badge>
            )}
            {e.concluida && <Badge tone="emerald">Concluída</Badge>}
          </div>
        </div>
      </div>
      <dl className="space-y-2 text-[13px]">
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted">{e.diaInteiro ? <IconCalendar className="h-4 w-4" aria-label="Quando" /> : <IconClock className="h-4 w-4" aria-label="Quando" />}</dt>
          <dd className="text-text">{quando}</dd>
        </div>
        {e.local && (
          <div className="flex gap-2">
            <dt className="w-4 shrink-0 text-center text-muted">
              <span aria-hidden>@</span>
              <span className="sr-only">Local</span>
            </dt>
            <dd className="text-text">{e.local}</dd>
          </div>
        )}
        {e.descricao && <dd className="whitespace-pre-wrap rounded-control bg-surface-2 px-3 py-2 text-text-2">{e.descricao}</dd>}
      </dl>
      {e.tipo !== "evento" && (
        <p className="text-[12.5px] text-muted">
          {e.tipo === "periodo"
            ? "Gerado pelo início e pelo prazo da tarefa — mude as datas na tarefa (ou arraste no calendário)."
            : "Próxima ocorrência prevista pela recorrência da tarefa — nasce ao concluir a atual."}
        </p>
      )}
      <section className="space-y-2 rounded-card border border-border p-3" aria-label="Tarefa de origem">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
          <IconKanban className="h-3.5 w-3.5" />
          Tarefa{quadroNome ? ` · ${quadroNome}` : ""}
        </p>
        <p className="text-[13.5px] text-text">
          <span className="mr-1.5 font-mono text-[12px] text-faint">{rotuloTicket(e.ticket)}</span>
          {e.tarefaTitulo}
        </p>
        {e.tarefaPrazo && (
          <p className="text-[12.5px] font-semibold" style={{ color: COR_ESTADO_PRAZO[estado] }}>
            Prazo {rotuloData(e.tarefaPrazo, hoje)} — {ROTULO_ESTADO_PRAZO[estado]}
          </p>
        )}
        <Button size="sm" variant={tarefaAberta ? "secondary" : "accent"} disabled={tarefaAberta} onClick={onVerTarefa}>
          {tarefaAberta ? "Tarefa aberta ao lado" : "Ver tarefa"}
        </Button>
      </section>
      {(onEditar || onExcluir) && (
        <div className="flex flex-wrap gap-2">
          {onEditar && (
            <Button variant="secondary" size="sm" icon={<IconPencil className="h-4 w-4" />} onClick={onEditar}>
              Editar evento
            </Button>
          )}
          {onExcluir && (
            <Button variant="ghost" size="sm" icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />} onClick={onExcluir}>
              Excluir
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
