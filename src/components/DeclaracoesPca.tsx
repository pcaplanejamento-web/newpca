"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DeclaracaoCompleta, DeclaracaoResumo } from "@/lib/declaracoes";
import { type ItemDeclaravel, type LinhaDeclaracao, LIMITES_DECLARACAO, saldoDe } from "@/lib/declaracoes-core";
import { brl, dataHoraBR, dataIsoBrasilia, num } from "@/lib/format";
import { FerramentasAba } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { BotaoCopiar, CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaTexto } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { TextField } from "./Field";
import { IconDownload, IconEye, IconPlus } from "./icons";
import { Modal } from "./Modal";
import { Skeleton } from "./Skeleton";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";

const NovaDeclaracao = dynamic(() => import("./NovaDeclaracao").then((m) => m.NovaDeclaracao), { ssr: false });
const VisualizadorPdf = dynamic(() => import("./DocumentosView").then((m) => m.VisualizadorPdf), { ssr: false });

type CamposItem = Pick<ItemDeclaravel, "sequencial" | "codigo" | "descricao" | "unidade" | "sigla" | "dfdNumero" | "planejamento" | "protocoloNumero" | "valorUnitario">;

/** As colunas de IDENTIFICAÇÃO do item (as mesmas na escolha dos itens e no detalhe da declaração). */
export function colunasItemDeclaracao<R extends CamposItem>(): Column<R>[] {
  return [
    { key: "seq", header: "Seq. PCA", nowrap: true, value: (r) => String(r.sequencial), numero: (r) => r.sequencial, formatarFaixa: num, total: false, render: (r) => <span className="tabular-nums">{r.sequencial}</span> },
    {
      key: "plan",
      header: "Nº Plan.",
      nowrap: true,
      value: (r) => r.planejamento ?? "—",
      render: (r) => <CelulaCopiavel copiar={r.planejamento} rotulo="nº de planejamento">{r.planejamento ?? <span className="text-faint">—</span>}</CelulaCopiavel>,
    },
    { key: "dfd", header: "Nº DFD", nowrap: true, value: (r) => r.dfdNumero ?? "—", render: (r) => r.dfdNumero ?? <span className="text-faint">—</span> },
    { key: "prot", header: "Protocolo", nowrap: true, value: (r) => r.protocoloNumero ?? "—", render: (r) => r.protocoloNumero ?? <span className="text-faint">—</span> },
    { key: "sigla", header: "Unidade", nowrap: true, value: (r) => r.sigla ?? "—", render: (r) => r.sigla ?? <span className="text-faint">—</span> },
    {
      key: "cod",
      header: "Código",
      nowrap: true,
      value: (r) => r.codigo ?? "—",
      render: (r) => <CelulaCopiavel copiar={r.codigo} rotulo="código">{r.codigo ?? <span className="text-faint">—</span>}</CelulaCopiavel>,
    },
    { key: "desc", header: "Descrição", minWidth: 260, align: "left", value: (r) => r.descricao ?? "—", render: (r) => <CelulaTexto texto={r.descricao} /> },
    { key: "med", header: "Medida", nowrap: true, value: (r) => r.unidade ?? "—", render: (r) => r.unidade ?? <span className="text-faint">—</span> },
    { key: "vu", header: "Vlr. unit.", align: "right", nowrap: true, filter: "range", numero: (r) => r.valorUnitario, total: false, render: (r) => brl(r.valorUnitario) },
  ];
}

const colunasLinha: Column<LinhaDeclaracao>[] = [
  ...colunasItemDeclaracao<LinhaDeclaracao>(),
  { key: "qpca", header: "Qtd. PCA", align: "right", nowrap: true, filter: "range", numero: (r) => r.quantidadePca, formatarFaixa: num, total: false, render: (r) => num(r.quantidadePca) },
  {
    key: "qdec",
    header: "Qtd. declarada",
    align: "right",
    nowrap: true,
    filter: "range",
    numero: (r) => r.quantidade,
    formatarFaixa: num,
    render: (r) => (
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        {num(r.quantidade)}
        {r.parcial && (
          <Badge tone="amber" title="Menor que a quantidade do item no PCA">
            Parcial
          </Badge>
        )}
      </span>
    ),
  },
  { key: "vt", header: "Vlr. total", align: "right", nowrap: true, filter: "range", numero: (r) => r.valorTotal, render: (r) => brl(r.valorTotal) },
];

