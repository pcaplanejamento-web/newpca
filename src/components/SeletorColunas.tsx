"use client";

import { useMemo, useState } from "react";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { SearchField } from "./Field";
import { IconColunas } from "./icons";

export type OpcaoColuna = { key: string; header: string; grupo?: string };

/**
 * SELETOR DE COLUNAS (no rodapé da tabela): o botão só-ícone abre a lista de TODAS as colunas da tabela com caixas
 * (agrupadas por `grupo`, busca acima de 12) e **Todos | Nenhum** — marcar mostra, desmarcar oculta, NA HORA (sem entrar na
 * edição da planilha). "Nenhum" deixa a 1ª coluna (a tabela nunca fica vazia). A escolha vale até trocar de visão e entra
 * na visão ao salvar. 44px no toque; folha no celular.
 */
export function SeletorColunas({
  colunas,
  ocultas,
  onMudar,
}: {
  colunas: readonly OpcaoColuna[];
  ocultas: readonly string[];
  onMudar: (ocultas: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const oc = useMemo(() => new Set(ocultas), [ocultas]);
  const visiveis = colunas.filter((c) => !oc.has(c.key)).length;
  const grupos = useMemo(() => {
    const passa = predicadoBusca(busca);
    const m = new Map<string, OpcaoColuna[]>();
    for (const c of colunas) if (!passa || passa([c.header])) m.set(c.grupo ?? "", [...(m.get(c.grupo ?? "") ?? []), c]);
    return [...m];
  }, [colunas, busca]);
  const alternar = (k: string) => {
    if (oc.has(k)) onMudar(ocultas.filter((x) => x !== k));
    else if (visiveis > 1) onMudar([...ocultas, k]);
  };
  const outras = new Set(colunas.map((c) => c.key));
  return (
    <Dropdown
      papel="dialog"
      ariaLabel="Colunas visíveis"
      title={`Colunas visíveis (${visiveis} de ${colunas.length})`}
      width={300}
      folha
      align="end"
      triggerClassName="inline-flex h-[44px] w-[44px] items-center justify-center rounded-control border border-border bg-surface text-text hover:bg-surface-2 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
      trigger={<IconColunas className="h-4 w-4" aria-hidden="true" />}
    >
      <div className="flex max-h-[min(70vh,34rem)] flex-col">
        {colunas.length > 12 && (
          <div className="border-b border-border p-2">
            <SearchField compacto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar coluna" aria-label="Procurar coluna" />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {grupos.map(([g, cs]) => (
            <fieldset key={g || "-"} className="py-1">
              {g && <legend className="px-3 pt-1 text-[11.5px] font-bold uppercase tracking-wide text-muted">{g}</legend>}
              {cs.map((c) => {
                const marcada = !oc.has(c.key);
                const ultima = marcada && visiveis === 1;
                return (
                  <label
                    key={c.key}
                    className={`flex min-h-[44px] items-center gap-2.5 px-3 text-[13.5px] lg:min-h-[34px] ${ultima ? "opacity-60" : "cursor-pointer hover:bg-surface-2"}`}
                    title={ultima ? "A tabela precisa de ao menos uma coluna" : undefined}
                  >
                    <input type="checkbox" className="caixa-marcar" checked={marcada} disabled={ultima} onChange={() => alternar(c.key)} />
                    <span className="min-w-0 truncate text-text">{c.header || c.key}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
          {grupos.length === 0 && <p className="px-3 py-4 text-[13px] text-muted">Nenhuma coluna com esse nome.</p>}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border p-2">
          <Button size="sm" variant="ghost" onClick={() => onMudar(ocultas.filter((k) => !outras.has(k)))}>
            Todos
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onMudar([...new Set([...ocultas, ...colunas.slice(1).map((c) => c.key)])])}>
            Nenhum
          </Button>
        </div>
      </div>
    </Dropdown>
  );
}
