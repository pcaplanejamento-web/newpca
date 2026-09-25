"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { basePercentual, COL_EXTRA, COL_ROTULO, COL_TOTAL, LARGURA_MAX, LARGURA_MIN, type ModoCruzamento, type OrdemCruzamento, percentual } from "@/lib/orcamento-cruzamento";
import { LINHAS_TABELA } from "@/lib/theme";
import { AlturaNoHtml, useAlturaAteOFim } from "./AlturaCheia";
import { useLinhasTabela } from "./ConfigTabelas";
import { ehDesktop } from "./espacamento";
import { IconArrowDown, IconArrowUp } from "./icons";
import { Pager } from "./Pager";

export type EixoTabelaCruzada = { chave: string; rotulo: string; total: number };
export type LinhaTabelaCruzada = EixoTabelaCruzada & { valores: number[]; extra?: string };

const fmtPct = (v: number | null) => (v == null ? "–" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`);
const zerado = (v: number) => Math.abs(v) < 0.005;

/** Larguras PADRÃO (tokens locais, px) — o usuário ajusta cada coluna arrastando a borda do cabeçalho (sobrepõe o token).
 * No celular só o rótulo e as colunas fixadas congelam (a extra e o total rolam — senão sobraria pouca tela). */
const LARGURAS =
  "[--cz-rot:152px] [--cz-ext:88px] [--cz-tot:120px] [--cz-col:120px] lg:[--cz-rot:280px] lg:[--cz-ext:112px] lg:[--cz-tot:144px] lg:[--cz-col:136px]";
const larguraVar = (w: string): CSSProperties => ({ width: w, minWidth: w, maxWidth: w });
const CEL = "h-11 border-b border-border/60 px-3 lg:h-[var(--h-control-sm)]";
const DIVISA = "shadow-[inset_-1px_0_0_var(--border)]";
const DIVISA_LG = "lg:shadow-[inset_-1px_0_0_var(--border)]";

/** Alça de LARGURA na borda direita do cabeçalho: arrastar (mouse ou toque), ←/→ no teclado, duplo clique = padrão. */
function AlcaLargura({ rotulo, largura: definida, onLargura }: { rotulo: string; largura?: number; onLargura: (px: number | null) => void }) {
  const [ativa, setAtiva] = useState(false);
  const alca = useRef<HTMLSpanElement>(null);
  const [atual, setAtual] = useState(0); // a largura exibida (px) — o valor do separador para leitores de tela
  const largura = (el: HTMLElement) => (el.parentElement as HTMLElement).getBoundingClientRect().width;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-mede quando a largura DEFINIDA muda.
  useLayoutEffect(() => {
    if (alca.current) setAtual(Math.round(largura(alca.current)));
  }, [definida]);
  const iniciar = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const el = e.currentTarget;
    const x0 = e.clientX;
    const w0 = largura(el);
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    setAtiva(true);
    let quadro = 0;
    const mover = (ev: PointerEvent) => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => onLargura(w0 + ev.clientX - x0));
    };
    const fim = () => {
      cancelAnimationFrame(quadro);
      setAtiva(false);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", fim);
      el.removeEventListener("pointercancel", fim);
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", fim);
    el.addEventListener("pointercancel", fim);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: separador INTERATIVO (arrastável/teclado) — o <hr> não recebe foco nem eventos.
    <span
      ref={alca}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={atual}
      aria-valuemin={LARGURA_MIN}
      aria-valuemax={LARGURA_MAX}
      aria-label={`Largura de ${rotulo} (setas ajustam, duplo clique volta ao padrão)`}
      tabIndex={0}
      onPointerDown={iniciar}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={() => onLargura(null)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onLargura(largura(e.currentTarget) + (e.key === "ArrowRight" ? 16 : -16));
      }}
      className="group/alca absolute inset-y-0 -right-2 z-10 w-4 cursor-col-resize touch-none focus-visible:outline-none"
    >
      <span
        className={`absolute inset-y-1.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors ${
          ativa ? "bg-accent" : "bg-transparent group-hover/alca:bg-border-2 group-focus-visible/alca:bg-accent pointer-coarse:bg-border"
        }`}
      />
    </span>
  );
}

/**
 * TABELA CRUZADA (horizontal, estilo planilha) — linhas × colunas de valores, com a coluna TOTAL e a linha TOTAL (fixa
 * no rodapé). Visual limpo: cabeçalho sem caixa-alta, zeros como "–", linhas só com divisórias horizontais. O usuário
 * ORDENA pelo cabeçalho de QUALQUER coluna (rótulo, extra, total ou valores), AJUSTA A LARGURA arrastando a borda do
 * cabeçalho (toque também) e vê CONGELADAS o rótulo (no desktop também a extra e o total) + as colunas `fixadas` (à
 * esquerda, na ordem; as que não cabem na largura visível deixam de congelar — nunca somem da tela). Valor ou % da
 * linha/coluna/total; mapa de calor opcional; tocar numa célula, rótulo ou total chama `onAbrir` (a origem do número).
 * No desktop ocupa a altura até o fim do display (o corpo rola por dentro); linhas por página = Configurações → Tabelas.
 */
export function TabelaCruzada({
  rotuloLinhas,
  rotuloExtra,
  mostrarTotal = true,
  linhas,
  colunas,
  total,
  formatar,
  modo = "valor",
  calor = false,
  fixadas,
  larguras,
  onLargura,
  ordem,
  onOrdenar,
  onAbrir,
  ativa = null,
  vazio,
  resumo,
  acoesRodape,
}: {
  rotuloLinhas: string;
  /** Coluna extra ao lado do rótulo (ex.: a sigla no sistema) — só quando informada. */
  rotuloExtra?: string;
  mostrarTotal?: boolean;
  /** Já ORDENADAS e filtradas (a tabela só pagina). `valores` alinhados a `colunas` (já na ordem de exibição). */
  linhas: LinhaTabelaCruzada[];
  colunas: EixoTabelaCruzada[];
  total: number;
  formatar: (v: number) => string;
  modo?: ModoCruzamento;
  calor?: boolean;
  /** Chaves das colunas CONGELADAS (na ordem). */
  fixadas: string[];
  /** Largura (px) por coluna — `COL_ROTULO`/`COL_EXTRA`/`COL_TOTAL` ou a chave da coluna; ausente = padrão. */
  larguras: Record<string, number>;
  /** Nova largura de uma coluna (`null` = volta ao padrão). */
  onLargura: (chave: string, px: number | null) => void;
  ordem: OrdemCruzamento;
  onOrdenar: (por: OrdemCruzamento["por"]) => void;
  /** Origem do número: linha e/ou coluna (`null` = todas). */
  onAbrir?: (linha: string | null, coluna: string | null) => void;
  ativa?: { linha: string | null; coluna: string | null } | null;
  vazio: ReactNode;
  resumo?: ReactNode;
  /** Ações no rodapé, à esquerda do seletor de linhas (ex.: salvar os ajustes). */
  acoesRodape?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const altura = useAlturaAteOFim(ref, true);
  const linhasAdm = useLinhasTabela();
  const [limite, setLimite] = useState<number>(linhasAdm);
  const [page, setPage] = useState(1);
  const comExtra = rotuloExtra != null;

  // Colunas na ordem de EXIBIÇÃO: as fixadas primeiro (na ordem em que foram fixadas), depois as demais.
  const ordemCols = useMemo(() => {
    const pos = new Map(colunas.map((c, j) => [c.chave, j]));
    const fix = fixadas.flatMap((k) => (pos.has(k) ? [pos.get(k) as number] : []));
    const set = new Set(fix);
    return { fix, todas: [...fix, ...colunas.map((_, j) => j).filter((j) => !set.has(j))] };
  }, [colunas, fixadas]);
  const wCol = (chave: string) => (larguras[chave] ? `${larguras[chave]}px` : "var(--cz-col)");

  // Quantas colunas fixadas CABEM congeladas na largura visível (as demais seguem na frente, mas rolam).
  const [nFix, setNFix] = useState(ordemCols.fix.length);
  useLayoutEffect(() => {
    const el = rolagem.current;
    const raiz = ref.current;
    if (!el || !raiz) return;
    const calc = () => {
      const cs = getComputedStyle(raiz);
      const px = (v: string) => Number.parseFloat(cs.getPropertyValue(v)) || 0;
      let x = px("--cz-rot") + (ehDesktop() ? px("--cz-ext") + px("--cz-tot") : 0);
      let n = 0;
      for (const j of ordemCols.fix) {
        x += larguras[colunas[j].chave] ?? px("--cz-col");
        if (x > el.clientWidth - 96) break;
        n++;
      }
      setNFix(n);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ordemCols, larguras, colunas]);

  const maxAbs = useMemo(() => (calor ? Math.max(0, ...linhas.flatMap((l) => l.valores.map(Math.abs))) : 0), [calor, linhas]);
  const pages = Math.max(1, Math.ceil(linhas.length / limite));
  const pg = Math.min(page, pages);
  const visiveis = linhas.slice((pg - 1) * limite, pg * limite);

  const texto = (v: number, bases: { linha: number; coluna: number }) => {
    if (zerado(v)) return "–";
    const base = basePercentual(modo, { ...bases, geral: total });
    return base == null ? formatar(v) : fmtPct(percentual(v, base));
  };
  const fundo = (v: number): CSSProperties | undefined =>
    calor && maxAbs > 0 && !zerado(v)
      ? { background: `color-mix(in srgb, var(${v < 0 ? "--danger" : "--accent"}) ${Math.round(4 + (Math.abs(v) / maxAbs) * 22)}%, transparent)` }
      : undefined;
  const ehAtiva = (l: string | null, c: string | null) => ativa != null && ativa.linha === l && ativa.coluna === c;
  const anelAtivo = "outline outline-2 -outline-offset-2 outline-[var(--accent)]";
  // Deslocamento da coluna fixada p: o rótulo + (no desktop) a extra e o total + as fixadas antes dela.
  const esquerda = (p: number): CSSProperties => {
    const antes = ordemCols.fix.slice(0, p).map((j) => wCol(colunas[j].chave));
    return { left: `calc(var(--cz-rot) + var(--cz-base) + ${antes.length ? antes.join(" + ") : "0px"})` };
  };

  const seta = (por: OrdemCruzamento["por"]) => {
    const igual = typeof por === "object" ? typeof ordem.por === "object" && ordem.por.coluna === por.coluna : ordem.por === por;
    if (!igual) return null;
    const Seta = ordem.desc ? IconArrowDown : IconArrowUp;
    return <Seta className="h-3 w-3 shrink-0 text-accent" aria-hidden />;
  };
  const ariaSort = (por: OrdemCruzamento["por"]) => (seta(por) ? (ordem.desc ? "descending" : "ascending") : undefined);

  // Um clique numa célula (delegado — milhares de células sem um manipulador cada).
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

  const cab = "sticky top-0 z-20 border-b border-border bg-surface px-3 py-2 align-bottom text-[12px] font-medium leading-snug text-muted";
  const botaoCab = "flex w-full items-center gap-1 rounded-[6px] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
  const ultimaBase = ordemCols.fix.length === 0 || nFix === 0;
  const estiloRaiz: CSSProperties & Record<`--${string}`, string> = {
    ...(altura != null ? { height: altura } : {}),
    ...(larguras[COL_ROTULO] ? { "--cz-rot": `${larguras[COL_ROTULO]}px` } : {}),
    ...(!comExtra ? { "--cz-ext": "0px" } : larguras[COL_EXTRA] ? { "--cz-ext": `${larguras[COL_EXTRA]}px` } : {}),
    ...(!mostrarTotal ? { "--cz-tot": "0px" } : larguras[COL_TOTAL] ? { "--cz-tot": `${larguras[COL_TOTAL]}px` } : {}),
  };

  return (
    <div
      ref={ref}
      className={`${LARGURAS} [--cz-base:0px] lg:[--cz-base:calc(var(--cz-ext)_+_var(--cz-tot))] flex flex-col overflow-clip rounded-card border border-border bg-surface`}
      style={estiloRaiz}
      suppressHydrationWarning
    >
      {linhas.length === 0 || colunas.length === 0 ? (
        <p className="grid flex-1 place-items-center px-4 py-12 text-center text-[13px] text-faint">{vazio}</p>
      ) : (
        <div ref={rolagem} className="max-h-[75dvh] min-h-0 flex-1 overflow-auto overscroll-contain lg:max-h-none">
          <table className="w-max border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th scope="col" aria-sort={ariaSort("rotulo")} className={`${cab} left-0 z-30 text-left ${DIVISA}`} style={larguraVar("var(--cz-rot)")}>
                  <button type="button" className={botaoCab} onClick={() => onOrdenar("rotulo")}>
                    <span className="truncate">{rotuloLinhas}</span>
                    {seta("rotulo")}
                  </button>
                  <AlcaLargura rotulo={rotuloLinhas} largura={larguras[COL_ROTULO]} onLargura={(px) => onLargura(COL_ROTULO, px)} />
                </th>
                {comExtra && (
                  <th scope="col" aria-sort={ariaSort("extra")} className={`${cab} text-left lg:left-[var(--cz-rot)] lg:z-30`} style={larguraVar("var(--cz-ext)")}>
                    <button type="button" className={botaoCab} onClick={() => onOrdenar("extra")}>
                      <span className="truncate">{rotuloExtra}</span>
                      {seta("extra")}
                    </button>
                    <AlcaLargura rotulo={rotuloExtra} largura={larguras[COL_EXTRA]} onLargura={(px) => onLargura(COL_EXTRA, px)} />
                  </th>
                )}
                {mostrarTotal && (
                  <th
                    scope="col"
                    aria-sort={ariaSort("total")}
                    className={`${cab} text-right lg:left-[calc(var(--cz-rot)_+_var(--cz-ext))] lg:z-30 ${ultimaBase ? DIVISA_LG : ""}`}
                    style={larguraVar("var(--cz-tot)")}
                  >
                    <button type="button" className={`${botaoCab} justify-end`} onClick={() => onOrdenar("total")}>
                      {seta("total")}
                      <span>Total</span>
                    </button>
                    <AlcaLargura rotulo="Total" largura={larguras[COL_TOTAL]} onLargura={(px) => onLargura(COL_TOTAL, px)} />
                  </th>
                )}
                {ordemCols.todas.map((j, p) => {
                  const c = colunas[j];
                  const fixa = p < nFix;
                  return (
                    <th
                      key={c.chave}
                      scope="col"
                      aria-sort={ariaSort({ coluna: c.chave })}
                      className={`${cab} text-right ${fixa ? `z-30 ${p === nFix - 1 ? DIVISA : ""}` : ""}`}
                      style={{ ...larguraVar(wCol(c.chave)), ...(fixa ? esquerda(p) : {}) }}
                    >
                      <button type="button" className={`${botaoCab} justify-end text-right`} title={c.rotulo} onClick={() => onOrdenar({ coluna: c.chave })}>
                        {seta({ coluna: c.chave })}
                        <span className="line-clamp-2 break-words">{c.rotulo}</span>
                      </button>
                      <AlcaLargura rotulo={c.rotulo} largura={larguras[c.chave]} onLargura={(px) => onLargura(c.chave, px)} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody onClick={alvoCelula} onKeyDown={teclado}>
              {visiveis.map((l) => (
                <tr key={l.chave} className="group/linha">
                  <th
                    scope="row"
                    data-l={l.chave}
                    tabIndex={onAbrir ? 0 : undefined}
                    className={`${CEL} sticky left-0 z-10 bg-surface text-left font-normal text-text group-hover/linha:bg-surface-2 ${DIVISA} ${onAbrir ? "cursor-pointer" : ""} ${ehAtiva(l.chave, null) ? anelAtivo : ""}`}
                    style={larguraVar("var(--cz-rot)")}
                    title={l.rotulo}
                  >
                    <span className="block truncate">{l.rotulo}</span>
                  </th>
                  {comExtra && (
                    <td
                      className={`${CEL} bg-surface text-left text-text-2 group-hover/linha:bg-surface-2 lg:sticky lg:left-[var(--cz-rot)] lg:z-10`}
                      style={larguraVar("var(--cz-ext)")}
                      title={l.extra}
                    >
                      <span className="block truncate">{l.extra || <span className="text-faint">–</span>}</span>
                    </td>
                  )}
                  {mostrarTotal && (
                    <td
                      data-l={l.chave}
                      tabIndex={onAbrir ? 0 : undefined}
                      className={`${CEL} bg-surface text-right font-semibold tabular-nums text-text group-hover/linha:bg-surface-2 lg:sticky lg:left-[calc(var(--cz-rot)_+_var(--cz-ext))] lg:z-10 ${ultimaBase ? DIVISA_LG : ""} ${onAbrir ? "cursor-pointer" : ""} ${ehAtiva(l.chave, null) ? anelAtivo : ""}`}
                      style={larguraVar("var(--cz-tot)")}
                    >
                      {texto(l.total, { linha: l.total, coluna: total })}
                    </td>
                  )}
                  {ordemCols.todas.map((j, p) => {
                    const c = colunas[j];
                    const v = l.valores[j];
                    const fixa = p < nFix;
                    const zero = zerado(v);
                    return (
                      <td
                        key={c.chave}
                        data-l={l.chave}
                        data-c={c.chave}
                        tabIndex={onAbrir && !zero ? 0 : undefined}
                        className={`${CEL} whitespace-nowrap text-right tabular-nums ${zero ? "text-faint" : "text-text-2"} ${
                          fixa ? `sticky z-10 bg-surface group-hover/linha:bg-surface-2 ${p === nFix - 1 ? DIVISA : ""}` : "group-hover/linha:bg-surface-2"
                        } ${onAbrir && !zero ? "cursor-pointer hover:text-accent" : ""} ${ehAtiva(l.chave, c.chave) ? anelAtivo : ""}`}
                        style={{ ...larguraVar(wCol(c.chave)), ...(fixa ? esquerda(p) : fundo(v)) }}
                      >
                        {texto(v, { linha: l.total, coluna: c.total })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot onClick={alvoCelula} onKeyDown={teclado}>
              <tr className="font-semibold text-text">
                <th
                  scope="row"
                  data-l=""
                  data-c=""
                  tabIndex={onAbrir ? 0 : undefined}
                  className={`${CEL} sticky bottom-0 left-0 z-30 border-t border-border bg-surface-2 text-left ${DIVISA} ${onAbrir ? "cursor-pointer" : ""} ${ehAtiva(null, null) ? anelAtivo : ""}`}
                  style={larguraVar("var(--cz-rot)")}
                >
                  Total
                </th>
                {comExtra && <td className={`${CEL} sticky bottom-0 z-20 border-t border-border bg-surface-2 lg:left-[var(--cz-rot)] lg:z-30`} style={larguraVar("var(--cz-ext)")} />}
                {mostrarTotal && (
                  <td
                    className={`${CEL} sticky bottom-0 z-20 border-t border-border bg-surface-2 text-right tabular-nums lg:left-[calc(var(--cz-rot)_+_var(--cz-ext))] lg:z-30 ${ultimaBase ? DIVISA_LG : ""}`}
                    style={larguraVar("var(--cz-tot)")}
                  >
                    {texto(total, { linha: total, coluna: total })}
                  </td>
                )}
                {ordemCols.todas.map((j, p) => {
                  const c = colunas[j];
                  const fixa = p < nFix;
                  return (
                    <td
                      key={c.chave}
                      data-c={c.chave}
                      tabIndex={onAbrir ? 0 : undefined}
                      className={`${CEL} sticky bottom-0 whitespace-nowrap border-t border-border bg-surface-2 text-right tabular-nums ${fixa ? `z-30 ${p === nFix - 1 ? DIVISA : ""}` : "z-20"} ${
                        onAbrir ? "cursor-pointer hover:text-accent" : ""
                      } ${ehAtiva(null, c.chave) ? anelAtivo : ""}`}
                      style={{ ...larguraVar(wCol(c.chave)), ...(fixa ? esquerda(p) : {}) }}
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border px-3 py-1.5 text-[12.5px] text-muted">
        <span>{resumo}</span>
        <div className="flex flex-wrap items-center gap-2">
          {acoesRodape}
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
