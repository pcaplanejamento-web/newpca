"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { baixarNoNavegador } from "@/lib/arquivo-navegador";
import type { DeclaracaoCompleta, DeclaracaoResumo } from "@/lib/declaracoes";
import { type ItemDeclaravel, type LinhaDeclaracao, LIMITES_DECLARACAO, remanescente, saldoDe } from "@/lib/declaracoes-core";
import { brl, dataHoraBR, dataIsoBrasilia, num } from "@/lib/format";
import { FerramentasAba } from "./AbasEspaco";
import { useAbrirDaUrl } from "./AbrirDaUrl";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { BotaoCopiar, CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaTexto } from "./CelulaLista";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { TextField } from "./Field";
import { IconDownload, IconFile, IconPencil, IconPlus } from "./icons";
import { Modal } from "./Modal";
import type { EdicaoDeclaracao } from "./NovaDeclaracao";
import { Skeleton } from "./Skeleton";
import { StatMini } from "./StatMini";
import { TextoFormatado } from "./TextoFormatado";
import { toast } from "./Toast";

const NovaDeclaracao = dynamic(() => import("./NovaDeclaracao").then((m) => m.NovaDeclaracao), { ssr: false });
const VisualizadorPdf = dynamic(() => import("./DocumentosView").then((m) => m.VisualizadorPdf), { ssr: false });

type CamposItem = Pick<ItemDeclaravel, "sequencial" | "codigo" | "descricao" | "unidade" | "sigla" | "dfdNumero" | "planejamento" | "protocoloNumero" | "valorUnitario">;

/** As colunas de IDENTIFICAÇÃO do item (as mesmas na escolha dos itens e no detalhe da declaração). */
export function colunasItemDeclaracao<R extends CamposItem>(): Column<R>[] {
  return [
    { key: "seq", header: "Item", nowrap: true, value: (r) => String(r.sequencial), numero: (r) => r.sequencial, formatarFaixa: num, total: false, render: (r) => <span className="tabular-nums">{r.sequencial}</span> },
    {
      key: "plan",
      header: "Planejamento",
      nowrap: true,
      value: (r) => r.planejamento ?? "—",
      render: (r) => <CelulaCopiavel copiar={r.planejamento} rotulo="nº de planejamento">{r.planejamento ?? <span className="text-faint">—</span>}</CelulaCopiavel>,
    },
    { key: "dfd", header: "DFD", nowrap: true, value: (r) => r.dfdNumero ?? "—", render: (r) => r.dfdNumero ?? <span className="text-faint">—</span> },
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
    { key: "vu", header: "Valor unitário", align: "right", nowrap: true, filter: "range", numero: (r) => r.valorUnitario, total: false, render: (r) => brl(r.valorUnitario) },
  ];
}

