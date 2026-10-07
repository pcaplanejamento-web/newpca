"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { EdicaoTabela } from "@/lib/edicoes-tabela-core";
import { conferenciaDoOrgao, vigentesDoAlvo } from "@/lib/responsaveis-planilha-core";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Badge } from "./Badge";
import { BannerCadastro, type CampoCadastro } from "./BannerCadastro";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { selectCls } from "./formStyles";
import { IconEye, IconEyeOff, IconLandmark, IconLayers, IconPlus, IconTrash, IconUsers } from "./icons";
import { CelulaConferencia, PlanilhaResponsaveis, ResponsaveisDoAlvo, rotulosConferencia, usePlanilhaResponsaveis } from "./PlanilhaResponsaveis";
import { SecaoBanner } from "./SecaoBanner";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";
import { CelulaResponsaveis } from "./VinculosResponsaveis";

type Orgao = {
  id: number;
  sigla: string;
  nome: string;
  orgaoEntidade: string | null;
  assinaturaUnica: boolean;
  numeroInteressado: string | null;
  /** O ID da entidade do órgão na Centi (ex.: "02"). */
  entidadeCenti: string | null;
  oculto: boolean;
  /** Funciona TAMBÉM como unidade (tem a unidade própria). */
  tambemUnidade: boolean;
  /** Tem unidades-filhas comuns (impede rebaixar e virar dual). */
  temUnidades: boolean;
};

/** A chave das edições salvas da tabela de órgãos (tabela da Administração — só o ADM). */
export const CHAVE_TABELA_ORGAOS = "admin:orgaos:tabela";

export type AbaOrgaos = "orgaos" | "responsaveis";

const CAMPOS: CampoCadastro[] = [
  { chave: "sigla", label: "Sigla", placeholder: "Ex.: PMRV", max: 30, obrigatorio: true, mono: true },
  { chave: "entidadeCenti", label: "ID na Centi", placeholder: "Ex.: 02", max: 4, mono: true, inputMode: "numeric", filtro: (v) => v.replace(/\D/g, "").slice(0, 4) },
  { chave: "nome", label: "Nome do órgão", placeholder: "Ex.: Prefeitura Municipal de Rio Verde", max: 160, obrigatorio: true, span: true },
  { chave: "orgaoEntidade", label: "Órgão/Entidade (identifica o DFD)", placeholder: "Ex.: PREFEITURA MUNICIPAL DE RIO VERDE", max: 200, span: true },
  { chave: "numeroInteressado", label: "Nº do interessado (protocolo em nome do órgão)", placeholder: "Ex.: 1008171", max: 60, mono: true, inputMode: "numeric", dica: "Único no sistema (órgãos e unidades)." },
  {
    chave: "assinatura",
    label: "Assinatura (responsáveis por DFDs)",
    opcoes: [
      { valor: "unidade", rotulo: "Cada unidade tem a sua" },
      { valor: "unica", rotulo: "Uma para todas as unidades" },
    ],
    dica: "Trocar não apaga vínculos: só muda de onde vêm os responsáveis (do órgão ou de cada unidade).",
  },
];

const valoresDe = (o: Orgao | null): Record<string, string> => ({
  sigla: o?.sigla ?? "",
  nome: o?.nome ?? "",
  orgaoEntidade: o?.orgaoEntidade ?? "",
  numeroInteressado: o?.numeroInteressado ?? "",
  entidadeCenti: o?.entidadeCenti ?? "",
  assinatura: o?.assinaturaUnica ? "unica" : "unidade",
});

/**
 * ÓRGÃOS E UNIDADES (ADM) — abas **Órgãos | Responsáveis**. Órgãos na tabela padrão da Mesa (compacta, rolagem interna,
 * filtros por coluna, exportar): sigla, nome, identificação do DFD, Centi, assinatura, os responsáveis VIGENTES, as
 * unidades (abre a tela delas) e a CONFERÊNCIA (o que está mal cadastrado). Tocar na linha abre o BANNER do órgão (dados
 * por cadeado, responsáveis, estrutura, ocultar, excluir). Responsáveis = a planilha única de pessoas.
 */
