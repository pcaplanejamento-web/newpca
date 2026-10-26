"use client";

import { useEffect, useMemo, useState } from "react";
import type { EmpenhoCompleto } from "@/lib/empenhos-tela";
import type { EmpenhoNaTela } from "@/lib/empenhos-tela-core";
import {
  type AbertoExecucao,
  type ConferenciaValor,
  conferirExecucao,
  type ExecucaoEmpenho,
  type LiquidacaoDoEmpenho,
  liquidacaoProvavel,
  type PagamentoDoEmpenho,
  tipoDaExecucao,
} from "@/lib/execucao-empenho-core";
import type { LiquidacaoCompleta } from "@/lib/liquidacoes-tela";
import type { PagamentoCompleto } from "@/lib/pagamentos-tela";
import { brl, dataBR, dataHoraBR, num } from "@/lib/format";
import { Badge } from "./Badge";
import { type Column, DataTable } from "./DataTable";
import { LiquidacaoDetalhe } from "./LiquidacaoDetalhe";
import { Modal, type ModalPainel } from "./Modal";
import { PagamentoDetalhe } from "./PagamentoDetalhe";
import { Skeleton } from "./Skeleton";
import { StatMini } from "./StatMini";

/**
 * Corpo de um `Modal`: UM empenho da Centi, SÓ LEITURA (os empenhos vêm da Centi — nada se edita na tela). O que a tabela
 * já tem aparece na hora (`empenho`); o histórico e o registro da importação chegam depois (`completo`; `undefined` =
 * carregando, `null` = não carregou). Espelha o `OrcamentoItemDetalhe`. A EXECUÇÃO (`execucao`, junto do registro) lista as
 * liquidações e os pagamentos do empenho e confere as somas com o liquidado e o pago que a Centi informa; tocar numa linha
 * (`onAbrir`) abre o detalhe dela no painel ao lado (`DetalheDaExecucao`), a linha `ativo` fica marcada.
 */
export function EmpenhoDetalhe({
  empenho,
  completo,
  execucao,
  onAbrir,
  ativo,
}: {
  empenho: EmpenhoNaTela;
  completo?: EmpenhoCompleto | null;
  execucao?: ExecucaoEmpenho | null;
  onAbrir?: (a: AbertoExecucao) => void;
  ativo?: AbertoExecucao | null;
}) {
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
        <Campo label="CPF/CNPJ" valor={empenho.cpfCnpj ?? completo?.cpfCnpj} />
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
        execucao && (execucao.liquidacoes || execucao.pagamentos) && <Execucao empenho={empenho} execucao={execucao} onAbrir={onAbrir} ativo={ativo} />
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
function Execucao({
  empenho,
  execucao,
  onAbrir,
  ativo,
}: {
  empenho: EmpenhoNaTela;
  execucao: ExecucaoEmpenho;
  onAbrir?: (a: AbertoExecucao) => void;
  ativo?: AbertoExecucao | null;
}) {
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
          ordemInicial={{ key: "data", dir: "desc" }}
          getKey={(l) => l.id}
          density="compact"
          onRowClick={onAbrir ? (item) => onAbrir({ tipo: "liquidacao", item }) : undefined}
          activeKey={ativo?.tipo === "liquidacao" ? ativo.item.id : null}
          exportar={{ nome: `Empenho ${empenho.numero} - liquidações` }}
          resumo={(l) => `${num(l.length)} ${l.length === 1 ? "liquidação" : "liquidações"} · ${brl(l.reduce((t, x) => t + x.valor - x.valorAnulado, 0))}`}
        />
      )}
      {conf.pago && <LinhaConferencia rotulo="Pagamentos" n={execucao.pagamentos?.length ?? 0} c={conf.pago} centi="pago" limite={execucao.limite} />}
      {execucao.pagamentos && execucao.pagamentos.length > 0 && (
        <DataTable
          columns={colunasPag}
          rows={execucao.pagamentos}
          ordemInicial={{ key: "data", dir: "desc" }}
          getKey={(p) => p.id}
          density="compact"
          onRowClick={onAbrir ? (item) => onAbrir({ tipo: "pagamento", item }) : undefined}
          activeKey={ativo?.tipo === "pagamento" ? ativo.item.id : null}
          exportar={{ nome: `Empenho ${empenho.numero} - pagamentos` }}
          resumo={(l) => `${num(l.length)} ${l.length === 1 ? "pagamento" : "pagamentos"} · ${brl(l.reduce((t, x) => t + (x.anulado ? 0 : x.valor), 0))}`}
        />
      )}
    </div>
  );
}

/**
 * Os PAINÉIS de um empenho para uma pilha de banners: o `EmpenhoDetalhe` com o que a tela já tem na hora (o histórico, o
 * registro e a EXECUÇÃO chegam de `GET /api/empenhos/[id]` — a guarda da tela Empenhos e o escopo valem) e, tocando numa
 * liquidação ou num pagamento, o detalhe dele AO LADO (`DetalheDaExecucao`). Usado pelo `EmpenhoBanner` e pela origem
 * dos números da Execução (o empenho entra ao lado da origem, na mesma pilha).
 */
