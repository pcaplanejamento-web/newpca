import { brl, num } from "./format.ts";
import { DIMENSOES_VISAO, type DimensaoVisao, type FiltrosVisao, aplicarVisao, valorDimensao } from "./orcamento-visao.ts";
import {
  chaveAcao,
  chaveVinculo,
  mapaVinculos,
  SEM_ACAO,
  unidadeDoLancamento,
  type VinculoOrcamento,
} from "./orcamento-vinculo.ts";
import type { BlocoDoc, LinhaDoc } from "./documento-pdf-core.ts";
import { norm } from "./parse-dfd-comum.ts";

/**
 * RELATÓRIO DA COMPOSIÇÃO DO ORÇAMENTO do PCA × Orçamento — núcleo PURO (sem `getDb`/JSX → testável). Explica, de forma
 * didática, como se chega ao valor de orçamento de CADA unidade cadastrada, em duas etapas que nunca se sobrepõem:
 *   1. a VISÃO do PCA (vale IGUAL para todas as unidades) escolhe quais lançamentos do CUBO entram — por função,
 *      programa, elemento, código, ficha e fonte (`DIMENSOES_VISAO`);
 *   2. os VÍNCULOS dizem a QUAL unidade cadastrada cada lançamento pertence — pela unidade do CUBO e pela AÇÃO
 *      (`unidadeDoLancamento`, a MESMA régua do comparativo).
 * Tudo o que fica de fora também aparece (retirado pela visão; sem vínculo), e as contas fecham:
 * orçamento inteiro = retirado pela visão + atribuído às unidades + sem vínculo. `relatorioOrcamentoPca` calcula;
 * `blocosRelatorioOrcamento` escreve o documento (A4) que o `documento-pdf` desenha.
 */

/** Um lançamento do CUBO com o que o relatório usa (as dimensões da visão + unidade + ação + a dotação inicial). */
export type LancamentoRelatorio = Partial<Record<DimensaoVisao, string | null>> & {
  unidade: string | null;
  acao: string | null;
  valor: number;
};

export type UnidadeCadastro = { id: number; sigla: string; nome: string; orgaoSigla: string | null };

export type EntradaRelatorio = {
  pca: { nome: string; ano: number | null };
  orcamento: { nome: string; ano: number };
  visao: { nome: string; filtros: FiltrosVisao } | null;
  lancamentos: LancamentoRelatorio[];
  vinculos: VinculoOrcamento[];
  unidades: UnidadeCadastro[];
  /** As contratações do PCA por unidade cadastrada (`null` = itens sem unidade). */
  planejado: { unidadeId: number | null; valor: number }[];
};

/** Quantos lançamentos e quanto somam. */
export type Soma = { lancamentos: number; valor: number };

export type ValorDimensao = { texto: string; lancamentos: number; valor: number };
export type DimensaoRelatorio = {
  rotulo: string;
  /** A visão filtra esta dimensão (senão vale "Todos"). */
  filtrada: boolean;
  /** Os valores que ENTRAM (marcados na visão) e os que ficam DE FORA — com o total de cada um no CUBO inteiro. */
  considerados: ValorDimensao[];
  naoConsiderados: ValorDimensao[];
};

export type AcaoRelatorio = { texto: string; lancamentos: number; noCubo: number; naVisao: number };
export type VinculoRelatorio = {
  /** A unidade do CUBO deste vínculo. */
  unidadeCubo: string;
  /** A regra das ações, por extenso. */
  regra: string;
  acoes: AcaoRelatorio[];
  /** Ações da unidade do CUBO deixadas FORA de um vínculo "com as demais" — e para onde foram. */
  fora: { texto: string; destino: string; noCubo: number }[];
};
export type UnidadeRelatorio = {
  id: number;
  sigla: string;
  nome: string;
  orgao: string | null;
  /** O orçamento considerado (na visão) = o número da coluna "Orçamento para o PCA". */
  orcamento: number;
  lancamentos: number;
  noCubo: number;
  planejado: number;
  vinculos: VinculoRelatorio[];
};
export type SemVinculoRelatorio = { unidadeCubo: string; acoes: AcaoRelatorio[]; noCubo: number; naVisao: number };

export type RelatorioOrcamento = {
  pca: { nome: string; ano: number | null };
  orcamento: { nome: string; ano: number };
  visaoNome: string | null;
  totais: { cubo: Soma; foraDaVisao: Soma; naVisao: Soma; nasUnidades: Soma; semVinculo: Soma };
  dimensoes: DimensaoRelatorio[];
  /** O que a visão retirou, por unidade do CUBO. */
  retiradoPorUnidadeCubo: { unidadeCubo: string; lancamentos: number; valor: number }[];
  unidades: UnidadeRelatorio[];
  semVinculo: SemVinculoRelatorio[];
  /** Unidades cadastradas com contratações no PCA e SEM orçamento vinculado. */
  semOrcamento: { sigla: string; nome: string; orgao: string | null; planejado: number }[];
  /** Contratações do PCA sem unidade (não entram em nenhuma linha). */
  planejadoSemUnidade: number;
  /** O que foi e o que NÃO foi DEFINIDO — o painel do início do relatório. */
  definicoes: DefinicoesRelatorio;
};

