"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { type ConteudoDeclaracao, conferirPedido, FINALIDADES, type Finalidade, type ItemDeclaravel, itensParaEdicao, LIMITES_DECLARACAO, saldoDe } from "@/lib/declaracoes-core";
import { brl, num } from "@/lib/format";
import { parseNumberBR } from "@/lib/normalize";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { fmtNumEdit } from "./CampoCadeado";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { colunasItemDeclaracao } from "./DeclaracoesPca";
import { EditorRico } from "./EditorRico";
import { SelectField, TextField } from "./Field";
import { cellCls } from "./formStyles";
import { Modal } from "./Modal";
import { toast } from "./Toast";

/** A declaração a EDITAR (ainda não exportada): o id, o rótulo e o retrato atual. */
export type EdicaoDeclaracao = { id: number; rotulo: string; conteudo: ConteudoDeclaracao };

/**
 * A quantidade a declarar de UM item (célula da tabela): o rascunho é LOCAL e só vai à declaração ao sair do campo ou com
 * Enter — digitar não redesenha a tabela inteira (leve com centenas de itens à vista).
 */
const CampoQuantidade = memo(function CampoQuantidade({ seq, valor, onMudar }: { seq: number; valor: number | null; onMudar: (seq: number, v: number | null) => void }) {
  const [raw, setRaw] = useState(() => fmtNumEdit(valor));
  const [base, setBase] = useState(valor);
  if (valor !== base) {
    setBase(valor);
    setRaw(fmtNumEdit(valor));
  }
  const gravar = () => {
    const v = parseNumberBR(raw);
    if (v !== valor) onMudar(seq, v);
  };
  return (
    <input
      aria-label={`Quantidade a declarar do item ${seq}`}
      className={`${cellCls} !w-24 shrink-0 text-right tabular-nums`}
      inputMode="decimal"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={gravar}
      onKeyDown={(e) => {
        if (e.key === "Enter") gravar();
      }}
    />
  );
});

/**
 * NOVA ou EDITAR declaração (a mesma tela): a finalidade, o processo, a observação (o editor de texto do sistema) e os itens
 * com SALDO — marcar o item já propõe o saldo inteiro; a quantidade pode ser menor (declaração PARCIAL). A conta e as
 * recusas são as MESMAS do servidor (`conferirPedido`). Na edição, o saldo conta sem o que a própria declaração declara.
 */