const colunasLista: Column<DeclaracaoResumo>[] = [
  {
    key: "num",
    header: "Nº",
    nowrap: true,
    value: (d) => d.rotulo,
    render: (d) => <CelulaCopiavel copiar={d.rotulo} rotulo="nº da declaração"><span className="font-medium tabular-nums">{d.rotulo}</span></CelulaCopiavel>,
  },
  { key: "em", header: "Emitida em", nowrap: true, filter: "date", value: (d) => dataIsoBrasilia(d.emitidoEm), render: (d) => dataHoraBR(d.emitidoEm) },
  { key: "fin", header: "Finalidade", value: (d) => d.finalidadeRotulo, render: (d) => d.finalidadeRotulo },
  { key: "proc", header: "Processo", nowrap: true, value: (d) => d.processo ?? "—", render: (d) => d.processo ?? <span className="text-faint">—</span> },
  { key: "itens", header: "Itens", align: "right", nowrap: true, filter: "range", numero: (d) => d.totalItens, formatarFaixa: num, render: (d) => num(d.totalItens) },
  { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (d) => d.valorTotal, render: (d) => brl(d.valorTotal) },
  { key: "por", header: "Emitida por", value: (d) => d.emitidoPorNome, render: (d) => d.emitidoPorNome },
  {
    key: "sit",
    header: "Situação",
    nowrap: true,
    value: (d) => (d.cancelada ? "Cancelada" : "Válida"),
    corPdf: (d) => (d.cancelada ? "var(--danger)" : "var(--ok)"),
    render: (d) =>
      d.cancelada ? (
        <Badge tone="red" dot title={d.cancelada.motivo ?? undefined}>
          Cancelada
        </Badge>
      ) : (
        <Badge tone="emerald" dot>
          Válida
        </Badge>
      ),
  },
];

const urlPdf = (pcaId: number, id: number, baixar = false) => `/api/pca/${pcaId}/declaracoes/${id}/pdf${baixar ? "?baixar=1" : ""}`;

/**
 * A aba DECLARAÇÕES do espaço do PCA: as declarações emitidas (a mais recente primeiro) e "Nova declaração" — atestar que
 * itens (total ou PARCIAL: 6 de 12) constam do PCA, para o início da contratação, um empenho complementar, um aditivo…
 * Tocar numa linha abre o detalhe (itens, verificação, PDF, cancelar).
 */
export function DeclaracoesPca({
  pcaId,
  declaracoes,
  itens,
  pode,
}: {
  pcaId: number;
  declaracoes: DeclaracaoResumo[];
  /** Os itens que a pessoa pode declarar (a unidade dela), com o já declarado. */
  itens: ItemDeclaravel[];
  pode: { emitir: boolean; baixar: boolean; cancelar: boolean };
}) {
  const router = useRouter();
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);
  const comSaldo = itens.filter((i) => saldoDe(i) > 0).length;
  return (
    <>
      <FerramentasAba>
        <Ajuda titulo="Declarações do PCA" rotulo="Sobre as declarações">
          <p>A declaração atesta que itens constam deste PCA — o item inteiro ou só parte da quantidade (ex.: 6 de 12).</p>
          <p>Cada item tem um SALDO: a quantidade no PCA menos o que já foi declarado. Cancelar uma declaração devolve o saldo.</p>
          <p>O PDF traz um código de verificação: qualquer pessoa confere a autenticidade na página pública.</p>
        </Ajuda>
        {pode.emitir && (
          <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setNova(true)} disabled={comSaldo === 0} title={comSaldo === 0 ? "Nenhum item com saldo para declarar" : undefined}>
            Nova declaração
          </Button>
        )}
      </FerramentasAba>
      <DataTable
        columns={colunasLista}
        rows={declaracoes}
        getKey={(d) => d.id}
        onRowClick={(d) => setAberta(d.id)}
        activeKey={aberta}
        density="compact"
        scrollInterno
        exportar={{ nome: "Declarações do PCA" }}
        resumo={(ls) => `${num(ls.length)} declaração(ões) · ${brl(ls.reduce((s, d) => s + (d.cancelada ? 0 : d.valorTotal), 0))} válidas`}
        vazio={
          itens.length === 0
            ? "Nenhum item deste PCA para declarar ainda."
            : pode.emitir
              ? "Nenhuma declaração emitida ainda — use “Nova declaração”."
              : "Nenhuma declaração emitida ainda."
        }
      />
      {nova && (
        <NovaDeclaracao
          pcaId={pcaId}
          itens={itens}
          onFechar={() => setNova(false)}
          onEmitida={(id) => {
            setNova(false);
            router.refresh();
            setAberta(id);
          }}
        />
      )}
      {aberta != null && <DetalheDeclaracao pcaId={pcaId} id={aberta} pode={pode} onFechar={() => setAberta(null)} onMudou={() => router.refresh()} />}
    </>
  );
}

type Detalhe = Omit<DeclaracaoCompleta, "conteudoTexto">;