export function OrgaosAdmin({ abaInicial, edicoes }: { abaInicial: AbaOrgaos; edicoes: { lista: EdicaoTabela[]; padroes: Record<string, unknown> } }) {
  const router = useRouter();
  const ctx = usePlanilhaResponsaveis();
  const [aba, setAba] = useState<AbaOrgaos>(abaInicial);
  const [lista, setLista] = useState<Orgao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<number | "novo" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [destino, setDestino] = useState("");
  const { confirmar, confirmacao } = useConfirmacao();
  // As EDIÇÕES SALVAS da tabela (guardadas aqui: trocar de aba remonta a tabela, que volta com as edições novas).
  const [ed, setEd] = useState(edicoes);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/orgaos");
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; orgaos?: Orgao[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar os órgãos.");
      setLista(j.orgaos ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar os órgãos.");
      setLista((l) => l ?? []);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function trocarAba(a: AbaOrgaos) {
    setAba(a);
    try {
      const url = new URL(window.location.href);
      if (a === "orgaos") url.searchParams.delete("aba");
      else url.searchParams.set("aba", a);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* sem a URL, a aba vale só nesta visita */
    }
  }

  /** Executa a ação (o banner fica travado) e diz o desfecho num aviso flutuante; recarrega órgãos e responsáveis. */
  async function acao(url: string, init: RequestInit, sucesso: string): Promise<boolean> {
    setOcupado(true);
    try {
      const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: number };
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

  const unidadesDe = useMemo(() => {
    const m = new Map<number, { id: number; oculto: boolean }[]>();
    for (const u of ctx.planilha?.unidades ?? []) if (u.orgaoId != null) m.set(u.orgaoId, [...(m.get(u.orgaoId) ?? []), u]);
    return m;
  }, [ctx.planilha]);

  const conf = useMemo(() => {
    const m = new Map<number, ReturnType<typeof conferenciaDoOrgao>>();
    if (ctx.planilha) for (const o of lista ?? []) m.set(o.id, conferenciaDoOrgao(o, unidadesDe.get(o.id) ?? [], ctx.grupos, ctx.hoje));
    return m;
  }, [lista, unidadesDe, ctx.planilha, ctx.grupos, ctx.hoje]);

  if (lista === null) {
    return (
      <div className="rounded-card border border-border p-4">
        <SkeletonLinhas linhas={6} />
      </div>
    );
  }

  const orgao = typeof aberto === "number" ? (lista.find((o) => o.id === aberto) ?? null) : null;

  function corpo(o: Orgao | null, v: Record<string, string>, extra: { oculto?: boolean } = {}) {
    return {
      sigla: v.sigla,
      nome: v.nome,
      orgaoEntidade: v.orgaoEntidade || null,
      numeroInteressado: v.numeroInteressado || null,
      entidadeCenti: v.entidadeCenti || null,
      assinaturaUnica: v.assinatura === "unica",
      oculto: extra.oculto ?? o?.oculto ?? false,
    };
  }

  async function salvar(patch: Record<string, string>): Promise<boolean> {
    if (aberto === "novo") {
      const ok = await acao("/api/admin/orgaos", { method: "POST", body: JSON.stringify(corpo(null, patch)) }, "Órgão cadastrado.");
      if (ok) setAberto(null);
      return ok;
    }
    if (!orgao) return false;
    return acao(`/api/admin/orgaos/${orgao.id}`, { method: "PATCH", body: JSON.stringify(corpo(orgao, { ...valoresDe(orgao), ...patch })) }, "Órgão atualizado.");
  }

  const ocultar = (o: Orgao) =>
    acao(`/api/admin/orgaos/${o.id}`, { method: "PATCH", body: JSON.stringify(corpo(o, valoresDe(o), { oculto: !o.oculto })) }, o.oculto ? "Órgão reexibido." : "Órgão ocultado.");

  async function excluir(o: Orgao) {
    const n = unidadesDe.get(o.id)?.length ?? 0;
    const ok = await confirmar({
      titulo: `Excluir o órgão ${o.sigla}?`,
      texto: `${n ? `As ${n} unidade(s) dele também são excluídas. ` : ""}Órgão com DFD ou protocolo não se exclui — oculte-o.`,
      confirmar: "Excluir",
      perigo: true,
    });
    if (ok && (await acao(`/api/admin/orgaos/${o.id}`, { method: "DELETE" }, "Órgão excluído."))) setAberto(null);
  }

  async function tornarUnidade(o: Orgao, ativar: boolean) {
    const ok = await confirmar({
      titulo: ativar ? `${o.sigla} também funciona como unidade?` : `${o.sigla} deixa de ser unidade?`,
      texto: ativar ? "O órgão ganha a unidade própria (recebe DFDs e protocolos como uma unidade)." : "A unidade própria é removida.",
      confirmar: ativar ? "Também unidade" : "Deixar de ser unidade",
    });
    if (ok) await acao(`/api/admin/orgaos/${o.id}/unidade-propria`, { method: "POST", body: JSON.stringify({ ativar }) }, "Estrutura atualizada.");
  }

  async function rebaixar(o: Orgao) {
    const d = lista?.find((x) => String(x.id) === destino);
    if (!d) return;
    const ok = await confirmar({
      titulo: `Rebaixar ${o.sigla} a unidade de ${d.sigla}?`,
      texto: "O órgão deixa de existir e vira uma unidade — DFDs, protocolos, itens e os responsáveis dele passam para ela.",
      confirmar: "Rebaixar",
      perigo: true,
    });
    if (ok && (await acao(`/api/admin/orgaos/${o.id}/rebaixar`, { method: "POST", body: JSON.stringify({ orgaoDestino: d.id }) }, "Órgão rebaixado a unidade."))) {
      setAberto(null);
      setDestino("");
    }
  }

  const vigentes = (o: Orgao) => (o.assinaturaUnica ? vigentesDoAlvo(ctx.grupos.get(`o${o.id}`) ?? [], ctx.hoje) : null);
  const colunas: Column<Orgao>[] = [
    {
      key: "entidadeCenti",
      header: "Código Centi",
      nowrap: true,
      // A ordem natural ("2" antes de "10"; sem código, por último) = a do servidor.
      value: (o) => o.entidadeCenti ?? "—",
      render: (o) => <Mono v={o.entidadeCenti} />,
    },
    {
      key: "nome",
      header: "Nome do órgão",
      align: "left",
      minWidth: 220,
      value: (o) => o.nome,
      render: (o) => (
        <span className="inline-flex items-center gap-2">
          <span className={`font-medium ${o.oculto ? "text-faint" : "text-text"}`}>{o.nome}</span>
          {o.tambemUnidade && <Badge tone="cyan">Também unidade</Badge>}
          {o.oculto && <Badge tone="slate">Oculto</Badge>}
        </span>
      ),
    },
    { key: "sigla", header: "Sigla", nowrap: true, value: (o) => o.sigla, render: (o) => <Badge tone="violet">{o.sigla}</Badge> },
    {
      key: "orgaoEntidade",
      header: "Órgão/Entidade (DFD)",
      minWidth: 180,
      value: (o) => o.orgaoEntidade ?? "—",
      render: (o) => (o.orgaoEntidade ? <span className="line-clamp-1 text-[12px] text-text-2" title={o.orgaoEntidade}>{o.orgaoEntidade}</span> : <span className="text-faint">—</span>),
    },
    { key: "numeroInteressado", header: "Nº interessado", nowrap: true, value: (o) => o.numeroInteressado ?? "—", render: (o) => <Mono v={o.numeroInteressado} /> },
    {
      key: "assinatura",
      header: "Assinatura",
      nowrap: true,
      value: (o) => (o.assinaturaUnica ? "Única" : "Por unidade"),
      render: (o) => (o.assinaturaUnica ? <Badge tone="blue">Única</Badge> : <span className="text-[12px] text-faint">Por unidade</span>),
    },
    {
      key: "responsaveis",
      header: "Responsáveis vigentes",
      nowrap: true,
      value: (o) => vigentes(o)?.nomes.join(", ") || (o.assinaturaUnica ? "—" : "Por unidade"),
      valores: (o) => vigentes(o)?.nomes ?? ["Por unidade"],
      render: (o) => {
        const v = vigentes(o);
        return v ? <CelulaResponsaveis nomes={v.nomes} temporario={v.temporario} /> : <CelulaResponsaveis nomes={[]} temporario={false} nota="Por unidade" />;
      },
    },
    {
      key: "unidades",
      header: "Unidades",
      nowrap: true,
      filter: "range",
      formatarFaixa: (n) => String(n),
      total: false,
      numero: (o) => unidadesDe.get(o.id)?.length ?? 0,
      render: (o) => (
        <Button size="xs" variant="secondary" icon={<IconLayers className="h-4 w-4" />} onClick={(e) => {
            e.stopPropagation();
            router.push(`/painel/orgaos/${o.id}`);
          }} aria-label={`Unidades de ${o.sigla}`}>
          {unidadesDe.get(o.id)?.length ?? 0}
        </Button>
      ),
    },
    {
      key: "conf",
      header: "Conferência",
      nowrap: true,
      value: (o) => rotulosConferencia(conf.get(o.id) ?? [])[0],
      valores: (o) => rotulosConferencia(conf.get(o.id) ?? []),
      render: (o) => (ctx.planilha ? <CelulaConferencia msgs={conf.get(o.id) ?? []} /> : <span className="text-faint">…</span>),
    },
  ];

  const destinos = orgao ? lista.filter((o) => o.id !== orgao.id && !o.tambemUnidade) : [];

  return (
    <div className="space-y-[var(--gap-block)]">
      <Segmented<AbaOrgaos>
        ariaLabel="Órgãos ou responsáveis"
        value={aba}
        onChange={trocarAba}
        options={[
          { value: "orgaos", label: `Órgãos (${lista.length})`, icone: <IconLandmark className="h-4 w-4" /> },
          { value: "responsaveis", label: `Responsáveis (${ctx.planilha?.pessoas.length ?? "…"})`, icone: <IconUsers className="h-4 w-4" />, dica: "A planilha única dos responsáveis por DFDs" },
        ]}
      />
      {erro && <Callout kind="danger">{erro}</Callout>}
      {ctx.erro && <Callout kind="warn">{ctx.erro}</Callout>}

      <div key={aba} className="animate-cat-morph">
        {aba === "orgaos" ? (
          <DataTable
            columns={colunas}
            rows={lista}
            getKey={(o) => o.id}
            onRowClick={(o) => setAberto(o.id)}
            activeKey={typeof aberto === "number" ? aberto : null}
            scrollInterno
            density="compact"
            exportar={{ nome: "Órgãos" }}
            edicoes={{ chave: CHAVE_TABELA_ORGAOS, lista: ed.lista, padroes: ed.padroes, podePublicar: true, onMudar: (lista, padroes) => setEd({ lista, padroes }) }}
            vazio="Nenhum órgão cadastrado — use “Novo órgão”."
            acoesRodape={
              <>
                <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setAberto("novo")}>
                  Novo órgão
                </Button>
                <Ajuda titulo="Órgãos">
                  <p>Toque numa linha para abrir o órgão: os dados (cadeado), os responsáveis, a estrutura, ocultar e excluir. “Unidades” abre as unidades dele.</p>
                  <TopicoAjuda titulo="Órgão/Entidade">Identifica de qual órgão é o DFD (o campo do formulário).</TopicoAjuda>
                  <TopicoAjuda titulo="Assinatura">
                    Única = os responsáveis do órgão valem para todas as unidades. Por unidade = cada unidade tem os seus.
                  </TopicoAjuda>
                  <TopicoAjuda titulo="Conferência">Sem responsável vigente, nomeação ou função faltando, temporário encerrado, unidades sem responsável.</TopicoAjuda>
                  <TopicoAjuda titulo="Ordem">Pelo código da entidade na Centi (sem código, por último). O lápis no rodapé edita a tabela: ordenar, ocultar, arrastar e congelar colunas — e salvar a edição.</TopicoAjuda>
                </Ajuda>
              </>
            }
          />
        ) : ctx.planilha ? (
          <PlanilhaResponsaveis ctx={ctx} />
        ) : (
          <div className="rounded-card border border-border p-4">
            <SkeletonLinhas linhas={6} />
          </div>
        )}
      </div>

      <BannerCadastro
        aberto={aberto != null}
        novo={aberto === "novo"}
        titulo={aberto === "novo" ? "Novo órgão" : (orgao?.nome ?? "Órgão")}
        cabecalho={
          orgao ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge tone="violet">{orgao.sigla}</Badge>
              <span className="truncate text-[15px] font-semibold text-text">{orgao.nome}</span>
              {orgao.tambemUnidade && <Badge tone="cyan">Também unidade</Badge>}
              {orgao.oculto && <Badge tone="slate">Oculto</Badge>}
            </div>
          ) : undefined
        }
        campos={CAMPOS}
        inicial={valoresDe(orgao)}
        ocupado={ocupado}
        onSalvar={salvar}
        onFechar={() => setAberto(null)}
        confirmarDescarte={() => confirmar({ titulo: "Descartar as alterações?", texto: "Os dados alterados não foram salvos.", confirmar: "Descartar", perigo: true })}
        rodapeEsquerda={
          orgao ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="danger" disabled={ocupado} icon={<IconTrash className="h-4 w-4" />} onClick={() => void excluir(orgao)}>
                Excluir
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={ocupado}
                icon={orgao.oculto ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
                onClick={() => void ocultar(orgao)}
              >
                {orgao.oculto ? "Reexibir" : "Ocultar"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {orgao && (
          <>
            <SecaoBanner
              titulo="Responsáveis por DFDs"
              acao={
                <Button size="sm" variant="ghost" icon={<IconLayers className="h-4 w-4" />} onClick={() => router.push(`/painel/orgaos/${orgao.id}`)}>
                  Unidades ({unidadesDe.get(orgao.id)?.length ?? 0})
                </Button>
              }
            >
              <ResponsaveisDoAlvo ctx={ctx} alvo={{ orgaoId: orgao.id }} nota="Assinatura por unidade: cada unidade tem os seus responsáveis (abra as unidades)." />
            </SecaoBanner>
            <SecaoBanner titulo="Estrutura">
              {orgao.tambemUnidade ? (
                <Linha texto="Funciona também como unidade (unidade própria).">
                  <Button size="sm" variant="secondary" loading={ocupado} icon={<IconLayers className="h-4 w-4" />} onClick={() => void tornarUnidade(orgao, false)}>
                    Deixar de ser unidade
                  </Button>
                </Linha>
              ) : orgao.temUnidades ? (
                <p className="text-[13px] text-muted">Com unidades-filhas, o órgão não pode funcionar também como unidade nem ser rebaixado.</p>
              ) : (
                <Linha texto="Fazer o órgão funcionar também como unidade (os dois status).">
                  <Button size="sm" variant="secondary" loading={ocupado} icon={<IconLayers className="h-4 w-4" />} onClick={() => void tornarUnidade(orgao, true)}>
                    Também unidade
                  </Button>
                </Linha>
              )}
              {!orgao.temUnidades && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[13px] text-muted">Rebaixar a unidade de:</span>
                    <select className={`${selectCls} w-full`} value={destino} onChange={(e) => setDestino(e.target.value)} disabled={ocupado}>
                      <option value="">Escolha o órgão de destino…</option>
                      {destinos.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.sigla} — {d.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button size="sm" variant="secondary" disabled={!destino} loading={ocupado} icon={<IconLandmark className="h-4 w-4" />} onClick={() => void rebaixar(orgao)}>
                    Rebaixar
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

function Mono({ v }: { v: string | null }) {
  return v ? <span className="font-mono text-[12px] text-text-2">{v}</span> : <span className="text-faint">—</span>;
}

function Linha({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[13px] text-muted">{texto}</p>
      {children}
    </div>
  );
}
