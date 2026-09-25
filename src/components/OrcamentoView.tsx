"use client";

import { useState } from "react";
import { num } from "@/lib/format";
import type { OrcamentoResumo } from "@/lib/orcamento";
import { IconInbox } from "./icons";
import { ImportarOrcamento } from "./ImportarOrcamento";
import { OrcamentoCard, OrcamentoNovoCard } from "./OrcamentoCard";

/**
 * Módulo ORÇAMENTO (relatório CUBO) — a LISTA: um card 4:5 por orçamento importado (`OrcamentoCard`: ano, nome,
 * indicadores) + o card "+" (editor) que abre a importação (`ImportarOrcamento`: `.xlsx` lido no cliente + o ANO). Clicar
 * num card abre a TELA DO ORÇAMENTO (`/painel/orcamento/[id]`: Lançamentos · Vínculos · Visões); ao importar, a
 * tela do orçamento novo abre sozinha. 100% design-system.
 */
export function OrcamentoView({
  orcamentos,
  podeEditar,
  filtro = null,
}: {
  orcamentos: OrcamentoResumo[];
  podeEditar: boolean;
  /** PCA escolhido no CABEÇALHO (filtro global) — só os orçamentos do ano dele vieram. */
  filtro?: string | null;
}) {
  const [importar, setImportar] = useState(0); // cada valor novo abre o lançador (ImportarOrcamento)
  const totalLancamentos = orcamentos.reduce((s, o) => s + o.totalItens, 0);

  return (
    <div className="space-y-[var(--gap-block)]">
      <div>
        <h1 className="text-xl font-bold text-text">Orçamento</h1>
        <p className="text-sm text-muted">
          {orcamentos.length} {orcamentos.length === 1 ? "orçamento" : "orçamentos"} · {num(totalLancamentos)}{" "}
          {totalLancamentos === 1 ? "lançamento" : "lançamentos"} ·{" "}
          {filtro ? `do ano do ${filtro}, o PCA escolhido no cabeçalho` : "abra um orçamento para ver os lançamentos, vínculos e visões"}
        </p>
      </div>

      {orcamentos.length === 0 && !podeEditar ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
          <IconInbox className="h-10 w-10 text-faint" />
          <p className="text-sm text-muted">{filtro ? `Nenhum orçamento do ano do ${filtro}.` : "Nenhum orçamento ainda."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {orcamentos.map((o) => (
            <OrcamentoCard key={o.id} orcamento={o} href={`/painel/orcamento/${o.id}`} />
          ))}
          {podeEditar && <OrcamentoNovoCard onClick={() => setImportar((n) => n + 1)} />}
        </div>
      )}

      {podeEditar && <ImportarOrcamento iniciar={importar} />}
    </div>
  );
}
