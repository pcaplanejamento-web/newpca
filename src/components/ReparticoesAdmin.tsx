"use client";

import { lerJsonGuardado } from "@/lib/dados-cliente";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { conferenciaDaUnidade, vigentesDoAlvo } from "@/lib/responsaveis-planilha-core";
import { useAbrirDaUrl } from "./AbrirDaUrl";
import { BotaoVoltar } from "./AbasEspaco";
import { useOndeDetalhe } from "./CanalGrupo";
import { AcoesCadastro } from "./AcoesCadastro";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { type Aviso, Avisos } from "./Avisos";
import { Badge } from "./Badge";
import { BannerCadastro, type CampoCadastro, type RascunhoSecao } from "./BannerCadastro";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { IconAlert, IconEye, IconSearch, IconEyeOff, IconLandmark, IconLayers, IconPlus, IconTrash, IconUsers } from "./icons";
import { BotaoExonerados, CelulaConferencia, PlanilhaResponsaveis, ResponsaveisDoAlvo, rotulosConferencia, usePlanilhaResponsaveis } from "./PlanilhaResponsaveis";
import { SecaoBanner } from "./SecaoBanner";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";
import { CelulaResponsaveis } from "./VinculosResponsaveis";
import { CelulaLista } from "./CelulaLista";
import { CentrosCustoUnidades } from "./CentrosCustoUnidades";
import { ErroCarga } from "./ErroCarga";
import { CampoLista, TextField } from "./Field";
import { Modal } from "./Modal";
import { SeletorMultiplo } from "./SeletorMultiplo";
import {
  chaveCentro,
  DESCRICAO_MODO,
  LIMITES_SUBUNIDADE,
  lerCentros,
  MODOS_CENTRO,
  type ModoCentro,
  motivoSubunidadesInvalidas,
  ROTULO_MODO,
} from "@/lib/subunidades-core";

const SEM_CADASTRO = "Sem centro de custo";
/** O texto da coluna Subunidades (filtro e ordem): os nomes; sem subunidades, a própria unidade (a sigla); sem cadastro. */
const textoSubunidades = (u: { codigo: string; temCentro: boolean; subunidades: string[] }) =>
  u.subunidades.length ? u.subunidades.join(", ") : u.temCentro ? u.codigo : SEM_CADASTRO;

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  ordem: number;
  numeroInteressado: string | null;
  setorRequisitante: string | null;
  /** O MODO do centro de custo e os nomes das subunidades (a coluna da lista — o cadastro abre no banner). */
  modoCentro: ModoCentro;
  subunidades: string[];
  /** Tem o centro de custo cadastrado? (sem ele, os DFDs da unidade ficam com erro). */
  temCentro: boolean;
  /** Os centros de custo dos DFDs da unidade que ainda não estão no cadastro dela. */
  pendentes: string[];
  orgaoId: number | null;
  /** 1 = unidade PRÓPRIA do órgão (o órgão funciona também como unidade). */
  orgaoProprio: boolean;
  oculto: boolean;
};

const A_CADASTRAR = "Centro de custo a cadastrar";
/** O selo âmbar dos centros de custo dos DFDs da unidade ainda fora do cadastro (a lista na dica). */
const seloPendentes = (p: string[]) =>
  p.length ? (
    <Badge tone="amber" title={`${A_CADASTRAR}:\n${p.slice(0, 12).join("\n")}${p.length > 12 ? `\ne mais ${p.length - 12}` : ""}`}>
      {p.length} a cadastrar
    </Badge>
  ) : null;

