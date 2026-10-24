"use client";

import { brl, dataBR, dataHoraBR } from "@/lib/format";
import type { PagamentoCompleto } from "@/lib/pagamentos-tela";
import { Callout } from "./Callout";
import { Campo, EmpenhoLigado } from "./LiquidacaoDetalhe";
import { StatMini } from "./StatMini";

/** O que a tabela já tem de um pagamento (aparece na hora, antes do registro completo). */
export type PagamentoNaTela = {
  id: number;
  data: string | null;
  numeroEmpenho: string;
  anoEmpenho: number | null;
  credor: string | null;
  cpfCnpj: string | null;
  historico: string | null;
  valor: number;
  valorRetencao: number;
  valorLiquido: number;
  anulado: boolean;
  motivoAnulacao: string | null;
  orgaoCenti: string;
  orgao: string | null;
  unidade: string | null;
};

/**
 * Corpo de um `Modal`: UM pagamento (ordem de pagamento) da Centi, SÓ LEITURA, com o EMPENHO ligado pelo número (de qualquer
 * ano — o mesmo bloco do banner da liquidação, `EmpenhoLigado`). O que a tabela já tem aparece na hora (`pagamento`); o registro
 * e o empenho chegam depois (`completo`; `undefined` = carregando, `null` = não carregou).
 */
export function PagamentoDetalhe({ pagamento: p, completo }: { pagamento: PagamentoNaTela; completo?: PagamentoCompleto | null }) {
  return (
    <div className="space-y-[var(--gap-block)]">
      {p.anulado && (
        <Callout kind="warn">
          <p className="font-semibold">Ordem de pagamento anulada</p>
          <p>{p.motivoAnulacao || "A Centi não informou o motivo."} Fica guardada, fora das somas do pago.</p>
        </Callout>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-[var(--gap-block)]">
        <StatMini label="Valor da ordem" value={brl(p.valor)} tone="accent" />
        <StatMini label="Retenção" value={brl(p.valorRetencao)} tone={p.valorRetencao ? "warn" : "default"} />
        <StatMini label="Pago líquido" value={brl(p.valorLiquido)} tone={p.anulado ? "danger" : "ok"} />
      </div>

      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Campo label="Data" valor={dataBR(p.data) || "—"} />
        <Campo label="Ordem de pagamento" valor={String(p.id)} />
        <Campo label="Nº do empenho" valor={p.numeroEmpenho} />
        <Campo label="Ano do empenho" valor={p.anoEmpenho != null ? String(p.anoEmpenho) : "Empenho não importado"} />
        <Campo label="Órgão (cadastro)" valor={completo?.orgao ?? p.orgao} />
        <Campo label="Unidade (cadastro)" valor={completo?.unidade ?? p.unidade} />
        <Campo label="Órgão (Centi)" valor={completo ? `${completo.orgaoCenti || "—"} · ID ${completo.idOrgaoCenti}` : p.orgaoCenti} />
        <Campo label="Credor" valor={p.credor} />
        <Campo label="CPF/CNPJ" valor={p.cpfCnpj} />
      </dl>

      <div className="rounded-card border border-border p-[var(--pad-card)]">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Histórico</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text">{p.historico || "Sem histórico."}</p>
      </div>

      <EmpenhoLigado empenho={completo === undefined ? undefined : completo === null ? null : (completo.empenho ?? false)} numero={p.numeroEmpenho} oQue="o pagamento" />

      {completo && (
        <div className="rounded-card border border-border bg-surface-2 p-[var(--pad-card)]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Registro</p>
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            <Campo label="Id na Centi (ordem)" valor={completo.srcId != null ? String(completo.srcId) : null} />
            <Campo label="Ano da importação" valor={String(completo.ano)} />
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
