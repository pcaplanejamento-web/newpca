"use client";

import { brl } from "@/lib/format";
import type { OrcamentoItemRow } from "@/lib/orcamento";

/**
 * Corpo de um `Modal`: detalhe SÓ-LEITURA de UM lançamento do orçamento (Órgão/Unidade/Elemento de
 * despesa + a classificação programática — Função/Programa/Ação — a Ficha e a Fonte de recurso + valores). Os lançamentos vêm do sistema oficial — não são
 * editáveis na tela. Só componentes/tokens do design-system. Espelha o modo "consultar"
 * do `CatalogoItemDetalhe`. `vinculo` = o Órgão/Unidade do SISTEMA a que o texto do CUBO está
 * vinculado (tela "Vínculos"); sem vínculo mostra "Sem vínculo".
 */
export function OrcamentoItemDetalhe({
  item,
  vinculo,
}: {
  item: OrcamentoItemRow;
  vinculo?: { orgao: string | null; unidade: string | null };
}) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <div>
        <p className="text-xs text-muted">Elemento de despesa</p>
        <p className="mt-0.5 font-semibold leading-snug text-text">{item.nomeElemento || "—"}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {item.codigoElemento && (
            <span className="inline-block rounded-chip bg-surface-2 px-2.5 py-1 font-mono text-[13px] font-bold text-text">{item.codigoElemento}</span>
          )}
          {item.ficha && (
            <span className="inline-block rounded-chip bg-surface-2 px-2.5 py-1 font-mono text-[13px] text-text-2">Ficha {item.ficha}</span>
          )}
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Campo label="Órgão" valor={item.orgao ?? "—"} />
        <Campo label="Unidade" valor={item.unidade ?? "—"} />
        <Campo label="Função" valor={item.funcao ?? "—"} />
        <Campo label="Programa" valor={item.programa ?? "—"} />
        <Campo label="Ação" valor={item.acao ?? "—"} />
        <Campo label="Fonte de recurso" valor={item.fonte ?? "—"} />
      </dl>

      {vinculo && (
        <div className="rounded-card border border-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">No sistema</p>
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            <Campo label="Órgão" valor={vinculo.orgao ?? "Sem vínculo"} />
            <Campo label="Unidade" valor={vinculo.unidade ?? "Sem vínculo"} />
          </dl>
        </div>
      )}

      <div className="rounded-card border border-border bg-surface-2 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Valores</p>
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          <Valor label="Valor inicial (dotação)" v={item.valorInicial} forte />
          <Valor label="Saldo" v={item.saldo} />
          <Valor label="Suplementação" v={item.valorSuplementacao} />
          <Valor label="Empenho" v={item.valorEmpenho} />
          <Valor label="Emenda impositiva" v={item.valorEmendaImpositiva} />
          <Valor label="Anulação" v={item.valorAnulacao} />
        </dl>
      </div>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold leading-snug text-text">{valor}</dd>
    </div>
  );
}

function Valor({ label, v, forte }: { label: string; v: number; forte?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 tabular-nums text-text ${forte ? "text-base font-bold" : "font-semibold"}`}>{brl(v)}</dd>
    </div>
  );
}
