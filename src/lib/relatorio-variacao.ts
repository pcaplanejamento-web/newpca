import type { BlocoDoc, LinhaDoc } from "./documento-pdf-core.ts";
import { brl, num, pct } from "./format.ts";
import type { ReferenciaHistorico } from "./historico-compra-core.ts";
import {
  desvioDaMedia,
  desvioTexto,
  FAIXAS_VARIACAO,
  type ItemConsolidado,
  type ItemConsolidavel,
  mediaDeReferencia,
  type NivelVariacao,
  nivelVariacao,
} from "./itens-consolidados.ts";
import { normUnidadeMedida } from "./normalize.ts";
import { normalizarCodigo } from "./parse-catalogo-comum.ts";
import { refDfd } from "./parse-dfd-comum.ts";

/**
 * RELATÓRIO DE VARIAÇÃO da visão Consolidada dos itens da Mesa — PURO (testável). Sobre as linhas JÁ consolidadas
 * (as mesmas da tabela), aponta os ITENS INFLADOS — o valor unitário acima da REFERÊNCIA do código (a média ponderada
 * da MESMA unidade; com histórico de compra, a menor entre ela e o valor atual do histórico) além da faixa de atenção
 * (25%) — com o VALOR SUGERIDO (a referência) e o IMPACTO do reajuste ((vu − referência) × qtd). Nada é consultado: os
 * dados são os da tela.
 */

/** O que o relatório lê de cada item (a linha da visão Itens da Mesa tem estes campos). */
export type ItemVariacao = ItemConsolidavel & {
  dfdNumero: string;
  dfdPlanejamento: string | null;
  protocoloNumero: string | null;
  sigla: string | null;
  item: number | null;
};

export type ItemInflado = {
  chave: string;
  codigo: string | null;
  descricao: string;
  dfd: string;
  protocolo: string;
  sigla: string;
  item: number | null;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  referencia: number;
  /** De onde veio a referência. */
  base: "media" | "historico";
  desvio: number;
  nivel: Exclude<NivelVariacao, "ok">;
  impacto: number;
};

export type UnidadeVariacao = { texto: string; itens: number; menor: number | null; mediana: number | null; medio: number | null; maior: number | null; variacao: number | null };

export type CodigoVariacao = {
  chave: string;
  codigo: string | null;
  descricao: string;
  unidades: string;
  itens: number;
  dfds: number;
  protocolos: number;
  menor: number | null;
  mediana: number | null;
  medio: number | null;
  maior: number | null;
  /** Maior ÷ menor (`null` = menos de 2 preços). */
  amplitude: number | null;
  variacao: number | null;
  nivel: NivelVariacao | null;
  abc: string | null;
  valorTotal: number;
  historico: number | null;
  unidadesMistas: boolean;
  porUnidade: UnidadeVariacao[];
  /** Itens fora da média (sem quantidade OU sem valor unitário). */
  foraDaMedia: number;
  inflados: number;
  impacto: number;
};

export type ResumoVariacao = {
  codigos: number;
  alerta: number;
  atencao: number;
  semComparacao: number;
  mistas: number;
  itens: number;
  inflados: number;
  impacto: number;
  valorTotal: number;
};

export type RelatorioVariacao = { resumo: ResumoVariacao; codigos: CodigoVariacao[]; inflados: ItemInflado[] };

const valido = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

