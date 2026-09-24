"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dicaLista, num, pct } from "@/lib/format";
import {
  type ClassificacaoItem,
  compararUnidades,
  conflitoUnidade,
  itensPorUnidade,
  LIMITES_PADRONIZACAO,
  type LinhaUnidade,
  limparSinonimos,
  propostaUnidade,
  ROTULO_ESTADO_UNIDADE,
  resolverUnidades,
  type UnidadeMedida,
  type UsoUnidade,
} from "@/lib/padronizacao-core";
import { chamarPadronizacao } from "@/lib/padronizacao-cliente";
import { AcoesCadastro } from "./AcoesCadastro";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaLista, MaisN } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { EstadoPonto } from "./EstadoCelula";
import { CampoLista, SelectField, TextField } from "./Field";
import { selectCls } from "./formStyles";
import { IconCheck, IconPlus, IconRefresh } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";

type Dados = { unidades: UnidadeMedida[]; classificacoes: ClassificacaoItem[]; uso: UsoUnidade[] };
/** O que o editor de unidade edita (`id` = a editada; `null` = nova). */
export type RascunhoUnidade = { id: number | null; sigla: string; nome: string; sinonimos: string[]; classificacaoId: number | null };
/** Uma grafia dos itens que vira sinônimo de uma unidade cadastrada. */
export type GrafiaParaUnidade = { unidadeId: number; texto: string };
type Falha = { texto: string; motivo: string };

const TOM_ESTADO: Record<LinhaUnidade["estado"], Tone> = { cadastrada: "emerald", sugestao: "blue", nao_cadastrada: "amber" };
const rotuloUnidade = (u: UnidadeMedida) => `${u.sigla} — ${u.nome}`;
/** Máximo de grafias por chamada (o teto da rota). */
const LOTE_SINONIMOS = 200;
const SECAO = "space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

/**
 * Catálogo → UNIDADES DE MEDIDA (contêiner com dados): o CADASTRO (sigla + nome + sinônimos + a classificação que a
 * unidade indica; ↑/↓ = a ordem) e a COMPARAÇÃO de TODAS as grafias de unidade dos itens (DFDs no escopo da unidade
 * ativa e catálogo) com ele (`ComparacaoUnidades`). Carrega sob demanda (só com a visão aberta) e recarrega a cada
 * gravação (a comparação acompanha o cadastro). Editores (admin/gestor) gerenciam; os demais consultam.
 */