const colunasLinha: Column<LinhaDeclaracao>[] = [
  ...colunasItemDeclaracao<LinhaDeclaracao>(),
  { key: "qpca", header: "No PCA", align: "right", nowrap: true, filter: "range", numero: (r) => r.quantidadePca, formatarFaixa: num, total: false, render: (r) => num(r.quantidadePca) },
  {
    key: "qant",
    header: "Já declarada",
    align: "right",
    nowrap: true,
    filter: "range",
    numero: (r) => r.quantidadeAntes ?? null,
    formatarFaixa: num,
    total: false,
    render: (r) => (r.quantidadeAntes == null ? <span className="text-faint">—</span> : num(r.quantidadeAntes)),
  },
  {
    key: "qdec",
    header: "Declarada",
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
  {
    key: "qrem",
    header: "Saldo",
    align: "right",
    nowrap: true,
    filter: "range",
    numero: remanescente,
    formatarFaixa: num,
    total: false,
    render: (r) => {
      const q = remanescente(r);
      return q == null ? <span className="text-faint">—</span> : num(q);
    },
  },
  { key: "vt", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (r) => r.valorTotal, render: (r) => brl(r.valorTotal) },
];

type Situacao = Pick<DeclaracaoResumo, "cancelada" | "exportada">;
const rotuloSituacao = (d: Situacao) => (d.cancelada ? "Cancelada" : d.exportada ? "Exportada" : "Em elaboração");

/** A situação da declaração: em elaboração (editável) · exportada (travada, válida) · cancelada. */
function SeloSituacao({ d }: { d: Situacao }) {
  if (d.cancelada)
    return (
      <Badge tone="red" dot title={d.cancelada.motivo ?? undefined}>
        Cancelada
      </Badge>
    );
  if (d.exportada)
    return (
      <Badge tone="emerald" dot title={`Exportada em ${dataHoraBR(d.exportada.em)}${d.exportada.por ? ` por ${d.exportada.por}` : ""} — não pode mais ser editada`}>
        Exportada
      </Badge>
    );
  return (
    <Badge tone="amber" dot title="Ainda editável — exporte o PDF para validar">
      Em elaboração
    </Badge>
  );
}

const colunasLista: Column<DeclaracaoResumo>[] = [
  {
    key: "num",
    header: "Nº",
    nowrap: true,
    value: (d) => d.rotulo,
    render: (d) => <CelulaCopiavel copiar={d.rotulo} rotulo="nº da declaração"><span className="font-medium tabular-nums">{d.rotulo}</span></CelulaCopiavel>,
  },
  { key: "sit", header: "Situação", nowrap: true, value: rotuloSituacao, corPdf: (d) => (d.cancelada ? "var(--danger)" : d.exportada ? "var(--ok)" : "var(--warn)"), render: (d) => <SeloSituacao d={d} /> },
  { key: "em", header: "Emitida em", nowrap: true, filter: "date", value: (d) => dataIsoBrasilia(d.emitidoEm), render: (d) => dataHoraBR(d.emitidoEm) },
  { key: "fin", header: "Finalidade", value: (d) => d.finalidadeRotulo, render: (d) => d.finalidadeRotulo },
  {
    key: "pcenti",
    header: "Protocolo Centi",
    nowrap: true,
    value: (d) => d.protocoloCenti ?? "—",
    render: (d) => <CelulaCopiavel copiar={d.protocoloCenti} rotulo="protocolo da Centi">{d.protocoloCenti ?? <span className="text-faint">—</span>}</CelulaCopiavel>,
  },
  { key: "proc", header: "Processo ou empenho", nowrap: true, value: (d) => d.processo ?? "—", render: (d) => d.processo ?? <span className="text-faint">—</span> },
  { key: "itens", header: "Itens", align: "right", nowrap: true, filter: "range", numero: (d) => d.totalItens, formatarFaixa: num, render: (d) => num(d.totalItens) },
  { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (d) => d.valorTotal, render: (d) => brl(d.valorTotal) },
  { key: "por", header: "Emitida por", value: (d) => d.emitidoPorNome, render: (d) => d.emitidoPorNome },
];

const urlPdf = (pcaId: number, id: number, baixar = false) => `/api/pca/${pcaId}/declaracoes/${id}/pdf${baixar ? "?baixar=1" : ""}`;
const nomePdf = (d: Pick<DeclaracaoResumo, "numero" | "ano">) => `declaracao-${d.numero}-${d.ano}.pdf`;
type Pode = { emitir: boolean; baixar: boolean; cancelar: boolean };
type Detalhe = Omit<DeclaracaoCompleta, "conteudoTexto">;

async function lerDeclaracao(pcaId: number, id: number): Promise<{ declaracao: Detalhe; todos: boolean }> {
  const r = await fetch(`/api/pca/${pcaId}/declaracoes/${id}`);
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; declaracao?: Detalhe; todos?: boolean };
  if (!r.ok || !j.ok || !j.declaracao) throw new Error(j.error ?? "Não consegui abrir a declaração.");
  return { declaracao: j.declaracao, todos: j.todos !== false };
}

/**
 * EXPORTAR o PDF: a já exportada (ou cancelada) só baixa de novo; a em elaboração confirma — exportar TRAVA a edição — e
 * baixa o PDF final.
 */
function useExportarPdf(pcaId: number, onMudou: () => void) {
  const { confirmar, confirmacao } = useConfirmacao();
  const exportar = useCallback(
    async (d: Pick<DeclaracaoResumo, "id" | "rotulo" | "numero" | "ano" | "exportada" | "cancelada">): Promise<boolean> => {
      // Baixar de novo: pelo fetch — a recusa (403/409) vira um aviso, nunca a página trocada pelo JSON do erro.
      if (d.exportada || d.cancelada) {
        try {
          const r = await fetch(urlPdf(pcaId, d.id, true));
          if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Não consegui baixar o PDF.");
          baixarNoNavegador(nomePdf(d), await r.blob());
          return true;
        } catch (e) {
          toast.error((e as Error).message);
          return false;
        }
      }
      const ok = await confirmar({
        titulo: `Exportar a declaração ${d.rotulo} em PDF?`,
        texto: "Depois de exportada, ela não pode mais ser editada (só cancelada).",
        confirmar: "Exportar PDF",
      });
      if (!ok) return false;
      try {
        const r = await fetch(urlPdf(pcaId, d.id), { method: "POST" });
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Não consegui exportar.");
        baixarNoNavegador(nomePdf(d), await r.blob());
        toast.success(`Declaração ${d.rotulo} exportada — não pode mais ser editada.`);
        onMudou();
        return true;
      } catch (e) {
        toast.error((e as Error).message);
        return false;
      }
    },
    [pcaId, confirmar, onMudou],
  );
  return { exportar, confirmacao };
}