/** O DETALHE de uma declaração: os números, a verificação, os itens congelados, o PDF e o cancelamento (com o motivo). */
function DetalheDeclaracao({
  pcaId,
  id,
  pode,
  onFechar,
  onMudou,
}: {
  pcaId: number;
  id: number;
  pode: { baixar: boolean; cancelar: boolean };
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [vendo, setVendo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [gravando, setGravando] = useState(false);
  const carregar = useCallback(async () => {
    setFalha(null);
    try {
      const r = await fetch(`/api/pca/${pcaId}/declaracoes/${id}`);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; declaracao?: Detalhe };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não consegui abrir a declaração.");
      setD(j.declaracao ?? null);
    } catch (e) {
      setFalha((e as Error).message);
    }
  }, [pcaId, id]);
  useEffect(() => {
    setD(null);
    setCancelando(false);
    setMotivo("");
    carregar();
  }, [carregar]);

  async function cancelar() {
    setGravando(true);
    try {
      const r = await fetch(`/api/pca/${pcaId}/declaracoes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não consegui cancelar.");
      toast.success("Declaração cancelada — o saldo voltou aos itens.");
      setCancelando(false);
      onMudou();
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGravando(false);
    }
  }

  const c = d?.conteudo;
  const link = d ? `${window.location.origin}/declaracao/verificar/${d.codigo}` : "";
  const parciais = c?.linhas.filter((l) => l.parcial).length ?? 0;
  return (
    <>
      <Modal
        open
        onClose={onFechar}
        bloqueado={gravando}
        size="xl"
        titulo={d ? `Declaração nº ${d.rotulo}` : "Declaração"}
        acoesCabecalho={
          d && (
            <>
              <Button variant="icon" size="sm" aria-label="Ver o PDF" title="Ver o PDF" icon={<IconEye className="h-4 w-4" />} onClick={() => setVendo(true)} />
              {pode.baixar && (
                <Button variant="icon" size="sm" aria-label="Baixar o PDF" title="Baixar o PDF" icon={<IconDownload className="h-4 w-4" />} href={urlPdf(pcaId, id, true)} />
              )}
            </>
          )
        }
        rodape={
          d && pode.cancelar && !d.cancelada ? (
            cancelando ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <TextField label="Motivo do cancelamento" value={motivo} maxLength={LIMITES_DECLARACAO.motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setCancelando(false)} disabled={gravando}>
                    Voltar
                  </Button>
                  <Button size="sm" variant="danger" loading={gravando} disabled={motivo.trim().length < 5} onClick={cancelar}>
                    Cancelar declaração
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex w-full justify-end">
                <Button size="sm" variant="danger" onClick={() => setCancelando(true)}>
                  Cancelar declaração
                </Button>
              </div>
            )
          ) : undefined
        }
      >
        {falha ? (
          <Callout kind="danger">
            {falha}{" "}
            <button type="button" className="font-medium underline" onClick={carregar}>
              Tentar de novo
            </button>
          </Callout>
        ) : !d || !c ? (
          <div className="space-y-[var(--gap-block)]">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="space-y-[var(--gap-block)]">
            {d.cancelada && (
              <Callout kind="danger">
                Cancelada em {dataHoraBR(d.cancelada.em)}
                {d.cancelada.por ? ` por ${d.cancelada.por}` : ""}
                {d.cancelada.motivo ? ` — ${d.cancelada.motivo}` : ""}. Sem validade; o saldo voltou aos itens.
              </Callout>
            )}
            <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
              <StatMini label="Itens" value={num(c.totalItens)} />
              <StatMini label="Parciais" value={num(parciais)} tone={parciais ? "warn" : "default"} />
              <StatMini label="Valor total" value={brl(c.valorTotal)} tone="accent" />
              <StatMini label="Emitida em" value={dataHoraBR(d.emitidoEm)} hint={d.emitidoPorNome} />
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-card border border-border bg-surface p-[var(--pad-card)] text-[13.5px] sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Finalidade</dt>
              <dd className="text-text">
                {d.finalidadeRotulo}
                {c.finalidade === "outra" && c.finalidadeTexto ? ` — ${c.finalidadeTexto}` : ""}
              </dd>
              {c.processo && (
                <>
                  <dt className="text-muted">Processo</dt>
                  <dd className="text-text">{c.processo}</dd>
                </>
              )}
              {c.observacao && (
                <>
                  <dt className="text-muted">Observação</dt>
                  <dd className="whitespace-pre-wrap text-text">{c.observacao}</dd>
                </>
              )}
              <dt className="text-muted">Emitida por</dt>
              <dd className="text-text">{[c.emitente.nome, c.emitente.cargo].filter(Boolean).join(" · ")}</dd>
              <dt className="text-muted">Verificação</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12.5px] text-text">{d.codigo}</span>
                <BotaoCopiar texto={link} rotulo="Copiar link" titulo={link} />
              </dd>
            </dl>
            <DataTable
              columns={colunasLinha}
              rows={c.linhas}
              getKey={(l) => l.sequencial}
              density="compact"
              exportar={{ nome: `Declaração ${d.rotulo}` }}
              resumo={(ls) => `${num(ls.length)} item(ns) · ${brl(ls.reduce((s, l) => s + l.valorTotal, 0))}`}
            />
          </div>
        )}
      </Modal>
      {vendo && d && (
        <VisualizadorPdf
          doc={{ id: d.id, nome: `Declaração nº ${d.rotulo}`, nomeArquivo: `declaracao-${d.numero}-${d.ano}.pdf` }}
          url={urlPdf(pcaId, id)}
          onBaixar={pode.baixar ? () => window.location.assign(urlPdf(pcaId, id, true)) : undefined}
          onFechar={() => setVendo(false)}
        />
      )}
    </>
  );
}
