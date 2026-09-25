"use client";

import { Fragment, type ReactNode, useMemo, useRef, useState } from "react";
import type { Pessoa } from "@/lib/pessoa";
import { cartoesDaLista, type EtiquetaTarefa, excedeWip, type ListaTarefas, type TarefaResumo } from "@/lib/tarefas-core";
import { AlturaNoHtml, useAlturaAteOFim } from "./AlturaCheia";
import { CartaoPreso, SombraCartao, useArrastoCartoes } from "./ArrastoCartoes";
import { Button } from "./Button";
import { CartaoTarefa } from "./CartaoTarefa";
import { IconCheck, IconPlus } from "./icons";

/**
 * O QUADRO (kanban): as listas lado a lado, roláveis na horizontal (no celular, uma coluna por vez com encaixe — `snap`);
 * no desktop ocupa até o fim do display e cada lista rola por dentro. Arrastar move o cartão (`useArrastoCartoes`) — a
 * mudança é do host (`onMover`, otimista). "Adicionar tarefa" no pé de cada lista cria pelo título.
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
}) {
  const rolo = useRef<HTMLDivElement>(null);
  const altura = useAlturaAteOFim(rolo, true);
  const { arrasto, fantasma, iniciar, foiArrasto } = useArrastoCartoes({ quadro: rolo, onMover });
  const mEtiquetas = useMemo(() => new Map(etiquetas.map((e) => [e.id, e])), [etiquetas]);
  const mPessoas = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const porLista = useMemo(() => new Map(listas.map((l) => [l.id, cartoesDaLista(tarefas, l.id)])), [listas, tarefas]);
  const preso = arrasto ? tarefas.find((t) => t.id === arrasto.id) : undefined;

  const teclaMover = (t: TarefaResumo, d: "esquerda" | "direita" | "cima" | "baixo") => {
    const li = listas.findIndex((l) => l.id === t.listaId);
    const pos = (porLista.get(t.listaId) ?? []).findIndex((x) => x.id === t.id);
    if (d === "cima" && pos > 0) onMover(t.id, t.listaId, pos - 1);
    else if (d === "baixo") onMover(t.id, t.listaId, pos + 1);
    else if (d === "esquerda" && li > 0) onMover(t.id, listas[li - 1].id, Number.MAX_SAFE_INTEGER);
    else if (d === "direita" && li < listas.length - 1) onMover(t.id, listas[li + 1].id, Number.MAX_SAFE_INTEGER);
  };

  return (
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
          <ColunaTarefas key={l.id} lista={l} qtd={cartoes.length} onCriar={(titulo) => onCriar(l.id, titulo)}>
            {cartoes.map((t) => {
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
  );
}

/**
 * UMA LISTA do quadro: o nome, a contagem (com o LIMITE — WIP — em âmbar quando passa), a pilha de cartões (rola por
 * dentro no desktop) e, no pé, "Adicionar tarefa" (vira o campo do título: Enter cria e segue no campo; Esc fecha).
 */
export function ColunaTarefas({
  lista: l,
  qtd,
  onCriar,
  children,
}: {
  lista: ListaTarefas;
  qtd: number;
  onCriar?: (titulo: string) => Promise<boolean>;
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
              <Button size="sm" variant="ghost" disabled={salvando} onClick={() => setNovo(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ))}
    </section>
  );
}
