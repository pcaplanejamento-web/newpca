"use client";

import { Fragment, type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Pessoa } from "@/lib/pessoa";
import { type CampoTarefa, cartoesDaLista, type EtiquetaTarefa, excedeWip, type ListaTarefas, type TarefaResumo } from "@/lib/tarefas-core";
import { AlturaNoHtml, useAlturaAteOFim } from "./AlturaCheia";
import { CartaoPreso, SombraCartao, SombraLista, useArrastoCartoes, useArrastoListas } from "./ArrastoCartoes";
import { Button } from "./Button";
import { CartaoTarefa } from "./CartaoTarefa";
import { Dropdown } from "./Dropdown";
import { type ModoCopia, SeletorTemplates } from "./CopiarMoverTarefa";
import { IconArquivar, IconArrowDown, IconArrowRight, IconArrowUp, IconCheck, IconClose, IconCopy, IconGrip, IconMais, IconModelo, IconPencil, IconPlus } from "./icons";
import { TextoNoLugar } from "./TextoNoLugar";
import { toast } from "./Toast";

/**
 * O QUADRO (kanban): as listas lado a lado, roláveis na horizontal (no celular, uma coluna por vez com encaixe — `snap`);
 * no desktop ocupa até o fim do display e cada lista rola por dentro. Arrastar move o cartão (`useArrastoCartoes`) — a
 * mudança é do host (`onMover`, otimista). "Adicionar tarefa" no pé de cada lista abre o BANNER da tarefa nova naquela
 * lista (`onNova` — o mesmo formulário de toda criação). O CÍRCULO do cartão conclui/reabre NO LUGAR (`onConcluir`). No
 * TOQUE, cada cartão tem o menu de ações (mover/topo/fim/concluir/copiar/outro quadro/template/arquivar —
 * sem arrastar); no pé da lista, o ícone de TEMPLATE cria a tarefa a partir de um template (`onDoTemplate`) e, no celular, os PONTOS acima do quadro dizem em qual coluna se está (tocar leva a ela).
 */
