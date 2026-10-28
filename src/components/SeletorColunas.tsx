"use client";

import { useMemo, useState } from "react";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { SearchField } from "./Field";
import { IconColunas } from "./icons";

export type OpcaoColuna = { key: string; header: string; grupo?: string };

/**
 * SELETOR DE COLUNAS (no rodapé da tabela): o botão só-ícone abre um DROPDOWN preso a ele (folha só abaixo de 40rem) com
 * TODAS as colunas da tabela em caixas — cabeçalho com "N de M visíveis", busca acima de 12, grupos com a contagem e
 * "Todos/Nenhum" do grupo, e no pé **Mostrar todas · Padrão** (volta às ocultas do padrão da tabela). Muda NA HORA (sem
 * entrar na edição); a última coluna visível nunca sai. A escolha vale até trocar de visão e entra na visão ao salvar.
 */
export function SeletorColunas({
  colunas,
  ocultas,
  padrao,
  onMudar,
}: {
  colunas: readonly OpcaoColuna[];
  ocultas: readonly string[];
  /** As colunas ocultas no padrão da tabela (o botão "Padrão"). */
  padrao: readonly string[];
  onMudar: (ocultas: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [folha, setFolha] = useState(false);
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
  /** Mostra ou oculta o grupo inteiro — ocultar nunca deixa a tabela sem coluna. */
  const alternarGrupo = (cs: readonly OpcaoColuna[]) => {
    const chaves = new Set(cs.map((c) => c.key));
    if (cs.some((c) => oc.has(c.key))) return onMudar(ocultas.filter((k) => !chaves.has(k)));
    const novas = new Set([...ocultas, ...chaves]);
    if (novas.size >= colunas.length) novas.delete(cs[0].key);
    onMudar([...novas]);
  };
  const conhecidas = new Set(colunas.map((c) => c.key));
  const contagem = `${visiveis} de ${colunas.length} visíveis`;
  return (
    <Dropdown
      papel="dialog"
      ariaLabel={`Colunas visíveis (${contagem})`}
      title={`Colunas (${contagem})`}
      width={320}
      folha={folha}
      aberto={aberto}
      onAberto={(v) => {
        if (v) setFolha(!window.matchMedia("(min-width: 40rem)").matches);
        setAberto(v);
      }}
      align="end"
      triggerClassName="inline-flex h-[44px] w-[44px] items-center justify-center rounded-control border border-border bg-surface text-text hover:bg-surface-2 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
      trigger={<IconColunas className="h-4 w-4" aria-hidden="true" />}
    >
      <div className="flex max-h-[min(70vh,30rem)] flex-col">
        <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-[13.5px] font-bold text-text">Colunas</span>
          <span className="text-[12px] tabular-nums text-muted">{contagem}</span>
        </div>
        {colunas.length > 12 && (
          <div className="border-b border-border p-2">
            <SearchField compacto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar coluna" aria-label="Procurar coluna" />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {grupos.map(([g, cs]) => {
            const vis = cs.filter((c) => !oc.has(c.key)).length;
            return (
              <fieldset key={g || "-"} className="py-1">
                <legend className="sr-only">{g || "Colunas"}</legend>
                {(g || grupos.length > 1) && (
                  <div className="flex items-center justify-between gap-2 px-3 pt-1">
                    <span className="min-w-0 truncate text-[11.5px] font-bold uppercase tracking-wide text-muted">
                      {g || "Colunas"} <span className="font-normal tabular-nums">· {vis}/{cs.length}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => alternarGrupo(cs)}
                      className="min-h-[44px] shrink-0 rounded-control px-2 text-[12px] font-medium text-accent hover:bg-surface-2 lg:min-h-[28px]"
                    >
                      {vis < cs.length ? "Todos" : "Nenhum"}
                    </button>
                  </div>
                )}
                {cs.map((c) => {
                  const marcada = !oc.has(c.key);
                  const ultima = marcada && visiveis === 1;
                  return (
                    <label
                      key={c.key}
                      className={`flex min-h-[44px] items-center gap-2.5 px-3 text-[13.5px] lg:min-h-[32px] ${ultima ? "opacity-60" : "cursor-pointer hover:bg-surface-2"}`}
                      title={ultima ? "A tabela precisa de ao menos uma coluna" : c.header}
                    >
                      <input type="checkbox" className="caixa-marcar" checked={marcada} disabled={ultima} onChange={() => alternar(c.key)} />
                      <span className="min-w-0 truncate text-text">{c.header || c.key}</span>
                    </label>
                  );
                })}
              </fieldset>
            );
          })}
          {grupos.length === 0 && <p className="px-3 py-4 text-[13px] text-muted">Nenhuma coluna com esse nome.</p>}
        </div>
        <div className="flex justify-end gap-1 border-t border-border p-2">
          <Button size="sm" variant="ghost" onClick={() => onMudar(ocultas.filter((k) => !conhecidas.has(k)))}>
            Mostrar todas
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onMudar(padrao.filter((k) => conhecidas.has(k)))}>
            Padrão
          </Button>
        </div>
      </div>
    </Dropdown>
  );
}
