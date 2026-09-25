"use client";

import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Pessoa } from "@/lib/pessoa";
import { cartoesDaLista, type EtiquetaTarefa, excedeWip, type ListaTarefas, type TarefaResumo } from "@/lib/tarefas-core";
import { AlturaNoHtml, useAlturaAteOFim } from "./AlturaCheia";
import { CartaoPreso, SombraCartao, useArrastoCartoes } from "./ArrastoCartoes";
import { Button } from "./Button";
import { CartaoTarefa } from "./CartaoTarefa";
import { Dropdown } from "./Dropdown";
import { IconArquivar, IconArrowDown, IconArrowRight, IconArrowUp, IconCheck, IconMais, IconPencil, IconPlus } from "./icons";

/**
 * O QUADRO (kanban): as listas lado a lado, roláveis na horizontal (no celular, uma coluna por vez com encaixe — `snap`);
 * no desktop ocupa até o fim do display e cada lista rola por dentro. Arrastar move o cartão (`useArrastoCartoes`) — a
 * mudança é do host (`onMover`, otimista). "Adicionar tarefa" no pé de cada lista cria pelo título — ou abre o formulário
 * completo ("Mais detalhes") naquela lista. No TOQUE, cada cartão tem o menu de ações (mover/topo/fim/concluir/arquivar —
 * sem arrastar) e, no celular, os PONTOS acima do quadro dizem em qual coluna se está (tocar leva a ela).
 */
export function QuadroKanban({
  listas,
  tarefas,
  etiquetas,
  pessoas,
  hoje,
  onAbrir,
  onMover,
  onCriar,
  onDetalhes,
  onArquivar,
}: {
  /** As listas ATIVAS, na ordem. */
  listas: ListaTarefas[];
  /** Os cartões JÁ FILTRADOS (sem arquivados). */
  tarefas: TarefaResumo[];
  etiquetas: EtiquetaTarefa[];
  pessoas: Pessoa[];
  hoje: string;
  onAbrir: (id: number) => void;
  onMover: (id: number, listaId: number, indice: number) => void;
  /** Cria pelo título (resolve quando gravou). */
  onCriar: (listaId: number, titulo: string) => Promise<boolean>;
  /** Abre o formulário COMPLETO de uma tarefa nova na lista (com o título já digitado). */
  onDetalhes: (listaId: number, titulo: string) => void;
  onArquivar: (id: number) => void;
}) {
  const rolo = useRef<HTMLDivElement>(null);
  const altura = useAlturaAteOFim(rolo, true);
  const { arrasto, fantasma, iniciar, foiArrasto } = useArrastoCartoes({ quadro: rolo, onMover });
  const mEtiquetas = useMemo(() => new Map(etiquetas.map((e) => [e.id, e])), [etiquetas]);
  const mPessoas = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const porLista = useMemo(() => new Map(listas.map((l) => [l.id, cartoesDaLista(tarefas, l.id)])), [listas, tarefas]);
  const preso = arrasto ? tarefas.find((t) => t.id === arrasto.id) : undefined;
  const concluidas = listas.find((l) => l.concluida);
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
            {item("Para o topo da lista", <IconArrowUp className="h-4 w-4 text-muted" />, () => onMover(t.id, l.id, 0), pos === 0)}
            {item("Para o fim da lista", <IconArrowDown className="h-4 w-4 text-muted" />, () => onMover(t.id, l.id, Number.MAX_SAFE_INTEGER), pos === total - 1)}
            {concluidas && concluidas.id !== l.id && item("Concluir", <IconCheck className="h-4 w-4" style={{ color: "var(--ok)" }} />, () => onMover(t.id, concluidas.id, Number.MAX_SAFE_INTEGER))}
            {listas
              .filter((x) => x.id !== l.id && x.id !== concluidas?.id)
              .map((x) => item(`Mover para “${x.nome}”`, <IconArrowRight className="h-4 w-4 text-muted" />, () => onMover(t.id, x.id, Number.MAX_SAFE_INTEGER)))}
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

  return (
    <>
    {listas.length > 1 && (
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
      </nav>
    )}
    <div
      ref={rolo}
      suppressHydrationWarning
      style={altura ? { height: altura } : undefined}
      className="-mx-[var(--pad-canvas)] flex items-start snap-x snap-mandatory gap-[var(--gap-block)] overflow-x-auto px-[var(--pad-canvas)] pb-2 lg:snap-none"
    >
      <AlturaNoHtml />
      {listas.map((l) => {
        const cartoes = porLista.get(l.id) ?? [];
        // A SOMBRA do destino entra na posição `indice` entre os cartões SEM o arrastado.
        const destinoAqui = arrasto?.listaId === l.id ? arrasto.indice : -1;
        let j = 0;
        return (
          <ColunaTarefas key={l.id} lista={l} qtd={cartoes.length} onCriar={(titulo) => onCriar(l.id, titulo)} onDetalhes={(titulo) => onDetalhes(l.id, titulo)}>
            {cartoes.map((t, pos) => {
              const sombra = arrasto && t.id !== arrasto.id && j++ === destinoAqui;
              return (
                <Fragment key={t.id}>
                  {sombra && <SombraCartao altura={arrasto.altura} />}
                  <CartaoTarefa
                    tarefa={t}
                    etiquetas={mEtiquetas}
                    pessoas={mPessoas}
                    hoje={hoje}
                    oculto={arrasto?.id === t.id}
                    onAbrir={() => !foiArrasto() && onAbrir(t.id)}
                    onPegar={(e) => iniciar(e, t.id, l.id)}
                    onTeclaMover={(d) => teclaMover(t, d)}
                    acoes={menu(t, l, pos, cartoes.length)}
                  />
                </Fragment>
              );
            })}
            {arrasto && destinoAqui >= 0 && destinoAqui >= cartoes.filter((c) => c.id !== arrasto.id).length && <SombraCartao altura={arrasto.altura} />}
          </ColunaTarefas>
        );
      })}
      {arrasto && preso && (
        <CartaoPreso arrasto={arrasto} fantasma={fantasma}>
          <CartaoTarefa tarefa={preso} etiquetas={mEtiquetas} pessoas={mPessoas} hoje={hoje} />
        </CartaoPreso>
      )}
    </div>
    </>
  );
}

