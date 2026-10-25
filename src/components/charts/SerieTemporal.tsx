"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, Bar, Brush, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl, brlCompact } from "@/lib/format";
import { Button } from "../Button";
import { IconRestaurar, IconZoom, IconZoomOut } from "../icons";
import { semMovimento } from "../useContagem";
import { ChartEmpty, TooltipBox, useChartTokens } from "./shared";

/** Uma série do gráfico (o valor de cada ponto já em REAIS). */
export type SerieTemporalDef = { chave: string; rotulo: string; cor: number };
/** Um ponto (balde de tempo): a chave, o rótulo do eixo, o título da dica e os valores de cada série (em reais). */
export type PontoTemporal = { chave: string; rotulo: string; titulo: string; atual?: boolean; valores: Record<string, number> };

/** Acima disto, as colunas agrupadas viram linhas (colunas finas demais não se leem). */
const MAX_COLUNAS = 90;

/**
 * SÉRIE TEMPORAL — o gráfico de evolução do sistema (Recharts, cores pelos tokens `--serie-*`). `modo`:
 * - `colunas`: as séries em COLUNAS AGRUPADAS por balde (os valores do período); com muitos baldes, linhas;
 * - `areas`: ÁREAS com degradê suave e linha de 2px (o acumulado), a 1ª série atrás.
 * A LEGENDA liga e desliga cada série; a dica mostra TODAS as séries do balde (+ `extraDica`); o balde de hoje leva a
 * linha "Hoje". ZOOM: os botões (±, Restaurar) e, no desktop, o mini-mapa (`Brush`) para arrastar. Tocar num balde =
 * `onEscolher` (a origem). Sem animação com movimento reduzido.
 */
