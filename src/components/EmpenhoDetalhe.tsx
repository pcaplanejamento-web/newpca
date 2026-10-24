"use client";

import { useMemo } from "react";
import type { EmpenhoCompleto } from "@/lib/empenhos-tela";
import type { EmpenhoNaTela } from "@/lib/empenhos-tela-core";
import { type ConferenciaValor, conferirExecucao, type ExecucaoEmpenho, type LiquidacaoDoEmpenho, liquidacaoProvavel, type PagamentoDoEmpenho } from "@/lib/execucao-empenho-core";
import { brl, dataBR, dataHoraBR, num } from "@/lib/format";
import { Badge } from "./Badge";
import { type Column, DataTable } from "./DataTable";
import { Skeleton } from "./Skeleton";
import { StatMini } from "./StatMini";

/**
 * Corpo de um `Modal`: UM empenho da Centi, SÓ LEITURA (os empenhos vêm da Centi — nada se edita na tela). O que a tabela
 * já tem aparece na hora (`empenho`); o histórico e o registro da importação chegam depois (`completo`; `undefined` =
 * carregando, `null` = não carregou). Espelha o `OrcamentoItemDetalhe`. A EXECUÇÃO (`execucao`, junto do registro) lista as
 * liquidações e os pagamentos do empenho e confere as somas com o liquidado e o pago que a Centi informa.
 */
export function EmpenhoDetalhe({ empenho, completo, execucao }: { empenho: EmpenhoNaTela; completo?: EmpenhoCompleto | null; execucao?: ExecucaoEmpenho | null }) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-[var(--gap-block)]">
        <StatMini label="Empenhado" value={brl(empenho.valorEmpenhado)} tone="accent" />
        <StatMini label="Anulado" value={brl(empenho.valorAnulado)} tone={empenho.valorAnulado ? "warn" : "default"} />
        <StatMini label="Liquidado" value={brl(empenho.valorLiquidado)} />
        <StatMini label="Pago" value={brl(empenho.valorPago)} tone="ok" />
        <StatMini label="A pagar" value={brl(empenho.saldoPagar)} />
      </div>

      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Campo label="Data" valor={dataBR(empenho.data) || "—"} />
        <Campo label="Unidade (cadastro)" valor={empenho.unidade} />
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

      {completo === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        execucao && (execucao.liquidacoes || execucao.pagamentos) && <Execucao empenho={empenho} execucao={execucao} />
      )}

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
            <Campo label="Ano do empenho" valor={String(completo.ano)} />
            <Campo label="Id na Centi" valor={completo.srcId != null ? String(completo.srcId) : null} />
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

const COLUNAS_LIQ: Column<LiquidacaoDoEmpenho>[] = [
  { key: "data", header: "Data", filter: "date", nowrap: true, value: (l) => l.data ?? "", render: (l) => dataBR(l.data) || "—" },
  { key: "numero", header: "Nº", nowrap: true, value: (l) => l.numero ?? "", render: (l) => l.numero || "—" },
  { key: "valor", header: "Valor", align: "right", filter: "range", nowrap: true, numero: (l) => l.valor, value: (l) => String(l.valor), render: (l) => brl(l.valor) },
  { key: "anulado", header: "Anulado", align: "right", filter: "range", nowrap: true, numero: (l) => l.valorAnulado, value: (l) => String(l.valorAnulado), render: (l) => brl(l.valorAnulado) },
  { key: "pago", header: "Pago", align: "right", filter: "range", nowrap: true, numero: (l) => l.valorPago, value: (l) => String(l.valorPago), render: (l) => brl(l.valorPago) },
];

