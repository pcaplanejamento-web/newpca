"use client";

import { useMemo, useState } from "react";
import { num } from "@/lib/format";
import { opcoesDaBusca } from "@/lib/tabela-filtros";
import { Checkbox, SearchField } from "./Field";
import { IconChevronDown } from "./icons";

export type OpcaoMultipla = { valor: string; contagem?: number };

/** Máximo de opções renderizadas de uma vez (a busca restringe o resto) — leve com milhares. */
const MAX_VISIVEIS = 300;

/**
 * Linha RECOLHÍVEL de seleção MÚLTIPLA (padrão das "Visões salvas" do orçamento), na ALTURA PADRÃO dos controles
 * (`--h-control-sm` no desktop, 44px no toque): rótulo à esquerda e,
 * à direita, "Todos" ou "N selecionados" (accent). Aberta: busca (vários de uma vez com ":" — `opcoesDaBusca`;
 * Enter marca os encontrados) + marcar/limpar os filtrados + a lista de valores com a contagem. Nenhum marcado =
 * "Todos" (sem filtro).
 */
export function SeletorMultiplo({
  rotulo,
  opcoes,
  selecionados,
  onChange,
  disabled = false,
}: {
  rotulo: string;
  opcoes: OpcaoMultipla[];
  selecionados: string[];
  onChange: (valores: string[]) => void;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const sel = useMemo(() => new Set(selecionados), [selecionados]);
  const filtradas = useMemo(() => {
    const casam = new Set(opcoesDaBusca(opcoes.map((o) => o.valor), busca));
    return casam.size === opcoes.length ? opcoes : opcoes.filter((o) => casam.has(o.valor));
  }, [opcoes, busca]);
  const marcarFiltradas = () => onChange([...new Set([...selecionados, ...filtradas.map((o) => o.valor)])]);
  // Selecionados que sumiram das opções (facetas) continuam valendo — listados no topo.
  const orfaos = selecionados.filter((v) => !opcoes.some((o) => o.valor === v));
  const n = selecionados.length;

  const alternar = (v: string) => onChange(sel.has(v) ? selecionados.filter((x) => x !== v) : [...selecionados, v]);

  return (
    <div className="rounded-control border border-border bg-surface">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="flex h-11 w-full items-center gap-2 px-3 text-left disabled:opacity-60 lg:h-[var(--h-control-sm)]"
      >
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">{rotulo}</span>
        <span className={`shrink-0 text-[12px] ${n > 0 ? "font-semibold text-accent" : "text-muted"}`}>{n > 0 ? `${num(n)} selecionado${n === 1 ? "" : "s"}` : "Todos"}</span>
        <IconChevronDown className={`h-4 w-4 text-muted transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="space-y-2 border-t border-border p-2">
          <SearchField
            compacto
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onClear={() => setBusca("")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && busca.trim() && !disabled) {
                e.preventDefault();
                marcarFiltradas();
              }
            }}
            aria-label={`Buscar ${rotulo.toLowerCase()} (use : para vários)`}
            placeholder={`Buscar ${rotulo.toLowerCase()} (use : para vários)…`}
          />
          <div className="flex flex-wrap gap-x-3 px-1 text-xs">
            <button
              type="button"
              className="font-semibold text-accent hover:underline disabled:opacity-50"
              disabled={disabled}
              onClick={marcarFiltradas}
            >
              Marcar {busca ? "os filtrados" : "todos"} ({num(filtradas.length)})
            </button>
            {n > 0 && (
              <button type="button" className="font-semibold text-muted hover:underline" disabled={disabled} onClick={() => onChange([])}>
                Limpar (Todos)
              </button>
            )}
          </div>
          <ul className="max-h-60 overflow-y-auto px-1">
            {orfaos.map((v) => (
              <li key={`o:${v}`} className="flex min-h-11 items-center justify-between gap-2 text-sm lg:min-h-7">
                <Checkbox checked onChange={() => alternar(v)} label={<span className="text-muted">{v}</span>} disabled={disabled} />
                <span className="text-xs text-faint">fora do filtro</span>
              </li>
            ))}
            {filtradas.slice(0, MAX_VISIVEIS).map((o) => (
              <li key={o.valor} className="flex min-h-11 items-center justify-between gap-2 text-sm lg:min-h-7">
                <Checkbox checked={sel.has(o.valor)} onChange={() => alternar(o.valor)} label={o.valor} disabled={disabled} />
                {o.contagem != null && <span className="shrink-0 text-xs tabular-nums text-faint">{num(o.contagem)}</span>}
              </li>
            ))}
            {filtradas.length > MAX_VISIVEIS && (
              <li className="py-1 text-xs text-faint">+{num(filtradas.length - MAX_VISIVEIS)} — refine a busca para ver os demais.</li>
            )}
            {filtradas.length === 0 && orfaos.length === 0 && <li className="py-1 text-xs text-faint">Nenhum valor.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
