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
import { Dropdown } from "./Dropdown";
import { IconArrowDown, IconArrowUp, IconChevronDown, IconChevronLeft, IconChevronRight, IconDesafixar, IconEye, IconEyeOff, IconFixar, IconUndo } from "./icons";
import { Pager } from "./Pager";

export type EixoTabelaCruzada = { chave: string; rotulo: string; total: number };
export type LinhaTabelaCruzada = EixoTabelaCruzada & { valores: number[]; extra?: string };

const fmtPct = (v: number | null) => (v == null ? "–" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`);
const zerado = (v: number) => Math.abs(v) < 0.005;

/** Larguras PADRÃO (tokens locais, px) — o usuário ajusta cada coluna arrastando a borda do cabeçalho (sobrepõe o token).
 * No celular só o rótulo e as colunas fixadas congelam (a extra e o total rolam — senão sobraria pouca tela); no desktop a
 * extra e o total congelam salvo se o usuário os SOLTAR. */
const LARGURAS =
  "[--cz-rot:152px] [--cz-ext:88px] [--cz-tot:120px] [--cz-col:120px] lg:[--cz-rot:280px] lg:[--cz-ext:112px] lg:[--cz-tot:144px] lg:[--cz-col:136px]";
const larguraVar = (w: string): CSSProperties => ({ width: w, minWidth: w, maxWidth: w });
const CEL = "h-11 border-b border-border/60 px-3 lg:h-[var(--h-control-sm)]";
const DIVISA = "shadow-[inset_-1px_0_0_var(--border)]";
const DIVISA_LG = "lg:shadow-[inset_-1px_0_0_var(--border)]";

/** Alça de LARGURA na borda direita do cabeçalho (modo de edição): arrastar (mouse ou toque), ←/→ no teclado, duplo clique
 * = padrão. */
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
          ativa ? "bg-accent" : "bg-border-2 group-hover/alca:bg-accent/60 group-focus-visible/alca:bg-accent"
        }`}
      />
    </span>
  );
}

/** O que o modo de EDIÇÃO faz com uma coluna (o menu do cabeçalho). `chave` = a da coluna ou `COL_*`. */
export type EdicaoTabelaCruzada = {
  onLargura: (chave: string, px: number | null) => void;
  onFixar: (chave: string) => void;
  onOcultar: (chave: string) => void;
  onMover: (chave: string, delta: -1 | 1) => void;
};

/** Um item do menu da coluna (alvo de 44px no toque). */
function ItemMenu({ icone, children, onClick, disabled = false }: { icone: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13px] text-text-2 transition-colors hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-40 lg:min-h-9"
    >
      <span className="shrink-0 text-muted">{icone}</span>
      {children}
    </button>
  );
}