/** Mediana de uma lista (`null` = vazia). */
export function mediana(v: readonly number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function precos(itens: readonly ItemConsolidavel[]): number[] {
  return itens.map((i) => i.valorUnitario).filter(valido);
}

/** A referência de preço de UM item: a média da mesma unidade; com histórico, a menor entre ela e o valor atual. */
export function referenciaDoItem(
  l: ItemConsolidado<ItemConsolidavel>,
  unidade: string | null,
  hist: ReferenciaHistorico | null | undefined,
): { valor: number; base: "media" | "historico" } | null {
  const media = mediaDeReferencia(l, unidade);
  const h = !l.unidadesMistas && hist && valido(hist.atual) ? hist.atual : null;
  if (valido(media) && (h == null || media <= h)) return { valor: media, base: "media" };
  if (h != null) return { valor: h, base: "historico" };
  return null;
}

export function relatorioVariacao<T extends ItemVariacao>(
  linhas: readonly ItemConsolidado<T>[],
  historico?: Record<string, ReferenciaHistorico> | null,
): RelatorioVariacao {
  const codigos: CodigoVariacao[] = [];
  const inflados: ItemInflado[] = [];
  for (const l of linhas) {
    const hist = l.codigo ? (historico?.[normalizarCodigo(l.codigo)] ?? null) : null;
    const desc = l.descricoes[0]?.texto ?? "";
    let nInfl = 0;
    let impacto = 0;
    for (const it of l.itens) {
      if (!valido(it.valorUnitario) || !valido(it.quantidade)) continue;
      const ref = referenciaDoItem(l, it.unidade, hist);
      if (!ref) continue;
      const d = desvioDaMedia(it.valorUnitario, ref.valor);
      if (d == null || d <= FAIXAS_VARIACAO.atencao) continue;
      const imp = (it.valorUnitario - ref.valor) * it.quantidade;
      nInfl++;
      impacto += imp;
      inflados.push({
        chave: `${l.chave}:${it.id}`,
        codigo: l.codigo,
        descricao: (it.descricao ?? desc).trim(),
        dfd: refDfd(it.dfdNumero, it.dfdPlanejamento),
        protocolo: it.protocoloNumero ?? "—",
        sigla: it.sigla ?? "—",
        item: it.item,
        unidade: (it.unidade ?? "").trim() || "—",
        quantidade: it.quantidade,
        valorUnitario: it.valorUnitario,
        referencia: ref.valor,
        base: ref.base,
        desvio: d,
        nivel: d > FAIXAS_VARIACAO.alerta ? "alerta" : "atencao",
        impacto: imp,
      });
    }
    const p = precos(l.itens);
    const porUnidade: UnidadeVariacao[] = l.unidadesMistas
      ? l.porUnidade.map((u) => {
          const pu = precos(l.itens.filter((it) => (it.unidade ?? "").trim() !== "" && normUnidadeMedida((it.unidade ?? "").trim()) === u.chave));
          return { texto: u.texto, itens: u.n, menor: u.valorMin, mediana: mediana(pu), medio: u.valorMedio, maior: u.valorMax, variacao: u.variacao };
        })
      : [];
    codigos.push({
      chave: l.chave,
      codigo: l.codigo,
      descricao: desc,
      unidades: l.unidades.map((u) => u.texto).join(", ") || "—",
      itens: l.itens.length,
      dfds: new Set(l.itens.map((i) => i.dfdNumero)).size,
      protocolos: new Set(l.itens.map((i) => i.protocoloNumero).filter(Boolean)).size,
      menor: l.valorMin,
      mediana: mediana(p),
      medio: l.valorMedio,
      maior: l.valorMax,
      amplitude: valido(l.valorMin) && valido(l.valorMax) && p.length >= 2 ? l.valorMax / l.valorMin : null,
      variacao: l.variacao,
      nivel: nivelVariacao(l.variacao),
      abc: l.abc,
      valorTotal: l.valorTotal,
      historico: hist && valido(hist.atual) ? hist.atual : null,
      unidadesMistas: l.unidadesMistas,
      porUnidade,
      foraDaMedia: l.foraDaMedia,
      inflados: nInfl,
      impacto,
    });
  }
  const peso = (n: NivelVariacao | null) => (n === "alerta" ? 3 : n === "atencao" ? 2 : n === "ok" ? 1 : 0);
  codigos.sort((a, b) => b.impacto - a.impacto || peso(b.nivel) - peso(a.nivel) || (b.variacao ?? -1) - (a.variacao ?? -1) || b.valorTotal - a.valorTotal);
  inflados.sort((a, b) => b.impacto - a.impacto || b.desvio - a.desvio);
  const resumo: ResumoVariacao = {
    codigos: codigos.length,
    alerta: codigos.filter((c) => c.nivel === "alerta").length,
    atencao: codigos.filter((c) => c.nivel === "atencao").length,
    semComparacao: codigos.filter((c) => c.nivel == null).length,
    mistas: codigos.filter((c) => c.unidadesMistas).length,
    itens: codigos.reduce((s, c) => s + c.itens, 0),
    inflados: inflados.length,
    impacto: inflados.reduce((s, i) => s + i.impacto, 0),
    valorTotal: codigos.reduce((s, c) => s + c.valorTotal, 0),
  };
  return { resumo, codigos, inflados };
}

const COR = { alerta: "var(--danger)", atencao: "var(--warn)", ok: "var(--ok)" } as const;
const cv = (v: number | null) => (v == null ? "—" : pct(v, 1));
const r$ = (v: number | null) => (v == null ? "—" : brl(v));

export type OpcoesBlocos = { soInflados?: boolean };

export function blocosRelatorioVariacao(rel: RelatorioVariacao, opcoes: OpcoesBlocos = {}): BlocoDoc[] {
  const { resumo: s } = rel;
  const blocos: BlocoDoc[] = [
    { tipo: "titulo", texto: "Relatório de variação dos preços" },
    {
      tipo: "paragrafo",
      texto:
        "Cada código reúne os itens de MESMO código dos DFDs. A VARIAÇÃO é o coeficiente de variação dos valores unitários (até 25% = homogêneo; de 25% a 50% = atenção; acima de 50% = alta). A REFERÊNCIA de cada item é o valor médio ponderado da MESMA medida; quando há histórico de compra, vale o menor entre ele e o valor atual do histórico. Um item é apontado para REAJUSTE quando o valor unitário passa da referência em mais de 25%; o VALOR SUGERIDO é a referência e o IMPACTO é a diferença multiplicada pela quantidade.",
      cor: "muted",
    },
    { tipo: "secao", texto: "Resumo" },
    {
      tipo: "destaques",
      itens: [
        { rotulo: "Códigos analisados", valor: num(s.codigos), detalhe: `${num(s.itens)} itens` },
        { rotulo: "Variação alta", valor: num(s.alerta), cor: COR.alerta, detalhe: "acima de 50%" },
        { rotulo: "Em atenção", valor: num(s.atencao), cor: COR.atencao, detalhe: "de 25% a 50%" },
        { rotulo: "Itens a reajustar", valor: num(s.inflados), cor: s.inflados ? COR.alerta : COR.ok },
        { rotulo: "Impacto estimado do reajuste", valor: brl(s.impacto), cor: s.impacto ? COR.alerta : COR.ok, detalhe: s.valorTotal ? `${pct(s.impacto, s.valorTotal)} do valor` : undefined },
        { rotulo: "Valor total", valor: brl(s.valorTotal), detalhe: `${num(s.semComparacao)} sem comparação · ${num(s.mistas)} com unidades diferentes` },
      ],
    },
    { tipo: "secao", texto: `Itens a reajustar (${num(rel.inflados.length)})` },
  ];
  const linhasInfl: LinhaDoc[] = rel.inflados.map((i) => ({
    celulas: [
      i.codigo ?? "—",
      i.descricao,
      i.dfd,
      i.protocolo,
      i.sigla,
      i.unidade,
      num(i.quantidade),
      brl(i.valorUnitario),
      `${brl(i.referencia)}${i.base === "historico" ? " (hist.)" : ""}`,
      desvioTexto(i.desvio),
      brl(i.impacto),
    ],
    cores: [null, null, null, null, null, null, null, COR[i.nivel], null, COR[i.nivel], COR[i.nivel]],
  }));
  if (linhasInfl.length) {
    linhasInfl.push({ celulas: ["TOTAL", "", "", "", "", "", "", "", "", "", brl(s.impacto)], destaque: true });
  }
  blocos.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Código", peso: 1.1 },
      { titulo: "Descrição", peso: 3 },
      { titulo: "DFD", peso: 1.3 },
      { titulo: "Protocolo", peso: 1 },
      { titulo: "Sigla", peso: 0.8 },
      { titulo: "Medida", peso: 0.8 },
      { titulo: "Qtd.", peso: 0.8, alinhar: "right" },
      { titulo: "Vlr. unit.", peso: 1.1, alinhar: "right" },
      { titulo: "Sugerido", peso: 1.2, alinhar: "right" },
      { titulo: "Desvio", peso: 0.8, alinhar: "right" },
      { titulo: "Impacto", peso: 1.2, alinhar: "right" },
    ],
    linhas: linhasInfl,
    vazio: "Nenhum item acima da referência em mais de 25%.",
  });
  if (opcoes.soInflados) return blocos;

  const comparaveis = rel.codigos.filter((c) => c.nivel != null);
  const linhasCod: LinhaDoc[] = [];
  for (const c of comparaveis) {
    linhasCod.push({
      celulas: [c.codigo ?? "—", c.descricao, c.unidades, num(c.itens), r$(c.menor), r$(c.mediana), r$(c.medio), r$(c.maior), cv(c.variacao), c.abc ?? "—", r$(c.historico), c.impacto ? brl(c.impacto) : "—"],
      cores: [null, null, null, null, null, null, null, null, c.nivel ? COR[c.nivel] : null, null, null, c.impacto ? COR.alerta : null],
    });
    for (const u of c.porUnidade) {
      const n = nivelVariacao(u.variacao);
      linhasCod.push({
        celulas: ["", "", u.texto, num(u.itens), r$(u.menor), r$(u.mediana), r$(u.medio), r$(u.maior), cv(u.variacao), "", "", ""],
        cores: [null, null, null, null, null, null, null, null, n ? COR[n] : null],
        continua: 2,
      });
    }
  }
  blocos.push(
    { tipo: "secao", texto: `Variação por código (${num(comparaveis.length)})` },
    {
      tipo: "tabela",
      colunas: [
        { titulo: "Código", peso: 1.1 },
        { titulo: "Descrição", peso: 2.6 },
        { titulo: "Medida", peso: 1 },
        { titulo: "Itens", peso: 0.6, alinhar: "right" },
        { titulo: "Menor", peso: 1, alinhar: "right" },
        { titulo: "Mediana", peso: 1, alinhar: "right" },
        { titulo: "Médio", peso: 1, alinhar: "right" },
        { titulo: "Maior", peso: 1, alinhar: "right" },
        { titulo: "Variação", peso: 0.8, alinhar: "right" },
        { titulo: "ABC", peso: 0.5 },
        { titulo: "Histórico", peso: 1, alinhar: "right" },
        { titulo: "Impacto", peso: 1.1, alinhar: "right" },
      ],
      linhas: linhasCod,
      vazio: "Nenhum código com dois ou mais preços para comparar.",
    },
  );

  const sem = rel.codigos.filter((c) => c.nivel == null || c.foraDaMedia > 0);
  blocos.push(
    { tipo: "secao", texto: `Sem comparação ou com itens fora da média (${num(sem.length)})` },
    { tipo: "paragrafo", texto: "Códigos com um único preço (sem o que comparar) e itens sem quantidade ou sem valor unitário — esses ficam fora da média e precisam ser completados antes da conferência.", cor: "muted" },
    {
      tipo: "tabela",
      colunas: [
        { titulo: "Código", peso: 1.1 },
        { titulo: "Descrição", peso: 3 },
        { titulo: "Itens", peso: 0.7, alinhar: "right" },
        { titulo: "Fora da média", peso: 1, alinhar: "right" },
        { titulo: "Valor unit.", peso: 1.1, alinhar: "right" },
        { titulo: "Situação", peso: 1.6 },
      ],
      linhas: sem.map((c) => ({
        celulas: [c.codigo ?? "—", c.descricao, num(c.itens), num(c.foraDaMedia), r$(c.medio), c.nivel == null ? "Um preço só — sem comparação" : "Itens sem quantidade ou valor"],
        cores: [null, null, null, c.foraDaMedia ? COR.atencao : null],
      })),
      vazio: "Todos os códigos têm preços comparáveis.",
    },
  );
  return blocos;
}

/** O relatório só com as linhas consolidadas `chaves` (o resumo é recalculado). */
export function recortarVariacao<T extends ItemVariacao>(
  linhas: readonly ItemConsolidado<T>[],
  chaves: readonly string[],
  historico?: Record<string, ReferenciaHistorico> | null,
): RelatorioVariacao {
  const s = new Set(chaves);
  return relatorioVariacao(
    linhas.filter((l) => s.has(l.chave)),
    historico,
  );
}

/** Divide os itens por SIGLA da unidade (um relatório por unidade): cada linha consolidada fica só com os itens dela. */
export function porSigla<T extends ItemVariacao>(linhas: readonly ItemConsolidado<T>[], consolidar: (itens: T[]) => ItemConsolidado<T>[]): { sigla: string; linhas: ItemConsolidado<T>[] }[] {
  const grupos = new Map<string, T[]>();
  for (const l of linhas)
    for (const it of l.itens) {
      const k = it.sigla?.trim() || "Sem unidade";
      const g = grupos.get(k);
      if (g) g.push(it);
      else grupos.set(k, [it]);
    }
  return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([sigla, itens]) => ({ sigla, linhas: consolidar(itens) }));
}
