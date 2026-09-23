"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
import type { AcaoMassaProtocolo } from "@/lib/dfd-validation";
import { type AcaoMassaItem, descreverAcaoItem, fatiarItensPorDfd, resumirFalhasItens } from "@/lib/massa-itens";
import type { ProtocoloResumo } from "@/lib/protocolo";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import { BarraEdicaoMassa, BarraEdicaoMassaItens, BarraEdicaoMassaProtocolos } from "./BarraEdicaoMassa";
import { type AberturaMesa, BannersMesa } from "./BannersMesa";
import { BarraSelecao, ResumoSelecao } from "./BarraSelecao";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { DfdUploadForm } from "./DfdUploadForm";
import { EstadoPonto, EstadoResumo } from "./EstadoCelula";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconLayers, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { Progress } from "./Progress";
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
/** DFDs/protocolos por requisição da edição em massa (cabe folgado no limite de consultas por invocação do D1). */
const FATIA_MASSA = 20;
/** Itens por requisição da edição em massa: ≤ 100 itens de ≤ 5 DFDs (cada DFD grava num lote atômico). */
const FATIA_ITENS = 100;
const FATIA_ITENS_DFDS = 5;
/** Espaço (px) entre a tabela e a barra de seleção fixa (o `space-y-4` da tela). */
const GAP_BARRA = 16;
type Sel = Set<string | number>;
/** Mantém na seleção só as chaves que ainda existem (após recarregar as listas). */
const podar = (sel: Sel, validas: Set<number>): Sel => {
  const n = new Set([...sel].filter((k) => validas.has(Number(k))));
  return n.size === sel.size ? sel : n;
};
/** Chave da conferência de um DFD: muda quando o DFD é gravado (atualizadoEm), troca de unidade ou a
 * categoria do protocolo muda — só esses são reconferidos depois de um `router.refresh()`. */
