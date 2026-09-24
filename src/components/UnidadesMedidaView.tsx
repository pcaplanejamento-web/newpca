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
import { ErroCarga } from "./ErroCarga";
import { EstadoPonto } from "./EstadoCelula";
import { CampoLista, SelectField, TextField } from "./Field";
import { selectCls } from "./formStyles";
import { IconCheck, IconPlus } from "./icons";
import { Modal } from "./Modal";
import { SkeletonCartao } from "./Skeleton";
import { StatMini } from "./StatMini";
import { useGravacaoCadastro } from "./useGravacaoCadastro";

type Cadastro = { unidades: UnidadeMedida[]; classificacoes: ClassificacaoItem[] };
type Dados = Cadastro & { uso: UsoUnidade[] };
/** O que o editor de unidade edita (`id` = a editada; `null` = nova). */
export type RascunhoUnidade = { id: number | null; sigla: string; nome: string; sinonimos: string[]; classificacaoId: number | null };
/** Uma grafia dos itens que vira sinônimo de uma unidade cadastrada. */
export type GrafiaParaUnidade = { unidadeId: number; texto: string };
type Falha = { texto: string; motivo: string };

const URL_UNIDADES = "/api/catalogo/unidades-medida";
const TOM_ESTADO: Record<LinhaUnidade["estado"], Tone> = { cadastrada: "emerald", sugestao: "blue", nao_cadastrada: "amber" };
const rotuloUnidade = (u: UnidadeMedida) => `${u.sigla} — ${u.nome}`;
/** A 1ª recusa (e quantas mais) — o motivo que o aviso mostra. */
const resumoFalhas = (f: Falha[]) => `${f[0].texto}: ${f[0].motivo}${f.length > 1 ? ` (e mais ${num(f.length - 1)})` : ""}`;
const SECAO = "space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

/**
 * Catálogo → UNIDADES DE MEDIDA (contêiner com dados): o CADASTRO (sigla + nome + sinônimos + a classificação que a
 * unidade indica; ↑/↓ = a ordem) e a COMPARAÇÃO de TODAS as grafias de unidade dos itens (DFDs no escopo da unidade
 * ativa e catálogo) com ele (`ComparacaoUnidades`). Carrega sob demanda (só com a visão aberta): o cadastro + o uso das
 * grafias; depois de cada gravação recarrega SÓ o cadastro (o uso dos itens não muda com ele — a comparação acompanha).
 * Editores (admin/gestor) gerenciam; os demais consultam.
 */
