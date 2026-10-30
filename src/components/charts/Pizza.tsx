"use client";

import { useId, useState } from "react";
import { pct } from "@/lib/format";
import { angulosPizza } from "@/lib/pizza-core";
import { ChartEmpty, corClara } from "./shared";

/** Uma fatia da pizza: a cor é a da CATEGORIA (token) — nunca a da posição. */
export type FatiaPizza = { chave: string; rotulo: string; valor: number; cor: string; detalhe?: string };

const C = 100;
const R_MAX = 88;
const R_MIN = 56;
const VAO = 0.035;
/**
 * PIZZA moderna — o todo dividido em POUCAS partes (até ~5). Cada fatia tem o RAIO proporcional ao valor (a maior sai
 * mais), degradê radial da própria cor, o % dentro das fatias com mais de 8% e a legenda ao lado (abaixo, em cartão
 * estreito). Passar o mouse/focar destaca a fatia (ela sai alguns pixels); tocar chama `onEscolher` (o FILTRO cruzado).
 * `ativa` = a fatia filtrada (as outras esmaecem).
 */
export function Pizza({
  fatias,
  ariaLabel,
  formatar,
  ativa,
  onEscolher,
  acao = "filtrar o Dashboard",
}: {
  fatias: FatiaPizza[];
  ariaLabel: string;
  formatar: (v: number) => string;
  ativa?: string | null;
  onEscolher?: (chave: string) => void;
  acao?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [foco, setFoco] = useState<string | null>(null);
  const visiveis = fatias.filter((f) => f.valor > 0);
  const total = visiveis.reduce((t, f) => t + f.valor, 0);
  if (!total) return <ChartEmpty />;
  const maior = Math.max(...visiveis.map((f) => f.valor));
  const angulos = angulosPizza(visiveis.map((f) => f.valor));
  let a = -Math.PI / 2;
  const P = (ang: number, r: number) => `${(C + r * Math.cos(ang)).toFixed(2)},${(C + r * Math.sin(ang)).toFixed(2)}`;
  return (
    <div className="@container">
    <div className="grid items-center gap-4 @[30rem]:grid-cols-[minmax(12rem,15rem)_1fr]">
      <svg viewBox="0 0 200 200" role="img" aria-label={ariaLabel} className="mx-auto aspect-square w-full max-w-[15rem] overflow-visible">
        <defs>
          {visiveis.map((f, i) => (
            <radialGradient key={f.chave} id={`${id}-${i}`} cx="30%" cy="25%" r="90%">
              <stop offset="0" style={{ stopColor: corClara(f.cor) }} />
              <stop offset="1" style={{ stopColor: f.cor }} />
            </radialGradient>
          ))}
        </defs>
        {visiveis.map((f, i) => {
          const ang = angulos[i];
          const vao = Math.min(VAO, ang * 0.2);
          const a0 = a + vao / 2;
          const a1 = a + ang - vao / 2;
          const meio = (a0 + a1) / 2;
          a += ang;
          const r = R_MIN + Math.sqrt(f.valor / maior) * (R_MAX - R_MIN);
          const sai = foco === f.chave || ativa === f.chave;
          const apagada = ativa != null && ativa !== f.chave;
          const d =
            visiveis.length === 1
              ? `M${C},${C - r} A${r} ${r} 0 1 1 ${C - 0.01},${C - r} Z`
              : `M${C},${C} L${P(a0, r)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${P(a1, r)} Z`;
          return (
            <g
              key={f.chave}
              className="transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none"
              style={{ transform: sai ? `translate(${Math.cos(meio) * 6}px, ${Math.sin(meio) * 6}px)` : undefined, opacity: apagada ? 0.3 : 1 }}
            >
              <path d={d} fill={`url(#${id}-${i})`} />
              {f.valor / total > 0.08 && (
                <text
                  x={C + r * 0.62 * Math.cos(meio)}
                  y={C + r * 0.62 * Math.sin(meio) + 4}
                  textAnchor="middle"
                  className="pointer-events-none fill-white text-[11px] font-bold tabular-nums [paint-order:stroke] [stroke:rgba(15,23,42,.28)] [stroke-width:2px]"
                >
                  {pct(f.valor, total)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="space-y-0.5">
        {visiveis.map((f) => {
          const marcada = ativa === f.chave;
          const conteudo = (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: f.cor }} />
              <span className="flex-1 truncate text-left text-text-2">{f.rotulo}</span>
              <span className="shrink-0 font-semibold text-text tabular-nums">{formatar(f.valor)}</span>
              <span className="w-12 shrink-0 text-right text-muted tabular-nums">{pct(f.valor, total)}</span>
            </>
          );
          return (
            <li key={f.chave} className={`text-xs ${ativa != null && !marcada ? "opacity-45" : ""}`}>
              {onEscolher ? (
                <button
                  type="button"
                  onClick={() => onEscolher(f.chave)}
                  onMouseEnter={() => setFoco(f.chave)}
                  onMouseLeave={() => setFoco(null)}
                  onFocus={() => setFoco(f.chave)}
                  onBlur={() => setFoco(null)}
                  aria-pressed={marcada}
                  aria-label={`${f.rotulo}: ${formatar(f.valor)}${f.detalhe ? ` · ${f.detalhe}` : ""} — ${marcada ? "tirar o filtro" : acao}`}
                  title={f.detalhe ? `${f.rotulo}: ${f.detalhe}` : undefined}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-control px-1.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent sm:min-h-8 ${marcada ? "bg-accent-soft" : ""}`}
                >
                  {conteudo}
                </button>
              ) : (
                <div className="flex min-h-8 items-center gap-2 px-1.5">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
    </div>
  );
}
