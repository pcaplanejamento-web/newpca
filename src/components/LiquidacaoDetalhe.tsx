"use client";

import { brl, dataBR, dataHoraBR } from "@/lib/format";
import type { LiquidacaoCompleta } from "@/lib/liquidacoes-tela";
import { Callout } from "./Callout";
import { Skeleton } from "./Skeleton";
import { StatMini } from "./StatMini";

/** O que a tabela já tem de uma liquidação (aparece na hora, antes do registro completo). */
export type LiquidacaoNaTela = {
  numero: string | null;
  data: string | null;
  numeroEmpenho: string;
  anoEmpenho: number | null;
  credor: string | null;
  cpfCnpj: string | null;
  historico: string | null;
  valor: number;
  valorAnulado: number;
  valorLiquido: number;
  valorPago: number;
  saldo: number;
  orgaoCenti: string;
  orgao: string | null;
  unidade: string | null;
};

/**
 * Corpo de um `Modal`: UMA liquidação da Centi, SÓ LEITURA, com o EMPENHO ligado pelo número (de qualquer ano). O que a tabela já
 * tem aparece na hora (`liquidacao`); o registro e o empenho chegam depois (`completo`; `undefined` = carregando, `null` = não
 * carregou). Espelha o `EmpenhoDetalhe`.
 */
export function LiquidacaoDetalhe({ liquidacao: l, completo }: { liquidacao: LiquidacaoNaTela; completo?: LiquidacaoCompleta | null }) {
  const e = completo?.empenho;
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-[var(--gap-block)]">
        <StatMini label="Valor" value={brl(l.valor)} tone="accent" />
        <StatMini label="Anulado" value={brl(l.valorAnulado)} tone={l.valorAnulado ? "warn" : "default"} />
        <StatMini label="Líquido" value={brl(l.valorLiquido)} />
        <StatMini label="Pago" value={brl(l.valorPago)} tone="ok" />
        <StatMini label="Saldo" value={brl(l.saldo)} />
      </div>

      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Campo label="Data" valor={dataBR(l.data) || "—"} />
        <Campo label="Nº da liquidação" valor={l.numero} />
        <Campo label="Nº do empenho" valor={l.numeroEmpenho} />
        <Campo label="Ano do empenho" valor={l.anoEmpenho != null ? String(l.anoEmpenho) : "Empenho não importado"} />
        <Campo label="Órgão (cadastro)" valor={completo?.orgao ?? l.orgao} />
        <Campo label="Unidade (cadastro)" valor={completo?.unidade ?? l.unidade} />
        <Campo label="Órgão (Centi)" valor={completo ? `${completo.orgaoCenti || "—"} · ID ${completo.idOrgaoCenti}` : l.orgaoCenti} />
        <Campo label="Credor" valor={l.credor} />
        <Campo label="CPF/CNPJ" valor={l.cpfCnpj} />
      </dl>

      <div className="rounded-card border border-border p-[var(--pad-card)]">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Histórico</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text">{l.historico || "Sem histórico."}</p>
      </div>

      <div className="rounded-card border border-border p-[var(--pad-card)]">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Empenho ligado (pelo número)</p>
        {completo === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : completo === null ? (
          <p className="text-sm text-muted">Não foi possível carregar o empenho.</p>
        ) : !e ? (
          <Callout kind="warn">
            Nenhum empenho nº {l.numeroEmpenho} importado no sistema (de nenhum ano). Importe o ano dele num card de empenhos — a
            liquidação passa a seguir o órgão e a unidade dele.
          </Callout>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-[var(--gap-block)]">
              <StatMini label="Empenhado" value={brl(e.valorEmpenhado)} />
              <StatMini label="Liquidado" value={brl(e.valorLiquidado)} />
              <StatMini label="Pago" value={brl(e.valorPago)} tone="ok" />
              <StatMini label="A pagar" value={brl(e.saldoPagar)} />
            </div>
            <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              <Campo label="Empenho" valor={`nº ${e.numero} · ${e.ano}`} />
              <Campo label="Data" valor={dataBR(e.data) || "—"} />
              <Campo label="Órgão gestor" valor={e.orgaoGestor} />
              <Campo label="Unidade orçamentária" valor={e.unidadeOrcamentaria} />
              <Campo label="Fornecedor" valor={e.fornecedor} />
              <Campo label="Ação" valor={e.acao} />
              <Campo label="Elemento" valor={e.elemento} />
              <Campo label="Fonte de recurso" valor={e.fonte} />
              <Campo label="Card de empenhos" valor={e.card} />
              {e.removidoEm && <Campo label="Removido na Centi em" valor={dataHoraBR(e.removidoEm)} />}
            </dl>
          </div>
        )}
      </div>

      {completo && (
        <div className="rounded-card border border-border bg-surface-2 p-[var(--pad-card)]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Registro</p>
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            <Campo label="Id na Centi" valor={completo.srcId != null ? String(completo.srcId) : null} />
            <Campo label="Ano da importação" valor={String(completo.ano)} />
            <Campo label="Importado em" valor={dataHoraBR(completo.criadoEm)} />
            <Campo label="Atualizado em" valor={dataHoraBR(completo.atualizadoEm)} />
            <Campo label="Importação" valor={completo.loteId ? `nº ${completo.loteId}${completo.loteConcluidoEm ? ` · ${dataHoraBR(completo.loteConcluidoEm)}` : ""}` : "excluída do histórico"} />
            <Campo label="Versão do leitor" valor={`v${completo.leitor}`} />
            {completo.removidoEm && <Campo label="Removida na Centi em" valor={dataHoraBR(completo.removidoEm)} />}
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
