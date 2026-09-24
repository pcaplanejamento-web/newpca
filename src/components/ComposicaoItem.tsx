"use client";

import { brl, num, pct } from "@/lib/format";
import {
  type ClasseAbc,
  desvioDaMedia,
  desvioTexto,
  distintos,
  FAIXAS_VARIACAO,
  type ItemConsolidado,
  type ItemConsolidavel,
  mediaDeReferencia,
  nivelVariacao,
  participacaoTexto,
  textoResumoConsolidado,
  varianteDescricao,
} from "@/lib/itens-consolidados";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { BotaoCopiar } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaLista } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { EstadoPonto } from "./EstadoCelula";
import { IconAlert } from "./icons";
import { Modal } from "./Modal";
import { StatMini } from "./StatMini";

/** Cor (token) de cada nível da variação dos preços — verde OK · âmbar atenção · vermelho alerta. */
const COR_VARIACAO = { ok: "var(--ok)", atencao: "var(--warn)", alerta: "var(--danger)" } as const;
const TOM_VARIACAO = { ok: "ok", atencao: "warn", alerta: "danger" } as const;
const REGUA_VARIACAO = `Até ${pct(FAIXAS_VARIACAO.atencao, 1)} = preços homogêneos · até ${pct(FAIXAS_VARIACAO.alerta, 1)} = atenção · acima = alerta.`;

/** Célula "Variação" (coeficiente de variação dos valores unitários de um código): o % na cor da faixa. `nota` completa a
 * dica (ex.: unidades diferentes — a maior variação dentro de uma mesma unidade). */
export function CelulaVariacao({ cv, min, max, n, nota }: { cv: number | null; min?: number | null; max?: number | null; n?: number; nota?: string }) {
  const nivel = nivelVariacao(cv);
  if (nivel == null || cv == null) return <span className="text-faint" title={`Menos de 2 preços — sem variação${nota ? `\n${nota}` : ""}`}>—</span>;
  const faixa = min != null && max != null ? `\nMín. ${brl(min)} · máx. ${brl(max)}${n ? ` (${num(n)} preços)` : ""}` : "";
  return (
    <EstadoPonto
      cor={COR_VARIACAO[nivel]}
      rotulo={pct(cv, 1)}
      title={`Variação dos valores unitários (coeficiente de variação).${faixa}${nota ? `\n${nota}` : ""}\n${REGUA_VARIACAO}`}
    />
  );
}

/** Selo da CURVA ABC (A = os que somam os primeiros 80% do valor · B = até 95% · C = o resto) — sem valor = "—". */
export function SeloAbc({ classe, participacao }: { classe: ClasseAbc | null; participacao?: number }) {
  if (!classe) return <span className="text-faint">—</span>;
  const estilo = classe === "A" ? "bg-accent text-white" : classe === "B" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted";
  return (
    <span
      className={`inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold ${estilo}`}
      title={`Curva ABC: classe ${classe}${participacao != null ? ` — ${participacaoTexto(participacao)} do valor total` : ""}.\nA = os que somam os primeiros 80% do valor · B = até 95% · C = o resto.`}
    >
      {classe}
    </span>
  );
}

/** Marca da VARIANTE da descrição ("D1", "D2"…) — a MESMA na lista de descrições e na tabela das ocorrências. */
function ChipVariante({ n, titulo }: { n: number; titulo?: string }) {
  return (
    <span className="inline-grid h-5 min-w-7 shrink-0 place-items-center rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold tabular-nums text-accent" title={titulo}>
      D{n}
    </span>
  );
}

/** O que o detalhe mostra de cada item de origem (a linha da visão Itens da Mesa tem estes campos). */
export type ItemComposicao = ItemConsolidavel & {
  dfdNumero: string;
  /** Nº de planejamento e tipo do DFD de origem. */
  dfdPlanejamento: string | null;
  dfdTipo: string | null;
  protocoloNumero: string | null;
  sigla: string | null;
  item: number | null;
};

