"use client";

import { type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "@/lib/format";
import { IconClose } from "../icons";
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

/** Espaço livre no alto do desenho que PREENCHE o cartão (os controles em vidro ficam sobre ele, sem cobrir os dados). */
const TOPO_LIVRE = 60;
/** No celular os controles (menores) ocupam duas linhas. */
const TOPO_LIVRE_ESTREITA = 80;

/**
 * SÉRIE TEMPORAL — as ONDAS de evolução do sistema (Recharts, cores pelos tokens `--serie-*`): áreas em camadas com
 * degradê forte (a 1ª série atrás), sem legenda, eixo Y nem linhas horizontais — as grades verticais leves e os rótulos do
 * tempo; os nomes e valores de TODAS as séries ficam na dica (+ `extraDica`), as cores são as dos indicadores da tela. O
 * balde de hoje leva a linha tracejada. Sem clique, a dica SEGUE o mouse e nunca fica sob ele; o 1º clique MARCA o ponto
 * (a dica para ali, tocável, com "Ver os dados completos"); o 2º clique no MESMO ponto = `onEscolher` (a origem). Esc,
 * clicar fora ou outros baldes desfazem a marcação; pelo teclado, a origem de cada balde fica na vista em tabela.
 *
 * As PONTAS do desenho ficam sempre no lugar: o Recharts não anima o caminho (a interpolação entre larguras ou números de
 * pontos diferentes — abrir o menu, trocar o agrupamento — descolava as pontas); outro recorte (outros baldes) entra com um
 * esmaecer curto (`.linhas-entra`, parado com "reduzir movimento"). `preencher` = o desenho ocupa a caixa inteira (sem
 * margens, as datas por DENTRO, sobre o desenho, e um espaço livre no alto para os controles em vidro).
 */
export function SerieTemporal({
  pontos,
  series,
  onEscolher,
  extraDica,
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
    if (!el || !preencher) return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [preencher]);
  // O id do degradê só com letras e números (o do React traz símbolos que o `url(#…)` do SVG não aceita).
  const id = `serie${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [estreita, setEstreita] = useState(false);
  // O retorno do clique: um anel que se expande SÓ em volta do ponto marcado (nunca um contorno no gráfico inteiro).
  const [pulso, setPulso] = useState(0);
  // A MARCAÇÃO: o 1º clique fixa a dica no ponto (o mouse pode passar por ela); o 2º no MESMO ponto abre os dados completos.
  const [marca, setMarca] = useState<{ chave: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const ver = () => setEstreita(mq.matches);
    ver();
    mq.addEventListener("change", ver);
    return () => mq.removeEventListener("change", ver);
  }, []);

  // Esc ou um clique fora do gráfico desfaz a marcação.
  useEffect(() => {
    if (!marca) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setMarca(null);
    const fora = (e: PointerEvent) => !figRef.current?.contains(e.target as Node) && setMarca(null);
    window.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fora);
    return () => {
      window.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fora);
    };
  }, [marca]);

  const dados = useMemo(() => pontos.map((p) => ({ chave: p.chave, ...Object.fromEntries(series.map((s) => [s.chave, p.valores[s.chave] ?? 0])) })), [pontos, series]);
  const porChave = useMemo(() => new Map(pontos.map((p) => [p.chave, p])), [pontos]);
  const total = pontos.length;
  // Os mesmos baldes (só os valores mudaram) = sem esmaecer; outros baldes (período, agrupamento, zoom) = entra de novo.
  const assinatura = total ? `${total}:${pontos[0].chave}:${pontos[total - 1].chave}:${series.map((x) => x.chave).join(",")}` : "";
  // Outros baldes = a marcação não vale mais (o ponto pode nem existir).
  // biome-ignore lint/correctness/useExhaustiveDependencies: desfaz a marcação quando os baldes mudam.
  useEffect(() => setMarca(null), [assinatura]);
  const marcado = marca ? porChave.get(marca.chave) : undefined;
  const abrir = (p: PontoTemporal) => {
    setMarca(null);
    onEscolher?.(p);
  };
  /** O conteúdo da dica de um ponto — o mesmo na dica que segue o mouse e na marcação (que ganha as ações). */
  const conteudo = (p: PontoTemporal, marcada: boolean) => (
                <TooltipBox vidro>
                  <div className="mb-1 font-semibold text-text">{p.titulo}</div>
                  {series.map((s) => (
                    <div key={s.chave} className="flex items-center justify-between gap-4">
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: tk.serie[s.cor] }} />
                        {s.rotulo}
                      </span>
                      <span className="font-semibold tabular-nums text-text">{brl(p.valores[s.chave] ?? 0)}</span>
                    </div>
                  ))}
                  {(extraDica?.(p) ?? []).map((x, i, l) => (
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
                  {onEscolher &&
                    (marcada ? (
                      <div className="mt-2 flex items-center gap-1.5 border-t border-border/70 pt-2">
                        <button
                          type="button"
                          onClick={() => abrir(p)}
                          className="min-h-9 flex-1 rounded-control bg-accent px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 pointer-coarse:min-h-11"
                        >
                          Ver os dados completos
                        </button>
                        <button
                          type="button"
                          onClick={() => setMarca(null)}
                          aria-label="Desmarcar o ponto"
                          title="Desmarcar (Esc)"
                          className="grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 pointer-coarse:size-11"
                        >
                          <IconClose className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[11px] text-faint">Clique para marcar · de novo para os dados completos</div>
                    ))}
                </TooltipBox>
  );

  if (!total) return <ChartEmpty label="Nada no período escolhido" />;
  const intervalo = Math.max(0, Math.ceil(total / (estreita ? 6 : 8)) - 1);
  const atual = pontos.find((p) => p.atual);

  return (
    <figure ref={figRef} aria-label={ariaLabel} className="relative m-0 [&_*:focus]:outline-none [&_svg]:outline-none" style={{ height: estreita ? Math.min(altura, preencher ? 320 : 240) : altura }}>
      <div key={assinatura} className={`linhas-entra h-full ${onEscolher ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer>
        <AreaChart
          data={dados}
          margin={preencher ? { top: estreita ? TOPO_LIVRE_ESTREITA : TOPO_LIVRE, right: 0, left: 0, bottom: 0 } : { top: 12, right: 16, left: 16, bottom: 0 }}
          accessibilityLayer={false}
          onClick={(st, e) => {
            if (!onEscolher || st?.activeIndex == null) return;
            const p = pontos[Number(st.activeIndex)];
            const r = figRef.current?.getBoundingClientRect();
            if (!p || !r) return;
            if (marca?.chave === p.chave) return abrir(p);
            const ev = e as unknown as { clientX: number; clientY: number };
            setMarca({ chave: p.chave, x: ev.clientX - r.left, y: ev.clientY - r.top });
            setPulso((n) => n + 1);
          }}
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.chave} id={`${id}-${s.chave}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tk.serie[s.cor]} stopOpacity={0.92} />
                <stop offset="100%" stopColor={tk.serie[s.cor]} stopOpacity={0.45} />
              </linearGradient>
            ))}
          </defs>
          <YAxis
            hide
            // O topo da escala = o MAIOR valor à vista (o desenho chega ao alto; o espaço dos controles é a margem de cima).
            domain={[ajustarY ? (min: number) => Math.max(0, min - (dataMax(dados, series) - min) * 0.12) : 0, preencher ? "dataMax" : "auto"]}
          />
          <CartesianGrid stroke={tk.grid} strokeOpacity={0.6} horizontal={false} />
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
            cursor={{ stroke: tk.axis, strokeDasharray: "4 4" }}
            isAnimationActive={false}
            // A posição é da própria dica (`DicaQueSegue`): o invólucro do Recharts fica parado no canto do desenho.
            position={{ x: 0, y: 0 }}
            // Com um ponto marcado, só a marcação fica à vista.
            active={marca ? false : undefined}
            wrapperStyle={{ inset: 0, width: "100%", height: "100%", transform: "none", pointerEvents: "none" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = porChave.get(String((payload[0].payload as { chave: string }).chave));
              if (!p) return null;
              return (
                <DicaQueSegue caixa={figRef}>
                {conteudo(p, false)}
                </DicaQueSegue>
              );
            }}
          />
          {atual && <ReferenceLine x={atual.chave} stroke={tk.axis} strokeDasharray="4 3" />}
          {marcado && <ReferenceLine x={marcado.chave} stroke={tk.axis} strokeDasharray="4 4" />}
          {series.map((s) => (
            <Area
              key={s.chave}
              type="monotone"
              dataKey={s.chave}
              name={s.rotulo}
              stroke="none"
              fill={`url(#${id}-${s.chave})`}
              dot={false}
              activeDot={(d: { cx?: number; cy?: number }) => <PontoVivo cx={d.cx} cy={d.cy} cor={tk.serie[s.cor]} fundo={tk.fundo} />}
              isAnimationActive={false}
            />
          ))}
          {marcado &&
            series.map((s) => (
              <ReferenceDot
                key={`marca-${s.chave}`}
                x={marcado.chave}
                y={marcado.valores[s.chave] ?? 0}
                shape={(d: { cx?: number; cy?: number }) =>
                  d.cx == null || d.cy == null ? <g /> : (
                    <g>
                      <circle key={pulso} cx={d.cx} cy={d.cy} r={5} fill="none" stroke={tk.serie[s.cor]} strokeWidth={2} className="pulso-ponto" />
                      <PontoVivo cx={d.cx} cy={d.cy} cor={tk.serie[s.cor]} fundo={tk.fundo} />
                    </g>
                  )
                }
              />
            ))}
        </AreaChart>
      </ResponsiveContainer>
      </div>
      {marcado && marca && (
        <DicaQueSegue caixa={figRef} fixo={{ x: marca.x, y: marca.y }}>
          {conteudo(marcado, true)}
        </DicaQueSegue>
      )}
      {preencher && (
        // As DATAS por dentro do desenho (o desenho vai até a base do cartão): na posição de cada ponto, as das pontas
        // alinhadas à borda; o halo da superfície garante a leitura sobre as ondas.
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-1.5 h-4 text-[11px] font-semibold text-muted [text-shadow:0_0_3px_var(--surface),0_0_6px_var(--surface)]">
          {pontos.map((p, i) => {
            if (i % (intervalo + 1) !== 0) return null;
            const x = (i / Math.max(1, total - 1)) * largura;
            // Fora da faixa dos controles (as datas que cairiam sob eles não aparecem) e as das pontas alinhadas à borda.
            if (i > 0 && (x < 72 || x > largura - reservaRotulos - 24)) return null;
            return (
              <span
                key={p.chave}
                className="absolute whitespace-nowrap tabular-nums"
                style={i === 0 ? { left: 10 } : !reservaRotulos && x > largura - 30 ? { right: 10 } : { left: x, transform: "translateX(-50%)" }}
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
