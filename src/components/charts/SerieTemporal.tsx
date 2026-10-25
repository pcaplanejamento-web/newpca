"use client";

import { type CSSProperties, type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { hexToHsv, hsvToHex } from "@/lib/color";
import { brl } from "@/lib/format";
import { escalaDoQuadro, morfologia, type QuadroSerie } from "@/lib/serie-morfologia";
import { IconClose } from "../icons";
import { semMovimento } from "../useContagem";
import { ALTURA_PILULA, BASE_DATAS, RECUO_DICA, TOPO_DAS_DATAS } from "./serie-medidas";
import { ChartEmpty, TooltipBox, useChartTokens } from "./shared";

/** Uma série do gráfico (o valor de cada ponto já em REAIS). */
export type SerieTemporalDef = { chave: string; rotulo: string; cor: number };
/** Um ponto (balde de tempo): a chave, o rótulo do eixo, o título da dica e os valores de cada série (em reais). */
export type PontoTemporal = {
  chave: string;
  rotulo: string;
  titulo: string;
  atual?: boolean;
  /** O balde de UM dia que é HOJE: a pílula da data diz "Hoje". */
  hoje?: boolean;
  /** A posição no TEMPO (ex.: o dia do meio do balde): a transição entre desenhos casa as curvas pela data. Sem ela, a ordem. */
  t?: number;
  valores: Record<string, number>;
};
/** Uma linha a mais na dica de um ponto: rótulo, valor e o bloco (as linhas de mesma `secao` ficam juntas, sob o título). */
export type LinhaDica = { rotulo: string; valor: string; secao?: string };

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
function DicaQueSegue({
  caixa,
  fixo,
  evitar,
  base = 0,
  children,
}: {
  caixa: RefObject<HTMLElement | null>;
  /** A faixa da BASE (px) que a dica nunca cobre — a linha das datas, que são botões. */
  base?: number;
  fixo?: { x: number; y: number };
  /** A faixa horizontal (px) que a dica NÃO cobre — o ponto marcado ou o trecho: fica DEPOIS dela; sem lugar, ANTES; sem
   * lugar dos dois lados (as bordas do gráfico), no meio. */
  evitar?: { de: number; ate: number };
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; max: number; rola: boolean; maxW: number } | null>(null);
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
    const H = el.clientHeight;
    // Os controles sobre o desenho (`data-reserva-dica`: "topo" = a faixa do alto; "lado" = a pilha lateral) — a dica
    // fica AO LADO deles, com o recuo padrão, nunca por cima.
    const re = el.getBoundingClientRect();
    let cima = BORDA;
    let dir = el.clientWidth - BORDA;
    for (const r of el.parentElement?.querySelectorAll<HTMLElement>("[data-reserva-dica]") ?? []) {
      const b = r.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (r.dataset.reservaDica === "lado") dir = Math.min(dir, b.left - re.left - RECUO_DICA);
      else cima = Math.max(cima, b.bottom - re.top + RECUO_DICA);
    }
    const larguraMax = Math.max(0, dir - BORDA);
    const w = Math.min(d.offsetWidth, larguraMax);
    const fundo = H - Math.max(BORDA, base);
    // Mais alta que o espaço livre (o celular): a dica rola por dentro — nunca cobre as datas nem os controles.
    const max = Math.max(0, fundo - cima);
    const h = Math.min(d.scrollHeight, max);
    const entre = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));
    let left: number;
    let top = entre(m.y - h / 2, cima, fundo - h);
    // A faixa a deixar livre: a da marcação, senão a própria ponta do mouse.
    const de = evitar ? Math.min(evitar.de, evitar.ate) : m.x;
    const ate = evitar ? Math.max(evitar.de, evitar.ate) : m.x;
    if (ate + AFASTA + w <= dir) left = ate + AFASTA;
    // Antes da marcação — e nunca além do espaço livre (a marcação pode estar atrás da pilha lateral).
    else if (Math.min(de - AFASTA, dir) - w >= BORDA) left = Math.min(de - AFASTA, dir) - w;
    else if (evitar) {
      // Sem lugar dos dois lados (a marcação larga e as bordas): no meio da faixa, dentro do espaço livre.
      left = entre((de + ate) / 2 - w / 2, BORDA, dir - w);
    } else {
      // Sem lugar dos lados: acima do ponteiro (ou abaixo, se não couber em cima).
      left = entre(m.x - w / 2, BORDA, dir - w);
      top = m.y - AFASTA - h >= cima ? m.y - AFASTA - h : entre(m.y + AFASTA, cima, fundo - h);
    }
    const rola = d.scrollHeight > max;
    setPos((p) =>
      p && p.left === left && p.top === top && p.max === max && p.rola === rola && p.maxW === larguraMax ? p : { left, top, max, rola, maxW: larguraMax },
    );
  });
  return (
    <div ref={ref} className={`absolute ${fixo ? "pointer-events-auto z-20" : "pointer-events-none"}`} style={pos ? { left: pos.left, top: pos.top, maxWidth: pos.maxW, ...(pos.rola ? { maxHeight: pos.max, overflowY: "auto", overscrollBehavior: "contain" } : {}) } : { left: 0, top: 0, visibility: "hidden" }}>
      {children}
    </div>
  );
}