export function SerieTemporal({
  pontos,
  series,
  modo,
  onEscolher,
  extraDica,
  altura = 320,
  ariaLabel,
}: {
  pontos: PontoTemporal[];
  series: SerieTemporalDef[];
  modo: "colunas" | "areas";
  onEscolher?: (p: PontoTemporal) => void;
  /** Linhas a mais na dica de um ponto (ex.: "% do empenhado"). */
  extraDica?: (p: PontoTemporal, visiveis: ReadonlySet<string>) => { rotulo: string; valor: string }[];
  altura?: number;
  ariaLabel: string;
}) {
  const tk = useChartTokens();
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(new Set());
  const [faixa, setFaixa] = useState<[number, number] | null>(null);
  const [estreita, setEstreita] = useState(false);
  const [animar, setAnimar] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const ver = () => setEstreita(mq.matches);
    ver();
    setAnimar(!semMovimento());
    mq.addEventListener("change", ver);
    return () => mq.removeEventListener("change", ver);
  }, []);
  // Outros pontos (filtro, período, granularidade): o zoom volta ao todo.
  const assinatura = pontos.length ? `${pontos[0].chave}|${pontos.at(-1)?.chave}|${pontos.length}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: o zoom volta ao todo quando os baldes mudam.
  useEffect(() => setFaixa(null), [assinatura]);

  const total = pontos.length;
  const [ini, fim] = faixa ?? [0, Math.max(0, total - 1)];
  const visiveis = useMemo(() => new Set(series.map((s) => s.chave).filter((c) => !ocultas.has(c))), [series, ocultas]);
  // No celular não há mini-mapa: os pontos do zoom vão direto ao gráfico.
  const dados = useMemo(() => {
    const base = estreita ? pontos.slice(ini, fim + 1) : pontos;
    return base.map((p) => ({ ...p, ...Object.fromEntries(series.map((s) => [s.chave, p.valores[s.chave] ?? 0])) }));
  }, [pontos, series, estreita, ini, fim]);
  const nVisto = fim - ini + 1;
  const marcas = estreita ? 6 : 8;
  const intervalo = Math.max(0, Math.ceil(nVisto / marcas) - 1);
  const atual = pontos.find((p) => p.atual);
  const porChave = useMemo(() => new Map(pontos.map((p) => [p.chave, p])), [pontos]);
  const linhas = modo === "colunas" && nVisto > MAX_COLUNAS;

  if (!total) return <ChartEmpty label="Nada no período escolhido" />;

  const zoom = (fator: number) => {
    const meio = (ini + fim) / 2;
    const larg = Math.max(4, Math.round((fim - ini + 1) * fator));
    if (larg >= total) return setFaixa(null);
    const a = Math.max(0, Math.min(total - larg, Math.round(meio - larg / 2)));
    setFaixa([a, a + larg - 1]);
  };
  const alternar = (c: string) =>
    setOcultas((o) => {
      const n = new Set(o);
      if (n.has(c)) n.delete(c);
      else if (visiveis.size > 1) n.add(c); // sempre fica ao menos uma série
      return n;
    });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <fieldset aria-label="Séries do gráfico" className="m-0 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0">
          {series.map((s) => {
            const on = visiveis.has(s.chave);
            return (
              <button
                key={s.chave}
                type="button"
                aria-pressed={on}
                onClick={() => alternar(s.chave)}
                title={on ? `Esconder ${s.rotulo}` : `Mostrar ${s.rotulo}`}
                className={`inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-xs font-semibold transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 pointer-coarse:h-11 ${on ? "text-text" : "text-faint line-through"}`}
              >
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: on ? tk.serie[s.cor] : "var(--border-2)" }} />
                {s.rotulo}
              </button>
            );
          })}
        </fieldset>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="icon" aria-label="Aproximar" title="Aproximar (menos baldes)" disabled={nVisto <= 4} onClick={() => zoom(0.5)}>
            <IconZoom className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="icon" aria-label="Afastar" title="Afastar (mais baldes)" disabled={!faixa} onClick={() => zoom(2)}>
            <IconZoomOut className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="icon" aria-label="Restaurar o zoom" title="Restaurar o zoom (o período inteiro)" disabled={!faixa} onClick={() => setFaixa(null)}>
            <IconRestaurar className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <figure aria-label={ariaLabel} className="m-0" style={{ height: estreita ? Math.min(altura, 240) : altura }}>
        <ResponsiveContainer>
          <ComposedChart
            data={dados}
            margin={{ top: 18, right: 22, left: 0, bottom: 0 }}
            barGap={1}
            barCategoryGap={nVisto > 40 ? "10%" : "22%"}
            onClick={(e) => {
              // Pela CHAVE do balde (o eixo X) — vale com o mini-mapa recortando os dados mostrados.
              const p = onEscolher ? porChave.get(String(e?.activeLabel ?? "")) : undefined;
              if (p) onEscolher?.(p);
            }}
            className={onEscolher ? "cursor-pointer" : undefined}
          >
            <defs>
              {series.map((s) => (
                <linearGradient key={s.chave} id={`grad-${s.chave}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tk.serie[s.cor]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={tk.serie[s.cor]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={tk.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="chave"
              tickFormatter={(c: string) => porChave.get(c)?.rotulo ?? c}
              tick={{ fontSize: 11, fill: tk.axis }}
              axisLine={false}
              tickLine={false}
              interval={intervalo}
              minTickGap={8}
            />
            <YAxis tickFormatter={(v: number) => (v === 0 ? "0" : brlCompact(v).replace("R$ ", ""))} tick={{ fontSize: 11, fill: tk.axis }} axisLine={false} tickLine={false} width={58} />
            <Tooltip
              cursor={modo === "colunas" && !linhas ? { fill: tk.cursor } : { stroke: tk.axis, strokeDasharray: "4 4" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as PontoTemporal;
                return (
                  <TooltipBox>
                    <div className="mb-1 font-semibold text-text">{p.titulo}</div>
                    {series
                      .filter((s) => visiveis.has(s.chave))
                      .map((s) => (
                        <div key={s.chave} className="flex items-center justify-between gap-4">
                          <span className="inline-flex items-center gap-1.5 text-muted">
                            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: tk.serie[s.cor] }} />
                            {s.rotulo}
                          </span>
                          <span className="font-semibold tabular-nums text-text">{brl(p.valores[s.chave] ?? 0)}</span>
                        </div>
                      ))}
                    {extraDica?.(p, visiveis).map((x) => (
                      <div key={x.rotulo} className="mt-0.5 flex items-center justify-between gap-4 border-t border-border/70 pt-0.5">
                        <span className="text-muted">{x.rotulo}</span>
                        <span className="font-semibold tabular-nums text-text">{x.valor}</span>
                      </div>
                    ))}
                    {onEscolher && <div className="mt-1 text-[11px] text-faint">Toque para ver a origem</div>}
                  </TooltipBox>
                );
              }}
            />
            {atual && <ReferenceLine x={atual.chave} stroke={tk.accent} strokeDasharray="4 3" label={{ value: "Hoje", position: "insideTopRight", fill: tk.accent, fontSize: 11 }} />}
            {series.map((s) =>
              !visiveis.has(s.chave) ? null : modo === "areas" ? (
                <Area
                  key={s.chave}
                  type="monotone"
                  dataKey={s.chave}
                  name={s.rotulo}
                  stroke={tk.serie[s.cor]}
                  strokeWidth={2}
                  fill={`url(#grad-${s.chave})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={animar}
                />
              ) : linhas ? (
                <Line key={s.chave} type="monotone" dataKey={s.chave} name={s.rotulo} stroke={tk.serie[s.cor]} strokeWidth={1.75} dot={false} activeDot={{ r: 3.5 }} isAnimationActive={animar} />
              ) : (
                <Bar key={s.chave} dataKey={s.chave} name={s.rotulo} fill={tk.serie[s.cor]} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={animar} />
              ),
            )}
            {!estreita && total > 12 && (
              <Brush
                dataKey="rotulo"
                height={26}
                travellerWidth={8}
                stroke={tk.axis}
                fill={tk.fundo}
                startIndex={ini}
                endIndex={fim}
                onChange={(r) => {
                  const a = Number(r?.startIndex);
                  const b = Number(r?.endIndex);
                  if (!Number.isInteger(a) || !Number.isInteger(b)) return;
                  setFaixa(a === 0 && b === total - 1 ? null : [a, b]);
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </figure>
    </div>
  );
}
