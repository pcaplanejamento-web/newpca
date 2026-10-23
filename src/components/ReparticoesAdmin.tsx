"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { opcoesAcoes, opcoesUnidadeOrcamentaria, rotuloAcaoCenti } from "@/lib/centi-unidades-core";
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
  centiUnidade: u?.centiUnidadeId != null ? String(u.centiUnidadeId) : "",
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
  // As AÇÕES escolhidas (por unidade): marcar/desmarcar muda na hora e grava 800 ms depois do último toque.
  const [acoesRascunho, setAcoesRascunho] = useState<Record<number, string[]>>({});
  const esperaAcoes = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const idAberta = typeof aberto === "number" ? aberto : null;
  const linhaAberta = lista?.find((u) => u.id === idAberta);
  const atualCenti = linhaAberta?.centiUnidadeId ?? null;
  const campos = useMemo<CampoCadastro[]>(
    () => [
      ...CAMPOS,
      {
        chave: "centiUnidade",
        label: "Unidade orçamentária na Centi",
        span: true,
        opcoes: centi.lista
          ? opcoesUnidadeOrcamentaria(centi.lista, atualCenti, centiOrgaoGestor, idAberta)
          : [{ valor: "", rotulo: "Sem vínculo" }, ...(atualCenti != null ? [{ valor: String(atualCenti), rotulo: linhaAberta?.centiUnidade ?? "Carregando…" }] : [])],
        acoes: centi.acoes,
        dica: centiOrgaoGestor
          ? `Vínculo da API de empenhos da Centi. Só as do órgão gestor ${centiOrgaoGestor} (o do órgão). Os empenhos dela passam a ser desta unidade.`
          : "Vínculo da API de empenhos da Centi. Os empenhos dela passam a ser desta unidade. Escolha o órgão gestor no órgão para filtrar a lista.",
      },
    ],
    [centi.lista, centi.acoes, atualCenti, linhaAberta?.centiUnidade, centiOrgaoGestor, idAberta],
  );

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

  const corpo = (u: Rep | null, v: Record<string, string>, extra: { oculto?: boolean; centiAcoes?: number[] } = {}) => ({
    codigo: v.codigo,
    nome: v.nome,
    numeroInteressado: v.numeroInteressado || null,
    setorRequisitante: v.setorRequisitante || null,
    orgaoId, // a unidade pertence ao órgão desta tela
    oculto: extra.oculto ?? u?.oculto ?? false,
    centiUnidadeId: v.centiUnidade ? Number(v.centiUnidade) : null,
    ...(extra.centiAcoes ? { centiAcoes: extra.centiAcoes } : {}),
  });

  const acoesDe = (u: Rep) => acoesRascunho[u.id] ?? u.centiAcoes.map(String);
  /** Marca/desmarca AÇÕES da Centi da unidade: na tela na hora; grava a lista inteira 800 ms depois do último toque. */
  function mudarAcoes(u: Rep, valores: string[]) {
    setAcoesRascunho((r) => ({ ...r, [u.id]: valores }));
    clearTimeout(esperaAcoes.current.get(u.id));
    esperaAcoes.current.set(
      u.id,
      setTimeout(() => {
        esperaAcoes.current.delete(u.id);
        void gravarAcoes(u, valores);
      }, 800),
    );
  }
  async function gravarAcoes(u: Rep, valores: string[]) {
    const tiradas = u.centiAcoes.filter((id) => !valores.includes(String(id)));
    const registros = tiradas.reduce((t, id) => t + (centi.listaAcoes.find((a) => a.id === id)?.registros ?? 0), 0);
    if (
      registros > 0 &&
      !(await confirmar({
        titulo: "Tirar ações da unidade?",
        texto: `Os empenhos das ${tiradas.length} ação(ões) tiradas deixam de ser desta unidade — sem outro vínculo (a unidade orçamentária ou o órgão gestor), saem do banco (importar de novo os traz de volta).`,
        confirmar: "Tirar",
        perigo: true,
      }))
    ) {
      setAcoesRascunho(({ [u.id]: _, ...r }) => r);
      return;
    }
    setGravandoCenti(u.id);
    try {
      await acao(`/api/admin/reparticoes/${u.id}`, { method: "PATCH", body: JSON.stringify(corpo(u, valoresDe(u), { centiAcoes: valores.map(Number) })) }, "Ações da Centi atualizadas.");
      await centi.recarregar();
    } finally {
      setAcoesRascunho(({ [u.id]: _, ...r }) => r);
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
    // Trocar ou tirar a unidade orçamentária: os empenhos dela deixam de ser desta unidade (sem outro vínculo, saem).
    const gravados = alvo.centiUnidadeId != null && "centiUnidade" in patch ? (centi.lista?.find((x) => x.id === alvo.centiUnidadeId)?.gravados ?? 0) : 0;
    if (
      gravados > 0 &&
      !(await confirmar({
        titulo: "Trocar a unidade orçamentária da Centi?",
        texto: `Os ${gravados.toLocaleString("pt-BR")} empenho(s) gravados da unidade orçamentária atual deixam de ser desta unidade — sem o órgão gestor ligado ao órgão, saem do banco (importar de novo os traz de volta).`,
        confirmar: "Trocar",
        perigo: true,
      }))
    )
      return false;
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
      value: (u) => u.centiUnidade ?? (acoesDe(u).length ? "Pelas ações" : "Sem correspondência"),
      render: (u) => {
        const ops = opcoesUnidadeOrcamentaria(centi.lista ?? [], u.centiUnidadeId, centiOrgaoGestor, u.id);
        const semVinculo = u.centiUnidadeId == null && !acoesDe(u).length;
        // A lista do SISTEMA (`Selecao`) com o texto INTEIRO; sem nenhum vínculo, "Sem correspondência" em âmbar.
        return (
          <span role="none" className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Selecao
              className={classeCelulaCenti(semVinculo)}
              value={u.centiUnidadeId != null ? String(u.centiUnidadeId) : ""}
              titulo="Unidade orçamentária na Centi"
              aria-label={`Unidade orçamentária na Centi (API de empenhos) de ${u.codigo}`}
              disabled={gravandoCenti === u.id}
              acoes={centi.acoes}
              onChange={async (e) => {
                setGravandoCenti(u.id);
                try {
                  await salvar({ centiUnidade: e.target.value }, u);
                } finally {
                  setGravandoCenti(null);
                }
              }}
            >
              {u.centiUnidadeId != null && !ops.some((o) => o.valor === String(u.centiUnidadeId)) && <option value={String(u.centiUnidadeId)}>{u.centiUnidade ?? "Carregando…"}</option>}
              {ops.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.valor ? o.rotulo : acoesDe(u).length ? "Pelas ações" : "Sem correspondência"}
                </option>
              ))}
            </Selecao>
            {gravandoCenti === u.id && <IconSpinner className="h-3.5 w-3.5 shrink-0 text-accent" />}
          </span>
        );
      },
    },
    {
      key: "centiAcoes",
      header: "Ações (Centi)",
      align: "left",
      nowrap: true,
      value: (u) => nomesAcoes(acoesDe(u)).join("; ") || "Nenhuma",
      valores: (u) => (acoesDe(u).length ? nomesAcoes(acoesDe(u)) : ["Nenhuma"]),
      render: (u) => (
        <span role="none" className="inline-block" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <SeletorMultiplo
            suspenso
            completo
            rotulo={`Ações na Centi de ${u.codigo}`}
            textoVazio="Nenhuma"
            opcoes={opcoesAcoes(centi.listaAcoes, u.id, centiOrgaoGestor)}
            selecionados={acoesDe(u)}
            disabled={gravandoCenti === u.id}
            onChange={(v) => mudarAcoes(u, v)}
          />
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
        campos={campos}
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
            <SecaoBanner titulo="Ações na Centi (API de empenhos)">
              <SeletorMultiplo
                campo={{ denso: true }}
                rotulo="Ações vinculadas a esta unidade"
                textoVazio="Nenhuma — vale a unidade orçamentária"
                opcoes={opcoesAcoes(centi.listaAcoes, unidade.id, centiOrgaoGestor)}
                selecionados={acoesDe(unidade)}
                disabled={gravandoCenti === unidade.id}
                onChange={(v) => mudarAcoes(unidade, v)}
              />
              <p className="mt-1.5 text-[12px] text-muted">
                Os empenhos destas ações são desta unidade (vale mais que a unidade orçamentária). Uma ação pertence a uma unidade só. Grava sozinho.
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