/**
 * TABELA CRUZADA (horizontal, estilo planilha) — linhas × colunas de valores, com a coluna TOTAL e a linha TOTAL (fixa
 * no rodapé). Visual limpo: cabeçalho sem caixa-alta, zeros como "–", linhas só com divisórias horizontais. Tocar no
 * cabeçalho ORDENA as linhas; tocar numa célula, rótulo ou total chama `onAbrir` (a origem do número). Congela o rótulo,
 * as colunas `fixadas` (à esquerda, na ordem; as que não cabem na largura visível deixam de congelar — nunca somem) e, no
 * desktop, a extra e o total (salvo `soltas`). Com **`edicao`**, a PRÓPRIA planilha vira o editor: o cabeçalho de CADA
 * coluna — inclusive a extra (Sigla) e o Total — abre o menu (ordenar, fixar/soltar, mover, ocultar/mostrar, largura
 * padrão), a borda do cabeçalho ajusta a largura (arrastar, também no toque) e as colunas OCULTAS aparecem esmaecidas para
 * voltar. Valor ou % da linha/coluna/total; mapa de calor opcional. No desktop ocupa a altura até o fim do display (o corpo
 * rola por dentro); linhas por página = Configurações → Tabelas.
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
  larguras,
  ocultas = [],
  soltas = [],
  ordem,
  onOrdenar,
  onAbrir,
  ativa = null,
  edicao,
  vazio,
  resumo,
}: {
  rotuloLinhas: string;
  /** Coluna extra ao lado do rótulo (ex.: a sigla no sistema) — só quando informada. */
  rotuloExtra?: string;
  /** Já ORDENADAS e filtradas (a tabela só pagina). `valores` alinhados a `colunas` (TODAS, na ordem de exibição). */
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
  /** Colunas OCULTAS (a extra e o total pelas chaves `COL_EXTRA`/`COL_TOTAL`) — na edição aparecem esmaecidas. */
  ocultas?: string[];
  /** A extra/o total SOLTOS (não congelam no desktop). */
  soltas?: string[];
  ordem: OrdemCruzamento;
  /** Ordena as linhas (`desc` ausente = alterna). */
  onOrdenar: (por: OrdemCruzamento["por"], desc?: boolean) => void;
  /** Origem do número: linha e/ou coluna (`null` = todas). */
  onAbrir?: (linha: string | null, coluna: string | null) => void;
  ativa?: { linha: string | null; coluna: string | null } | null;
  /** Modo de EDIÇÃO da planilha (ausente = só consulta). */
  edicao?: EdicaoTabelaCruzada;
  vazio: ReactNode;
  resumo?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const altura = useAlturaAteOFim(ref, true);
  const linhasAdm = useLinhasTabela();
  const [limite, setLimite] = useState<number>(linhasAdm);
  const [page, setPage] = useState(1);
  const editando = edicao != null;
  const fora = useMemo(() => new Set(ocultas), [ocultas]);
  // Fora da edição, a extra e o total OCULTOS somem; na edição ficam (esmaecidos) para voltar.
  const comExtra = rotuloExtra != null && (editando || !fora.has(COL_EXTRA));
  const comTotal = editando || !fora.has(COL_TOTAL);
  const extraFixa = comExtra && !soltas.includes(COL_EXTRA);
  const totalFixo = comTotal && !soltas.includes(COL_TOTAL);

  // Colunas na ordem de EXIBIÇÃO (índices em `valores`): as fixadas primeiro (na ordem em que foram fixadas), depois as
  // demais; fora da edição, sem as ocultas.
  const ordemCols = useMemo(() => {
    const pos = new Map(colunas.map((c, j) => [c.chave, j]));
    const visivel = (j: number) => editando || !fora.has(colunas[j].chave);
    const fix = fixadas.flatMap((k) => (pos.has(k) && visivel(pos.get(k) as number) ? [pos.get(k) as number] : []));
    const set = new Set(fix);
    return { fix, todas: [...fix, ...colunas.map((_, j) => j).filter((j) => !set.has(j) && visivel(j))] };
  }, [colunas, fixadas, fora, editando]);
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
      let x = px("--cz-rot") + (ehDesktop() ? (extraFixa ? px("--cz-ext") : 0) + (totalFixo ? px("--cz-tot") : 0) : 0);
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
  }, [ordemCols, larguras, colunas, extraFixa, totalFixo]);

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
  const esmaecida = (chave: string) => (fora.has(chave) ? "opacity-40" : "");
  // Deslocamento da coluna fixada p: o rótulo + (no desktop) a extra e o total congelados + as fixadas antes dela.
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

  const cab = `sticky top-0 z-20 border-b border-border px-3 py-2 align-bottom text-[12px] font-medium leading-snug text-muted ${editando ? "bg-surface-2" : "bg-surface"}`;
  const botaoCab = "flex w-full items-center gap-1 rounded-[6px] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
  const fimDaBase = ordemCols.fix.length === 0 || nFix === 0; // a extra/o total é a última coluna congelada
  const divisaTotal = totalFixo && fimDaBase ? DIVISA_LG : "";
  const divisaExtra = extraFixa && !totalFixo && fimDaBase ? DIVISA_LG : "";
  const estiloRaiz: CSSProperties & Record<`--${string}`, string> = {
    ...(altura != null ? { height: altura } : {}),
    ...(larguras[COL_ROTULO] ? { "--cz-rot": `${larguras[COL_ROTULO]}px` } : {}),
    ...(!comExtra ? { "--cz-ext": "0px" } : larguras[COL_EXTRA] ? { "--cz-ext": `${larguras[COL_EXTRA]}px` } : {}),
    ...(!comTotal ? { "--cz-tot": "0px" } : larguras[COL_TOTAL] ? { "--cz-tot": `${larguras[COL_TOTAL]}px` } : {}),
    // O que a extra e o total ocupam da faixa CONGELADA (desktop): a largura quando congelados, 0 quando soltos.
    "--cz-ext-f": extraFixa ? "var(--cz-ext)" : "0px",
    "--cz-tot-f": totalFixo ? "var(--cz-tot)" : "0px",
  };

  /** O cabeçalho de uma coluna: fora da edição ORDENA; na edição abre o MENU da coluna. */
  const cabecalho = (o: {
    chave: string;
    rotulo: string;
    por: OrdemCruzamento["por"];
    texto: boolean;
    alinhar: "left" | "right";
    fixa?: boolean;
    fixavel?: boolean;
    ocultavel?: boolean;
    mover?: { esquerda: boolean; direita: boolean };
  }) => {
    const rotulo = <span className={o.alinhar === "right" ? "line-clamp-2 break-words text-right" : "truncate"}>{o.rotulo}</span>;
    if (!edicao)
      return (
        <button type="button" className={`${botaoCab} ${o.alinhar === "right" ? "justify-end" : ""}`} title={o.rotulo} onClick={() => onOrdenar(o.por)}>
          {o.alinhar === "right" && seta(o.por)}
          {rotulo}
          {o.alinhar === "left" && seta(o.por)}
        </button>
      );
    const oculta = fora.has(o.chave);
    return (
      <>
        <Dropdown
          className="block w-full"
          triggerClassName={`w-full gap-1 text-left hover:text-text ${o.alinhar === "right" ? "justify-end" : ""}`}
          ariaLabel={`Editar a coluna ${o.rotulo}`}
          width={232}
          align={o.alinhar === "right" ? "end" : "start"}
          trigger={
            <>
              {o.fixa && <IconFixar className="h-3 w-3 shrink-0 text-accent" aria-hidden />}
              {oculta && <IconEyeOff className="h-3 w-3 shrink-0" aria-hidden />}
              {rotulo}
              <IconChevronDown className="h-3 w-3 shrink-0" aria-hidden />
            </>
          }
        >
          {(fechar) => {
            const agir = (f: () => void) => () => {
              f();
              fechar();
            };
            const [crescente, decrescente] = o.texto ? ["A → Z", "Z → A"] : ["Menor → maior", "Maior → menor"];
            return (
              <div className="space-y-0.5">
                <p className="truncate px-2.5 pb-1 text-[12px] font-semibold text-text" title={o.rotulo}>
                  {o.rotulo}
                </p>
                <ItemMenu icone={<IconArrowUp className="h-4 w-4" />} onClick={agir(() => onOrdenar(o.por, false))}>
                  Ordenar {crescente}
                </ItemMenu>
                <ItemMenu icone={<IconArrowDown className="h-4 w-4" />} onClick={agir(() => onOrdenar(o.por, true))}>
                  Ordenar {decrescente}
                </ItemMenu>
                {o.fixavel && (
                  <ItemMenu
                    icone={o.fixa ? <IconDesafixar className="h-4 w-4" /> : <IconFixar className="h-4 w-4" />}
                    onClick={agir(() => edicao.onFixar(o.chave))}
                    disabled={oculta}
                  >
                    {o.fixa ? "Descongelar" : "Congelar à esquerda"}
                  </ItemMenu>
                )}
                {o.mover && (
                  <>
                    <ItemMenu icone={<IconChevronLeft className="h-4 w-4" />} onClick={agir(() => edicao.onMover(o.chave, -1))} disabled={!o.mover.esquerda}>
                      Mover para a esquerda
                    </ItemMenu>
                    <ItemMenu icone={<IconChevronRight className="h-4 w-4" />} onClick={agir(() => edicao.onMover(o.chave, 1))} disabled={!o.mover.direita}>
                      Mover para a direita
                    </ItemMenu>
                  </>
                )}
                {o.ocultavel && (
                  <ItemMenu icone={oculta ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />} onClick={agir(() => edicao.onOcultar(o.chave))}>
                    {oculta ? "Mostrar" : "Ocultar"}
                  </ItemMenu>
                )}
                <ItemMenu icone={<IconUndo className="h-4 w-4" />} onClick={agir(() => edicao.onLargura(o.chave, null))} disabled={!larguras[o.chave]}>
                  Largura padrão
                </ItemMenu>
              </div>
            );
          }}
        </Dropdown>
        <AlcaLargura rotulo={o.rotulo} largura={larguras[o.chave]} onLargura={(px) => edicao.onLargura(o.chave, px)} />
      </>
    );
  };

  return (
    <div
      ref={ref}
      className={`${LARGURAS} [--cz-base:0px] lg:[--cz-base:calc(var(--cz-ext-f)_+_var(--cz-tot-f))] flex flex-col overflow-clip rounded-card border bg-surface ${
        editando ? "border-accent/50" : "border-border"
      }`}
      style={estiloRaiz}
      suppressHydrationWarning
    >
      {linhas.length === 0 || ordemCols.todas.length === 0 ? (
        <p className="grid flex-1 place-items-center px-4 py-12 text-center text-[13px] text-faint">{vazio}</p>
      ) : (
        <div ref={rolagem} className="max-h-[75dvh] min-h-0 flex-1 overflow-auto overscroll-contain lg:max-h-none">
          <table className="w-max border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th scope="col" aria-sort={ariaSort("rotulo")} className={`${cab} left-0 z-30 text-left ${DIVISA}`} style={larguraVar("var(--cz-rot)")}>
                  {cabecalho({ chave: COL_ROTULO, rotulo: rotuloLinhas, por: "rotulo", texto: true, alinhar: "left" })}
                </th>
                {comExtra && (
                  <th
                    scope="col"
                    aria-sort={ariaSort("extra")}
                    className={`${cab} text-left ${extraFixa ? "lg:left-[var(--cz-rot)] lg:z-30" : ""} ${divisaExtra}`}
                    style={larguraVar("var(--cz-ext)")}
                  >
                    {cabecalho({
                      chave: COL_EXTRA,
                      rotulo: rotuloExtra,
                      por: "extra",
                      texto: true,
                      alinhar: "left",
                      fixa: extraFixa,
                      fixavel: true,
                      ocultavel: true,
                    })}
                  </th>
                )}
                {comTotal && (
                  <th
                    scope="col"
                    aria-sort={ariaSort("total")}
                    className={`${cab} text-right ${totalFixo ? "lg:left-[calc(var(--cz-rot)_+_var(--cz-ext-f))] lg:z-30" : ""} ${divisaTotal}`}
                    style={larguraVar("var(--cz-tot)")}
                  >
                    {cabecalho({ chave: COL_TOTAL, rotulo: "Total", por: "total", texto: false, alinhar: "right", fixa: totalFixo, fixavel: true, ocultavel: true })}
                  </th>
                )}
                {ordemCols.todas.map((j, p) => {
                  const c = colunas[j];
                  const fixa = p < nFix;
                  const naFaixa = p < ordemCols.fix.length; // fixada (mesmo sem caber) — move entre as fixadas
                  return (
                    <th
                      key={c.chave}
                      scope="col"
                      aria-sort={ariaSort({ coluna: c.chave })}
                      className={`${cab} text-right ${fixa ? `z-30 ${p === nFix - 1 ? DIVISA : ""}` : ""}`}
                      style={{ ...larguraVar(wCol(c.chave)), ...(fixa ? esquerda(p) : {}) }}
                    >
                      {cabecalho({
                        chave: c.chave,
                        rotulo: c.rotulo,
                        por: { coluna: c.chave },
                        texto: false,
                        alinhar: "right",
                        fixa: naFaixa,
                        fixavel: true,
                        ocultavel: true,
                        mover: {
                          esquerda: naFaixa ? p > 0 : p > ordemCols.fix.length,
                          direita: naFaixa ? p < ordemCols.fix.length - 1 : p < ordemCols.todas.length - 1,
                        },
                      })}
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
                      className={`${CEL} bg-surface text-left text-text-2 group-hover/linha:bg-surface-2 ${extraFixa ? "lg:sticky lg:left-[var(--cz-rot)] lg:z-10" : ""} ${divisaExtra}`}
                      style={larguraVar("var(--cz-ext)")}
                      title={l.extra}
                    >
                      <span className={`block truncate ${esmaecida(COL_EXTRA)}`}>{l.extra || <span className="text-faint">–</span>}</span>
                    </td>
                  )}
                  {comTotal && (
                    <td
                      data-l={l.chave}
                      tabIndex={onAbrir ? 0 : undefined}
                      className={`${CEL} bg-surface text-right font-semibold tabular-nums text-text group-hover/linha:bg-surface-2 ${totalFixo ? "lg:sticky lg:left-[calc(var(--cz-rot)_+_var(--cz-ext-f))] lg:z-10" : ""} ${divisaTotal} ${onAbrir ? "cursor-pointer" : ""} ${ehAtiva(l.chave, null) ? anelAtivo : ""}`}
                      style={larguraVar("var(--cz-tot)")}
                    >
                      <span className={esmaecida(COL_TOTAL)}>{texto(l.total, { linha: l.total, coluna: total })}</span>
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
                        <span className={esmaecida(c.chave)}>{texto(v, { linha: l.total, coluna: c.total })}</span>
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
                {comExtra && (
                  <td
                    className={`${CEL} sticky bottom-0 z-20 border-t border-border bg-surface-2 ${extraFixa ? "lg:left-[var(--cz-rot)] lg:z-30" : ""} ${divisaExtra}`}
                    style={larguraVar("var(--cz-ext)")}
                  />
                )}
                {comTotal && (
                  <td
                    className={`${CEL} sticky bottom-0 z-20 border-t border-border bg-surface-2 text-right tabular-nums ${totalFixo ? "lg:left-[calc(var(--cz-rot)_+_var(--cz-ext-f))] lg:z-30" : ""} ${divisaTotal}`}
                    style={larguraVar("var(--cz-tot)")}
                  >
                    <span className={esmaecida(COL_TOTAL)}>{texto(total, { linha: total, coluna: total })}</span>
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
                      <span className={esmaecida(c.chave)}>{texto(c.total, { linha: total, coluna: c.total })}</span>
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
