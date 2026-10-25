"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { type ActiveDotProps, Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "@/lib/format";
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

/** A transição entre recortes (filtro, período, granularidade): curta e suave, sem redesenhar do zero. */
const ANIMACAO_MS = 450;

/**
 * SÉRIE TEMPORAL — as ONDAS de evolução do sistema (Recharts, cores pelos tokens `--serie-*`): áreas em camadas com
 * degradê forte (a 1ª série atrás), sem legenda, eixo Y nem linhas horizontais — as grades verticais leves e os rótulos do
 * tempo; os nomes e valores de TODAS as séries ficam na dica (+ `extraDica`), as cores são as dos indicadores da tela. O
 * balde de hoje leva a linha tracejada. Tocar no PONTO destacado (não no gráfico inteiro) = `onEscolher` (a origem) — a
 * área de toque do ponto é maior que o desenho; pelo teclado, a origem de cada balde fica na vista em tabela. Sem animação
 * com movimento reduzido.
 */
export function SerieTemporal({
  pontos,
  series,
  onEscolher,
  extraDica,
  altura = 320,
  ariaLabel,
  ajustarY = false,
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
}) {
  const tk = useChartTokens();
  // O id do degradê só com letras e números (o do React traz símbolos que o `url(#…)` do SVG não aceita).
  const id = `serie${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [estreita, setEstreita] = useState(false);
  const [animar, setAnimar] = useState(false);
  // O retorno do clique: um anel que se expande SÓ em volta do ponto tocado (nunca um contorno no gráfico inteiro).
  const [pulso, setPulso] = useState<{ chave: string; n: number } | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const ver = () => setEstreita(mq.matches);
    ver();
    setAnimar(!semMovimento());
    mq.addEventListener("change", ver);
    return () => mq.removeEventListener("change", ver);
  }, []);

  const dados = useMemo(() => pontos.map((p) => ({ chave: p.chave, ...Object.fromEntries(series.map((s) => [s.chave, p.valores[s.chave] ?? 0])) })), [pontos, series]);
  const porChave = useMemo(() => new Map(pontos.map((p) => [p.chave, p])), [pontos]);
  const total = pontos.length;
  if (!total) return <ChartEmpty label="Nada no período escolhido" />;
  const intervalo = Math.max(0, Math.ceil(total / (estreita ? 6 : 8)) - 1);
  const atual = pontos.find((p) => p.atual);

  return (
    <figure aria-label={ariaLabel} className="m-0 [&_*:focus]:outline-none [&_svg]:outline-none" style={{ height: estreita ? Math.min(altura, 240) : altura }}>
      <ResponsiveContainer>
        <AreaChart
          data={dados}
          margin={{ top: 12, right: 16, left: 16, bottom: 0 }}
          accessibilityLayer={false}
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
            domain={ajustarY ? [(min: number) => Math.max(0, min - (dataMax(dados, series) - min) * 0.12), "auto"] : [0, "auto"]}
          />
          <CartesianGrid stroke={tk.grid} strokeOpacity={0.6} horizontal={false} />
          <XAxis
            dataKey="chave"
            tickFormatter={(c: string) => porChave.get(c)?.rotulo ?? c}
            tick={{ fontSize: 11, fill: tk.axis }}
            axisLine={false}
            tickLine={false}
            interval={intervalo}
            minTickGap={8}
          />
          <Tooltip
            cursor={{ stroke: tk.axis, strokeDasharray: "4 4" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = porChave.get(String((payload[0].payload as { chave: string }).chave));
              if (!p) return null;
              return (
                <TooltipBox>
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
                  {onEscolher && <div className="mt-1.5 text-[11px] text-faint">Toque no ponto para ver a origem</div>}
                </TooltipBox>
              );
            }}
          />
          {atual && <ReferenceLine x={atual.chave} stroke={tk.axis} strokeDasharray="4 3" />}
          {series.map((s) => (
            <Area
              key={s.chave}
              type="monotone"
              dataKey={s.chave}
              name={s.rotulo}
              stroke="none"
              fill={`url(#${id}-${s.chave})`}
              dot={false}
              activeDot={(d: ActiveDotProps) => {
                if (d.cx == null || d.cy == null) return null;
                const p = onEscolher ? porChave.get(String((d.payload as { chave?: string })?.chave ?? "")) : undefined;
                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: o ponto é o alvo do ponteiro; pelo teclado, a origem de cada balde fica na vista em tabela.
                  <g
                    key={`${s.chave}-${d.index}`}
                    className={p ? "cursor-pointer" : undefined}
                    onClick={
                      p
                        ? () => {
                            setPulso((x) => ({ chave: p.chave, n: (x?.n ?? 0) + 1 }));
                            onEscolher?.(p);
                          }
                        : undefined
                    }
                  >
                    {p && pulso?.chave === p.chave && (
                      <circle
                        key={pulso.n}
                        cx={d.cx}
                        cy={d.cy}
                        r={5}
                        fill="none"
                        stroke={tk.serie[s.cor]}
                        strokeWidth={2}
                        className="pulso-ponto"
                        onAnimationEnd={() => setPulso(null)}
                      />
                    )}
                    {/* A área de toque do ponto (invisível, maior que o desenho). */}
                    {p && <circle cx={d.cx} cy={d.cy} r={14} fill="transparent" />}
                    <circle cx={d.cx} cy={d.cy} r={p ? 5 : 4} stroke={tk.fundo} strokeWidth={2} fill={tk.serie[s.cor]} />
                  </g>
                );
              }}
              isAnimationActive={animar}
              animationDuration={ANIMACAO_MS}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}
