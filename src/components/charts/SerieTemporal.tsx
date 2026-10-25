"use client";

import { type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { hexToHsv, hsvToHex } from "@/lib/color";
import { brl } from "@/lib/format";
import { IconClose } from "../icons";
import { semMovimento } from "../useContagem";
import { ChartEmpty, TooltipBox, useChartTokens } from "./shared";

/** Uma série do gráfico (o valor de cada ponto já em REAIS). */
export type SerieTemporalDef = { chave: string; rotulo: string; cor: number };
/** Um ponto (balde de tempo): a chave, o rótulo do eixo, o título da dica e os valores de cada série (em reais). */
export type PontoTemporal = { chave: string; rotulo: string; titulo: string; atual?: boolean; valores: Record<string, number> };
/** Uma linha a mais na dica de um ponto: rótulo, valor e o bloco (as linhas de mesma `secao` ficam juntas, sob o título). */
export type LinhaDica = { rotulo: string; valor: string; secao?: string };

/** O maior valor de todas as séries nos dados (a folga da escala ajustada). */
function dataMax(dados: Record<string, number | string>[], series: readonly SerieTemporalDef[]): number {
  let m = 0;
  for (const d of dados) for (const s of series) m = Math.max(m, Number(d[s.chave]) || 0);
  return m;
}

/** O PONTO sobre a linha com a animação de "online": a onda na cor da série que se expande e some, sem parar (a mesma do
 * ponto de presença; parada com "reduzir movimento"). */
function PontoVivo({ cx, cy, cor, fundo }: { cx?: number; cy?: number; cor: string; fundo: string }) {
  if (cx == null || cy == null) return <g />;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={5} fill={cor} className="ponto-onda" />
      <circle cx={cx} cy={cy} r={5} stroke={fundo} strokeWidth={2} fill={cor} />
    </g>
  );
}

/** O afastamento da dica em relação à ponta do mouse e às bordas do desenho. */
const AFASTA = 18;
const BORDA = 8;

/**
 * A DICA que SEGUE o mouse e nunca fica sob a ponta dele (com `fixo`, a MARCAÇÃO: parada no ponto clicado e tocável): ao lado do ponteiro (direita; sem espaço, esquerda), centrada na
 * altura dele e presa dentro do desenho; sem lugar dos lados (tela estreita), vai para cima ou para baixo do ponteiro. Lê o
 * próprio tamanho e o do desenho; o movimento atualiza num quadro de animação.
 */
function DicaQueSegue({ caixa, fixo, children }: { caixa: RefObject<HTMLElement | null>; fixo?: { x: number; y: number }; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const el = caixa.current;
    if (!el || fixo) return;
    let quadro = 0;
    const mover = (e: PointerEvent) => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setMouse({ x: e.clientX - r.left, y: e.clientY - r.top });
      });
    };
    el.addEventListener("pointermove", mover);
    return () => {
      cancelAnimationFrame(quadro);
      el.removeEventListener("pointermove", mover);
    };
  }, [caixa, fixo]);
  useLayoutEffect(() => {
    const el = caixa.current;
    const d = ref.current;
    const m = fixo ?? mouse;
    if (!el || !d || !m) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const w = d.offsetWidth;
    const h = d.offsetHeight;
    const entre = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));
    let left: number;
    let top = entre(m.y - h / 2, BORDA, H - h - BORDA);
    if (m.x + AFASTA + w <= W - BORDA) left = m.x + AFASTA;
    else if (m.x - AFASTA - w >= BORDA) left = m.x - AFASTA - w;
    else {
      // Sem lugar dos lados: acima do ponteiro (ou abaixo, se não couber em cima).
      left = entre(m.x - w / 2, BORDA, W - w - BORDA);
      top = m.y - AFASTA - h >= BORDA ? m.y - AFASTA - h : entre(m.y + AFASTA, BORDA, H - h - BORDA);
    }
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  });
  return (
    <div ref={ref} className={`absolute ${fixo ? "pointer-events-auto z-20" : "pointer-events-none"}`} style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}>
      {children}
    </div>
  );
}