/** As DEFINIÇÕES do cálculo: as escolhas da visão (por dimensão) e a cobertura dos vínculos (por unidade do CUBO). */
export type DefinicoesRelatorio = {
  /** Cada dimensão da visão: definida (com os valores escolhidos) ou não (entram todos). */
  visao: { rotulo: string; definida: boolean; valores: string[] }[];
  /** Cada unidade do CUBO: quantas ações, quantas têm vínculo, para quais unidades cadastradas e quais ações ficaram sem. */
  unidadesCubo: { unidadeCubo: string; acoes: number; vinculadas: number; destinos: string[]; semVinculo: string[]; valorSemVinculo: number }[];
  /** As unidades cadastradas com contratações no PCA: com ou sem vínculo. */
  unidadesComContratacao: { sigla: string; nome: string; comVinculo: boolean; planejado: number }[];
};

/** A situação de uma unidade do CUBO nos vínculos. */
export function situacaoVinculo(u: { acoes: number; vinculadas: number }): "Vinculada" | "Parcial" | "Sem vínculo" {
  return u.vinculadas === 0 ? "Sem vínculo" : u.vinculadas < u.acoes ? "Parcial" : "Vinculada";
}

const colator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const textoUnidade = (u: string | null) => String(u ?? "").trim() || "(sem unidade no CUBO)";
const soma = (): Soma => ({ lancamentos: 0, valor: 0 });
const somar = (s: Soma, v: number) => {
  s.lancamentos++;
  s.valor += v;
};