export function UnidadesMedidaView({ podeEditar }: { podeEditar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<RascunhoUnidade | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const j = await chamarPadronizacao<Dados>("/api/catalogo/unidades-medida");
      setDados({ unidades: j.unidades, classificacoes: j.classificacoes, uso: j.uso });
      setErroCarga(null);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Erro ao carregar as unidades de medida.");
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const comparacao = useMemo(() => (dados ? compararUnidades(dados.uso, dados.unidades) : null), [dados]);
  const usoPorUnidade = useMemo(() => (comparacao ? itensPorUnidade(comparacao.linhas) : new Map<number, { dfd: number; catalogo: number }>()), [comparacao]);
  const unidadePorId = useMemo(() => new Map((dados?.unidades ?? []).map((u) => [u.id, u])), [dados]);
  const classPorId = useMemo(() => new Map((dados?.classificacoes ?? []).map((c) => [c.id, c])), [dados]);

  /** Executa uma gravação, avisa e recarrega. */
  async function executar(acao: () => Promise<unknown>, sucesso: string): Promise<boolean> {
    setSalvando(true);
    try {
      await acao();
      toast.success(sucesso);
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gravar.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function salvar() {
    if (!rascunho) return;
    const nova = rascunho.id == null;
    const corpo = { sigla: rascunho.sigla, nome: rascunho.nome, sinonimos: rascunho.sinonimos, classificacaoId: rascunho.classificacaoId };
    const ok = await executar(
      () => chamarPadronizacao(nova ? "/api/catalogo/unidades-medida" : `/api/catalogo/unidades-medida/${rascunho.id}`, nova ? "POST" : "PATCH", corpo),
      nova ? "Unidade de medida cadastrada." : "Unidade de medida atualizada.",
    );
    if (ok) setRascunho(null);
  }

  function excluir(u: UnidadeMedida) {
    const n = usoPorUnidade.get(u.id);
    const itens = (n?.dfd ?? 0) + (n?.catalogo ?? 0);
    const aviso =
      itens > 0
        ? `Excluir a unidade ${rotuloUnidade(u)}? ${num(itens)} item(ns) usam as grafias dela e passarão a "não cadastrada".`
        : `Excluir a unidade ${rotuloUnidade(u)}?`;
    if (!confirm(aviso)) return;
    void executar(() => chamarPadronizacao(`/api/catalogo/unidades-medida/${u.id}`, "DELETE"), "Unidade de medida excluída.");
  }

  async function mover(id: number, dir: -1 | 1) {
    if (!dados || salvando) return;
    const i = dados.unidades.findIndex((x) => x.id === id);
    const alvo = i + dir;
    if (i < 0 || alvo < 0 || alvo >= dados.unidades.length) return;
    const nova = [...dados.unidades];
    [nova[i], nova[alvo]] = [nova[alvo], nova[i]];
    setDados({ ...dados, unidades: nova.map((u, ordem) => ({ ...u, ordem })) });
    // Uma gravação de ordem por vez (as ações ficam travadas até o servidor confirmar — nada de ordens concorrentes).
    setSalvando(true);
    try {
      await chamarPadronizacao("/api/catalogo/unidades-medida/ordem", "PATCH", { ids: nova.map((x) => x.id) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a nova ordem.");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  /** Grafias dos itens → sinônimos de unidades cadastradas (em lotes do teto da rota); as recusadas são avisadas. */
  function adicionarSinonimos(itens: GrafiaParaUnidade[]) {
    const um = itens.length === 1 ? itens[0] : null;
    const sigla = um ? unidadePorId.get(um.unidadeId)?.sigla : null;
    const sucesso = um ? `"${um.texto}" agora é grafia de ${sigla ?? "a unidade"}.` : `${num(itens.length)} grafias adicionadas às unidades.`;
    void executar(async () => {
      const falhas: Falha[] = [];
      for (let i = 0; i < itens.length; i += LOTE_SINONIMOS) {
        const r = await chamarPadronizacao<{ falhas: Falha[] }>("/api/catalogo/unidades-medida/sinonimos", "POST", { itens: itens.slice(i, i + LOTE_SINONIMOS) });
        falhas.push(...r.falhas);
      }
      if (falhas.length) toast.error(`${num(falhas.length)} grafia(s) não adicionada(s) — ${falhas[0].texto}: ${falhas[0].motivo}`);
    }, sucesso);
  }

  if (!dados || !comparacao) {
    return erroCarga ? (
      <Callout kind="danger">
        <span className="flex flex-wrap items-center justify-between gap-2">
          {erroCarga}
          <Button size="sm" variant="secondary" icon={<IconRefresh className="h-4 w-4" />} onClick={() => void carregar()}>
            Tentar de novo
          </Button>
        </span>
      </Callout>
    ) : (
      <div className="rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
        <SkeletonLinhas linhas={6} />
      </div>
    );
  }

  const { linhas, semUnidade } = comparacao;
  const comUnidade = linhas.reduce((s, l) => s + l.total, 0);
  const cadastrados = linhas.reduce((s, l) => s + (l.estado === "cadastrada" ? l.total : 0), 0);
  const naoCadastradas = linhas.filter((l) => l.estado !== "cadastrada");
  const nSugestoes = linhas.filter((l) => l.estado === "sugestao").length;
  const pos = new Map(dados.unidades.map((u, i) => [u.id, i]));

  const colsCadastro: Column<UnidadeMedida>[] = [
    { key: "pos", header: "#", filter: "none", nowrap: true, render: (u) => <span className="tabular-nums text-faint">{(pos.get(u.id) ?? 0) + 1}</span> },
    { key: "sigla", header: "Sigla", nowrap: true, value: (u) => u.sigla, render: (u) => <span className="font-mono text-[12.5px] font-semibold text-text">{u.sigla}</span> },
    { key: "nome", header: "Nome", align: "left", minWidth: 160, value: (u) => u.nome, render: (u) => <span className="text-text">{u.nome}</span> },
    {
      key: "sinonimos",
      header: "Sinônimos",
      nowrap: true,
      value: (u) => u.sinonimos.join(" · ") || "—",
      render: (u) => <CelulaLista valores={u.sinonimos} max={3} mono />,
    },
    {
      key: "classificacao",
      header: "Classificação",
      nowrap: true,
      value: (u) => (u.classificacaoId != null ? (classPorId.get(u.classificacaoId)?.nome ?? "—") : "—"),
      render: (u) => {
        const c = u.classificacaoId != null ? classPorId.get(u.classificacaoId) : undefined;
        return c ? (
          <EstadoPonto cor={c.cor} rotulo={c.nome} title="Classificação dos itens com esta unidade (quando a descrição não tem palavra-chave)" />
        ) : (
          <span className="text-faint">—</span>
        );
      },
    },
    {
      key: "itens",
      header: "Itens",
      align: "center",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
      numero: (u) => {
        const n = usoPorUnidade.get(u.id);
        return (n?.dfd ?? 0) + (n?.catalogo ?? 0);
      },
      render: (u) => {
        const n = usoPorUnidade.get(u.id);
        return (
          <span className="tabular-nums" title={`DFDs: ${num(n?.dfd ?? 0)} · Catálogo: ${num(n?.catalogo ?? 0)}`}>
            {num((n?.dfd ?? 0) + (n?.catalogo ?? 0))}
          </span>
        );
      },
    },
    ...(podeEditar
      ? [
          {
            key: "acoes",
            header: "",
            filter: "none" as const,
            align: "right" as const,
            nowrap: true,
            render: (u: UnidadeMedida) => (
              <AcoesCadastro
                nome={u.sigla}
                primeira={(pos.get(u.id) ?? 0) === 0}
                ultima={(pos.get(u.id) ?? 0) === dados.unidades.length - 1}
                disabled={salvando}
                onMover={(d) => void mover(u.id, d)}
                onEditar={() => setRascunho({ id: u.id, sigla: u.sigla, nome: u.nome, sinonimos: u.sinonimos, classificacaoId: u.classificacaoId })}
                onExcluir={() => excluir(u)}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
        <StatMini label="Unidades cadastradas" value={num(dados.unidades.length)} hint="sigla, nome e sinônimos" />
        <StatMini
          label="Itens com unidade cadastrada"
          value={comUnidade ? pct(cadastrados, comUnidade) : "—"}
          hint={`${num(cadastrados)} de ${num(comUnidade)} itens`}
          tone={comUnidade === 0 ? "default" : cadastrados === comUnidade ? "ok" : "warn"}
        />
        <StatMini
          label="Grafias não cadastradas"
          value={num(naoCadastradas.length)}
          hint={nSugestoes ? `${num(nSugestoes)} com sugestão` : "nas unidades dos itens"}
          tone={naoCadastradas.length ? "warn" : "default"}
        />
        <StatMini label="Itens sem unidade" value={num(semUnidade.dfd + semUnidade.catalogo)} hint={`DFDs ${num(semUnidade.dfd)} · catálogo ${num(semUnidade.catalogo)}`} />
      </div>

      <section className={SECAO}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-3xl">
            <h2 className="font-semibold text-text">Unidades cadastradas</h2>
            <p className="text-sm text-muted">A unidade padrão e as grafias aceitas para ela. As unidades dos itens são comparadas com este cadastro.</p>
          </div>
          {podeEditar && (
            <Button
              icon={<IconPlus className="h-4 w-4" />}
              disabled={salvando}
              onClick={() => setRascunho({ id: null, sigla: "", nome: "", sinonimos: [], classificacaoId: null })}
            >
              Nova unidade
            </Button>
          )}
        </div>
        {dados.unidades.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-2 p-6 text-center text-sm text-muted">
            Nenhuma unidade cadastrada. Cadastre as unidades padrão — ou use "Cadastrar" na comparação abaixo, que já traz a proposta a
            partir das grafias dos itens.
          </p>
        ) : (
          <DataTable
            columns={colsCadastro}
            rows={dados.unidades}
            getKey={(u) => u.id}
            pageSize={20}
            minWidth={podeEditar ? 820 : 640}
            resumo={(l) => `${num(l.length)} ${l.length === 1 ? "unidade" : "unidades"}`}
          />
        )}
      </section>

      <section className={SECAO}>
        <ComparacaoUnidades
          linhas={linhas}
          unidades={dados.unidades}
          podeEditar={podeEditar}
          salvando={salvando}
          onAdicionar={adicionarSinonimos}
          onCadastrar={(l) => setRascunho({ id: null, ...propostaUnidade(l, linhas), classificacaoId: null })}
        />
      </section>

      {rascunho && (
        <EditorUnidadeMedida
          rascunho={rascunho}
          unidades={dados.unidades}
          classificacoes={dados.classificacoes}
          linhas={linhas}
          salvando={salvando}
          onChange={setRascunho}
          onFechar={() => setRascunho(null)}
          onSalvar={() => void salvar()}
        />
      )}
    </div>
  );
}

/**
 * COMPARAÇÃO das grafias de unidade dos itens com o cadastro (apresentacional): estado (Cadastrada · Sugestão · Não
 * cadastrada) · a grafia (as escritas equivalentes na dica) · a unidade cadastrada — na SUGESTÃO, "Adicionar a UN"; NÃO
 * cadastrada, "Adicionar a…" (uma cadastrada) ou "Cadastrar" (a proposta pronta) · itens de DFD · itens do catálogo; e
 * "Adicionar N sugestões" de uma vez. Grava via `onAdicionar`/`onCadastrar`; sem permissão, só consulta.
 */
export function ComparacaoUnidades({
  linhas,
  unidades,
  podeEditar,
  salvando = false,
  onAdicionar,
  onCadastrar,
}: {
  linhas: LinhaUnidade[];
  unidades: UnidadeMedida[];
  podeEditar: boolean;
  salvando?: boolean;
  onAdicionar: (itens: GrafiaParaUnidade[]) => void;
  onCadastrar: (linha: LinhaUnidade) => void;
}) {
  const porId = useMemo(() => new Map(unidades.map((u) => [u.id, u])), [unidades]);
  const alvo = (l: LinhaUnidade) => {
    const id = l.unidadeId ?? l.sugestaoId;
    return id != null ? porId.get(id) : undefined;
  };
  const sugestoes = linhas.filter((l) => l.estado === "sugestao" && l.sugestaoId != null && porId.has(l.sugestaoId));

  const colunas: Column<LinhaUnidade>[] = [
    {
      key: "estado",
      header: "Estado",
      nowrap: true,
      value: (l) => ROTULO_ESTADO_UNIDADE[l.estado],
      render: (l) => <Badge tone={TOM_ESTADO[l.estado]}>{ROTULO_ESTADO_UNIDADE[l.estado]}</Badge>,
    },
    {
      key: "grafia",
      header: "Grafia nos itens",
      nowrap: true,
      value: (l) => l.texto,
      render: (l) => (
        <span className="inline-flex items-center gap-1" title={dicaLista(l.grafias, (g) => `${g.texto} — ${num(g.n)} ${g.n === 1 ? "item" : "itens"}`)}>
          <span className="font-mono text-[12.5px] font-semibold text-text">{l.texto}</span>
          {l.grafias.length > 1 && <MaisN n={l.grafias.length - 1} />}
        </span>
      ),
    },
    {
      key: "unidade",
      header: "Unidade cadastrada",
      align: "left",
      minWidth: 280,
      value: (l) => {
        const u = alvo(l);
        return u ? (l.estado === "sugestao" ? `Sugestão: ${rotuloUnidade(u)}` : rotuloUnidade(u)) : "—";
      },
      render: (l) => {
        const u = alvo(l);
        if (l.estado === "cadastrada") return <span className="text-text-2">{u ? rotuloUnidade(u) : "—"}</span>;
        if (!podeEditar) return <span className="text-faint">{u ? `Sugestão: ${rotuloUnidade(u)}` : "—"}</span>;
        if (l.estado === "sugestao" && u)
          return (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-accent" title="Sugerida pela regra do sistema (mesma unidade) ou pelo plural">
                {rotuloUnidade(u)}
              </span>
              <Button
                variant="secondary"
                size="xs"
                disabled={salvando}
                icon={<IconCheck className="h-3.5 w-3.5" />}
                onClick={() => onAdicionar([{ unidadeId: u.id, texto: l.texto }])}
              >
                Adicionar a {u.sigla}
              </Button>
            </span>
          );
        return (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {unidades.length > 0 && (
              <select
                aria-label={`Adicionar ${l.texto} como grafia de uma unidade cadastrada`}
                className={`${selectCls} min-h-[44px] max-w-[220px] lg:min-h-0`}
                value=""
                disabled={salvando}
                onChange={(e) => {
                  const u2 = porId.get(Number(e.target.value));
                  if (u2) onAdicionar([{ unidadeId: u2.id, texto: l.texto }]);
                }}
              >
                <option value="">Adicionar a…</option>
                {unidades.map((x) => (
                  <option key={x.id} value={x.id}>
                    {rotuloUnidade(x)}
                  </option>
                ))}
              </select>
            )}
            <Button variant="ghost" size="xs" disabled={salvando} icon={<IconPlus className="h-3.5 w-3.5" />} onClick={() => onCadastrar(l)}>
              Cadastrar
            </Button>
          </span>
        );
      },
    },
    {
      key: "dfd",
      header: "Itens de DFD",
      align: "center",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
      numero: (l) => l.dfd,
      render: (l) => <span className="tabular-nums">{num(l.dfd)}</span>,
    },
    {
      key: "catalogo",
      header: "Itens do catálogo",
      align: "center",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
      numero: (l) => l.catalogo,
      render: (l) => <span className="tabular-nums">{num(l.catalogo)}</span>,
    },
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <h2 className="font-semibold text-text">Comparação com os itens</h2>
          <p className="text-sm text-muted">
            Cada grafia de unidade usada nos itens dos DFDs e do catálogo (escritas equivalentes juntas — "Und." = "UND") e a unidade
            cadastrada que ela representa.
          </p>
        </div>
        {podeEditar && sugestoes.length > 0 && (
          <Button
            variant="secondary"
            icon={<IconCheck className="h-4 w-4" />}
            loading={salvando}
            onClick={() => onAdicionar(sugestoes.map((l) => ({ unidadeId: l.sugestaoId as number, texto: l.texto })))}
          >
            Adicionar {num(sugestoes.length)} {sugestoes.length === 1 ? "sugestão" : "sugestões"}
          </Button>
        )}
      </div>
      {linhas.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-2 p-6 text-center text-sm text-muted">Nenhum item com unidade de medida ainda.</p>
      ) : (
        <DataTable
          columns={colunas}
          rows={linhas}
          getKey={(l) => l.chave}
          pageSize={20}
          minWidth={880}
          resumo={(l) => (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span>
                {num(l.length)} {l.length === 1 ? "grafia" : "grafias"}
              </span>
              <span className="text-text-2">
                Itens <span className="font-semibold tabular-nums text-text">{num(l.reduce((s, x) => s + x.total, 0))}</span>
              </span>
            </span>
          )}
        />
      )}
    </div>
  );
}

/**
 * Editor (banner) de UMA unidade de medida (apresentacional): sigla, nome, sinônimos e a classificação que ela indica —
 * com a PRÉVIA das grafias dos itens que ela passa a cobrir e o CONFLITO com outra unidade (uma grafia pertence a uma
 * unidade só), antes de gravar.
 */
export function EditorUnidadeMedida({
  rascunho,
  unidades,
  classificacoes,
  linhas,
  salvando,
  onChange,
  onFechar,
  onSalvar,
}: {
  rascunho: RascunhoUnidade;
  unidades: UnidadeMedida[];
  classificacoes: ClassificacaoItem[];
  linhas: LinhaUnidade[];
  salvando: boolean;
  onChange: (r: RascunhoUnidade) => void;
  onFechar: () => void;
  onSalvar: () => void;
}) {
  const nova = rascunho.id == null;
  const sinonimos = limparSinonimos(rascunho.sigla, rascunho.nome, rascunho.sinonimos);
  const dados = { sigla: rascunho.sigla.trim(), nome: rascunho.nome.trim(), sinonimos };
  const conflito = dados.sigla || dados.nome ? conflitoUnidade(dados, unidades, rascunho.id) : null;
  // As grafias dos itens que o RASCUNHO cobre (centenas de linhas no máximo — direto, a cada digitação).
  const desta = resolverUnidades([{ id: -1, ...dados, classificacaoId: null, ordem: 0 }]);
  const cobertas = linhas.filter((l) => desta(l.texto));
  const itensCobertos = cobertas.reduce((s, l) => s + l.total, 0);
  const pode = !!dados.sigla && !!dados.nome && !conflito && !salvando;

  return (
    <Modal
      open
      onClose={onFechar}
      bloqueado={salvando}
      titulo={nova ? "Nova unidade de medida" : `Editar unidade ${rascunho.sigla}`}
      size="md"
      rodape={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={onSalvar} loading={salvando} disabled={!pode}>
            {nova ? "Cadastrar" : "Salvar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <div className="grid gap-[var(--gap-block)] sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <TextField
            label="Sigla"
            value={rascunho.sigla}
            onChange={(e) => onChange({ ...rascunho, sigla: e.target.value })}
            placeholder="UN"
            maxLength={LIMITES_PADRONIZACAO.sigla}
          />
          <TextField
            label="Nome"
            value={rascunho.nome}
            onChange={(e) => onChange({ ...rascunho, nome: e.target.value })}
            placeholder="UNIDADE"
            maxLength={LIMITES_PADRONIZACAO.nome}
          />
        </div>
        <CampoLista
          label="Sinônimos (outras grafias aceitas)"
          valores={rascunho.sinonimos}
          onChange={(v) => onChange({ ...rascunho, sinonimos: v.slice(0, LIMITES_PADRONIZACAO.sinonimos) })}
          placeholder="UND, UNID. — Enter ou vírgula para acrescentar"
          maxItem={LIMITES_PADRONIZACAO.grafia}
        />
        <SelectField
          label="Classificação que a unidade indica"
          value={rascunho.classificacaoId ?? ""}
          onChange={(e) => onChange({ ...rascunho, classificacaoId: e.target.value ? Number(e.target.value) : null })}
          hint="Vale para os itens com esta unidade cuja descrição não tem nenhuma palavra-chave de classificação."
        >
          <option value="">Nenhuma</option>
          {classificacoes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </SelectField>
        {conflito ? (
          <Callout kind="warn">
            “{conflito.grafia}” já é uma grafia da unidade {rotuloUnidade(conflito.unidade)} — uma grafia pertence a uma unidade só.
          </Callout>
        ) : (
          <div className="rounded-card border border-border bg-surface-2 p-3">
            <p className="text-[12px] font-semibold text-muted">
              Grafias dos itens cobertas: {num(cobertas.length)} · {num(itensCobertos)} {itensCobertos === 1 ? "item" : "itens"}
            </p>
            {cobertas.length > 0 ? (
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {cobertas.slice(0, 12).map((l) => (
                  <span key={l.chave} className="rounded-chip border border-border-2 bg-surface px-2 py-0.5 font-mono text-[12px] text-text" title={`${num(l.total)} itens`}>
                    {l.texto}
                  </span>
                ))}
                {cobertas.length > 12 && <MaisN n={cobertas.length - 12} />}
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-faint">Nenhuma grafia dos itens casa esta unidade (ainda).</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
