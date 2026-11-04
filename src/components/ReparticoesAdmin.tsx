"use client";

import { lerJsonGuardado } from "@/lib/dados-cliente";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { conferenciaDaUnidade, vigentesDoAlvo } from "@/lib/responsaveis-planilha-core";
import { useAbrirDaUrl } from "./AbrirDaUrl";
import { BotaoVoltar } from "./AbasEspaco";
import { useOndeDetalhe } from "./CanalGrupo";
import { AcoesCadastro } from "./AcoesCadastro";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Badge } from "./Badge";
import { BannerCadastro, type CampoCadastro } from "./BannerCadastro";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { IconEye, IconEyeOff, IconLandmark, IconLayers, IconPlus, IconTrash, IconUsers } from "./icons";
import { BotaoExonerados, CelulaConferencia, PlanilhaResponsaveis, ResponsaveisDoAlvo, rotulosConferencia, usePlanilhaResponsaveis } from "./PlanilhaResponsaveis";
import { SecaoBanner } from "./SecaoBanner";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";
import { CelulaResponsaveis } from "./VinculosResponsaveis";
import { CelulaLista } from "./CelulaLista";
import { ErroCarga } from "./ErroCarga";
import { CampoLista, TextField } from "./Field";
import { Modal } from "./Modal";
import { SeletorMultiplo } from "./SeletorMultiplo";
import {
  chaveCentro,
  DESCRICAO_VINCULO,
  LIMITES_SUBUNIDADE,
  lerCentros,
  motivoSubunidadesInvalidas,
  ROTULO_VINCULO,
  VINCULOS_SUBUNIDADE,
  type VinculoSubunidade,
} from "@/lib/subunidades-core";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  ordem: number;
  numeroInteressado: string | null;
  setorRequisitante: string | null;
  /** O tipo de VÍNCULO das subunidades e os nomes delas (a coluna da lista — o cadastro abre no banner). */
  vinculoSubunidade: VinculoSubunidade;
  subunidades: string[];
  orgaoId: number | null;
  /** 1 = unidade PRÓPRIA do órgão (o órgão funciona também como unidade). */
  orgaoProprio: boolean;
  oculto: boolean;
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
      value: (u) => (u.vinculoSubunidade === "proprio" ? "Próprio" : u.subunidades.join(", ") || "—"),
      valores: (u) => (u.vinculoSubunidade === "proprio" ? ["Próprio"] : u.subunidades.length ? u.subunidades : ["—"]),
      render: (u) =>
        u.vinculoSubunidade === "proprio" ? (
          <span className="text-[12px] text-muted">Próprio</span>
        ) : (
          <span className="inline-flex items-center gap-1.5" title={DESCRICAO_VINCULO[u.vinculoSubunidade]}>
            <Badge tone={u.vinculoSubunidade === "marcado" ? "cyan" : "violet"}>{ROTULO_VINCULO[u.vinculoSubunidade]}</Badge>
            <CelulaLista valores={u.subunidades} />
          </span>
        ),
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
            <SecaoBanner titulo="Subunidades">
              <SubunidadesDaUnidade key={unidade.id} unidadeId={unidade.id} codigo={unidade.codigo} onMudou={() => void carregar()} />
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
  vinculo: VinculoSubunidade;
  subunidades: { id: number; nome: string; centros: string[]; marcados: number }[];
  centros: { centro: string; dfds: number }[];
  outras: { unidade: string; subunidade: string; centros: string[] }[];
};
type SubRascunho = { key: string; id?: number; nome: string; centros: string[]; marcados: number };

const VINCULOS_OPCOES = VINCULOS_SUBUNIDADE.map((v) => ({ value: v, label: ROTULO_VINCULO[v], dica: DESCRICAO_VINCULO[v] }));

/**
 * As SUBUNIDADES de uma unidade (seção do banner): o tipo de VÍNCULO (Próprio · Centro de custo · Marcado) e a lista —
 * quantas quiser — num RASCUNHO; "Salvar subunidades" grava o cadastro inteiro num lote (`PUT …/subunidades`). No vínculo
 * Centro de custo, cada subunidade escolhe os centros de custo lidos nos DFDs (ou digitados) — um centro em UMA subunidade
 * do sistema. Trocar o vínculo guarda a lista (ela volta se o vínculo voltar).
 */
