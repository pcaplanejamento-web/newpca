import type { CSSProperties, ReactNode } from "react";
import { IconArrowDown, IconArrowUp } from "./icons";

// KPI card (spec §6.4): barra de acento à esquerda, número em Geist com
// tabular-nums, delta com seta (SEM pílula), mini-gráfico de 7 barras (as 2
// últimas na cor do KPI), sublegenda. Tudo por token; elevação por --ring. O
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
  /** Uma AÇÃO pequena no canto superior direito, ao lado do `canto` (ex.: o "Importar agora" do ADM na Execução). */
  acaoCanto?: ReactNode;
}) {
  // Com o CANTO (que pode ter botões) num cartão que é botão: o toque do cartão vira uma CAMADA por baixo (botão dentro de
  // botão é inválido) e o canto fica por cima, alinhado ao rótulo e preso no canto superior direito.
  const temCanto = !!(canto || acaoCanto);
  const camada = !!onClick && temCanto;
  const Raiz = onClick && !camada ? "button" : "div";
  const nome = `${label}: ${typeof value === "string" ? value : ""}${acao ? ` — ${acao}` : ""}`;
  const foco = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
  return (
    <Raiz
      {...(onClick && !camada ? { type: "button" as const, onClick, "aria-label": nome } : {})}
      className={`kpi-card relative flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface p-[var(--pad-card)] text-left shadow-ring [container-type:inline-size] ${
        onClick ? `transition-colors hover:bg-surface-2 ${camada ? "" : foco}` : ""
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
      {camada && <button type="button" onClick={onClick} aria-label={nome} className={`absolute inset-0 rounded-card ${foco} focus-visible:ring-inset`} />}
      <span
        aria-hidden
        className="absolute bottom-4 left-0 top-4 w-[3px] rounded-r-[3px]"
        style={{ background: cor }}
      />
      <div className={`flex justify-between gap-2 ${temCanto ? "items-center" : "items-start"} ${camada ? "pointer-events-none relative" : ""}`}>
        <span className="truncate text-[12.5px] text-muted">{label}</span>
        {temCanto && (
          // A altura do canto não cresce a linha (a ação de toque tem mais altura que o rótulo): centrado nele.
          <span className="pointer-events-auto relative -my-2 -mr-1 flex shrink-0 items-center gap-1 lg:-my-1.5">
            {canto}
            {acaoCanto}
          </span>
        )}
        {delta && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold"
            style={{ color: delta.dir === "up" ? "var(--delta-up)" : "var(--delta-down)" }}
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
      {spark && spark.length > 0 && (
        <div className="mt-3 flex h-7 items-end gap-[3px]">
          {spark.map((h, i) => (
            <span
              key={i}
              className="w-[5px] shrink-0 rounded-[1px]"
              style={{
                height: `${Math.max(6, Math.min(100, h))}%`,
                background: i >= spark.length - 2 ? cor : "var(--kpi-bar)",
              }}
            />
          ))}
        </div>
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
}
