"use client";

import { type KeyboardEvent, type ReactNode, type PointerEvent as ReactPointerEvent, useSyncExternalStore } from "react";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import {
  COR_ESTADO_PRAZO,
  COR_PRIORIDADE,
  type EtiquetaTarefa,
  estadoPrazo,
  horaAgoraBrasilia,
  ROTULO_ESTADO_PRAZO,
  ROTULO_PRIORIDADE,
  rotuloData,
  rotuloRecorrencia,
  rotuloDoVinculo,
  rotuloTicket,
  type TarefaResumo,
  type CampoTarefa,
} from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { ChipsCamposCartao } from "./CamposTarefa";
import { CirculoConcluir } from "./CirculoConcluir";
import { IconBandeira, IconCalendar, IconChecklist, IconClock, IconComentario, IconCopy, IconDescricao, IconGrip, IconLink, IconNota, IconRepetir, IconWeb } from "./icons";

/** Até quantas pessoas aparecem no cartão (as demais viram "+N"). */
const MAX_AVATARES = 3;

/**
 * As ETIQUETAS dos cartões em FAIXAS (padrão, como no Trello) ou com o NOME — tocar numa faixa alterna TODOS os cartões;
 * a escolha fica no aparelho (conveniência; sem armazenamento, vale só na tela).
 */
const CHAVE_ETIQUETAS = "tarefas:etiquetas-nome";
const ouvintes = new Set<() => void>();
let comNome: boolean | null = null;
const lerComNome = () => {
  if (comNome == null)
    try {
      comNome = localStorage.getItem(CHAVE_ETIQUETAS) === "1";
    } catch {
      comNome = false;
    }
  return comNome;
};
export function useEtiquetasComNome(): [boolean, () => void] {
  const v = useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    lerComNome,
    () => false,
  );
  const alternar = () => {
    comNome = !lerComNome();
    try {
      localStorage.setItem(CHAVE_ETIQUETAS, comNome ? "1" : "0");
    } catch {
      // sem armazenamento: vale só nesta tela
    }
    for (const f of ouvintes) f();
  };
  return [v, alternar];
}

/**
 * CARTÃO de uma tarefa no quadro (como no Trello): as etiquetas em FAIXAS na cor (tocar mostra/esconde os nomes em todos
 * os cartões — `useEtiquetasComNome`), o círculo de concluir + o título, e na base o nº do TICKET + DUPLICAR o cartão (`onDuplicar`), a
 * PRIORIDADE (bandeira na cor), o PRAZO no semáforo (verde · âmbar · vermelho) e os RESPONSÁVEIS (fotos). O cartão todo é
 * o botão que abre o detalhe (camada que cobre o cartão — os controles de dentro ficam por cima); no mouse/caneta o próprio
 * cartão arrasta, no toque a ALÇA (o dedo no cartão rola a tela) e o menu `acoes` (mover/concluir/arquivar sem arrastar).
 * Alt + setas movem pelo teclado.
 */