function SubunidadesDaUnidade({ unidadeId, codigo, onMudou }: { unidadeId: number; codigo: string; onMudou: () => void }) {
  const url = `/api/admin/reparticoes/${unidadeId}/subunidades`;
  const [cad, setCad] = useState<CadastroSubunidades | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [vinculo, setVinculo] = useState<VinculoSubunidade>("proprio");
  const [lista, setLista] = useState<SubRascunho[]>([]);
  const [editando, setEditando] = useState<number | "nova" | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const aplicar = useCallback((c: CadastroSubunidades) => {
    setCad(c);
    setVinculo(c.vinculo);
    setLista(c.subunidades.map((s) => ({ key: `s${s.id}`, id: s.id, nome: s.nome, centros: s.centros, marcados: s.marcados })));
  }, []);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch(url);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<CadastroSubunidades>;
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar as subunidades.");
      aplicar(j as CadastroSubunidades);
      setErroCarga(null);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Erro ao carregar as subunidades.");
    }
  }, [url, aplicar]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!cad) {
    return erroCarga ? <ErroCarga msg={erroCarga} onTentar={() => void carregar()} /> : <SkeletonLinhas linhas={3} />;
  }

  const original = JSON.stringify([cad.vinculo, cad.subunidades.map((s) => [s.id, s.nome, s.centros])]);
  const sujo = JSON.stringify([vinculo, lista.map((s) => [s.id, s.nome, s.centros])]) !== original;
  // Os centros de custo das OUTRAS unidades (não se escolhem aqui) e o dono de cada centro dentro deste rascunho.
  const deOutras = new Map<string, string>();
  for (const o of cad.outras) for (const c of o.centros) deOutras.set(chaveCentro(c), `${o.subunidade} (${o.unidade})`);
  const motivo = motivoSubunidadesInvalidas(lista);

  async function salvar() {
    const saem = (cad?.subunidades ?? []).filter((s) => s.marcados > 0 && !lista.some((x) => x.id === s.id));
    if (saem.length) {
      const n = saem.reduce((t, s) => t + s.marcados, 0);
      const ok = await confirmar({
        titulo: "Tirar subunidades com DFDs?",
        texto: `${saem.map((s) => s.nome).join(", ")} ${saem.length === 1 ? "tem" : "têm"} ${n} DFD(s) com a subunidade escolhida — eles ficam sem subunidade.`,
        confirmar: "Salvar",
        perigo: true,
      });
      if (!ok) return;
    }
    setSalvando(true);
    try {
      const r = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vinculo, subunidades: lista.map((s) => ({ ...(s.id != null ? { id: s.id } : {}), nome: s.nome, centros: s.centros })) }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<CadastroSubunidades>;
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar as subunidades.");
      aplicar(j as CadastroSubunidades);
      toast.success("Subunidades salvas.");
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar as subunidades.");
    } finally {
      setSalvando(false);
    }
  }

  function mover(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setLista(nova);
  }
  async function excluir(i: number) {
    const s = lista[i];
    if (s.marcados > 0) {
      const ok = await confirmar({ titulo: `Tirar a subunidade ${s.nome}?`, texto: `${s.marcados} DFD(s) estão com ela escolhida — ficam sem subunidade ao salvar.`, confirmar: "Tirar", perigo: true });
      if (!ok) return;
    }
    setLista(lista.filter((_, k) => k !== i));
  }

  const aberta = editando === "nova" ? null : editando != null ? lista[editando] : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<VinculoSubunidade> ariaLabel="Tipo de vínculo das subunidades" value={vinculo} onChange={setVinculo} options={VINCULOS_OPCOES} disabled={salvando} />
        <Ajuda titulo="Subunidades" botao>
          <p>A subunidade de cada DFD da unidade sai do tipo de vínculo — ela aparece na coluna Subunidade de Mesa → DFDs e Itens (com o filtro).</p>
          <TopicoAjuda titulo="Próprio">{DESCRICAO_VINCULO.proprio}</TopicoAjuda>
          <TopicoAjuda titulo="Centro de custo">
            {DESCRICAO_VINCULO.centro_custo} O centro de custo é o que a automação “Unidades dos DFDs × Centro de Custo” grava em cada DFD; cada centro pertence a uma única subunidade do sistema.
          </TopicoAjuda>
          <TopicoAjuda titulo="Marcado">{DESCRICAO_VINCULO.marcado} O DFD sem a escolha fica apontado “Subunidade não definida”.</TopicoAjuda>
        </Ajuda>
      </div>
      <p className="text-[13px] text-muted">{vinculo === "proprio" ? `A subunidade de todo DFD é a própria unidade (${codigo}).` : DESCRICAO_VINCULO[vinculo]}</p>
      {vinculo !== "proprio" && (
        <div className="space-y-1.5">
          {lista.length === 0 && <p className="text-[13px] text-faint">Nenhuma subunidade — use “Adicionar subunidade”.</p>}
          {lista.map((s, i) => (
            <div key={s.key} className="flex flex-wrap items-center gap-2 rounded-control border border-border px-3 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-text">{s.nome}</span>
                {vinculo === "centro_custo" && (
                  <span className={`block truncate text-[12px] ${s.centros.length ? "text-muted" : "text-[var(--warn)]"}`} title={s.centros.join("\n")}>
                    {s.centros.length ? `${s.centros.length} centro(s) de custo: ${s.centros.join(" · ")}` : "Sem centro de custo ligado"}
                  </span>
                )}
              </span>
              {s.marcados > 0 && <Badge tone="slate">{s.marcados} DFD(s)</Badge>}
              <AcoesCadastro
                nome={s.nome}
                primeira={i === 0}
                ultima={i === lista.length - 1}
                disabled={salvando}
                onMover={(d) => mover(i, d)}
                onEditar={() => setEditando(i)}
                onExcluir={() => void excluir(i)}
              />
            </div>
          ))}
          <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} disabled={salvando} onClick={() => setEditando("nova")}>
            Adicionar subunidade
          </Button>
        </div>
      )}
      {motivo && <Callout kind="danger">{motivo}</Callout>}
      {sujo && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={salvando} onClick={() => aplicar(cad)}>
            Descartar
          </Button>
          <Button size="sm" loading={salvando} disabled={!!motivo} onClick={() => void salvar()}>
            Salvar subunidades
          </Button>
        </div>
      )}
      {editando != null && (
        <EditorSubunidade
          inicial={aberta}
          porCentro={vinculo === "centro_custo"}
          centrosLidos={cad.centros}
          deOutras={deOutras}
          noRascunho={(() => {
            const m = new Map<string, string>();
            lista.forEach((x, k) => {
              if (k !== editando) for (const c of x.centros) m.set(chaveCentro(c), x.nome);
            });
            return m;
          })()}
          onFechar={() => setEditando(null)}
          onSalvar={(v) => {
            if (editando === "nova") setLista([...lista, { key: `n${Date.now()}`, nome: v.nome, centros: v.centros, marcados: 0 }]);
            else setLista(lista.map((x, k) => (k === editando ? { ...x, ...v } : x)));
            setEditando(null);
          }}
        />
      )}
      {confirmacao}
    </div>
  );
}

