"use client";

import { useId, useMemo, useState } from "react";
import { num } from "@/lib/format";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { SearchField } from "./Field";
import { IconCheck } from "./icons";

export type OpcaoBusca = { valor: string; rotulo: string; detalhe?: string };

/** Máximo de opções renderizadas de uma vez (a busca restringe o resto) — leve com milhares. */
const MAX_VISIVEIS = 200;

/**
 * SELEÇÃO ÚNICA COM BUSCA: campo de busca (sem acento/caixa; vários termos de uma vez com ":") + a lista rolável das
 * opções que casam (rótulo + detalhe), a escolhida destacada. Teclado no campo: ↑/↓ percorrem, Enter escolhe.
 * Alvos ≥ 44px; renderiza até 200 (a busca restringe o resto). Ex.: o protocolo de destino ao mover/vincular um DFD.
 * `onBusca` = a busca vai TAMBÉM ao servidor (quem usa troca as `opcoes` pelo resultado — ex.: o vínculo de uma tarefa).
 */
export function SeletorBusca({
  opcoes,
  valor,
  onChange,
  ariaLabel,
  placeholder = "Pesquisar…",
  vazio = "Nada encontrado",
  disabled = false,
  onBusca,
}: {
  opcoes: OpcaoBusca[];
  valor: string;
  onChange: (valor: string) => void;
  ariaLabel: string;
  placeholder?: string;
  vazio?: string;
  disabled?: boolean;
  /** O texto digitado (a cada mudança) — para buscar no servidor. */
  onBusca?: (q: string) => void;
}) {
  const id = useId();
  const [busca, setBusca] = useState("");
  const [cursor, setCursor] = useState(-1);
  const lista = useMemo(() => {
    const casa = predicadoBusca(busca);
    return casa ? opcoes.filter((o) => casa([o.rotulo, o.detalhe])) : opcoes;
  }, [opcoes, busca]);
  const visiveis = lista.length > MAX_VISIVEIS ? lista.slice(0, MAX_VISIVEIS) : lista;
  const ativo = cursor >= 0 && cursor < visiveis.length ? cursor : -1;

  function mover(passo: number) {
    if (visiveis.length === 0) return;
    const base = ativo >= 0 ? ativo : Math.max(-1, visiveis.findIndex((o) => o.valor === valor));
    const prox = Math.min(visiveis.length - 1, Math.max(0, base + passo));
    setCursor(prox);
    document.getElementById(`${id}-op-${prox}`)?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="space-y-2">
      <SearchField
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setCursor(-1);
          onBusca?.(e.target.value);
        }}
        onClear={() => {
          setBusca("");
          setCursor(-1);
          onBusca?.("");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            mover(e.key === "ArrowDown" ? 1 : -1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const alvo = ativo >= 0 ? visiveis[ativo] : visiveis.length === 1 ? visiveis[0] : undefined;
            if (alvo && !disabled) onChange(alvo.valor);
          }
        }}
        role="combobox"
        aria-expanded
        aria-controls={`${id}-lista`}
        aria-activedescendant={ativo >= 0 ? `${id}-op-${ativo}` : undefined}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
      />
      <div id={`${id}-lista`} role="listbox" aria-label={ariaLabel} className="max-h-72 overflow-y-auto rounded-card border border-border bg-surface">
        {visiveis.map((o, i) => {
          const escolhida = o.valor === valor;
          return (
            <div
              key={o.valor}
              id={`${id}-op-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={escolhida}
              aria-disabled={disabled || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!disabled) onChange(o.valor);
              }}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-0 ${
                escolhida ? "bg-accent-soft" : i === ativo ? "bg-surface-2" : "hover:bg-surface-2"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-semibold ${escolhida ? "text-accent" : "text-text"}`}>{o.rotulo}</span>
                {o.detalhe && <span className="block truncate text-xs text-muted">{o.detalhe}</span>}
              </span>
              {escolhida && <IconCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
            </div>
          );
        })}
        {lista.length === 0 && <p className="px-3 py-4 text-center text-xs text-faint">{vazio}</p>}
        {lista.length > MAX_VISIVEIS && (
          <p className="px-3 py-2 text-xs text-faint">+{num(lista.length - MAX_VISIVEIS)} — refine a busca para ver os demais.</p>
        )}
      </div>
    </div>
  );
}
