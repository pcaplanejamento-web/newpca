"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motivoVinculoCenti, opcoesAcoes, opcoesUnidadeOrcamentaria, rotuloAcaoCenti, rotuloUnidadeCenti } from "@/lib/centi-unidades-core";
import { conferenciaDaUnidade, vigentesDoAlvo } from "@/lib/responsaveis-planilha-core";
import { useAbrirDaUrl } from "./AbrirDaUrl";
import { AcoesCadastro } from "./AcoesCadastro";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Badge } from "./Badge";
import { BannerCadastro, type CampoCadastro } from "./BannerCadastro";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { IconChevronLeft, IconEye, IconEyeOff, IconLandmark, IconLayers, IconPlus, IconSpinner, IconTrash, IconUsers } from "./icons";
import { BotaoExonerados, CelulaConferencia, PlanilhaResponsaveis, ResponsaveisDoAlvo, rotulosConferencia, usePlanilhaResponsaveis } from "./PlanilhaResponsaveis";
import { SelectField } from "./Field";
import { SecaoBanner } from "./SecaoBanner";
import { Segmented } from "./Segmented";
import { Selecao } from "./Selecao";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";
import { classeCelulaCenti, useUnidadesCenti } from "./UnidadesCenti";
import { CelulaResponsaveis } from "./VinculosResponsaveis";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  ordem: number;
  numeroInteressado: string | null;
  setorRequisitante: string | null;
  orgaoId: number | null;
  /** 1 = unidade PRÓPRIA do órgão (o órgão funciona também como unidade). */
  orgaoProprio: boolean;
  oculto: boolean;
  /** A UNIDADE ORÇAMENTÁRIA da Centi desta unidade (`centi_unidades.id`) e o texto dela ("FMS · 02.01 - …"). */
  centiUnidadeId: number | null;
  centiUnidade: string | null;
  /** As AÇÕES da Centi vinculadas a esta unidade (`centi_acoes.id`) — a ação vinculada vale mais que a unidade orçamentária. */
  centiAcoes: number[];
};

export type AbaUnidades = "unidades" | "responsaveis";

const CAMPOS: CampoCadastro[] = [
  { chave: "codigo", label: "Sigla (código)", placeholder: "Ex.: AMAE", max: 30, obrigatorio: true, mono: true },
  { chave: "numeroInteressado", label: "Nº do interessado (protocolo em nome da unidade)", placeholder: "Ex.: 1008171", max: 60, mono: true, inputMode: "numeric", dica: "Único no sistema (órgãos e unidades)." },
  { chave: "nome", label: "Nome da unidade", max: 160, obrigatorio: true, span: true },
  { chave: "setorRequisitante", label: "Setor Requisitante (padrão do DFD)", placeholder: "Ex.: SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL", max: 200, span: true },
];

const valoresDe = (u: Rep | null): Record<string, string> => ({
  codigo: u?.codigo ?? "",
  nome: u?.nome ?? "",
  numeroInteressado: u?.numeroInteressado ?? "",
  setorRequisitante: u?.setorRequisitante ?? "",
});

/**
 * As UNIDADES de UM órgão (`/painel/orgaos/[id]`) — abas **Unidades | Responsáveis** (a planilha, só quem responde neste
 * órgão ou nas unidades dele). Tabela padrão da Mesa; tocar na linha abre o BANNER da unidade (dados por cadeado,
 * responsáveis — ou "pelo órgão" quando a assinatura é única —, promover a órgão, ocultar, excluir).
 */
