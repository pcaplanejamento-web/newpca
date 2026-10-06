"use client";

import { type KeyboardEvent, type ReactNode, type PointerEvent as ReactPointerEvent, useSyncExternalStore } from "react";
import { textoSobre } from "@/lib/color";
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
import { PresencaNoItem } from "./PresencaNoItem";
import { ChipsCamposCartao } from "./CamposTarefa";
import { CirculoConcluir } from "./CirculoConcluir";
import { IconBandeira, IconCalendar, IconChecklist, IconClock, IconComentario, IconCopy, IconDescricao, IconGrip, IconLink, IconModelo, IconNota, IconPencil, IconRepetir, IconWeb } from "./icons";

/** Até quantas pessoas aparecem no cartão (as demais viram "+N"). */
const MAX_AVATARES = 3;

/**
 * As ETIQUETAS dos cartões com o NOME (padrão, como no Trello — cheias na cor) ou em FAIXAS — tocar nelas alterna TODOS os cartões;
 * a escolha fica no aparelho (conveniência; sem armazenamento, vale só na tela).
 */
// v2: o padrão virou "com o nome" (como no Trello) — a escolha antiga (de quando o padrão era faixa) não vale mais.
const CHAVE_ETIQUETAS = "tarefas:etiquetas-nome-v2";
const ouvintes = new Set<() => void>();
let comNome: boolean | null = null;
const lerComNome = () => {
  if (comNome == null)
    try {
      comNome = localStorage.getItem(CHAVE_ETIQUETAS) !== "0";
    } catch {
      comNome = true;
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
    () => true,
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
 * CARTÃO de uma tarefa no quadro (no visual do Trello): as ETIQUETAS cheias na cor com o nome (tocar alterna para faixas
 * em todos os cartões — `useEtiquetasComNome`), o selo "Este cartão é um template.", o título e, na base, o PRAZO em selo
 * (concluída = verde cheio; atrasada = vermelho; vence = âmbar), a prioridade, os ícones (descrição, checklist — verde
 * cheio quando completo —, comentários, eventos, notas, links, vínculos) e as FOTOS — o nº do ticket fica só na dica e no detalhe (a face do cartão é limpa, como no Trello). Com o MOUSE sobre o
 * cartão aparecem o CONTORNO de seleção, o CÍRCULO de concluir (o título abre espaço) e os botões EDITAR e DUPLICAR
 * (`onDuplicar`); no toque ficam à vista o círculo, a ALÇA e o menu `acoes`. O cartão todo abre o detalhe; o mouse/caneta
 * arrasta o próprio cartão.
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
  // O PRAZO em selo (como no Trello): concluída = verde cheio; atrasada = vermelho claro; vence hoje/em breve = âmbar claro.
  const corPrazo = COR_ESTADO_PRAZO[estado];
  const selo =
    estado === "concluida"
      ? { background: corPrazo, color: "var(--sobre-escuro)" }
      : estado === "atrasada" || estado === "hoje" || estado === "vence"
        ? { background: `color-mix(in srgb, ${corPrazo} 16%, var(--surface))`, color: corPrazo }
        : undefined;
  const checkCompleto = t.checklist.total > 0 && t.checklist.feitos === t.checklist.total;
  return (
    <article
      data-cartao={t.id}
      onPointerDown={(e) => e.pointerType !== "touch" && onPegar?.(e)}
      title={`${rotuloTicket(t.ticket)} ${t.titulo}`}
      className={`group/cartao relative shrink-0 rounded-lg bg-surface px-3 py-2 shadow-[var(--sombra-cartao)] ${onPegar ? "lg:cursor-grab" : ""} ${oculto ? "hidden" : ""}`}
    >
      {/* A camada que ABRE o cartão — e o CONTORNO de seleção (só com o mouse sobre o cartão ou no foco). */}
      <button
        type="button"
        onClick={onAbrir}
        onKeyDown={tecla}
        aria-label={`${rotuloTicket(t.ticket)} ${t.titulo}${onTeclaMover ? " — Alt + setas move o cartão" : ""}`}
        className="absolute inset-0 rounded-lg transition-shadow duration-[var(--motion-duration)] group-hover/cartao:ring-2 group-hover/cartao:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      {/* A CAPA colorida (como a do Trello) — a faixa de cor no topo do cartão. */}
      {t.capa && <div aria-hidden className="-mx-3 -mt-2 mb-2 h-8 rounded-t-lg" style={{ background: t.capa }} />}
      {/* Com o mouse sobre o cartão: EDITAR (abre) e DUPLICAR — no toque, o menu "⋯". */}
      {(onAbrir || onDuplicar) && (
        <div className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 transition-opacity duration-[var(--motion-duration)] group-hover/cartao:opacity-100 focus-within:opacity-100 any-pointer-coarse:hidden">
          {onDuplicar && (
            <button type="button" onClick={onDuplicar} aria-label={`Duplicar o cartão ${rotuloTicket(t.ticket)}`} title="Duplicar cartão" className={botaoFlutuante}>
              <IconCopy className="h-3.5 w-3.5" />
            </button>
          )}
          {onAbrir && (
            <button type="button" onClick={onAbrir} aria-label={`Editar o cartão ${rotuloTicket(t.ticket)}`} title="Editar cartão" className={botaoFlutuante}>
              <IconPencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
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
                className="max-w-[12rem] truncate rounded-[4px] px-1.5 py-px text-[12px] font-semibold leading-[18px]"
                style={{ background: e.cor, color: textoSobre(e.cor) }}
              >
                {e.nome}
              </span>
            ) : (
              <span key={e.id} className="h-2 w-10 rounded-full" style={{ background: e.cor }} />
            ),
          )}
        </button>
      )}
      {t.template && (
        <span className="pointer-events-none mb-1.5 inline-flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 text-[12.5px] text-accent" style={{ background: "color-mix(in srgb, var(--accent) 12%, var(--surface))" }}>
          <IconModelo className="h-3.5 w-3.5" />
          Este cartão é um template.
        </span>
      )}
      <div className={`flex items-start ${toque}`}>
        {onConcluir && !t.template && (
          // O CÍRCULO só aparece com o mouse sobre o cartão (o título abre espaço para ele); concluída = sempre à vista.
          <span
            className={`mt-[3px] flex shrink-0 overflow-hidden transition-[width,margin] duration-[var(--motion-duration)] ${
              t.concluidaEm
                ? "mr-1.5 w-4"
                : "w-0 group-hover/cartao:mr-1.5 group-hover/cartao:w-4 group-focus-within/cartao:mr-1.5 group-focus-within/cartao:w-4 any-pointer-coarse:mr-1.5 any-pointer-coarse:w-4"
            }`}
          >
            <CirculoConcluir concluida={t.concluidaEm != null} onAlternar={onConcluir} rotulo={`${rotuloTicket(t.ticket)} ${t.titulo}`} discreto />
          </span>
        )}
        <p className="pointer-events-none line-clamp-4 min-w-0 flex-1 pr-7 text-[14px] leading-snug text-text any-pointer-coarse:pr-0">{t.titulo}</p>
      </div>
      {campos.length > 0 && (
        <span className={`pointer-events-none mt-1.5 block ${toque}`}>
          <ChipsCamposCartao campos={campos} valores={t.campos} />
        </span>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px] text-muted empty:hidden">
        {t.prazo && (
          <span
            className="pointer-events-none inline-flex items-center gap-1 rounded-[4px] py-0.5 font-medium tabular-nums"
            title={`Prazo ${rotuloData(t.prazo, "", t.prazoHora)} — ${ROTULO_ESTADO_PRAZO[estado]}${t.lembreteMin != null ? " · com lembrete" : ""}`}
            style={selo ? { ...selo, paddingInline: 6 } : undefined}
          >
            <IconClock className="h-3.5 w-3.5" />
            {rotuloData(t.prazo, hoje, t.prazoHora)}
          </span>
        )}
        {t.prioridade !== "media" && (
          <span className="pointer-events-none inline-flex items-center" title={`Prioridade ${ROTULO_PRIORIDADE[t.prioridade]}`} style={{ color: COR_PRIORIDADE[t.prioridade] }}>
            <IconBandeira className="h-3.5 w-3.5" aria-label={`Prioridade ${ROTULO_PRIORIDADE[t.prioridade]}`} />
          </span>
        )}
        {t.recorrencia && (
          <span className="pointer-events-none inline-flex" title={`Recorrente: ${rotuloRecorrencia(t.recorrencia)}`}>
            <IconRepetir className="h-3.5 w-3.5" aria-label="Recorrente" />
          </span>
        )}
        {t.temDescricao && (
          <span className="pointer-events-none inline-flex" title="Tem descrição">
            <IconDescricao className="h-4 w-4" aria-label="Tem descrição" />
          </span>
        )}
        {t.checklist.total > 0 && (
          <span
            className="pointer-events-none inline-flex items-center gap-1 rounded-[4px] py-0.5 font-medium tabular-nums"
            title={`Checklist ${t.checklist.feitos} de ${t.checklist.total}`}
            style={checkCompleto ? { background: "var(--ok)", color: "var(--sobre-escuro)", paddingInline: 6 } : undefined}
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
        <PresencaNoItem alvo={`tarefa:${t.id}`} className={`pointer-events-none ${resp.length ? "ml-1.5" : "ml-auto"}`} />
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

/** Os botões redondos que aparecem sobre o cartão com o mouse (editar, duplicar). */
const botaoFlutuante =
  "grid h-7 w-7 place-items-center rounded-full bg-surface text-text-2 shadow-ring transition-colors hover:bg-surface-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";