/** Calcula o relatório a partir dos MESMOS dados do comparativo (os totais por unidade batem com a tabela). */
export function relatorioOrcamentoPca(e: EntradaRelatorio): RelatorioOrcamento {
  const filtros = e.visao?.filtros ?? {};
  const naVisao = new Set(aplicarVisao(e.lancamentos, filtros));
  const mapa = mapaVinculos(e.vinculos);
  const porId = new Map(e.unidades.map((u) => [u.id, u]));
  const totais = { cubo: soma(), foraDaVisao: soma(), naVisao: soma(), nasUnidades: soma(), semVinculo: soma() };

  // Texto legível de cada ação (o vínculo guarda a chave normalizada).
  const textoAcao = new Map<string, string>();
  const retirado = new Map<string, { unidadeCubo: string; lancamentos: number; valor: number }>();
  // Por unidade cadastrada → por unidade do CUBO (o vínculo) → por ação.
  type Acum = Map<string, AcaoRelatorio>;
  const porUnidade = new Map<number, Map<string, { texto: string; acoes: Acum }>>();
  const semVinc = new Map<string, { texto: string; acoes: Acum }>();
  // Cobertura dos vínculos por unidade do CUBO: cada ação → a unidade cadastrada (ou nenhuma) + a dotação no CUBO.
  const cobertura = new Map<string, { texto: string; acoes: Map<string, { texto: string; alvo: number | null; valor: number }> }>();
  const acumular = (m: Acum, ka: string, texto: string, v: number, entra: boolean) => {
    const a = m.get(ka) ?? { texto, lancamentos: 0, noCubo: 0, naVisao: 0 };
    a.lancamentos++;
    a.noCubo += v;
    if (entra) a.naVisao += v;
    m.set(ka, a);
  };

  for (const l of e.lancamentos) {
    const v = Number(l.valor) || 0;
    const entra = naVisao.has(l);
    const ku = chaveVinculo(l.unidade);
    const ka = chaveAcao(l.acao);
    const ta = l.acao?.trim() || SEM_ACAO;
    if (!textoAcao.has(`${ku}|${ka}`)) textoAcao.set(`${ku}|${ka}`, ta);
    somar(totais.cubo, v);
    const alvo = unidadeDoLancamento(mapa, l.unidade, l.acao);
    const alvoValido = alvo != null && porId.has(alvo) ? alvo : null;
    const cob = cobertura.get(ku) ?? { texto: textoUnidade(l.unidade), acoes: new Map() };
    const ca = cob.acoes.get(ka) ?? { texto: ta, alvo: alvoValido, valor: 0 };
    ca.valor += v;
    cob.acoes.set(ka, ca);
    cobertura.set(ku, cob);
    if (!entra) {
      somar(totais.foraDaVisao, v);
      const r = retirado.get(ku) ?? { unidadeCubo: textoUnidade(l.unidade), lancamentos: 0, valor: 0 };
      r.lancamentos++;
      r.valor += v;
      retirado.set(ku, r);
    } else {
      somar(totais.naVisao, v);
      somar(alvo != null && porId.has(alvo) ? totais.nasUnidades : totais.semVinculo, v);
    }
    if (alvo != null && porId.has(alvo)) {
      const u = porUnidade.get(alvo) ?? new Map();
      const g = u.get(ku) ?? { texto: textoUnidade(l.unidade), acoes: new Map() };
      acumular(g.acoes, ka, ta, v, entra);
      u.set(ku, g);
      porUnidade.set(alvo, u);
    } else {
      const g = semVinc.get(ku) ?? { texto: textoUnidade(l.unidade), acoes: new Map() };
      acumular(g.acoes, ka, ta, v, entra);
      semVinc.set(ku, g);
    }
  }

  const ordenarAcoes = (m: Acum) => [...m.values()].sort((a, b) => colator.compare(a.texto, b.texto));
  const planejadoPor = new Map<number | null, number>();
  for (const p of e.planejado) planejadoPor.set(p.unidadeId, (planejadoPor.get(p.unidadeId) ?? 0) + (Number(p.valor) || 0));

  const comVinculo = new Set(e.vinculos.map((v) => v.alvoId));
  const unidades: UnidadeRelatorio[] = [];
  for (const uid of comVinculo) {
    const u = porId.get(uid);
    if (!u) continue;
    const grupos = porUnidade.get(uid) ?? new Map();
    const vinculos: VinculoRelatorio[] = e.vinculos
      .filter((v) => v.alvoId === uid)
      .map((v) => {
        const g = grupos.get(v.chave);
        const acoes: Acum = new Map(g?.acoes ?? []);
        // Ação escolhida que não tem lançamento neste orçamento: aparece zerada (o vínculo a prevê).
        for (const ka of v.acoes ?? []) if (!acoes.has(ka)) acoes.set(ka, { texto: textoAcao.get(`${v.chave}|${ka}`) ?? ka, lancamentos: 0, noCubo: 0, naVisao: 0 });
        const fora = (v.acoes == null ? v.acoesFora : []).map((ka) => {
          const texto = textoAcao.get(`${v.chave}|${ka}`) ?? ka;
          const outro = e.vinculos.find((x) => x.chave === v.chave && x.alvoId !== uid && x.acoes?.includes(ka));
          const destino = outro ? (porId.get(outro.alvoId)?.sigla ?? "outra unidade") : "sem vínculo (não entra em nenhuma unidade)";
          let noCubo = 0;
          for (const l of e.lancamentos) if (chaveVinculo(l.unidade) === v.chave && chaveAcao(l.acao) === ka) noCubo += Number(l.valor) || 0;
          return { texto, destino, noCubo };
        });
        return {
          unidadeCubo: g?.texto ?? v.texto,
          regra: regraDoVinculo(v),
          acoes: ordenarAcoes(acoes),
          fora: fora.sort((a, b) => colator.compare(a.texto, b.texto)),
        };
      })
      .sort((a, b) => colator.compare(a.unidadeCubo, b.unidadeCubo));
    const todas = vinculos.flatMap((v) => v.acoes);
    unidades.push({
      id: u.id,
      sigla: u.sigla,
      nome: u.nome,
      orgao: u.orgaoSigla,
      orcamento: todas.reduce((s, a) => s + a.naVisao, 0),
      lancamentos: todas.reduce((s, a) => s + a.lancamentos, 0),
      noCubo: todas.reduce((s, a) => s + a.noCubo, 0),
      planejado: planejadoPor.get(uid) ?? 0,
      vinculos,
    });
  }
  unidades.sort((a, b) => colator.compare(a.sigla, b.sigla) || colator.compare(a.nome, b.nome));

  const semVinculo = [...semVinc.values()]
    .map((g) => {
      const acoes = ordenarAcoes(g.acoes);
      return { unidadeCubo: g.texto, acoes, noCubo: acoes.reduce((s, a) => s + a.noCubo, 0), naVisao: acoes.reduce((s, a) => s + a.naVisao, 0) };
    })
    .sort((a, b) => colator.compare(a.unidadeCubo, b.unidadeCubo));

  const semOrcamento = e.unidades
    .filter((u) => !comVinculo.has(u.id) && (planejadoPor.get(u.id) ?? 0) > 0)
    .map((u) => ({ sigla: u.sigla, nome: u.nome, orgao: u.orgaoSigla, planejado: planejadoPor.get(u.id) ?? 0 }))
    .sort((a, b) => colator.compare(a.sigla, b.sigla));

  return {
    pca: e.pca,
    orcamento: e.orcamento,
    visaoNome: e.visao?.nome ?? null,
    totais,
    dimensoes: dimensoesDaVisao(e.lancamentos, filtros),
    retiradoPorUnidadeCubo: [...retirado.values()].sort((a, b) => b.valor - a.valor || colator.compare(a.unidadeCubo, b.unidadeCubo)),
    unidades,
    semVinculo,
    semOrcamento,
    planejadoSemUnidade: planejadoPor.get(null) ?? 0,
    definicoes: {
      visao: DIMENSOES_VISAO.map((d) => ({ rotulo: d.rotulo, definida: (filtros[d.key]?.length ?? 0) > 0, valores: filtros[d.key] ?? [] })),
      unidadesCubo: [...cobertura.values()]
        .map((c) => {
          const acoes = [...c.acoes.values()];
          const sem = acoes.filter((a) => a.alvo == null).sort((a, b) => colator.compare(a.texto, b.texto));
          const destinos = [...new Set(acoes.flatMap((a) => (a.alvo == null ? [] : [porId.get(a.alvo)?.sigla ?? "?"])))].sort(colator.compare);
          return {
            unidadeCubo: c.texto,
            acoes: acoes.length,
            vinculadas: acoes.length - sem.length,
            destinos,
            semVinculo: sem.map((a) => a.texto),
            valorSemVinculo: sem.reduce((s, a) => s + a.valor, 0),
          };
        })
        .sort((a, b) => colator.compare(a.unidadeCubo, b.unidadeCubo)),
      unidadesComContratacao: e.unidades
        .filter((u) => (planejadoPor.get(u.id) ?? 0) > 0)
        .map((u) => ({ sigla: u.sigla, nome: u.nome, comVinculo: comVinculo.has(u.id), planejado: planejadoPor.get(u.id) ?? 0 }))
        .sort((a, b) => Number(a.comVinculo) - Number(b.comVinculo) || colator.compare(a.sigla, b.sigla)),
    },
  };
}

