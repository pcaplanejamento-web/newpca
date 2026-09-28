"use client";

import type { ReactNode } from "react";

export type ColunaTabelaPeriodo = { chave: string; rotulo: string; titulo: string };
export type LinhaTabelaPeriodo = {
  chave: string;
  /** O que a linha é (texto, ou avatar + nome). */
  rotulo: ReactNode;
  /** Nome completo (dica e nome acessível). */
  titulo: string;
  /** Os números por coluna — `null` = carregando ("…"). */
  valores: Record<string, number> | null;
  /** `total` = a linha TOTAL (em negrito); `extra` = abaixo do total, à parte (ex.: correções). */
  tipo?: "total" | "extra";
};

/**
 * TABELA POR PERÍODO — linhas × janelas (ex.: pessoa × Hoje | Mês | Ano | Na Mesa), no formato da planilha de
 * distribuição. A coluna em DESTAQUE (o período escolhido) ganha fundo accent suave e uma barra de proporção sob cada
 * número (escala = o maior da coluna); zero aparece como "–". Com `onEscolher`, cada número é um BOTÃO (44px no
 * toque) que abre a origem dele. Linha TOTAL em negrito e as `extras` (à parte) embaixo. Rola no próprio contêiner
 * quando não cabe. Só tokens do design-system.
 */
export function TabelaPeriodo({
  ariaLabel,
  rotuloLinhas,
  colunas,
  destaque,
  linhas,
  total,
  extras = [],
  formatar,
  alinhar = "center",
  onEscolher,
}: {
  ariaLabel: string;
  /** Cabeçalho da 1ª coluna (ex.: "Pessoa", "Natureza"). */
  rotuloLinhas: string;
  colunas: ColunaTabelaPeriodo[];
  /** A chave da coluna em destaque. */
  destaque: string;
  linhas: LinhaTabelaPeriodo[];
  total?: LinhaTabelaPeriodo;
  extras?: LinhaTabelaPeriodo[];
  formatar: (n: number) => string;
  /** Números no centro (contagens) ou à direita (R$). */
  alinhar?: "center" | "right";
  onEscolher?: (linha: LinhaTabelaPeriodo, coluna: ColunaTabelaPeriodo) => void;
}) {
  const maxDestaque = Math.max(0, ...linhas.map((l) => l.valores?.[destaque] ?? 0));
  const lado = alinhar === "right" ? "justify-end text-right" : "justify-center text-center";

  const celula = (l: LinhaTabelaPeriodo, c: ColunaTabelaPeriodo) => {
    const v = l.valores?.[c.chave];
    const emDestaque = c.chave === destaque;
    const texto = v == null ? "…" : v === 0 ? "–" : formatar(v);
    // A barra de proporção só no corpo (o total e as extras não entram na escala).
    const barra = emDestaque && !l.tipo && v != null && v > 0 && maxDestaque > 0;
    const conteudo = (
      <>
        <span className={`tabular-nums ${v === 0 || v == null ? "text-faint" : ""}`}>{texto}</span>
        {barra && (
          <span aria-hidden className="absolute inset-x-2 bottom-1 h-[3px] overflow-hidden rounded-full bg-accent/15">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(6, (v / maxDestaque) * 100)}%` }} />
          </span>
        )}
      </>
    );
    return (
      <td key={c.chave} className={`p-0 ${emDestaque ? "bg-accent-soft/60" : ""}`}>
        {onEscolher && v != null && v !== 0 ? (
          <button
            type="button"
            onClick={() => onEscolher(l, c)}
            aria-label={`${l.titulo} — ${c.titulo}: ${texto}. Ver a origem dos dados`}
            title={`${c.titulo}: ${texto}`}
            className={`relative flex min-h-11 w-full items-center px-2.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 lg:min-h-9 ${lado}`}
          >
            {conteudo}
          </button>
        ) : (
          <span className={`relative flex min-h-11 items-center px-2.5 lg:min-h-9 ${lado}`}>{conteudo}</span>
        )}
      </td>
    );
  };

  const linha = (l: LinhaTabelaPeriodo) => (
    <tr
      key={l.chave}
      className={`border-t ${l.tipo === "total" ? "border-border-2 font-semibold text-text" : "border-border"} ${l.tipo === "extra" ? "text-muted" : ""}`}
    >
      <th scope="row" title={l.titulo} className={`max-w-[14rem] py-0 pr-3 text-left ${l.tipo === "total" ? "font-semibold" : "font-normal"}`}>
        <span className="block truncate">{l.rotulo}</span>
      </th>
      {colunas.map((c) => celula(l, c))}
    </tr>
  );

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table aria-label={ariaLabel} className="w-full min-w-max border-collapse text-[13px]">
        <thead>
          <tr>
            <th scope="col" className="py-1.5 pr-3 text-left text-[11.5px] font-medium text-muted">
              {rotuloLinhas}
            </th>
            {colunas.map((c) => (
              <th
                key={c.chave}
                scope="col"
                title={c.titulo}
                className={`px-2.5 py-1.5 text-[11.5px] ${c.chave === destaque ? "bg-accent-soft/60 font-semibold text-accent" : "font-medium text-muted"} ${
                  alinhar === "right" ? "text-right" : "text-center"
                }`}
              >
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map(linha)}
          {total && linha({ ...total, tipo: "total" })}
          {extras.map((e) => linha({ ...e, tipo: "extra" }))}
        </tbody>
      </table>
    </div>
  );
}
