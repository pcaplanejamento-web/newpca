"use client";

import { DURACAO_PADRAO_MIN_ROTULO, diasDoEvento, rotuloLembrete } from "@/lib/calendario-core";
import { brl, dataBR } from "@/lib/format";
import { COR_ESTADO_PRAZO, estadoPrazo, type EventoCalendario, ROTULO_ESTADO_PRAZO, ROTULO_TIPO_EVENTO, rotuloData, rotuloTicket } from "@/lib/tarefas-core";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { IconBell, IconCalendar, IconClock, IconCopy, IconKanban, IconPencil, IconRepetir, IconTrash } from "./icons";

const DIAS_LONGOS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
/** "quinta-feira, 25/09/2026". */
export const dataPorExtenso = (d: string) => `${DIAS_LONGOS[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${dataBR(d)}`;

/** "sexta-feira, 25/09/2026 · 09:00–10:30" / "… · 09:00 (1 h)" / "… → … (3 dias)" / "… · dia inteiro". */
export function quandoPorExtenso(e: Pick<EventoCalendario, "inicio" | "fim" | "diaInteiro" | "horaInicio" | "horaFim">) {
  if (e.inicio !== e.fim) return `${dataPorExtenso(e.inicio)} → ${dataPorExtenso(e.fim)} (${diasDoEvento(e)} dias)`;
  if (e.diaInteiro || !e.horaInicio) return `${dataPorExtenso(e.inicio)} · dia inteiro`;
  return `${dataPorExtenso(e.inicio)} · ${e.horaInicio}${e.horaFim ? `–${e.horaFim}` : ` (${DURACAO_PADRAO_MIN_ROTULO})`}`;
}

/**
 * O BANNER de um evento do Calendário (o corpo de um painel do `Modal`): título na cor, o TIPO, quando (por extenso — dia
 * inteiro, horário [sem fim = a duração padrão], vários dias), lembrete, local, descrição e a ORIGEM — a TAREFA (ticket,
 * título, quadro, prazo no semáforo; `avisoPrazo` = o prazo cai em fim de semana/feriado) com **"Ver tarefa"** (abre ao
 * lado), ou o DFD do PCA (planejamento, unidade, valor e o PCA). O evento cadastrado tem Editar · Duplicar · Excluir; o do
 * período, o da recorrência e o do PCA explicam de onde vêm.
 */
