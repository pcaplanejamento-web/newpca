"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { brl, num, pct } from "@/lib/format";
import {
  type ClassificacaoItem,
  classificarDescricoes,
  conflitoPalavra,
  criarClassificador,
  type DescricaoItem,
  LIMITES_PADRONIZACAO,
  type LinhaClassificada,
  limparPalavras,
  motivoClassificacao,
  NAO_CLASSIFICADO,
  nomeEmUso,
  type Padronizacao,
  totaisPorClassificacao,
} from "@/lib/padronizacao-core";
import { chamarPadronizacao } from "@/lib/padronizacao-cliente";
import { AcoesCadastro } from "./AcoesCadastro";
import { CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaLista } from "./CelulaLista";
import { ColorField } from "./ColorField";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { CelulaClassificacao, EstadoPonto } from "./EstadoCelula";
import { CampoLista, TextField } from "./Field";
import { IconPlus } from "./icons";
import { Modal } from "./Modal";
import { SkeletonCartao, SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";
import { useGravacaoCadastro } from "./useGravacaoCadastro";

/** O que o editor de classificação edita (`id` = a editada; `null` = nova). */
export type RascunhoClassificacao = { id: number | null; nome: string; cor: string; palavras: string[] };

const URL_CLASSIFICACOES = "/api/catalogo/classificacoes";
const COR_PADRAO = "#2563eb";
/** Exemplos de descrições na prévia do editor. */
const MAX_EXEMPLOS = 6;
const SECAO = "space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

/**
 * Catálogo → CLASSIFICAÇÕES: o CADASTRO (nome + cor + palavras-chave; ↑/↓ = a ordem, que desempata) e a CLASSIFICAÇÃO
 * AUTOMÁTICA de todos os itens (as descrições distintas dos DFDs no escopo da unidade ativa e do catálogo), calculada no
 * navegador — o editor mostra AO VIVO quantos itens a classificação passa a ter (e quantos vêm de outra) antes de
 * gravar. A regra (`padronizacao-core`): vence a palavra-chave que aparece primeiro na descrição; na mesma posição, a
 * mais longa; depois, a ordem. Sem palavra-chave, vale a classificação da unidade de medida cadastrada do item. Carrega
 * sob demanda (só com a visão aberta): o cadastro (recarregado a cada gravação) e as descrições dos itens (uma vez —
 * não mudam com o cadastro). Editores gerenciam; os demais consultam (tocar numa linha abre os dados dela).
 */
export function ClassificacoesView({ podeEditar }: { podeEditar: boolean }) {
  const [cad, setCad] = useState<Padronizacao | null>(null);
  const [descricoes, setDescricoes] = useState<DescricaoItem[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erroItens, setErroItens] = useState<string | null>(null);
  const [editando, setEditando] = useState<RascunhoClassificacao | null>(null);

  const carregarCadastro = useCallback(async () => {
    try {
      const j = await chamarPadronizacao<Padronizacao>(URL_CLASSIFICACOES);
      setCad({ unidades: j.unidades, classificacoes: j.classificacoes });
      setErroCarga(null);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Erro ao carregar as classificações.");
    }
  }, []);
  const carregarItens = useCallback(async () => {
    setErroItens(null); // "Tentar de novo" volta a "classificando…"
    try {
      const j = await chamarPadronizacao<{ descricoes: DescricaoItem[] }>(`${URL_CLASSIFICACOES}/itens`);
      setDescricoes(j.descricoes);
    } catch (e) {
      setErroItens(e instanceof Error ? e.message : "Erro ao carregar os itens.");
    }
  }, []);
  useEffect(() => {
    void carregarCadastro();
    void carregarItens();
  }, [carregarCadastro, carregarItens]);
  const { salvando, executar } = useGravacaoCadastro(carregarCadastro);

  const classificar = useMemo(() => (cad ? criarClassificador(cad.classificacoes, cad.unidades) : null), [cad]);
  const linhas = useMemo(() => (descricoes && classificar ? classificarDescricoes(descricoes, classificar) : null), [descricoes, classificar]);
  const totais = useMemo(() => (linhas ? totaisPorClassificacao(linhas) : null), [linhas]);
  const siglasPorClass = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const u of cad?.unidades ?? []) {
      if (u.classificacaoId == null) continue;
      const l = m.get(u.classificacaoId) ?? [];
      l.push(u.sigla);
      m.set(u.classificacaoId, l);
    }
    return m;
  }, [cad]);

  async function salvar(r: RascunhoClassificacao) {
    const nova = r.id == null;
    const corpo = { nome: r.nome, cor: r.cor, palavras: r.palavras };
    const gravou = await executar(async () => {
      await chamarPadronizacao(nova ? URL_CLASSIFICACOES : `${URL_CLASSIFICACOES}/${r.id}`, nova ? "POST" : "PATCH", corpo);
      return { msg: nova ? "Classificação cadastrada." : "Classificação atualizada." };
    });
    if (gravou) setEditando(null);
  }

  function excluir(c: ClassificacaoItem) {
    const t = totais?.porId.get(c.id);
    const itens = (t?.dfd ?? 0) + (t?.catalogo ?? 0);
    const unids = siglasPorClass.get(c.id)?.length ?? 0;
    const partes = [`Excluir a classificação "${c.nome}"?`];
    if (itens > 0) partes.push(`${num(itens)} item(ns) nela serão reclassificados pelas demais.`);
    if (unids > 0) partes.push(`${num(unids)} unidade(s) de medida a indicam e ficarão sem classificação.`);
    if (!confirm(partes.join(" "))) return;
    void executar(async () => {
      await chamarPadronizacao(`${URL_CLASSIFICACOES}/${c.id}`, "DELETE");
      return { msg: "Classificação excluída." };
    });
  }

  function mover(id: number, dir: -1 | 1) {
    if (!cad) return;
    const i = cad.classificacoes.findIndex((x) => x.id === id);
    const alvo = i + dir;
    if (i < 0 || alvo < 0 || alvo >= cad.classificacoes.length) return;
    const nova = [...cad.classificacoes];
    [nova[i], nova[alvo]] = [nova[alvo], nova[i]];
    // A lista já mostra a nova ordem (otimista); uma gravação de ordem por vez — recarrega só se falhar.
    void executar(async () => {
      setCad((c) => c && { ...c, classificacoes: nova.map((x, ordem) => ({ ...x, ordem })) });
      await chamarPadronizacao(`${URL_CLASSIFICACOES}/ordem`, "PATCH", { ids: nova.map((x) => x.id) });
      return null;
    }, false);
  }

  if (!cad) return erroCarga ? <ErroCarga msg={erroCarga} onTentar={() => void carregarCadastro()} /> : <SkeletonCartao />;

  const pos = new Map(cad.classificacoes.map((c, i) => [c.id, i]));
  const itensTotal = totais ? totais.total.dfd + totais.total.catalogo : 0;
  const itensSem = totais ? totais.semClassificacao.dfd + totais.semClassificacao.catalogo : 0;
  const palavrasTotal = cad.classificacoes.reduce((s, c) => s + c.palavras.length, 0);
  // Os itens (descrições) ainda chegando ou sem conseguir carregar: os números esperam ("…") ou ficam indisponíveis ("—").
  const semItens = erroItens ? "—" : "…";
  const dicaSemItens = erroItens ? "itens indisponíveis" : "classificando…";

  // O cadastro é uma lista ORDENADA (↑/↓ — a ordem desempata a classificação): sem ordenação/filtro nas colunas.
  const colsCadastro: Column<ClassificacaoItem>[] = [
    { key: "pos", header: "#", filter: "none", nowrap: true, render: (c) => <span className="tabular-nums text-faint">{(pos.get(c.id) ?? 0) + 1}</span> },
    { key: "nome", header: "Classificação", filter: "none", nowrap: true, render: (c) => <EstadoPonto cor={c.cor} rotulo={c.nome} /> },
    { key: "palavras", header: "Palavras-chave", filter: "none", nowrap: true, render: (c) => <CelulaLista valores={c.palavras} max={3} /> },
    {
      key: "unidades",
      header: "Unidades de medida",
      filter: "none",
      nowrap: true,
      render: (c) => <CelulaLista valores={siglasPorClass.get(c.id) ?? []} max={3} mono />,
    },
    {
      key: "itens",
      header: "Itens",
      filter: "none",
      align: "center",
      nowrap: true,
      render: (c) => {
        if (!totais) return <span className="text-faint">{semItens}</span>;
        const t = totais.porId.get(c.id);
        return (
          <span className="tabular-nums" title={`DFDs: ${num(t?.dfd ?? 0)} · Catálogo: ${num(t?.catalogo ?? 0)} · ${num(t?.descricoes ?? 0)} descrições`}>
            {num((t?.dfd ?? 0) + (t?.catalogo ?? 0))}
          </span>
        );
      },
    },
    {
      key: "valor",
      header: "Valor (DFDs)",
      filter: "none",
      align: "right",
      nowrap: true,
      render: (c) =>
        totais ? <span className="tabular-nums">{brl(totais.porId.get(c.id)?.valor ?? 0)}</span> : <span className="text-faint">{semItens}</span>,
    },
    ...(podeEditar
      ? [
          {
            key: "acoes",
            header: "",
            filter: "none" as const,
            align: "right" as const,
            nowrap: true,
            render: (c: ClassificacaoItem) => (
              <AcoesCadastro
                nome={c.nome}
                primeira={(pos.get(c.id) ?? 0) === 0}
                ultima={(pos.get(c.id) ?? 0) === cad.classificacoes.length - 1}
                disabled={salvando}
                onMover={(d) => mover(c.id, d)}
                onEditar={() => setEditando({ id: c.id, nome: c.nome, cor: c.cor, palavras: c.palavras })}
                onExcluir={() => excluir(c)}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      {erroCarga && (
        <ErroCarga kind="warn" msg={`A lista pode estar desatualizada — ${erroCarga}`} onTentar={() => void executar(async () => null)} />
      )}
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
        <StatMini label="Classificações" value={num(cad.classificacoes.length)} hint={`${num(palavrasTotal)} palavras-chave`} />
        <StatMini
          label="Itens classificados"
          value={totais ? (itensTotal ? pct(itensTotal - itensSem, itensTotal) : "—") : semItens}
          hint={totais ? `${num(itensTotal - itensSem)} de ${num(itensTotal)} itens` : dicaSemItens}
          tone={!totais || itensTotal === 0 ? "default" : itensSem === 0 ? "ok" : "accent"}
        />
        <StatMini
          label={NAO_CLASSIFICADO}
          value={totais ? num(itensSem) : semItens}
          hint={totais ? `${num(totais.semClassificacao.descricoes)} descrições` : dicaSemItens}
          tone={totais && itensSem > 0 && cad.classificacoes.length > 0 ? "warn" : "default"}
        />
        <StatMini
          label="Valor classificado"
          value={totais ? (totais.total.valor ? pct(totais.total.valor - totais.semClassificacao.valor, totais.total.valor) : "—") : semItens}
          hint={totais ? brl(totais.total.valor - totais.semClassificacao.valor) : dicaSemItens}
        />
      </div>

      <section className={SECAO}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-3xl">
            <h2 className="font-semibold text-text">Classificações cadastradas</h2>
            <p className="text-sm text-muted">
              Os itens são classificados automaticamente pela descrição: vence a palavra-chave que aparece primeiro; na mesma
              posição, a mais longa; depois, a ordem desta lista (↑/↓). Sem palavra-chave, vale a classificação da unidade de
              medida.
            </p>
          </div>
          {podeEditar && (
            <Button icon={<IconPlus className="h-4 w-4" />} disabled={salvando} onClick={() => setEditando({ id: null, nome: "", cor: COR_PADRAO, palavras: [] })}>
              Nova classificação
            </Button>
          )}
        </div>
        {cad.classificacoes.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-2 p-6 text-center text-sm text-muted">
            Nenhuma classificação cadastrada — os itens ficam "{NAO_CLASSIFICADO}" até a primeira.
          </p>
        ) : (
          <DataTable
            columns={colsCadastro}
            rows={cad.classificacoes}
            getKey={(c) => c.id}
            pageSize={20}
            minWidth={podeEditar ? 900 : 720}
            // Consulta (sem permissão): tocar na linha abre os dados. Quem edita usa o lápis da linha (sem linha-botão com
            // botões dentro — e um toque num botão desabilitado nunca abre o editor no meio de uma gravação).
            onRowClick={podeEditar ? undefined : (c) => setEditando({ id: c.id, nome: c.nome, cor: c.cor, palavras: c.palavras })}
            resumo={(l) => `${num(l.length)} ${l.length === 1 ? "classificação" : "classificações"}`}
          />
        )}
      </section>

      <section className={SECAO}>
        <div className="min-w-0">
          <h2 className="font-semibold text-text">Classificação dos itens</h2>
          <p className="text-sm text-muted">
            Cada descrição distinta dos itens dos DFDs e do catálogo, com a classificação automática e o motivo. Filtre por "
            {NAO_CLASSIFICADO}" para achar as palavras-chave que faltam.
          </p>
        </div>
        {erroItens ? (
          <ErroCarga msg={erroItens} onTentar={() => void carregarItens()} />
        ) : !linhas ? (
          <SkeletonLinhas linhas={6} />
        ) : (
          <ClassificacaoDosItens linhas={linhas} />
        )}
      </section>

      {editando && (
        <EditorClassificacao
          key={editando.id ?? "nova"}
          inicial={editando}
          cadastro={cad}
          linhas={linhas}
          falhaItens={!!erroItens}
          salvando={salvando}
          somenteLeitura={!podeEditar}
          onFechar={() => setEditando(null)}
          onSalvar={(r) => void salvar(r)}
        />
      )}
    </div>
  );
}

/** A classificação, o motivo, a descrição, a unidade e o uso de cada descrição distinta — todas filtráveis ("Não
 * classificado" acha as palavras-chave que faltam). Fixas (não dependem de nada da tela). */
const COLUNAS_ITENS: Column<LinhaClassificada>[] = [
  {
    key: "classificacao",
    header: "Classificação",
    nowrap: true,
    value: (l) => l.resultado?.classificacao.nome ?? NAO_CLASSIFICADO,
    render: (l) => <CelulaClassificacao resultado={l.resultado} />,
  },
  {
    key: "motivo",
    header: "Por",
    nowrap: true,
    value: (l) => (l.resultado ? motivoClassificacao(l.resultado) : "—"),
    render: (l) =>
      l.resultado ? (
        <span className="text-[12px] text-text-2" title={motivoClassificacao(l.resultado)}>
          {l.resultado.por === "palavra" ? `“${l.resultado.termo}”` : `Unidade ${l.resultado.termo}`}
        </span>
      ) : (
        <span className="text-faint">—</span>
      ),
  },
  {
    key: "descricao",
    header: "Descrição",
    minWidth: 280,
    value: (l) => l.descricao || "—",
    // Uma linha só (linhas da mesma altura, como na Mesa); o texto inteiro na dica e ao tocar na linha.
    render: (l) =>
      l.descricao ? (
        <CelulaCopiavel copiar={l.descricao} rotulo="descrição do item">
          <span className="line-clamp-1" title={l.descricao}>
            {l.descricao}
          </span>
        </CelulaCopiavel>
      ) : (
        <span className="text-faint">—</span>
      ),
  },
  {
    key: "unidade",
    header: "Unidade",
    nowrap: true,
    value: (l) => l.unidade ?? "—",
    render: (l) => <span className="font-mono text-[12px]">{l.unidade ?? "—"}</span>,
  },
  // Quantos itens usam a descrição (DFDs + catálogo — a divisão na dica) e o valor dos de DFD.
  {
    key: "itens",
    header: "Itens",
    align: "center",
    nowrap: true,
    filter: "range",
    formatarFaixa: num,
    numero: (l) => l.dfd + l.catalogo,
    render: (l) => (
      <span className="tabular-nums" title={`DFDs: ${num(l.dfd)} · Catálogo: ${num(l.catalogo)}`}>
        {num(l.dfd + l.catalogo)}
      </span>
    ),
  },
  { key: "valor", header: "Valor (DFDs)", align: "right", nowrap: true, filter: "range", numero: (l) => l.valor, render: (l) => <span className="tabular-nums">{brl(l.valor)}</span> },
];

/**
 * A CLASSIFICAÇÃO AUTOMÁTICA dos itens (apresentacional): cada descrição distinta com a classificação, o motivo (a
 * palavra-chave ou a unidade), a unidade, quantos itens de DFD e do catálogo a usam e o valor. Tocar numa linha abre os
 * dados dela inteiros (a descrição completa — no celular não há dica). Memorizada: a tela de trás re-renderiza sem
 * refazer a tabela.
 */
export const ClassificacaoDosItens = memo(function ClassificacaoDosItens({ linhas }: { linhas: LinhaClassificada[] }) {
  // Pela POSIÇÃO (o `id` da linha): reclassificar (o cadastro mudou) mantém o detalhe aberto com o resultado novo.
  const [abertaId, setAbertaId] = useState<number | null>(null);
  const aberta = abertaId != null && linhas[abertaId]?.id === abertaId ? linhas[abertaId] : null;
  return (
    <>
      <DataTable
        columns={COLUNAS_ITENS}
        rows={linhas}
        getKey={(l) => l.id}
        pageSize={20}
        minWidth={900}
        onRowClick={(l) => setAbertaId(l.id)}
        vazio="Nenhum item ainda."
        resumo={(l) => (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>
              {num(l.length)} {l.length === 1 ? "descrição" : "descrições"}
            </span>
            <span className="text-text-2">
              Itens <span className="font-semibold tabular-nums text-text">{num(l.reduce((s, x) => s + x.dfd + x.catalogo, 0))}</span>
            </span>
            <span className="text-text-2">
              Valor <span className="font-semibold tabular-nums text-text">{brl(l.reduce((s, x) => s + x.valor, 0))}</span>
            </span>
          </span>
        )}
      />
      {aberta && (
        <Modal
          open
          onClose={() => setAbertaId(null)}
          titulo="Classificação do item"
          size="md"
          rodape={
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setAbertaId(null)}>
                Fechar
              </Button>
            </div>
          }
        >
          <div className="space-y-[var(--gap-block)]">
            <div className="space-y-1">
              <CelulaClassificacao resultado={aberta.resultado} />
              <p className="text-[12.5px] text-text-2">{motivoClassificacao(aberta.resultado)}</p>
            </div>
            <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
              <Campo label="Descrição" valor={aberta.descricao || "—"} span />
              <Campo label="Unidade" valor={aberta.unidade ?? "—"} mono />
              <Campo label="Itens" valor={`${num(aberta.dfd + aberta.catalogo)} (DFDs ${num(aberta.dfd)} · catálogo ${num(aberta.catalogo)})`} />
              <Campo label="Valor (DFDs)" valor={brl(aberta.valor)} />
            </dl>
          </div>
        </Modal>
      )}
    </>
  );
});

function Campo({ label, valor, span, mono }: { label: string; valor: string; span?: boolean; mono?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 whitespace-pre-wrap break-words font-semibold leading-snug text-text ${mono ? "font-mono text-[13px]" : ""}`}>{valor}</dd>
    </div>
  );
}

/**
 * Editor (banner) de UMA classificação (apresentacional): nome, cor e palavras-chave — com a PRÉVIA ao vivo sobre os itens
 * já carregados (quantos itens ela passa a ter, quantos vêm de outra classificação e exemplos) e os conflitos (nome
 * repetido; palavra-chave de outra) antes de gravar. O rascunho é do PRÓPRIO editor (digitar não re-renderiza a tela de
 * trás); `onSalvar` recebe o rascunho. `somenteLeitura` = a consulta (sem permissão de editar): os dados e a prévia.
 */
export function EditorClassificacao({
  inicial,
  cadastro,
  linhas,
  falhaItens = false,
  salvando,
  somenteLeitura = false,
  onFechar,
  onSalvar,
}: {
  /** O que abre no editor (`id` = a editada; `null` = nova). */
  inicial: RascunhoClassificacao;
  cadastro: Padronizacao;
  /** Os itens classificados (`null` = ainda chegando, ou indisponíveis com `falhaItens`). */
  linhas: LinhaClassificada[] | null;
  falhaItens?: boolean;
  salvando: boolean;
  somenteLeitura?: boolean;
  onFechar: () => void;
  onSalvar: (rascunho: RascunhoClassificacao) => void;
}) {
  const [rascunho, setRascunho] = useState(inicial);
  const nova = inicial.id == null;
  const palavras = useMemo(() => limparPalavras(rascunho.palavras), [rascunho.palavras]);
  const mesmoNome = somenteLeitura ? null : nomeEmUso(rascunho.nome, cadastro.classificacoes, inicial.id);
  const conflito = somenteLeitura ? null : conflitoPalavra(palavras, cadastro.classificacoes, inicial.id);
  const chavePalavras = palavras.join("\u0000");
  // Prévia: o cadastro com ESTE rascunho no lugar (ou no fim, se nova) reclassifica os itens carregados — recalcula só
  // quando as PALAVRAS-CHAVE mudam (nome e cor não mudam a classificação).
  const previa = useMemo(() => {
    if (!linhas) return null;
    const idRascunho = inicial.id ?? -1;
    const lista = chavePalavras ? chavePalavras.split("\u0000") : [];
    const atual = cadastro.classificacoes.find((c) => c.id === inicial.id);
    const desta: ClassificacaoItem = { id: idRascunho, nome: "", cor: "", palavras: lista, ordem: atual?.ordem ?? Number.MAX_SAFE_INTEGER };
    const outras = cadastro.classificacoes.filter((c) => c.id !== inicial.id);
    const classificar = criarClassificador([...outras, desta], cadastro.unidades);
    let itens = 0;
    let vindos = 0;
    let saem = 0;
    const exemplos: { id: number; descricao: string; unidade: string | null; n: number }[] = [];
    for (const l of linhas) {
      const antes = l.resultado?.classificacao.id ?? null;
      const depois = classificar(l.descricao, l.unidade)?.classificacao.id ?? null;
      const n = l.dfd + l.catalogo;
      if (depois === idRascunho) {
        itens += n;
        if (antes != null && antes !== idRascunho) vindos += n;
        exemplos.push({ id: l.id, descricao: l.descricao, unidade: l.unidade, n });
      } else if (antes === idRascunho && inicial.id != null) saem += n;
    }
    exemplos.sort((a, b) => b.n - a.n);
    return { itens, vindos, saem, descricoes: exemplos.length, exemplos: exemplos.slice(0, MAX_EXEMPLOS) };
  }, [linhas, cadastro, inicial.id, chavePalavras]);
  const pode = !!rascunho.nome.trim() && !mesmoNome && !conflito && !salvando;

  return (
    <Modal
      open
      onClose={onFechar}
      bloqueado={salvando}
      titulo={nova ? "Nova classificação" : `${somenteLeitura ? "Classificação" : "Editar classificação"} ${inicial.nome}`}
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
        <TextField
          label="Nome"
          value={rascunho.nome}
          readOnly={somenteLeitura}
          onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
          placeholder="Ex.: SERVIÇO"
          maxLength={LIMITES_PADRONIZACAO.nome}
        />
        {!somenteLeitura && <ColorField label="Cor" value={rascunho.cor} onChange={(cor) => setRascunho((r) => ({ ...r, cor }))} />}
        <div>
          <CampoLista
            label="Palavras-chave"
            valores={rascunho.palavras}
            disabled={somenteLeitura}
            onChange={(v) => setRascunho((r) => ({ ...r, palavras: v.slice(0, LIMITES_PADRONIZACAO.palavras) }))}
            placeholder="MANUTENÇÃO, PRESTAÇÃO DE SERVIÇO — Enter ou vírgula"
            maxItem={LIMITES_PADRONIZACAO.palavra}
          />
          <p className="mt-1.5 text-[12px] text-muted">
            Casa o início das palavras da descrição (CADEIRA acha CADEIRAS); as de até 3 letras só inteiras ou no plural (KIT acha
            KITS; AR não acha ARMÁRIO). Sem acento, caixa ou pontuação.
          </p>
        </div>
        {mesmoNome && <Callout kind="warn">Já existe a classificação “{mesmoNome.nome}”.</Callout>}
        {conflito && (
          <Callout kind="warn">
            A palavra-chave “{conflito.termo}” já é da classificação “{conflito.classificacao.nome}” — uma palavra-chave pertence a
            uma classificação só.
          </Callout>
        )}
        <div className="rounded-card border border-border bg-surface-2 p-3">
          <p className="mb-1.5 text-[12px] font-semibold text-muted">Prévia</p>
          <EstadoPonto cor={rascunho.cor} rotulo={rascunho.nome.trim() || "Classificação"} />
          {!previa ? (
            <p className="mt-1.5 text-[12px] text-faint">{falhaItens ? "Os itens não carregaram — sem prévia da classificação." : "Carregando os itens…"}</p>
          ) : (
            <>
              <p className="mt-1.5 text-[12.5px] text-text-2">
                {num(previa.itens)} {previa.itens === 1 ? "item" : "itens"} ({num(previa.descricoes)} {previa.descricoes === 1 ? "descrição" : "descrições"})
                {previa.vindos > 0 && ` · ${num(previa.vindos)} vêm de outra classificação`}
                {previa.saem > 0 && ` · ${num(previa.saem)} saem desta`}
              </p>
              {previa.exemplos.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[12px] text-muted">
                  {previa.exemplos.map((e) => (
                    <li key={e.id} className="flex min-w-0 items-baseline gap-1.5" title={e.descricao}>
                      <span className="shrink-0 tabular-nums">{num(e.n)}×</span>
                      <span className="truncate">{e.descricao || "(sem descrição)"}</span>
                      {e.unidade && <span className="shrink-0 font-mono text-[11px] text-faint">{e.unidade}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