/**
 * A aba DECLARAÇÕES do espaço do PCA: as declarações (a mais recente primeiro), cada linha com o PDF (a prévia e exportar)
 * e, em elaboração, editar; "Nova declaração" atesta que itens (total ou PARCIAL: 6 de 12) constam do PCA. Tocar numa
 * linha abre o detalhe (itens, verificação, PDF, editar, cancelar).
 */
export function DeclaracoesPca({
  pcaId,
  declaracoes,
  itens,
  emissaoDesligada = false,
  pode,
}: {
  pcaId: number;
  declaracoes: DeclaracaoResumo[];
  /** Os itens que a pessoa pode declarar (a unidade dela), com o já declarado. */
  itens: ItemDeclaravel[];
  /** A Configuração do PCA desligou a emissão (o ADM ainda consulta, baixa e cancela as emitidas). */
  emissaoDesligada?: boolean;
  pode: Pode;
}) {
  const router = useRouter();
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);
  // A PESQUISA DO SISTEMA (`?aba=declaracoes&abrir=<id>`): abre a declaração — só a que está na lista (a da unidade da pessoa).
  useAbrirDaUrl((v) => {
    const n = Number(v);
    if (declaracoes.some((d) => d.id === n)) setAberta(n);
  });
  const [editando, setEditando] = useState<EdicaoDeclaracao | null>(null);
  const [vendo, setVendo] = useState<DeclaracaoResumo | null>(null);
  const mudou = useCallback(() => router.refresh(), [router]);
  const { exportar, confirmacao } = useExportarPdf(pcaId, mudou);
  const comSaldo = itens.filter((i) => saldoDe(i) > 0).length;
  const podeEditar = useCallback((d: Situacao) => pode.emitir && !emissaoDesligada && !d.exportada && !d.cancelada, [pode.emitir, emissaoDesligada]);

  const editar = useCallback(
    async (id: number) => {
      try {
        const { declaracao: d, todos } = await lerDeclaracao(pcaId, id);
        if (!todos) throw new Error("A declaração tem itens de outras unidades — só quem vê todos eles pode editá-la.");
        if (!d.conteudo || d.exportada || d.cancelada) throw new Error("A declaração já foi exportada ou cancelada — não pode mais ser editada.");
        setEditando({ id: d.id, rotulo: d.rotulo, conteudo: d.conteudo });
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [pcaId],
  );

  const colunas = useMemo<Column<DeclaracaoResumo>[]>(
    () => [
      colunasLista[0],
      {
        key: "acoes",
        header: "",
        nowrap: true,
        filter: "none",
        render: (d) => (
          <div className="flex items-center justify-center gap-1" role="none" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {podeEditar(d) && <Button variant="icon" size="xs" aria-label={`Editar a declaração ${d.rotulo}`} title="Editar" icon={<IconPencil className="h-4 w-4" />} onClick={() => editar(d.id)} />}
            <Button
              variant="icon"
              size="xs"
              aria-label={`PDF da declaração ${d.rotulo}`}
              title={d.exportada || d.cancelada ? "Ver o PDF" : "Visualizar e exportar o PDF"}
              icon={<IconFile className="h-4 w-4" />}
              onClick={() => setVendo(d)}
            />
          </div>
        ),
      },
      ...colunasLista.slice(1),
    ],
    [editar, podeEditar],
  );

  return (
    <>
      <FerramentasAba>
        {pode.emitir && !emissaoDesligada && (
          <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setNova(true)} disabled={comSaldo === 0} title={comSaldo === 0 ? "Nenhum item com saldo para declarar" : undefined}>
            Nova declaração
          </Button>
        )}
        <Ajuda titulo="Declarações do PCA" rotulo="Sobre as declarações">
          <p>A declaração atesta que itens constam deste PCA — o item inteiro ou só parte da quantidade (ex.: 6 de 12).</p>
          <p>Cada item tem um SALDO: a quantidade no PCA menos o que já foi declarado. Cancelar uma declaração devolve o saldo.</p>
          <p>Em elaboração, a declaração pode ser editada e o PDF sai como PRÉVIA. Ao EXPORTAR o PDF, ela vale e não pode mais ser editada (só cancelada).</p>
          <p>O PDF sai no papel timbrado da Prefeitura, com um código de verificação: qualquer pessoa confere a autenticidade na página pública.</p>
          <p>Quem emite é definido na Configuração do PCA (todos com permissão, só os Administradores ou desligado).</p>
          {emissaoDesligada && <p>A emissão está DESLIGADA neste PCA: as declarações já emitidas seguem para consulta, PDF e cancelamento.</p>}
        </Ajuda>
      </FerramentasAba>
      <DataTable
        columns={colunas}
        rows={declaracoes}
        getKey={(d) => d.id}
        onRowClick={(d) => setAberta(d.id)}
        activeKey={aberta}
        density="compact"
        scrollInterno
        exportar={{ nome: "Declarações do PCA" }}
        resumo={(ls) => `${num(ls.length)} declaração(ões) · ${brl(ls.reduce((s, d) => s + (d.cancelada ? 0 : d.valorTotal), 0))} não canceladas`}
        vazio={
          emissaoDesligada
            ? "Nenhuma declaração emitida — a emissão está desligada na Configuração do PCA."
            : itens.length === 0
              ? "Nenhum item deste PCA para declarar ainda."
              : pode.emitir
                ? "Nenhuma declaração emitida ainda — use “Nova declaração”."
                : "Nenhuma declaração emitida ainda."
        }
      />
      {(nova || editando) && (
        <NovaDeclaracao
          pcaId={pcaId}
          itens={itens}
          edicao={editando ?? undefined}
          onFechar={() => {
            setNova(false);
            setEditando(null);
          }}
          onGravada={(id) => {
            setNova(false);
            setEditando(null);
            mudou();
            setAberta(id);
          }}
        />
      )}
      {aberta != null && (
        <DetalheDeclaracao
          key={`${aberta}:${declaracoes.find((d) => d.id === aberta)?.editada?.em ?? ""}:${declaracoes.find((d) => d.id === aberta)?.exportada?.em ?? ""}`}
          pcaId={pcaId}
          id={aberta}
          pode={pode}
          podeEditar={podeEditar}
          onEditar={editar}
          onVer={setVendo}
          onExportar={exportar}
          onFechar={() => setAberta(null)}
          onMudou={mudou}
        />
      )}
      {vendo && (
        <VisualizadorPdf
          doc={{ id: vendo.id, nome: `Declaração nº ${vendo.rotulo}${vendo.exportada || vendo.cancelada ? "" : " — prévia"}`, nomeArquivo: nomePdf(vendo) }}
          url={urlPdf(pcaId, vendo.id)}
          rotuloBaixar={vendo.exportada || vendo.cancelada ? "Baixar o PDF" : "Exportar o PDF"}
          onBaixar={pode.baixar ? () => exportar(vendo).then((feito) => feito && setVendo(null)) : undefined}
          onFechar={() => setVendo(null)}
        />
      )}
      {confirmacao}
    </>
  );
}

