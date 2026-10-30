import { type CSSProperties, type ReactNode, useId } from "react";
import { IconArrowDown, IconArrowUp } from "./icons";

// KPI card (spec §6.4): barra de acento à esquerda, número em Geist com
// tabular-nums, delta com seta numa pílula na cor de subida/descida, a LINHA da
// série (curva suave com a área em degradê da cor do KPI), sublegenda. Tudo por token; elevação por --ring. O
// número é proporcional à LARGURA do próprio cartão (container query, teto de
// 2.05rem): cabe no cartão de meia largura do celular e na grade de 5 com o menu.
export function KpiStat({
  label,
  value,
  cor = "var(--accent)",
  delta,
  spark,
  hint,
  onClick,
  acao,
  realce = false,
  completo = false,
  detalhes,
  emLinha = false,
  canto,
  acaoCanto,
}: {
  label: string;
  value: ReactNode;
  cor?: string;
  delta?: { dir: "up" | "down"; value: string };
  spark?: number[];
  hint?: string;
  /** O cartão vira BOTÃO (ex.: "Maior item" abre o item); `acao` = o que o toque faz (nome acessível). */
  onClick?: () => void;
  acao?: string;
  /** Fundo levemente tingido na cor do KPI e o brilho no canto (o Dashboard do PCA). */
  realce?: boolean;
  /** Valor COMPLETO (sem abreviar): a fonte encolhe com a largura do cartão para caber inteiro numa linha; a dica quebra
   * em vez de cortar. */
  completo?: boolean;
  /** Linhas "rótulo — valor" abaixo do número (o detalhe do KPI); o valor desce de linha quando não cabe, nunca é cortado. */
  detalhes?: { rotulo: string; valor: ReactNode; cor?: string }[];
  /** Detalhes COMPACTOS: em duas colunas (quando o cartão tem largura), sem a divisória — o cartão fica baixo. */
  emLinha?: boolean;
  /** Uma informação DISCRETA no canto superior direito (ex.: há quanto tempo os dados foram atualizados). */
  canto?: ReactNode;
  /** Uma AÇÃO pequena no canto superior direito (ex.: o "Importar agora" do ADM na Execução) — fica FORA do cartão-botão
   * (botão dentro de botão é inválido), por cima dele; o `canto` abre espaço ao lado. */
  acaoCanto?: ReactNode;
}) {
  const idSpark = useId().replace(/:/g, "");
  const Raiz = onClick ? "button" : "div";
  const cartao = (
    <Raiz
      {...(onClick ? { type: "button" as const, onClick, "aria-label": `${label}: ${typeof value === "string" ? value : ""}${acao ? ` — ${acao}` : ""}` } : {})}
      className={`kpi-card relative flex min-w-0 flex-col ${acaoCanto ? "flex-1" : ""} overflow-hidden rounded-card border border-border bg-surface p-[var(--pad-card)] text-left shadow-ring [container-type:inline-size] ${
        onClick ? "transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40" : ""
      }`}
      style={
        {
          "--kpi-accent": cor,
          ...(realce
            ? {
                background: `radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, ${cor} 16%, transparent) 0%, transparent 55%), color-mix(in srgb, ${cor} 4%, var(--surface))`,
              }
            : {}),
        } as CSSProperties
      }
    >
      <span
        aria-hidden
        className="absolute bottom-4 left-0 top-4 w-[3px] rounded-r-[3px]"
        style={{ background: cor }}
      />
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-[12.5px] text-muted">{label}</span>
        {canto && <span className={`shrink-0 ${acaoCanto ? "mr-8 lg:mr-7" : ""}`}>{canto}</span>}
        {delta && (
          <span
            className="inline-flex h-[22px] shrink-0 items-center gap-0.5 rounded-full px-2 text-[11.5px] font-semibold tabular-nums"
            style={{
              color: delta.dir === "up" ? "var(--delta-up)" : "var(--delta-down)",
              background: `color-mix(in oklab, ${delta.dir === "up" ? "var(--delta-up)" : "var(--delta-down)"} 14%, var(--surface))`,
            }}
          >
            {delta.dir === "up" ? (
              <IconArrowUp className="h-3.5 w-3.5" />
            ) : (
              <IconArrowDown className="h-3.5 w-3.5" />
            )}
            {delta.value}
          </span>
        )}
      </div>
      <div
        className={`mt-1 min-w-0 font-bold ${completo ? "whitespace-nowrap text-[clamp(0.95rem,7.6cqw,1.9rem)]" : "truncate text-[clamp(1.1rem,17cqw,2.05rem)]"} leading-[1.05] tracking-[-0.03em] text-text tabular-nums`}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {spark && spark.length > 1 && (
        <svg aria-hidden viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-3 h-7 w-full overflow-visible">
          <defs>
            <linearGradient id={`${idSpark}-a`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: cor, stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: cor, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={`${curvaSpark(spark)} L100,28 L0,28 Z`} fill={`url(#${idSpark}-a)`} />
          <path d={curvaSpark(spark)} fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {/* A dica NUNCA estica o cartão (uma descrição de item tem milhares de caracteres): no máximo 2 linhas; o texto
          inteiro fica na dica do mouse. */}
      {hint && (
        <div className={`mt-1.5 text-[12px] text-faint ${completo ? "line-clamp-2 break-words" : "truncate"}`} title={hint}>
          {hint}
        </div>
      )}
      {detalhes && detalhes.length > 0 && emLinha && (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-[12px] [@container(min-width:26rem)]:grid-cols-2">
          {detalhes.map((d) => (
            <div key={d.rotulo} className="flex flex-wrap items-baseline justify-between gap-x-2">
              <dt className="text-muted">{d.rotulo}</dt>
              <dd
                className="line-clamp-2 min-w-0 break-words font-medium tabular-nums text-text-2"
                style={d.cor ? { color: d.cor } : undefined}
                title={typeof d.valor === "string" ? d.valor : undefined}
              >
                {d.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {detalhes && detalhes.length > 0 && !emLinha && (
        <dl className="mt-3 space-y-1 border-t border-border/70 pt-2.5 text-[12px]">
          {detalhes.map((d) => (
            <div key={d.rotulo} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <dt className="text-muted">{d.rotulo}</dt>
              <dd
                className="line-clamp-2 min-w-0 break-words font-medium tabular-nums text-text-2"
                style={d.cor ? { color: d.cor } : undefined}
                title={typeof d.valor === "string" ? d.valor : undefined}
              >
                {d.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Raiz>
  );
  if (!acaoCanto) return cartao;
  return (
    <div className="relative flex min-w-0 flex-col">
      {cartao}
      <div className="absolute right-[calc(var(--pad-card)-6px)] top-[calc(var(--pad-card)-6px)] flex">{acaoCanto}</div>
    </div>
  );
}

/** A curva SUAVE da linha do KPI (valores 0–100 = a altura em %) numa caixa 100 × 28. */
function curvaSpark(v: number[]): string {
  const p = v.map((h, i) => [(i / (v.length - 1)) * 100, 27 - (Math.max(0, Math.min(100, h)) / 100) * 25] as const);
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 1; i < p.length; i++) {
    const m = (p[i - 1][0] + p[i][0]) / 2;
    d += ` C${m},${p[i - 1][1]} ${m},${p[i][1]} ${p[i][0]},${p[i][1]}`;
  }
  return d;
}