/** O editor de UMA subunidade: o nome e, no vínculo Centro de custo, os centros de custo — escolhidos dos que a automação
 * gravou nos DFDs (com quantos DFDs têm cada um) ou digitados. Os centros de outras subunidades não são oferecidos. */
function EditorSubunidade({
  inicial,
  porCentro,
  centrosLidos,
  deOutras,
  noRascunho,
  onFechar,
  onSalvar,
}: {
  inicial: SubRascunho | null;
  porCentro: boolean;
  centrosLidos: { centro: string; dfds: number }[];
  deOutras: Map<string, string>;
  noRascunho: Map<string, string>;
  onFechar: () => void;
  onSalvar: (v: { nome: string; centros: string[] }) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const lidos = new Map(centrosLidos.map((c) => [chaveCentro(c.centro), c]));
  const inicialCentros = inicial?.centros ?? [];
  const [escolhidos, setEscolhidos] = useState<string[]>(inicialCentros.filter((c) => lidos.has(chaveCentro(c))));
  const [digitados, setDigitados] = useState<string[]>(inicialCentros.filter((c) => !lidos.has(chaveCentro(c))));
  const dono = (c: string) => deOutras.get(chaveCentro(c)) ?? noRascunho.get(chaveCentro(c));
  const opcoes = centrosLidos
    .filter((c) => !dono(c.centro) || escolhidos.includes(c.centro))
    .map((c) => ({ valor: c.centro, contagem: c.dfds }));
  const ocupados = centrosLidos.length - opcoes.length;
  const centros = lerCentros([...escolhidos, ...digitados]);
  const conflito = centros.map((c) => [c, dono(c)] as const).find(([, d]) => d);
  const motivo = !nome.trim()
    ? "Informe o nome da subunidade."
    : conflito
      ? `O centro de custo “${conflito[0]}” já está em ${conflito[1]}.`
      : motivoSubunidadesInvalidas([{ nome, centros }]);
  return (
    <Modal
      open
      onClose={onFechar}
      titulo={inicial ? `Subunidade · ${inicial.nome}` : "Nova subunidade"}
      size="md"
      rodape={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {motivo && <span className="mr-auto text-[12px] text-[var(--danger)]">{motivo}</span>}
          <Button size="sm" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!!motivo} onClick={() => onSalvar({ nome: nome.trim(), centros })}>
            Aplicar
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <TextField label="Nome da subunidade" value={nome} maxLength={LIMITES_SUBUNIDADE.nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        {porCentro && (
          <>
            <SeletorMultiplo
              rotulo="Centros de custo lidos nos DFDs"
              opcoes={opcoes}
              selecionados={escolhidos}
              onChange={setEscolhidos}
              campo={{
                extra: (
                  <Ajuda titulo="Centros de custo" compacta>
                    Os centros de custo que a automação “Unidades dos DFDs × Centro de Custo” gravou nos DFDs, com quantos DFDs têm cada um.
                    {ocupados > 0 ? ` ${ocupados} já pertence(m) a outra subunidade e não aparece(m) aqui.` : ""}
                  </Ajuda>
                ),
              }}
              textoVazio="Nenhum escolhido"
            />
            <CampoLista
              label="Outros centros de custo (digitar)"
              valores={digitados}
              onChange={(v) => setDigitados(lerCentros(v))}
              maxItem={LIMITES_SUBUNIDADE.centro}
              placeholder="Como a Centi escreve — Enter acrescenta"
            />
          </>
        )}
      </div>
    </Modal>
  );
}
