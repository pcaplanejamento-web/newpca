"use client";

import { useMemo, useState } from "react";
import { conferirPedido, FINALIDADES, type Finalidade, type ItemDeclaravel, LIMITES_DECLARACAO, saldoDe } from "@/lib/declaracoes-core";
import { brl, num } from "@/lib/format";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { NumInput } from "./CampoCadeado";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { colunasItemDeclaracao } from "./DeclaracoesPca";
import { SelectField, TextArea, TextField } from "./Field";
import { Modal } from "./Modal";
import { toast } from "./Toast";

/**
 * NOVA DECLARAÇÃO: a finalidade (+ o processo e a observação) e os itens com SALDO — marcar o item já propõe o saldo
 * inteiro; a quantidade pode ser menor (declaração PARCIAL). A conta e as recusas são as MESMAS do servidor
 * (`conferirPedido`); emitir confirma antes (depois, só cancelando).
 */
export function NovaDeclaracao({
  pcaId,
  itens,
  onFechar,
  onEmitida,
}: {
  pcaId: number;
  itens: ItemDeclaravel[];
  onFechar: () => void;
  onEmitida: (id: number) => void;
}) {
  const [finalidade, setFinalidade] = useState<Finalidade>("inicio");
  const [finalidadeTexto, setFinalidadeTexto] = useState("");
  const [processo, setProcesso] = useState("");
  const [observacao, setObservacao] = useState("");
  const [qtd, setQtd] = useState<Map<number, number | null>>(new Map());
  const [gravando, setGravando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const disponiveis = useMemo(() => itens.filter((i) => saldoDe(i) > 0), [itens]);
  const esgotados = itens.length - disponiveis.length;
  const selecionados = useMemo(() => new Set(qtd.keys()), [qtd]);
  const pedido = useMemo(() => [...qtd].map(([sequencial, q]) => ({ sequencial, quantidade: q ?? 0 })), [qtd]);
  const conf = useMemo(() => conferirPedido(pedido, itens), [pedido, itens]);
  const total = conf.linhas.reduce((s, l) => s + l.valorTotal, 0);
  const faltaTexto = finalidade === "outra" && !finalidadeTexto.trim();
  const motivo = pedido.length === 0 ? "Marque os itens a declarar." : (conf.erros[0] ?? (faltaTexto ? "Descreva a finalidade." : null));

  function marcar(s: Set<string | number>) {
    setQtd((ant) => {
      const novo = new Map<number, number | null>();
      for (const k of s) {
        const seq = Number(k);
        const it = disponiveis.find((i) => i.sequencial === seq);
        if (it) novo.set(seq, ant.has(seq) ? (ant.get(seq) ?? null) : saldoDe(it));
      }
      return novo;
    });
  }

  const colunas: Column<ItemDeclaravel>[] = [
    ...colunasItemDeclaracao<ItemDeclaravel>(),
    { key: "qpca", header: "Qtd. PCA", align: "right", nowrap: true, filter: "range", numero: (r) => r.quantidade, formatarFaixa: num, total: false, render: (r) => num(r.quantidade) },
    { key: "dec", header: "Já declarado", align: "right", nowrap: true, filter: "range", numero: (r) => r.declarado, formatarFaixa: num, total: false, render: (r) => (r.declarado ? num(r.declarado) : <span className="text-faint">—</span>) },
    { key: "saldo", header: "Saldo", align: "right", nowrap: true, filter: "range", numero: (r) => saldoDe(r), formatarFaixa: num, total: false, render: (r) => <span className="font-medium tabular-nums">{num(saldoDe(r))}</span> },
    {
      key: "declarar",
      header: "A declarar",
      align: "right",
      filter: "none",
      total: false,
      minWidth: 120,
      render: (r) => {
        const q = qtd.get(r.sequencial);
        const parcial = q != null && q > 0 && q < Number(r.quantidade ?? 0);
        return (
          <div className="flex items-center justify-end gap-1.5" role="none" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {parcial && <Badge tone="amber">Parcial</Badge>}
            <div className="w-24">
              <NumInput
                autoFoco={false}
                rotulo={`Quantidade a declarar do item ${r.sequencial}`}
                valor={q ?? null}
                onChange={(v) =>
                  setQtd((ant) => {
                    const novo = new Map(ant);
                    novo.set(r.sequencial, v);
                    return novo;
                  })
                }
              />
            </div>
          </div>
        );
      },
    },
  ];

  async function emitir() {
    if (motivo) return;
    const ok = await confirmar({
      titulo: `Emitir a declaração de ${num(conf.linhas.length)} item(ns)?`,
      texto: `${brl(total)} · ${FINALIDADES.find((f) => f.id === finalidade)?.rotulo}. Depois de emitida, só pode ser cancelada.`,
      confirmar: "Emitir",
    });
    if (!ok) return;
    setGravando(true);
    try {
      const r = await fetch(`/api/pca/${pcaId}/declaracoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalidade, finalidadeTexto: finalidadeTexto || null, processo: processo || null, observacao: observacao || null, itens: pedido }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; declaracao?: { id: number; rotulo: string } };
      if (!r.ok || !j.ok || !j.declaracao) throw new Error(j.error ?? "Não consegui emitir a declaração.");
      toast.success(`Declaração ${j.declaracao.rotulo} emitida.`);
      onEmitida(j.declaracao.id);
    } catch (e) {
      toast.error((e as Error).message);
      setGravando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onFechar}
      bloqueado={gravando}
      size="full"
      titulo="Nova declaração"
      rodape={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[13px]">
            <span className="font-medium tabular-nums text-text">
              {num(conf.linhas.length)} item(ns) · {brl(total)}
            </span>
            {motivo && pedido.length > 0 && <span className="ml-2 text-danger">{motivo}</span>}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onFechar} disabled={gravando}>
              Cancelar
            </Button>
            <Button size="sm" loading={gravando} disabled={!!motivo} title={motivo ?? undefined} onClick={emitir}>
              Emitir declaração
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField label="Finalidade" value={finalidade} onChange={(e) => setFinalidade(e.target.value as Finalidade)}>
            {FINALIDADES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </SelectField>
          {finalidade === "outra" && (
            <TextField label="Qual finalidade" value={finalidadeTexto} maxLength={LIMITES_DECLARACAO.finalidadeTexto} onChange={(e) => setFinalidadeTexto(e.target.value)} placeholder="Ex.: renovação de contrato" />
          )}
          <TextField label="Processo / empenho de referência" value={processo} maxLength={LIMITES_DECLARACAO.processo} onChange={(e) => setProcesso(e.target.value)} placeholder="Opcional" />
          <div className="sm:col-span-2 lg:col-span-3">
            <TextArea label="Observação" rows={2} value={observacao} maxLength={LIMITES_DECLARACAO.observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional — sai no PDF" />
          </div>
        </div>
        <DataTable
          columns={colunas}
          rows={disponiveis}
          getKey={(i) => i.sequencial}
          selectable
          selected={selecionados}
          onSelected={marcar}
          density="compact"
          exportar={false}
          resumo={(ls) => `${num(ls.length)} item(ns) com saldo${esgotados ? ` · ${num(esgotados)} já declarado(s) por inteiro` : ""}`}
          vazio="Nenhum item com saldo para declarar."
        />
      </div>
      {confirmacao}
    </Modal>
  );
}
