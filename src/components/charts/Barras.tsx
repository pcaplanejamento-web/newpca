"use client";

import { type ReactNode, useState } from "react";
import { num } from "@/lib/format";

// Gráficos de BARRAS em HTML (por token — sem biblioteca de gráficos): marcas finas, ponta arredondada de 4px,
// 2px de respiro na cor da superfície entre segmentos, texto SEMPRE em tokens de texto (a cor fica na marca).
// Os números ficam visíveis (rótulos) e cada marca tem nome acessível — a leitura nunca depende só da cor
// nem do passar do mouse. Usados no Dashboard de governança da Mesa.

/** Um pedaço de uma barra (empilhada) — a cor carrega a identidade; o rótulo vai na dica. */
export type Segmento = { chave: string; valor: number; cor: string; rotulo: string };

/**
 * Barra EMPILHADA: os segmentos (proporcionais entre si) ocupam `soma/max` da largura, com 2px de respiro na
 * cor da superfície entre eles e a ponta arredondada. `trilho` desenha o fundo (medidor de 100%).
 */
export function BarraSegmentada({
  segmentos,
  max,
  altura = 10,
  trilho = false,
}: {
  segmentos: Segmento[];
  /** Valor que corresponde à largura TOTAL (padrão: a soma — barra cheia). */
  max?: number;
  altura?: number;
  trilho?: boolean;
}) {
  const visiveis = segmentos.filter((s) => s.valor > 0);
  const soma = visiveis.reduce((t, s) => t + s.valor, 0);
  const base = Math.max(max ?? soma, soma, 1e-9);
  return (
    <div aria-hidden className={`flex w-full ${trilho ? "overflow-hidden rounded-[4px] bg-track" : ""}`} style={{ height: altura }}>
      {soma > 0 && (
        <div className="flex h-full overflow-hidden rounded-r-[4px]" style={{ width: `${(soma / base) * 100}%`, minWidth: 4 }}>
          {visiveis.map((s, i) => (
            <span
              key={s.chave}
              title={`${s.rotulo}: ${num(s.valor)}`}
              className="h-full"
              style={{ flex: `${s.valor} 1 0%`, minWidth: 3, background: s.cor, borderLeft: i > 0 ? "2px solid var(--surface)" : undefined }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Uma linha do gráfico de barras horizontais. */
export type LinhaBarra = {
  chave: string | number;
  /** O que a linha é (texto, ou avatar + nome). */
  rotulo: ReactNode;
  /** Nome completo/descrição (dica e nome acessível). */
  titulo: string;
  /** 1+ segmentos (uma cor só = barra simples). */
  segmentos: Segmento[];
  /** O número principal (já formatado), alinhado à direita. */
  valor: ReactNode;
  /** A 2ª informação (ex.: o R$), esmaecida. */
  detalhe?: ReactNode;
  /** Linha de agregado ("Outras…", "Sem …"): esmaecida e — salvo `clicavel` — não clicável. */
  apagada?: boolean;
  /** Clicável mesmo `apagada` (ex.: abrir a ORIGEM dos dados de "Sem situação"/"Outras unidades"). */
  clicavel?: boolean;
};

/**
 * BARRAS HORIZONTAIS — rótulo | barra | valor, os valores alinhados numa coluna. Com `onEscolher`, cada linha
 * (exceto as apagadas) é um BOTÃO de linha inteira (alvo de 44px no celular) que marca a `ativa` — ex.: filtrar a
 * Mesa pela pessoa. A escala é a MAIOR linha (ou `max`).
 */
export function BarrasH({
  linhas,
  ariaLabel,
  max,
  ativa = null,
  onEscolher,
  acao = "filtrar a Mesa",
}: {
  linhas: LinhaBarra[];
  ariaLabel: string;
  max?: number;
  ativa?: string | number | null;
  onEscolher?: (chave: string | number) => void;
  /** O que o toque faz (nome acessível do botão da linha). */
  acao?: string;
}) {
  const escala = max ?? Math.max(0, ...linhas.map((l) => l.segmentos.reduce((t, s) => t + s.valor, 0)));
  const grade = "grid w-full grid-cols-[minmax(0,40%)_minmax(2.5rem,1fr)_auto] items-center gap-x-2.5";
  return (
    <ul aria-label={ariaLabel} className="space-y-0.5">
      {linhas.map((l) => {
        const conteudo = (
          <>
            <span className={`min-w-0 truncate text-left text-[12.5px] ${l.apagada ? "text-muted" : "text-text-2"}`}>{l.rotulo}</span>
            <BarraSegmentada segmentos={l.segmentos} max={escala} />
            <span className="whitespace-nowrap text-right text-[12.5px] tabular-nums">
              <span className={`font-semibold ${l.apagada ? "text-muted" : "text-text"}`}>{l.valor}</span>
              {l.detalhe != null && <span className="ml-1.5 text-[11.5px] text-muted">{l.detalhe}</span>}
            </span>
          </>
        );
        const marcada = ativa != null && l.chave === ativa;
        return (
          <li key={l.chave} title={l.titulo}>
            {onEscolher && (!l.apagada || l.clicavel) ? (
              <button
                type="button"
                aria-pressed={marcada}
                aria-label={`${l.titulo}${marcada ? " (filtro ativo — toque para limpar)" : ` — ${acao}`}`}
                onClick={() => onEscolher(l.chave)}
                className={`${grade} min-h-11 rounded-control px-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-9 ${
                  marcada ? "bg-accent-soft shadow-[inset_3px_0_0_var(--accent)]" : ""
                }`}
              >
                {conteudo}
              </button>
            ) : (
              <div className={`${grade} min-h-9 px-2`}>{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Uma coluna do gráfico de colunas verticais. */
export type Coluna = {
  chave: string;
  /** Rótulo do eixo (curto). */
  rotulo: string;
  valor: number;
  /** A dica: o valor em destaque + o que é (ex.: "3 protocolos · R$ 1,2 mi" / "Semana de 14/09"). */
  dica: { valor: string; rotulo: string };
  cor?: string;
};

/** Teto "redondo" do eixo (1, 2, 5 × 10ⁿ) — a grade marca valores limpos. */
function tetoRedondo(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/**
 * COLUNAS verticais (série no tempo ou faixas ordenadas) — grade em linhas finas (o teto do eixo e o zero à
 * esquerda, fora da área do gráfico), colunas de até 24px com a ponta arredondada, o valor no topo (todas com
 * `rotularTodas`; senão só a maior e a última) e a dica ao passar o mouse, focar ou tocar (a coluna é um botão).
 * Com muitas colunas, o eixo rotula uma sim, outra não — sempre a última.
 */
export function Colunas({
  colunas,
  ariaLabel,
  altura = 140,
  cor = "var(--accent)",
  formatar = num,
  rotularTodas = false,
  onEscolher,
}: {
  colunas: Coluna[];
  ariaLabel: string;
  altura?: number;
  cor?: string;
  formatar?: (v: number) => string;
  rotularTodas?: boolean;
  /** Tocar/clicar numa coluna abre a ORIGEM dos dados dela (a dica segue no passar do mouse/foco). */
  onEscolher?: (chave: string) => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const maior = Math.max(0, ...colunas.map((c) => c.valor));
  const teto = tetoRedondo(maior);
  const iMaior = maior > 0 ? colunas.findIndex((c) => c.valor === maior) : -1;
  const n = colunas.length;
  const passo = n > 8 ? 2 : 1;
  const eixo = "absolute right-full mr-1.5 -translate-y-1/2 text-[10.5px] leading-none text-faint tabular-nums";
  return (
    // `pt-4`: o valor no topo de uma coluna cheia (no teto do eixo) tem espaço — não encosta no título do quadro.
    <div className="pl-7 pt-4">
      <ul aria-label={ariaLabel} className="relative flex items-end gap-1" style={{ height: altura }}>
        {/* Grade: teto (com o valor), metade e a linha de base (zero) — finas e recessivas. */}
        <li aria-hidden className="pointer-events-none absolute inset-x-0 top-0 border-t border-border">
          <span className={`${eixo} top-0`}>{formatar(teto)}</span>
        </li>
        <li aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-border" />
        <li aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-border-2">
          <span className={`${eixo} top-0`}>{formatar(0)}</span>
        </li>
        {colunas.map((c, i) => {
          const rotular = rotularTodas || i === iMaior || i === n - 1;
          const alinhar = i < 2 ? "left-0" : i >= n - 2 ? "right-0" : "left-1/2 -translate-x-1/2";
          return (
            <li key={c.chave} className="relative flex h-full min-w-0 flex-1 items-end justify-center">
              <button
                type="button"
                aria-label={`${c.dica.rotulo}: ${c.dica.valor}${onEscolher ? " — ver a origem dos dados" : ""}`}
                onClick={() => (onEscolher ? onEscolher(c.chave) : setAberta((a) => (a === c.chave ? null : c.chave)))}
                onBlur={() => setAberta((a) => (a === c.chave ? null : a))}
                className="group flex h-full w-full items-end justify-center focus-visible:outline-none"
              >
                <span
                  className="relative w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                  style={{ height: `${(c.valor / teto) * 100}%`, minHeight: c.valor > 0 ? 2 : 0, background: c.cor ?? cor }}
                >
                  {rotular && c.valor > 0 && (
                    <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-text-2 tabular-nums">
                      {formatar(c.valor)}
                    </span>
                  )}
                  {/* Dica: o VALOR em destaque, depois o que é (alinhada para dentro nas pontas). */}
                  <span
                    role="tooltip"
                    className={`pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-[13rem] rounded-control border border-border bg-surface px-2.5 py-1.5 text-left text-xs shadow-soft ${alinhar} ${
                      aberta === c.chave ? "block" : "hidden group-hover:block group-focus-visible:block"
                    }`}
                  >
                    <span className="block font-semibold text-text tabular-nums">{c.dica.valor}</span>
                    <span className="block text-muted">{c.dica.rotulo}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div aria-hidden className="mt-1.5 flex gap-1">
        {colunas.map((c, i) => (
          <span key={c.chave} className="flex min-w-0 flex-1 justify-center">
            <span className="whitespace-nowrap text-[10.5px] text-faint tabular-nums">{(n - 1 - i) % passo === 0 ? c.rotulo : ""}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
