"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { LinhaAuditoria } from "@/lib/auditoria";
import { classificarAssunto, nivelDe, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import { conferirItensCliente } from "@/lib/catalogo-conferir-cliente";
import type { DfdDetalhe, DfdResumo, PcaResumo } from "@/lib/dfd";
import {
  dfdRSemReferencia,
  editarItemDfd,
  ESTADO_PROTOCOLO_ROTULO,
  estadoProtocolo,
  estadoProtocoloCor,
  SITUACAO_PROTOCOLO_ROTULO,
  situacaoProtocolo,
  STATUS_MENSAGEM_COR,
} from "@/lib/dfd-tratamento";
import { brl, num } from "@/lib/format";
import { type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import type { ProtocoloDetalhe, ProtocoloResumo } from "@/lib/protocolo";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { DfdConferir, mensagensDoDfd, type PainelDfd } from "./DfdConferir";
import { DfdUploadForm } from "./DfdUploadForm";
import { DfdCabecalho } from "./DfdView";
import { inputCls, labelCls } from "./formStyles";
import { Historico } from "./Historico";
import { IconAlert, IconClipboard, IconClock, IconFile, IconLayers, IconLock, IconLockOpen, IconTrash } from "./icons";
import { ItemDetalhe } from "./ItemDetalhe";
import { BotaoVerMensagens, MensagensDfd } from "./MensagensDfd";
import { Modal } from "./Modal";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { ProtocoloUploadForm } from "./ProtocoloUploadForm";
import { ProtocoloCabecalho, ProtocoloView, type ProtocoloEdicaoValores } from "./ProtocoloView";
import { Tabs } from "./Tabs";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  numeroInteressado?: string | null;
  setorRequisitante?: string | null;
  orgaoId?: number | null;
  oculto?: boolean | null;
  responsaveis: Responsaveis;
};
type Orgao = { id: number; sigla: string; nome: string; orgaoEntidade: string | null; assinaturaUnica?: boolean | null };

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
  orgaos = [],
}: {
  podeEditar: boolean;
  dfds: DfdResumo[];
  protocolos: ProtocoloResumo[];
  reparticoes: Rep[];
  reparticaoAtivaId: number | null;
  pcas?: PcaResumo[];
  regras?: RegrasAvaliacao;
  orgaos?: Orgao[];
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
  // Painel do item: cadeado é POR CAMPO (dentro do ItemDetalhe). `itemEditando` = algum campo
  // destravado (mostra "Salvar"); `itemNonce` remonta o painel após salvar para re-travar.
  const [itemEditando, setItemEditando] = useState(false);
  const [itemNonce, setItemNonce] = useState(0);
  const [salvandoDfd, setSalvandoDfd] = useState(false);
  // Painel da DIREITA do DFD gravado: mensagens OU detalhe de um item OU histórico.
  const [painel, setPainel] = useState<PainelDfd | null>(null);
  const [historicoDfd, setHistoricoDfd] = useState<LinhaAuditoria[] | null>(null);
  const [ancoraAlvo, setAncoraAlvo] = useState<{ ancora: string; cor: string; nonce: number } | null>(null);
  // Conformidade dos itens do DFD aberto com o catálogo (conferida no servidor ao abrir).
  const [conformidade, setConformidade] = useState<Map<string, ConferenciaItem>>();

  // Confere os itens do DFD aberto contra o catálogo (a referência de `dfdEdit.itens` é
  // estável na edição de seções/refs → só reconfere ao abrir/trocar de DFD).
  const itensEdit = dfdEdit?.itens;
  const tipoEdit = dfdEdit?.tipo ?? null;
  useEffect(() => {
    if (!itensEdit || itensEdit.length === 0) {
      setConformidade(undefined);
      return;
    }
    const ac = new AbortController();
    setConformidade(undefined);
    conferirItensCliente(itensEdit, tipoEdit, ac.signal).then((m) => {
      if (!ac.signal.aborted) setConformidade(m);
    });
    return () => ac.abort();
  }, [itensEdit, tipoEdit]);

  // Busca o histórico do DFD ao abrir o painel "histórico".
  useEffect(() => {
    if (painel?.tipo !== "historico" || !dfdView) return;
    let vivo = true;
    setHistoricoDfd(null);
    fetch(`/api/dfd/${dfdView.id}/historico`)
      .then((r) => r.json() as Promise<{ ok?: boolean; historico?: LinhaAuditoria[] }>)
      .then((j) => {
        if (vivo) setHistoricoDfd(j.ok ? (j.historico ?? []) : []);
      })
      .catch(() => vivo && setHistoricoDfd([]));
    return () => {
      vivo = false;
    };
  }, [painel, dfdView]);

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
      setItemEditando(false);
      setPainel(null); // abre só o DFD (sem mensagens/detalhe do anterior)
      setAncoraAlvo(null);
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
    setItemEditando(false);
    setPainel(null);
    setAncoraAlvo(null);
  }

  function destrancarDfd() {
    if (confirm("Destravar este DFD para edição? As alterações são gravadas diretamente no banco de dados.")) {
      setDfdTrancado(false);
    }
  }

  // Salva os campos editados do item (cadeados por campo abertos): reescreve `dfd_itens` e
  // recomputa o total do DFD; re-trava (remonta o painel via nonce) e mantém o painel aberto.
  async function salvarItensDfd() {
    if (!dfdView || !dfdEdit) return;
    const pid = protoView?.id ?? null;
    setSalvandoDfd(true);
    setErro(null);
    try {
      const res = await fetch(`/api/dfd/${dfdView.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: dfdEdit.itens }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar os itens.");
      setSalvandoDfd(false);
      setItemEditando(false);
      setItemNonce((n) => n + 1); // remonta o painel do item → re-trava os campos
      router.refresh();
      if (pid != null) {
        const r2 = await fetch(`/api/protocolo/${pid}`);
        const j2 = (await r2.json()) as { ok?: boolean; protocolo?: ProtocoloDetalhe };
        if (r2.ok && j2.ok && j2.protocolo) setProtoView(j2.protocolo);
      }
    } catch (e) {
      setSalvandoDfd(false);
      setErro(e instanceof Error ? e.message : "Não foi possível salvar os itens.");
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
          // Campos de CONTEÚDO do cabeçalho (identificadores seguem imutáveis no servidor).
          objeto: dfdEdit.objeto,
          orgaoEntidade: dfdEdit.orgaoEntidade,
          setorRequisitante: dfdEdit.setorRequisitante,
          responsavel: dfdEdit.responsavel,
          matricula: dfdEdit.matricula,
          email: dfdEdit.email,
          telefone: dfdEdit.telefone,
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
      // Repartição + campos de CONTEÚDO da capa são editáveis (cadeado por campo);
      // os identificadores (número/Id/data) permanecem imutáveis.
      setProtoEdit({
        reparticaoId: p.reparticaoId,
        interessado: p.interessado,
        assunto: p.assunto,
        observacao: p.observacao,
        documento: p.documento,
        valorCapa: p.valorCapa,
        localReparticao: p.localReparticao,
      });
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
    setPainel(null);
    setAncoraAlvo(null);
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
        // Repartição + campos de CONTEÚDO da capa (identificadores seguem imutáveis no servidor).
        body: JSON.stringify({
          reparticaoId: protoEdit.reparticaoId,
          interessado: protoEdit.interessado,
          assunto: protoEdit.assunto,
          observacao: protoEdit.observacao,
          documento: protoEdit.documento,
          valorCapa: protoEdit.valorCapa,
          localReparticao: protoEdit.localReparticao,
        }),
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
    estadoProtocolo(r, regras, { categoria: classificarAssunto(r.assunto) });
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
      header: "Unidade",
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
          orgaos={orgaos}
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
        <DfdUploadForm reparticoes={reparticoes} reparticaoAtivaId={reparticaoAtivaId} pcas={pcas} regras={regras} orgaos={orgaos} />
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
  // Mensagens (erro/atenção/acerto) do DFD gravado — botão (rodapé) + painel lateral. A
  // categoria (para as exceções do ADM) vem do assunto do protocolo, quando aberto dentro de um.
  const repEditSel = reparticoes.find((r) => r.id === dfdRepEdit) ?? null;
  const categoriaDfd = protoView ? classificarAssunto(protoView.assunto) : null;
  const mensagens = dfdEdit ? mensagensDoDfd(dfdEdit, repEditSel, dfdEdit.anoPca, regras, categoriaDfd, orgaos, conformidade) : [];
  const irParaMensagem = (m: { ancora: string; status: "erro" | "atencao" | "acerto" }) => {
    // O painel de mensagens fica AO LADO do DFD (não substitui) → só rola/destaca a âncora.
    setAncoraAlvo({ ancora: m.ancora, cor: STATUS_MENSAGEM_COR[m.status], nonce: Date.now() });
  };
  // Rodapé FIXO do banner do DFD: "Ver mensagens" + numeração à esquerda; ações de edição à direita.
  const dfdRodape = dfdView ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <BotaoVerMensagens
          mensagens={mensagens}
          aberto={painel?.tipo === "mensagens"}
          onToggle={() => setPainel((p) => (p?.tipo === "mensagens" ? null : { tipo: "mensagens" }))}
        />
        <Button
          variant="secondary"
          onClick={() => setPainel((p) => (p?.tipo === "historico" ? null : { tipo: "historico" }))}
        >
          <IconClock className="h-4 w-4" /> Histórico
        </Button>
      </div>
      {podeEditar && !dfdTrancado && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-accent">Edição destravada — salva no banco.</span>
          <Button variant="secondary" onClick={fecharDfd} disabled={salvandoDfd}>
            Fechar
          </Button>
          <Button onClick={salvarDfd} loading={salvandoDfd}>
            Salvar alterações
          </Button>
        </div>
      )}
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
      orgaos={orgaos}
      conformidade={conformidade}
      ancoraAlvo={ancoraAlvo}
      itemAtivo={painel?.tipo === "item" ? painel.idx : null}
      onItemClick={(idx) => setPainel({ tipo: "item", idx })}
      onRepChange={setDfdRepEdit}
      onSecoesChange={(secoes) => setDfdEdit((d) => (d ? { ...d, secoes } : d))}
      onRefsChange={(refs) => setDfdEdit((d) => (d ? { ...d, ...refs } : d))}
      onCamposChange={(campos) => setDfdEdit((d) => (d ? { ...d, ...campos } : d))}
    />
  ) : null;
  // Conteúdo do painel da DIREITA (mensagens OU detalhe do item selecionado).
  const painelIdx = painel?.tipo === "item" ? painel.idx : -1;
  const painelItem = painelIdx >= 0 ? (dfdEdit?.itens[painelIdx] ?? null) : null;
  const painelDireito =
    painel?.tipo === "historico" ? (
      <Historico entradas={historicoDfd ?? []} vazio={historicoDfd === null ? "Carregando…" : "Sem histórico deste DFD."} />
    ) : painelItem ? (
      <ItemDetalhe
        key={`${painelIdx}:${itemNonce}`}
        item={painelItem}
        conformidade={conformidade}
        regras={regras}
        tipo={dfdView?.tipo}
        editavel={podeEditar}
        onChange={(patch) => setDfdEdit((d) => (d ? editarItemDfd(d, painelIdx, patch) : d))}
        onEditandoChange={setItemEditando}
      />
    ) : (
      <MensagensDfd mensagens={mensagens} numero={dfdView?.numero ?? ""} tipo={dfdView?.tipo} onIrPara={irParaMensagem} />
    );
  const painelTitulo =
    painel?.tipo === "historico"
      ? `Histórico — DFD ${dfdView?.numero ?? ""}`
      : painelItem
        ? `Item ${painelItem.item ?? painelIdx + 1} — DFD ${dfdView?.numero ?? ""}`
        : `Mensagens — DFD ${dfdView?.numero ?? ""}`;
  // Rodapé do painel do item: salvar (aparece quando ALGUM campo está destravado; só editor).
  const painelRodape =
    painelItem && podeEditar && itemEditando ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-[12px] text-accent">Campo destravado — salva no banco.</span>
        <Button onClick={salvarItensDfd} loading={salvandoDfd}>
          Salvar alterações
        </Button>
      </div>
    ) : undefined;

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
        lateral={
          dfdView
            ? {
                aberto: painel != null,
                titulo: painelTitulo,
                rodape: painelRodape,
                onClose: () => setPainel(null),
                children: painelDireito,
              }
            : undefined
        }
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
        lateral2={
          protoView
            ? {
                aberto: !!dfdView && painel != null,
                titulo: painelTitulo,
                rodape: painelRodape,
                onClose: () => setPainel(null),
                children: painelDireito,
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
            dfdAtivo={dfdView?.id ?? null}
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