const NIVEL_TEXTO = { ok: "homogêneos", atencao: "atenção — pouco homogêneos", alerta: "alerta — muito dispersos" } as const;
const itens = (n: number) => `${num(n)} ${n === 1 ? "item" : "itens"}`;

/**
 * Detalhe de uma linha da visão CONSOLIDADA dos itens (Mesa → Itens → Consolidada): os indicadores do código
 * (quantidade total, valor unitário médio PONDERADO, menor e maior preço, variação dos preços, valor total e a curva
 * ABC), os avisos (unidades diferentes — com a quebra POR UNIDADE; itens fora da média; descrições diferentes) e a
 * TABELA das ocorrências — cada item de origem com o DESVIO do seu preço em relação à média (a da unidade dele, se a
 * linha mistura unidades). Quem usa acrescenta colunas próprias (`colunasAntes`/`colunasDepois` — na Mesa: Estado,
 * Catálogo, PCA, Prioridade, Seq. PCA), então o detalhe mostra TUDO o que a linha resume. Tocar numa ocorrência abre o
 * item na pilha da Mesa (por cima deste banner). "Copiar resumo" = o texto para um despacho.
 */
export function ComposicaoItem<T extends ItemComposicao>({
  linha,
  onFechar,
  onAbrirItem,
  colunasAntes = [],
  colunasDepois = [],
}: {
  linha: ItemConsolidado<T> | null;
  onFechar: () => void;
  /** Abre o item de origem (a pilha de banners da Mesa). */
  onAbrirItem?: (item: T) => void;
  /** Colunas do host antes / depois das da composição (ex.: Estado; Catálogo, PCA, Prioridade). */
  colunasAntes?: Column<T>[];
  colunasDepois?: Column<T>[];
}) {
  const l = linha;
  // Cada DFD pelo nº + nº de planejamento (a referência dos despachos do sistema — "1201 (Planej. 1501)").
  const planejamentoDe = (it: T) => it.dfdPlanejamento?.trim() || null;
  const dfds = l ? distintos(l.itens, (it) => (planejamentoDe(it) ? `${it.dfdNumero} (Planej. ${planejamentoDe(it)})` : it.dfdNumero)) : [];
  const protocolos = l ? distintos(l.itens, (it) => it.protocoloNumero) : [];
  const precos = l ? l.itens.length - l.semValor : 0;
  const nivel = l ? nivelVariacao(l.variacao) : null;
  const mistas = !!l?.unidadesMistas;
  const variante = l && l.descricoes.length > 1 ? varianteDescricao(l.descricoes) : null;
  const tituloDesvio = `Desvio em relação à média ponderada ${mistas ? "da MESMA unidade" : "do código"} (${REGUA_VARIACAO.toLowerCase()})`;

  const colunas: Column<T>[] = [
    ...colunasAntes,
    { key: "protocolo", header: "Protocolo", nowrap: true, value: (it) => it.protocoloNumero ?? "—", render: (it) => <CelulaLista valores={it.protocoloNumero ? [it.protocoloNumero] : []} mono /> },
    {
      key: "planejamento",
      header: "Nº Plan.",
      nowrap: true,
      value: (it) => planejamentoDe(it) ?? "—",
      render: (it) => <span className="font-mono text-[12px]">{planejamentoDe(it) ?? "—"}</span>,
    },
    { key: "dfd", header: "Nº DFD", nowrap: true, value: (it) => it.dfdNumero, render: (it) => <span className="font-mono text-[12px]">{it.dfdNumero}</span> },
    { key: "sigla", header: "Sigla", nowrap: true, value: (it) => it.sigla ?? "—", render: (it) => <CelulaLista valores={it.sigla ? [it.sigla] : []} mono destaque /> },
    {
      key: "tipo",
      header: "Tipo",
      nowrap: true,
      value: (it) => tipoCurtoDfd(it.dfdTipo) ?? "—",
      render: (it) => <span className="text-[12px]">{tipoCurtoDfd(it.dfdTipo) ?? "—"}</span>,
    },
    { key: "item", header: "Item", align: "center", nowrap: true, value: (it) => String(it.item ?? ""), render: (it) => it.item ?? "—" },
    { key: "unidade", header: "Unidade", nowrap: true, value: (it) => it.unidade ?? "", render: (it) => it.unidade ?? "—" },
    {
      key: "qtd",
      header: "Qtd.",
      align: "center",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
      numero: (it) => it.quantidade,
      render: (it) => (it.quantidade != null ? num(it.quantidade) : "—"),
    },
    // O valor unitário e, ao lado, o DESVIO dele em relação à média (na cor da faixa) — ordenar ou filtrar pelo valor é o
    // mesmo que pelo desvio dentro de cada unidade.
    {
      key: "vunit",
      header: "Vlr. unit. · Δ média",
      align: "right",
      filter: "range",
      nowrap: true,
      numero: (it) => it.valorUnitario,
      render: (it) => {
        if (it.valorUnitario == null) return "—";
        const d = l ? desvioDaMedia(it.valorUnitario, mediaDeReferencia(l, it.unidade)) : null;
        const n = d == null ? null : nivelVariacao(Math.abs(d));
        return (
          <span className="inline-flex items-baseline justify-end gap-1.5 whitespace-nowrap">
            {brl(it.valorUnitario)}
            <span
              className="min-w-11 text-right text-[11.5px] font-medium tabular-nums"
              style={{ color: n && n !== "ok" ? COR_VARIACAO[n] : "var(--muted)" }}
              title={d == null ? undefined : tituloDesvio}
            >
              {d == null ? "—" : desvioTexto(d)}
            </span>
          </span>
        );
      },
    },
    { key: "vtotal", header: "Vlr. total", align: "right", filter: "range", nowrap: true, numero: (it) => it.valorTotal, render: (it) => (it.valorTotal != null ? brl(it.valorTotal) : "—") },
    // Descrições diferentes no código: a VARIANTE de cada ocorrência ("D1"… — a lista acima; o texto na dica). Com uma
    // descrição só, ela já está no cabeçalho do banner — a coluna não se repete.
    ...(variante
      ? [
          {
            key: "descricao",
            header: "Descrição",
            align: "center" as const,
            nowrap: true,
            value: (it: T) => (variante(it.descricao) ? `D${variante(it.descricao)}` : "—"),
            render: (it: T) => {
              const n = variante(it.descricao);
              return n ? <ChipVariante n={n} titulo={it.descricao ?? undefined} /> : <span className="text-faint">—</span>;
            },
          },
        ]
      : []),
    ...colunasDepois,
  ];

  return (
    <Modal
      open={!!l}
      onClose={onFechar}
      titulo={l ? (l.codigo ? `Código ${l.codigo}` : "Item sem código") : ""}
      size="full"
      cabecalho={
        l && (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[15px] font-bold text-text">{l.codigo ?? "Sem código"}</span>
              <SeloAbc classe={l.abc} participacao={l.participacao} />
              <span className="text-[12px] text-muted">
                {itens(l.itens.length)} · {num(dfds.length)} DFD{dfds.length === 1 ? "" : "s"} · {num(protocolos.length)}{" "}
                {protocolos.length === 1 ? "protocolo" : "protocolos"}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[13px] text-text-2" title={l.descricoes[0]?.texto}>
              {l.descricoes[0]?.texto ?? "Sem descrição"}
            </p>
          </div>
        )
      }
      rodape={
        l && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <BotaoCopiar texto={textoResumoConsolidado(l, { dfds, protocolos })} rotulo="Copiar resumo" titulo="Copia o resumo deste código (para um despacho ou relatório)" />
            <Button variant="secondary" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        )
      }
    >
      {l && (
        <div className="space-y-[var(--gap-block)]">
          <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 lg:grid-cols-6">
            <StatMini
              label="Quantidade total"
              value={l.quantidade != null ? num(l.quantidade) : "—"}
              hint={l.unidades.length ? l.unidades.map((u) => u.texto).join(" + ") : "sem unidade"}
              tone={mistas ? "warn" : "default"}
            />
            <StatMini
              label="Valor unitário médio"
              value={l.valorMedio != null ? brl(l.valorMedio) : "—"}
              hint={mistas ? "mistura unidades" : "média ponderada"}
              tone={mistas ? "warn" : "accent"}
            />
            <StatMini label="Menor preço" value={l.valorMin != null ? brl(l.valorMin) : "—"} hint={`${num(precos)} ${precos === 1 ? "preço" : "preços"}`} />
            <StatMini label="Maior preço" value={l.valorMax != null ? brl(l.valorMax) : "—"} hint={l.valorMin != null && l.valorMax != null ? `diferença ${brl(l.valorMax - l.valorMin)}` : undefined} />
            <StatMini
              label="Variação dos preços"
              value={l.variacao != null ? pct(l.variacao, 1) : "—"}
              hint={mistas ? "a maior por unidade" : nivel ? NIVEL_TEXTO[nivel] : "menos de 2 preços"}
              tone={nivel ? TOM_VARIACAO[nivel] : "default"}
            />
            <StatMini label="Valor total" value={brl(l.valorTotal)} hint={l.abc ? `${participacaoTexto(l.participacao)} do total · curva ${l.abc}` : "sem valor"} />
          </div>

          {mistas && (
            <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
              <b>Unidades diferentes neste código</b> — a quantidade total e o valor médio misturam unidades distintas. Compare
              por unidade (abaixo); o desvio de cada item usa a média da unidade dele. Confira nos DFDs de origem.
            </Callout>
          )}
          {l.foraDaMedia > 0 && (
            <Callout kind="info">
              {itens(l.foraDaMedia)} fora da média ponderada —{" "}
              {[
                l.semQuantidade > 0 ? `${num(l.semQuantidade)} sem quantidade (vazia ou zerada)` : "",
                l.semValor > 0 ? `${num(l.semValor)} sem valor unitário` : "",
              ]
                .filter(Boolean)
                .join(" e ")}
              .
            </Callout>
          )}
          {mistas && (
            <section className="rounded-card border border-border bg-surface-2 p-[var(--pad-card)]">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">
                Por unidade de medida ({num(l.porUnidade.length)}) — só os itens de cada uma
              </h3>
              <ul className="mt-1 divide-y divide-border">
                {l.porUnidade.map((u) => (
                  <li key={u.chave} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5 text-[13px] text-text-2">
                    <span className="min-w-14 font-semibold text-text">{u.texto}</span>
                    <span className="text-muted">{itens(u.n)}</span>
                    <span>
                      Qtd. <b className="tabular-nums text-text">{u.quantidade != null ? num(u.quantidade) : "—"}</b>
                    </span>
                    <span>
                      Médio <b className="tabular-nums text-text">{u.valorMedio != null ? brl(u.valorMedio) : "—"}</b>
                    </span>
                    {u.valorMin != null && u.valorMax != null && u.valorMin !== u.valorMax && (
                      <span className="tabular-nums text-muted">
                        {brl(u.valorMin)} a {brl(u.valorMax)}
                      </span>
                    )}
                    <CelulaVariacao cv={u.variacao} min={u.valorMin} max={u.valorMax} n={u.n - u.semValor} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {l.descricoes.length > 1 && (
            <section className="rounded-card border border-border bg-surface-2 p-[var(--pad-card)]">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">
                Descrições diferentes ({num(l.descricoes.length)}) — o mesmo código com textos distintos
              </h3>
              <ul className="mt-2 space-y-1.5">
                {l.descricoes.map((d, i) => (
                  <li key={d.texto} className="flex items-start gap-2 text-[13px] text-text-2">
                    <ChipVariante n={i + 1} />
                    <span className="min-w-0">
                      {d.texto} <span className="whitespace-nowrap text-[12px] text-muted">· {itens(d.n)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <DataTable
            columns={colunas}
            rows={l.itens}
            getKey={(it) => it.id}
            onRowClick={onAbrirItem}
            minWidth={1000}
            pageSize={20}
            density="compact"
            resumo={(linhas) => `${itens(linhas.length)} · ${brl(linhas.reduce((s, it) => s + (it.valorTotal ?? 0), 0))}`}
          />
        </div>
      )}
    </Modal>
  );
}