/** A célula Subunidades: as subunidades (com o selo da origem do nome), a própria unidade ou "Sem centro de custo". */
function celulaSubunidades(u: Rep) {
  // A subunidade com o NOME DA UNIDADE (a sigla — sem subunidades ou sem nome informado) × as CRIADAS pelo ADM.
  const daUnidade = (n: string) => chaveCentro(n) === chaveCentro(u.codigo) || chaveCentro(n) === chaveCentro(u.nome);
  const criadas = u.subunidades.filter((n) => !daUnidade(n)).length;
  const selo = (unidade: boolean) =>
    unidade ? (
      <Badge tone="slate" title="O nome é o da própria unidade">
        Unidade
      </Badge>
    ) : (
      <Badge tone="blue" title="Subunidades criadas no cadastro">
        Criada{criadas > 1 ? "s" : ""}
      </Badge>
    );
  if (u.subunidades.length)
    return (
      <span className="inline-flex items-center gap-1.5" title={u.temCentro ? undefined : SEM_CADASTRO}>
        {!u.temCentro && <IconAlert className="h-3.5 w-3.5 shrink-0 text-[var(--danger)]" aria-label={SEM_CADASTRO} />}
        <CelulaLista valores={u.subunidades.map((n) => (daUnidade(n) ? `${n} (unidade)` : n))} mono />
        {selo(criadas === 0)}
      </span>
    );
  return u.temCentro ? (
    <span className="inline-flex items-center gap-1.5" title="Um centro de custo para toda a unidade: a subunidade é a própria unidade">
      <span className="font-mono text-[12px] font-semibold text-text">{u.codigo}</span>
      {selo(true)}
    </span>
  ) : (
    <span className="text-[12px] text-[var(--danger)]">{SEM_CADASTRO}</span>
  );
}

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
  abaInicial,
}: {
  orgaoId: number;
  orgaoSigla: string;
  orgaoNome: string;
  /** O órgão está em "assinatura única": os responsáveis vêm do órgão, não da unidade. */
  assinaturaUnica: boolean;
  abaInicial: AbaUnidades;
}) {
  const router = useRouter();
  useOndeDetalhe(`${orgaoSigla} — ${orgaoNome}`);
  const ctx = usePlanilhaResponsaveis();
  const [aba, setAba] = useState<AbaUnidades>(abaInicial);
  const [exonerados, setExonerados] = useState(false);
  const [lista, setLista] = useState<Rep[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<number | "novo" | null>(null);
  // O rascunho do centro de custo e das subunidades — o "Salvar alterações" do banner também o grava.
  const [rascunhoSub, setRascunhoSub] = useState<RascunhoSecao | null>(null);
  // O banner dos CENTROS DE CUSTO (onde cada um está vinculado, em todas as unidades).
  const [verCentros, setVerCentros] = useState(false);
  // A PESQUISA DO SISTEMA abre o banner da unidade (`?abrir=<id>`), quando a lista chega.
  useAbrirDaUrl((v) => {
    if (lista?.some((u) => u.id === Number(v))) setAberto(Number(v));
  }, lista != null);
  const [ocupado, setOcupado] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    try {
      const j = await lerJsonGuardado<{ reparticoes?: Rep[] }>("adm.unidades", `/api/admin/reparticoes?orgaoId=${orgaoId}`, "Erro ao carregar as unidades.");
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

  const corpo = (u: Rep | null, v: Record<string, string>, extra: { oculto?: boolean } = {}) => ({
    codigo: v.codigo,
    nome: v.nome,
    numeroInteressado: v.numeroInteressado || null,
    setorRequisitante: v.setorRequisitante || null,
    orgaoId, // a unidade pertence ao órgão desta tela
    oculto: extra.oculto ?? u?.oculto ?? false,
  });

  async function salvar(patch: Record<string, string>): Promise<boolean> {
    if (aberto === "novo") {
      const ok = await acao("/api/admin/reparticoes", { method: "POST", body: JSON.stringify(corpo(null, patch)) }, "Unidade cadastrada.");
      if (ok) setAberto(null);
      return ok;
    }
    if (!unidade) return false;
    return acao(`/api/admin/reparticoes/${unidade.id}`, { method: "PATCH", body: JSON.stringify(corpo(unidade, { ...valoresDe(unidade), ...patch })) }, "Unidade atualizada.");
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
      key: "subunidades",
      header: "Subunidades",
      nowrap: true,
      value: (u) => textoSubunidades(u),
      valores: (u) => [...(u.temCentro && u.subunidades.length ? u.subunidades : [textoSubunidades(u)]), ...(u.pendentes.length ? [A_CADASTRAR] : [])],
      render: (u) => <span className="inline-flex items-center gap-1.5">{celulaSubunidades(u)}{seloPendentes(u.pendentes)}</span>,
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
      {/* A linha do topo: o voltar à esquerda e as abas — sem título (o órgão está no caminho do cabeçalho). */}
      <div className="linha-topico flex flex-wrap items-center gap-2">
        <h1 className="sr-only">{orgaoNome}</h1>
        <BotaoVoltar href="/painel/orgaos" rotulo="Órgãos" />
        <Segmented<AbaUnidades>
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
                <Button size="sm" variant="secondary" icon={<IconSearch className="h-4 w-4" />} title="Ver onde cada centro de custo está vinculado" onClick={() => setVerCentros(true)}>
                  Centros de custo
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

      <CentrosCustoUnidades
        aberto={verCentros}
        onFechar={() => setVerCentros(false)}
        onAbrir={(l) => {
          setVerCentros(false);
          // A unidade deste órgão abre aqui; a de outro órgão, na tela dele (o `?abrir=` abre o banner).
          if (l.orgaoId === orgaoId) setAberto(l.reparticaoId);
          else if (l.orgaoId != null) router.push(`/painel/orgaos/${l.orgaoId}?abrir=${l.reparticaoId}`);
        }}
      />

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
        rascunho={rascunhoSub}
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
            <SecaoBanner titulo="Centro de custo e subunidades">
              <SubunidadesDaUnidade key={unidade.id} unidadeId={unidade.id} codigo={unidade.codigo} onMudou={() => void carregar()} onRascunho={setRascunhoSub} />
            </SecaoBanner>
            <SecaoBanner titulo="Responsáveis por DFDs">
              <ResponsaveisDoAlvo
                ctx={ctx}
                alvo={{ reparticaoId: unidade.id }}
                nota={`O órgão ${orgaoSigla} tem assinatura única: valem os responsáveis do órgão${doOrgao.nomes.length ? ` (hoje: ${doOrgao.nomes.join(", ")})` : " — e ele está sem responsável vigente"}.`}
              />
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

/** O cadastro como o servidor devolve (`GET /api/admin/reparticoes/[id]/subunidades`). */
type CadastroSubunidades = {
  modo: ModoCentro;
  centrosUnidade: string[];
  subunidades: { id: number; nome: string; centros: string[]; marcados: number }[];
  centros: CentroLido[];
  outras: { reparticaoId: number; unidade: string; subunidadeId: number | null; subunidade: string; centros: string[] }[];
};
/** Um centro de custo lido nos DFDs: quantos DFDs no total e quantos DESTA unidade. */
type CentroLido = { centro: string; dfds: number; daUnidade: number };
type SubRascunho = { key: string; id?: number; nome: string; centros: string[]; marcados: number };

const MODOS_OPCOES = MODOS_CENTRO.map((v) => ({ value: v, label: ROTULO_MODO[v], dica: DESCRICAO_MODO[v] }));

/**
 * O CENTRO DE CUSTO de uma unidade (seção do banner): o MODO e o cadastro num RASCUNHO; "Salvar" grava tudo num lote
 * (`PUT …/subunidades`). **Um para toda a unidade:** os centros da unidade + as subunidades (só o nome), escolhidas em
 * cada DFD. **Um por subunidade:** cada subunidade com os seus centros. O centro é obrigatório; cada um é escolhido dos
 * lidos nos DFDs (ou digitado) e pertence a um só cadastro do sistema.
 */
/** A forma comparável do cadastro (o rascunho × o gravado). */
const chaveRascunho = (m: ModoCentro, c: string[], l: { id?: number; nome: string; centros: string[] }[], mover: string[] = []) =>
  JSON.stringify([m, c, l.map((s) => [s.id, s.nome, s.centros]), mover]);

function SubunidadesDaUnidade({
  unidadeId,
  codigo,
  onMudou,
  onRascunho,
}: {
  unidadeId: number;
  codigo: string;
  onMudou: () => void;
  /** O rascunho desta seção para o "Salvar alterações" do banner (null = nada a salvar). */
  onRascunho: (r: RascunhoSecao | null) => void;
}) {
  const url = `/api/admin/reparticoes/${unidadeId}/subunidades`;
  const [cad, setCad] = useState<CadastroSubunidades | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoCentro>("unico");
  const [centros, setCentros] = useState<string[]>([]);
  const [lista, setLista] = useState<SubRascunho[]>([]);
  const [editando, setEditando] = useState<number | "nova" | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Os centros de OUTROS cadastros que o ADM move para esta unidade (saem de lá ao salvar).
  const [moverCentros, setMover] = useState<string[]>([]);
  const { confirmar, confirmacao } = useConfirmacao();

  const aplicar = useCallback((c: CadastroSubunidades) => {
    setCad(c);
    setMover([]);
    setModo(c.modo);
    setCentros(c.centrosUnidade);
    // No modo único as subunidades não guardam centro próprio (o centro é da unidade).
    setLista(c.subunidades.map((s) => ({ key: `s${s.id}`, id: s.id, nome: s.nome, centros: c.modo === "unico" ? [] : s.centros, marcados: s.marcados })));
  }, []);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch(url);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<CadastroSubunidades>;
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar o centro de custo.");
      aplicar(j as CadastroSubunidades);
      setErroCarga(null);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Erro ao carregar o centro de custo.");
    }
  }, [url, aplicar]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const noRascunhoTodo = new Set([...centros, ...lista.flatMap((s) => s.centros)].map(chaveCentro));
  const moverValidos = moverCentros.filter((c) => noRascunhoTodo.has(chaveCentro(c)));
  const sujo = !!cad && chaveRascunho(modo, centros, lista, moverValidos) !== chaveRascunho(cad.modo, cad.centrosUnidade, cad.subunidades.map((s) => (cad.modo === "unico" ? { ...s, centros: [] } : s)));
  const motivo = cad ? motivoSubunidadesInvalidas(modo, centros, lista) : null;
  // O "Salvar alterações" do banner chama a gravação desta seção (a versão do render atual).
  const salvarRef = useRef<() => Promise<boolean>>(async () => true);
  useEffect(() => {
    onRascunho(sujo ? { sujo, bloqueio: motivo, salvar: () => salvarRef.current() } : null);
  }, [sujo, motivo, onRascunho]);
  useEffect(() => () => onRascunho(null), [onRascunho]);

  if (!cad) {
    return erroCarga ? <ErroCarga msg={erroCarga} onTentar={() => void carregar()} /> : <SkeletonLinhas linhas={3} />;
  }
  // Os centros de custo das OUTRAS unidades (não se escolhem aqui) e o dono de cada centro dentro deste rascunho.
  // (os que o ADM está movendo para cá deixam de ser de lá.)
  const movendo = new Set(moverCentros.map(chaveCentro));
  const deOutras = new Map<string, string>();
  for (const o of cad.outras)
    for (const c of o.centros) if (!movendo.has(chaveCentro(c))) deOutras.set(chaveCentro(c), o.subunidade ? `${o.subunidade} (${o.unidade})` : o.unidade);
  const fora = (c: string) => deOutras.get(chaveCentro(c));
  const moverPara = (lista: string[]) => setMover((m) => lerCentros([...m, ...lista]));
  // Os centros dos DFDs DESTA unidade fora do rascunho: os de outro cadastro (mover) e os sem cadastro.
  const lidosDaUnidade = cad.centros.filter((c) => c.daUnidade > 0 && !noRascunhoTodo.has(chaveCentro(c.centro)));
  const emOutro = lidosDaUnidade.filter((c) => fora(c.centro));
  const semCadastro = lidosDaUnidade.filter((c) => !fora(c.centro));
  const ondeEscolher = modo === "unico" ? "em “Escolher dos lidos nos DFDs”" : "numa subunidade (editar → “Escolher dos lidos nos DFDs”)";
  const lista5 = (l: CentroLido[], dono?: boolean) =>
    l
      .slice(0, 5)
      .map((c) => `“${c.centro}”${dono ? ` (em ${fora(c.centro)})` : ""}`)
      .join("; ") + (l.length > 5 ? `; e mais ${l.length - 5}` : "");
  const avisosLidos: Aviso[] = [
    ...(semCadastro.length
      ? [{ id: "sem-cadastro", texto: `${semCadastro.length} centro(s) de custo dos DFDs desta unidade ainda sem cadastro — escolha ${ondeEscolher}: ${lista5(semCadastro)}.`, tom: "danger" as const }]
      : []),
    ...(emOutro.length
      ? [{ id: "em-outro", texto: `${emOutro.length} centro(s) de custo dos DFDs desta unidade estão cadastrados em OUTRA unidade — marque ${ondeEscolher} para movê-los para cá: ${lista5(emOutro, true)}.`, tom: "warn" as const }]
      : []),
  ];
  const donosNoRascunho = (exceto: number | null) => {
    const m = new Map<string, string>();
    lista.forEach((x, k) => {
      if (k !== exceto) for (const c of x.centros) m.set(chaveCentro(c), x.nome);
    });
    return m;
  };
  const escolhidos = lista.reduce((t, s) => t + s.marcados, 0);
  // TODAS as mensagens da seção no (!) — nada de faixas que empurram a tela.
  const avisos: Aviso[] = [
    ...(sujo ? [{ id: "sujo", texto: "Alterações ainda não salvas — use “Salvar alterações” no rodapé.", tom: "warn" as const }] : []),
    ...(motivo ? [{ id: "motivo", texto: motivo, tom: "danger" as const }] : []),
    ...(modo === "unico" && !centros.length ? [{ id: "sem-centro", texto: "Sem centro de custo cadastrado — os DFDs da unidade ficam com erro.", tom: "danger" as const }] : []),
    ...(modo === "subunidades" && !lista.length
      ? [{ id: "sem-sub", texto: "Nenhuma subunidade — adicione e cadastre o centro de custo de cada uma.", tom: "danger" as const }]
      : []),
    ...avisosLidos,
  ];

  async function trocarModo(novo: ModoCentro) {
    if (novo === modo) return;
    if (novo === "unico") {
      // Os centros das subunidades viram os da unidade; as subunidades ficam (só o nome) para a escolha no DFD.
      setCentros(lerCentros([...centros, ...lista.flatMap((s) => s.centros)]));
      setLista(lista.map((s) => ({ ...s, centros: [] })));
    } else {
      if (escolhidos > 0) {
        const ok = await confirmar({
          titulo: "Um centro de custo por subunidade?",
          texto: `${escolhidos} DFD(s) têm a subunidade escolhida — no modo por subunidade, ela passa a sair do centro de custo de cada DFD.`,
          confirmar: "Trocar",
        });
        if (!ok) return;
      }
      // Os centros da unidade vão à 1ª subunidade (ou a uma nova com o nome da unidade).
      if (centros.length)
        setLista(lista.length ? lista.map((s, i) => (i === 0 ? { ...s, centros } : s)) : [{ key: `n${Date.now()}`, nome: codigo, centros, marcados: 0 }]);
      setCentros([]);
    }
    setModo(novo);
  }

  async function salvar(): Promise<boolean> {
    const saem = (cad?.subunidades ?? []).filter((s) => s.marcados > 0 && !lista.some((x) => x.id === s.id));
    if (saem.length) {
      const n = saem.reduce((t, s) => t + s.marcados, 0);
      const ok = await confirmar({
        titulo: "Tirar subunidades escolhidas em DFDs?",
        texto: `${saem.map((s) => s.nome).join(", ")} ${saem.length === 1 ? "está" : "estão"} em ${n} DFD(s) — eles ficam sem subunidade (com erro até escolher outra).`,
        confirmar: "Salvar",
        perigo: true,
      });
      if (!ok) return false;
    }
    setSalvando(true);
    try {
      const r = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo,
          centros,
          subunidades: lista.map((s) => ({ ...(s.id != null ? { id: s.id } : {}), nome: s.nome, centros: s.centros })),
          ...(moverValidos.length ? { mover: moverValidos } : {}),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<CadastroSubunidades>;
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar o centro de custo.");
      aplicar(j as CadastroSubunidades);
      toast.success("Centro de custo salvo.");
      onMudou();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o centro de custo.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  salvarRef.current = salvar;

  function mover(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setLista(nova);
  }

  const unico = modo === "unico";
  const aberta = editando === "nova" ? null : editando != null ? lista[editando] : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<ModoCentro> ariaLabel="Centro de custo da unidade" value={modo} onChange={(m) => void trocarModo(m)} options={MODOS_OPCOES} disabled={salvando} />
        <Ajuda titulo="Centro de custo e subunidades" botao>
          <p>
            O CENTRO DE CUSTO que a automação “Unidades dos DFDs × Centro de Custo” grava em cada DFD tem de estar cadastrado aqui. A subunidade aparece na coluna Subunidade
            de Mesa → DFDs e Itens (com o filtro).
          </p>
          <TopicoAjuda titulo={ROTULO_MODO.unico}>{DESCRICAO_MODO.unico}</TopicoAjuda>
          <TopicoAjuda titulo={ROTULO_MODO.subunidades}>{DESCRICAO_MODO.subunidades}</TopicoAjuda>
          <TopicoAjuda titulo="Obrigatório">
            Sem centro de custo cadastrado, com o centro do DFD fora do cadastro ou (no modo único, com subunidades) sem a subunidade escolhida, o DFD fica com erro. Cada centro
            de custo pertence a um só cadastro do sistema.
          </TopicoAjuda>
        </Ajuda>
        <Avisos avisos={avisos} titulo="Centro de custo" />
      </div>
      {unico && <CamposCentros centros={centros} centrosLidos={cad.centros} dono={() => undefined} fora={fora} onMover={moverPara} disabled={salvando} onChange={setCentros} />}
      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[13.5px] font-bold text-text">Subunidades ({lista.length})</span>
          <Ajuda titulo="Subunidades" compacta>
            {unico
              ? `Escolhidas em cada DFD (no banner do DFD ou em massa na Mesa). Sem nenhuma, a subunidade de todo DFD é a própria unidade (${codigo}).`
              : "Cada subunidade com os seus centros de custo — a do DFD é a que tem o centro de custo dele."}
          </Ajuda>
        </div>
        <div className="space-y-1.5">
          {lista.length === 0 && (
            <p className="rounded-control border border-dashed border-border px-3 py-2.5 text-[13px] text-muted">
              {unico ? `Nenhuma — a subunidade de todo DFD é a própria unidade (${codigo}).` : "Nenhuma subunidade — adicione e cadastre o centro de custo de cada uma."}
            </p>
          )}
          {lista.map((s, i) => (
            <div key={s.key} className="flex items-start gap-2 rounded-control border border-border bg-surface p-[var(--pad-card)]">
              <div className="min-w-0 flex-1">
                <p className="break-words text-[13.5px] font-semibold text-text">{s.nome}</p>
                {!unico && s.centros.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {s.centros.map((c) => (
                      <li key={c} className="break-words font-mono text-[12px] leading-snug text-text-2">
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {unico && s.marcados > 0 && (
                <span className="shrink-0">
                  <Badge tone="slate">{s.marcados} DFD(s)</Badge>
                </span>
              )}
              <span className="shrink-0">
                <AcoesCadastro
                  nome={s.nome}
                  primeira={i === 0}
                  ultima={i === lista.length - 1}
                  disabled={salvando}
                  onMover={(d) => mover(i, d)}
                  onEditar={() => setEditando(i)}
                  onExcluir={() => setLista(lista.filter((_, k) => k !== i))}
                />
              </span>
            </div>
          ))}
          <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} disabled={salvando} onClick={() => setEditando("nova")}>
            Adicionar subunidade
          </Button>
        </div>
      </div>
      {editando != null && (
        <EditorSubunidade
          inicial={aberta}
          padrao={codigo}
          comCentros={!unico}
          centrosLidos={cad.centros}
          fora={fora}
          avisos={avisosLidos}
          noRascunho={(() => {
            const m = donosNoRascunho(editando === "nova" ? null : editando);
            for (const c of centros) m.set(chaveCentro(c), "a unidade");
            return m;
          })()}
          onFechar={() => setEditando(null)}
          onSalvar={(v) => {
            moverPara(v.mover);
            if (editando === "nova") setLista([...lista, { key: `n${Date.now()}`, nome: v.nome, centros: v.centros, marcados: 0 }]);
            else setLista(lista.map((x, k) => (k === editando ? { ...x, nome: v.nome, centros: v.centros } : x)));
            setEditando(null);
          }}
        />
      )}
      {confirmacao}
    </div>
  );
}

/** Os CENTROS DE CUSTO de um cadastro: TODOS os escolhidos/salvos à vista em chips (remover no ×; digitar + Enter
 * acrescenta, como a Centi escreve) e "Escolher dos lidos nos DFDs" — SEMPRE à vista, com TODOS os lidos: os dos DFDs
 * desta unidade primeiro (com quantos DFDs cada um). O de OUTRA unidade (`fora`) aparece com o dono e marcá-lo pede
 * confirmação para MOVER (`onMover`); o de outro cadastro DESTA unidade (`dono`) acusa o conflito no editor. */
function CamposCentros({
  centros,
  centrosLidos,
  dono,
  fora,
  onMover,
  disabled,
  onChange,
}: {
  centros: string[];
  centrosLidos: CentroLido[];
  /** O dono do centro DENTRO deste rascunho (outra subunidade, a unidade). */
  dono: (c: string) => string | undefined;
  /** O dono do centro em OUTRA unidade (ainda não movido). */
  fora: (c: string) => string | undefined;
  onMover: (centros: string[]) => void;
  disabled?: boolean;
  onChange: (centros: string[]) => void;
}) {
  const { confirmar, confirmacao } = useConfirmacao();
  const marcados = new Set(centros.map(chaveCentro));
  const lidos = new Set(centrosLidos.map((c) => chaveCentro(c.centro)));
  // Pela CHAVE (caixa/acento/pontuação não importam) — o valor da opção é o texto lido.
  const escolhidos = centrosLidos.filter((c) => marcados.has(chaveCentro(c.centro))).map((c) => c.centro);
  const digitados = centros.filter((c) => !lidos.has(chaveCentro(c)));
  const opcoes = centrosLidos.map((c) => {
    const d = fora(c.centro) ?? dono(c.centro);
    return {
      valor: c.centro,
      contagem: c.dfds,
      grupo: c.daUnidade > 0 ? "Dos DFDs desta unidade" : "De outras unidades",
      detalhe: [c.daUnidade > 0 ? `${c.daUnidade} DFD(s) desta unidade` : `${c.dfds} DFD(s) de outras unidades`, d ? `Está em ${d}` : ""].filter(Boolean).join(" · "),
    };
  });
  async function escolher(v: string[]) {
    const novos = v.filter((c) => !marcados.has(chaveCentro(c)));
    const externos = novos.filter((c) => fora(c));
    let aceitos = v;
    if (externos.length) {
      const ok = await confirmar({
        titulo: externos.length === 1 ? "Mover o centro de custo para esta unidade?" : `Mover ${externos.length} centros de custo para esta unidade?`,
        texto: `${externos.map((c) => `“${c}” está em ${fora(c)}`).join("; ")}. Ao salvar, ${externos.length === 1 ? "ele sai" : "eles saem"} de lá — uma subunidade que ficar sem centro passa a “Sem centro de custo”.`,
        confirmar: "Mover",
      });
      if (ok) onMover(externos);
      else aceitos = v.filter((c) => !externos.includes(c));
    }
    onChange(lerCentros([...aceitos, ...digitados]));
  }
  return (
    <div className="space-y-2">
      <CampoLista
        label={`Centros de custo (${centros.length})`}
        valores={centros}
        onChange={(v) => onChange(lerCentros(v))}
        maxItem={LIMITES_SUBUNIDADE.centro}
        disabled={disabled}
        placeholder="Digite como a Centi escreve e tecle Enter"
        rotuloExtra={
          <Ajuda titulo="Centros de custo" compacta>
            Os centros de custo deste cadastro. Escolha dos que a automação “Unidades dos DFDs × Centro de Custo” já gravou nos DFDs (os desta unidade primeiro) ou digite
            como a Centi escreve. Um centro de custo pertence a um só cadastro: o de outra unidade aparece com o dono e, marcado, é movido para cá ao salvar.
          </Ajuda>
        }
      />
      <SeletorMultiplo
        suspenso
        rotulo="Escolher dos lidos nos DFDs"
        opcoes={opcoes}
        selecionados={escolhidos}
        onChange={(v) => void escolher(v)}
        disabled={disabled || !opcoes.length}
        textoVazio={opcoes.length ? "Nenhum" : "Nenhum centro lido nos DFDs"}
      />
      {confirmacao}
    </div>
  );
}

/** O editor de UMA subunidade: o nome e, no modo "um por subunidade", os centros de custo (obrigatórios). */
function EditorSubunidade({
  inicial,
  padrao,
  comCentros,
  centrosLidos,
  fora,
  avisos,
  noRascunho,
  onFechar,
  onSalvar,
}: {
  inicial: SubRascunho | null;
  /** O nome quando nenhum é informado (o da unidade). */
  padrao: string;
  comCentros: boolean;
  centrosLidos: CentroLido[];
  fora: (c: string) => string | undefined;
  /** Os avisos dos centros dos DFDs da unidade fora do cadastro (os mesmos da seção). */
  avisos: Aviso[];
  noRascunho: Map<string, string>;
  onFechar: () => void;
  onSalvar: (v: { nome: string; centros: string[]; mover: string[] }) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [centros, setCentros] = useState<string[]>(inicial?.centros ?? []);
  // Os de outra unidade que este editor move (só valem ao Aplicar).
  const [mover, setMover] = useState<string[]>([]);
  const movendo = new Set(mover.map(chaveCentro));
  const foraAqui = (c: string) => (movendo.has(chaveCentro(c)) ? undefined : fora(c));
  const doRascunho = (c: string) => noRascunho.get(chaveCentro(c));
  const dono = (c: string) => foraAqui(c) ?? doRascunho(c);
  const conflito = centros.map((c) => [c, dono(c)] as const).find(([, d]) => d);
  const nomeFinal = nome.trim() || padrao;
  const motivo = conflito
      ? `O centro de custo “${conflito[0]}” já está em ${conflito[1]}.`
      : comCentros
        ? motivoSubunidadesInvalidas("subunidades", [], [{ nome: nomeFinal, centros }])
        : null;
  return (
    <Modal
      open
      onClose={onFechar}
      titulo={inicial ? `Subunidade · ${inicial.nome}` : "Nova subunidade"}
      size="md"
      rodape={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <span className="mr-auto">
            <Avisos avisos={[...(motivo ? [{ id: "motivo", texto: motivo, tom: "danger" as const }] : []), ...(comCentros ? avisos : [])]} titulo="Subunidade" />
          </span>
          <Button size="sm" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!!motivo} onClick={() => onSalvar({ nome: nomeFinal, centros, mover: mover.filter((c) => centros.some((x) => chaveCentro(x) === chaveCentro(c))) })}>
            Aplicar
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <TextField
          label="Nome da subunidade"
          value={nome}
          placeholder={`Sem nome = ${padrao} (o da unidade)`}
          maxLength={LIMITES_SUBUNIDADE.nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
        />
        {comCentros && (
          <CamposCentros
            centros={centros}
            centrosLidos={centrosLidos}
            dono={doRascunho}
            fora={foraAqui}
            onMover={(l) => setMover((m) => lerCentros([...m, ...l]))}
            onChange={setCentros}
          />
        )}
      </div>
    </Modal>
  );
}
