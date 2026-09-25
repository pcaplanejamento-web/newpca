"use client";

import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import { Avatar } from "./Avatar";
import { IconCheck } from "./icons";

/**
 * VÁRIAS PESSOAS de uma vez (ex.: os responsáveis de uma tarefa): um chip por pessoa — FOTO + apelido —, que alterna ao
 * tocar (marcado = accent + ✓). `fora` = as pessoas já escolhidas que hoje estão fora do grupo: aparecem (esmaecidas) para
 * poderem ser tiradas, mas não voltam a ser escolhidas. Alvos ≥ 44px no toque.
 */
export function SeletorPessoas({
  pessoas,
  selecionadas,
  onChange,
  fora = [],
  disabled = false,
  usuarioId = null,
}: {
  /** As que podem ser escolhidas (as do grupo). */
  pessoas: Pessoa[];
  selecionadas: number[];
  onChange: (ids: number[]) => void;
  fora?: Pessoa[];
  disabled?: boolean;
  /** O usuário da sessão — marcado com "(eu)". */
  usuarioId?: number | null;
}) {
  const marcadas = new Set(selecionadas);
  const lista = [...pessoas, ...fora.filter((p) => marcadas.has(p.id) && !pessoas.some((x) => x.id === p.id))];
  const alternar = (id: number) => onChange(marcadas.has(id) ? selecionadas.filter((x) => x !== id) : [...selecionadas, id]);
  if (!lista.length) return <p className="text-[12.5px] text-muted">Nenhuma pessoa no grupo.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {lista.map((p) => {
        const ativa = marcadas.has(p.id);
        const doGrupo = pessoas.some((x) => x.id === p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={ativa}
            disabled={disabled || (!ativa && !doGrupo)}
            title={`${p.nome}${doGrupo ? "" : " — fora do grupo"}`}
            onClick={() => alternar(p.id)}
            className={`inline-flex h-11 items-center gap-1.5 rounded-full border pr-3 pl-1 text-[12.5px] font-medium transition-colors duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default disabled:opacity-60 lg:h-[var(--h-control-sm)] ${
              ativa ? "border-accent/50 bg-accent-soft text-accent" : "border-border-2 bg-surface text-text-2 hover:bg-surface-2"
            } ${doGrupo ? "" : "opacity-60"}`}
          >
            <Avatar nome={p.nome} foto={p.foto} size="xs" />
            <span className="max-w-[10rem] truncate">
              {nomeExibicao(p)}
              {p.id === usuarioId ? " (eu)" : ""}
            </span>
            {ativa && <IconCheck className="h-3.5 w-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
