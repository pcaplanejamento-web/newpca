"use client";

import { useMemo, useState } from "react";
import { num } from "@/lib/format";
import { Checkbox, SearchField } from "./Field";
import { IconChevronDown } from "./icons";

export type OpcaoMultipla = { valor: string; contagem?: number };

/** Máximo de opções renderizadas de uma vez (a busca restringe o resto) — leve com milhares. */
const MAX_VISIVEIS = 300;

/**
 * Linha RECOLHÍVEL de seleção MÚLTIPLA (padrão das "Visões salvas" do orçamento): rótulo à esquerda e,
 * à direita, "Todos" ou "N selecionados" (accent). Aberta: busca + marcar/limpar os filtrados + a lista
 * de valores com a contagem. Nenhum marcado = "Todos" (sem filtro).
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
    const t = busca.trim().toLowerCase();
    return t ? opcoes.filter((o) => o.valor.toLowerCase().includes(t)) : opcoes;
  }, [opcoes, busca]);
  // Selecionados que sumiram das opções (facetas) continuam valendo — listados no topo.
  const orfaos = selecionados.filter((v) => !opcoes.some((o) => o.valor === v));
  const n = selecionados.length;

  const alternar = (v: string) => onChange(sel.has(v) ? selecionados.filter((x) => x !== v) : [...selecionados, v]);

  return (
    <div className="rounded-card border border-border bg-surface">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left disabled:opacity-60"
      >
        <span className="flex-1 font-semibold text-text">{rotulo}</span>
        <span className={`text-sm ${n > 0 ? "font-semibold text-accent" : "text-muted"}`}>{n > 0 ? `${num(n)} selecionado${n === 1 ? "" : "s"}` : "Todos"}</span>
        <IconChevronDown className={`h-4 w-4 text-muted transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="space-y-3 border-t border-border p-3">
          <SearchField value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} placeholder={`Buscar ${rotulo.toLowerCase()}…`} />
          <div className="flex flex-wrap gap-3 text-xs">
            <button
              type="button"
              className="font-semibold text-accent hover:underline disabled:opacity-50"
              disabled={disabled}
              onClick={() => onChange([...new Set([...selecionados, ...filtradas.map((o) => o.valor)])])}
            >
              Marcar {busca ? "os filtrados" : "todos"} ({num(filtradas.length)})
            </button>
            {n > 0 && (
              <button type="button" className="font-semibold text-muted hover:underline" disabled={disabled} onClick={() => onChange([])}>
                Limpar (Todos)
              </button>
            )}
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {orfaos.map((v) => (
              <li key={`o:${v}`} className="flex items-center justify-between gap-2 text-sm">
                <Checkbox checked onChange={() => alternar(v)} label={<span className="text-muted">{v}</span>} disabled={disabled} />
                <span className="text-xs text-faint">fora do filtro</span>
              </li>
            ))}
            {filtradas.slice(0, MAX_VISIVEIS).map((o) => (
              <li key={o.valor} className="flex items-center justify-between gap-2 text-sm">
                <Checkbox checked={sel.has(o.valor)} onChange={() => alternar(o.valor)} label={o.valor} disabled={disabled} />
                {o.contagem != null && <span className="shrink-0 text-xs tabular-nums text-faint">{num(o.contagem)}</span>}
              </li>
            ))}
            {filtradas.length > MAX_VISIVEIS && (
              <li className="pt-1 text-xs text-faint">+{num(filtradas.length - MAX_VISIVEIS)} — refine a busca para ver os demais.</li>
            )}
            {filtradas.length === 0 && orfaos.length === 0 && <li className="text-xs text-faint">Nenhum valor.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