/**
 * O TOM DE SELEÇÃO de uma cor de série (o trecho escolhido): a mesma cor, mais saturada e mais profunda — cada cor tem a sua
 * contrapartida, todas na mesma proporção. `escurecer` = quanto mais profunda (a linha do topo vai mais longe).
 */
function tomSelecao(cor: string, escurecer = 0.14): string {
  const hsv = hexToHsv(cor);
  if (!hsv) return cor;
  const [h, sat, v] = hsv;
  return hsvToHex(h, Math.min(100, sat + 18), Math.max(0, v - escurecer * 100));
}

/** Espaço livre no alto do desenho que PREENCHE o cartão (os controles em vidro ficam sobre ele, sem cobrir os dados). */
const TOPO_LIVRE = 60;
/** No celular os controles (menores) ocupam duas linhas. */
const TOPO_LIVRE_ESTREITA = 80;
/** A duração de toda mudança do desenho (os valores deslizando ou um desenho dando lugar a outro). */
const TRANSICAO_MS = 520;

type Linha = Record<string, number | string>;

/** A curva das transições: começa e termina devagar (o desenho "escorre" até o lugar novo). */
const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * O DESENHO SUAVE: com os MESMOS baldes (só os valores mudam — filtro, Acumulado/Por período), os valores deslizam até os
 * novos quadro a quadro (as laterais nunca saem do lugar: o eixo X é o mesmo); com OUTROS baldes (período, agrupamento,
 * zoom), o desenho anterior fica embaixo esmaecendo enquanto o novo surge por cima. Uma mudança no meio de outra parte de
 * onde o desenho está. Sem movimento com "reduzir movimento".
 */
function useDesenhoSuave(dados: Linha[], estrutura: string, chaves: readonly string[]) {
  const [visto, setVisto] = useState(dados);
  const [saindo, setSaindo] = useState<{ dados: Linha[]; n: number } | null>(null);
  const vistoRef = useRef(dados);
  const antes = useRef({ dados, estrutura });
  const quadro = useRef(0);
  useEffect(() => {
    const de = antes.current;
    antes.current = { dados, estrutura };
    if (de.dados === dados) return;
    cancelAnimationFrame(quadro.current);
    const aplicar = (d: Linha[]) => {
      vistoRef.current = d;
      setVisto(d);
    };
    if (semMovimento()) {
      setSaindo(null);
      return aplicar(dados);
    }
    if (de.estrutura !== estrutura) {
      setSaindo((s) => ({ dados: vistoRef.current, n: (s?.n ?? 0) + 1 }));
      return aplicar(dados);
    }
    const inicio = vistoRef.current;
    const t0 = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - t0) / TRANSICAO_MS);
      const k = suave(t);
      aplicar(
        t === 1
          ? dados
          : dados.map((alvo, i) => {
              const ini = inicio[i] ?? alvo;
              const linha: Linha = { ...alvo };
              for (const c of chaves) {
                const a = Number(ini[c]) || 0;
                linha[c] = a + ((Number(alvo[c]) || 0) - a) * k;
              }
              return linha;
            }),
      );
      if (t < 1) quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
  }, [dados, estrutura, chaves]);
  useEffect(() => () => cancelAnimationFrame(quadro.current), []);
  return { visto, saindo, fimSaida: () => setSaindo(null) };
}

/** O que o clique e o arrasto deixaram: um ponto MARCADO ou um TRECHO entre dois pontos (índices), com onde a dica fica. */
type Selecao = { tipo: "ponto"; i: number; x: number; y: number } | { tipo: "trecho"; a: number; b: number; x: number; y: number };