/** A regra das ações de um vínculo, por extenso. */
export function regraDoVinculo(v: Pick<VinculoOrcamento, "acoes" | "acoesFora">): string {
  if (v.acoes != null) return `Só as ações escolhidas (${num(v.acoes.length)})`;
  return v.acoesFora.length
    ? `Todas as demais ações da unidade do CUBO, exceto ${num(v.acoesFora.length)}`
    : "Todas as demais ações da unidade do CUBO (as que não estão em outro vínculo)";
}

/** Por dimensão da visão: os valores que entram e os que ficam de fora (o total de cada valor no CUBO inteiro). */
function dimensoesDaVisao(lancamentos: LancamentoRelatorio[], filtros: FiltrosVisao): DimensaoRelatorio[] {
  return DIMENSOES_VISAO.map((d) => {
    const marcados = new Set((filtros[d.key] ?? []).map(norm));
    const filtrada = marcados.size > 0;
    const valores = new Map<string, ValorDimensao>();
    if (filtrada)
      for (const l of lancamentos) {
        const t = valorDimensao(l, d.key);
        const k = norm(t);
        const x = valores.get(k) ?? { texto: t, lancamentos: 0, valor: 0 };
        x.lancamentos++;
        x.valor += Number(l.valor) || 0;
        valores.set(k, x);
      }
    const todos = [...valores.entries()].sort((a, b) => colator.compare(a[1].texto, b[1].texto));
    // Marcado sem lançamento neste orçamento: entra zerado (a visão o pede).
    for (const v of filtros[d.key] ?? []) if (!valores.has(norm(v))) todos.push([norm(v), { texto: v, lancamentos: 0, valor: 0 }]);
    return {
      rotulo: d.rotulo,
      filtrada,
      considerados: todos.filter(([k]) => marcados.has(k)).map(([, x]) => x),
      naoConsiderados: todos.filter(([k]) => !marcados.has(k)).map(([, x]) => x),
    };
  });
}

/* ------------------------------------------------------------------ o documento ------------------------------------------------------------------ */

const OK = "var(--ok)";
const FORA = "var(--danger)";
const AZUL = "var(--accent)";
const pct = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const qtd = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;

/**
 * O DOCUMENTO (A4) do relatório — didático, na ordem em que o valor é formado: o resumo com a conta que fecha, a ETAPA 1
 * (a visão, igual para todas as unidades), a ETAPA 2 (cada unidade: de qual unidade do CUBO e de quais ações vem o
 * dinheiro, quanto a visão deixou e quanto ficou) e, no fim, TUDO o que não foi considerado.
 */
