"use client";

import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import {
  COR_ESTADO_PRAZO,
  COR_PRIORIDADE,
  type EtiquetaTarefa,
  estadoPrazo,
  ROTULO_ESTADO_PRAZO,
  ROTULO_PRIORIDADE,
  rotuloData,
  ROTULO_VINCULO,
  rotuloTicket,
  type TarefaResumo,
} from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { CelulaCopiavel } from "./BotaoCopiar";
import { IconAnexo, IconBandeira, IconChecklist, IconClock, IconComentario, IconGrip, IconLink } from "./icons";

/** Até quantas pessoas aparecem no cartão (as demais viram "+N"). */
const MAX_AVATARES = 3;

/**
 * CARTÃO de uma tarefa no quadro: as etiquetas (faixas na cor), o título, e na base o nº do TICKET (copiável), a
 * PRIORIDADE (bandeira na cor), o PRAZO no semáforo (verde · âmbar · vermelho) e os RESPONSÁVEIS (fotos). O cartão todo é
 * o botão que abre o detalhe (camada que cobre o cartão — os controles de dentro ficam por cima); no mouse o próprio
 * cartão arrasta, no toque a ALÇA (o dedo no cartão rola a tela). Alt + setas movem pelo teclado.
 */
export function CartaoTarefa({
  tarefa: t,
  etiquetas,
  pessoas,
  hoje,
  onAbrir,
  onPegar,
  onTeclaMover,
  oculto = false,
}: {
  tarefa: TarefaResumo;
  etiquetas: Map<number, EtiquetaTarefa>;
  pessoas: Map<number, Pessoa>;
  hoje: string;
  onAbrir?: () => void;
  /** Começa o arrasto (mouse no cartão; toque na alça). Ausente = não arrasta. */
  onPegar?: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Alt + ←/→ (lista vizinha) e Alt + ↑/↓ (posição na lista). */
  onTeclaMover?: (direcao: "esquerda" | "direita" | "cima" | "baixo") => void;
  /** O cartão em arrasto (a sombra está no lugar dele). */
  oculto?: boolean;
}) {
  const estado = estadoPrazo(t.prazo, hoje, t.concluidaEm != null);
  const marcas = t.etiquetas.map((e) => etiquetas.get(e)).filter((e): e is EtiquetaTarefa => !!e);
  const resp = t.pessoas.map((p) => pessoas.get(p)).filter((p): p is Pessoa => !!p);
  const tecla = (e: KeyboardEvent) => {
    if (!onTeclaMover || !e.altKey) return;
    const d = ({ ArrowLeft: "esquerda", ArrowRight: "direita", ArrowUp: "cima", ArrowDown: "baixo" } as const)[e.key as "ArrowLeft"];
    if (!d) return;
    e.preventDefault();
    onTeclaMover(d);
  };
  return (
    <article
      data-cartao={t.id}
      onPointerDown={(e) => e.pointerType === "mouse" && onPegar?.(e)}
      className={`group/cartao relative shrink-0 rounded-card border border-border bg-surface p-2.5 shadow-ring transition-colors duration-[var(--motion-duration)] hover:border-accent/50 ${
        onPegar ? "lg:cursor-grab" : ""
      } ${t.concluidaEm ? "opacity-75" : ""} ${oculto ? "hidden" : ""}`}
    >
      <button
        type="button"
        onClick={onAbrir}
        onKeyDown={tecla}
        aria-label={`${rotuloTicket(t.ticket)} ${t.titulo}${onTeclaMover ? " — Alt + setas move o cartão" : ""}`}
        className="absolute inset-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      />
      {marcas.length > 0 && (
        <div className="pointer-events-none mb-1.5 flex flex-wrap gap-1">
          {marcas.map((e) => (
            <span
              key={e.id}
              title={e.nome}
              className="max-w-[9rem] truncate rounded-full px-2 py-px text-[10.5px] font-semibold"
              style={{ color: e.cor, background: `color-mix(in srgb, ${e.cor} 14%, var(--surface))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${e.cor} 30%, transparent)` }}
            >
              {e.nome}
            </span>
          ))}
        </div>
      )}
      <p className={`pointer-events-none line-clamp-3 pr-6 text-[13px] font-medium leading-snug text-text ${t.concluidaEm ? "line-through decoration-faint" : ""}`}>{t.titulo}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span className="relative z-10 font-mono tabular-nums">
          <CelulaCopiavel copiar={String(t.ticket)} rotulo="nº do ticket">
            {rotuloTicket(t.ticket)}
          </CelulaCopiavel>
        </span>
        {t.prioridade !== "media" && (
          <span className="pointer-events-none inline-flex items-center" title={`Prioridade ${ROTULO_PRIORIDADE[t.prioridade]}`} style={{ color: COR_PRIORIDADE[t.prioridade] }}>
            <IconBandeira className="h-3.5 w-3.5" aria-label={`Prioridade ${ROTULO_PRIORIDADE[t.prioridade]}`} />
          </span>
        )}
        {t.prazo && (
          <span
            className="pointer-events-none inline-flex items-center gap-1 rounded-full px-1.5 py-px font-semibold tabular-nums"
            title={`Prazo ${rotuloData(t.prazo, "")} — ${ROTULO_ESTADO_PRAZO[estado]}`}
            style={{ color: COR_ESTADO_PRAZO[estado], background: `color-mix(in srgb, ${COR_ESTADO_PRAZO[estado]} 12%, var(--surface))` }}
          >
            <IconClock className="h-3 w-3" />
            {rotuloData(t.prazo, hoje)}
          </span>
        )}
        {t.checklist.total > 0 && (
          <span
            className="pointer-events-none inline-flex items-center gap-0.5 tabular-nums"
            title={`Checklist ${t.checklist.feitos} de ${t.checklist.total}`}
            style={t.checklist.feitos === t.checklist.total ? { color: "var(--ok)" } : undefined}
          >
            <IconChecklist className="h-3.5 w-3.5" />
            {t.checklist.feitos}/{t.checklist.total}
          </span>
        )}
        {t.comentarios > 0 && (
          <span className="pointer-events-none inline-flex items-center gap-0.5 tabular-nums" title={`${t.comentarios} comentário(s)`}>
            <IconComentario className="h-3.5 w-3.5" />
            {t.comentarios}
          </span>
        )}
        {t.anexos > 0 && (
          <span className="pointer-events-none inline-flex items-center gap-0.5 tabular-nums" title={`${t.anexos} anexo(s)`}>
            <IconAnexo className="h-3.5 w-3.5" />
            {t.anexos}
          </span>
        )}
        {t.vinculo && (
          <span className="pointer-events-none inline-flex" title={`${ROTULO_VINCULO[t.vinculo.tipo]} ${t.vinculo.rotulo ?? "(excluído)"}`}>
            <IconLink className="h-3.5 w-3.5 text-accent" aria-label={`Vinculada a ${ROTULO_VINCULO[t.vinculo.tipo]}`} />
          </span>
        )}
        {resp.length > 0 && (
          <span className="pointer-events-none ml-auto flex -space-x-1.5" title={resp.map((p) => nomeExibicao(p)).join(", ")}>
            {resp.slice(0, MAX_AVATARES).map((p) => (
              <Avatar key={p.id} nome={p.nome} foto={p.foto} size="xs" className="ring-2 ring-surface" />
            ))}
            {resp.length > MAX_AVATARES && (
              <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-surface-2 px-1 text-[9px] font-semibold text-text-2 ring-2 ring-surface">
                +{resp.length - MAX_AVATARES}
              </span>
            )}
          </span>
        )}
      </div>
      {onPegar && (
        <span
          role="presentation"
          onPointerDown={(e) => e.pointerType !== "mouse" && onPegar(e)}
          title="Arrastar"
          className="absolute top-0.5 right-0.5 z-10 hidden h-11 w-9 touch-none items-center justify-center text-faint pointer-coarse:flex"
        >
          <IconGrip className="h-4 w-4" />
        </span>
      )}
    </article>
  );
}
