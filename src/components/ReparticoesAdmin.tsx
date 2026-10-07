"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { conferenciaDaUnidade, vigentesDoAlvo } from "@/lib/responsaveis-planilha-core";
import { AcoesCadastro } from "./AcoesCadastro";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Badge } from "./Badge";
import { BannerCadastro, type CampoCadastro } from "./BannerCadastro";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { IconChevronLeft, IconEye, IconEyeOff, IconLandmark, IconLayers, IconPlus, IconTrash, IconUsers } from "./icons";
import { BotaoExonerados, CelulaConferencia, PlanilhaResponsaveis, ResponsaveisDoAlvo, rotulosConferencia, usePlanilhaResponsaveis } from "./PlanilhaResponsaveis";
import { SecaoBanner } from "./SecaoBanner";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";
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
  const ctx = usePlanilhaResponsaveis();
  const [aba, setAba] = useState<AbaUnidades>(abaInicial);
  const [exonerados, setExonerados] = useState(false);
  const [lista, setLista] = useState<Rep[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<number | "novo" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

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
    if (ctx.planilha) for (const u of lista ?? []) m.set(u.id, conferenciaDaUnidade(u, assinaturaUnica, ctx.grupos, ctx.hoje));
    return m;
  }, [lista, assinaturaUnica, ctx.planilha, ctx.grupos, ctx.hoje]);

  if (lista === null) {
    return (
      <div className="rounded-card border border-border p-4">
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
          <div className="rounded-card border border-border p-4">
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