export function ReparticoesAdmin({
  orgaoId,
  orgaoSigla,
  orgaoNome,
  assinaturaUnica,
  centiOrgaoGestor,
  abaInicial,
}: {
  orgaoId: number;
  orgaoSigla: string;
  orgaoNome: string;
  /** O órgão está em "assinatura única": os responsáveis vêm do órgão, não da unidade. */
  assinaturaUnica: boolean;
  /** O órgão gestor da Centi do órgão (as unidades escolhem só entre as unidades orçamentárias dele). */
  centiOrgaoGestor: string | null;
  abaInicial: AbaUnidades;
}) {
  const router = useRouter();
  const ctx = usePlanilhaResponsaveis();
  const [aba, setAba] = useState<AbaUnidades>(abaInicial);
  const [exonerados, setExonerados] = useState(false);
  const [lista, setLista] = useState<Rep[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<number | "novo" | null>(null);
  // A PESQUISA DO SISTEMA abre o banner da unidade (`?abrir=<id>`), quando a lista chega.
  useAbrirDaUrl((v) => {
    if (lista?.some((u) => u.id === Number(v))) setAberto(Number(v));
  }, lista != null);
  const [ocupado, setOcupado] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  // As unidades orçamentárias da Centi (o vínculo): escolhidas na célula da coluna "Empenhos (Centi)" e no banner.
  const centi = useUnidadesCenti(true);
  const [gravandoCenti, setGravandoCenti] = useState<number | null>(null);
  // O RASCUNHO do vínculo de cada unidade (a unidade orçamentária escolhida e as ações dela) enquanto não é gravado: a
  // unidade orçamentária dividida por ações com outra unidade espera as ações; as ações gravam 800 ms após o último toque.
  const [rascunho, setRascunho] = useState<Record<number, { unidadeId: number | null; acoes: string[] }>>({});
  const espera = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/reparticoes?orgaoId=${orgaoId}`);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; reparticoes?: Rep[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar as unidades.");
      setLista(j.reparticoes ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar as unidades.");
      setLista((l) => l ?? []);
    }
  }, [orgaoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function trocarAba(a: AbaUnidades) {
    setAba(a);
    try {
      const url = new URL(window.location.href);
      if (a === "unidades") url.searchParams.delete("aba");
      else url.searchParams.set("aba", a);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* sem a URL, a aba vale só nesta visita */
    }
  }

  async function acao(url: string, init: RequestInit, sucesso: string): Promise<boolean> {
    setOcupado(true);
    try {
      const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível concluir — tente de novo.");
      toast.success(sucesso);
      await Promise.all([carregar(), ctx.carregar()]);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir — tente de novo.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const conf = useMemo(() => {
    const m = new Map<number, ReturnType<typeof conferenciaDaUnidade>>();
    if (ctx.planilha) for (const u of lista ?? []) m.set(u.id, conferenciaDaUnidade(u, assinaturaUnica, ctx.grupos, ctx.hoje, ctx.planilha.cargos));
    return m;
  }, [lista, assinaturaUnica, ctx.planilha, ctx.grupos, ctx.hoje]);

  if (lista === null) {
    return (
      <div className="rounded-card border border-border p-[var(--pad-card)]">
        <SkeletonLinhas linhas={6} />
      </div>
    );
  }

  const unidade = typeof aberto === "number" ? (lista.find((u) => u.id === aberto) ?? null) : null;
  const posDe = new Map(lista.map((u, i) => [u.id, i]));
  // DUAL: o órgão funciona também como unidade (a própria) — não recebe unidades-filhas.
  const ehDual = lista.some((u) => u.orgaoProprio);
  const doOrgao = vigentesDoAlvo(ctx.grupos.get(`o${orgaoId}`) ?? [], ctx.hoje);

  const corpo = (u: Rep | null, v: Record<string, string>, extra: { oculto?: boolean; centi?: { centiUnidadeId: number | null; centiAcoes: number[] } } = {}) => ({
    codigo: v.codigo,
    nome: v.nome,
    numeroInteressado: v.numeroInteressado || null,
    setorRequisitante: v.setorRequisitante || null,
    orgaoId, // a unidade pertence ao órgão desta tela
    oculto: extra.oculto ?? u?.oculto ?? false,
    // O vínculo com a Centi só vai quando é ele que muda (a unidade orçamentária e as ações, juntas).
    ...(extra.centi ?? {}),
  });

  /** O vínculo à vista: o rascunho (ainda não gravado) ou o gravado. */
  const unidadeDe = (u: Rep) => (u.id in rascunho ? rascunho[u.id].unidadeId : u.centiUnidadeId);
  const acoesDe = (u: Rep) => (u.id in rascunho ? rascunho[u.id].acoes : u.centiAcoes.map(String));
  const descartar = (id: number) => setRascunho(({ [id]: _, ...r }) => r);

  /**
   * PRIMEIRO a unidade orçamentária: trocar zera as ações (as da anterior não valem na nova). Dividida por ações com outra
   * unidade, não grava ainda — esta unidade precisa escolher as ações dela; senão grava na hora, INTEIRA.
   */
  function escolherUnidade(u: Rep, unidadeId: number | null) {
    clearTimeout(espera.current.get(u.id));
    if (unidadeId === u.centiUnidadeId) return descartar(u.id);
    const uo = unidadeId == null ? null : centi.lista?.find((x) => x.id === unidadeId);
    if (uo?.escolhidaPor.some((r) => r !== u.id)) {
      setRascunho((r) => ({ ...r, [u.id]: { unidadeId, acoes: [] } }));
      toast.info(`${rotuloUnidadeCenti(uo)} está dividida por ações com outra unidade — escolha as ações de ${u.codigo}.`);
      return;
    }
    void gravarVinculo(u, unidadeId, []);
  }

  /** DEPOIS as ações (só as da unidade orçamentária escolhida): nenhuma = todas; grava 800 ms após o último toque. */
  function mudarAcoes(u: Rep, valores: string[]) {
    const unidadeId = unidadeDe(u);
    setRascunho((r) => ({ ...r, [u.id]: { unidadeId, acoes: valores } }));
    clearTimeout(espera.current.get(u.id));
    espera.current.set(
      u.id,
      setTimeout(() => {
        espera.current.delete(u.id);
        void gravarVinculo(u, unidadeId, valores);
      }, 800),
    );
  }

  /** Grava a unidade orçamentária + as ações JUNTAS (a regra conferida antes — a mesma do servidor). */
  async function gravarVinculo(u: Rep, unidadeId: number | null, acoes: string[]) {
    const ids = acoes.map(Number);
    const m = motivoVinculoCenti({ reparticaoId: u.id, unidadeId, acoes: ids }, centi.lista ?? [], centi.listaAcoes);
    // Dividida por ações e nenhuma escolhida ainda: espera as ações (o rascunho fica à vista, nada é gravado).
    if (m?.esperaAcoes) return;
    if (m) {
      toast.error(m.msg);
      return descartar(u.id);
    }
    // O que deixa de ser desta unidade: com empenhos gravados, confirma (sem outro vínculo, saem do banco).
    const trocou = unidadeId !== u.centiUnidadeId;
    const antes = u.centiAcoes;
    const perde =
      u.centiUnidadeId == null
        ? 0
        : trocou || (antes.length === 0 && ids.length > 0)
          ? (centi.lista?.find((x) => x.id === u.centiUnidadeId)?.gravados ?? 0)
          : antes.filter((id) => !ids.includes(id)).reduce((t, id) => t + (centi.listaAcoes.find((a) => a.id === id)?.registros ?? 0), 0);
    if (
      perde > 0 &&
      !(await confirmar({
        titulo: "Mudar o vínculo com a Centi?",
        texto: "Os empenhos que deixam de ser desta unidade — sem outro vínculo (outra unidade ou o órgão gestor do órgão) — saem do banco (importar de novo os traz de volta).",
        confirmar: "Mudar",
        perigo: true,
      }))
    )
      return descartar(u.id);
    setGravandoCenti(u.id);
    try {
      await acao(
        `/api/admin/reparticoes/${u.id}`,
        { method: "PATCH", body: JSON.stringify(corpo(u, valoresDe(u), { centi: { centiUnidadeId: unidadeId, centiAcoes: ids } })) },
        "Vínculo com a Centi atualizado.",
      );
      await centi.recarregar();
    } finally {
      descartar(u.id);
      setGravandoCenti(null);
    }
  }

  async function salvar(patch: Record<string, string>, alvo: Rep | null = unidade): Promise<boolean> {
    if (!alvo && aberto === "novo") {
      const ok = await acao("/api/admin/reparticoes", { method: "POST", body: JSON.stringify(corpo(null, patch)) }, "Unidade cadastrada.");
      if (ok) setAberto(null);
      return ok;
    }
    if (!alvo) return false;
    return acao(`/api/admin/reparticoes/${alvo.id}`, { method: "PATCH", body: JSON.stringify(corpo(alvo, { ...valoresDe(alvo), ...patch })) }, "Unidade atualizada.");
  }

  const ocultar = (u: Rep) =>
    acao(`/api/admin/reparticoes/${u.id}`, { method: "PATCH", body: JSON.stringify(corpo(u, valoresDe(u), { oculto: !u.oculto })) }, u.oculto ? "Unidade reexibida." : "Unidade ocultada.");

  async function excluir(u: Rep) {
    if (u.orgaoProprio) {
      toast.error("A unidade própria sai pelo órgão: “Deixar de ser unidade”.");
      return;
    }
    const ok = await confirmar({
      titulo: `Excluir a unidade ${u.codigo}?`,
      texto: "Unidade com DFD ou protocolo não se exclui — oculte-a. Os responsáveis vinculados a ela saem junto (as pessoas ficam na planilha).",
      confirmar: "Excluir",
      perigo: true,
    });
    if (ok && (await acao(`/api/admin/reparticoes/${u.id}`, { method: "DELETE" }, "Unidade excluída."))) setAberto(null);
  }

  async function promover(u: Rep) {
    const ok = await confirmar({
      titulo: `Promover ${u.codigo} a órgão?`,
      texto: `Ela deixa de ser unidade de ${orgaoSigla} e vira um órgão próprio. Com DFDs, protocolos ou itens, continua existindo como a unidade própria do órgão novo; os responsáveis seguem junto.`,
      confirmar: "Promover",
    });
    if (ok && (await acao(`/api/admin/reparticoes/${u.id}/promover`, { method: "POST" }, "Unidade promovida a órgão."))) router.push("/painel/orgaos");
  }

  function mover(id: number, dir: -1 | 1) {
    if (!lista) return;
    const i = lista.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setLista(nova);
    void fetch("/api/admin/reparticoes/ordem", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: nova.map((x) => x.id) }) }).then((r) => {
      if (!r.ok) {
        toast.error("Não foi possível salvar a nova ordem.");
        void carregar();
      }
    });
  }

  const porIdAcao = new Map(centi.listaAcoes.map((a) => [String(a.id), a]));
  const porIdUnidade = new Map((centi.lista ?? []).map((x) => [x.id, x]));
  /** O texto da unidade orçamentária à vista (o rascunho ou a gravada). */
  const textoUnidade = (u: Rep): string | null => {
    const id = unidadeDe(u);
    if (id == null) return null;
    const x = porIdUnidade.get(id);
    return x ? rotuloUnidadeCenti(x) : id === u.centiUnidadeId ? u.centiUnidade : "Carregando…";
  };
  /** As ações: sem unidade orçamentária, nenhuma; sem ação escolhida, TODAS (a unidade orçamentária inteira). */
  const textoAcoes = (u: Rep) => (unidadeDe(u) == null ? "—" : acoesDe(u).length ? nomesAcoes(acoesDe(u)).join("; ") : u.id in rascunho ? "Escolha as ações" : "Todas");
  /** 1º passo: a unidade orçamentária (a lista do SISTEMA, o texto inteiro). */
  const seletorUnidade = (u: Rep, campo?: string) => {
    const id = unidadeDe(u);
    const ops = opcoesUnidadeOrcamentaria(centi.lista ?? [], id, centiOrgaoGestor, u.id);
    const semVinculo = id == null;
    const opcoes = (
      <>
        {id != null && !ops.some((o) => o.valor === String(id)) && <option value={String(id)}>{textoUnidade(u)}</option>}
        {ops.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.valor ? o.rotulo : "Sem correspondência"}
          </option>
        ))}
      </>
    );
    const mudar = (v: string) => escolherUnidade(u, v ? Number(v) : null);
    return campo ? (
      <SelectField label={campo} value={id != null ? String(id) : ""} onChange={(e) => mudar(e.target.value)} disabled={gravandoCenti === u.id} acoes={centi.acoes}>
        {opcoes}
      </SelectField>
    ) : (
      <Selecao
        className={classeCelulaCenti(semVinculo)}
        value={id != null ? String(id) : ""}
        titulo="Unidade orçamentária na Centi"
        aria-label={`Unidade orçamentária na Centi (API de empenhos) de ${u.codigo}`}
        disabled={gravandoCenti === u.id}
        acoes={centi.acoes}
        onChange={(e) => mudar(e.target.value)}
      >
        {opcoes}
      </Selecao>
    );
  };
  /** 2º passo: as AÇÕES da unidade orçamentária escolhida (várias; nenhuma = todas). */
  const seletorAcoes = (u: Rep, campo = false) => {
    const id = unidadeDe(u);
    const props = {
      rotulo: campo ? "Ações (nenhuma = todas)" : `Ações na Centi de ${u.codigo}`,
      textoVazio: id == null ? "Escolha antes a unidade orçamentária" : u.id in rascunho && !acoesDe(u).length ? "Escolha as ações" : "Todas",
      opcoes: opcoesAcoes(centi.listaAcoes, u.id, id),
      selecionados: acoesDe(u),
      disabled: id == null || gravandoCenti === u.id,
      onChange: (v: string[]) => mudarAcoes(u, v),
    };
    return campo ? <SeletorMultiplo campo={{ denso: true }} {...props} /> : <SeletorMultiplo suspenso completo {...props} />;
  };
  const nomesAcoes = (ids: string[]) => ids.map((i) => { const a = porIdAcao.get(i); return a ? rotuloAcaoCenti(a) : `#${i}`; });
  const vigentes = (u: Rep) => (assinaturaUnica ? null : vigentesDoAlvo(ctx.grupos.get(`u${u.id}`) ?? [], ctx.hoje));
  const colunas: Column<Rep>[] = [
    { key: "pos", header: "#", filter: "none", nowrap: true, total: false, numero: (u) => (posDe.get(u.id) ?? 0) + 1, render: (u) => <span className="tabular-nums text-faint">{(posDe.get(u.id) ?? 0) + 1}</span> },
    { key: "codigo", header: "Sigla", nowrap: true, value: (u) => u.codigo, render: (u) => <Badge tone="violet">{u.codigo}</Badge> },
    {
      key: "nome",
      header: "Nome da unidade",
      align: "left",
      minWidth: 220,
      value: (u) => u.nome,
      render: (u) => (
        <span className="inline-flex items-center gap-2">
          <span className={`font-medium ${u.oculto ? "text-faint" : "text-text"}`}>{u.nome}</span>
          {u.orgaoProprio && <Badge tone="cyan">Próprio órgão</Badge>}
          {u.oculto && <Badge tone="slate">Oculta</Badge>}
        </span>
      ),
    },
    {
      key: "numeroInteressado",
      header: "Nº interessado",
      nowrap: true,
      value: (u) => u.numeroInteressado ?? "—",
      render: (u) => (u.numeroInteressado ? <span className="font-mono text-[12px] text-text-2">{u.numeroInteressado}</span> : <span className="text-faint">—</span>),
    },
    {
      key: "setorRequisitante",
      header: "Setor Requisitante",
      minWidth: 180,
      value: (u) => u.setorRequisitante ?? "—",
      render: (u) =>
        u.setorRequisitante ? <span className="line-clamp-1 text-[12px] text-text-2" title={u.setorRequisitante}>{u.setorRequisitante}</span> : <span className="text-faint">—</span>,
    },
    {
      key: "responsaveis",
      header: "Responsáveis vigentes",
      nowrap: true,
      value: (u) => vigentes(u)?.nomes.join(", ") || (assinaturaUnica ? "Pelo órgão" : "—"),
      valores: (u) => vigentes(u)?.nomes ?? ["Pelo órgão"],
      render: (u) => {
        const v = vigentes(u);
        return v ? (
          <CelulaResponsaveis nomes={v.nomes} temporario={v.temporario} />
        ) : (
          <span title={doOrgao.nomes.join(", ") || "O órgão está sem responsável vigente"}>
            <CelulaResponsaveis nomes={[]} temporario={false} nota={`Pelo órgão (${orgaoSigla})`} />
          </span>
        );
      },
    },
    {
      key: "centi",
      header: "Unidade orçamentária (Centi)",
      align: "left",
      nowrap: true,
      value: (u) => textoUnidade(u) ?? "Sem correspondência",
      render: (u) => (
        <span role="none" className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {seletorUnidade(u)}
          {gravandoCenti === u.id && <IconSpinner className="h-3.5 w-3.5 shrink-0 text-accent" />}
        </span>
      ),
    },
    {
      key: "centiAcoes",
      header: "Ações (Centi)",
      align: "left",
      nowrap: true,
      value: (u) => textoAcoes(u),
      valores: (u) => (acoesDe(u).length ? nomesAcoes(acoesDe(u)) : [textoAcoes(u)]),
      render: (u) => (
        <span role="none" className="inline-block" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {seletorAcoes(u)}
        </span>
      ),
    },
    {
      key: "conf",
      header: "Conferência",
      nowrap: true,
      value: (u) => rotulosConferencia(conf.get(u.id) ?? [])[0],
      valores: (u) => rotulosConferencia(conf.get(u.id) ?? []),
      render: (u) => (ctx.planilha ? <CelulaConferencia msgs={conf.get(u.id) ?? []} /> : <span className="text-faint">…</span>),
    },
    {
      key: "acoes",
      header: "Ordem",
      filter: "none",
      nowrap: true,
      render: (u) => (
        <span role="none" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <AcoesCadastro
            nome={u.codigo}
            primeira={(posDe.get(u.id) ?? 0) === 0}
            ultima={(posDe.get(u.id) ?? 0) === lista.length - 1}
            disabled={ocupado}
            onMover={(d) => mover(u.id, d)}
            onEditar={() => setAberto(u.id)}
            onExcluir={() => void excluir(u)}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => router.push("/painel/orgaos")} icon={<IconChevronLeft className="h-4 w-4" />} aria-label="Voltar aos órgãos">
          Órgãos
        </Button>
        <Badge tone="violet">{orgaoSigla}</Badge>
        <h1 className="min-w-0 truncate text-[15px] font-bold text-text">{orgaoNome}</h1>
        {assinaturaUnica && <Badge tone="blue">Assinatura única</Badge>}
        <Segmented<AbaUnidades>
          className="sm:ml-auto"
          ariaLabel="Unidades ou responsáveis"
          value={aba}
          onChange={trocarAba}
          options={[
            { value: "unidades", label: `Unidades (${lista.length})`, icone: <IconLayers className="h-4 w-4" /> },
            { value: "responsaveis", label: "Responsáveis", icone: <IconUsers className="h-4 w-4" />, dica: "Quem responde neste órgão ou nas unidades dele" },
          ]}
        />
        {aba === "responsaveis" && <BotaoExonerados ctx={ctx} ativo={exonerados} onAlternar={() => setExonerados((x) => !x)} />}
      </div>
      {erro && <Callout kind="danger">{erro}</Callout>}
      {ctx.erro && <Callout kind="warn">{ctx.erro}</Callout>}

      <div key={aba} className="animate-cat-morph">
        {aba === "unidades" ? (
          <DataTable
            columns={colunas}
            rows={lista}
            getKey={(u) => u.id}
            onRowClick={(u) => setAberto(u.id)}
            activeKey={typeof aberto === "number" ? aberto : null}
            scrollInterno
            density="compact"
            exportar={{ nome: `Unidades ${orgaoSigla}` }}
            vazio={ehDual ? "O órgão funciona como unidade." : "Nenhuma unidade neste órgão — use “Nova unidade”."}
            acoesRodape={
              <>
                <Button
                  size="sm"
                  disabled={ehDual}
                  title={ehDual ? "Este órgão funciona como unidade (unidade própria) e não recebe unidades-filhas." : undefined}
                  icon={<IconPlus className="h-4 w-4" />}
                  onClick={() => setAberto("novo")}
                >
                  Nova unidade
                </Button>
                <Ajuda titulo="Unidades">
                  <p>Toque numa linha para abrir a unidade: os dados (cadeado), os responsáveis, promover a órgão, ocultar e excluir.</p>
                  <TopicoAjuda titulo="Responsáveis">
                    {assinaturaUnica
                      ? `O órgão ${orgaoSigla} tem assinatura única: valem os responsáveis do órgão para todas as unidades.`
                      : "Cada unidade tem os seus responsáveis (escolhidos da planilha única)."}
                  </TopicoAjuda>
                  {ehDual && <TopicoAjuda titulo="Próprio órgão">O órgão funciona também como unidade (a “Próprio órgão”) e não recebe unidades-filhas.</TopicoAjuda>}
                  <TopicoAjuda titulo="Ordem">↑/↓ ordenam a lista (salvo na hora).</TopicoAjuda>
                </Ajuda>
              </>
            }
          />
        ) : ctx.planilha ? (
          <PlanilhaResponsaveis ctx={ctx} orgaoId={orgaoId} exonerados={exonerados} />
        ) : (
          <div className="rounded-card border border-border p-[var(--pad-card)]">
            <SkeletonLinhas linhas={6} />
          </div>
        )}
      </div>

      <BannerCadastro
        aberto={aberto != null}
        novo={aberto === "novo"}
        titulo={aberto === "novo" ? `Nova unidade · ${orgaoSigla}` : (unidade?.nome ?? "Unidade")}
        cabecalho={
          unidade ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge tone="violet">{unidade.codigo}</Badge>
              <span className="truncate text-[15px] font-semibold text-text">{unidade.nome}</span>
              <span className="text-[12px] text-muted">· {orgaoSigla}</span>
              {unidade.orgaoProprio && <Badge tone="cyan">Próprio órgão</Badge>}
              {unidade.oculto && <Badge tone="slate">Oculta</Badge>}
            </div>
          ) : undefined
        }
        campos={CAMPOS}
        inicial={valoresDe(unidade)}
        ocupado={ocupado}
        onSalvar={salvar}
        onFechar={() => setAberto(null)}
        confirmarDescarte={() => confirmar({ titulo: "Descartar as alterações?", texto: "Os dados alterados não foram salvos.", confirmar: "Descartar", perigo: true })}
        rodapeEsquerda={
          unidade ? (
            <div className="flex flex-wrap gap-2">
              {!unidade.orgaoProprio && (
                <Button size="sm" variant="danger" disabled={ocupado} icon={<IconTrash className="h-4 w-4" />} onClick={() => void excluir(unidade)}>
                  Excluir
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={ocupado}
                icon={unidade.oculto ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
                onClick={() => void ocultar(unidade)}
              >
                {unidade.oculto ? "Reexibir" : "Ocultar"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {unidade && (
          <>
            <SecaoBanner titulo="Responsáveis por DFDs">
              <ResponsaveisDoAlvo
                ctx={ctx}
                alvo={{ reparticaoId: unidade.id }}
                nota={`O órgão ${orgaoSigla} tem assinatura única: valem os responsáveis do órgão${doOrgao.nomes.length ? ` (hoje: ${doOrgao.nomes.join(", ")})` : " — e ele está sem responsável vigente"}.`}
              />
            </SecaoBanner>
            <SecaoBanner titulo="Empenhos (API da Centi)">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                {seletorUnidade(unidade, "1 · Unidade orçamentária")}
                {seletorAcoes(unidade, true)}
              </div>
              <p className="mt-1.5 text-[12px] text-muted">
                Primeiro a unidade orçamentária, depois as ações DELA. Sem ação escolhida, valem todas; com ações, só elas (a
                unidade orçamentária pode ser dividida por ações entre unidades). Grava sozinho.
              </p>
            </SecaoBanner>
            <SecaoBanner titulo="Estrutura">
              {unidade.orgaoProprio ? (
                <p className="text-[13px] text-muted">Esta é a unidade própria do órgão. Para removê-la, use “Deixar de ser unidade” no órgão.</p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-muted">Promover a unidade a um órgão próprio (ela sai deste órgão).</p>
                  <Button size="sm" variant="secondary" loading={ocupado} icon={<IconLandmark className="h-4 w-4" />} onClick={() => void promover(unidade)}>
                    Promover a órgão
                  </Button>
                </div>
              )}
            </SecaoBanner>
          </>
        )}
      </BannerCadastro>
      {confirmacao}
      {ctx.confirmacao}
    </div>
  );
}