export function usePaineisEmpenho(empenho: EmpenhoNaTela | null, onClose: () => void): { empenho: ModalPainel; execucao: ModalPainel } {
  const [completo, setCompleto] = useState<EmpenhoCompleto | null | undefined>(undefined);
  const [execucao, setExecucao] = useState<ExecucaoEmpenho | null>(null);
  const [lateral, setLateral] = useState<AbertoExecucao | null>(null);
  const id = empenho?.id ?? null;
  useEffect(() => {
    if (id == null) return;
    let vivo = true;
    setCompleto(undefined);
    setExecucao(null);
    setLateral(null);
    fetch(`/api/empenhos/${id}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; empenho?: EmpenhoCompleto; execucao?: ExecucaoEmpenho }>)
      .then((j) => {
        if (!vivo) return;
        setExecucao(j.ok ? (j.execucao ?? null) : null);
        setCompleto(j.ok && j.empenho ? j.empenho : null);
      })
      .catch(() => vivo && setCompleto(null));
    return () => {
      vivo = false;
    };
  }, [id]);
  return {
    empenho: {
      id: "empenho",
      aberto: empenho != null,
      titulo: empenho ? `Empenho ${empenho.numero}` : "Empenho",
      largura: 44,
      onClose,
      children: empenho ? <EmpenhoDetalhe key={empenho.id} empenho={empenho} completo={completo} execucao={execucao} onAbrir={setLateral} ativo={lateral} /> : <div />,
    },
    execucao: {
      id: "execucao",
      aberto: empenho != null && lateral != null,
      titulo: lateral ? tituloDaExecucao(lateral) : "Execução",
      largura: 36,
      onClose: () => setLateral(null),
      children: empenho && lateral ? <DetalheDaExecucao key={`${lateral.tipo}:${lateral.item.id}`} aberto={lateral} empenho={empenho} anoEmpenho={completo?.ano ?? null} /> : <div />,
    },
  };
}

/** O BANNER de um empenho (`Modal`): os painéis de `usePaineisEmpenho` — o empenho e, ao lado, a liquidação ou o pagamento.
 * O MESMO na tabela de empenhos. */
export function EmpenhoBanner({ empenho, onClose }: { empenho: EmpenhoNaTela | null; onClose: () => void }) {
  const p = usePaineisEmpenho(empenho, onClose);
  return (
    <Modal open={p.empenho.aberto} onClose={onClose} titulo={p.empenho.titulo} size="lg" lateral={p.execucao}>
      {p.empenho.children}
    </Modal>
  );
}

/** O título do painel ao lado do empenho. */
export const tituloDaExecucao = (a: AbertoExecucao) => (a.tipo === "liquidacao" ? `Liquidação ${a.item.numero ?? a.item.id}` : `Ordem de pagamento ${a.item.id}`);

/**
 * O painel ao lado do empenho: a liquidação ou o pagamento aberto na Execução, nos MESMOS `LiquidacaoDetalhe`/
 * `PagamentoDetalhe` das abas do card. Os valores aparecem na hora (a linha da execução); o credor, o histórico e o registro
 * chegam pela rota do card em que a linha mora (a guarda da tela do card vale).
 */
export function DetalheDaExecucao({ aberto, empenho, anoEmpenho }: { aberto: AbertoExecucao; empenho: EmpenhoNaTela; anoEmpenho: number | null }) {
  const [completo, setCompleto] = useState<LiquidacaoCompleta | PagamentoCompleto | null | undefined>(undefined);
  const rota = `/api/empenhos/cards/${aberto.item.cardId}/${aberto.tipo === "liquidacao" ? "liquidacoes" : "pagamentos"}/${aberto.item.id}`;
  useEffect(() => {
    let vivo = true;
    setCompleto(undefined);
    fetch(rota)
      .then((r) => r.json() as Promise<{ ok?: boolean; liquidacao?: LiquidacaoCompleta; pagamento?: PagamentoCompleto }>)
      .then((j) => vivo && setCompleto(j.ok ? (j.liquidacao ?? j.pagamento ?? null) : null))
      .catch(() => vivo && setCompleto(null));
    return () => {
      vivo = false;
    };
  }, [rota]);
  const comum = {
    data: aberto.item.data,
    numeroEmpenho: empenho.numero,
    anoEmpenho,
    tipo: tipoDaExecucao(empenho.numero, anoEmpenho, aberto.item.data, aberto.item.ano),
    credor: completo?.credor ?? null,
    cpfCnpj: completo?.cpfCnpj ?? null,
    historico: completo?.historico ?? null,
    orgaoCenti: completo?.orgaoCenti ?? "",
    orgao: completo?.orgao ?? null,
    unidade: completo?.unidade ?? null,
  };
  if (aberto.tipo === "liquidacao") {
    const l = aberto.item;
    const c = completo as LiquidacaoCompleta | null | undefined;
    return (
      <LiquidacaoDetalhe
        liquidacao={{ ...comum, numero: l.numero, valor: l.valor, valorAnulado: l.valorAnulado, valorLiquido: l.valorLiquido, valorPago: l.valorPago, saldo: c?.saldo ?? l.valorLiquido - l.valorPago }}
        completo={c}
      />
    );
  }
  const p = aberto.item;
  const c = completo as PagamentoCompleto | null | undefined;
  return (
    <PagamentoDetalhe
      pagamento={{ ...comum, id: p.id, valor: p.valor, valorRetencao: p.valorRetencao, valorLiquido: p.valorLiquido, anulado: p.anulado, motivoAnulacao: c?.motivoAnulacao ?? null }}
      completo={c}
    />
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