const chaveConf = (d: DfdResumo) => `${d.id}|${d.atualizadoEm ?? ""}|${d.reparticaoId ?? ""}|${d.protocoloAssunto ?? ""}`;

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
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);
  const [vincAlvo, setVincAlvo] = useState<{ id: number; numero: string } | null>(null);
  const [vincSel, setVincSel] = useState<number | null>(null);
  const [salvandoVinc, setSalvandoVinc] = useState(false);
  // Seleção + edição EM MASSA nas três visões (a barra fica FIXA no rodapé do display; grava no banco).
  const [selDfds, setSelDfds] = useState<Sel>(new Set());
  const [selProtos, setSelProtos] = useState<Sel>(new Set());
  const [selItens, setSelItens] = useState<Sel>(new Set());
  const [aplicandoMassa, setAplicandoMassa] = useState<{ feito: number; total: number; rotulo: string } | null>(null);
  // Altura da barra de seleção fixa — as tabelas (scroll interno) reservam esse espaço.
  const [alturaBarra, setAlturaBarra] = useState(0);
  const reserva = alturaBarra > 0 ? alturaBarra + GAP_BARRA : 0;
  // Listas recarregadas: some da seleção o que não existe mais.
  useEffect(() => setSelDfds((s) => podar(s, new Set(dfds.map((d) => d.id)))), [dfds]);
  useEffect(() => setSelProtos((s) => podar(s, new Set(protocolos.map((p) => p.id)))), [protocolos]);

  // Visão ativa (Protocolos/DFDs/Itens) — um Segmented alterna o MESMO espaço com morph.
  const [vista, setVista] = useState<Vista>("protocolos");
  // Itens (lista plana): carregada SOB DEMANDA na 1ª vez que a visão Itens abre (não pesa o load
  // inicial). `null` = ainda não buscado; recarrega quando os DFDs mudam (após import/edição).
  const [itens, setItens] = useState<ItemDfdRow[] | null>(null);
  const [carregandoItens, setCarregandoItens] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset intencional ao trocar a referência de `dfds`.
  useEffect(() => {
    setItens(null);
    setSelItens(new Set()); // os ids dos itens podem mudar ao regravar um DFD
  }, [dfds]);
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
  // lazy: só com a visão DFDs aberta, em fatias; cada linha mostra "Conferindo…" até chegar. Os
  // resultados ficam em cache pela chave do DFD (`chaveConf`): depois de um `router.refresh()` só os
  // DFDs que MUDARAM são reconferidos. Regras/órgãos/unidades novos (contexto) zeram o cache.
  const ctxConf = useMemo(
    () => JSON.stringify([regras, orgaos, reparticoes.map((r) => [r.id, r.orgaoId ?? null, r.responsaveis])]),
    [regras, orgaos, reparticoes],
  );
  const confRef = useRef<{ ctx: string; m: Map<string, ConfLinha> }>({ ctx: "", m: new Map() });
  const [, setConfVersao] = useState(0);
  // Falha de rede/servidor na conferência: as linhas pendentes param de girar (ficam "Pendente").
  const [confFalhou, setConfFalhou] = useState(false);
  useEffect(() => {
    if (vista !== "dfds") return;
    setConfFalhou(false);
    if (confRef.current.ctx !== ctxConf) confRef.current = { ctx: ctxConf, m: new Map() };
    const alvo = confRef.current;
    const faltam = dfds.filter((d) => !alvo.m.has(chaveConf(d)));
    if (faltam.length === 0) return;
    const chavePorId = new Map(faltam.map((d) => [d.id, chaveConf(d)]));
    const ac = new AbortController();
    void (async () => {
      for (let i = 0; i < faltam.length && !ac.signal.aborted; i += FATIA_CONFERENCIA) {
        try {
          const r = await fetch("/api/dfd/conferencia", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: faltam.slice(i, i + FATIA_CONFERENCIA).map((d) => d.id) }),
            signal: ac.signal,
          });
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; linhas?: ConfLinha[] };
          if (ac.signal.aborted) break;
          if (!r.ok || !j.ok) {
            setConfFalhou(true);
            break;
          }
          for (const l of j.linhas ?? []) {
            const k = chavePorId.get(l.id);
            if (k) alvo.m.set(k, l);
          }
          setConfVersao((v) => v + 1);
        } catch {
          if (!ac.signal.aborted) setConfFalhou(true); // rede — reconfere na próxima abertura da visão
          break;
        }
      }
    })();
    return () => ac.abort();
  }, [vista, dfds, ctxConf]);
  const confDe = (d: DfdResumo): ConfLinha | undefined =>
    confRef.current.ctx === ctxConf ? confRef.current.m.get(chaveConf(d)) : undefined;

  const atualizarListas = () => router.refresh();
  // DFDs já cadastrados (conflito de nº na importação/reenvio: substitui × move de outro protocolo).
  const dfdsExistentesMesa = useMemo(
    () => dfds.map((d) => ({ numero: d.numero, protocoloNumero: d.protocoloNumero, valorTotal: d.valorTotal, totalItens: d.totalItens })),
    [dfds],
  );

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

  /**
   * Executa uma edição EM MASSA no servidor em FATIAS (progresso real; a falha de uma fatia não perde as
   * demais), depois recarrega as listas. Devolve quantos mudaram + as falhas cruas (cada rota tem a sua).
   */
  async function emFatias(url: string, fatias: number[][], acao: unknown, rotulo: string) {
    const total = fatias.reduce((t, f) => t + f.length, 0);
    let feito = 0;
    let alterados = 0;
    const falhas: unknown[] = [];
    const erros: string[] = [];
    try {
      for (const fatia of fatias) {
        setAplicandoMassa({ feito, total, rotulo });
        try {
          const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: fatia, acao }) });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; alterados?: number; falhas?: unknown[] };
          if (!res.ok || !j.ok) erros.push(`${fatia.length} registro(s): ${j.error ?? `falha (HTTP ${res.status})`}`);
          else {
            alterados += j.alterados ?? 0;
            falhas.push(...(j.falhas ?? []));
          }
        } catch {
          erros.push(`${fatia.length} registro(s): sem conexão com o servidor`);
        }
        feito += fatia.length;
      }
    } finally {
      setAplicandoMassa(null);
      router.refresh(); // reflete o que foi gravado (mesmo com falhas parciais)
    }
    return { alterados, falhas, erros };
  }
  const fatiar = (ids: number[], n: number) => Array.from({ length: Math.ceil(ids.length / n) }, (_, k) => ids.slice(k * n, (k + 1) * n));

  /** DFDs: a MESMA barra da análise; grava no banco (com confirmação). */
  async function aplicarMassa(acao: AcaoMassa) {
    const ids = [...selDfds].map(Number);
    if (ids.length === 0) return;
    if (!confirm(`Aplicar a alteração em ${ids.length} DFD(s)? Ela é gravada diretamente no banco.`)) return;
    setErro(null);
    const r = await emFatias("/api/dfd/massa", fatiar(ids, FATIA_MASSA), acao, "DFD(s)");
    setSelDfds(new Set());
    if (r.alterados > 0) toast.success(`${num(r.alterados)} DFD(s) alterado(s).`);
    const falhas = [...r.erros, ...(r.falhas as { numero: string; motivo: string }[]).map((f) => `DFD ${f.numero} (${f.motivo})`)];
    if (falhas.length > 0) setErro(`Não alterados: ${falhas.join(" · ")}`);
  }

  /** Protocolos: unidade, assunto ou valor da capa = somatória (conciliação em lote). */
  async function aplicarMassaProtocolos(acao: AcaoMassaProtocolo) {
    const ids = [...selProtos].map(Number);
    if (ids.length === 0) return;
    const pergunta =
      acao.campo === "valorCapa"
        ? `Substituir o valor da capa pela somatória dos DFDs em ${ids.length} protocolo(s)?`
        : `Aplicar ${acao.campo === "assunto" ? `o assunto "${acao.valor}"` : "a unidade"} em ${ids.length} protocolo(s)?`;
    if (!confirm(`${pergunta} Gravado diretamente no banco.`)) return;
    setErro(null);
    const r = await emFatias("/api/protocolo/massa", fatiar(ids, FATIA_MASSA), acao, "protocolo(s)");
    setSelProtos(new Set());
    if (r.alterados > 0) toast.success(`${num(r.alterados)} protocolo(s) alterado(s).`);
    else if (r.erros.length === 0 && r.falhas.length === 0) toast.success("Nada a alterar — os selecionados já estavam assim.");
    const falhas = [...r.erros, ...(r.falhas as { numero: string; motivo: string }[]).map((f) => `Protocolo ${f.numero} (${f.motivo})`)];
    if (falhas.length > 0) setErro(`Não alterados: ${falhas.join(" · ")}`);
  }

  /** Itens: padronizar/unidade/quantidade/valor unitário/remover — agrupados por DFD (lote atômico por DFD). */
  async function aplicarMassaItens(acao: AcaoMassaItem) {
    const lista = itens ?? [];
    const alvo = lista.filter((it) => selItens.has(it.id));
    if (alvo.length === 0) return;
    const rotulo = descreverAcaoItem(acao);
    if (!confirm(`${acao.campo === "remover" ? "Remover" : "Aplicar"} em ${alvo.length} item(ns) (${rotulo})? Gravado diretamente no banco.`)) return;
    setErro(null);
    // Remover TODOS os itens de um DFD não é permitido: recusa aqui (mesmo se a seleção for dividida).
    const recusas: { dfd: string; item: number | null; motivo: string }[] = [];
    let ids = alvo.map((it) => it.id);
    if (acao.campo === "remover") {
      const porDfd = new Map<number, number>();
      for (const it of alvo) porDfd.set(it.dfdId, (porDfd.get(it.dfdId) ?? 0) + 1);
      const cheios = new Set([...porDfd].filter(([id, n]) => n >= (dfdPorId.get(id)?.totalItens ?? Number.POSITIVE_INFINITY)).map(([id]) => id));
      for (const it of alvo) if (cheios.has(it.dfdId)) recusas.push({ dfd: it.dfdNumero, item: it.item, motivo: "o DFD ficaria sem itens" });
      ids = alvo.filter((it) => !cheios.has(it.dfdId)).map((it) => it.id);
    }
    const dfdDe = new Map(lista.map((it) => [it.id, it.dfdId]));
    const r = ids.length > 0 ? await emFatias("/api/dfd/itens/massa", fatiarItensPorDfd(ids, dfdDe, FATIA_ITENS_DFDS, FATIA_ITENS), acao, "item(ns)") : { alterados: 0, falhas: [], erros: [] };
    setSelItens(new Set());
    if (r.alterados > 0) toast.success(`${num(r.alterados)} item(ns) ${rotulo}.`);
    else if (r.erros.length === 0 && r.falhas.length === 0 && recusas.length === 0) toast.success("Nada a alterar — os selecionados já estavam assim.");
    const falhas = [...r.erros, ...resumirFalhasItens([...recusas, ...(r.falhas as typeof recusas)])];
    if (falhas.length > 0) setErro(`Não alterados: ${falhas.join(" · ")}`);
  }

  // ---- Planilha ÚNICA de DFDs (a MESMA dos banners) para a aba DFDs — conferência real por linha. ----
  const dfdPorId = new Map(dfds.map((d) => [d.id, d]));
  const linhasDfdTab: LinhaDfd[] = dfds.map((d): LinhaDfd => {
    const c = confDe(d);
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
    { key: "valor", header: "Valor", align: "right", filter: "range", numero: (r) => r.valorTotal, nowrap: true, render: (r) => brl(r.valorTotal) },
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
      // Filtro: TODAS as faltas do item (inclusive as ocultas no "+N").
      valores: (r) => {
        const res = resumoEstado(mensagensItem(r));
        return res.rotulos.length ? res.rotulos : [ESTADO_ITEM_ROTULO[estadoItem(r)]];
      },
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
    { key: "vunit", header: "Vlr. unit.", align: "right", filter: "range", nowrap: true, numero: (r) => r.valorUnitario, render: (r) => (r.valorUnitario != null ? brl(r.valorUnitario) : "—") },
    { key: "vtotal", header: "Vlr. total", align: "right", filter: "range", nowrap: true, numero: (r) => r.valorTotal, render: (r) => (r.valorTotal != null ? brl(r.valorTotal) : "—") },
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
        selectable={podeEditar}
        selected={selProtos}
        onSelected={setSelProtos}
        onRowClick={(r) => setAberto({ tipo: "protocolo", id: r.id })}
        activeKey={aberto?.tipo === "protocolo" ? aberto.id : null}
        scrollInterno
        reservaInferior={reserva}
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
      <PlanilhaDfds
        linhas={linhasDfdTab}
        unica
        scrollInterno
        reservaInferior={reserva}
        selecionavel={podeEditar}
        selected={selDfds}
        onSelected={setSelDfds}
        onRowClick={(id) => setAberto({ tipo: "dfd", id })}
        ativa={aberto?.tipo === "dfd" ? aberto.id : null}
        acoes={acoesDfd}
        regras={regras}
      />
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
        selectable={podeEditar}
        selected={selItens}
        onSelected={setSelItens}
        onRowClick={(r) => setAberto({ tipo: "item", dfdId: r.dfdId, itemId: r.id, item: { item: r.item, codigo: r.codigo } })}
        activeKey={aberto?.tipo === "item" ? aberto.itemId : null}
        scrollInterno
        reservaInferior={reserva}
        minWidth={1120}
        density="compact"
        resumo={(linhas) => `${num(linhas.length)} ${linhas.length === 1 ? "item" : "itens"} · ${brl(linhas.reduce((s, i) => s + (i.valorTotal ?? 0), 0))}`}
      />
    );

  // Barra de SELEÇÃO FIXA no rodapé do display (visão atual): registro das seleções (chips removíveis) +
  // somatório R$ + o editor de massa da visão. Só para editores.
  const progressoMassa = aplicandoMassa && (
    <div className="mb-2">
      <Progress
        value={(aplicandoMassa.feito / Math.max(1, aplicandoMassa.total)) * 100}
        label={`Aplicando em ${num(aplicandoMassa.total)} ${aplicandoMassa.rotulo}… ${num(aplicandoMassa.feito)} de ${num(aplicandoMassa.total)}`}
      />
    </div>
  );
  const tirar = (set: (f: (s: Sel) => Sel) => void) => (k: string | number) => set((s) => new Set([...s].filter((x) => x !== k)));
  let barraSelecao: ReactNode = null;
  if (podeEditar && vista === "dfds" && (selDfds.size > 0 || aplicandoMassa)) {
    const sel = dfds.filter((d) => selDfds.has(d.id));
    barraSelecao = (
      <BarraSelecao
        fixa
        onAltura={setAlturaBarra}
        bloqueada={!!aplicandoMassa}
        registros={sel.map((d) => ({ key: d.id, rotulo: `DFD ${d.numero}` }))}
        onRemover={tirar(setSelDfds)}
        onLimpar={() => setSelDfds(new Set())}
        resumo={
          <ResumoSelecao
            qtd={sel.length}
            singular="DFD"
            plural="DFDs"
            soma={sel.reduce((t, d) => t + (d.valorTotal ?? 0), 0)}
            extra={`${num(sel.reduce((t, d) => t + (d.totalItens ?? 0), 0))} itens`}
          />
        }
      >
        {progressoMassa}
        <BarraEdicaoMassa reparticoes={reparticoes} regras={regras} aplicando={!!aplicandoMassa} onAplicar={aplicarMassa} />
      </BarraSelecao>
    );
  } else if (podeEditar && vista === "protocolos" && (selProtos.size > 0 || aplicandoMassa)) {
    const sel = protocolos.filter((p) => selProtos.has(p.id));
    barraSelecao = (
      <BarraSelecao
        fixa
        onAltura={setAlturaBarra}
        bloqueada={!!aplicandoMassa}
        registros={sel.map((p) => ({ key: p.id, rotulo: `Protocolo ${p.numero}` }))}
        onRemover={tirar(setSelProtos)}
        onLimpar={() => setSelProtos(new Set())}
        resumo={
          <ResumoSelecao
            qtd={sel.length}
            singular="protocolo"
            plural="protocolos"
            soma={sel.reduce((t, p) => t + p.valorTotal, 0)}
            extra={`${num(sel.reduce((t, p) => t + p.totalDfds, 0))} DFDs`}
          />
        }
      >
        {progressoMassa}
        <BarraEdicaoMassaProtocolos reparticoes={reparticoes} regras={regras} aplicando={!!aplicandoMassa} onAplicar={aplicarMassaProtocolos} />
      </BarraSelecao>
    );
  } else if (podeEditar && vista === "itens" && (selItens.size > 0 || aplicandoMassa)) {
    const sel = (itens ?? []).filter((it) => selItens.has(it.id));
    barraSelecao = (
      <BarraSelecao
        fixa
        onAltura={setAlturaBarra}
        bloqueada={!!aplicandoMassa}
        registros={sel.map((it) => ({ key: it.id, rotulo: `DFD ${it.dfdNumero} · item ${it.item ?? "—"}` }))}
        onRemover={tirar(setSelItens)}
        onLimpar={() => setSelItens(new Set())}
        resumo={<ResumoSelecao qtd={sel.length} singular="item" plural="itens" soma={sel.reduce((t, it) => t + (it.valorTotal ?? 0), 0)} />}
      >
        {progressoMassa}
        <BarraEdicaoMassaItens aplicando={!!aplicandoMassa} onAplicar={aplicarMassaItens} />
      </BarraSelecao>
    );
  }

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
                dfdsExistentes={dfdsExistentesMesa}
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

      {barraSelecao}

      {/* PILHA DE BANNERS do GRAVADO (protocolo / DFD / item) — os MESMOS componentes/conferência da
          análise; cada "Ver …" entra pela direita. */}
      <BannersMesa
        abrir={aberto}
        onFechar={() => setAberto(null)}
        podeEditar={podeEditar}
        reparticoes={reparticoes}
        reparticaoAtivaId={reparticaoAtivaId}
        regras={regras}
        orgaos={orgaos}
        onAlterado={atualizarListas}
        pcas={pcas}
        dfdsExistentes={dfdsExistentesMesa}
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