export function blocosRelatorioOrcamento(r: RelatorioOrcamento): BlocoDoc[] {
  const t = r.totais;
  const b: BlocoDoc[] = [];
  b.push({ tipo: "titulo", texto: "Composição do orçamento por unidade" });
  b.push({
    tipo: "paragrafo",
    cor: "muted",
    texto: `PCA: ${r.pca.nome}${r.pca.ano && !r.pca.nome.includes(String(r.pca.ano)) ? ` (${r.pca.ano})` : ""}  ·  Orçamento: ${r.orcamento.nome}${r.orcamento.nome.includes(String(r.orcamento.ano)) ? "" : ` (${r.orcamento.ano})`}  ·  Visão: ${r.visaoNome ?? "nenhuma (orçamento inteiro)"}`,
  });

  // ---------------------------------------------------------------- Como ler
  blocosDefinicoes(b, r);
  b.push({ tipo: "secao", texto: "Como o valor de cada unidade é calculado" });
  b.push({
    tipo: "paragrafo",
    texto:
      "O orçamento de cada unidade cadastrada é a soma da DOTAÇÃO INICIAL dos lançamentos do CUBO que passam por duas etapas, uma depois da outra:",
  });
  b.push({
    tipo: "lista",
    itens: [
      "Etapa 1 — VISÃO: escolhe quais lançamentos entram, pela função, programa, elemento de despesa, código, ficha e fonte de recurso. Vale IGUAL para todas as unidades.",
      "Etapa 2 — VÍNCULOS: dizem a qual unidade cadastrada cada lançamento pertence, pela unidade do CUBO e pela ação. Cada ação vai para uma única unidade — nada conta duas vezes.",
      "O que a visão retira, ou que não tem vínculo, não entra em nenhuma unidade (veja a parte 3).",
    ],
  });
  b.push({
    tipo: "destaques",
    itens: [
      { rotulo: "Orçamento inteiro (CUBO)", valor: brl(t.cubo.valor), detalhe: qtd(t.cubo.lancamentos, "lançamento", "lançamentos") },
      { rotulo: "Retirado pela visão", valor: brl(t.foraDaVisao.valor), detalhe: qtd(t.foraDaVisao.lancamentos, "lançamento", "lançamentos"), cor: FORA },
      { rotulo: "Atribuído às unidades", valor: brl(t.nasUnidades.valor), detalhe: qtd(t.nasUnidades.lancamentos, "lançamento", "lançamentos"), cor: AZUL },
      { rotulo: "Na visão, sem vínculo", valor: brl(t.semVinculo.valor), detalhe: qtd(t.semVinculo.lancamentos, "lançamento", "lançamentos"), cor: t.semVinculo.valor ? FORA : undefined },
    ],
  });
  b.push({
    tipo: "nota",
    cor: AZUL,
    texto: `A conta fecha: ${brl(t.cubo.valor)} (orçamento inteiro) = ${brl(t.foraDaVisao.valor)} (retirado pela visão) + ${brl(t.nasUnidades.valor)} (atribuído às unidades) + ${brl(t.semVinculo.valor)} (na visão, sem vínculo).`,
  });

  // ---------------------------------------------------------------- Resumo por unidade
  b.push({ tipo: "secao", texto: "Resumo: o orçamento de cada unidade" });
  b.push({
    tipo: "paragrafo",
    texto: "O valor da coluna “Orçamento considerado” é o mesmo da tabela PCA × Orçamento. O detalhe de cada unidade está na parte 2.",
  });
  const totPlan = r.unidades.reduce((s, u) => s + u.planejado, 0);
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Unidade", peso: 5 },
      { titulo: "Órgão", peso: 1.6 },
      { titulo: "Contratações do PCA", peso: 2.2, alinhar: "right" },
      { titulo: "Orçamento considerado", peso: 2.2, alinhar: "right" },
      { titulo: "Diferença", peso: 2.2, alinhar: "right" },
    ],
    linhas: [
      ...r.unidades.map((u): LinhaDoc => {
        const dif = u.orcamento - u.planejado;
        const cor = dif < 0 ? FORA : OK;
        return { celulas: [`${u.sigla} — ${u.nome}`, u.orgao ?? "—", brl(u.planejado), brl(u.orcamento), brl(dif)], cores: [cor, null, cor, AZUL, cor] };
      }),
      {
        celulas: ["Total das unidades com vínculo", "", brl(totPlan), brl(t.nasUnidades.valor), brl(t.nasUnidades.valor - totPlan)],
        destaque: true,
      },
    ],
    vazio: "Nenhuma unidade tem vínculo com o orçamento.",
  });

  // ---------------------------------------------------------------- Etapa 1 — visão
  b.push({ tipo: "secao", texto: "Parte 1 — A visão: o que entra para TODAS as unidades" });
  if (!r.visaoNome) {
    b.push({
      tipo: "nota",
      cor: AZUL,
      texto: "Este PCA não usa visão (Configuração do PCA): todos os lançamentos do orçamento seguem para os vínculos.",
    });
  } else {
    b.push({
      tipo: "paragrafo",
      texto: `Visão escolhida na Configuração do PCA: “${r.visaoNome}”. Um lançamento entra somente se passar em TODAS as dimensões filtradas; numa dimensão sem filtro, todos os valores entram.`,
    });
    b.push({
      tipo: "tabela",
      colunas: [
        { titulo: "Dimensão", peso: 2.2 },
        { titulo: "Regra", peso: 3 },
        { titulo: "Valores que entram", peso: 1.6, alinhar: "right" },
        { titulo: "Valores fora", peso: 1.6, alinhar: "right" },
      ],
      linhas: r.dimensoes.map((d) => ({
        celulas: d.filtrada
          ? [d.rotulo, "Só os valores marcados", num(d.considerados.length), num(d.naoConsiderados.length)]
          : [d.rotulo, "Todos (sem filtro)", "Todos", "—"],
        cores: d.filtrada ? [null, null, OK, d.naoConsiderados.length ? FORA : "var(--muted)"] : [null, "var(--muted)", "var(--muted)", "var(--muted)"],
      })),
    });
    b.push({
      tipo: "destaques",
      itens: [
        { rotulo: "Entram pela visão", valor: brl(t.naVisao.valor), detalhe: `${qtd(t.naVisao.lancamentos, "lançamento", "lançamentos")} · ${pct(t.naVisao.valor, t.cubo.valor)}`, cor: OK },
        { rotulo: "Retirados pela visão", valor: brl(t.foraDaVisao.valor), detalhe: `${qtd(t.foraDaVisao.lancamentos, "lançamento", "lançamentos")} · ${pct(t.foraDaVisao.valor, t.cubo.valor)}`, cor: FORA },
      ],
    });
    for (const d of r.dimensoes.filter((x) => x.filtrada)) {
      b.push({ tipo: "subsecao", texto: d.rotulo, detalhe: `${num(d.considerados.length)} entram · ${num(d.naoConsiderados.length)} fora` });
      b.push({
        tipo: "tabela",
        colunas: [
          { titulo: d.rotulo, peso: 6 },
          { titulo: "Situação", peso: 1.7 },
          { titulo: "Lançamentos no CUBO", peso: 1.6, alinhar: "right" },
          { titulo: "Dotação no CUBO", peso: 2, alinhar: "right" },
        ],
        linhas: [
          ...d.considerados.map((x) => ({ celulas: [x.texto, "Entra", num(x.lancamentos), brl(x.valor)], cores: [null, OK, null, OK] })),
          ...d.naoConsiderados.map((x) => ({ celulas: [x.texto, "Fora", num(x.lancamentos), brl(x.valor)], cores: ["var(--muted)", FORA, "var(--muted)", FORA] })),
        ],
      });
    }
    b.push({
      tipo: "paragrafo",
      cor: "muted",
      texto:
        "Os totais de cada dimensão são do CUBO inteiro, sem as outras dimensões: um lançamento pode estar fora por mais de uma dimensão — por isso esses totais não se somam entre si. O valor exato que entra está nos destaques acima.",
    });
  }

  // ---------------------------------------------------------------- Etapa 2 — vínculos
  b.push({ tipo: "secao", texto: "Parte 2 — Os vínculos: de onde vem o orçamento de cada unidade" });
  b.push({
    tipo: "paragrafo",
    texto:
      "Para cada unidade cadastrada: a unidade do CUBO e as ações que o vínculo atribui a ela. “No CUBO” é o total da ação; “Retirado pela visão” é o que a parte 1 deixou de fora; “Considerado” é o que entra no orçamento da unidade.",
  });
  if (!r.unidades.length) b.push({ tipo: "nota", cor: FORA, texto: "Nenhum vínculo cadastrado — crie os vínculos em Orçamento → Vínculos." });
  for (const u of r.unidades) {
    b.push({
      tipo: "subsecao",
      texto: `${u.sigla} — ${u.nome}${u.orgao ? ` (${u.orgao})` : ""}`,
      detalhe: `Orçamento considerado: ${brl(u.orcamento)}`,
      corDetalhe: AZUL,
    });
    for (const v of u.vinculos) {
      b.push({ tipo: "paragrafo", texto: `Unidade do CUBO: ${v.unidadeCubo}  ·  Regra: ${v.regra}.` });
      const tot = v.acoes.reduce((s, a) => ({ l: s.l + a.lancamentos, c: s.c + a.noCubo, n: s.n + a.naVisao }), { l: 0, c: 0, n: 0 });
      b.push({
        tipo: "tabela",
        colunas: [
          { titulo: "Ação", peso: 6 },
          { titulo: "Lançamentos", peso: 1.9, alinhar: "right" },
          { titulo: "No CUBO", peso: 2, alinhar: "right" },
          { titulo: "Retirado pela visão", peso: 2, alinhar: "right" },
          { titulo: "Considerado", peso: 2, alinhar: "right" },
        ],
        linhas: [
          ...v.acoes.map((a) => ({
            celulas: [a.lancamentos ? a.texto : `${a.texto} (sem lançamento neste orçamento)`, num(a.lancamentos), brl(a.noCubo), brl(a.noCubo - a.naVisao), brl(a.naVisao)],
            cores: [a.naVisao ? null : "var(--muted)", null, null, a.noCubo - a.naVisao ? FORA : "var(--muted)", a.naVisao ? AZUL : "var(--muted)"],
          })),
          { celulas: ["Total deste vínculo", num(tot.l), brl(tot.c), brl(tot.c - tot.n), brl(tot.n)], destaque: true },
        ],
        vazio: "Nenhum lançamento deste vínculo no orçamento.",
      });
      if (v.fora.length)
        b.push({
          tipo: "nota",
          cor: "var(--warn)",
          texto: `Ficam FORA deste vínculo: ${v.fora.map((f) => `${f.texto} (${brl(f.noCubo)} → ${f.destino})`).join("; ")}.`,
        });
    }
  }

  // ---------------------------------------------------------------- O que não foi considerado
  b.push({ tipo: "secao", texto: "Parte 3 — O que NÃO foi considerado" });
  b.push({ tipo: "subsecao", texto: "3.1 Retirado pela visão", detalhe: brl(t.foraDaVisao.valor), corDetalhe: FORA });
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Unidade do CUBO", peso: 6 },
      { titulo: "Lançamentos", peso: 1.9, alinhar: "right" },
      { titulo: "Dotação retirada", peso: 2.2, alinhar: "right" },
    ],
    linhas: r.retiradoPorUnidadeCubo.map((x) => ({ celulas: [x.unidadeCubo, num(x.lancamentos), brl(x.valor)], cores: [null, null, FORA] })),
    vazio: "Nada — a visão não retirou nenhum lançamento.",
  });
  b.push({
    tipo: "subsecao",
    texto: "3.2 Na visão, mas sem vínculo",
    detalhe: brl(t.semVinculo.valor),
    corDetalhe: t.semVinculo.valor ? FORA : undefined,
  });
  b.push({
    tipo: "paragrafo",
    texto: "Lançamentos cuja unidade do CUBO ou ação não tem vínculo: não entram em nenhuma unidade. Para considerá-los, crie o vínculo em Orçamento → Vínculos.",
  });
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Unidade do CUBO", peso: 4 },
      { titulo: "Ação", peso: 4 },
      { titulo: "Lançamentos", peso: 1.9, alinhar: "right" },
      { titulo: "Na visão (não considerado)", peso: 2.2, alinhar: "right" },
    ],
    linhas: r.semVinculo.flatMap((g) =>
      g.acoes.map((a) => ({ celulas: [g.unidadeCubo, a.texto, num(a.lancamentos), brl(a.naVisao)], cores: [null, null, null, a.naVisao ? FORA : "var(--muted)"] })),
    ),
    vazio: "Nada — todos os lançamentos têm vínculo.",
  });
  b.push({ tipo: "subsecao", texto: "3.3 Unidades com contratações e sem orçamento vinculado" });
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Unidade", peso: 6 },
      { titulo: "Órgão", peso: 1.6 },
      { titulo: "Contratações do PCA", peso: 2.2, alinhar: "right" },
    ],
    linhas: r.semOrcamento.map((u) => ({ celulas: [`${u.sigla} — ${u.nome}`, u.orgao ?? "—", brl(u.planejado)], cores: [FORA, null, FORA] })),
    vazio: "Nenhuma — toda unidade com contratações tem vínculo.",
  });
  if (r.planejadoSemUnidade)
    b.push({ tipo: "nota", cor: "var(--warn)", texto: `Há ${brl(r.planejadoSemUnidade)} em contratações do PCA sem unidade definida — não entram em nenhuma linha.` });
  return b;
}