export function NovaDeclaracao({
  pcaId,
  itens,
  edicao,
  onFechar,
  onGravada,
}: {
  pcaId: number;
  itens: ItemDeclaravel[];
  edicao?: EdicaoDeclaracao;
  onFechar: () => void;
  onGravada: (id: number) => void;
}) {
  const c = edicao?.conteudo;
  const base = useMemo(() => (c ? itensParaEdicao(itens, c.linhas) : itens), [itens, c]);
  const disponiveis = useMemo(() => base.filter((i) => saldoDe(i) > 0), [base]);
  const porSeq = useMemo(() => new Map(disponiveis.map((i) => [i.sequencial, i])), [disponiveis]);
  const [finalidade, setFinalidade] = useState<Finalidade>(c?.finalidade ?? "inicio");
  const [finalidadeTexto, setFinalidadeTexto] = useState(c?.finalidadeTexto ?? "");
  const [processo, setProcesso] = useState(c?.processo ?? "");
  const [observacao, setObservacao] = useState(c?.observacao ?? "");
  // Os itens que a declaração tinha e que não estão mais no PCA (ou sem saldo) saem ao gravar — avisados.
  const [qtd, setQtd] = useState<Map<number, number | null>>(() => new Map((c?.linhas ?? []).filter((l) => porSeq.has(l.sequencial)).map((l) => [l.sequencial, l.quantidade])));
  const fora = useMemo(() => (c?.linhas ?? []).filter((l) => !porSeq.has(l.sequencial)).map((l) => l.sequencial), [c, porSeq]);
  const [gravando, setGravando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const selecionados = useMemo(() => new Set(qtd.keys()), [qtd]);
  const pedido = useMemo(() => [...qtd].map(([sequencial, q]) => ({ sequencial, quantidade: q ?? 0 })), [qtd]);
  const conf = useMemo(() => conferirPedido(pedido, base), [pedido, base]);
  const total = conf.linhas.reduce((s, l) => s + l.valorTotal, 0);
  const parciais = conf.linhas.filter((l) => l.parcial).length;
  const motivo = pedido.length === 0 ? "Marque os itens a declarar." : (conf.erros[0] ?? (finalidade === "outra" && !finalidadeTexto.trim() ? "Descreva a finalidade." : null));

  const marcar = useCallback(
    (s: Set<string | number>) =>
      setQtd((ant) => {
        const novo = new Map<number, number | null>();
        for (const k of s) {
          const it = porSeq.get(Number(k));
          if (it) novo.set(it.sequencial, ant.has(it.sequencial) ? (ant.get(it.sequencial) ?? null) : saldoDe(it));
        }
        return novo;
      }),
    [porSeq],
  );
  const mudarQtd = useCallback((seq: number, v: number | null) => setQtd((ant) => (ant.has(seq) ? new Map(ant).set(seq, v) : ant)), []);

  const colunas = useMemo<Column<ItemDeclaravel>[]>(() => {
    // A escolha mostra o que decide (o item, a medida, o saldo e o campo) à vista; a origem vai ao fim.
    const id = new Map(colunasItemDeclaracao<ItemDeclaravel>().map((col) => [col.key, col]));
    const pega = (...ks: string[]) => ks.map((k) => id.get(k)).filter((col): col is Column<ItemDeclaravel> => !!col);
    return [
      ...pega("seq", "cod", "desc", "med"),
      { key: "qpca", header: "Qtd. PCA", align: "right", nowrap: true, filter: "range", numero: (r) => r.quantidade, formatarFaixa: num, total: false, render: (r) => num(r.quantidade) },
      { key: "saldo", header: "Saldo", align: "right", nowrap: true, filter: "range", numero: (r) => saldoDe(r), formatarFaixa: num, total: false, render: (r) => <span className="font-medium tabular-nums">{num(saldoDe(r))}</span> },
      {
        key: "declarar",
        header: "A declarar",
        align: "right",
        nowrap: true,
        filter: "none",
        total: false,
        render: (r) => {
          // Só a linha MARCADA ganha o campo; as demais, o traço.
          if (!qtd.has(r.sequencial)) return <span className="text-faint">—</span>;
          const q = qtd.get(r.sequencial) ?? null;
          return (
            <div className="flex items-center justify-end gap-1.5" role="none" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {q != null && q > 0 && q < Number(r.quantidade ?? 0) && <Badge tone="amber">Parcial</Badge>}
              <CampoQuantidade seq={r.sequencial} valor={q} onMudar={mudarQtd} />
            </div>
          );
        },
      },
      ...pega("vu", "sigla", "plan"),
    ];
  }, [qtd, mudarQtd]);

  async function gravar() {
    if (motivo) return;
    const rotulo = FINALIDADES.find((f) => f.id === finalidade)?.rotulo;
    const ok = await confirmar(
      edicao
        ? { titulo: `Salvar a declaração ${edicao.rotulo}?`, texto: `${num(conf.linhas.length)} item(ns) · ${brl(total)} · ${rotulo}. O PDF passa a sair com o conteúdo novo.`, confirmar: "Salvar" }
        : { titulo: `Emitir a declaração de ${num(conf.linhas.length)} item(ns)?`, texto: `${brl(total)} · ${rotulo}. Ela pode ser editada até o PDF ser exportado.`, confirmar: "Emitir" },
    );
    if (!ok) return;
    setGravando(true);
    try {
      const r = await fetch(edicao ? `/api/pca/${pcaId}/declaracoes/${edicao.id}` : `/api/pca/${pcaId}/declaracoes`, {
        method: edicao ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalidade, finalidadeTexto: finalidadeTexto || null, processo: processo || null, observacao: observacao || null, itens: pedido }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; declaracao?: { id: number; rotulo: string } };
      if (!r.ok || !j.ok || !j.declaracao) throw new Error(j.error ?? "Não consegui gravar a declaração.");
      toast.success(edicao ? `Declaração ${j.declaracao.rotulo} salva.` : `Declaração ${j.declaracao.rotulo} emitida.`);
      onGravada(j.declaracao.id);
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
      titulo={edicao ? `Editar declaração nº ${edicao.rotulo}` : "Nova declaração"}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-[var(--gap-block)]">
          <div className="min-w-0 text-[13px]">
            <span className="font-medium tabular-nums text-text">
              {num(conf.linhas.length)} item(ns) · {brl(total)}
              {parciais > 0 && <span className="text-warn"> · {num(parciais)} parcial(is)</span>}
            </span>
            {motivo && pedido.length > 0 && <span className="ml-2 text-danger">{motivo}</span>}
          </div>
          <Button size="sm" loading={gravando} disabled={!!motivo} title={motivo ?? undefined} onClick={gravar}>
            {edicao ? "Salvar alterações" : "Emitir declaração"}
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        {fora.length > 0 && (
          <Callout kind="warn">
            {fora.length === 1 ? `O item ${fora[0]} não está mais no PCA (ou sem saldo) e sai` : `Os itens ${fora.join(", ")} não estão mais no PCA (ou sem saldo) e saem`} da declaração ao salvar.
          </Callout>
        )}
        <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2">
          <SelectField label="Finalidade" value={finalidade} onChange={(e) => setFinalidade(e.target.value as Finalidade)}>
            {FINALIDADES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </SelectField>
          <TextField label="Processo / empenho de referência" value={processo} maxLength={LIMITES_DECLARACAO.processo} onChange={(e) => setProcesso(e.target.value)} placeholder="Opcional" />
          {finalidade === "outra" && (
            <div className="sm:col-span-2">
              <TextField label="Qual finalidade" value={finalidadeTexto} maxLength={LIMITES_DECLARACAO.finalidadeTexto} onChange={(e) => setFinalidadeTexto(e.target.value)} placeholder="Ex.: renovação de contrato" />
            </div>
          )}
        </div>
        <EditorRico compacto label="Observação" rotulo="Observação da declaração" valor={observacao} onChange={setObservacao} maxLength={LIMITES_DECLARACAO.observacao} placeholder="Opcional — sai no PDF" />
        <DataTable
          columns={colunas}
          rows={disponiveis}
          getKey={(i) => i.sequencial}
          selectable
          selected={selecionados}
          onSelected={marcar}
          density="compact"
          linhasSalvas="declaracao-nova"
          exportar={false}
          resumo={(ls) => `${num(ls.length)} item(ns) com saldo`}
          vazio="Nenhum item com saldo para declarar."
        />
      </div>
      {confirmacao}
    </Modal>
  );
}
