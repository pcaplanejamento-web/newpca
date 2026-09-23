"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { classificarAssunto, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import type { DfdResumo, ItemDfdRow, PcaResumo } from "@/lib/dfd";
import {
  type AcaoMassa,
  ESTADO_ITEM_ROTULO,
  ESTADO_PROTOCOLO_ROTULO,
  type EstadoDfd,
  estadoItem,
  estadoItemCor,
  estadoProtocolo,
  estadoProtocoloCor,
  mensagensItem,
  type ResumoEstado,
  resumoEstado,
  SITUACAO_PROTOCOLO_ROTULO,
  situacaoProtocolo,
} from "@/lib/dfd-tratamento";
import { brl, dataBR, num } from "@/lib/format";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import type { ProtocoloResumo } from "@/lib/protocolo";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import { BarraEdicaoMassa } from "./BarraEdicaoMassa";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { DfdGravado } from "./DfdGravado";
import { DfdUploadForm } from "./DfdUploadForm";
import { EstadoPonto, EstadoResumo } from "./EstadoCelula";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconLayers, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { ProtocoloGravado } from "./ProtocoloGravado";
import { ProtocoloUploadForm } from "./ProtocoloUploadForm";
import { Segmented } from "./Segmented";
import { toast } from "./Toast";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  numeroInteressado?: string | null;
  setorRequisitante?: string | null;
  orgaoId?: number | null;
  orgaoProprio?: boolean | null;
  oculto?: boolean | null;
  responsaveis: Responsaveis;
};
type Orgao = { id: number; sigla: string; nome: string; orgaoEntidade: string | null; assinaturaUnica?: boolean | null };
/** Conferência de UMA linha de DFD (vinda de `/api/dfd/conferencia` — a MESMA da análise). */
type ConfLinha = { id: number; estado: EstadoDfd; resumo: ResumoEstado | null; validacao: "auto" | "equipe" | null };