/**
 * SÉRIE TEMPORAL — as ONDAS de evolução do sistema (Recharts, cores pelos tokens `--serie-*`): áreas em camadas com
 * degradê forte (a 1ª série atrás), sem legenda, eixo Y nem linhas horizontais — as grades verticais leves e os rótulos do
 * tempo; os nomes e valores de TODAS as séries ficam na dica (+ `extraDica`), as cores são as dos indicadores da tela. O
 * balde de hoje leva a linha tracejada.
 *
 * INTERAÇÃO: sem clique, a dica SEGUE o mouse e nunca fica sob ele. O 1º clique MARCA o ponto (a dica para ali, tocável);
 * o 2º no MESMO ponto = `onEscolher` (a origem); o 2º em OUTRO ponto — ou pressionar e ARRASTAR sobre o gráfico — seleciona
 * o TRECHO entre os dois (`onTrecho`/`dicaTrecho`: a comparação e a origem do trecho). Esc, clicar fora ou outros baldes
 * desfazem; pelo teclado, a origem de cada balde fica na vista em tabela.
 *
 * TRANSIÇÕES (`useDesenhoSuave`): toda mudança desliza ou esmaece em ~0,5 s e as laterais do desenho ficam sempre no
 * lugar (o Recharts não anima o caminho — a interpolação dele entre larguras ou números de pontos diferentes descolava as
 * pontas). `preencher` = o desenho ocupa a caixa inteira (sem margens, as datas por DENTRO e um espaço livre no alto para
 * os controles em vidro).
 */