/**
 * O TOM DE SELEÇÃO de uma cor de série (o trecho escolhido): a mesma cor, mais saturada e mais profunda — cada cor tem a sua
 * contrapartida, todas na mesma proporção. `forca` = quanto se afasta da cor (a linha do topo vai mais longe).
 */
function tomSelecao(cor: string, escuro: boolean, forca = 0.14): string {
  const hsv = hexToHsv(cor);
  if (!hsv) return cor;
  const [h, sat, v] = hsv;
  // No claro, mais profunda; no escuro (fundo escuro), mais clara — sempre destacando do resto do desenho.
  return hsvToHex(h, Math.min(100, sat + 18), escuro ? Math.min(100, v + forca * 100) : Math.max(0, v - forca * 100));
}

/** Espaço livre no alto do desenho que PREENCHE o cartão (os controles em vidro ficam sobre ele, sem cobrir os dados). */
const TOPO_LIVRE = 60;
/** No celular os controles (menores) ocupam duas linhas. */
const TOPO_LIVRE_ESTREITA = 80;
/** A duração de toda mudança do desenho (os valores deslizando ou um desenho dando lugar a outro). */
const TRANSICAO_MS = 520;

/** O texto da pílula de uma data ("Hoje" no balde de um dia que é hoje). */
const textoData = (p: PontoTemporal) => (p.hoje ? "Hoje" : p.rotulo);

/** A curva das transições: começa e termina devagar (o desenho "escorre" até o lugar novo). */
const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * O DESENHO COMO ÁGUA: toda mudança (filtro, Acumulado/Por período, Dia → Mês, zoom, outro período) é uma MORFOLOGIA — as
 * duas curvas amostradas nas mesmas datas pela curva com que o gráfico desenha (`morfologia`, `serie-morfologia.ts`) e
 * misturadas quadro a quadro, com a janela de datas deslizando junto; as laterais ficam sempre na borda (o eixo X é a
 * janela de cada quadro). A mistura é na TELA (cada curva na sua escala — "Por período" de Dia → Mês não "pula"), e a escala
 * vertical e a linha de hoje deslizam junto. Uma mudança no meio de outra parte de onde o desenho está. Nas linhas de
 * marcação e nas datas, só as que SAEM (do `extra` anterior) esmaecem e só as NOVAS surgem — as que ficam (a mesma chave)
 * ficam firmes, nunca a 50% entre duas camadas (era a "piscada"). `anterior` = o `extra` da última troca. Sem movimento com
 * "reduzir movimento".
 */
