"use client";

import { Fragment } from "react";
import { dicaLista } from "@/lib/format";
import { useDadosCompletos } from "./DadosCompletos";

/** Chip "+N" — os valores além dos exibidos (o MESMO onde uma célula mostra um valor e conta os demais). */
export function MaisN({ n }: { n: number }) {
  return <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold tabular-nums text-muted">+{n}</span>;
}

/** Um valor da lista: texto simples ou com marca de INATIVO (riscado — ex.: nº retirado do PCA); "—" = algum sem o dado. */
export type ValorLista = string | { texto: string; riscado?: boolean };

/**
 * Célula com VÁRIOS valores juntos numa linha só (a visão CONSOLIDADA dos itens: os protocolos, DFDs, siglas… de um
 * código): os primeiros `max` separados por "·" e um "+N" com o resto; a lista na dica (`title`, até 30) — no celular,
 * tocar na linha abre o detalhe com tudo. Sem valores = "—". Sem quebra de linha (a coluna ganha a largura do conteúdo).
 * Com os DADOS COMPLETOS ligados (`DadosCompletos`), TODOS os valores, quebrando em linhas.
 */
export function CelulaLista({
  valores,
  max = 2,
  mono = false,
  destaque = false,
  esmaecido = false,
  dica,
}: {
  valores: readonly ValorLista[];
  /** Quantos valores aparecem antes do "+N". */
  max?: number;
  /** Fonte mono (nºs de protocolo/DFD, siglas). */
  mono?: boolean;
  /** Cor de destaque (accent — ex.: a sigla da unidade). */
  destaque?: boolean;
  /** Tudo em cinza (o que não vale mais — ex.: vínculos encerrados). */
  esmaecido?: boolean;
  /** Dica própria (senão, a lista — um por linha, até 30 + "… e mais N"). */
  dica?: string;
}) {
  const completo = useDadosCompletos();
  const lista = valores.map((v) => (typeof v === "string" ? { texto: v, riscado: false } : v));
  if (lista.length === 0) return <span className="text-faint">—</span>;
  const vistos = completo ? lista : lista.slice(0, Math.max(1, max));
  const resto = lista.length - vistos.length;
  return (
    <span
      className={`inline-flex items-center gap-1 ${completo ? "max-w-[22rem] whitespace-normal" : "whitespace-nowrap"}`}
      title={dica ?? dicaLista(lista, (v) => (v.riscado ? `${v.texto} (inativo)` : v.texto))}
    >
      <span className={`${mono ? "font-mono text-[12px]" : "text-[12.5px]"} ${destaque ? "font-semibold text-accent" : esmaecido ? "text-faint" : ""}`}>
        {vistos.map((v, i) => (
          <Fragment key={`${v.texto}-${i}`}>
            {i > 0 && <span className="text-faint"> · </span>}
            <span className={v.riscado ? "text-faint line-through" : v.texto === "—" ? "font-normal text-faint" : undefined}>{v.texto}</span>
          </Fragment>
        ))}
      </span>
      {resto > 0 && <MaisN n={resto} />}
    </span>
  );
}

/**
 * Texto LONGO de uma célula (descrição, assunto): uma linha + a dica; com os dados completos, o texto inteiro.
 * `outros` = as VARIANTES do mesmo dado (a Consolidada: as descrições diferentes de um código) — "+N" no resumo e,
 * completas, numeradas (D1, D2… — a MESMA numeração do detalhe). `dica` = a dica do resumo (padrão: o texto).
 */
export function CelulaTexto({ texto, outros = [], dica }: { texto: string | null | undefined; outros?: string[]; dica?: string }) {
  const completo = useDadosCompletos();
  if (!texto) return <span className="text-faint">—</span>;
  if (completo)
    return outros.length === 0 ? (
      <span className="block whitespace-normal break-words text-left">{texto}</span>
    ) : (
      <span className="flex flex-col gap-1 whitespace-normal break-words text-left">
        {[texto, ...outros].map((t, i) => (
          <span key={`${i}:${t}`}>
            <span className="font-semibold text-muted">D{i + 1} · </span>
            {t}
          </span>
        ))}
      </span>
    );
  return outros.length === 0 ? (
    <span className="line-clamp-1" title={dica ?? texto}>
      {texto}
    </span>
  ) : (
    <span className="flex min-w-0 items-center justify-center gap-1" title={dica ?? texto}>
      <span className="line-clamp-1 min-w-0">{texto}</span>
      <MaisN n={outros.length} />
    </span>
  );
}