export function QuadroKanban({
  listas,
  tarefas,
  etiquetas,
  campos = [],
  pessoas,
  hoje,
  onAbrir,
  onMover,
  onNova,
  onArquivar,
  onConcluir,
  templates = [],
  onDoTemplate,
  onCopiarMover,
  onDuplicar,
  menuLista,
  onNovaLista,
  onMoverLista,
  onRenomearLista,
}: {
  /** As listas ATIVAS, na ordem. */
  listas: ListaTarefas[];
  /** Os cartões JÁ FILTRADOS (sem arquivados). */
  tarefas: TarefaResumo[];
  etiquetas: EtiquetaTarefa[];
  /** Os campos personalizados do quadro (os "no cartão" aparecem nos cartões). */
  campos?: CampoTarefa[];
  pessoas: Pessoa[];
  hoje: string;
  onAbrir: (id: number) => void;
  onMover: (id: number, listaId: number, indice: number) => void;
  /** Abre o banner de uma tarefa NOVA na lista. */
  onNova: (listaId: number) => void;
  onArquivar: (id: number) => void;
  /** Conclui/reabre NO LUGAR (o círculo do cartão e o menu do toque). */
  onConcluir: (id: number) => void;
  /** Os TEMPLATES do quadro (o seletor do pé da lista). */
  templates?: TarefaResumo[];
  /** Cria a tarefa a partir do template, na lista. */
  onDoTemplate?: (templateId: number, listaId: number) => void;
  /** Abre Copiar · Mover para outro quadro · Criar template. */
  onCopiarMover?: (id: number, modo: ModoCopia) => void;
  /** DUPLICA o cartão logo abaixo (o ícone de cópia do cartão e o menu do toque); ausente = sem a ação. */
  onDuplicar?: (id: number) => void;
  /** O menu "…" de cada lista (`MenuLista`, montado pelo host — as ações são dele). */
  menuLista?: (l: ListaTarefas) => ReactNode;
  /** Cria uma LISTA no fim do quadro (a coluna "Adicionar outra lista"); ausente = sem a coluna. */
  onNovaLista?: (nome: string) => Promise<boolean>;
  /** REORDENA as listas arrastando pelo cabeçalho (`indice` = a posição sem a própria lista); ausente = não arrasta. */
  onMoverLista?: (id: number, indice: number) => void;
  /** Renomeia a lista NO LUGAR (clique no nome); ausente = só leitura. */
  onRenomearLista?: (id: number, nome: string) => Promise<boolean>;
}) {
  const rolo = useRef<HTMLDivElement>(null);
  const altura = useAlturaAteOFim(rolo, true);
  const { arrasto, fantasma, iniciar, foiArrasto } = useArrastoCartoes({ quadro: rolo, onMover });
  const arrastoL = useArrastoListas({ quadro: rolo, onMover: onMoverLista });
  const presaL = arrastoL.arrasto ? listas.find((l) => l.id === arrastoL.arrasto?.id) : undefined;
  const mEtiquetas = useMemo(() => new Map(etiquetas.map((e) => [e.id, e])), [etiquetas]);
  const mPessoas = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const porLista = useMemo(() => new Map(listas.map((l) => [l.id, cartoesDaLista(tarefas, l.id)])), [listas, tarefas]);
  const preso = arrasto ? tarefas.find((t) => t.id === arrasto.id) : undefined;
  // A coluna à vista no celular (uma por vez, com encaixe): a mais próxima da borda esquerda da área rolável.
  const [atual, setAtual] = useState(0);
  useEffect(() => {
    const el = rolo.current;
    if (!el) return;
    const ver = () => {
      const cols = [...el.querySelectorAll<HTMLElement>("[data-lista]")];
      const x = el.scrollLeft + el.clientWidth / 2;
      let i = 0;
      cols.forEach((c, k) => {
        if (c.offsetLeft <= x) i = k;
      });
      setAtual(i);
    };
    el.addEventListener("scroll", ver, { passive: true });
    return () => el.removeEventListener("scroll", ver);
  }, []);
  const irPara = (i: number) => rolo.current?.querySelectorAll<HTMLElement>("[data-lista]")[i]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

  /** O menu de ações do cartão no TOQUE (sem arrastar). */
  const menu = (t: TarefaResumo, l: ListaTarefas, pos: number, total: number) => (
    <Dropdown
      align="end"
      ariaLabel={`Ações da tarefa ${t.titulo}`}
      triggerClassName="h-11 w-11 justify-center text-faint"
      trigger={<IconMais className="h-4 w-4" />}
      width={260}
    >
      {(fechar) => {
        const item = (rotulo: string, icone: ReactNode, fn: () => void, off = false) => (
          <button
            key={rotulo}
            type="button"
            disabled={off}
            onClick={() => {
              fechar();
              fn();
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-text hover:bg-surface-2 disabled:opacity-40"
          >
            {icone}
            <span className="truncate">{rotulo}</span>
          </button>
        );
        return (
          <div className="space-y-0.5">
            {item("Abrir", <IconPencil className="h-4 w-4 text-muted" />, () => onAbrir(t.id))}
            {onDuplicar && item("Duplicar", <IconCopy className="h-4 w-4 text-muted" />, () => onDuplicar(t.id))}
            {item("Para o topo da lista", <IconArrowUp className="h-4 w-4 text-muted" />, () => onMover(t.id, l.id, 0), pos === 0)}
            {item("Para o fim da lista", <IconArrowDown className="h-4 w-4 text-muted" />, () => onMover(t.id, l.id, Number.MAX_SAFE_INTEGER), pos === total - 1)}
            {!t.template && item(t.concluidaEm ? "Reabrir" : "Concluir", <IconCheck className="h-4 w-4" style={{ color: "var(--ok)" }} />, () => onConcluir(t.id))}
            {listas
              .filter((x) => x.id !== l.id)
              .map((x) => item(`Mover para “${x.nome}”`, <IconArrowRight className="h-4 w-4 text-muted" />, () => onMover(t.id, x.id, Number.MAX_SAFE_INTEGER)))}
            {onCopiarMover && item("Copiar…", <IconCopy className="h-4 w-4 text-muted" />, () => onCopiarMover(t.id, "copiar"))}
            {onCopiarMover && item("Mover para outro quadro…", <IconArrowRight className="h-4 w-4 text-muted" />, () => onCopiarMover(t.id, "mover"))}
            {onCopiarMover && !t.template && item("Criar template…", <IconModelo className="h-4 w-4 text-muted" />, () => onCopiarMover(t.id, "template"))}
            {item("Arquivar", <IconArquivar className="h-4 w-4 text-muted" />, () => onArquivar(t.id))}
          </div>
        );
      }}
    </Dropdown>
  );

  const teclaMover = (t: TarefaResumo, d: "esquerda" | "direita" | "cima" | "baixo") => {
    const li = listas.findIndex((l) => l.id === t.listaId);
    const pos = (porLista.get(t.listaId) ?? []).findIndex((x) => x.id === t.id);
    if (d === "cima" && pos > 0) onMover(t.id, t.listaId, pos - 1);
    else if (d === "baixo") onMover(t.id, t.listaId, pos + 1);
    else if (d === "esquerda" && li > 0) onMover(t.id, listas[li - 1].id, Number.MAX_SAFE_INTEGER);
    else if (d === "direita" && li < listas.length - 1) onMover(t.id, listas[li + 1].id, Number.MAX_SAFE_INTEGER);
  };

  /** Uma coluna do quadro (a real, ou a PRESA ao cursor — `presa`, sem interação). */
  const coluna = (l: ListaTarefas, presa = false) => {
    const cartoes = porLista.get(l.id) ?? [];
    // A SOMBRA do destino entra na posição `indice` entre os cartões SEM o arrastado.
    const destinoAqui = !presa && arrasto?.listaId === l.id ? arrasto.indice : -1;
    let j = 0;
    return (
      <ColunaTarefas
        lista={l}
        qtd={cartoes.filter((c) => !c.template).length}
        oculto={!presa && arrastoL.arrasto?.id === l.id}
        onPegar={presa || !onMoverLista ? undefined : (e) => arrastoL.iniciar(e, l.id)}
        onRenomear={presa || !onRenomearLista ? undefined : (nome) => onRenomearLista(l.id, nome)}
        onNova={() => !presa && onNova(l.id)}
        menu={presa ? undefined : menuLista?.(l)}
        extra={!presa && onDoTemplate && <SeletorTemplates templates={templates} etiquetas={mEtiquetas} lista={l.nome} onEscolher={(id) => onDoTemplate(id, l.id)} />}
      >
        {cartoes.map((t, pos) => {
          const sombra = arrasto && destinoAqui >= 0 && t.id !== arrasto.id && j++ === destinoAqui;
          return (
            <Fragment key={t.id}>
              {sombra && <SombraCartao altura={arrasto.altura} />}
              {presa ? (
                <CartaoTarefa tarefa={t} etiquetas={mEtiquetas} campos={campos} pessoas={mPessoas} hoje={hoje} />
              ) : (
                <CartaoTarefa
                  tarefa={t}
                  etiquetas={mEtiquetas}
                  campos={campos}
                  pessoas={mPessoas}
                  hoje={hoje}
                  oculto={arrasto?.id === t.id}
                  onAbrir={() => !foiArrasto() && onAbrir(t.id)}
                  onPegar={(e) => iniciar(e, t.id, l.id)}
                  onTeclaMover={(d) => teclaMover(t, d)}
                  acoes={menu(t, l, pos, cartoes.length)}
                  onConcluir={t.template ? undefined : () => onConcluir(t.id)}
                  onDuplicar={onDuplicar && (() => onDuplicar(t.id))}
                />
              )}
            </Fragment>
          );
        })}
        {arrasto && destinoAqui >= 0 && destinoAqui >= cartoes.filter((c) => c.id !== arrasto.id).length && <SombraCartao altura={arrasto.altura} />}
      </ColunaTarefas>
    );
  };

  return (
    <>
    {listas.length + (onNovaLista ? 1 : 0) > 1 && (
      <nav aria-label="Colunas do quadro" className="-mt-1 flex gap-1.5 overflow-x-auto lg:hidden">
        {listas.map((l, i) => (
          <button
            key={l.id}
            type="button"
            aria-current={i === atual}
            onClick={() => irPara(i)}
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors ${
              i === atual ? "bg-accent text-white" : "bg-surface-2 text-text-2"
            }`}
          >
            <span className="max-w-[8rem] truncate">{l.nome}</span>
            <span className="tabular-nums opacity-80">{porLista.get(l.id)?.length ?? 0}</span>
          </button>
        ))}
        {onNovaLista && (
          <button
            type="button"
            aria-label="Ir para Adicionar outra lista"
            aria-current={atual === listas.length}
            onClick={() => irPara(listas.length)}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors ${atual === listas.length ? "bg-accent text-white" : "bg-surface-2 text-text-2"}`}
          >
            <IconPlus className="h-4 w-4" />
          </button>
        )}
      </nav>
    )}
    <div
      ref={rolo}
      suppressHydrationWarning
      style={altura ? { height: altura } : undefined}
      className="-mx-[var(--pad-canvas)] flex items-start snap-x snap-mandatory gap-[var(--gap-block)] overflow-x-auto px-[var(--pad-canvas)] pb-2 lg:snap-none"
    >
      <AlturaNoHtml />
      {(() => {
        // A SOMBRA da LISTA em arrasto entra na posição `indice` entre as outras listas.
        const aL = arrastoL.arrasto;
        let k = 0;
        const sombraL = aL && <SombraLista key="sombra-lista" largura={aL.largura} altura={aL.altura} />;
        const colunas = listas.map((l) => {
          const antes = aL && l.id !== aL.id && k++ === aL.indice ? sombraL : null;
          return (
            <Fragment key={l.id}>
              {antes}
              {coluna(l)}
            </Fragment>
          );
        });
        return (
          <>
            {colunas}
            {aL && aL.indice >= listas.filter((l) => l.id !== aL.id).length && sombraL}
          </>
        );
      })()}
      {onNovaLista && <NovaLista onCriar={onNovaLista} />}
      {arrastoL.arrasto && presaL && (
        <CartaoPreso arrasto={arrastoL.arrasto} fantasma={arrastoL.fantasma}>
          {coluna(presaL, true)}
        </CartaoPreso>
      )}
      {arrasto && preso && (
        <CartaoPreso arrasto={arrasto} fantasma={fantasma}>
          <CartaoTarefa tarefa={preso} etiquetas={mEtiquetas} campos={campos} pessoas={mPessoas} hoje={hoje} />
        </CartaoPreso>
      )}
    </div>
    </>
  );
}

/**
 * "+ ADICIONAR OUTRA LISTA" — a última coluna do quadro (como no Trello): tocar abre o campo do nome; Enter cria a lista no
 * fim e o campo segue aberto (e vazio) para a próxima; Esc, "X" ou tocar fora fecha. Uma gravação por vez.
 */
export function NovaLista({ onCriar }: { onCriar: (nome: string) => Promise<boolean> }) {
  const [aberta, setAberta] = useState(false);
  const [nome, setNome] = useState("");
  const [gravando, setGravando] = useState(false);
  const trava = useRef(false);
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = () => {
    if (trava.current) return;
    setAberta(false);
    setNome("");
  };
  // Tocar fora fecha (sem nome digitado ou já gravado — nada se perde sem querer).
  useEffect(() => {
    if (!aberta) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node) && !nome.trim()) fechar();
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  });
  const criar = async () => {
    const n = nome.trim();
    if (!n || trava.current) return;
    trava.current = true;
    setGravando(true);
    try {
      if (await onCriar(n)) setNome("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      trava.current = false;
      setGravando(false);
    }
  };
  return (
    <div ref={caixa} data-lista="nova" className="w-[min(85vw,17.5rem)] shrink-0 snap-center lg:w-[17.5rem]">
      {aberta ? (
        <div className="space-y-2 rounded-card border border-border bg-surface-2 p-2">
          <input
            // biome-ignore lint/a11y/noAutofocus: abre para digitar depois do toque em "Adicionar outra lista".
            autoFocus
            value={nome}
            maxLength={60}
            disabled={gravando}
            aria-label="Nome da lista"
            placeholder="Nome da lista…"
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                criar();
              } else if (e.key === "Escape") fechar();
            }}
            className="h-11 w-full rounded-control border border-accent bg-surface px-3 text-[13px] text-text outline-none ring-4 ring-accent/20 placeholder:text-faint lg:h-[var(--h-control-sm)]"
          />
          <div className="flex items-center gap-1">
            <Button size="sm" variant="accent" loading={gravando} disabled={!nome.trim()} onClick={criar}>
              Adicionar lista
            </Button>
            <Button size="sm" variant="ghost" aria-label="Cancelar" disabled={gravando} icon={<IconClose className="h-4 w-4" />} onClick={fechar} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAberta(true)}
          className="flex min-h-11 w-full items-center gap-2 rounded-card bg-surface-2/60 px-3 py-2.5 text-left text-[13px] font-semibold text-text-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <IconPlus className="h-4 w-4" />
          Adicionar outra lista
        </button>
      )}
    </div>
  );
}

