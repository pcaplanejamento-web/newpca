"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaLista } from "./CelulaLista";
import { ColorField } from "./ColorField";
import { type Column, DataTable } from "./DataTable";
import { CelulaClassificacao, EstadoPonto } from "./EstadoCelula";
import { CampoLista, TextField } from "./Field";
import { IconPlus, IconRefresh } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";

/** O que o editor de classificação edita (`id` = a editada; `null` = nova). */
export type RascunhoClassificacao = { id: number | null; nome: string; cor: string; palavras: string[] };

const COR_PADRAO = "#2563eb";
/** Exemplos de descrições na prévia do editor. */
const MAX_EXEMPLOS = 6;

/**
 * Catálogo → CLASSIFICAÇÕES: o CADASTRO (nome + cor + palavras-chave; ↑/↓ = a ordem, que desempata) e a CLASSIFICAÇÃO
 * AUTOMÁTICA de todos os itens (as descrições distintas dos DFDs no escopo da unidade ativa e do catálogo), calculada no
 * navegador — o editor mostra AO VIVO quantos itens a classificação passa a ter (e quantos vêm de outra) antes de
 * gravar. A regra (`padronizacao-core`): vence a palavra-chave que aparece primeiro na descrição; na mesma posição, a
 * mais longa; depois, a ordem. Sem palavra-chave, vale a classificação da unidade de medida cadastrada do item. Carrega
 * sob demanda (só com a visão aberta). Editores gerenciam; os demais consultam.
 */