const ATENCAO = "var(--warn)";
const CINZA = "var(--muted)";
const lista = (xs: string[], max = 12) => (xs.length > max ? `${xs.slice(0, max).join("; ")}; +${num(xs.length - max)}` : xs.join("; "));

/**
 * O PAINEL DAS DEFINIÇÕES (o 1º do relatório, separado e visível): o que foi DEFINIDO e o que NÃO foi — na visão (por
 * dimensão: os valores escolhidos, ou "não definida = entram todos") e nos vínculos (por unidade do CUBO: vinculada,
 * parcial ou sem vínculo, com as ações que faltam; e as unidades com contratações sem orçamento vinculado).
 */
function blocosDefinicoes(b: BlocoDoc[], r: RelatorioOrcamento) {
  const d = r.definicoes;
  const dimDef = d.visao.filter((x) => x.definida).length;
  const cubo = d.unidadesCubo;
  const vinc = cubo.filter((u) => situacaoVinculo(u) === "Vinculada").length;
  const parc = cubo.filter((u) => situacaoVinculo(u) === "Parcial").length;
  const sem = cubo.filter((u) => situacaoVinculo(u) === "Sem vínculo").length;
  const contrSem = d.unidadesComContratacao.filter((u) => !u.comVinculo).length;
  b.push({ tipo: "secao", texto: "Definições: o que foi e o que NÃO foi definido" });
  b.push({
    tipo: "destaques",
    itens: [
      { rotulo: "Visão: dimensões definidas", valor: r.visaoNome ? `${num(dimDef)} de ${num(d.visao.length)}` : "Sem visão", detalhe: r.visaoNome ? `as demais: entram todos` : "todo o orçamento entra", cor: AZUL },
      { rotulo: "Unidades do CUBO vinculadas", valor: `${num(vinc)} de ${num(cubo.length)}`, detalhe: "todas as ações com vínculo", cor: OK },
      { rotulo: "Vínculo parcial · sem vínculo", valor: `${num(parc)} · ${num(sem)}`, detalhe: "unidades do CUBO", cor: parc + sem ? ATENCAO : OK },
      { rotulo: "Contratações sem orçamento", valor: num(contrSem), detalhe: `de ${num(d.unidadesComContratacao.length)} unidades com contratações`, cor: contrSem ? FORA : OK },
    ],
  });

  b.push({ tipo: "subsecao", texto: "Na VISÃO (vale para todas as unidades)", detalhe: r.visaoNome ? `Visão “${r.visaoNome}”` : "Nenhuma visão" });
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Dimensão", peso: 2 },
      { titulo: "Situação", peso: 1.8 },
      { titulo: "O que foi escolhido", peso: 7 },
    ],
    linhas: d.visao.map((x) =>
      x.definida
        ? { celulas: [x.rotulo, "Definida", lista(x.valores)], cores: [null, OK, null] }
        : { celulas: [x.rotulo, "Não definida", "Nada escolhido — entram todos os valores"], cores: [null, CINZA, CINZA] },
    ),
  });

  b.push({
    tipo: "subsecao",
    texto: "Nos VÍNCULOS (unidade do CUBO e ações → unidade cadastrada)",
    detalhe: `${qtd(vinc, "vinculada", "vinculadas")} · ${qtd(parc, "parcial", "parciais")} · ${num(sem)} sem vínculo`,
  });
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Unidade do CUBO", peso: 3.6 },
      { titulo: "Situação", peso: 1.5 },
      { titulo: "Ações com vínculo", peso: 1.4, alinhar: "right" },
      { titulo: "Vai para", peso: 1.8 },
      { titulo: "Ações SEM vínculo (não definidas)", peso: 4.2 },
    ],
    linhas: cubo.map((u) => {
      const sit = situacaoVinculo(u);
      const cor = sit === "Vinculada" ? OK : sit === "Parcial" ? ATENCAO : FORA;
      return {
        celulas: [
          u.unidadeCubo,
          sit,
          `${num(u.vinculadas)} de ${num(u.acoes)}`,
          u.destinos.join(", ") || "—",
          u.semVinculo.length === 0
            ? "—"
            : u.vinculadas === 0
              ? `Todas as ${num(u.acoes)} ações (${brl(u.valorSemVinculo)} no CUBO)`
              : `${lista(u.semVinculo, 6)} (${brl(u.valorSemVinculo)} no CUBO)`,
        ],
        cores: [null, cor, cor, null, u.semVinculo.length ? FORA : CINZA],
      };
    }),
    vazio: "Nenhum lançamento no orçamento.",
  });

  b.push({ tipo: "subsecao", texto: "Unidades cadastradas com contratações no PCA", detalhe: `${num(contrSem)} sem orçamento vinculado`, corDetalhe: contrSem ? FORA : OK });
  b.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Unidade", peso: 6 },
      { titulo: "Situação", peso: 2.6 },
      { titulo: "Contratações do PCA", peso: 2.2, alinhar: "right" },
    ],
    linhas: d.unidadesComContratacao.map((u) => ({
      celulas: [`${u.sigla} — ${u.nome}`, u.comVinculo ? "Com vínculo" : "SEM vínculo (sem orçamento)", brl(u.planejado)],
      cores: [null, u.comVinculo ? OK : FORA, null],
    })),
    vazio: "Nenhuma unidade com contratações no PCA.",
  });
  b.push({
    tipo: "nota",
    cor: ATENCAO,
    texto:
      "Legenda: verde = definido; âmbar = definido em parte; vermelho = não definido (o valor não entra em nenhuma unidade); cinza = não definido na visão, por isso entram todos. Ajuste a visão na Configuração do PCA e os vínculos em Orçamento → Vínculos.",
  });
}