/**
 * UMA LISTA do quadro: o nome, a contagem (com o LIMITE — WIP — em âmbar quando passa), a pilha de cartões (rola por
 * dentro no desktop) e, no pé, "Adicionar tarefa" (vira o campo do título: Enter cria e segue no campo; Esc fecha;
 * "Mais detalhes" leva o título ao formulário completo — o MESMO de toda criação de tarefa).
 */
export function ColunaTarefas({
  lista: l,
  qtd,
  onCriar,
  onDetalhes,
  children,
}: {
  lista: ListaTarefas;
  qtd: number;
  onCriar?: (titulo: string) => Promise<boolean>;
  /** Abre o formulário completo com o título digitado. */
  onDetalhes?: (titulo: string) => void;
  children: ReactNode;
}) {
  const [novo, setNovo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const passou = excedeWip(qtd, l.limiteWip);

  const criar = async () => {
    const titulo = (novo ?? "").trim();
    if (!titulo || !onCriar || salvando) return;
    setSalvando(true);
    const ok = await onCriar(titulo);
    setSalvando(false);
    if (ok) {
      setNovo("");
      campo.current?.focus();
    }
  };

  return (
    <section
      data-lista={l.id}
      aria-label={`Lista ${l.nome}`}
      className="flex w-[min(85vw,19rem)] shrink-0 snap-center flex-col rounded-card border border-border bg-surface-2 lg:max-h-full lg:w-[19rem]"
    >
      <header className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        {l.concluida && <IconCheck className="h-4 w-4 shrink-0" style={{ color: "var(--ok)" }} aria-label="Lista de concluídas" />}
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text" title={l.nome}>
          {l.nome}
        </h2>
        <span
          className="shrink-0 rounded-full px-2 py-px text-[11px] font-semibold tabular-nums"
          title={l.limiteWip ? `Limite de ${l.limiteWip} cartões nesta lista${passou ? " — passou do limite" : ""}` : `${qtd} cartões`}
          style={passou ? { color: "var(--warn)", background: "color-mix(in srgb, var(--warn) 14%, var(--surface))" } : { color: "var(--muted)" }}
        >
          {l.limiteWip ? `${qtd}/${l.limiteWip}` : qtd}
        </span>
      </header>
      <div data-cartoes className="flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {children}
      </div>
      {onCriar &&
        (novo == null ? (
          <div className="px-2 pb-2">
            <Button variant="ghost" size="sm" className="w-full !justify-start text-muted" icon={<IconPlus className="h-4 w-4" />} onClick={() => setNovo("")}>
              Adicionar tarefa
            </Button>
          </div>
        ) : (
          <div className="space-y-2 px-2 pb-2">
            <textarea
              ref={campo}
              // biome-ignore lint/a11y/noAutofocus: o campo aparece pelo clique em "Adicionar tarefa" — o foco vai para ele.
              autoFocus
              rows={2}
              value={novo}
              maxLength={200}
              disabled={salvando}
              aria-label={`Título da nova tarefa em ${l.nome}`}
              placeholder="Título da tarefa"
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  criar();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setNovo(null);
                }
              }}
              className="w-full resize-none rounded-card border border-accent bg-surface px-2.5 py-2 text-[13px] text-text outline-none ring-4 ring-accent/20 placeholder:text-faint"
            />
            <div className="flex gap-2">
              <Button size="sm" loading={salvando} disabled={!novo.trim()} onClick={criar}>
                Adicionar
              </Button>
              {onDetalhes && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={salvando}
                  onClick={() => {
                    onDetalhes(novo.trim());
                    setNovo(null);
                  }}
                >
                  Mais detalhes
                </Button>
              )}
              <Button size="sm" variant="ghost" className="ml-auto" disabled={salvando} onClick={() => setNovo(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ))}
    </section>
  );
}