export function ClassificacoesView({ podeEditar }: { podeEditar: boolean }) {
  const [cad, setCad] = useState<Padronizacao | null>(null);
  const [descricoes, setDescricoes] = useState<DescricaoItem[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erroItens, setErroItens] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<RascunhoClassificacao | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregarCadastro = useCallback(async () => {
    try {
      const j = await chamarPadronizacao<Padronizacao>("/api/catalogo/classificacoes");
      setCad({ unidades: j.unidades, classificacoes: j.classificacoes });
      setErroCarga(null);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Erro ao carregar as classificações.");
    }
  }, []);
  // As descrições dos itens não mudam com o cadastro: carregadas UMA vez por abertura da visão.
  const carregarItens = useCallback(async () => {
    try {
      const j = await chamarPadronizacao<{ descricoes: DescricaoItem[] }>("/api/catalogo/classificacoes/itens");
      setDescricoes(j.descricoes);
      setErroItens(null);
    } catch (e) {
      setErroItens(e instanceof Error ? e.message : "Erro ao carregar os itens.");
    }
  }, []);
  useEffect(() => {
    void carregarCadastro();
    void carregarItens();
  }, [carregarCadastro, carregarItens]);

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

  async function executar(acao: () => Promise<unknown>, sucesso: string): Promise<boolean> {
    setSalvando(true);
    try {
      await acao();
      toast.success(sucesso);
      await carregarCadastro();
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
    const corpo = { nome: rascunho.nome, cor: rascunho.cor, palavras: rascunho.palavras };
    const ok = await executar(
      () => chamarPadronizacao(nova ? "/api/catalogo/classificacoes" : `/api/catalogo/classificacoes/${rascunho.id}`, nova ? "POST" : "PATCH", corpo),
      nova ? "Classificação cadastrada." : "Classificação atualizada.",
    );
    if (ok) setRascunho(null);
  }

  function excluir(c: ClassificacaoItem) {
    const t = totais?.porId.get(c.id);
    const itens = (t?.dfd ?? 0) + (t?.catalogo ?? 0);
    const unids = siglasPorClass.get(c.id)?.length ?? 0;
    const partes = [`Excluir a classificação "${c.nome}"?`];
    if (itens > 0) partes.push(`${num(itens)} item(ns) nela serão reclassificados pelas demais.`);
    if (unids > 0) partes.push(`${num(unids)} unidade(s) de medida a indicam e ficarão sem classificação.`);
    if (!confirm(partes.join(" "))) return;
    void executar(() => chamarPadronizacao(`/api/catalogo/classificacoes/${c.id}`, "DELETE"), "Classificação excluída.");
  }

  async function mover(id: number, dir: -1 | 1) {
    if (!cad || salvando) return;
    const i = cad.classificacoes.findIndex((x) => x.id === id);
    const alvo = i + dir;
    if (i < 0 || alvo < 0 || alvo >= cad.classificacoes.length) return;
    const nova = [...cad.classificacoes];
    [nova[i], nova[alvo]] = [nova[alvo], nova[i]];
    setCad({ ...cad, classificacoes: nova.map((c, ordem) => ({ ...c, ordem })) });
    // Uma gravação de ordem por vez (as ações ficam travadas até o servidor confirmar — nada de ordens concorrentes).
    setSalvando(true);
    try {
      await chamarPadronizacao("/api/catalogo/classificacoes/ordem", "PATCH", { ids: nova.map((x) => x.id) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a nova ordem.");
      await carregarCadastro();
    } finally {
      setSalvando(false);
    }
  }

  if (!cad) {
    return erroCarga ? (
      <Callout kind="danger">
        <span className="flex flex-wrap items-center justify-between gap-2">
          {erroCarga}
          <Button size="sm" variant="secondary" icon={<IconRefresh className="h-4 w-4" />} onClick={() => void carregarCadastro()}>
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

  const pos = new Map(cad.classificacoes.map((c, i) => [c.id, i]));
  const itensTotal = totais ? totais.total.dfd + totais.total.catalogo : 0;
  const itensSem = totais ? totais.semClassificacao.dfd + totais.semClassificacao.catalogo : 0;
  const palavrasTotal = cad.classificacoes.reduce((s, c) => s + c.palavras.length, 0);
  const carregando = !totais && !erroItens;

  const colsCadastro: Column<ClassificacaoItem>[] = [
    { key: "pos", header: "#", filter: "none", nowrap: true, render: (c) => <span className="tabular-nums text-faint">{(pos.get(c.id) ?? 0) + 1}</span> },
    { key: "nome", header: "Classificação", nowrap: true, value: (c) => c.nome, render: (c) => <EstadoPonto cor={c.cor} rotulo={c.nome} /> },
    {
      key: "palavras",
      header: "Palavras-chave",
      nowrap: true,
      value: (c) => c.palavras.join(" · ") || "—",
      render: (c) => <CelulaLista valores={c.palavras} max={3} />,
    },
    {
      key: "unidades",
      header: "Unidades de medida",
      nowrap: true,
      value: (c) => siglasPorClass.get(c.id)?.join(" · ") || "—",
      render: (c) => <CelulaLista valores={siglasPorClass.get(c.id) ?? []} max={3} mono />,
    },
    {
      key: "itens",
      header: "Itens",
      align: "center",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
      numero: (c) => {
        const t = totais?.porId.get(c.id);
        return (t?.dfd ?? 0) + (t?.catalogo ?? 0);
      },
      render: (c) => {
        if (!totais) return <span className="text-faint">…</span>;
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
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (c) => totais?.porId.get(c.id)?.valor ?? 0,
      render: (c) => (totais ? <span className="tabular-nums">{brl(totais.porId.get(c.id)?.valor ?? 0)}</span> : <span className="text-faint">…</span>),
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
                onMover={(d) => void mover(c.id, d)}
                onEditar={() => setRascunho({ id: c.id, nome: c.nome, cor: c.cor, palavras: c.palavras })}
                onExcluir={() => excluir(c)}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
        <StatMini label="Classificações" value={num(cad.classificacoes.length)} hint={`${num(palavrasTotal)} palavras-chave`} />
        <StatMini
          label="Itens classificados"
          value={totais ? (itensTotal ? pct(itensTotal - itensSem, itensTotal) : "—") : "…"}
          hint={totais ? `${num(itensTotal - itensSem)} de ${num(itensTotal)} itens` : "classificando…"}
          tone={!totais || itensTotal === 0 ? "default" : itensSem === 0 ? "ok" : "accent"}
        />
        <StatMini
          label={NAO_CLASSIFICADO}
          value={totais ? num(itensSem) : "…"}
          hint={totais ? `${num(totais.semClassificacao.descricoes)} descrições` : "classificando…"}
          tone={totais && itensSem > 0 && cad.classificacoes.length > 0 ? "warn" : "default"}
        />
        <StatMini
          label="Valor classificado"
          value={totais ? (totais.total.valor ? pct(totais.total.valor - totais.semClassificacao.valor, totais.total.valor) : "—") : "…"}
          hint={totais ? brl(totais.total.valor - totais.semClassificacao.valor) : "classificando…"}
        />
      </div>

      <section className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
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
            <Button icon={<IconPlus className="h-4 w-4" />} disabled={salvando} onClick={() => setRascunho({ id: null, nome: "", cor: COR_PADRAO, palavras: [] })}>
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
            resumo={(l) => `${num(l.length)} ${l.length === 1 ? "classificação" : "classificações"}`}
          />
        )}
      </section>

      <section className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
        <div className="min-w-0">
          <h2 className="font-semibold text-text">Classificação dos itens</h2>
          <p className="text-sm text-muted">
            Cada descrição distinta dos itens dos DFDs e do catálogo, com a classificação automática e o motivo. Filtre por "
            {NAO_CLASSIFICADO}" para achar as palavras-chave que faltam.
          </p>
        </div>
        {erroItens ? (
          <Callout kind="danger">
            <span className="flex flex-wrap items-center justify-between gap-2">
              {erroItens}
              <Button size="sm" variant="secondary" icon={<IconRefresh className="h-4 w-4" />} onClick={() => void carregarItens()}>
                Tentar de novo
              </Button>
            </span>
          </Callout>
        ) : carregando || !linhas ? (
          <SkeletonLinhas linhas={6} />
        ) : (
          <ClassificacaoDosItens linhas={linhas} />
        )}
      </section>

      {rascunho && (
        <EditorClassificacao
          rascunho={rascunho}
          cadastro={cad}
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
 * A CLASSIFICAÇÃO AUTOMÁTICA dos itens (apresentacional): cada descrição distinta com a classificação, o motivo (a
 * palavra-chave ou a unidade), a unidade, quantos itens de DFD e do catálogo a usam e o valor — todas as colunas
 * filtráveis ("Não classificado" acha as palavras-chave que faltam).
 */
export function ClassificacaoDosItens({ linhas }: { linhas: LinhaClassificada[] }) {
  const colunas: Column<LinhaClassificada>[] = [
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
      value: (l) => l.descricao,
      // Uma linha só (linhas da mesma altura, como na Mesa); o texto inteiro na dica.
      render: (l) => (
        <span className="line-clamp-1" title={l.descricao}>
          {l.descricao}
        </span>
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

  return (
    <DataTable
      columns={colunas}
      rows={linhas}
      getKey={(l) => l.id}
      pageSize={20}
      minWidth={900}
      vazio="Nenhum item com descrição ainda."
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
  );
}

/**
 * Editor (banner) de UMA classificação (apresentacional): nome, cor e palavras-chave — com a PRÉVIA ao vivo sobre os itens
 * já carregados
 * (quantos itens ela passa a ter, quantos vêm de outra classificação e exemplos) e os conflitos (nome repetido;
 * palavra-chave de outra) antes de gravar.
 */
export function EditorClassificacao({
  rascunho,
  cadastro,
  linhas,
  salvando,
  onChange,
  onFechar,
  onSalvar,
}: {
  rascunho: RascunhoClassificacao;
  cadastro: Padronizacao;
  linhas: LinhaClassificada[] | null;
  salvando: boolean;
  onChange: (r: RascunhoClassificacao) => void;
  onFechar: () => void;
  onSalvar: () => void;
}) {
  const nova = rascunho.id == null;
  const palavras = limparPalavras(rascunho.palavras);
  const mesmoNome = nomeEmUso(rascunho.nome, cadastro.classificacoes, rascunho.id);
  const conflito = conflitoPalavra(palavras, cadastro.classificacoes, rascunho.id);
  const chavePalavras = palavras.join("\u0000");
  // Prévia: o cadastro com ESTE rascunho no lugar (ou no fim, se nova) reclassifica os itens carregados — recalcula só
  // quando as PALAVRAS-CHAVE mudam (nome e cor não mudam a classificação).
  const previa = useMemo(() => {
    if (!linhas) return null;
    const idRascunho = rascunho.id ?? -1;
    const lista = chavePalavras ? chavePalavras.split("\u0000") : [];
    const atual = cadastro.classificacoes.find((c) => c.id === rascunho.id);
    const desta: ClassificacaoItem = { id: idRascunho, nome: "", cor: "", palavras: lista, ordem: atual?.ordem ?? Number.MAX_SAFE_INTEGER };
    const outras = cadastro.classificacoes.filter((c) => c.id !== rascunho.id);
    const classificar = criarClassificador([...outras, desta], cadastro.unidades);
    let itens = 0;
    let vindos = 0;
    let saem = 0;
    const exemplos: { descricao: string; n: number }[] = [];
    for (const l of linhas) {
      const antes = l.resultado?.classificacao.id ?? null;
      const depois = classificar(l.descricao, l.unidade)?.classificacao.id ?? null;
      const n = l.dfd + l.catalogo;
      if (depois === idRascunho) {
        itens += n;
        if (antes != null && antes !== idRascunho) vindos += n;
        exemplos.push({ descricao: l.descricao, n });
      } else if (antes === idRascunho && rascunho.id != null) saem += n;
    }
    exemplos.sort((a, b) => b.n - a.n);
    return { itens, vindos, saem, descricoes: exemplos.length, exemplos: exemplos.slice(0, MAX_EXEMPLOS) };
  }, [linhas, cadastro, rascunho.id, chavePalavras]);
  const pode = !!rascunho.nome.trim() && !mesmoNome && !conflito && !salvando;

  return (
    <Modal
      open
      onClose={onFechar}
      bloqueado={salvando}
      titulo={nova ? "Nova classificação" : `Editar classificação ${rascunho.nome}`}
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
        <TextField label="Nome" value={rascunho.nome} onChange={(e) => onChange({ ...rascunho, nome: e.target.value })} placeholder="Ex.: SERVIÇO" maxLength={60} />
        <ColorField label="Cor" value={rascunho.cor} onChange={(cor) => onChange({ ...rascunho, cor })} />
        <div>
          <CampoLista
            label="Palavras-chave"
            valores={rascunho.palavras}
            onChange={(v) => onChange({ ...rascunho, palavras: v.slice(0, LIMITES_PADRONIZACAO.palavras) })}
            placeholder="MANUTENÇÃO, PRESTAÇÃO DE SERVIÇO — Enter ou vírgula"
            maxItem={LIMITES_PADRONIZACAO.palavra}
          />
          <p className="mt-1.5 text-[12px] text-muted">
            Casa o início das palavras da descrição (CADEIRA acha CADEIRAS); palavras de até 3 letras só inteiras (AR não acha
            ARMÁRIO). Sem acento, caixa ou pontuação.
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
            <p className="mt-1.5 text-[12px] text-faint">Carregando os itens…</p>
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
                    <li key={e.descricao} className="line-clamp-1" title={e.descricao}>
                      {num(e.n)}× {e.descricao}
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
