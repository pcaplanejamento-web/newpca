"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EdicaoTabela } from "@/lib/edicoes-tabela-core";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { SearchField } from "./Field";
import { IconAlert, IconClose, IconEstrela, IconFilter, IconFixar, IconLimpar, IconRestaurar, IconSave, IconSettings, IconTrash, IconUsers, IconVisao } from "./icons";
import { duracaoMotionMs } from "./Modal";

// A chave do chip da visão na animação de saída (nenhuma parte dos filtros se chama assim).
const CHAVE_VISAO = "\u0000visao";
/** Acima disto, as visões ganham a busca. */
const BUSCA_VISOES = 6;
/** Valores listados na dica de um chip (o resto vira "e mais N"). */
const DICA_VALORES = 30;

/** Um filtro feito (o que difere da referência): a parte, o rótulo e os valores escolhidos (nenhum = "Todos"). */
export type ChipFiltro = { chave: string; rotulo: string; valores: string[] };

/** A visão APLICADA: o nome, se mudou algo depois de aplicar (`alterada`) e se é da pessoa (só a dona a atualiza). */
export type VisaoAplicada = { id: number; nome: string; alterada: boolean; minha: boolean };

const dicaChip = (c: ChipFiltro) => {
  if (!c.valores.length) return `${c.rotulo}: Todos`;
  const mais = c.valores.length - DICA_VALORES;
  return `${c.rotulo} (${c.valores.length}): ${c.valores.slice(0, DICA_VALORES).join(", ")}${mais > 0 ? ` e mais ${mais}` : ""}`;
};

/**
 * O PAINEL DOS FILTROS (DS): o gatilho com o número de filtros (e o nome da visão aplicada) e, ao abrir — em blocos, com
 * ícones —: os filtros feitos em CHIPS SÓLIDOS (o 1º valor + "+N", a lista inteira na dica; o × devolve a parte à
 * referência; a área rola — qualquer quantidade cabe), a VISÃO aplicada num chip de destaque ("alterada" quando algo mudou
 * depois), as visões salvas (busca acima de 6; as públicas com o autor) e, para o ADM, o ESTADO INICIAL do lugar — o
 * ponto de partida de todos, que nunca aparece como filtro. Na altura dos controles; 44px no toque; no celular, folha.
 */