/** As liquidações e os pagamentos do empenho, com a conferência das somas (só as listas que a pessoa vê). */
function Execucao({ empenho, execucao }: { empenho: EmpenhoNaTela; execucao: ExecucaoEmpenho }) {
  const conf = conferirExecucao(empenho, execucao);
  const provavel = useMemo(() => liquidacaoProvavel(execucao.liquidacoes ?? [], execucao.pagamentos ?? []), [execucao]);
  const colunasPag = useMemo<Column<PagamentoDoEmpenho>[]>(
    () => [
      { key: "data", header: "Data", filter: "date", nowrap: true, value: (p) => p.data ?? "", render: (p) => dataBR(p.data) || "—" },
      { key: "ordem", header: "Ordem", nowrap: true, total: false, value: (p) => String(p.srcId ?? ""), render: (p) => p.srcId ?? "—" },
      { key: "valor", header: "Valor", align: "right", filter: "range", nowrap: true, numero: (p) => p.valor, value: (p) => String(p.valor), render: (p) => brl(p.valor) },
      { key: "retencao", header: "Retenção", align: "right", filter: "range", nowrap: true, numero: (p) => p.valorRetencao, value: (p) => String(p.valorRetencao), render: (p) => brl(p.valorRetencao) },
      { key: "liquido", header: "Líquido", align: "right", filter: "range", nowrap: true, numero: (p) => p.valorLiquido, value: (p) => String(p.valorLiquido), render: (p) => brl(p.valorLiquido) },
      {
        key: "situacao",
        header: "Situação",
        nowrap: true,
        value: (p) => (p.anulado ? "Anulado" : "Vigente"),
        render: (p) => (p.anulado ? <Badge tone="red">Anulado</Badge> : <Badge tone="emerald">Vigente</Badge>),
      },
      ...(execucao.liquidacoes
        ? [
            {
              key: "liquidacao",
              header: "Liquidação provável",
              nowrap: true,
              value: (p: PagamentoDoEmpenho) => provavel.get(p.id)?.numero ?? "—",
              render: (p: PagamentoDoEmpenho) => {
                const l = provavel.get(p.id);
                return l ? <span title={`Mesmo valor, de ${dataBR(l.data) || "data desconhecida"} — indicação, não registro da Centi`}>{l.numero || "—"}</span> : <span className="text-faint">—</span>;
              },
            } satisfies Column<PagamentoDoEmpenho>,
          ]
        : []),
    ],
    [execucao.liquidacoes, provavel],
  );
  return (
    <div className="space-y-[var(--gap-block)] rounded-card border border-border p-[var(--pad-card)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-faint">Execução</p>
      {conf.liquidado && <LinhaConferencia rotulo="Liquidações" n={execucao.liquidacoes?.length ?? 0} c={conf.liquidado} centi="liquidado" limite={execucao.limite} />}
      {execucao.liquidacoes && execucao.liquidacoes.length > 0 && (
        <DataTable
          columns={COLUNAS_LIQ}
          rows={execucao.liquidacoes}
          getKey={(l) => l.id}
          density="compact"
          exportar={{ nome: `Empenho ${empenho.numero} - liquidações` }}
          resumo={(l) => `${num(l.length)} ${l.length === 1 ? "liquidação" : "liquidações"} · ${brl(l.reduce((t, x) => t + x.valor - x.valorAnulado, 0))}`}
        />
      )}
      {conf.pago && <LinhaConferencia rotulo="Pagamentos" n={execucao.pagamentos?.length ?? 0} c={conf.pago} centi="pago" limite={execucao.limite} />}
      {execucao.pagamentos && execucao.pagamentos.length > 0 && (
        <DataTable
          columns={colunasPag}
          rows={execucao.pagamentos}
          getKey={(p) => p.id}
          density="compact"
          exportar={{ nome: `Empenho ${empenho.numero} - pagamentos` }}
          resumo={(l) => `${num(l.length)} ${l.length === 1 ? "pagamento" : "pagamentos"} · ${brl(l.reduce((t, x) => t + (x.anulado ? 0 : x.valor), 0))}`}
        />
      )}
    </div>
  );
}

/** "12 liquidações · Σ R$ X — confere com o liquidado" (verde) ou a diferença (âmbar), com o motivo provável. */
function LinhaConferencia({ rotulo, n, c, centi, limite }: { rotulo: string; n: number; c: ConferenciaValor; centi: string; limite: number }) {
  const cortado = n >= limite;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="font-semibold text-text">
        {rotulo} ({num(n)}{cortado ? "+" : ""})
      </span>
      <span className="tabular-nums text-muted">Σ {brl(c.soma)}</span>
      {c.confere ? (
        <Badge tone="emerald">Confere com o {centi}</Badge>
      ) : (
        <Badge tone="amber" title={`A Centi informa ${brl(c.centi)} ${centi}. A diferença costuma vir de lançamentos em anos que o card não importa, ou removidos na Centi.`}>
          {c.diferenca > 0 ? "Acima" : "Abaixo"} do {centi} em {brl(Math.abs(c.diferenca))}
        </Badge>
      )}
      {cortado && <span className="text-xs text-faint">Mostrando os primeiros {num(limite)}.</span>}
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
