"use client";

import { rotuloTipoExecucao, type TipoExecucao } from "@/lib/execucao-empenho-core";
import { brl, dataBR, dataHoraBR } from "@/lib/format";
import type { EmpenhoDaLiquidacao, LiquidacaoCompleta } from "@/lib/liquidacoes-tela";
import type { AlteracaoCenti } from "@/lib/centi-alteracoes-core";
import { Badge } from "./Badge";
import { DiffLinha } from "./ComparacaoReenvio";
import { Callout } from "./Callout";
import { Skeleton } from "./Skeleton";
import { StatMini } from "./StatMini";

/** O que a tabela já tem de uma liquidação (aparece na hora, antes do registro completo). */
export type LiquidacaoNaTela = {
  numero: string | null;
  data: string | null;
  numeroEmpenho: string;
  anoEmpenho: number | null;
  /** Nota de Empenho × Restos a Pagar (`tipoDaExecucao`). */
  tipo: TipoExecucao;
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
        <CampoTipo tipo={l.tipo} />
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

      <EmpenhoLigado empenho={completo === undefined ? undefined : completo === null ? null : (completo.empenho ?? false)} numero={l.numeroEmpenho} oQue="a liquidação" />

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

      {completo && <AlteracoesCenti alteracoes={completo.alteracoes} ausente={completo.ausenteDesdeLote} />}
    </div>
  );
}

/**
 * O HISTÓRICO DAS ALTERAÇÕES da Centi — o MESMO bloco nos banners do empenho, da liquidação e do pagamento: o selo do
 * registro AUSENTE na última importação (continua valendo até a próxima confirmar) e, recolhível, cada alteração com a data, a
 * importação e os campos antes → depois (`DiffLinha` compacto). Sem nada, não aparece.
 */
export function AlteracoesCenti({ alteracoes, ausente }: { alteracoes: AlteracaoCenti[]; ausente: number | null }) {
  if (alteracoes.length === 0 && ausente == null) return null;
  return (
    <details className="group rounded-card border border-border p-[var(--pad-card)]" open={ausente != null}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 lg:min-h-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-faint">Alterações na Centi</span>
        <Badge tone="slate">{alteracoes.length}</Badge>
        {ausente != null && (
          <Badge tone="amber" title={`Não veio na importação nº ${ausente}; se não vier na próxima, vale a regra dos removidos.`}>
            Ausente na última leitura
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted group-open:hidden">Ver</span>
      </summary>
      <ol className="mt-3 space-y-3">
        {alteracoes.map((a) => (
          <li key={a.id} className="space-y-1.5 border-t border-border pt-3 first:border-t-0 first:pt-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
              <Badge tone={a.acao === "removido" ? "red" : a.acao === "ausente" ? "amber" : a.acao === "restaurado" ? "emerald" : "blue"}>{a.rotulo}</Badge>
              <span className="text-muted">
                {dataHoraBR(a.em)}
                {a.loteId ? ` · importação nº ${a.loteId}` : ""}
              </span>
            </p>
            {a.campos.map((d) => (
              <DiffLinha key={d.campo} d={d} compacto rotulos={["Antes", "Depois"]} />
            ))}
          </li>
        ))}
      </ol>
    </details>
  );
}

/**
 * O EMPENHO ligado pelo NÚMERO (de qualquer ano) — o MESMO bloco nos banners da liquidação e do pagamento. `empenho`:
 * `undefined` = carregando, `null` = não carregou, `false` = nenhum empenho com o número no sistema.
 */
export function EmpenhoLigado({ empenho: e, numero, oQue }: { empenho: EmpenhoDaLiquidacao | false | null | undefined; numero: string; oQue: string }) {
  return (
    <div className="rounded-card border border-border p-[var(--pad-card)]">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Empenho ligado (pelo número)</p>
      {e === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : e === null ? (
        <p className="text-sm text-muted">Não foi possível carregar o empenho.</p>
      ) : !e ? (
        <Callout kind="warn">
          Nenhum empenho nº {numero} importado no sistema (de nenhum ano). Importe o ano dele num card de empenhos — {oQue} passa a seguir o
          órgão e a unidade dele.
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
  );
}

/** Um campo de um banner de detalhe (rótulo + valor; vazio = "—"). */
/**
 * O TIPO de uma liquidação ou de um pagamento (`tipoDaExecucao`): Nota de Empenho (azul), Restos a Pagar (âmbar; o
 * presumido — o empenho não está no sistema — com "*") ou o ERRO (vermelho). O motivo vai na dica.
 */
export function SeloTipoExecucao({ tipo }: { tipo: TipoExecucao }) {
  const tom = tipo.tipo === "ne" ? "blue" : tipo.tipo === "rp" ? "amber" : "red";
  return (
    <Badge tone={tom} title={tipo.motivo} className="whitespace-nowrap">
      {rotuloTipoExecucao(tipo)}
      {tipo.presumido ? "*" : ""}
    </Badge>
  );
}

/** O campo "Tipo" dos banners de liquidação e de pagamento (o selo + o motivo). */
export function CampoTipo({ tipo }: { tipo: TipoExecucao }) {
  return (
    <div>
      <dt className="text-xs text-muted">Tipo</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-2 leading-snug">
        <SeloTipoExecucao tipo={tipo} />
        <span className="text-xs text-muted">{tipo.motivo}</span>
      </dd>
    </div>
  );
}

export function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold leading-snug text-text">{valor || "—"}</dd>
    </div>
  );
}