export function SerieTemporal({
  pontos,
  series,
  onEscolher,
  extraDica,
  onTrecho,
  dicaTrecho,
  altura = 320,
  ariaLabel,
  ajustarY = false,
  preencher = false,
  reservaRotulos = 0,
}: {
  pontos: PontoTemporal[];
  series: readonly SerieTemporalDef[];
  onEscolher?: (p: PontoTemporal) => void;
  /** Linhas a mais na dica de um ponto (ex.: "% do empenhado"); `secao` = o título do bloco em que a linha entra. */
  extraDica?: (p: PontoTemporal) => LinhaDica[];
  /** A origem de um TRECHO (do 1º ao 2º ponto, em ordem) — sem ela, não há seleção de trecho. */
  onTrecho?: (de: PontoTemporal, ate: PontoTemporal) => void;
  /** As linhas da comparação de um trecho (o que mudou entre os dois pontos). */
  dicaTrecho?: (de: PontoTemporal, ate: PontoTemporal) => LinhaDica[];
  altura?: number;
  ariaLabel: string;
  /** A escala vertical começa perto do MENOR valor à vista (não no zero) — no zoom do acumulado, para a variação aparecer. */
  ajustarY?: boolean;
  preencher?: boolean;
  /** No `preencher`: a faixa à DIREITA (px) em que as datas não entram (onde ficam os controles sobre o desenho). */
  reservaRotulos?: number;
}) {
  const tk = useChartTokens();
  const figRef = useRef<HTMLElement>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = figRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // O id do degradê só com letras e números (o do React traz símbolos que o `url(#…)` do SVG não aceita).
  const id = `serie${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [estreita, setEstreita] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const ver = () => setEstreita(mq.matches);
    ver();
    mq.addEventListener("change", ver);
    return () => mq.removeEventListener("change", ver);
  }, []);

  // O SVG do Recharts ESTICA com a caixa (`preserveAspectRatio="none"` + 100% no CSS — `.grafico-esticado`): quando a
  // largura muda (abrir/fechar o menu), o desenho acompanha no MESMO quadro, com as laterais coladas, até o Recharts
  // redesenhar na medida nova (sem a lacuna nem a piscada daquele quadro).
  useLayoutEffect(() => {
    for (const svg of figRef.current?.querySelectorAll("svg.recharts-surface") ?? []) svg.setAttribute("preserveAspectRatio", "none");
  });
  const chaves = useMemo(() => series.map((x) => x.chave), [series]);
  const dados = useMemo<Linha[]>(() => pontos.map((p) => ({ chave: p.chave, ...Object.fromEntries(chaves.map((c) => [c, p.valores[c] ?? 0])) })), [pontos, chaves]);
  const porChave = useMemo(() => new Map(pontos.map((p) => [p.chave, p])), [pontos]);
  const total = pontos.length;
  // Os mesmos baldes (só os valores mudaram) = deslizam; outros baldes (período, agrupamento, zoom) = um desenho dá lugar ao outro.
  const estrutura = total ? `${total}:${pontos[0].chave}:${pontos[total - 1].chave}:${chaves.join(",")}` : "";
  const { visto, saindo, fimSaida } = useDesenhoSuave(dados, estrutura, chaves);

  // O PONTO marcado ou o TRECHO; o arrasto em curso (do índice ao índice) e se o clique que vem depois dele é engolido.
  const [sel, setSel] = useState<Selecao | null>(null);
  const [arrasto, setArrasto] = useState<{ de: number; ate: number } | null>(null);
  const arrastoRef = useRef<{ de: number; ate: number; moveu: boolean } | null>(null);
  const engolirClique = useRef(false);
  const [pulso, setPulso] = useState(0);
  // Outros baldes = a seleção não vale mais (os pontos podem nem existir).
  // biome-ignore lint/correctness/useExhaustiveDependencies: desfaz a seleção quando os baldes mudam.
  useEffect(() => {
    setSel(null);
    setArrasto(null);
    arrastoRef.current = null;
  }, [estrutura]);
  // Esc ou um clique fora do gráfico desfaz a seleção; soltar o botão FORA do gráfico encerra um arrasto.
  useEffect(() => {
    if (!sel && !arrasto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    const fora = (e: PointerEvent) => !figRef.current?.contains(e.target as Node) && setSel(null);
    const soltar = () => {
      arrastoRef.current = null;
      setArrasto(null);
    };
    window.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fora);
    window.addEventListener("pointerup", soltar);
    return () => {
      window.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("pointerup", soltar);
    };
  }, [sel, arrasto]);

  const noGrafico = (e: unknown) => {
    const r = figRef.current?.getBoundingClientRect();
    const ev = e as { clientX?: number; clientY?: number };
    return r && ev.clientX != null && ev.clientY != null ? { x: ev.clientX - r.left, y: ev.clientY - r.top } : { x: 0, y: 0 };
  };
  const indice = (st: { activeIndex?: unknown } | null | undefined) => {
    const i = st?.activeIndex == null ? Number.NaN : Number(st.activeIndex);
    return Number.isInteger(i) && i >= 0 && i < total ? i : null;
  };
  /** O ponto sob uma posição horizontal do ponteiro (os baldes são igualmente espaçados entre as margens do desenho). */
  const indiceNaPosicao = (clientX: number) => {
    const r = figRef.current?.getBoundingClientRect();
    if (!r || !total) return null;
    const esq = preencher ? 0 : 16;
    const util = r.width - esq - (preencher ? 0 : 16);
    if (util <= 0) return null;
    return Math.max(0, Math.min(total - 1, Math.round(((clientX - r.left - esq) / util) * (total - 1))));
  };
  const trecho = (a: number, b: number, e: unknown): Selecao => ({ tipo: "trecho", a: Math.min(a, b), b: Math.max(a, b), ...noGrafico(e) });
  const abrir = (p: PontoTemporal) => {
    setSel(null);
    onEscolher?.(p);
  };
  const abrirTrecho = (a: number, b: number) => {
    setSel(null);
    onTrecho?.(pontos[a], pontos[b]);
  };

  /** A caixa da dica: o título, os valores das séries, as linhas a mais e o rodapé (a ação ou a instrução). */
  const caixa = (titulo: string, valores: ReactNode, linhas: LinhaDica[], rodape: ReactNode) => (
    <TooltipBox vidro>
      <div className="mb-1 font-semibold text-text">{titulo}</div>
      {valores}
      {linhas.map((x, i, l) => (
        <div key={`${x.secao ?? ""}:${x.rotulo}`}>
          {x.secao && x.secao !== l[i - 1]?.secao && (
            <div className="mt-1.5 border-t border-border/70 pt-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{x.secao}</div>
          )}
          <div className={`flex items-center justify-between gap-4 ${x.secao ? "" : "mt-0.5 border-t border-border/70 pt-0.5"}`}>
            <span className="text-muted">{x.rotulo}</span>
            <span className="font-semibold tabular-nums text-text">{x.valor}</span>
          </div>
        </div>
      ))}
      {rodape}
    </TooltipBox>
  );
  const valoresDe = (p: PontoTemporal) =>
    series.map((s) => (
      <div key={s.chave} className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 text-muted">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: tk.serie[s.cor] }} />
          {s.rotulo}
        </span>
        <span className="font-semibold tabular-nums text-text">{brl(p.valores[s.chave] ?? 0)}</span>
      </div>
    ));
  const acoes = (rotulo: string, onAbrir: () => void, nota?: string) => (
    <div className="mt-2 border-t border-border/70 pt-2">
      {nota && <div className="mb-1.5 text-[11px] text-faint">{nota}</div>}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onAbrir}
          className="min-h-9 flex-1 rounded-control bg-accent px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 pointer-coarse:min-h-11"
        >
          {rotulo}
        </button>
        <button
          type="button"
          onClick={() => setSel(null)}
          aria-label="Desfazer a seleção"
          title="Desfazer (Esc)"
          className="grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 pointer-coarse:size-11"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
  const instrucao = onEscolher
    ? onTrecho
      ? "Clique para marcar · arraste ou clique em outro ponto para comparar"
      : "Clique para marcar · de novo para os dados completos"
    : null;

  if (!total) return <ChartEmpty label="Nada no período escolhido" />;
  const intervalo = Math.max(0, Math.ceil(total / (estreita ? 6 : 8)) - 1);
  const atual = pontos.find((p) => p.atual);
  const margem = preencher ? { top: estreita ? TOPO_LIVRE_ESTREITA : TOPO_LIVRE, right: 0, left: 0, bottom: 0 } : { top: 12, right: 16, left: 16, bottom: 0 };
  // O topo da escala = o MAIOR valor à vista (o desenho chega ao alto; o espaço dos controles é a margem de cima).
  const dominio = (d: Linha[]) => [ajustarY ? (min: number) => Math.max(0, min - (dataMax(d, series) - min) * 0.12) : 0, preencher ? "dataMax" : "auto"] as const;
  /** Os degradês das áreas; `selecao` = o tom de seleção de cada cor (mais denso, para o trecho). */
  const degrades = (pref: string, selecao = false) => (
    <defs>
      {series.map((s) => (
        <linearGradient key={s.chave} id={`${pref}-${s.chave}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={selecao ? tomSelecao(tk.serie[s.cor]) : tk.serie[s.cor]} stopOpacity={selecao ? 1 : 0.92} />
          <stop offset="100%" stopColor={selecao ? tomSelecao(tk.serie[s.cor]) : tk.serie[s.cor]} stopOpacity={selecao ? 0.85 : 0.45} />
        </linearGradient>
      ))}
    </defs>
  );
  const marcado = sel?.tipo === "ponto" ? pontos[sel.i] : undefined;
  const faixa = sel?.tipo === "trecho" ? { a: sel.a, b: sel.b } : arrasto && arrasto.de !== arrasto.ate ? { a: Math.min(arrasto.de, arrasto.ate), b: Math.max(arrasto.de, arrasto.ate) } : null;
  const pontoDoVisto = (i: number) => visto[i] ?? dados[i];
  // As bordas do recorte do trecho (px, no SVG): a posição horizontal dos dois pontos entre as margens do desenho.
  const xDo = (i: number) => margem.left + (i / Math.max(1, total - 1)) * Math.max(0, largura - margem.left - margem.right);


  return (
    <figure
      ref={figRef}
      aria-label={ariaLabel}
      className={`grafico-esticado relative m-0 [&_*:focus]:outline-none [&_svg]:outline-none ${arrasto ? "select-none" : ""}`}
      style={{ height: estreita ? Math.min(altura, preencher ? 320 : 240) : altura }}
    >
      {/* O recorte do TRECHO (o `clipPath` do SVG) nas cópias das áreas — a regra só existe com um trecho. */}
      {faixa && <style>{`.${id}-trecho{clip-path:url(#${id}-recorte);pointer-events:none}`}</style>}
      {/* O desenho ANTERIOR (outros baldes), esmaecendo embaixo do novo. */}
      {saindo && (
        <div key={saindo.n} aria-hidden className="grafico-sai pointer-events-none absolute inset-0" onAnimationEnd={fimSaida}>
          <ResponsiveContainer>
            <AreaChart data={saindo.dados} margin={margem} accessibilityLayer={false}>
              {degrades(`${id}s`)}
              <YAxis hide domain={dominio(saindo.dados)} />
              <XAxis dataKey="chave" hide />
              {series.map((s) => (
                <Area key={s.chave} type="monotone" dataKey={s.chave} stroke="none" fill={`url(#${id}s-${s.chave})`} dot={false} activeDot={false} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* O ARRASTO (mouse e caneta; no toque, os dois toques) pelo ponteiro nativo: o ponto sob ele vem da posição no desenho. */}
      <div
        key={estrutura}
        role="none"
        className={`h-full ${saindo ? "grafico-entra" : ""} ${onEscolher ? "cursor-pointer" : ""}`}
        onPointerDown={(e) => {
          if (!onTrecho || e.pointerType === "touch" || e.button !== 0) return;
          const i = indiceNaPosicao(e.clientX);
          if (i == null) return;
          e.preventDefault();
          arrastoRef.current = { de: i, ate: i, moveu: false };
        }}
        onPointerMove={(e) => {
          const g = arrastoRef.current;
          const i = g ? indiceNaPosicao(e.clientX) : null;
          if (!g || i == null || i === g.ate) return;
          g.ate = i;
          g.moveu = g.moveu || i !== g.de;
          setArrasto({ de: g.de, ate: g.ate });
        }}
        onPointerUp={(e) => {
          const g = arrastoRef.current;
          arrastoRef.current = null;
          setArrasto(null);
          if (!g?.moveu || g.de === g.ate) return;
          engolirClique.current = true;
          setSel(trecho(g.de, g.ate, e));
        }}
      >
        <ResponsiveContainer>
          <AreaChart
            data={visto}
            margin={margem}
            accessibilityLayer={false}
            onClick={(st, e) => {
              if (engolirClique.current) {
                engolirClique.current = false;
                return;
              }
              const i = indice(st);
              if (!onEscolher || i == null) return;
              if (sel?.tipo === "ponto" && sel.i === i) return abrir(pontos[i]);
              if (sel?.tipo === "ponto" && onTrecho) return setSel(trecho(sel.i, i, e));
              setSel({ tipo: "ponto", i, ...noGrafico(e) });
              setPulso((n) => n + 1);
            }}
          >
            {degrades(id)}
            {faixa && degrades(`${id}t`, true)}
            {faixa && (
              <defs>
                <clipPath id={`${id}-recorte`}>
                  <rect x={xDo(faixa.a)} y={0} width={Math.max(0, xDo(faixa.b) - xDo(faixa.a))} height={9999} />
                </clipPath>
              </defs>
            )}
            <YAxis hide domain={dominio(visto)} />
            <CartesianGrid stroke={tk.axis} strokeOpacity={0.3} horizontal={false} />
            <XAxis
              dataKey="chave"
              tickFormatter={(c: string) => porChave.get(c)?.rotulo ?? c}
              tick={{ fontSize: 11, fill: tk.axis }}
              hide={preencher}
              axisLine={false}
              tickLine={false}
              interval={intervalo}
              minTickGap={8}
            />
            <Tooltip
              cursor={{ stroke: tk.axis, strokeOpacity: 0.85, strokeWidth: 1.5, strokeDasharray: "4 4" }}
              isAnimationActive={false}
              // A posição é da própria dica (`DicaQueSegue`): o invólucro do Recharts fica parado no canto do desenho.
              position={{ x: 0, y: 0 }}
              // Com um ponto marcado, um trecho ou um arrasto, só a seleção fica à vista.
              active={sel || arrasto ? false : undefined}
              wrapperStyle={{ inset: 0, width: "100%", height: "100%", transform: "none", pointerEvents: "none" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = porChave.get(String((payload[0].payload as { chave: string }).chave));
                if (!p) return null;
                return (
                  <DicaQueSegue caixa={figRef}>
                    {caixa(p.titulo, valoresDe(p), extraDica?.(p) ?? [], instrucao && <div className="mt-1.5 text-[11px] text-faint">{instrucao}</div>)}
                  </DicaQueSegue>
                );
              }}
            />
            {atual && <ReferenceLine x={atual.chave} stroke={tk.axis} strokeOpacity={0.85} strokeWidth={1.5} strokeDasharray="4 3" />}
            {marcado && <ReferenceLine x={marcado.chave} stroke={tk.axis} strokeOpacity={0.85} strokeWidth={1.5} strokeDasharray="4 4" />}
            {series.map((s) => (
              <Area
                key={s.chave}
                type="monotone"
                dataKey={s.chave}
                name={s.rotulo}
                stroke="none"
                fill={`url(#${id}-${s.chave})`}
                fillOpacity={faixa ? 0.3 : 1}
                dot={false}
                activeDot={(d: { cx?: number; cy?: number }) => <PontoVivo cx={d.cx} cy={d.cy} cor={tk.serie[s.cor]} fundo={tk.fundo} />}
                isAnimationActive={false}
              />
            ))}
            {/* O TRECHO: cada área ganha, só entre as duas pontas, o SEU tom de seleção (o degradê mais forte e a linha do topo
                na cor dela); fora dele o desenho esmaece. O recorte é um `clip-path` do próprio SVG (leve: nada recalculado). */}
            {faixa &&
              series.map((s) => (
                <Area
                  key={`trecho-${s.chave}`}
                  className={`${id}-trecho`}
                  type="monotone"
                  dataKey={s.chave}
                  stroke={tomSelecao(tk.serie[s.cor], 0.24)}
                  strokeWidth={2.5}
                  fill={`url(#${id}t-${s.chave})`}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
            {/* Os pontos da seleção (o marcado ou as duas pontas do trecho), pulsando como "online". */}
            {(marcado ? [sel?.tipo === "ponto" ? sel.i : 0] : sel?.tipo === "trecho" ? [sel.a, sel.b] : []).flatMap((i) =>
              series.map((s) => (
                <ReferenceDot
                  key={`sel-${i}-${s.chave}`}
                  x={pontos[i].chave}
                  y={Number(pontoDoVisto(i)[s.chave]) || 0}
                  shape={(d: { cx?: number; cy?: number }) =>
                    d.cx == null || d.cy == null ? (
                      <g />
                    ) : (
                      <g>
                        <circle key={pulso} cx={d.cx} cy={d.cy} r={5} fill="none" stroke={tk.serie[s.cor]} strokeWidth={2} className="pulso-ponto" />
                        <PontoVivo cx={d.cx} cy={d.cy} cor={tk.serie[s.cor]} fundo={tk.fundo} />
                      </g>
                    )
                  }
                />
              )),
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {sel?.tipo === "ponto" && marcado && (
        <DicaQueSegue caixa={figRef} fixo={{ x: sel.x, y: sel.y }}>
          {caixa(marcado.titulo, valoresDe(marcado), extraDica?.(marcado) ?? [], onEscolher && acoes("Ver os dados completos", () => abrir(marcado), onTrecho ? "Clique em outro ponto para comparar o trecho" : undefined))}
        </DicaQueSegue>
      )}
      {sel?.tipo === "trecho" && (
        <DicaQueSegue caixa={figRef} fixo={{ x: sel.x, y: sel.y }}>
          {caixa(`${pontos[sel.a].titulo} → ${pontos[sel.b].titulo}`, null, dicaTrecho?.(pontos[sel.a], pontos[sel.b]) ?? [], acoes("Ver os dados do trecho", () => abrirTrecho(sel.a, sel.b)))}
        </DicaQueSegue>
      )}
      {preencher && (
        // As DATAS por dentro do desenho (o desenho vai até a base do cartão): na posição de cada ponto, as das pontas
        // alinhadas à borda; o halo da superfície garante a leitura sobre as ondas.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-2 h-5 text-[12.5px] font-semibold text-text [text-shadow:0_0_2px_var(--surface),0_0_4px_var(--surface),0_0_8px_var(--surface)]"
        >
          {pontos.map((p, i) => {
            if (i % (intervalo + 1) !== 0) return null;
            const x = (i / Math.max(1, total - 1)) * largura;
            // Fora da faixa dos controles (as datas que cairiam sob eles não aparecem) e as das pontas alinhadas à borda.
            if (i > 0 && (x < 72 || x > largura - reservaRotulos - 24)) return null;
            return (
              <span
                key={p.chave}
                className="absolute whitespace-nowrap tabular-nums"
                // Em % da largura: acompanham a caixa no mesmo quadro (sem esperar a medida nova).
                style={i === 0 ? { left: 10 } : !reservaRotulos && x > largura - 30 ? { right: 10 } : { left: `${(i / Math.max(1, total - 1)) * 100}%`, transform: "translateX(-50%)" }}
              >
                {p.rotulo}
              </span>
            );
          })}
        </div>
      )}
    </figure>
  );
}
