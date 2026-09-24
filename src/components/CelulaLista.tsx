import { Fragment } from "react";
import { dicaLista } from "@/lib/format";

/** Chip "+N" — os valores além dos exibidos (o MESMO onde uma célula mostra um valor e conta os demais). */
export function MaisN({ n }: { n: number }) {
  return <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold tabular-nums text-muted">+{n}</span>;
}

/** Um valor da lista: texto simples ou com marca de INATIVO (riscado — ex.: nº retirado do PCA). */
export type ValorLista = string | { texto: string; riscado?: boolean };

/**
 * Célula com VÁRIOS valores juntos numa linha só (a visão CONSOLIDADA dos itens: os protocolos, DFDs, siglas… de um
 * código): os primeiros `max` separados por "·" e um "+N" com o resto; a lista na dica (`title`, até 30) — no celular,
 * tocar na linha abre o detalhe com tudo. Sem valores = "—". Sem quebra de linha (a coluna ganha a largura do conteúdo).
 */
export function CelulaLista({
  valores,
  max = 2,
  mono = false,
  destaque = false,
  dica,
}: {
  valores: readonly ValorLista[];
  /** Quantos valores aparecem antes do "+N". */
  max?: number;
  /** Fonte mono (nºs de protocolo/DFD, siglas). */
  mono?: boolean;
  /** Cor de destaque (accent — ex.: a sigla da unidade). */
  destaque?: boolean;
  /** Dica própria (senão, a lista — um por linha, até 30 + "… e mais N"). */
  dica?: string;
}) {
  const lista = valores.map((v) => (typeof v === "string" ? { texto: v, riscado: false } : v));
  if (lista.length === 0) return <span className="text-faint">—</span>;
  const vistos = lista.slice(0, Math.max(1, max));
  const resto = lista.length - vistos.length;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      title={dica ?? dicaLista(lista, (v) => (v.riscado ? `${v.texto} (inativo)` : v.texto))}
    >
      <span className={`${mono ? "font-mono text-[12px]" : "text-[12.5px]"} ${destaque ? "font-semibold text-accent" : ""}`}>
        {vistos.map((v, i) => (
          <Fragment key={`${v.texto}-${i}`}>
            {i > 0 && <span className="text-faint"> · </span>}
            <span className={v.riscado ? "text-faint line-through" : undefined}>{v.texto}</span>
          </Fragment>
        ))}
      </span>
      {resto > 0 && <MaisN n={resto} />}
    </span>
  );
}
