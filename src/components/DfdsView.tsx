"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { classificarAssunto, nivelDe, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import type { DfdDetalhe, DfdResumo, PcaResumo } from "@/lib/dfd";
import {
  dfdRSemReferencia,
  ESTADO_PROTOCOLO_ROTULO,
  estadoProtocolo,
  estadoProtocoloCor,
  SITUACAO_PROTOCOLO_ROTULO,
  situacaoProtocolo,
} from "@/lib/dfd-tratamento";
import { brl, num } from "@/lib/format";
import { type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import type { ProtocoloDetalhe, ProtocoloResumo } from "@/lib/protocolo";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { DfdConferir } from "./DfdConferir";
import { DfdUploadForm } from "./DfdUploadForm";
import { DfdCabecalho } from "./DfdView";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconClipboard, IconFile, IconLayers, IconLock, IconLockOpen, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { ProtocoloUploadForm } from "./ProtocoloUploadForm";
import { ProtocoloCabecalho, ProtocoloView, type ProtocoloEdicaoValores } from "./ProtocoloView";
import { Tabs } from "./Tabs";

type Rep = { id: number; codigo: string; nome: string; responsaveis: Responsaveis };

const valorDe = (r: DfdResumo) => r.valorTotal ?? r.valorEstimado ?? 0;

/** DFD gravado (`DfdDetalhe`) → forma editável (`DfdParseado`) do `DfdConferir`. */
function detalheParaParseado(d: DfdDetalhe): DfdParseado {
  return {
    numero: d.numero,
    planejamento: d.planejamento,
    tipo: d.tipo,
    objeto: d.objeto,
    orgaoEntidade: d.orgaoEntidade,
    setorRequisitante: d.setorRequisitante,
    siglaSetor: null,
    responsavel: d.responsavel,
    matricula: d.matricula,
    email: d.email,
    telefone: d.telefone,
    anoPca: d.anoPca,
    numeroContrato: d.numeroContrato,
    numeroAta: d.numeroAta,
    numeroLicitacao: d.numeroLicitacao,
    valorEstimado: d.valorEstimado,
    valorTotal: d.valorTotal,
    nomeArquivo: "",
    secoes: d.secoes,
    assinaturas: d.assinaturas,
    itens: d.itens.map((it) => ({
      item: it.item,
      codigo: it.codigo,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      valorTotal: it.valorTotal,
    })),
  };
}

export function DfdsView({
  podeEditar,
  dfds,
  protocolos,
  reparticoes,
  reparticaoAtivaId,
  pcas = [],
  regras = regrasPadrao(),
}: {
  podeEditar: boolean;
  dfds: DfdResumo[];
  protocolos: ProtocoloResumo[];
  reparticoes: Rep[];
  reparticaoAtivaId: number | null;
  pcas?: PcaResumo[];
  regras?: RegrasAvaliacao;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [protoView, setProtoView] = useState<ProtocoloDetalhe | null>(null);
  const [protoEdit, setProtoEdit] = useState<ProtocoloEdicaoValores | null>(null);
  const [protoTrancado, setProtoTrancado] = useState(true);
  const [salvandoProto, setSalvandoProto] = useState(false);
  const [vincAlvo, setVincAlvo] = useState<{ id: number; numero: string } | null>(null);
  const [vincSel, setVincSel] = useState<number | null>(null);
  const [salvandoVinc, setSalvandoVinc] = useState(false);

  // Banner do DFD gravado = MESMO componente da importação (`DfdConferir`), começa
  // TRAVADO; destravar (cadeado + confirmação) libera a edição — salva direto no D1.
  const [dfdView, setDfdView] = useState<DfdDetalhe | null>(null);
  const [dfdEdit, setDfdEdit] = useState<DfdParseado | null>(null);
  const [dfdRepEdit, setDfdRepEdit] = useState<number | null>(null);
  const [dfdTrancado, setDfdTrancado] = useState(true);
  const [salvandoDfd, setSalvandoDfd] = useState(false);

  async function verDfd(id: number) {
    setErro(null);
    try {
      const res = await fetch(`/api/dfd/${id}`);
      const j = (await res.json()) as { ok?: boolean; error?: string; dfd?: DfdDetalhe };
      if (!res.ok || !j.ok || !j.dfd) throw new Error(j.error ?? "Não foi possível abrir o DFD.");
      setDfdView(j.dfd);
      setDfdEdit(detalheParaParseado(j.dfd));
      setDfdRepEdit(j.dfd.reparticaoId);
      setDfdTrancado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o DFD.");
    }
  }

  function fecharDfd() {
    if (salvandoDfd) return;
    setDfdView(null);
    setDfdEdit(null);
    setDfdRepEdit(null);
    setDfdTrancado(true);
  }

  function destrancarDfd() {
    if (confirm("Destravar este DFD para edição? As alterações são gravadas diretamente no banco de dados.")) {
      setDfdTrancado(false);
    }
  }

  async function salvarDfd() {
    if (!dfdView || !dfdEdit) return;
    const pid = protoView?.id ?? null; // editando dentro de um protocolo aberto?
    setSalvandoDfd(true);
    setErro(null);
    try {
      const res = await fetch(`/api/dfd/${dfdView.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reparticaoId: dfdRepEdit,
          secoes: dfdEdit.secoes,
          numeroContrato: dfdEdit.numeroContrato,
          numeroAta: dfdEdit.numeroAta,
          numeroLicitacao: dfdEdit.numeroLicitacao,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar.");
      setSalvandoDfd(false);
      setDfdView(null);
      setDfdEdit(null);
      setDfdRepEdit(null);
      setDfdTrancado(true);
      router.refresh();
      // Se editado dentro de um protocolo aberto, recarrega a tabela dele (reflete a
      // edição) sem re-travar/descartar a edição de metadados em andamento.
      if (pid != null) {
        const r2 = await fetch(`/api/protocolo/${pid}`);
        const j2 = (await r2.json()) as { ok?: boolean; protocolo?: ProtocoloDetalhe };
        if (r2.ok && j2.ok && j2.protocolo) setProtoView(j2.protocolo);
      }
    } catch (e) {
      setSalvandoDfd(false);
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  async function excluirDfd(id: number, numero: string) {
    if (!confirm(`Excluir o DFD ${numero}?`)) return;
    setErro(null);
    const res = await fetch(`/api/dfd/${id}`, { method: "DELETE" });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErro(j.error ?? "Não foi possível excluir o DFD.");
      return;
    }
    router.refresh();
  }

  async function verProtocolo(id: number) {
    setErro(null);
    try {
      const res = await fetch(`/api/protocolo/${id}`);
      const j = (await res.json()) as { ok?: boolean; error?: string; protocolo?: ProtocoloDetalhe };
      if (!res.ok || !j.ok || !j.protocolo) throw new Error(j.error ?? "Não foi possível abrir o protocolo.");
      const p = j.protocolo;
      setProtoView(p);
      // Só a repartição é editável — os dados da capa são imutáveis.
      setProtoEdit({ reparticaoId: p.reparticaoId });
      setProtoTrancado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o protocolo.");
    }
  }

  function fecharProto() {
    if (salvandoProto || salvandoDfd) return;
    // Fecha também um DFD aberto no lateral (senão o modal avulso do DFD reabriria).
    setDfdView(null);
    setDfdEdit(null);
    setDfdRepEdit(null);
    setDfdTrancado(true);
    setProtoView(null);
    setProtoEdit(null);
    setProtoTrancado(true);
  }

  function destrancarProto() {
    if (confirm("Destravar este protocolo para edição? As alterações são gravadas diretamente no banco de dados.")) {
      setProtoTrancado(false);
    }
  }

  async function salvarProto() {
    if (!protoView || !protoEdit) return;
    setSalvandoProto(true);
    setErro(null);
    try {
      const res = await fetch(`/api/protocolo/${protoView.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Só a repartição — os dados da capa são imutáveis (o servidor também recusa).
        body: JSON.stringify({ reparticaoId: protoEdit.reparticaoId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar.");
      setSalvandoProto(false);
      setProtoView(null);
      setProtoEdit(null);
      setProtoTrancado(true);
      router.refresh();
    } catch (e) {
      setSalvandoProto(false);
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  async function excluirProtocolo(id: number, numero: string) {
    if (!confirm(`Excluir o protocolo ${numero}? Os DFDs continuam cadastrados (apenas desvinculados).`)) return;
    setErro(null);
    const res = await fetch(`/api/protocolo/${id}`, { method: "DELETE" });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErro(j.error ?? "Não foi possível excluir o protocolo.");
      return;
    }
    router.refresh();
  }

  function abrirVincular(d: DfdResumo) {
    setErro(null);
    setVincAlvo({ id: d.id, numero: d.numero });
    setVincSel(d.protocoloId);
  }

  async function salvarVincular() {
    if (!vincAlvo) return;
    setSalvandoVinc(true);
    setErro(null);
    try {
      const res = await fetch(`/api/dfd/${vincAlvo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocoloId: vincSel }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Não foi possível vincular.");
      setVincAlvo(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível vincular.");
    } finally {
      setSalvandoVinc(false);
    }
  }

  // ---- Planilha ÚNICA de DFDs (a MESMA dos banners) para a aba DFDs ----
  // DFDs gravados já passaram pela validação → estado "regular" (sem tabela de erro);
  // aqui aparece a coluna Protocolo e as ações (vincular/excluir).
  const dfdPorId = new Map(dfds.map((d) => [d.id, d]));
  const linhasDfdTab: LinhaDfd[] = dfds.map((d) => ({
    key: d.id,
    numero: d.numero,
    planejamento: d.planejamento,
    sigla: d.reparticaoCodigo ?? "—",
    tipo: tipoCurtoDfd(d.tipo),
    itens: d.totalItens,
    valor: valorDe(d),
    // DFD-R sem referência (contrato/ata/licitação) → ATENÇÃO (nível do ADM; "ignorar" oculta).
    estado:
      dfdRSemReferencia(d) &&
      nivelDe(regras, "dfd.referenciaRenovacao", { dfdTipo: tipoCurtoDfd(d.tipo) }) !== "ignorar"
        ? "atencao"
        : "regular",
    protocolo: d.protocoloNumero,
  }));
  const acoesDfd = (l: LinhaDfd) => {
    const d = dfdPorId.get(l.key);
    if (!podeEditar || !d) return null;
    return (
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          aria-label="Vincular a protocolo"
          onClick={() => abrirVincular(d)}
          icon={<IconLayers className="h-4 w-4" />}
        />
        <Button
          variant="ghost"
          aria-label="Excluir DFD"
          onClick={() => excluirDfd(d.id, d.numero)}
          icon={<IconTrash className="h-4 w-4" />}
          style={{ color: "var(--danger)" }}
        />
      </div>
    );
  };

  // ---- Colunas da tabela de Protocolos ----
  // ESTADO = integridade do valor da capa × somatória; SITUAÇÃO = tem DFDs?; ID = "Id"
  // da capa. Interessado saiu (redundante com Repartição).
  // Estado do protocolo respeitando o nível de `protocolo.valorCapa` por categoria (assunto).
  const estProto = (r: ProtocoloResumo) =>
    estadoProtocolo(r, regras, { categoria: classificarAssunto(r.assunto, regras.categorias) });
  const colsProto: Column<ProtocoloResumo>[] = [
    {
      key: "estado",
      header: "Estado",
      minWidth: 110,
      value: (r) => ESTADO_PROTOCOLO_ROTULO[estProto(r)],
      render: (r) => {
        const e = estProto(r);
        return (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: estadoProtocoloCor(e) }}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: estadoProtocoloCor(e) }} />
            {ESTADO_PROTOCOLO_ROTULO[e]}
          </span>
        );
      },
    },
    {
      key: "situacao",
      header: "Situação",
      minWidth: 96,
      value: (r) => SITUACAO_PROTOCOLO_ROTULO[situacaoProtocolo(r)],
      render: (r) => <span className="text-[12px] text-muted">{SITUACAO_PROTOCOLO_ROTULO[situacaoProtocolo(r)]}</span>,
    },
    { key: "numero", header: "Nº processo", value: (r) => r.numero, render: (r) => <span className="font-mono text-[12px]">{r.numero}</span> },
    {
      key: "idExterno",
      header: "Id protocolo",
      value: (r) => r.idExterno ?? "—",
      render: (r) => <span className="font-mono text-[12px]">{r.idExterno ?? "—"}</span>,
    },
    {
      key: "assunto",
      header: "Assunto",
      minWidth: 180,
      value: (r) => r.assunto ?? "—",
      render: (r) => <span className="line-clamp-1">{r.assunto ?? "—"}</span>,
    },
    {
      key: "reparticao",
      header: "Repartição",
      value: (r) => r.reparticaoCodigo ?? "—",
      render: (r) =>
        r.reparticaoCodigo ? (
          <span className="font-mono text-[12px] font-semibold text-accent">{r.reparticaoCodigo}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { key: "dfds", header: "DFDs", align: "right", filter: "none", render: (r) => num(r.totalDfds) },
    { key: "itens", header: "Itens", align: "right", filter: "none", render: (r) => num(r.totalItens) },
    { key: "valor", header: "Valor", align: "right", filter: "none", render: (r) => brl(r.valorTotal) },
    {
      key: "acoes",
      header: "",
      filter: "none",
      render: (r) =>
        podeEditar ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              aria-label="Excluir protocolo"
              onClick={() => excluirProtocolo(r.id, r.numero)}
              icon={<IconTrash className="h-4 w-4" />}
              style={{ color: "var(--danger)" }}
            />
          </div>
        ) : null,
    },
  ];

  const protocolosTab = (
    <div className="space-y-6">
      {podeEditar && (
        <ProtocoloUploadForm
          reparticoes={reparticoes}
          reparticaoAtivaId={reparticaoAtivaId}
          dfdsExistentes={dfds.map((d) => ({ numero: d.numero, protocoloNumero: d.protocoloNumero }))}
          pcas={pcas}
          regras={regras}
        />
      )}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-text-2">Protocolos ({protocolos.length})</h3>
        {protocolos.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
            Nenhum protocolo nesta visão. {podeEditar ? "Envie o PDF de um protocolo acima." : ""}
          </p>
        ) : (
          <DataTable
            columns={colsProto}
            rows={protocolos}
            getKey={(r) => r.id}
            onRowClick={(r) => verProtocolo(r.id)}
            fillHeight
            pageSize={12}
            minWidth={900}
            resumo={(linhas) =>
              `${linhas.length} protocolo${linhas.length === 1 ? "" : "s"} · ${num(
                linhas.reduce((s, p) => s + p.totalDfds, 0),
              )} DFDs · ${brl(linhas.reduce((s, p) => s + p.valorTotal, 0))}`
            }
          />
        )}
      </section>
    </div>
  );

  const dfdsTab = (
    <div className="space-y-6">
      {podeEditar && (
        <DfdUploadForm reparticoes={reparticoes} reparticaoAtivaId={reparticaoAtivaId} pcas={pcas} regras={regras} />
      )}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-text-2">DFDs importados ({dfds.length})</h3>
        {dfds.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
            Nenhum DFD importado nesta visão. {podeEditar ? "Importe um DFD acima." : ""}
          </p>
        ) : (
          <PlanilhaDfds linhas={linhasDfdTab} onRowClick={verDfd} fillHeight acoes={acoesDfd} />
        )}
      </section>
    </div>
  );

  // Partes do banner do DFD gravado — reusadas no modal avulso E como LATERAL do
  // protocolo (mesmo componente/animação da importação; só muda onde é montado).
  const dfdCadeado =
    podeEditar && dfdView ? (
      <Button
        variant="icon"
        aria-label={dfdTrancado ? "Destravar edição" : "Travar edição"}
        title={dfdTrancado ? "Destravar para editar" : "Edição destravada — clique para travar"}
        onClick={() => (dfdTrancado ? destrancarDfd() : setDfdTrancado(true))}
      >
        {dfdTrancado ? <IconLock className="h-5 w-5" /> : <IconLockOpen className="h-5 w-5 text-accent" />}
      </Button>
    ) : undefined;
  const dfdRodape =
    podeEditar && dfdView && !dfdTrancado ? (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] text-accent">Edição destravada — as alterações são gravadas no banco.</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={fecharDfd} disabled={salvandoDfd}>
            Fechar
          </Button>
          <Button onClick={salvarDfd} loading={salvandoDfd}>
            Salvar alterações
          </Button>
        </div>
      </div>
    ) : undefined;
  const dfdCorpo = dfdEdit ? (
    <DfdConferir
      dfd={dfdEdit}
      reparticoes={reparticoes}
      reparticaoAtivaId={reparticaoAtivaId}
      repId={dfdRepEdit}
      anoPca={dfdEdit.anoPca}
      autoMatch={false}
      readOnly={!podeEditar || dfdTrancado}
      regras={regras}
      onRepChange={setDfdRepEdit}
      onSecoesChange={(secoes) => setDfdEdit((d) => (d ? { ...d, secoes } : d))}
      onRefsChange={(refs) => setDfdEdit((d) => (d ? { ...d, ...refs } : d))}
    />
  ) : null;

  return (
    <div className="space-y-4">
      {erro && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
          {erro}
        </Callout>
      )}

      <Tabs
        tabs={[
          { key: "protocolos", label: "Protocolos", icon: <IconClipboard className="h-4 w-4" />, content: protocolosTab },
          { key: "dfds", label: "DFDs", icon: <IconFile className="h-4 w-4" />, content: dfdsTab },
        ]}
      />

      {/* Banner do DFD gravado (aba DFDs) = MESMO componente da importação (`DfdConferir`).
          Dentro de um protocolo, ele aparece como LATERAL do banner do protocolo (abaixo). */}
      <Modal
        open={!!dfdView && !protoView}
        onClose={fecharDfd}
        titulo={dfdView ? `DFD ${dfdView.numero}` : ""}
        cabecalho={
          dfdView ? (
            <DfdCabecalho numero={dfdView.numero} tipo={dfdView.tipo} planejamento={dfdView.planejamento} />
          ) : undefined
        }
        size="lg"
        bloqueado={salvandoDfd}
        acoesCabecalho={dfdCadeado}
        rodape={dfdRodape}
      >
        {dfdCorpo}
      </Modal>

      {/* Banner do protocolo gravado — MESMO componente/animação da importação: ao
          clicar num DFD, ele abre como LATERAL à direita (mestre-detalhe). + cadeado. */}
      <Modal
        open={!!protoView}
        onClose={fecharProto}
        titulo={protoView ? `Protocolo ${protoView.numero}` : ""}
        cabecalho={
          protoView ? (
            <ProtocoloCabecalho
              numero={protoView.numero}
              idExterno={protoView.idExterno}
              assunto={protoView.assunto}
            />
          ) : undefined
        }
        size="xl"
        bloqueado={salvandoProto || salvandoDfd}
        lateral={
          protoView
            ? {
                aberto: !!dfdView,
                titulo: dfdView ? `DFD ${dfdView.numero}` : "DFD",
                cabecalho: dfdView ? (
                  <DfdCabecalho numero={dfdView.numero} tipo={dfdView.tipo} planejamento={dfdView.planejamento} />
                ) : undefined,
                acoesCabecalho: dfdCadeado,
                rodape: dfdRodape,
                onClose: fecharDfd,
                children: dfdCorpo,
              }
            : undefined
        }
        acoesCabecalho={
          podeEditar && protoView ? (
            <Button
              variant="icon"
              aria-label={protoTrancado ? "Destravar edição" : "Travar edição"}
              title={protoTrancado ? "Destravar para editar" : "Edição destravada — clique para travar"}
              onClick={() => (protoTrancado ? destrancarProto() : setProtoTrancado(true))}
            >
              {protoTrancado ? <IconLock className="h-5 w-5" /> : <IconLockOpen className="h-5 w-5 text-accent" />}
            </Button>
          ) : undefined
        }
        rodape={
          podeEditar && !protoTrancado ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12px] text-accent">Edição destravada — as alterações são gravadas no banco.</span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={fecharProto} disabled={salvandoProto}>
                  Fechar
                </Button>
                <Button onClick={salvarProto} loading={salvandoProto}>
                  Salvar alterações
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {protoView && (
          <ProtocoloView
            protocolo={protoView}
            onVerDfd={verDfd}
            regras={regras}
            edicao={
              podeEditar && protoEdit
                ? {
                    trancado: protoTrancado,
                    reparticoes,
                    valores: protoEdit,
                    onChange: (patch) => setProtoEdit((v) => (v ? { ...v, ...patch } : v)),
                  }
                : undefined
            }
          />
        )}
      </Modal>

      {/* Vincular DFD a um protocolo (rule 4) */}
      <Modal
        open={!!vincAlvo}
        onClose={() => setVincAlvo(null)}
        titulo={vincAlvo ? `Vincular DFD ${vincAlvo.numero}` : ""}
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVincAlvo(null)} disabled={salvandoVinc}>
              Cancelar
            </Button>
            <Button onClick={salvarVincular} loading={salvandoVinc}>
              Salvar
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className={labelCls} htmlFor="vinc-proto">
            Protocolo
          </label>
          <select
            id="vinc-proto"
            className={inputCls}
            value={vincSel ?? ""}
            onChange={(e) => setVincSel(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Nenhum (desvincular) —</option>
            {protocolos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.numero}
                {p.interessado ? ` · ${p.interessado}` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-faint">
            {protocolos.length === 0
              ? "Nenhum protocolo cadastrado ainda — crie um na aba Protocolos."
              : 'Vincule este DFD a um protocolo, ou escolha "Nenhum" para desvincular.'}
          </p>
        </div>
      </Modal>
    </div>
  );
}