/** O DETALHE de uma declaração: os números, a verificação, os itens congelados, o PDF, editar e cancelar (com o motivo). */
function DetalheDeclaracao({
  pcaId,
  id,
  pode,
  podeEditar,
  onEditar,
  onVer,
  onExportar,
  onFechar,
  onMudou,
}: {
  pcaId: number;
  id: number;
  pode: Pode;
  podeEditar: (d: Situacao) => boolean;
  onEditar: (id: number) => void;
  onVer: (d: DeclaracaoResumo) => void;
  onExportar: (d: DeclaracaoResumo) => void;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [todos, setTodos] = useState(true);
  const [falha, setFalha] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [gravando, setGravando] = useState(false);
  const carregar = useCallback(async () => {
    setFalha(null);
    try {
      const r = await lerDeclaracao(pcaId, id);
      setD(r.declaracao);
      setTodos(r.todos);
    } catch (e) {
      setFalha((e as Error).message);
    }
  }, [pcaId, id]);
  useEffect(() => {
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
  const editavel = !!d && todos && podeEditar(d);
  return (
    <Modal
      open
      onClose={onFechar}
      bloqueado={gravando}
      size="xl"
      titulo={d ? `Declaração nº ${d.rotulo}` : "Declaração"}
      acoesCabecalho={
        d && (
          <>
            {editavel && <Button variant="icon" size="sm" aria-label="Editar a declaração" title="Editar" icon={<IconPencil className="h-4 w-4" />} onClick={() => onEditar(d.id)} />}
            <Button variant="icon" size="sm" aria-label="Visualizar o PDF" title="Visualizar o PDF" icon={<IconFile className="h-4 w-4" />} onClick={() => onVer(d)} />
            {pode.baixar && (
              <Button
                variant="icon"
                size="sm"
                aria-label={d.exportada || d.cancelada ? "Baixar o PDF" : "Exportar o PDF"}
                title={d.exportada || d.cancelada ? "Baixar o PDF" : "Exportar o PDF (trava a edição)"}
                icon={<IconDownload className="h-4 w-4" />}
                onClick={() => onExportar(d)}
              />
            )}
          </>
        )
      }
      rodape={
        d && pode.cancelar && !d.cancelada && todos ? (
          cancelando ? (
            <div className="flex w-full flex-col gap-[var(--gap-block)] sm:flex-row sm:items-end">
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
          {d.cancelada ? (
            <Callout kind="danger">
              Cancelada em {dataHoraBR(d.cancelada.em)}
              {d.cancelada.por ? ` por ${d.cancelada.por}` : ""}
              {d.cancelada.motivo ? ` — ${d.cancelada.motivo}` : ""}. Sem validade; o saldo voltou aos itens.
            </Callout>
          ) : !d.exportada ? (
            <Callout kind="warn">Em elaboração: pode ser editada e o PDF sai como PRÉVIA. Exporte o PDF para validá-la — depois disso, não se edita mais.</Callout>
          ) : (
            <Callout kind="ok">Exportada — válida e travada para edição.</Callout>
          )}
          <div className="grid grid-cols-3 gap-[var(--gap-block)]">
            <StatMini label="Itens" value={num(c.totalItens)} />
            <StatMini label="Parciais" value={num(parciais)} tone={parciais ? "warn" : "default"} />
            <StatMini label="Valor total" value={brl(c.valorTotal)} tone="accent" />
          </div>
          <dl className="grid grid-cols-1 gap-x-[var(--gap-block)] gap-y-1.5 rounded-card border border-border bg-surface p-[var(--pad-card)] text-[13.5px] sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">Finalidade</dt>
            <dd className="text-text">
              {d.finalidadeRotulo}
              {c.finalidade === "outra" && c.finalidadeTexto ? ` — ${c.finalidadeTexto}` : ""}
            </dd>
            <dt className="text-muted">Protocolo na Centi</dt>
            <dd className="text-text">{c.protocoloCenti ?? <span className="text-faint">Não informado (emitida antes do campo)</span>}</dd>
            {c.processo && (
              <>
                <dt className="text-muted">Processo ou empenho</dt>
                <dd className="text-text">{c.processo}</dd>
              </>
            )}
            {c.observacao && (
              <>
                <dt className="text-muted">Observação</dt>
                <dd className="min-w-0 text-text">
                  <TextoFormatado texto={c.observacao} />
                </dd>
              </>
            )}
            <dt className="text-muted">Emitida</dt>
            <dd className="text-text">
              {dataHoraBR(d.emitidoEm)} · {[c.emitente.nome, c.emitente.cargo].filter(Boolean).join(" · ")}
            </dd>
            {d.editada && (
              <>
                <dt className="text-muted">Editada</dt>
                <dd className="text-text">
                  {dataHoraBR(d.editada.em)}
                  {d.editada.por ? ` · ${d.editada.por}` : ""}
                </dd>
              </>
            )}
            {d.exportada && (
              <>
                <dt className="text-muted">Exportada</dt>
                <dd className="text-text">
                  {dataHoraBR(d.exportada.em)}
                  {d.exportada.por ? ` · ${d.exportada.por}` : ""}
                </dd>
              </>
            )}
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
            linhasSalvas="declaracao-itens"
            exportar={{ nome: `Declaração ${d.rotulo}` }}
            resumo={(ls) => `${num(ls.length)} item(ns) · ${brl(ls.reduce((s, l) => s + l.valorTotal, 0))}`}
          />
        </div>
      )}
    </Modal>
  );
}
