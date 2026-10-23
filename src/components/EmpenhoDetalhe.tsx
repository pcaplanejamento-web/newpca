"use client";

import type { EmpenhoCompleto } from "@/lib/empenhos-tela";
import type { EmpenhoNaTela } from "@/lib/empenhos-tela-core";
import { brl, dataBR, dataHoraBR } from "@/lib/format";
import { Skeleton } from "./Skeleton";
import { StatMini } from "./StatMini";

/**
 * Corpo de um `Modal`: UM empenho da Centi, SÓ LEITURA (os empenhos vêm da Centi — nada se edita na tela). O que a tabela
 * já tem aparece na hora (`empenho`); o histórico e o registro da importação chegam depois (`completo`; `undefined` =
 * carregando, `null` = não carregou). Espelha o `OrcamentoItemDetalhe`.
 */
export function EmpenhoDetalhe({ empenho, completo }: { empenho: EmpenhoNaTela; completo?: EmpenhoCompleto | null }) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 lg:grid-cols-5">
        <StatMini label="Empenhado" value={brl(empenho.valorEmpenhado)} tone="accent" />
        <StatMini label="Anulado" value={brl(empenho.valorAnulado)} tone={empenho.valorAnulado ? "warn" : "default"} />
        <StatMini label="Liquidado" value={brl(empenho.valorLiquidado)} />
        <StatMini label="Pago" value={brl(empenho.valorPago)} tone="ok" />
        <StatMini label="A pagar" value={brl(empenho.saldoPagar)} />
      </div>

      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Campo label="Data" valor={dataBR(empenho.data) || "—"} />
        <Campo label="Órgão gestor" valor={empenho.orgaoGestor} />
        <Campo label="Unidade orçamentária" valor={empenho.unidadeOrcamentaria} />
        <Campo label="Fornecedor" valor={empenho.fornecedor} />
        <Campo label="CPF/CNPJ" valor={empenho.cpfCnpj} />
        <Campo label="Modalidade" valor={empenho.modalidade} />
        <Campo label="Licitação" valor={empenho.licitacao} />
      </dl>

      <div className="rounded-card border border-border p-[var(--pad-card)]">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Classificação da despesa</p>
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          <Campo label="Função" valor={empenho.funcao} />
          <Campo label="Subfunção" valor={empenho.subfuncao} />
          <Campo label="Programa" valor={empenho.programa} />
          <Campo label="Ação" valor={empenho.acao} />
          <Campo label="Elemento" valor={empenho.elemento} />
          <Campo label="Subelemento" valor={empenho.subelemento} />
          <Campo label="Fonte de recurso" valor={empenho.fonte} />
        </dl>
      </div>

      <div className="rounded-card border border-border p-[var(--pad-card)]">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Histórico</p>
        {completo === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text">{completo?.historico || (completo ? "Sem histórico." : "Não foi possível carregar o histórico.")}</p>
        )}
      </div>

      {completo && (
        <div className="rounded-card border border-border bg-surface-2 p-[var(--pad-card)]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Registro</p>
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            <Campo label="Importado em" valor={dataHoraBR(completo.criadoEm)} />
            <Campo label="Atualizado em" valor={dataHoraBR(completo.atualizadoEm)} />
            <Campo label="Importação" valor={completo.loteId ? `nº ${completo.loteId}${completo.loteConcluidoEm ? ` · ${dataHoraBR(completo.loteConcluidoEm)}` : ""}` : "excluída do histórico"} />
            <Campo label="Versão do leitor" valor={`v${completo.leitor}`} />
            {completo.removidoEm && <Campo label="Removido na Centi em" valor={dataHoraBR(completo.removidoEm)} />}
          </dl>
        </div>
      )}
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold leading-snug text-text">{valor || "—"}</dd>
    </div>
  );
}