/**
 * UMA LISTA do quadro (no visual do Trello): o NOME — um clique edita no lugar (`onRenomear`) —, a contagem (com o LIMITE —
 * WIP — em âmbar quando passa), o menu "…", a pilha de cartões (rola por dentro no desktop) e, no pé, "Adicionar um cartão"
 * — abre o banner da tarefa nova nesta lista (`onNova`) — e o `extra` (o seletor de templates). O CABEÇALHO arrasta a lista
 * (`onPegar`; no toque, pela alça); `oculto` = a lista em arrasto (a sombra está no lugar dela).
 */
export function ColunaTarefas({
  lista: l,
  qtd,
  onNova,
  extra,
  menu,
  onPegar,
  onRenomear,
  oculto = false,
  children,
}: {
  lista: ListaTarefas;
  qtd: number;
  onNova?: () => void;
  extra?: ReactNode;
  /** O menu "…" da lista, no cabeçalho. */
  menu?: ReactNode;
  /** Começa o arrasto da LISTA (o cabeçalho no mouse; a alça no toque). Ausente = não arrasta. */
  onPegar?: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Renomeia a lista (o nome vira campo com um clique). Ausente = só leitura. */
  onRenomear?: (nome: string) => Promise<boolean>;
  oculto?: boolean;
  children: ReactNode;
}) {
  const passou = excedeWip(qtd, l.limiteWip);
  return (
    <section
      data-lista={l.id}
      aria-label={`Lista ${l.nome}`}
      className={`flex w-[min(85vw,17.5rem)] shrink-0 snap-center flex-col rounded-xl bg-surface-2 shadow-ring lg:max-h-full lg:w-[17.5rem] ${oculto ? "hidden" : ""}`}
    >
      <header
        onPointerDown={(e) => {
          // Mouse/caneta: o cabeçalho inteiro arrasta — menos o campo do nome e o menu.
          if (!onPegar || e.pointerType === "touch" || (e.target as HTMLElement).closest("input, [data-sem-arrasto]")) return;
          onPegar(e);
        }}
        className={`flex items-center gap-1 py-1.5 pr-1 pl-3 ${onPegar ? "lg:cursor-grab" : ""}`}
      >
        {l.concluida && <IconCheck className="h-4 w-4 shrink-0" style={{ color: "var(--ok)" }} aria-label="Lista de concluídas" />}
        <h2 className="min-w-0 flex-1">
          <TextoNoLugar valor={l.nome} onSalvar={onRenomear} ariaLabel="Nome da lista" className="text-[14px] font-semibold text-text" />
        </h2>
        <span
          className="shrink-0 rounded-full px-1.5 py-px text-[12px] font-semibold tabular-nums"
          title={l.limiteWip ? `Limite de ${l.limiteWip} cartões nesta lista${passou ? " — passou do limite" : ""}` : `${qtd} cartões`}
          style={passou ? { color: "var(--warn)", background: "color-mix(in srgb, var(--warn) 14%, var(--surface))" } : { color: "var(--muted)" }}
        >
          {l.limiteWip ? `${qtd}/${l.limiteWip}` : qtd}
        </span>
        {onPegar && (
          <span
            role="presentation"
            data-sem-arrasto
            onPointerDown={(e) => e.pointerType === "touch" && onPegar(e)}
            title="Arrastar a lista"
            className="hidden h-11 w-9 shrink-0 touch-none items-center justify-center text-faint any-pointer-coarse:flex"
          >
            <IconGrip className="h-4 w-4" />
          </span>
        )}
        {menu && <span data-sem-arrasto className="shrink-0">{menu}</span>}
      </header>
      <div data-cartoes className="flex min-h-2 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-0.5 pb-1">
        {children}
      </div>
      {onNova && (
        <div className="flex items-center gap-1 px-2 pt-1 pb-2">
          <Button variant="ghost" size="sm" className="min-w-0 flex-1 !justify-start text-text-2" icon={<IconPlus className="h-4 w-4" />} aria-label={`Adicionar um cartão em ${l.nome}`} onClick={onNova}>
            Adicionar um cartão
          </Button>
          {extra}
        </div>
      )}
    </section>
  );
}