/** Visão da tela Mesa: o MESMO espaço mostra Protocolos, DFDs ou a lista plana de Itens. */
type Vista = "protocolos" | "dfds" | "itens";
/** DFDs conferidos por requisição (fatias — a lista abre leve e o Estado chega em seguida). */
const FATIA_CONFERENCIA = 150;

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
  // Banners do GRAVADO — os MESMOS componentes da análise (protocolo / DFD solto).
  const [protoAberto, setProtoAberto] = useState<{ id: number; dfd: number | null } | null>(null);
  const [dfdAberto, setDfdAberto] = useState<{ id: number; item: { item: number | null; codigo: string | null } | null } | null>(null);
  const [vincAlvo, setVincAlvo] = useState<{ id: number; numero: string } | null>(null);
  const [vincSel, setVincSel] = useState<number | null>(null);
  const [salvandoVinc, setSalvandoVinc] = useState(false);
  // Seleção + edição EM MASSA na lista de DFDs (mesma barra da análise; grava no banco).
  const [selDfds, setSelDfds] = useState<Set<string | number>>(new Set());
  const [aplicandoMassa, setAplicandoMassa] = useState(false);

  // Visão ativa (Protocolos/DFDs/Itens) — um Segmented alterna o MESMO espaço com morph.
  const [vista, setVista] = useState<Vista>("protocolos");
  // Itens (lista plana): carregada SOB DEMANDA na 1ª vez que a visão Itens abre (não pesa o load
  // inicial). `null` = ainda não buscado; recarrega quando os DFDs mudam (após import/edição).
  const [itens, setItens] = useState<ItemDfdRow[] | null>(null);
  const [carregandoItens, setCarregandoItens] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset intencional ao trocar a referência de `dfds`.
  useEffect(() => setItens(null), [dfds]);
  useEffect(() => {
    if (vista !== "itens" || itens !== null) return;
    const ac = new AbortController();
    setCarregandoItens(true);
    fetch("/api/dfd/itens", { signal: ac.signal })
      .then((r) => r.json() as Promise<{ ok?: boolean; itens?: ItemDfdRow[] }>)
      .then((j) => {
        if (!ac.signal.aborted) setItens(j.ok ? (j.itens ?? []) : []);
      })
      .catch(() => {
        if (!ac.signal.aborted) setItens([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setCarregandoItens(false);
      });
    return () => ac.abort();
  }, [vista, itens]);

  // CONFERÊNCIA da lista de DFDs (a MESMA da análise, calculada no servidor sobre o DFD completo) —
  // lazy: só com a visão DFDs aberta, em fatias; cada linha mostra "Conferindo…" até chegar. Refaz
  // quando a lista muda (router.refresh após edição/importação).
  const confRef = useRef<{ base: DfdResumo[] | null; m: Map<number, ConfLinha> }>({ base: null, m: new Map() });
  const [, setConfVersao] = useState(0);
  // Falha de rede/servidor na conferência: as linhas pendentes param de girar (ficam "Pendente").
  const [confFalhou, setConfFalhou] = useState(false);
  useEffect(() => {
    if (vista !== "dfds") return;
    setConfFalhou(false);
    if (confRef.current.base !== dfds) confRef.current = { base: dfds, m: new Map() };
    const alvo = confRef.current;
    const faltam = dfds.map((d) => d.id).filter((id) => !alvo.m.has(id));
    if (faltam.length === 0) return;
    const ac = new AbortController();
    void (async () => {
      for (let i = 0; i < faltam.length && !ac.signal.aborted; i += FATIA_CONFERENCIA) {
        try {
          const r = await fetch("/api/dfd/conferencia", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: faltam.slice(i, i + FATIA_CONFERENCIA) }),
            signal: ac.signal,
          });
          const j = (await r.json()) as { ok?: boolean; linhas?: ConfLinha[] };
          if (ac.signal.aborted) break;
          if (!r.ok || !j.ok) {
            setConfFalhou(true);
            break;
          }
          for (const l of j.linhas ?? []) alvo.m.set(l.id, l);
          setConfVersao((v) => v + 1);
        } catch {
          if (!ac.signal.aborted) setConfFalhou(true); // rede — reconfere na próxima abertura da visão
          break;
        }
      }
    })();
    return () => ac.abort();
  }, [vista, dfds]);
  const conf = confRef.current.base === dfds ? confRef.current.m : new Map<number, ConfLinha>();

  const atualizarListas = () => router.refresh();

  async function excluirDfd(id: number, numero: string) {
    if (!confirm(`Excluir o DFD ${numero}? Os itens dele também são excluídos.`)) return;
    setErro(null);
    const res = await fetch(`/api/dfd/${id}`, { method: "DELETE" });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErro(j.error ?? "Não foi possível excluir o DFD.");
      return;
    }
    router.refresh();
  }

  async function excluirProtocolo(id: number, numero: string, totalDfds: number) {
    const aviso =
      totalDfds > 0
        ? `Excluir o protocolo ${numero}? Os ${totalDfds} DFD(s) vinculados e seus itens também serão excluídos.`
        : `Excluir o protocolo ${numero}?`;
    if (!confirm(aviso)) return;
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

  /** Edição EM MASSA na lista de DFDs gravados — mesma barra da análise; grava no banco (com confirmação). */
  async function aplicarMassa(acao: AcaoMassa) {
    const ids = [...selDfds].map(Number);
    if (ids.length === 0) return;
    if (!confirm(`Aplicar a alteração em ${ids.length} DFD(s)? Ela é gravada diretamente no banco.`)) return;
    setAplicandoMassa(true);
    setErro(null);
    try {
      const res = await fetch("/api/dfd/massa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, acao }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; alterados?: number; falhas?: { numero: string; motivo: string }[] };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Não foi possível aplicar a edição em massa.");
      const falhas = j.falhas ?? [];
      toast.success(`${num(j.alterados ?? 0)} DFD(s) alterado(s).`);
      if (falhas.length > 0) setErro(`Não alterados: ${falhas.map((f) => `DFD ${f.numero} (${f.motivo})`).join(" · ")}`);
      setSelDfds(new Set());
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aplicar a edição em massa.");
    } finally {
      setAplicandoMassa(false);
    }
  }

  // ---- Planilha ÚNICA de DFDs (a MESMA dos banners) para a aba DFDs — conferência real por linha. ----
  const dfdPorId = new Map(dfds.map((d) => [d.id, d]));
  const linhasDfdTab: LinhaDfd[] = dfds.map((d): LinhaDfd => {
    const c = conf.get(d.id);
    return {
      key: d.id,
      numero: d.numero,
      planejamento: d.planejamento,
      sigla: d.reparticaoCodigo ?? "—",
      tipo: tipoCurtoDfd(d.tipo),
      itens: d.totalItens,
      valor: d.valorTotal ?? 0,
      estado: c?.estado ?? "pendente",
      resumo: c?.resumo ?? undefined,
      validacao: c?.validacao ?? null,
      processando: c || confFalhou ? null : "conferindo",
      assinaturas: d.assinaturaGrupos,
      protocolo: d.protocoloNumero,
    };
  });
  const acoesDfd = (l: LinhaDfd) => {
    const d = dfdPorId.get(l.key);
    if (!podeEditar || !d) return null;
    return (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" aria-label="Vincular a protocolo" onClick={() => abrirVincular(d)} icon={<IconLayers className="h-4 w-4" />} />
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
  // ESTADO = conciliação do valor da capa × somatória (mesma régua do banner); SITUAÇÃO = tem DFDs?
  const estProto = (r: ProtocoloResumo) => estadoProtocolo(r, regras, { categoria: classificarAssunto(r.assunto) });
  const colsProto: Column<ProtocoloResumo>[] = [
    {
      key: "estado",
      header: "Estado",
      nowrap: true,
      value: (r) => ESTADO_PROTOCOLO_ROTULO[estProto(r)],
      render: (r) => {
        const e = estProto(r);
        return (
          <EstadoPonto
            cor={estadoProtocoloCor(e, regras)}
            rotulo={ESTADO_PROTOCOLO_ROTULO[e]}
            title={e === "atencao" ? "Valor da capa ausente/zerado ou diferente da somatória dos DFDs" : undefined}
          />
        );
      },
    },
    {
      key: "situacao",
      header: "Situação",
      nowrap: true,
      value: (r) => SITUACAO_PROTOCOLO_ROTULO[situacaoProtocolo(r)],
      render: (r) => <span className="text-[12px] text-muted">{SITUACAO_PROTOCOLO_ROTULO[situacaoProtocolo(r)]}</span>,
    },
    {
      key: "data",
      header: "Data",
      align: "center",
      nowrap: true,
      value: (r) => r.data ?? "",
      render: (r) => <span className="text-[12px] text-muted">{r.data ? dataBR(r.data) : "—"}</span>,
    },
    { key: "numero", header: "Nº processo", nowrap: true, value: (r) => r.numero, render: (r) => <span className="font-mono text-[12px]">{r.numero}</span> },
    {
      key: "idExterno",
      header: "Id protocolo",
      nowrap: true,
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
      nowrap: true,
      value: (r) => r.reparticaoCodigo ?? "—",
      render: (r) =>
        r.reparticaoCodigo ? (
          <span className="font-mono text-[12px] font-semibold text-accent">{r.reparticaoCodigo}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { key: "dfds", header: "DFDs", align: "center", filter: "none", nowrap: true, render: (r) => num(r.totalDfds) },
    { key: "itens", header: "Itens", align: "center", filter: "none", nowrap: true, render: (r) => num(r.totalItens) },
    { key: "valor", header: "Valor", align: "right", filter: "none", nowrap: true, render: (r) => brl(r.valorTotal) },
    {
      key: "acoes",
      header: "",
      filter: "none",
      nowrap: true,
      render: (r) =>
        podeEditar ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              aria-label="Excluir protocolo"
              onClick={() => excluirProtocolo(r.id, r.numero, r.totalDfds)}
              icon={<IconTrash className="h-4 w-4" />}
              style={{ color: "var(--danger)" }}
            />
          </div>
        ) : null,
    },
  ];

  // Colunas da visão "Itens" (lista PLANA de todos os itens dos DFDs em escopo) — com o ESTADO do item
  // (mesma célula da tabela de itens do banner). Clicar abre o DFD de origem já no item.
  const colsItens: Column<ItemDfdRow>[] = [
    {
      key: "estado",
      header: "Estado",
      nowrap: true,
      value: (r) => resumoEstado(mensagensItem(r)).rotulo || ESTADO_ITEM_ROTULO[estadoItem(r)],
      render: (r) => {
        const res = resumoEstado(mensagensItem(r));
        if (res.rotulo) return <EstadoResumo res={res} />;
        const e = estadoItem(r);
        return <EstadoPonto cor={estadoItemCor(e)} rotulo={ESTADO_ITEM_ROTULO[e]} />;
      },
    },
    {
      key: "protocolo",
      header: "Protocolo",
      nowrap: true,
      value: (r) => r.protocoloNumero ?? "—",
      render: (r) => (r.protocoloNumero ? <span className="font-mono text-[12px]">{r.protocoloNumero}</span> : <span className="text-faint">—</span>),
    },
    { key: "dfd", header: "Nº DFD", nowrap: true, value: (r) => r.dfdNumero, render: (r) => <span className="font-mono text-[12px]">{r.dfdNumero}</span> },
    {
      key: "sigla",
      header: "Sigla",
      nowrap: true,
      value: (r) => r.sigla ?? "—",
      render: (r) => (r.sigla ? <span className="font-mono text-[12px] font-semibold text-accent">{r.sigla}</span> : <span className="text-faint">—</span>),
    },
    { key: "item", header: "Item", align: "center", nowrap: true, value: (r) => String(r.item ?? ""), render: (r) => r.item ?? "—" },
    { key: "codigo", header: "Código", nowrap: true, value: (r) => r.codigo ?? "", render: (r) => <span className="font-mono text-[12px]">{r.codigo ?? "—"}</span> },
    {
      key: "descricao",
      header: "Descrição",
      minWidth: 260,
      value: (r) => r.descricao ?? "",
      render: (r) => <span className="line-clamp-2">{r.descricao ?? "—"}</span>,
    },
    { key: "unidade", header: "Unidade", nowrap: true, value: (r) => r.unidade ?? "", render: (r) => r.unidade ?? "—" },
    { key: "qtd", header: "Qtd.", align: "center", nowrap: true, value: (r) => String(r.quantidade ?? ""), render: (r) => (r.quantidade != null ? num(r.quantidade) : "—") },
    { key: "vunit", header: "Vlr. unit.", align: "right", filter: "none", nowrap: true, value: (r) => String(r.valorUnitario ?? ""), render: (r) => (r.valorUnitario != null ? brl(r.valorUnitario) : "—") },
    { key: "vtotal", header: "Vlr. total", align: "right", filter: "none", nowrap: true, value: (r) => String(r.valorTotal ?? ""), render: (r) => (r.valorTotal != null ? brl(r.valorTotal) : "—") },
  ];

  // Corpo de cada visão. Alturas de linha DIFERENTES por visão: protocolo alta · DFD média · item fina.
  const vazio = (texto: string) => <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">{texto}</p>;
  const tabelaProtocolos =
    protocolos.length === 0 ? (
      vazio(`Nenhum protocolo nesta visão. ${podeEditar ? "Importe um protocolo pelo botão acima." : ""}`)
    ) : (
      <DataTable
        columns={colsProto}
        rows={protocolos}
        getKey={(r) => r.id}
        onRowClick={(r) => setProtoAberto({ id: r.id, dfd: null })}
        scrollInterno
        minWidth={980}
        density="comfortable"
        resumo={(linhas) =>
          `${linhas.length} protocolo${linhas.length === 1 ? "" : "s"} · ${num(linhas.reduce((s, p) => s + p.totalDfds, 0))} DFDs · ${brl(
            linhas.reduce((s, p) => s + p.valorTotal, 0),
          )}`
        }
      />
    );
  const tabelaDfds =
    dfds.length === 0 ? (
      vazio(`Nenhum DFD nesta visão. ${podeEditar ? "Importe um DFD pelo botão acima." : ""}`)
    ) : (
      <div>
        {podeEditar && selDfds.size > 0 && (
          <BarraEdicaoMassa
            qtd={selDfds.size}
            reparticoes={reparticoes}
            regras={regras}
            aplicando={aplicandoMassa}
            onAplicar={aplicarMassa}
            onLimpar={() => setSelDfds(new Set())}
          />
        )}
        <PlanilhaDfds
          linhas={linhasDfdTab}
          unica
          scrollInterno
          selecionavel={podeEditar}
          selected={selDfds}
          onSelected={setSelDfds}
          onRowClick={(id) => setDfdAberto({ id, item: null })}
          ativa={dfdAberto?.id ?? null}
          acoes={acoesDfd}
          regras={regras}
        />
      </div>
    );
  const tabelaItens =
    carregandoItens || itens === null ? (
      vazio("Carregando itens…")
    ) : itens.length === 0 ? (
      vazio("Nenhum item nesta visão.")
    ) : (
      <DataTable
        columns={colsItens}
        rows={itens}
        getKey={(r) => r.id}
        onRowClick={(r) => setDfdAberto({ id: r.dfdId, item: { item: r.item, codigo: r.codigo } })}
        scrollInterno
        minWidth={1120}
        density="compact"
        resumo={(linhas) => `${num(linhas.length)} ${linhas.length === 1 ? "item" : "itens"} · ${brl(linhas.reduce((s, i) => s + (i.valorTotal ?? 0), 0))}`}
      />
    );

  return (
    <div className="space-y-4">
      {erro && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
          {erro}
        </Callout>
      )}

      {/* Segmento de VISÃO (Protocolos/DFDs/Itens) na MESMA linha do "Importar" (lançador contextual). */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Vista>
          value={vista}
          onChange={setVista}
          options={[
            { value: "protocolos", label: "Protocolos" },
            { value: "dfds", label: "DFDs" },
            { value: "itens", label: "Itens" },
          ]}
        />
        {podeEditar && (vista === "protocolos" || vista === "dfds") && (
          <div className="flex-1">
            {vista === "protocolos" ? (
              <ProtocoloUploadForm
                reparticoes={reparticoes}
                reparticaoAtivaId={reparticaoAtivaId}
                dfdsExistentes={dfds.map((d) => ({ numero: d.numero, protocoloNumero: d.protocoloNumero }))}
                pcas={pcas}
                regras={regras}
                orgaos={orgaos}
              />
            ) : (
              <DfdUploadForm reparticoes={reparticoes} reparticaoAtivaId={reparticaoAtivaId} pcas={pcas} regras={regras} orgaos={orgaos} />
            )}
          </div>
        )}
      </div>

      {/* MESMO espaço para as 3 visões — `key={vista}` remonta e replaya o morph (fade+escala). */}
      <div key={vista} className="animate-cat-morph">
        {vista === "protocolos" ? tabelaProtocolos : vista === "dfds" ? tabelaDfds : tabelaItens}
      </div>

      {/* DFD GRAVADO solto (listas DFDs/Itens) — mesmo corpo/rodapé/painel da análise. */}
      <DfdGravado
        dfdId={dfdAberto?.id ?? null}
        itemInicial={dfdAberto?.item ?? null}
        onClose={() => setDfdAberto(null)}
        onVerProtocolo={(protocoloId, dfdId) => {
          setDfdAberto(null);
          setProtoAberto({ id: protocoloId, dfd: dfdId });
        }}
        podeEditar={podeEditar}
        reparticoes={reparticoes}
        reparticaoAtivaId={reparticaoAtivaId}
        regras={regras}
        orgaos={orgaos}
        onAlterado={atualizarListas}
      />

      {/* PROTOCOLO GRAVADO — os MESMOS componentes/conferência da protocolação (tabela única). */}
      <ProtocoloGravado
        protocoloId={protoAberto?.id ?? null}
        dfdInicial={protoAberto?.dfd ?? null}
        onClose={() => setProtoAberto(null)}
        podeEditar={podeEditar}
        reparticoes={reparticoes}
        reparticaoAtivaId={reparticaoAtivaId}
        regras={regras}
        orgaos={orgaos}
        onAlterado={atualizarListas}
      />

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
          <select id="vinc-proto" className={inputCls} value={vincSel ?? ""} onChange={(e) => setVincSel(e.target.value ? Number(e.target.value) : null)}>
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