export function PainelFiltros({
  chips,
  visao,
  minhas,
  publicas,
  podeModerar,
  gravando,
  avisoAusentes,
  onTirar,
  onLimpar,
  onTirarVisao,
  onAplicar,
  onExcluirVisao,
  onSalvar,
  inicial,
  minhaPadrao,
  podeSalvar,
}: {
  chips: ChipFiltro[];
  visao: VisaoAplicada | null;
  minhas: EdicaoTabela[];
  publicas: EdicaoTabela[];
  /** Quem CONFIGURA a tela exclui também as visões públicas de outras pessoas. */
  podeModerar: boolean;
  gravando: boolean;
  /** Quantos valores filtrados não existem nos dados carregados (aparecem com zero). */
  avisoAusentes?: number;
  onTirar: (chave: string) => void;
  onLimpar: () => void;
  onTirarVisao: () => void;
  onAplicar: (e: EdicaoTabela) => void;
  onExcluirVisao: (e: EdicaoTabela) => void;
  onSalvar: () => void;
  /** Só o ADM: definir o que está escolhido como o estado inicial do lugar, ou voltar ao padrão do sistema. */
  inicial?: { definido: boolean; onDefinir: () => void; onRestaurar: () => void };
  /** As TABELAS: a visão em uso como a padrão SÓ DA PESSOA (vence o estado inicial do ADM) — o alfinete alterna. */
  minhaPadrao?: { ativa: boolean; onAlternar: () => void };
  /** Salvar sem nenhum filtro (as tabelas salvam também as colunas e a ordem); padrão = só com filtros. */
  podeSalvar?: boolean;
}) {
  const total = chips.length + (visao ? 1 : 0);
  const [aberto, setAberto] = useState(false);
  const [folha, setFolha] = useState(false);
  const [busca, setBusca] = useState("");
  // O chip que está SAINDO (encolhe e esmaece antes de a parte voltar à referência — a lista não salta).
  const [saindo, setSaindo] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const lista = timers.current;
    return () => {
      for (const t of lista) window.clearTimeout(t);
    };
  }, []);
  // A lista nova (outra visão, filtro mudado por fora) zera o que estava saindo.
  const assinatura = chips.map((c) => c.chave).join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera só quando o CONJUNTO de chips muda.
  useEffect(() => setSaindo(new Set()), [assinatura, visao?.id]);
  const tirar = (chave: string, f: () => void) => {
    if (saindo.has(chave)) return;
    setSaindo((s) => new Set(s).add(chave));
    timers.current.push(window.setTimeout(f, duracaoMotionMs()));
  };
  const nVisoes = minhas.length + publicas.length;
  const filtrar = useMemo(() => {
    const p = busca ? predicadoBusca(busca) : null;
    return (l: EdicaoTabela[]) => (p ? l.filter((e) => p([e.nome, e.autor])) : l);
  }, [busca]);
  const minhasVistas = filtrar(minhas);
  const publicasVistas = filtrar(publicas);
  const rotulo = total ? `Filtros (${total})${visao ? ` — visão ${visao.nome}` : ""}` : "Filtros e visões";
  const tituloSalvar = visao?.alterada && visao.minha ? `Atualizar a visão “${visao.nome}”` : "Salvar como visão";
  const saiCls = "transition-[opacity,scale] duration-[var(--motion-duration)] ease-out motion-reduce:transition-none";
  return (
    <Dropdown
      papel="dialog"
      align="end"
      width={360}
      folha={folha}
      aberto={aberto}
      onAberto={(v) => {
        if (v) setFolha(!window.matchMedia("(min-width: 40rem)").matches);
        else setBusca("");
        setAberto(v);
      }}
      ariaLabel={rotulo}
      title={rotulo}
      triggerClassName={`relative h-11 min-w-11 shrink-0 justify-center gap-1.5 rounded-control border px-2.5 transition-colors lg:h-[var(--h-control-sm)] lg:min-w-[var(--h-control-sm)] ${
        total ? "border-accent/40 bg-accent-soft text-accent hover:bg-accent/15" : "border-transparent text-muted hover:bg-surface-2 hover:text-text"
      }`}
      trigger={
        <>
          {visao ? <IconVisao className="h-4 w-4 shrink-0" /> : <IconFilter className="h-4 w-4 shrink-0" />}
          {visao && <span className="hidden max-w-36 truncate text-[13px] font-medium sm:inline">{visao.nome}</span>}
          {total > 0 && (
            <span
              key={total}
              className="animate-selo-pop absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white tabular-nums"
            >
              {total}
            </span>
          )}
        </>
      }
    >
      <div className="space-y-3 p-1">
        {/* FILTROS: o título com a contagem e as ações (salvar como visão · limpar) em ícones. */}
        <section aria-label="Filtros feitos" className="space-y-2">
          <div className="flex items-center gap-1.5">
            <IconFilter className="h-4 w-4 shrink-0 text-muted" />
            <span className="text-[13px] font-semibold text-text">Filtros</span>
            <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold leading-5 text-text-2 tabular-nums">{total}</span>
            <span className="ml-auto flex items-center gap-0.5">
              <Button
                variant="icon"
                size="xs"
                icon={<IconSave className="h-4 w-4" />}
                aria-label={tituloSalvar}
                title={tituloSalvar}
                disabled={gravando || !(podeSalvar ?? total > 0)}
                onClick={() => {
                  // O diálogo de salvar abre no lugar do painel (o painel por cima dele cobriria o formulário).
                  setAberto(false);
                  onSalvar();
                }}
              />
              <Button
                variant="icon"
                size="xs"
                icon={<IconLimpar className="h-4 w-4" />}
                aria-label="Limpar (voltar ao estado inicial)"
                title={total ? "Limpar (voltar ao estado inicial)" : "Nenhum filtro feito"}
                disabled={!total}
                onClick={onLimpar}
              />
            </span>
          </div>
          {total === 0 ? (
            <p className="rounded-control bg-surface-2 px-2.5 py-2 text-[12.5px] text-muted">Estado inicial — nenhum filtro.</p>
          ) : (
            <ul className="-mr-1 flex max-h-48 flex-wrap content-start gap-1.5 overflow-y-auto overscroll-contain pr-1">
              {visao && (
                <li className={`flex max-w-full ${saiCls} ${saindo.has(CHAVE_VISAO) ? "scale-90 opacity-0" : "animate-chip-entra"}`}>
                  <span
                    className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-chip bg-accent pl-2.5 text-[13px] font-medium text-white lg:h-[var(--h-control-sm)]"
                    title={`Visão aplicada: ${visao.nome}${visao.alterada ? " (alterada)" : ""}`}
                  >
                    <IconVisao className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate">{visao.nome}</span>
                    {visao.alterada && (
                      <span className="shrink-0 rounded-full bg-white/20 px-1.5 text-[11px] leading-5" title="Algo mudou depois de aplicar a visão">
                        alterada
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => tirar(CHAVE_VISAO, onTirarVisao)}
                      aria-label={`Tirar a visão ${visao.nome}`}
                      title="Tirar a visão (voltar ao estado inicial)"
                      className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-chip hover:bg-white/15 lg:h-[var(--h-control-sm)] lg:w-7"
                    >
                      <IconClose className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              )}
              {chips.map((c) => (
                <li key={c.chave} className={`flex max-w-full ${saiCls} ${saindo.has(c.chave) ? "scale-90 opacity-0" : "animate-chip-entra"}`}>
                  <span
                    className="inline-flex h-11 max-w-full items-center gap-1 rounded-chip border border-accent/40 bg-accent-soft pl-2.5 text-[13px] text-accent lg:h-[var(--h-control-sm)]"
                    title={dicaChip(c)}
                  >
                    <span className="shrink-0 opacity-70">{c.rotulo}</span>
                    <span className="min-w-0 max-w-44 truncate font-medium">{c.valores[0] ?? "Todos"}</span>
                    {c.valores.length > 1 && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[11px] font-semibold leading-5 tabular-nums">+{c.valores.length - 1}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => tirar(c.chave, () => onTirar(c.chave))}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" || e.key === "Delete") {
                          e.preventDefault();
                          tirar(c.chave, () => onTirar(c.chave));
                        }
                      }}
                      aria-label={`Tirar o filtro ${c.rotulo}`}
                      title={`Tirar o filtro ${c.rotulo}`}
                      className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-chip hover:bg-accent/15 lg:h-[var(--h-control-sm)] lg:w-7"
                    >
                      <IconClose className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {avisoAusentes ? (
            <p className="flex items-center gap-1.5 text-[12px] text-text-2" title="Valores escolhidos que os anos carregados não têm: contam zero.">
              <IconAlert className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--warn)" }} />
              {avisoAusentes === 1 ? "1 valor sem dados no período" : `${avisoAusentes} valores sem dados no período`}
            </p>
          ) : null}
        </section>

        {/* VISÕES: as minhas e as públicas (com o autor); tocar aplica, a lixeira exclui. */}
        <section aria-label="Visões salvas" className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-1.5">
            <IconVisao className="h-4 w-4 shrink-0 text-muted" />
            <span className="text-[13px] font-semibold text-text">Visões</span>
            <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold leading-5 text-text-2 tabular-nums">{nVisoes}</span>
          </div>
          {nVisoes === 0 ? (
            <p className="rounded-control bg-surface-2 px-2.5 py-2 text-[12.5px] text-muted">Faça os filtros e salve no ícone do disquete.</p>
          ) : (
            <>
              {nVisoes > BUSCA_VISOES && (
                <SearchField compacto value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} placeholder="Buscar visão…" aria-label="Buscar visão" />
              )}
              <div className="-mr-1 max-h-52 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
                <ListaVisoes lista={minhasVistas} atual={visao?.id ?? null} gravando={gravando} podeExcluir={() => true} onAplicar={onAplicar} onExcluir={onExcluirVisao} />
                <ListaVisoes lista={publicasVistas} atual={visao?.id ?? null} gravando={gravando} podeExcluir={() => podeModerar} onAplicar={onAplicar} onExcluir={onExcluirVisao} />
                {busca && minhasVistas.length + publicasVistas.length === 0 && <p className="px-2 py-1.5 text-[12.5px] text-muted">Nenhuma visão encontrada.</p>}
              </div>
            </>
          )}
        </section>

        {(inicial || minhaPadrao) && (
          <section aria-label="Estado inicial" className="flex items-center gap-1.5 border-t border-border pt-3">
            <IconSettings className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text" title="O ponto de partida da tela para todos (não aparece como filtro)">
              Estado inicial
            </span>
            {minhaPadrao && (
              <Button
                variant="icon"
                size="xs"
                aria-pressed={minhaPadrao.ativa}
                icon={<IconEstrela className={`h-4 w-4 ${minhaPadrao.ativa ? "fill-current text-accent" : ""}`} />}
                aria-label={minhaPadrao.ativa ? "Deixar de abrir nesta visão" : "Abrir sempre nesta visão (só para mim)"}
                title={minhaPadrao.ativa ? "Sua padrão (vence o estado inicial) — tocar desfaz" : "Abrir sempre nesta visão (só para mim — vence o estado inicial)"}
                disabled={gravando}
                onClick={minhaPadrao.onAlternar}
              />
            )}
            {inicial?.definido && (
              <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[11px] leading-5 text-text-2" title="Definido pelo administrador">
                definido
              </span>
            )}
            {inicial && (
              <>
            <Button
              variant="icon"
              size="xs"
              icon={<IconFixar className="h-4 w-4" />}
              aria-label="Definir o que está escolhido como o estado inicial"
              title="Definir o que está escolhido como o estado inicial (para todos)"
              disabled={gravando || !(podeSalvar ?? total > 0)}
              onClick={inicial.onDefinir}
            />
            <Button
              variant="icon"
              size="xs"
              icon={<IconRestaurar className="h-4 w-4" />}
              aria-label="Voltar ao padrão do sistema"
              title={inicial.definido ? "Voltar ao padrão do sistema (sem filtros)" : "O estado inicial já é o padrão do sistema"}
              disabled={gravando || !inicial.definido}
              onClick={inicial.onRestaurar}
            />
              </>
            )}
          </section>
        )}
      </div>
    </Dropdown>
  );
}

function ListaVisoes({
  lista,
  atual,
  gravando,
  podeExcluir,
  onAplicar,
  onExcluir,
}: {
  lista: EdicaoTabela[];
  atual: number | null;
  gravando: boolean;
  podeExcluir: (e: EdicaoTabela) => boolean;
  onAplicar: (e: EdicaoTabela) => void;
  onExcluir: (e: EdicaoTabela) => void;
}) {
  return lista.map((e) => {
    const ativa = e.id === atual;
    const publica = e.publico || !e.minha;
    return (
      <div key={e.id} className={`flex items-center gap-1 rounded-control pr-0.5 ${ativa ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
        <button
          type="button"
          onClick={() => onAplicar(e)}
          aria-pressed={ativa}
          disabled={gravando}
          title={ativa ? `Visão aplicada: ${e.nome} (tocar desfaz o que mudou depois)` : `Aplicar a visão ${e.nome}`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2 text-left text-[13px] lg:min-h-8"
        >
          <IconVisao className={`h-3.5 w-3.5 shrink-0 ${ativa ? "fill-current text-accent" : "text-muted"}`} />
          <span className={`min-w-0 flex-1 truncate ${ativa ? "font-semibold text-accent" : "text-text"}`}>{e.nome}</span>
          {publica && (
            <span className="flex max-w-28 shrink-0 items-center gap-1 text-[11px] text-muted" title={e.minha ? "Pública (todos veem)" : `Pública, de ${e.autor}`}>
              <IconUsers className="h-3.5 w-3.5 shrink-0" />
              {!e.minha && <span className="truncate">{e.autor}</span>}
            </span>
          )}
        </button>
        {podeExcluir(e) && (
          <Button
            variant="icon"
            size="xs"
            icon={<IconTrash className="h-3.5 w-3.5" />}
            aria-label={`Excluir a visão ${e.nome}`}
            title={e.minha ? "Excluir esta visão" : `Excluir esta visão pública (de ${e.autor})`}
            onClick={() => onExcluir(e)}
            disabled={gravando}
          />
        )}
      </div>
    );
  });
}