export function EventoBanner({
  evento: e,
  cor,
  quadroNome,
  hoje,
  onVerTarefa,
  onEditar,
  onDuplicar,
  onExcluir,
  onAbrirPca,
  avisoPrazo,
  tarefaAberta = false,
}: {
  evento: EventoCalendario;
  cor: string;
  quadroNome?: string;
  hoje: string;
  onVerTarefa?: () => void;
  onEditar?: () => void;
  onDuplicar?: () => void;
  onExcluir?: () => void;
  /** O DFD do PCA: abrir o espaço do PCA (Mesa do PCA). */
  onAbrirPca?: () => void;
  avisoPrazo?: string | null;
  /** O banner da tarefa já está ao lado. */
  tarefaAberta?: boolean;
}) {
  const estado = estadoPrazo(e.tarefaPrazo, hoje, e.concluida);
  const explicacao =
    e.tipo === "periodo"
      ? "Gerado pelo início e pelo prazo da tarefa — mude as datas na tarefa (ou arraste no calendário)."
      : e.tipo === "recorrencia"
        ? e.prevista
          ? "Próxima ocorrência PREVISTA: a repetição conta da conclusão — a data real depende de quando a tarefa for concluída (aqui, se concluída hoje ou no prazo)."
          : "Próxima ocorrência prevista pela recorrência da tarefa — nasce ao concluir a atual."
        : e.tipo === "pca"
          ? `Previsão de entrega do DFD (seção 5)${e.pca?.anual ? " — ANUAL: aparece em todos os meses do ano" : ""}. O cronograma segue o PCA consolidado.`
          : null;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 h-4 w-4 shrink-0 rounded-[4px]" style={{ background: cor }} />
        <div className="min-w-0 space-y-1">
          <h3 className="break-words text-[17px] font-semibold leading-snug text-text">{e.titulo}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{e.tipo === "evento" ? "Evento" : ROTULO_TIPO_EVENTO[e.tipo]}</Badge>
            {e.recorrente && (
              <Badge tone="blue">
                <IconRepetir className="h-3 w-3" />
                {e.tipo === "pca" ? "Anual" : "Recorrente"}
              </Badge>
            )}
            {e.prevista && <Badge tone="amber">Prevista</Badge>}
            {e.concluida && <Badge tone="emerald">Concluída</Badge>}
          </div>
        </div>
      </div>
      <dl className="space-y-2 text-[13px]">
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted">
            {e.diaInteiro ? <IconCalendar className="h-4 w-4" aria-hidden /> : <IconClock className="h-4 w-4" aria-hidden />}
            <span className="sr-only">Quando</span>
          </dt>
          <dd className="text-text">{e.tipo === "pca" ? `A partir de ${dataPorExtenso(e.inicio)}` : quandoPorExtenso(e)}</dd>
        </div>
        {e.lembreteMin != null && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted">
              <IconBell className="h-4 w-4" aria-hidden />
              <span className="sr-only">Lembrete</span>
            </dt>
            <dd className="text-text">{rotuloLembrete(e.lembreteMin)} (no sino)</dd>
          </div>
        )}
        {e.local && (
          <div className="flex gap-2">
            <dt className="w-4 shrink-0 text-center text-muted">
              <span aria-hidden>@</span>
              <span className="sr-only">Local</span>
            </dt>
            <dd className="break-words text-text">{e.local}</dd>
          </div>
        )}
        {e.descricao && <dd className="whitespace-pre-wrap break-words rounded-control bg-surface-2 px-3 py-2 text-text-2">{e.descricao}</dd>}
      </dl>
      {explicacao && <p className="text-[12.5px] text-muted">{explicacao}</p>}
      {avisoPrazo && (
        <Callout kind="warn">Prazo em dia não útil: o prazo da tarefa {avisoPrazo}.</Callout>
      )}
      {e.pca ? (
        <section className="space-y-2 rounded-card border border-border p-3" aria-label="DFD do PCA">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
            <IconCalendar className="h-3.5 w-3.5" />
            {e.pca.pcaNome}
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-muted">DFD</dt>
            <dd className="text-text">
              {e.pca.numero}
              {e.pca.planejamento ? ` (Planej. ${e.pca.planejamento})` : ""}
            </dd>
            {e.pca.objeto && (
              <>
                <dt className="text-muted">Objeto</dt>
                <dd className="break-words text-text">{e.pca.objeto}</dd>
              </>
            )}
            {e.pca.sigla && (
              <>
                <dt className="text-muted">Unidade</dt>
                <dd className="text-text">{e.pca.sigla}</dd>
              </>
            )}
            <dt className="text-muted">Valor</dt>
            <dd className="tabular-nums text-text">{brl(e.pca.valor)}</dd>
          </dl>
          {onAbrirPca && (
            <Button size="sm" variant="accent" onClick={onAbrirPca}>
              Abrir o PCA
            </Button>
          )}
        </section>
      ) : (
        <section className="space-y-2 rounded-card border border-border p-3" aria-label="Tarefa de origem">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
            <IconKanban className="h-3.5 w-3.5" />
            Tarefa{quadroNome ? ` · ${quadroNome}` : ""}
          </p>
          <p className="break-words text-[13.5px] text-text">
            <span className="mr-1.5 font-mono text-[12px] text-faint">{rotuloTicket(e.ticket)}</span>
            {e.tarefaTitulo}
          </p>
          {e.tarefaPrazo && (
            <p className="text-[12.5px] font-semibold" style={{ color: COR_ESTADO_PRAZO[estado] }}>
              Prazo {rotuloData(e.tarefaPrazo, hoje)} — {ROTULO_ESTADO_PRAZO[estado]}
            </p>
          )}
          {onVerTarefa && (
            <Button size="sm" variant={tarefaAberta ? "secondary" : "accent"} disabled={tarefaAberta} onClick={onVerTarefa}>
              {tarefaAberta ? "Tarefa aberta ao lado" : "Ver tarefa"}
            </Button>
          )}
        </section>
      )}
      {(onEditar || onDuplicar || onExcluir) && (
        <div className="flex flex-wrap gap-2">
          {onEditar && (
            <Button variant="secondary" size="sm" icon={<IconPencil className="h-4 w-4" />} onClick={onEditar}>
              Editar evento
            </Button>
          )}
          {onDuplicar && (
            <Button variant="ghost" size="sm" icon={<IconCopy className="h-4 w-4" />} onClick={onDuplicar}>
              Duplicar
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
