"use client";

import { type KeyboardEvent, type MouseEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { basePercentual, type ModoCruzamento, type OrdemCruzamento, percentual } from "@/lib/orcamento-cruzamento";
import { LINHAS_TABELA } from "@/lib/theme";
import { AlturaNoHtml, useAlturaAteOFim } from "./AlturaCheia";
import { useLinhasTabela } from "./ConfigTabelas";
import { IconArrowDown, IconArrowUp, IconDesafixar, IconFixar } from "./icons";
import { Pager } from "./Pager";

export type EixoTabelaCruzada = { chave: string; rotulo: string; total: number };
export type LinhaTabelaCruzada = EixoTabelaCruzada & { valores: number[]; extra?: string };

const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`);

/** Larguras (tokens locais) — as colunas CONGELADAS se deslocam por elas, sem medir nada. No celular, só o rótulo e as
 * colunas fixadas congelam (a sigla e o total rolam — senão sobraria pouca tela). */
const LARGURAS =
  "[--cz-rot:9.5rem] [--cz-tot:7.5rem] [--cz-col:7.5rem] [--cz-base:0px] lg:[--cz-rot:18rem] lg:[--cz-tot:9.5rem] lg:[--cz-col:9rem] lg:[--cz-base:calc(var(--cz-ext)_+_var(--cz-tot))]";
const W_ROT = "w-[var(--cz-rot)] min-w-[var(--cz-rot)] max-w-[var(--cz-rot)]";
const W_EXT = "w-[var(--cz-ext)] min-w-[var(--cz-ext)] max-w-[var(--cz-ext)]";
const W_TOT = "w-[var(--cz-tot)] min-w-[var(--cz-tot)] max-w-[var(--cz-tot)]";
const W_COL = "w-[var(--cz-col)] min-w-[var(--cz-col)] max-w-[var(--cz-col)]";
const CEL = "h-11 border-b border-border px-2.5 lg:h-[var(--h-control-sm)]";
const FIXA_LG_EXT = "lg:sticky lg:left-[var(--cz-rot)]";
const FIXA_LG_TOT = "lg:sticky lg:left-[calc(var(--cz-rot)_+_var(--cz-ext))]";
const ULTIMA_FIXA = "shadow-[inset_-2px_0_0_var(--border)]";
const ULTIMA_FIXA_LG = "lg:shadow-[inset_-2px_0_0_var(--border)]";

/**
 * TABELA CRUZADA (horizontal, estilo planilha) — linhas × colunas de valores, com a coluna TOTAL e a linha TOTAL
 * (fixa no rodapé). Congela o RÓTULO das linhas (e, no desktop, a coluna extra + o total) e as colunas que o usuário
 * FIXAR (alfinete no cabeçalho — vão para a esquerda, na ordem em que foram fixadas). Ordena pelo rótulo, pelo total ou
 * por qualquer coluna (clique no cabeçalho); lê o VALOR ou a participação (% da linha/coluna/total); MAPA DE CALOR
 * opcional; tocar numa célula, num rótulo ou num total chama `onAbrir` (a origem do número). No desktop ocupa a altura
 * até o fim do display (o corpo rola por dentro); linhas por página = Configurações → Tabelas. 100% por token.
 */
export function TabelaCruzada({
  rotuloLinhas,
  rotuloExtra,
  linhas,
  colunas,
  total,
  formatar,
  modo = "valor",
  calor = false,
  fixadas,
  onFixar,
  ordem,
  onOrdenar,
  onAbrir,
  ativa = null,
  vazio,
  resumo,
}: {
  rotuloLinhas: string;
  /** Coluna extra ao lado do rótulo (ex.: a sigla no sistema) — só quando informada. */
  rotuloExtra?: string;
  /** Já ORDENADAS e filtradas (a tabela só pagina). `valores` alinhados a `colunas`. */
  linhas: LinhaTabelaCruzada[];
  colunas: EixoTabelaCruzada[];
  total: number;
  formatar: (v: number) => string;
  modo?: ModoCruzamento;
  calor?: boolean;
  /** Chaves das colunas CONGELADAS (na ordem). */
  fixadas: string[];
  onFixar: (chave: string) => void;
  ordem: OrdemCruzamento;
  onOrdenar: (por: OrdemCruzamento["por"]) => void;
  /** Origem do número: linha e/ou coluna (`null` = todas). */
  onAbrir?: (linha: string | null, coluna: string | null) => void;
  ativa?: { linha: string | null; coluna: string | null } | null;
  vazio: ReactNode;
  resumo?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const altura = useAlturaAteOFim(ref, true);
  const linhasAdm = useLinhasTabela();
  const [limite, setLimite] = useState<number>(linhasAdm);
  const [page, setPage] = useState(1);

  // Colunas na ordem de EXIBIÇÃO: as fixadas primeiro (na ordem em que foram fixadas), depois as demais.
  const ordemCols = useMemo(() => {
    const pos = new Map(colunas.map((c, j) => [c.chave, j]));
    const fix = fixadas.flatMap((k) => (pos.has(k) ? [pos.get(k) as number] : []));
    const set = new Set(fix);
    return { fix, todas: [...fix, ...colunas.map((_, j) => j).filter((j) => !set.has(j))] };
  }, [colunas, fixadas]);
  const maxAbs = useMemo(() => (calor ? Math.max(0, ...linhas.flatMap((l) => l.valores.map(Math.abs))) : 0), [calor, linhas]);

  const pages = Math.max(1, Math.ceil(linhas.length / limite));
  const pg = Math.min(page, pages);
  const visiveis = linhas.slice((pg - 1) * limite, pg * limite);
  const comExtra = rotuloExtra != null;
  const nFix = ordemCols.fix.length;

  const texto = (v: number, bases: { linha: number; coluna: number }) => {
    const base = basePercentual(modo, { ...bases, geral: total });
    return base == null ? formatar(v) : fmtPct(percentual(v, base));
  };
  const fundo = (v: number) =>
    calor && maxAbs > 0 && v !== 0
      ? { background: `color-mix(in srgb, var(${v < 0 ? "--danger" : "--accent"}) ${Math.round(6 + (Math.abs(v) / maxAbs) * 34)}%, transparent)` }
      : undefined;
  const ehAtiva = (l: string | null, c: string | null) => ativa != null && ativa.linha === l && ativa.coluna === c;
  const anelAtivo = "outline outline-2 -outline-offset-2 outline-[var(--accent)]";
  const fixaCol = (p: number) => ({ left: `calc(var(--cz-rot) + var(--cz-base) + ${p} * var(--cz-col))` });

  const seta = (por: OrdemCruzamento["por"]) => {
    const igual = typeof por === "object" ? typeof ordem.por === "object" && ordem.por.coluna === por.coluna : ordem.por === por;
    if (!igual) return null;
    const Seta = ordem.desc ? IconArrowDown : IconArrowUp;
    return <Seta className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />;
  };
  const ariaSort = (por: OrdemCruzamento["por"]) => (seta(por) ? (ordem.desc ? "descending" : "ascending") : undefined);

  // Um clique numa célula de dados (delegado — milhares de células sem um manipulador cada).
  const alvoCelula = (e: MouseEvent | KeyboardEvent) => {
    const td = (e.target as HTMLElement).closest<HTMLElement>("[data-l],[data-c]");
    if (!td || !onAbrir) return;
    onAbrir(td.dataset.l || null, td.dataset.c || null);
  };
  const teclado = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    alvoCelula(e);
  };

  const botaoCab = "flex w-full items-center gap-1 rounded-[6px] text-left hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
  const cabecalho = "sticky top-0 z-20 border-b border-border bg-surface-2 px-2.5 py-1.5 align-bottom text-[11.5px] font-semibold uppercase leading-tight tracking-wide text-muted";

  return (
    <div
      ref={ref}
      className={`${LARGURAS} ${comExtra ? "[--cz-ext:6rem] lg:[--cz-ext:7.5rem]" : "[--cz-ext:0px]"} flex flex-col overflow-clip rounded-card border border-border bg-surface shadow-ring`}
      style={altura != null ? { height: altura } : undefined}
      suppressHydrationWarning
    >
      {linhas.length === 0 ? (
        <p className="grid flex-1 place-items-center px-4 py-12 text-center text-[13px] text-faint">{vazio}</p>
      ) : (
        <div className="max-h-[75dvh] min-h-0 flex-1 overflow-auto overscroll-contain lg:max-h-none">
          <table className="w-max border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th scope="col" aria-sort={ariaSort("rotulo")} className={`${cabecalho} ${W_ROT} left-0 z-30`}>
                  <button type="button" className={botaoCab} onClick={() => onOrdenar("rotulo")}>
                    <span className="truncate">{rotuloLinhas}</span>
                    {seta("rotulo")}
                  </button>
                </th>
                {comExtra && (
                  <th scope="col" className={`${cabecalho} ${W_EXT} ${FIXA_LG_EXT} lg:z-30`}>
                    <span className="block truncate">{rotuloExtra}</span>
                  </th>
                )}
                <th scope="col" aria-sort={ariaSort("total")} className={`${cabecalho} ${W_TOT} ${FIXA_LG_TOT} lg:z-30 ${nFix === 0 ? ULTIMA_FIXA_LG : ""}`}>
                  <button type="button" className={`${botaoCab} justify-end text-right`} onClick={() => onOrdenar("total")}>
                    {seta("total")}
                    <span>Total</span>
                  </button>
                </th>
                {ordemCols.todas.map((j, p) => {
                  const c = colunas[j];
                  const fixa = p < nFix;
                  const Pino = fixa ? IconDesafixar : IconFixar;
                  return (
                    <th
                      key={c.chave}
                      scope="col"
                      aria-sort={ariaSort({ coluna: c.chave })}
                      className={`${cabecalho} ${W_COL} ${fixa ? `z-30 ${p === nFix - 1 ? ULTIMA_FIXA : ""}` : ""}`}
                      style={fixa ? fixaCol(p) : undefined}
                    >
                      <div className="flex items-end gap-1">
                        <button type="button" className={`${botaoCab} min-w-0 flex-1 justify-end text-right`} title={c.rotulo} onClick={() => onOrdenar({ coluna: c.chave })}>
                          {seta({ coluna: c.chave })}
                          <span className="line-clamp-3 break-words">{c.rotulo}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onFixar(c.chave)}
                          aria-pressed={fixa}
                          aria-label={fixa ? `Descongelar ${c.rotulo}` : `Congelar ${c.rotulo}`}
                          title={fixa ? "Descongelar coluna" : "Congelar coluna"}
                          className={`grid h-11 w-8 shrink-0 place-items-center rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-6 lg:w-6 ${
                            fixa ? "text-accent" : "text-faint hover:text-text-2"
                          }`}
                        >
                          <Pino className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody
              onClick={alvoCelula}
              onKeyDown={teclado}
            >
              {visiveis.map((l) => (
                <tr key={l.chave} className="group/linha">
                  <th
                    scope="row"
                    data-l={l.chave}
                    tabIndex={onAbrir ? 0 : undefined}
                    className={`${CEL} ${W_ROT} sticky left-0 z-10 bg-surface text-left font-medium text-text group-hover/linha:bg-surface-2 ${onAbrir ? "cursor-pointer" : ""} ${ehAtiva(l.chave, null) ? anelAtivo : ""}`}
                    title={l.rotulo}
                  >
                    <span className="block truncate">{l.rotulo}</span>
                  </th>
                  {comExtra && (
                    <td className={`${CEL} ${W_EXT} ${FIXA_LG_EXT} bg-surface text-center font-semibold text-text-2 group-hover/linha:bg-surface-2 lg:z-10`} title={l.extra}>
                      <span className="block truncate">{l.extra || <span className="text-faint">—</span>}</span>
                    </td>
                  )}
                  <td
                    data-l={l.chave}
                    tabIndex={onAbrir ? 0 : undefined}
                    className={`${CEL} ${W_TOT} ${FIXA_LG_TOT} bg-surface text-right font-semibold tabular-nums text-text group-hover/linha:bg-surface-2 lg:z-10 ${nFix === 0 ? ULTIMA_FIXA_LG : ""} ${onAbrir ? "cursor-pointer" : ""} ${ehAtiva(l.chave, null) ? anelAtivo : ""}`}
                  >
                    {texto(l.total, { linha: l.total, coluna: total })}
                  </td>
                  {ordemCols.todas.map((j, p) => {
                    const c = colunas[j];
                    const v = l.valores[j];
                    const fixa = p < nFix;
                    const zero = Math.abs(v) < 0.005;
                    return (
                      <td
                        key={c.chave}
                        data-l={l.chave}
                        data-c={c.chave}
                        tabIndex={onAbrir && !zero ? 0 : undefined}
                        className={`${CEL} ${W_COL} whitespace-nowrap text-right tabular-nums ${zero ? "text-faint" : "text-text-2"} ${
                          fixa ? `sticky z-10 bg-surface group-hover/linha:bg-surface-2 ${p === nFix - 1 ? ULTIMA_FIXA : ""}` : "group-hover/linha:bg-surface-2"
                        } ${onAbrir && !zero ? "cursor-pointer hover:text-accent" : ""} ${ehAtiva(l.chave, c.chave) ? anelAtivo : ""}`}
                        style={{ ...(fixa ? fixaCol(p) : {}), ...(fixa ? {} : fundo(v)) }}
                      >
                        {zero && modo === "valor" ? "–" : texto(v, { linha: l.total, coluna: c.total })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot onClick={alvoCelula} onKeyDown={teclado}>
              <tr className="font-bold text-text">
                <th scope="row" data-l="" data-c="" tabIndex={onAbrir ? 0 : undefined} className={`${CEL} ${W_ROT} sticky bottom-0 left-0 z-30 ${onAbrir ? "cursor-pointer" : ""} ${ehAtiva(null, null) ? anelAtivo : ""} border-t border-border bg-surface-2 text-left uppercase`}>
                  Total
                </th>
                {comExtra && <td className={`${CEL} ${W_EXT} sticky bottom-0 z-20 border-t border-border bg-surface-2 lg:left-[var(--cz-rot)] lg:z-30`} />}
                <td
                  className={`${CEL} ${W_TOT} sticky bottom-0 z-20 border-t border-border bg-surface-2 text-right tabular-nums lg:left-[calc(var(--cz-rot)_+_var(--cz-ext))] lg:z-30 ${nFix === 0 ? ULTIMA_FIXA_LG : ""}`}
                >
                  {texto(total, { linha: total, coluna: total })}
                </td>
                {ordemCols.todas.map((j, p) => {
                  const c = colunas[j];
                  const fixa = p < nFix;
                  return (
                    <td
                      key={c.chave}
                      data-c={c.chave}
                      tabIndex={onAbrir ? 0 : undefined}
                      className={`${CEL} ${W_COL} sticky bottom-0 whitespace-nowrap border-t border-border bg-surface-2 text-right tabular-nums ${fixa ? `z-30 ${p === nFix - 1 ? ULTIMA_FIXA : ""}` : "z-20"} ${
                        onAbrir ? "cursor-pointer hover:text-accent" : ""
                      } ${ehAtiva(null, c.chave) ? anelAtivo : ""}`}
                      style={fixa ? fixaCol(p) : undefined}
                    >
                      {texto(c.total, { linha: total, coluna: c.total })}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border bg-surface-2 px-3 py-1.5 text-[12.5px] text-muted">
        <span>{resumo}</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Linhas</span>
            <select
              aria-label="Linhas por página"
              value={limite}
              onChange={(e) => {
                setLimite(Number(e.target.value));
                setPage(1);
              }}
              className="min-h-11 rounded-[8px] border border-border bg-surface px-2 py-1 text-[12px] text-text-2 focus:border-accent focus:outline-none lg:min-h-0"
            >
              {LINHAS_TABELA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {pages > 1 && <Pager page={pg} pages={pages} onChange={setPage} />}
        </div>
      </div>
      <AlturaNoHtml />
    </div>
  );
}
