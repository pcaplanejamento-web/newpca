"use client";

import { Checkbox } from "./Field";
import { Switch } from "./Switch";

type Opcao = { id: number; nome: string; ano: number | null };

/**
 * Uma LISTA DE IDS com "todos": o Switch "todos" (também os que forem criados — `valor = null`) ou só os marcados (o Set).
 * Os PCAs/orçamentos do grupo e os PCAs de um documento. `semTodos` = só a lista (quem não pode escolher "todos").
 */
export function ListaEscolhaIds({
  titulo,
  todos,
  vazio,
  aviso,
  opcoes,
  valor,
  onChange,
  semTodos = false,
}: {
  titulo: string;
  todos: string;
  vazio: string;
  aviso: string;
  opcoes: Opcao[];
  valor: Set<number> | null;
  onChange: (v: Set<number> | null) => void;
  semTodos?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-[13.5px] font-bold text-text">
        {titulo} · {valor == null ? "todos" : `${valor.size} selecionado(s)`}
      </legend>
      {!semTodos && <Switch checked={valor == null} onChange={(t) => onChange(t ? null : new Set(opcoes.map((p) => p.id)))} label={todos} />}
      {valor != null &&
        (opcoes.length === 0 ? (
          <p className="mt-2 rounded-control border border-dashed border-border-2 p-3 text-[12px] text-faint">{vazio}</p>
        ) : (
          <div className="mt-2 max-h-[200px] space-y-1 overflow-y-auto rounded-control border border-border p-2">
            {opcoes.map((p) => (
              <div key={p.id} className="rounded-control p-1.5 hover:bg-surface-2">
                <Checkbox
                  checked={valor.has(p.id)}
                  onChange={() => {
                    const n = new Set(valor);
                    if (n.has(p.id)) n.delete(p.id);
                    else n.add(p.id);
                    onChange(n);
                  }}
                  label={
                    <span className="flex items-center gap-2">
                      {p.ano != null && <span className="font-mono text-[10.5px] text-faint">{p.ano}</span>}
                      <span className="min-w-0 truncate text-[13px] text-text">{p.nome}</span>
                    </span>
                  }
                />
              </div>
            ))}
          </div>
        ))}
      {valor != null && valor.size === 0 && <p className="mt-1.5 text-[12px] text-[var(--warn)]">{aviso}</p>}
    </fieldset>
  );
}

