"use client";

import type { ReactNode } from "react";

/** Uma foto da pilha: a foto já montada (o `Avatar` com o ponto de presença), a dica e, opcionalmente, o toque. */
export type FotoPilha = {
  id: string | number;
  /** A foto (`Avatar`/`AvatarPessoa` no tamanho `sm`). */
  foto: ReactNode;
  titulo: string;
  /** Acabou de entrar: a foto brilha. */
  novo?: boolean;
  /** Marcada (ex.: o filtro pela pessoa): anel accent. */
  ativo?: boolean;
  /** Com o toque, cada foto vira um botão (o nome acessível = `rotulo`). */
  onClick?: () => void;
  rotulo?: string;
};

/** Fotos à vista (as demais viram o círculo "+N"). */
export const MAX_FOTOS_PILHA = 5;

/**
 * A PILHA DE FOTOS — a MESMA do cabeçalho ("quem está online") e da faixa do quadro de Tarefas (os membros): fotos `sm`
 * sobrepostas com o anel da superfície, a PRIMEIRA POR CIMA (o ponto de presença, no canto direito, nunca fica coberto pela
 * vizinha), em LEQUE ao passar o mouse ou com o foco, e o círculo "+N" no MESMO tamanho fechando a pilha (os nomes na dica).
 */
export function PilhaFotos({ itens, max = MAX_FOTOS_PILHA, className = "" }: { itens: FotoPilha[]; max?: number; className?: string }) {
  if (!itens.length) return null;
  const fotos = itens.slice(0, max);
  const resto = itens.slice(max);
  const leque = "transition-[margin,transform] duration-[var(--motion-duration)]";
  const abre = "-ml-1.5 group-hover/pilha:ml-0.5 group-focus-visible/pilha:ml-0.5 group-focus-within/pilha:ml-0.5";
  return (
    <span className={`group/pilha flex items-center ${className}`}>
      {fotos.map((f, i) => {
        const classe = `animate-entrar-pessoa relative inline-flex rounded-full ring-2 ${f.ativo ? "ring-accent" : "ring-surface"} ${leque} ${i ? abre : ""} ${
          f.novo ? "animate-brilho-novo" : ""
        }`;
        const estilo = { zIndex: fotos.length + 1 - i };
        return f.onClick ? (
          <button
            key={f.id}
            type="button"
            aria-pressed={f.ativo}
            aria-label={f.rotulo ?? f.titulo}
            title={f.titulo}
            onClick={f.onClick}
            className={`${classe} hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-accent`}
            style={estilo}
          >
            {f.foto}
          </button>
        ) : (
          <span key={f.id} className={classe} style={estilo} title={f.titulo}>
            {f.foto}
          </span>
        );
      })}
      {resto.length > 0 && (
        <span
          className={`relative inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-surface-2 px-1 text-[10.5px] font-semibold leading-none tabular-nums text-text-2 shadow-[inset_0_0_0_1px_var(--border)] ring-2 ring-surface ${leque} ${abre}`}
          style={{ zIndex: 0 }}
          title={`Mais ${resto.length}: ${resto.map((f) => f.titulo.split(" — ")[0]).join(", ")}`}
        >
          <span key={resto.length} className="animate-contador">
            +{resto.length > 99 ? 99 : resto.length}
          </span>
        </span>
      )}
    </span>
  );
}