export function UnidadesMedidaView({ podeEditar }: { podeEditar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [editando, setEditando] = useState<RascunhoUnidade | null>(null);

  const carregar = useCallback(async (comUso: boolean) => {
    try {
      const j = await chamarPadronizacao<Cadastro & { uso?: UsoUnidade[] }>(comUso ? URL_UNIDADES : `${URL_UNIDADES}?uso=0`);
      setDados((d) => ({ unidades: j.unidades, classificacoes: j.classificacoes, uso: j.uso ?? d?.uso ?? [] }));
      setErroCarga(null);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Erro ao carregar as unidades de medida.");
    }
  }, []);
  useEffect(() => {
    void carregar(true);
  }, [carregar]);
  const recarregarCadastro = useCallback(() => carregar(false), [carregar]);
  const { salvando, executar } = useGravacaoCadastro(recarregarCadastro);

  const comparacao = useMemo(() => (dados ? compararUnidades(dados.uso, dados.unidades) : null), [dados]);
  const usoPorUnidade = useMemo(() => (comparacao ? itensPorUnidade(comparacao.linhas) : new Map<number, { dfd: number; catalogo: number }>()), [comparacao]);
  const unidadePorId = useMemo(() => new Map((dados?.unidades ?? []).map((u) => [u.id, u])), [dados]);
  const classPorId = useMemo(() => new Map((dados?.classificacoes ?? []).map((c) => [c.id, c])), [dados]);

  async function salvar(r: RascunhoUnidade) {
    const nova = r.id == null;
    const corpo = { sigla: r.sigla, nome: r.nome, sinonimos: r.sinonimos, classificacaoId: r.classificacaoId };
    const gravou = await executar(async () => {
      await chamarPadronizacao(nova ? URL_UNIDADES : `${URL_UNIDADES}/${r.id}`, nova ? "POST" : "PATCH", corpo);
      return { msg: nova ? "Unidade de medida cadastrada." : "Unidade de medida atualizada." };
    });
    if (gravou) setEditando(null);
  }

  function excluir(u: UnidadeMedida) {
    const n = usoPorUnidade.get(u.id);
    const itens = (n?.dfd ?? 0) + (n?.catalogo ?? 0);
    const aviso =
      itens > 0
        ? `Excluir a unidade ${rotuloUnidade(u)}? ${num(itens)} item(ns) usam as grafias dela e passarão a "não cadastrada".`
        : `Excluir a unidade ${rotuloUnidade(u)}?`;
    if (!confirm(aviso)) return;
    void executar(async () => {
      await chamarPadronizacao(`${URL_UNIDADES}/${u.id}`, "DELETE");
      return { msg: "Unidade de medida excluída." };
    });
  }

  function mover(id: number, dir: -1 | 1) {
    if (!dados) return;
    const i = dados.unidades.findIndex((x) => x.id === id);
    const alvo = i + dir;
    if (i < 0 || alvo < 0 || alvo >= dados.unidades.length) return;
    const nova = [...dados.unidades];
    [nova[i], nova[alvo]] = [nova[alvo], nova[i]];
    // A lista já mostra a nova ordem (otimista); uma gravação de ordem por vez — recarrega só se falhar.
    void executar(async () => {
      setDados((d) => d && { ...d, unidades: nova.map((u, ordem) => ({ ...u, ordem })) });
      await chamarPadronizacao(`${URL_UNIDADES}/ordem`, "PATCH", { ids: nova.map((x) => x.id) });
      return null;
    }, false);
  }

  /** Grafias dos itens → sinônimos de unidades cadastradas, em lotes do teto da rota: soma o que entrou e avisa as
   * recusadas (aviso âmbar quando só parte entrou; erro quando nenhuma). */
  function adicionarSinonimos(itens: GrafiaParaUnidade[]): Promise<boolean> {
    return executar(async () => {
      let adicionados = 0;
      const falhas: Falha[] = [];
      for (let i = 0; i < itens.length; i += LIMITES_PADRONIZACAO.lote) {
        const lote = itens.slice(i, i + LIMITES_PADRONIZACAO.lote);
        try {
          const r = await chamarPadronizacao<{ adicionados: number; falhas: Falha[] }>(`${URL_UNIDADES}/sinonimos`, "POST", { itens: lote });
          adicionados += r.adicionados;
          falhas.push(...r.falhas);
        } catch (e) {
          // O lote inteiro recusado (nenhuma grafia dele entrou): cada uma conta como recusada, com o motivo do servidor.
          const motivo = e instanceof Error ? e.message : "Não foi possível gravar.";
          for (const x of lote) falhas.push({ texto: x.texto, motivo });
        }
      }
      if (adicionados === 0) {
        if (falhas.length) throw new Error(itens.length === 1 ? falhas[0].motivo : `Nenhuma grafia adicionada — ${resumoFalhas(falhas)}`);
        return { msg: "As grafias já eram dessas unidades — a lista foi atualizada.", parcial: true };
      }
      if (falhas.length) return { msg: `${num(adicionados)} grafia(s) adicionada(s); ${num(falhas.length)} não — ${resumoFalhas(falhas)}`, parcial: true };
      const um = itens.length === 1 ? itens[0] : null;
      return {
        msg: um ? `"${um.texto}" agora é grafia de ${unidadePorId.get(um.unidadeId)?.sigla ?? "a unidade"}.` : `${num(adicionados)} grafias adicionadas às unidades.`,
      };
    });
  }

  if (!dados || !comparacao) {
    return erroCarga ? <ErroCarga msg={erroCarga} onTentar={() => void carregar(true)} /> : <SkeletonCartao />;
  }

  const { linhas, semUnidade } = comparacao;
  const comUnidade = linhas.reduce((s, l) => s + l.total, 0);
  const cadastrados = linhas.reduce((s, l) => s + (l.estado === "cadastrada" ? l.total : 0), 0);
  const naoCadastradas = linhas.filter((l) => l.estado !== "cadastrada");
  const nSugestoes = linhas.filter((l) => l.estado === "sugestao").length;
  const pos = new Map(dados.unidades.map((u, i) => [u.id, i]));

  // O cadastro é uma lista ORDENADA (↑/↓): sem ordenação/filtro nas colunas — a posição é a da ordem gravada.
  const colsCadastro: Column<UnidadeMedida>[] = [
    { key: "pos", header: "#", filter: "none", nowrap: true, render: (u) => <span className="tabular-nums text-faint">{(pos.get(u.id) ?? 0) + 1}</span> },
    { key: "sigla", header: "Sigla", filter: "none", nowrap: true, render: (u) => <span className="font-mono text-[12.5px] font-semibold text-text">{u.sigla}</span> },
    { key: "nome", header: "Nome", filter: "none", align: "left", minWidth: 160, render: (u) => <span className="text-text">{u.nome}</span> },
    { key: "sinonimos", header: "Sinônimos", filter: "none", nowrap: true, render: (u) => <CelulaLista valores={u.sinonimos} max={3} mono /> },
    {
      key: "classificacao",
      header: "Classificação",
      filter: "none",
      nowrap: true,
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
      filter: "none",
      align: "center",
      nowrap: true,
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
                onMover={(d) => mover(u.id, d)}
                onEditar={() => setEditando({ id: u.id, sigla: u.sigla, nome: u.nome, sinonimos: u.sinonimos, classificacaoId: u.classificacaoId })}
                onExcluir={() => excluir(u)}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      {erroCarga && <ErroCarga kind="warn" msg={`A lista pode estar desatualizada — ${erroCarga}`} onTentar={() => void carregar(false)} />}
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
              onClick={() => setEditando({ id: null, sigla: "", nome: "", sinonimos: [], classificacaoId: null })}
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
            onRowClick={(u) => setEditando({ id: u.id, sigla: u.sigla, nome: u.nome, sinonimos: u.sinonimos, classificacaoId: u.classificacaoId })}
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
          onCadastrar={(l) => setEditando({ id: null, ...propostaUnidade(l, linhas), classificacaoId: null })}
        />
      </section>

      {editando && (
        <EditorUnidadeMedida
          key={editando.id ?? "nova"}
          inicial={editando}
          unidades={dados.unidades}
          classificacoes={dados.classificacoes}
          linhas={linhas}
          salvando={salvando}
          somenteLeitura={!podeEditar}
          onFechar={() => setEditando(null)}
          onSalvar={(r) => void salvar(r)}
        />
      )}
    </div>
  );
}

/** Chave do "Adicionar N sugestões" no andamento (nunca é a chave de uma grafia — só letras maiúsculas e números). */
const LOTE = "\u0000lote";

/**
 * COMPARAÇÃO das grafias de unidade dos itens com o cadastro (apresentacional): estado (Cadastrada · Sugestão · Não
 * cadastrada) · as grafias (as escritas equivalentes juntas; quantos itens cada uma na dica) · a unidade cadastrada —
 * nas não cadastradas, ESCOLHER a unidade (a sugestão vem escolhida) e confirmar em "Adicionar", ou "Cadastrar" (a
 * proposta pronta) · itens de DFD · itens do catálogo; e "Adicionar N sugestões" de uma vez (cada uma na unidade
 * escolhida na linha). Grava via `onAdicionar`/`onCadastrar`; sem permissão, só consulta.
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
  /** Grava as grafias como sinônimos (devolvendo a promessa da gravação, o botão acionado mostra o andamento). */
  onAdicionar: (itens: GrafiaParaUnidade[]) => unknown;
  onCadastrar: (linha: LinhaUnidade) => void;
}) {
  const porId = useMemo(() => new Map(unidades.map((u) => [u.id, u])), [unidades]);
  // A unidade ESCOLHIDA em cada linha não cadastrada (sem escolha = a sugestão; `null` = nenhuma) — grava só no "Adicionar".
  const [escolhas, setEscolhas] = useState<Record<string, number | null>>({});
  // O que está gravando (a linha ou o lote) — o andamento no botão certo.
  const [emCurso, setEmCurso] = useState<string | null>(null);
  const escolhida = (l: LinhaUnidade) => {
    const id = l.chave in escolhas ? escolhas[l.chave] : l.sugestaoId;
    return id != null ? porId.get(id) : undefined;
  };
  const acionar = (chave: string, itens: GrafiaParaUnidade[]) => {
    setEmCurso(chave);
    void Promise.resolve(onAdicionar(itens)).finally(() => setEmCurso(null));
  };
  const lote = linhas.flatMap((l) => {
    const u = l.estado === "sugestao" ? escolhida(l) : undefined;
    return u ? [{ unidadeId: u.id, texto: l.texto }] : [];
  });

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
      // O filtro acha a linha por QUALQUER escrita dela ("Und." acha a linha do "UND").
      valores: (l) => l.grafias.map((g) => g.texto),
      render: (l) => (
        <CelulaLista
          valores={l.grafias.map((g) => g.texto)}
          max={2}
          mono
          dica={dicaLista(l.grafias, (g) => `${g.texto} — ${num(g.n)} ${g.n === 1 ? "item" : "itens"}`)}
        />
      ),
    },
    {
      key: "unidade",
      header: "Unidade cadastrada",
      align: "left",
      minWidth: 280,
      value: (l) => {
        const u = l.unidadeId != null ? porId.get(l.unidadeId) : undefined;
        if (u) return rotuloUnidade(u);
        const s = l.sugestaoId != null ? porId.get(l.sugestaoId) : undefined;
        return s ? `Sugestão: ${rotuloUnidade(s)}` : "—";
      },
      render: (l) => {
        if (l.estado === "cadastrada") {
          const u = l.unidadeId != null ? porId.get(l.unidadeId) : undefined;
          return <span className="text-text-2">{u ? rotuloUnidade(u) : "—"}</span>;
        }
        if (!podeEditar) {
          const s = l.sugestaoId != null ? porId.get(l.sugestaoId) : undefined;
          return <span className="text-faint">{s ? `Sugestão: ${rotuloUnidade(s)}` : "—"}</span>;
        }
        const alvo = escolhida(l);
        return (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {unidades.length > 0 && (
              <>
                <select
                  aria-label={`Unidade cadastrada da grafia ${l.texto}`}
                  className={`${selectCls} min-h-[44px] max-w-[220px] lg:min-h-0`}
                  value={alvo?.id ?? ""}
                  disabled={salvando}
                  onChange={(e) => setEscolhas((s) => ({ ...s, [l.chave]: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">Escolha a unidade…</option>
                  {unidades.map((x) => (
                    <option key={x.id} value={x.id}>
                      {rotuloUnidade(x)}
                      {x.id === l.sugestaoId ? " (sugestão)" : ""}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={salvando || !alvo}
                  loading={emCurso === l.chave}
                  icon={<IconCheck className="h-3.5 w-3.5" />}
                  aria-label={alvo ? `Adicionar ${l.texto} à unidade ${alvo.sigla}` : `Adicionar ${l.texto} (escolha a unidade)`}
                  onClick={() => alvo && acionar(l.chave, [{ unidadeId: alvo.id, texto: l.texto }])}
                >
                  Adicionar
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="xs"
              disabled={salvando}
              icon={<IconPlus className="h-3.5 w-3.5" />}
              aria-label={`Cadastrar uma unidade nova a partir de ${l.texto}`}
              onClick={() => onCadastrar(l)}
            >
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
        {podeEditar && lote.length > 0 && (
          <Button variant="secondary" icon={<IconCheck className="h-4 w-4" />} disabled={salvando} loading={emCurso === LOTE} onClick={() => acionar(LOTE, lote)}>
            Adicionar {num(lote.length)} {lote.length === 1 ? "sugestão" : "sugestões"}
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
          minWidth={podeEditar ? 960 : 720}
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
 * unidade só), antes de gravar. O rascunho é do PRÓPRIO editor (digitar não re-renderiza a tela de trás); `onSalvar`
 * recebe o rascunho. `somenteLeitura` = a consulta (sem permissão de editar): os dados e as grafias cobertas.
 */
export function EditorUnidadeMedida({
  inicial,
  unidades,
  classificacoes,
  linhas,
  salvando,
  somenteLeitura = false,
  onFechar,
  onSalvar,
}: {
  /** O que abre no editor (`id` = a editada; `null` = nova — em branco ou a proposta da comparação). */
  inicial: RascunhoUnidade;
  unidades: UnidadeMedida[];
  classificacoes: ClassificacaoItem[];
  linhas: LinhaUnidade[];
  salvando: boolean;
  somenteLeitura?: boolean;
  onFechar: () => void;
  onSalvar: (rascunho: RascunhoUnidade) => void;
}) {
  const [rascunho, setRascunho] = useState(inicial);
  const nova = inicial.id == null;
  const sigla = rascunho.sigla.trim();
  const nome = rascunho.nome.trim();
  const sinonimos = useMemo(() => limparSinonimos(sigla, nome, rascunho.sinonimos), [sigla, nome, rascunho.sinonimos]);
  const conflito = useMemo(
    () => (!somenteLeitura && (sigla || nome) ? conflitoUnidade({ sigla, nome, sinonimos }, unidades, inicial.id) : null),
    [somenteLeitura, sigla, nome, sinonimos, unidades, inicial.id],
  );
  // As grafias dos itens que o RASCUNHO cobre.
  const cobertas = useMemo(() => {
    const desta = resolverUnidades([{ id: -1, sigla, nome, sinonimos, classificacaoId: null, ordem: 0 }]);
    return linhas.filter((l) => desta(l.texto));
  }, [sigla, nome, sinonimos, linhas]);
  const itensCobertos = cobertas.reduce((s, l) => s + l.total, 0);
  const pode = !!sigla && !!nome && !conflito && !salvando;

  return (
    <Modal
      open
      onClose={onFechar}
      bloqueado={salvando}
      titulo={nova ? "Nova unidade de medida" : `${somenteLeitura ? "Unidade" : "Editar unidade"} ${inicial.sigla}`}
      size="md"
      rodape={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            {somenteLeitura ? "Fechar" : "Cancelar"}
          </Button>
          {!somenteLeitura && (
            <Button onClick={() => onSalvar(rascunho)} loading={salvando} disabled={!pode}>
              {nova ? "Cadastrar" : "Salvar"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        <div className="grid gap-[var(--gap-block)] sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <TextField
            label="Sigla"
            value={rascunho.sigla}
            readOnly={somenteLeitura}
            onChange={(e) => setRascunho((r) => ({ ...r, sigla: e.target.value }))}
            placeholder="UN"
            maxLength={LIMITES_PADRONIZACAO.sigla}
          />
          <TextField
            label="Nome"
            value={rascunho.nome}
            readOnly={somenteLeitura}
            onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
            placeholder="UNIDADE"
            maxLength={LIMITES_PADRONIZACAO.nome}
          />
        </div>
        <CampoLista
          label="Sinônimos (outras grafias aceitas)"
          valores={rascunho.sinonimos}
          disabled={somenteLeitura}
          onChange={(v) => setRascunho((r) => ({ ...r, sinonimos: v.slice(0, LIMITES_PADRONIZACAO.sinonimos) }))}
          placeholder="UND, UNID. — Enter ou vírgula para acrescentar"
          maxItem={LIMITES_PADRONIZACAO.grafia}
        />
        <SelectField
          label="Classificação que a unidade indica"
          value={rascunho.classificacaoId ?? ""}
          disabled={somenteLeitura}
          onChange={(e) => {
            const v = e.target.value;
            setRascunho((r) => ({ ...r, classificacaoId: v ? Number(v) : null }));
          }}
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
                  <span
                    key={l.chave}
                    className="rounded-chip border border-border-2 bg-surface px-2 py-0.5 font-mono text-[12px] text-text"
                    title={`${num(l.total)} ${l.total === 1 ? "item" : "itens"}`}
                  >
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