function useDesenhoSuave<T>(alvo: QuadroSerie, estrutura: string, chaves: readonly string[], extra: T) {
  const [visto, setVisto] = useState(alvo);
  // As camadas que SAEM (uma por troca de baldes; trocas rápidas se acumulam) e o `extra` da última troca (o que já estava).
  const [saindo, setSaindo] = useState<{ extra: T; n: number }[]>([]);
  const [anterior, setAnterior] = useState<T | null>(null);
  const vistoRef = useRef(alvo);
  const antes = useRef({ alvo, estrutura, extra });
  const quadro = useRef(0);
  const entrou = useRef(0);
  // O `extra` acompanha `alvo` — não dispara a transição sozinho. Antes da pintura: a camada que sai e a que entra aparecem
  // no MESMO quadro da troca (nunca um quadro com as datas novas a 100% e as antigas sumidas).
  // biome-ignore lint/correctness/useExhaustiveDependencies: extra vem junto com alvo.
  useLayoutEffect(() => {
    const de = antes.current;
    antes.current = { alvo, estrutura, extra };
    if (de.alvo === alvo) return;
    cancelAnimationFrame(quadro.current);
    const aplicar = (q: QuadroSerie) => {
      vistoRef.current = q;
      setVisto(q);
    };
    if (semMovimento()) {
      setSaindo([]);
      return aplicar(alvo);
    }
    if (de.estrutura !== estrutura) {
      const n = entrou.current + 1;
      entrou.current = n;
      setSaindo((l) => [...l, { extra: de.extra, n }]);
      setAnterior(de.extra);
    }
    const mistura = morfologia(vistoRef.current, alvo, chaves);
    const t0 = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - t0) / TRANSICAO_MS);
      aplicar(mistura(suave(t)));
      if (t < 1) quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
  }, [alvo, estrutura, chaves]);
  useEffect(() => () => cancelAnimationFrame(quadro.current), []);
  return { visto, saindo, anterior, fimSaida: (n: number) => setSaindo((l) => l.filter((x) => x.n !== n)) };
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
 * TRANSIÇÕES (`useDesenhoSuave`): toda mudança é uma MORFOLOGIA de ~0,5 s pela data de cada ponto (`t`) — a linha escorre
 * da posição antiga à nova, também entre Dia, Semana e Mês, e o zoom desliza a janela; as laterais ficam sempre na borda (o
 * Recharts não anima o caminho — a interpolação dele entre números de pontos diferentes descolava as pontas). `preencher` = o desenho ocupa a caixa inteira (sem margens, as datas por DENTRO e um espaço livre no alto para
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
  ocultas,
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
  /** As séries DESLIGADAS (a legenda): continuam no desenho, deitadas no chão — sair e voltar é a MESMA morfologia das
   * demais trocas (a linha desce ou sobe e a escala se ajusta às que ficaram). Ao menos uma fica sempre à vista. */
  ocultas?: ReadonlySet<string>;
}) {
  const tk = useChartTokens();
  const escuro = (hexToHsv(tk.fundo)?.[2] ?? 100) < 45;
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
  const chaveOcultas = ocultas ? [...ocultas].sort().join(",") : "";
  // As séries à vista (dica, pontos, trecho); sem nenhuma, todas.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `chaveOcultas` representa o conjunto.
  const visiveis = useMemo(() => {
    const v = series.filter((x) => !ocultas?.has(x.chave));
    return v.length ? v : series;
  }, [series, chaveOcultas]);
  // O quadro de destino: cada ponto na sua posição no tempo (`t`, senão a ordem) e a janela do 1º ao último.
  // A escala vertical e a linha de hoje vão no quadro: a transição desliza as duas junto com o desenho.
  const alvo = useMemo<QuadroSerie>(() => {
    const linhas = pontos.map((p, i) => ({ chave: p.chave, t: p.t ?? i, ...Object.fromEntries(chaves.map((c) => [c, p.valores[c] ?? 0])) }));
    const lo = linhas[0]?.t ?? 0;
    const fim = linhas.at(-1)?.t ?? 1;
    const hi = fim > lo ? fim : lo + 1;
    const iAtual = pontos.findIndex((p) => p.atual);
    const marca = iAtual >= 0 ? linhas[iAtual].t : null;
    const naVista = visiveis.map((x) => x.chave);
    const escala = escalaDoQuadro(linhas, lo, hi, naVista, { ajustar: ajustarY, folga: preencher ? 1 : 1.06 });
    // As desligadas deitam no chão da escala (altura zero na tela).
    const deitadas = chaves.filter((c) => !naVista.includes(c));
    if (deitadas.length) for (const l of linhas) for (const c of deitadas) (l as Record<string, number | string>)[c] = escala.ylo;
    return { linhas, lo, hi, marca, ...escala };
  }, [pontos, chaves, visiveis, ajustarY, preencher]);
  const porChave = useMemo(() => new Map(pontos.map((p) => [p.chave, p])), [pontos]);
  const total = pontos.length;
  // Os baldes do desenho (outros baldes = a seleção cai e as datas trocam esmaecendo; o desenho escorre nos dois casos).
  const estrutura = total ? `${total}:${pontos[0].chave}:${pontos[total - 1].chave}:${chaves.join(",")}` : "";
  const { visto, saindo, anterior, fimSaida } = useDesenhoSuave(alvo, estrutura, chaves, pontos);
  // O que estava À VISTA (datas e linhas) quando a troca começou: só o que não estava surge — o que já se via fica firme.
  const mostrado = useRef({ datas: new Set<string>(), linhas: new Set<string>() });
  // biome-ignore lint/correctness/useExhaustiveDependencies: o retrato é tirado quando chega um `anterior` novo.
  const vistoAntes = useMemo(() => (anterior ? { datas: new Set(mostrado.current.datas), linhas: new Set(mostrado.current.linhas) } : null), [anterior]);

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
  const margem = preencher ? { top: estreita ? TOPO_LIVRE_ESTREITA : TOPO_LIVRE, right: 0, left: 0, bottom: 0 } : { top: 12, right: 16, left: 16, bottom: 0 };
  /** A posição horizontal (px, no desenho) de um instante `t` na janela à vista. */
  const xDoT = (t: number, w = largura) => margem.left + ((t - visto.lo) / (visto.hi - visto.lo)) * Math.max(0, w - margem.left - margem.right);
  /** O ponto mais perto de uma posição horizontal do ponteiro (pela data, na janela à vista). */
  const indiceNaPosicao = (clientX: number) => {
    const r = figRef.current?.getBoundingClientRect();
    if (!r || !total) return null;
    let melhor = 0;
    for (let i = 1; i < total; i++) if (Math.abs(xDoT(alvo.linhas[i].t, r.width) - (clientX - r.left)) < Math.abs(xDoT(alvo.linhas[melhor].t, r.width) - (clientX - r.left))) melhor = i;
    return melhor;
  };
  const trecho = (a: number, b: number, e: unknown): Selecao => ({ tipo: "trecho", a: Math.min(a, b), b: Math.max(a, b), ...noGrafico(e) });
  const abrir = (p: PontoTemporal) => {
    setSel(null);
    onEscolher?.(p);
  };
  /** O CLIQUE num ponto — no desenho ou na pílula da data, o MESMO: o 1º marca; de novo no mesmo = a origem; outro ponto
   * com um marcado = o trecho entre os dois. `pos` = onde a dica fica (no gráfico). */
  const clicar = (i: number, pos: { x: number; y: number }) => {
    if (!onEscolher) return;
    if (sel?.tipo === "ponto" && sel.i === i) return abrir(pontos[i]);
    if (sel?.tipo === "ponto" && onTrecho) return setSel({ tipo: "trecho", a: Math.min(sel.i, i), b: Math.max(sel.i, i), ...pos });
    setSel({ tipo: "ponto", i, ...pos });
    setPulso((n) => n + 1);
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
    visiveis.map((s) => (
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
  // A escala vertical do QUADRO (`escalaDoQuadro`: só o que está DENTRO da janela) — desliza junto com o desenho.
  const dominioY: [number, number] = [visto.ylo, visto.yhi];
  // As linhas de grade (e as datas do eixo, fora do `preencher`) nas datas de um a cada `intervalo` pontos.
  const ticks = pontos.filter((_, i) => i % (intervalo + 1) === 0).map((p, i) => p.t ?? i * (intervalo + 1));
  const rotuloDoT = new Map(alvo.linhas.map((l, i) => [l.t, pontos[i]?.rotulo ?? ""]));
  /** Os degradês das áreas; `selecao` = o tom de seleção de cada cor (mais denso, para o trecho). */
  const degrades = (pref: string, selecao = false) => (
    <defs>
      {series.map((s) => (
        <linearGradient key={s.chave} id={`${pref}-${s.chave}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={selecao ? tomSelecao(tk.serie[s.cor], escuro) : tk.serie[s.cor]} stopOpacity={selecao ? 1 : 0.92} />
          <stop offset="100%" stopColor={selecao ? tomSelecao(tk.serie[s.cor], escuro) : tk.serie[s.cor]} stopOpacity={selecao ? 0.85 : 0.45} />
        </linearGradient>
      ))}
    </defs>
  );
  /** As LINHAS verticais do tempo por dentro do desenho (atrás das áreas), de UMA lista de pontos — trocam e deslizam junto
   * com as DATAS (`datas`). Posição em % da largura (acompanham a caixa no mesmo quadro) e na janela à vista (no zoom,
   * deslizam com o desenho). */
  const planoLinhas = (lista: PontoTemporal[]): { chave: string; f: number }[] => {
    const n = lista.length;
    const passo = Math.max(0, Math.ceil(n / (estreita ? 6 : 8)) - 1);
    const span = visto.hi - visto.lo;
    const out: { chave: string; f: number }[] = [];
    lista.forEach((p, i) => {
      if (i % (passo + 1) !== 0) return;
      const f = ((p.t ?? i) - visto.lo) / span;
      // Só por dentro do desenho (nas bordas, a linha ficaria colada ao contorno).
      if (f > 0.001 && f < 0.999) out.push({ chave: p.chave, f });
    });
    return out;
  };
  /** As DATAS em pílulas: a 1ª da janela colada à esquerda, a ÚLTIMA colada à direita ("Hoje" quando o balde é o dia de
   * hoje) e, entre elas, uma a cada `passo` — só as que cabem sem encostar nas vizinhas. Na camada atual (`interativa`),
   * cada pílula é um BOTÃO: tocar nela = o MESMO clique no desenho (marca, abre a origem, compara o trecho). */
  type ItemData = { chave: string; p: PontoTemporal; i: number; lado: "esq" | "meio" | "dir"; x: number; f: number };
  const planoDatas = (lista: PontoTemporal[]): ItemData[] => {
    const n = lista.length;
    if (!n || !largura) return [];
    const passo = Math.max(0, Math.ceil(n / (estreita ? 6 : 8)) - 1);
    const span = visto.hi - visto.lo;
    const fDe = (i: number) => ((lista[i].t ?? i) - visto.lo) / span;
    // A largura estimada da pílula (12px semibold tabular + o respiro): decide o que cabe sem medir o DOM.
    const larg = (p: PontoTemporal) => textoData(p).length * 7.4 + 14;
    const VAO = 8;
    const fUlt = fDe(n - 1);
    const ultima = fUlt >= -0.001 && fUlt <= 1.001 ? n - 1 : -1;
    const limiteDireito = ultima >= 0 ? largura - BASE_DATAS - larg(lista[ultima]) - VAO : largura - BASE_DATAS;
    const out: ItemData[] = [];
    let fimAnterior = BASE_DATAS - VAO;
    for (let i = 0; i < n - 1; i++) {
      if (i % (passo + 1) !== 0) continue;
      const f = fDe(i);
      if (f < -0.001 || f > 1.001) continue;
      const w = larg(lista[i]);
      // A 1ª da janela encosta na borda esquerda (também no meio de uma troca, quando o ponto ainda não chegou à borda): a
      // mesma pílula fica à vista o tempo todo, sem sumir e voltar.
      if (f <= 0.001 || (!out.length && f * largura - w / 2 < BASE_DATAS)) {
        if (BASE_DATAS + w > limiteDireito) continue;
        out.push({ chave: lista[i].chave, p: lista[i], i, lado: "esq", x: BASE_DATAS + w / 2, f });
        fimAnterior = BASE_DATAS + w;
        continue;
      }
      const x = f * largura;
      if (x - w / 2 < fimAnterior + VAO || x + w / 2 > limiteDireito) continue;
      out.push({ chave: lista[i].chave, p: lista[i], i, lado: "meio", x, f });
      fimAnterior = x + w / 2;
    }
    if (ultima >= 0) out.push({ chave: lista[ultima].chave, p: lista[ultima], i: ultima, lado: "dir", x: largura - BASE_DATAS - larg(lista[ultima]) / 2, f: fUlt });
    return out;
  };
  const marcados = sel?.tipo === "ponto" ? [sel.i] : sel?.tipo === "trecho" ? [sel.a, sel.b] : [];
  /** Uma pílula de data. Na camada atual (`interativa`) é um BOTÃO: tocar nela = o MESMO clique no desenho. */
  const pilula = ({ p, i, lado, x, f }: ItemData, interativa: boolean, extra: string) => {
    const ativa = interativa && marcados.includes(i);
    const estilo: CSSProperties =
      lado === "esq" ? { left: BASE_DATAS } : lado === "dir" ? { right: BASE_DATAS } : { left: `${f * 100}%`, transform: "translateX(-50%)" };
    // Cada data numa pílula de vidro (o estilo dos controles): legível sobre qualquer cor, no claro e no escuro.
    const classe = `absolute flex items-center whitespace-nowrap rounded-chip px-1.5 text-[12px] leading-none font-semibold tabular-nums shadow-ring backdrop-blur-sm ${
      ativa ? "bg-accent text-white" : "bg-surface/75 text-text"
    } ${extra}`;
    const caixa = { ...estilo, bottom: BASE_DATAS, height: ALTURA_PILULA };
    if (!interativa || !onEscolher)
      return (
        <span key={textoData(p)} aria-hidden className={classe} style={caixa}>
          {textoData(p)}
        </span>
      );
    const acao = sel?.tipo === "ponto" && sel.i === i ? "ver os dados completos" : sel?.tipo === "ponto" && onTrecho ? "comparar o trecho" : "marcar";
    return (
      <button
        key={textoData(p)}
        type="button"
        aria-pressed={ativa}
        aria-label={`${p.titulo}: ${acao}`}
        title={p.titulo}
        // A área de toque passa da pílula (o `after`), sem mudar o desenho.
        className={`${classe} pointer-events-auto cursor-pointer transition-colors duration-[var(--motion-duration)] after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${ativa ? "" : "hover:bg-surface"}`}
        style={caixa}
        onClick={() => clicar(i, { x, y: (figRef.current?.clientHeight ?? 0) - BASE_DATAS - ALTURA_PILULA })}
      >
        {textoData(p)}
      </button>
    );
  };
  const linha = ({ chave, f }: { chave: string; f: number }, extra: string) => (
    <span key={chave} className={`absolute inset-y-0 w-px -translate-x-1/2 ${extra}`} style={{ left: `${f * 100}%`, background: tk.axis, opacity: 0.3 }} />
  );
  /** As camadas de uma das partes: as que SAEM (só o que não continua) esmaecem e as atuais ficam — só as NOVAS surgem. As
   * que continuam (a mesma chave) nunca passam por duas camadas meio transparentes: não piscam. */
  const camadas = (camada: "linhas" | "datas") => {
    const datas = camada === "datas";
    // A IDENTIDADE que se vê: a pílula pelo TEXTO (a mesma data em outro agrupamento — "01/01" do dia e da semana — é a
    // mesma pílula, não duas cruzando); a linha pela chave do ponto.
    const id = (a: { chave: string; p?: PontoTemporal }) => (a.p ? textoData(a.p) : a.chave);
    const atual = datas ? planoDatas(pontos) : planoLinhas(pontos);
    const ficam = new Set(atual.map(id));
    const antes = vistoAntes?.[camada];
    mostrado.current[camada] = ficam;
    const entra = (a: { chave: string; p?: PontoTemporal }) => (antes && !antes.has(id(a)) ? "grafico-entra" : "");
    return (
      <>
        {saindo.map((x) => (
          <div key={`${camada}-${x.n}`} aria-hidden className="grafico-sai pointer-events-none absolute inset-0" onAnimationEnd={datas ? () => fimSaida(x.n) : undefined}>
            {datas
              ? planoDatas(x.extra).filter((a) => !ficam.has(id(a))).map((a) => pilula(a, false, ""))
              : planoLinhas(x.extra).filter((a) => !ficam.has(id(a))).map((a) => linha(a, ""))}
          </div>
        ))}
        <div aria-hidden={datas && onEscolher ? undefined : true} className="pointer-events-none absolute inset-0">
          {datas ? (atual as ItemData[]).map((a) => pilula(a, true, entra(a))) : atual.map((a) => linha(a, entra(a)))}
        </div>
      </>
    );
  };
  const marcado = sel?.tipo === "ponto" ? pontos[sel.i] : undefined;
  const faixa = sel?.tipo === "trecho" ? { a: sel.a, b: sel.b } : arrasto && arrasto.de !== arrasto.ate ? { a: Math.min(arrasto.de, arrasto.ate), b: Math.max(arrasto.de, arrasto.ate) } : null;
  // O valor de uma série num ponto, no quadro à vista (na transição, o da mesma data; senão o de destino).
  const linhaPorT = new Map(visto.linhas.map((l) => [l.t, l]));
  const valorNoVisto = (i: number, c: string) => Number((linhaPorT.get(alvo.linhas[i].t) ?? alvo.linhas[i])[c]) || 0;
  // As bordas do recorte do trecho (px, no SVG): a posição das duas pontas na janela à vista.
  const xDo = (i: number) => xDoT(alvo.linhas[i].t);


  return (
    <figure
      ref={figRef}
      aria-label={ariaLabel}
      className={`grafico-esticado relative m-0 [&_*:focus]:outline-none [&_svg]:outline-none ${arrasto ? "select-none" : ""}`}
      style={{ height: estreita ? Math.min(altura, preencher ? 320 : 240) : altura }}
    >
      {/* O recorte do TRECHO (o `clipPath` do SVG) nas cópias das áreas — a regra só existe com um trecho. */}
      {faixa && <style>{`.${id}-trecho{clip-path:url(#${id}-recorte);pointer-events:none}`}</style>}
      {/* As linhas de marcação ATRÁS do desenho (antes dele; o desenho é posicionado e pinta por cima). */}
      {preencher && camadas("linhas")}
      {/* O ARRASTO (mouse e caneta; no toque, os dois toques) pelo ponteiro nativo: o ponto sob ele vem da posição no desenho. */}
      {/* SEM `key` pela estrutura: remontar o `ResponsiveContainer` a cada troca de baldes (filtro, agrupamento) o fazia nascer
          sem largura — um quadro com o desenho vazio, a "piscada" na cor do fundo. A seleção já é desfeita pelo efeito acima. */}
      <div
        role="none"
        className={`relative h-full ${onEscolher ? "cursor-pointer" : ""}`}
        onPointerDown={(e) => {
          // Um gesto novo: o clique engolido era só o que vem logo depois de um arrasto (alguns navegadores não o disparam).
          engolirClique.current = false;
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
            data={visto.linhas}
            margin={margem}
            accessibilityLayer={false}
            onClick={(_st, e) => {
              if (engolirClique.current) {
                engolirClique.current = false;
                return;
              }
              // O ponto do clique pela posição do ponteiro (a mesma régua do arrasto e do recorte do trecho).
              const ev = e as unknown as { clientX?: number };
              const i = ev.clientX == null ? null : indiceNaPosicao(ev.clientX);
              if (i != null) clicar(i, noGrafico(e));
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
            <YAxis hide domain={dominioY} allowDataOverflow />
            {/* No `preencher`, as linhas de marcação são da camada das datas (deslizam e trocam junto com as pílulas). */}
            {!preencher && <CartesianGrid stroke={tk.axis} strokeOpacity={0.3} horizontal={false} syncWithTicks />}
            {/* O eixo do TEMPO: a janela do quadro (o zoom desliza); o que passa dela é recortado. */}
            <XAxis
              type="number"
              dataKey="t"
              domain={[visto.lo, visto.hi]}
              allowDataOverflow
              ticks={ticks}
              tickFormatter={(t: number) => rotuloDoT.get(t) ?? ""}
              tick={{ fontSize: 11, fill: tk.axis }}
              hide={preencher}
              axisLine={false}
              tickLine={false}
              interval={0}
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
                  <DicaQueSegue caixa={figRef} base={preencher ? TOPO_DAS_DATAS : 0}>
                    {caixa(p.titulo, valoresDe(p), extraDica?.(p) ?? [], instrucao && <div className="mt-1.5 text-[11px] text-faint">{instrucao}</div>)}
                  </DicaQueSegue>
                );
              }}
            />
            {visto.marca != null && <ReferenceLine x={visto.marca} stroke={tk.axis} strokeOpacity={0.85} strokeWidth={1.5} strokeDasharray="4 3" />}
            {marcado && sel?.tipo === "ponto" && <ReferenceLine x={alvo.linhas[sel.i].t} stroke={tk.axis} strokeOpacity={0.85} strokeWidth={1.5} strokeDasharray="4 4" />}
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
                activeDot={visiveis.includes(s) ? (d: { cx?: number; cy?: number }) => <PontoVivo cx={d.cx} cy={d.cy} cor={tk.serie[s.cor]} fundo={tk.fundo} /> : false}
                isAnimationActive={false}
              />
            ))}
            {/* O TRECHO: cada área ganha, só entre as duas pontas, o SEU tom de seleção (o degradê mais forte e a linha do topo
                na cor dela); fora dele o desenho esmaece. O recorte é um `clip-path` do próprio SVG (leve: nada recalculado). */}
            {faixa &&
              visiveis.map((s) => (
                <Area
                  key={`trecho-${s.chave}`}
                  className={`${id}-trecho`}
                  type="monotone"
                  dataKey={s.chave}
                  stroke={tomSelecao(tk.serie[s.cor], escuro, 0.24)}
                  strokeWidth={2.5}
                  fill={`url(#${id}t-${s.chave})`}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
            {/* Os pontos da seleção (o marcado ou as duas pontas do trecho), pulsando como "online". */}
            {(marcado ? [sel?.tipo === "ponto" ? sel.i : 0] : sel?.tipo === "trecho" ? [sel.a, sel.b] : []).flatMap((i) =>
              visiveis.map((s) => (
                <ReferenceDot
                  key={`sel-${i}-${s.chave}`}
                  x={alvo.linhas[i].t}
                  y={valorNoVisto(i, s.chave)}
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
        <DicaQueSegue caixa={figRef} base={preencher ? TOPO_DAS_DATAS : 0} fixo={{ x: sel.x, y: sel.y }} evitar={{ de: xDo(sel.i), ate: xDo(sel.i) }}>
          {caixa(marcado.titulo, valoresDe(marcado), extraDica?.(marcado) ?? [], onEscolher && acoes("Ver os dados completos", () => abrir(marcado), onTrecho ? "Clique em outro ponto para comparar o trecho" : undefined))}
        </DicaQueSegue>
      )}
      {sel?.tipo === "trecho" && (
        <DicaQueSegue caixa={figRef} base={preencher ? TOPO_DAS_DATAS : 0} fixo={{ x: sel.x, y: sel.y }} evitar={{ de: xDo(sel.a), ate: xDo(sel.b) }}>
          {caixa(`${pontos[sel.a].titulo} → ${pontos[sel.b].titulo}`, null, dicaTrecho?.(pontos[sel.a], pontos[sel.b]) ?? [], acoes("Ver os dados do trecho", () => abrirTrecho(sel.a, sel.b)))}
        </DicaQueSegue>
      )}
      {preencher && camadas("datas")}
    </figure>
  );
}