export function CartaoTarefa({
  tarefa: t,
  etiquetas,
  pessoas,
  hoje,
  onAbrir,
  onPegar,
  onTeclaMover,
  acoes,
  onConcluir,
  onDuplicar,
  oculto = false,
  campos = [],
}: {
  tarefa: TarefaResumo;
  /** Os campos personalizados do quadro (os marcados "no cartão" aparecem em selos). */
  campos?: CampoTarefa[];
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
  /** Menu de ações no TOQUE (ao lado da alça): mover para outra lista, topo/fim, concluir, arquivar. */
  acoes?: ReactNode;
  /** DUPLICA o cartão (o ícone de cópia ao lado do nº do ticket — como o "Copiar cartão" do Trello). */
  onDuplicar?: () => void;
  /** O CÍRCULO antes do título: conclui/reabre NO LUGAR. Ausente = sem círculo. */
  onConcluir?: () => void;
}) {
  const [nomes, alternarNomes] = useEtiquetasComNome();
  const estado = estadoPrazo(t.prazo, hoje, t.concluidaEm != null, t.prazoHora, horaAgoraBrasilia());
  // No toque, a alça (e o menu) ocupam o canto de cima: o texto não passa por baixo deles.
  const toque = onPegar || acoes ? (acoes && onPegar ? "any-pointer-coarse:pr-[5.25rem]" : "any-pointer-coarse:pr-10") : "";
  const marcas = t.etiquetas.map((e) => etiquetas.get(e)).filter((e): e is EtiquetaTarefa => !!e);
  // Os ENVOLVIDOS: os responsáveis + os membros das equipes da tarefa.
  const resp = t.envolvidos.map((p) => pessoas.get(p)).filter((p): p is Pessoa => !!p);
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
      onPointerDown={(e) => e.pointerType !== "touch" && onPegar?.(e)}
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
        <button
          type="button"
          onClick={alternarNomes}
          aria-label={nomes ? "Esconder os nomes das etiquetas" : "Mostrar os nomes das etiquetas"}
          title={marcas.map((e) => e.nome).join(", ")}
          className={`relative z-10 mb-1.5 flex max-w-full flex-wrap gap-1 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${toque}`}
        >
          {marcas.map((e) =>
            nomes ? (
              <span
                key={e.id}
                className="max-w-[9rem] truncate rounded-control px-2 py-px text-[10.5px] font-semibold"
                style={{ color: e.cor, background: `color-mix(in srgb, ${e.cor} 16%, var(--surface))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${e.cor} 35%, transparent)` }}
              >
                {e.nome}
              </span>
            ) : (
              <span key={e.id} className="h-2 w-10 rounded-full" style={{ background: e.cor }} />
            ),
          )}
        </button>
      )}
      <div className={`flex items-start gap-1.5 pr-6 ${toque}`}>
        {onConcluir && !t.template && (
          <span className="mt-px">
            <CirculoConcluir concluida={t.concluidaEm != null} onAlternar={onConcluir} rotulo={`${rotuloTicket(t.ticket)} ${t.titulo}`} discreto />
          </span>
        )}
        <p className={`pointer-events-none line-clamp-3 min-w-0 flex-1 text-[13px] font-medium leading-snug text-text ${t.concluidaEm ? "line-through decoration-faint" : ""}`}>{t.titulo}</p>
      </div>
      {campos.length > 0 && (
        <span className={`pointer-events-none mt-1.5 block ${toque}`}>
          <ChipsCamposCartao campos={campos} valores={t.campos} />
        </span>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span className="pointer-events-none font-mono tabular-nums">{rotuloTicket(t.ticket)}</span>
        {onDuplicar && (
          <button
            type="button"
            onClick={onDuplicar}
            aria-label={`Duplicar o cartão ${rotuloTicket(t.ticket)}`}
            title="Duplicar cartão"
            className="relative z-10 -my-1 inline-flex h-6 w-6 items-center justify-center rounded-control text-faint opacity-60 transition-opacity hover:bg-surface-2 hover:text-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 group-hover/cartao:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:-my-3 pointer-coarse:opacity-100"
          >
            <IconCopy className="h-3.5 w-3.5" />
          </button>
        )}
        {t.template && (
          <span className="pointer-events-none">
            <Badge tone="violet">Template</Badge>
          </span>
        )}
        {t.prioridade !== "media" && (
          <span className="pointer-events-none inline-flex items-center" title={`Prioridade ${ROTULO_PRIORIDADE[t.prioridade]}`} style={{ color: COR_PRIORIDADE[t.prioridade] }}>
            <IconBandeira className="h-3.5 w-3.5" aria-label={`Prioridade ${ROTULO_PRIORIDADE[t.prioridade]}`} />
          </span>
        )}
        {t.prazo && (
          <span
            className="pointer-events-none inline-flex items-center gap-1 rounded-full px-1.5 py-px font-semibold tabular-nums"
            title={`Prazo ${rotuloData(t.prazo, "", t.prazoHora)} — ${ROTULO_ESTADO_PRAZO[estado]}${t.lembreteMin != null ? " · com lembrete" : ""}`}
            style={{ color: COR_ESTADO_PRAZO[estado], background: `color-mix(in srgb, ${COR_ESTADO_PRAZO[estado]} 12%, var(--surface))` }}
          >
            <IconClock className="h-3 w-3" />
            {rotuloData(t.prazo, hoje, t.prazoHora)}
          </span>
        )}
        {t.recorrencia && (
          <span className="pointer-events-none inline-flex" title={`Recorrente: ${rotuloRecorrencia(t.recorrencia)}`}>
            <IconRepetir className="h-3.5 w-3.5" aria-label="Recorrente" />
          </span>
        )}
        {t.temDescricao && (
          <span className="pointer-events-none inline-flex" title="Tem descrição">
            <IconDescricao className="h-3.5 w-3.5" aria-label="Tem descrição" />
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
        {t.eventos > 0 && (
          <span className="pointer-events-none inline-flex items-center gap-0.5 tabular-nums" title={`${t.eventos} evento(s)`}>
            <IconCalendar className="h-3.5 w-3.5" />
            {t.eventos}
          </span>
        )}
        {t.notas > 0 && (
          <span className="pointer-events-none inline-flex items-center gap-0.5 tabular-nums" title={`${t.notas} nota(s)`}>
            <IconNota className="h-3.5 w-3.5" />
            {t.notas}
          </span>
        )}
        {t.links > 0 && (
          <span className="pointer-events-none inline-flex items-center gap-0.5 tabular-nums" title={`${t.links} link(s)`}>
            <IconWeb className="h-3.5 w-3.5" />
            {t.links}
          </span>
        )}
        {t.vinculos.length > 0 && (
          <span className="pointer-events-none inline-flex items-center gap-0.5 text-accent tabular-nums" title={t.vinculos.map(rotuloDoVinculo).join("\n")}>
            <IconLink className="h-3.5 w-3.5" aria-label={`${t.vinculos.length} vínculo(s)`} />
            {t.vinculos.length > 1 && t.vinculos.length}
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
      {(onPegar || acoes) && (
        <div className="absolute top-0 right-0 z-10 hidden items-center any-pointer-coarse:flex">
          {acoes}
          {onPegar && (
            <span
              role="presentation"
              onPointerDown={(e) => e.pointerType === "touch" && onPegar(e)}
              title="Arrastar"
              className="flex h-11 w-11 touch-none items-center justify-center text-faint"
            >
              <IconGrip className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
    </article>
  );
}
