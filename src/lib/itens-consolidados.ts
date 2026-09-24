import { ROTULO_CURTO } from "./dfd-tratamento.ts";
import { brl, num, pct } from "./format.ts";
import { normUnidadeMedida } from "./normalize.ts";
import { normalizarCodigo } from "./parse-catalogo-comum.ts";
import { norm } from "./parse-dfd-comum.ts";

/**
 * Visão CONSOLIDADA dos itens da Mesa — PURA (testável). Os itens de MESMO CÓDIGO (só os dígitos — a chave do catálogo)
 * viram UMA linha: quantidade SOMADA, valor unitário MÉDIO PONDERADO pela quantidade (Σ qtd×vu ÷ Σ qtd — a linha fecha:
 * qtd × médio = o total dos itens com preço) e os demais dados (protocolos, DFDs, unidades, descrições…) juntos. Item
 * SEM código não consolida (fica numa linha própria). Roda sobre a lista JÁ filtrada pela hierarquia da Mesa.
 * Extras de planejamento: a VARIAÇÃO dos preços (coeficiente de variação — acima de 25% a amostra deixa de ser
 * homogênea) e a CURVA ABC pelo valor (A = os que somam os primeiros 80% do valor, B = até 95%, C = o resto).
 */

/** O que a consolidação lê de cada item (a linha da visão Itens da Mesa tem estes campos). */
export type ItemConsolidavel = {
  id: number;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};

export type ClasseAbc = "A" | "B" | "C";
/** Fronteiras da curva ABC (participação ACUMULADA no valor): até 80% = A, até 95% = B, o resto = C. */
export const LIMITES_ABC = { A: 0.8, B: 0.95 } as const;

export type NivelVariacao = "ok" | "atencao" | "alerta";
/** Faixas da variação dos preços (coeficiente de variação): até 25% homogêneo; até 50% atenção; acima, alerta. */
export const FAIXAS_VARIACAO = { atencao: 0.25, alerta: 0.5 } as const;

/** Um valor distinto de uma lista (a descrição ou a unidade) e em quantos itens ele aparece. */
export type Ocorrencia = { texto: string; n: number };

export type ItemConsolidado<T extends ItemConsolidavel> = {
  /** Chave estável da linha: `c:<código>` — ou `i:<id>` do item SEM código (que não consolida). */
  chave: string;
  /** O código (só dígitos); `null` = item sem código. */
  codigo: string | null;
  /** Os itens de origem, na ordem da lista. */
  itens: T[];
  /** Descrições distintas (sem diferença de caixa/acento/espaço), a mais frequente primeiro. */
  descricoes: Ocorrencia[];
  /** Unidades de medida distintas (UN = UNIDADE…), a mais frequente primeiro. Mais de uma = a soma mistura unidades. */
  unidades: Ocorrencia[];
  /** Σ das quantidades informadas (`null` = nenhum item tem quantidade). */
  quantidade: number | null;
  /** Itens sem quantidade / sem valor unitário válido (ficam fora da média). */
  semQuantidade: number;
  semValor: number;
  /** Σ dos valores totais dos itens (sem valor = 0) — o MESMO somatório da visão normal. */
  valorTotal: number;
  /** Média PONDERADA pela quantidade dos itens com quantidade e valor unitário (`null` = nenhum). */
  valorMedio: number | null;
  valorMin: number | null;
  valorMax: number | null;
  /** Coeficiente de variação (desvio-padrão amostral ÷ média simples) dos valores unitários — 2+ preços. */
  variacao: number | null;
  /** Participação no valor total da lista (0..1). */
  participacao: number;
  /** Classe da curva ABC (`null` = sem valor). */
  abc: ClasseAbc | null;
};

const preco = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;
const qtdValida = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

/** Valores distintos (não vazios) de uma lista, na ordem em que aparecem — as células "todos juntos". */
export function distintos<T>(itens: readonly T[], valor: (it: T) => string | number | null | undefined): string[] {
  const vistos = new Set<string>();
  for (const it of itens) {
    const v = valor(it);
    const s = v == null ? "" : String(v).trim();
    if (s) vistos.add(s);
  }
  return [...vistos];
}

/** Agrupa textos por uma chave normalizada (o 1º texto de cada grupo representa-o), mais frequentes primeiro. */
function ocorrencias(textos: (string | null)[], chave: (t: string) => string): Ocorrencia[] {
  const grupos = new Map<string, Ocorrencia & { ordem: number }>();
  for (const t of textos) {
    const s = (t ?? "").trim();
    if (!s) continue;
    const k = chave(s);
    const g = grupos.get(k);
    if (g) g.n++;
    else grupos.set(k, { texto: s, n: 1, ordem: grupos.size });
  }
  return [...grupos.values()].sort((a, b) => b.n - a.n || a.ordem - b.ordem).map(({ texto, n }) => ({ texto, n }));
}

/**
 * VARIANTE da descrição de um item entre as distintas da linha (`descricoes`, a MESMA chave sem caixa/acento/espaço):
 * 1 = a mais frequente, 2 = a seguinte…; 0 = sem descrição. O detalhe marca cada ocorrência com "D1", "D2"…
 */
export function varianteDescricao(descricoes: readonly Ocorrencia[]): (descricao: string | null) => number {
  const indice = new Map(descricoes.map((d, i) => [norm(d.texto), i + 1]));
  return (descricao) => {
    const s = (descricao ?? "").trim();
    return s ? (indice.get(norm(s)) ?? 0) : 0;
  };
}

/** Coeficiente de variação (amostral) dos preços; `null` com menos de 2. */
function coeficienteVariacao(precos: number[]): number | null {
  if (precos.length < 2) return null;
  const media = precos.reduce((s, v) => s + v, 0) / precos.length;
  if (media <= 0) return null;
  const variancia = precos.reduce((s, v) => s + (v - media) ** 2, 0) / (precos.length - 1);
  return Math.sqrt(variancia) / media;
}

/**
 * Consolida os itens por CÓDIGO — uma linha por código (item sem código = linha própria), na ordem do VALOR (maior
 * primeiro — a leitura da curva ABC), empate pelo código. Linear no nº de itens.
 */
export function consolidarItens<T extends ItemConsolidavel>(itens: readonly T[]): ItemConsolidado<T>[] {
  const grupos = new Map<string, { codigo: string | null; itens: T[] }>();
  for (const it of itens) {
    const codigo = normalizarCodigo(it.codigo) || null;
    const chave = codigo ? `c:${codigo}` : `i:${it.id}`;
    const g = grupos.get(chave);
    if (g) g.itens.push(it);
    else grupos.set(chave, { codigo, itens: [it] });
  }

  const linhas: ItemConsolidado<T>[] = [];
  let totalGeral = 0;
  for (const [chave, g] of grupos) {
    let quantidade: number | null = null;
    let semQuantidade = 0;
    let semValor = 0;
    let valorTotal = 0;
    let somaPonderada = 0;
    let somaQtdPonderada = 0;
    let valorMin: number | null = null;
    let valorMax: number | null = null;
    const precos: number[] = [];
    for (const it of g.itens) {
      if (it.quantidade != null && Number.isFinite(it.quantidade)) quantidade = (quantidade ?? 0) + it.quantidade;
      else semQuantidade++;
      if (preco(it.valorUnitario)) {
        precos.push(it.valorUnitario);
        // Mín./máx. no próprio laço (nada de `Math.min(...precos)` — o espalhamento estoura com muitos preços).
        if (valorMin == null || it.valorUnitario < valorMin) valorMin = it.valorUnitario;
        if (valorMax == null || it.valorUnitario > valorMax) valorMax = it.valorUnitario;
        if (qtdValida(it.quantidade)) {
          somaPonderada += it.quantidade * it.valorUnitario;
          somaQtdPonderada += it.quantidade;
        }
      } else semValor++;
      if (it.valorTotal != null && Number.isFinite(it.valorTotal)) valorTotal += it.valorTotal;
    }
    totalGeral += valorTotal;
    linhas.push({
      chave,
      codigo: g.codigo,
      itens: g.itens,
      descricoes: ocorrencias(
        g.itens.map((it) => it.descricao),
        (t) => norm(t),
      ),
      unidades: ocorrencias(
        g.itens.map((it) => it.unidade),
        (t) => normUnidadeMedida(t),
      ),
      quantidade,
      semQuantidade,
      semValor,
      valorTotal,
      valorMedio: somaQtdPonderada > 0 ? somaPonderada / somaQtdPonderada : null,
      valorMin,
      valorMax,
      variacao: coeficienteVariacao(precos),
      participacao: 0,
      abc: null,
    });
  }

  linhas.sort((a, b) => b.valorTotal - a.valorTotal || (a.codigo ?? "￿").localeCompare(b.codigo ?? "￿") || a.chave.localeCompare(b.chave));
  // Curva ABC: a participação ACUMULADA ANTES da linha decide a classe (a linha que cruza os 80% ainda é A — o maior
  // valor é sempre A). Sem valor = sem classe.
  let acumulado = 0;
  for (const l of linhas) {
    if (totalGeral <= 0 || l.valorTotal <= 0) continue;
    const antes = acumulado / totalGeral;
    l.participacao = l.valorTotal / totalGeral;
    l.abc = antes < LIMITES_ABC.A ? "A" : antes < LIMITES_ABC.B ? "B" : "C";
    acumulado += l.valorTotal;
  }
  return linhas;
}

/** Nível da variação dos preços (`null` = menos de 2 preços). */
export function nivelVariacao(cv: number | null): NivelVariacao | null {
  if (cv == null) return null;
  return cv > FAIXAS_VARIACAO.alerta ? "alerta" : cv > FAIXAS_VARIACAO.atencao ? "atencao" : "ok";
}

/** Desvio de um valor unitário em relação à média (fração: +0,12 = 12% acima); `null` sem os dois. */
export function desvioDaMedia(valor: number | null | undefined, media: number | null): number | null {
  return preco(valor) && media != null && media > 0 ? valor / media - 1 : null;
}

/** Desvio em texto ("+3,6%", "−1,7%"); o que arredonda a 0 fica "0%" — sem sinal. */
export function desvioTexto(d: number): string {
  if (Math.abs(d) < 0.0005) return "0%";
  return `${d > 0 ? "+" : "−"}${pct(Math.abs(d), 1)}`;
}

/** Participação no valor total em texto — a fatia que arredondaria a "0%" aparece como "< 0,1%" (tem valor). */
export function participacaoTexto(p: number): string {
  return p > 0 && p < 0.0005 ? "< 0,1%" : pct(p, 1);
}

/** Mensagem da célula "Estado" (a MESMA forma de `mensagensItem`). */
export type MensagemEstado = { status: "erro" | "atencao" | "acerto"; chave: string; texto: string; cor?: string; rotulo?: string };

/**
 * ESTADO da linha consolidada: os problemas dos itens de origem AGRUPADOS (o mesmo problema em vários itens vira UMA
 * mensagem com a contagem — "Item sem valor (2)"), erros primeiro e, em cada severidade, o que atinge mais itens. Devolve
 * as mensagens (para `resumoEstado`) e os rótulos curtos SEM contagem (o filtro da coluna acha qualquer problema).
 */
export function estadoConsolidado(porItem: readonly (readonly MensagemEstado[])[]): { mensagens: MensagemEstado[]; rotulos: string[] } {
  const total = porItem.length;
  const grupos = new Map<string, { status: "erro" | "atencao"; chave: string; curto: string; cor?: string; n: number }>();
  for (const msgs of porItem) {
    const vistos = new Set<string>();
    for (const m of msgs) {
      if (m.status === "acerto") continue;
      const curto = m.rotulo ?? ROTULO_CURTO[m.chave] ?? m.texto;
      const k = `${m.status}|${curto}`;
      if (vistos.has(k)) continue; // o mesmo problema 2× no item conta 1 item
      vistos.add(k);
      const g = grupos.get(k);
      if (g) g.n++;
      else grupos.set(k, { status: m.status, chave: m.chave, curto, cor: m.cor, n: 1 });
    }
  }
  const lista = [...grupos.values()].sort((a, b) => (a.status === b.status ? b.n - a.n : a.status === "erro" ? -1 : 1));
  return {
    mensagens: lista.map((g) => ({
      status: g.status,
      chave: g.chave,
      texto: `${g.curto} — ${g.n} de ${total} ${total === 1 ? "item" : "itens"}.`,
      rotulo: g.n > 1 ? `${g.curto} (${g.n})` : g.curto,
      ...(g.cor ? { cor: g.cor } : {}),
    })),
    rotulos: lista.map((g) => g.curto),
  };
}

/** Resumo em TEXTO de uma linha consolidada (o "Copiar resumo" do detalhe) — pronto para colar num despacho/relatório. */
export function textoResumoConsolidado(l: ItemConsolidado<ItemConsolidavel>, origem: { dfds: readonly string[]; protocolos: readonly string[] }): string {
  const unidades = l.unidades.map((u) => u.texto);
  const linhas = [
    `${l.codigo ? `Código ${l.codigo}` : "Item sem código"} — ${l.descricoes[0]?.texto ?? "sem descrição"}${
      l.descricoes.length > 1 ? ` (+${l.descricoes.length - 1} descrição(ões) diferente(s))` : ""
    }`,
    `Quantidade total: ${l.quantidade != null ? num(l.quantidade) : "—"}${unidades.length ? ` ${unidades.join(" + ")}` : ""}${
      unidades.length > 1 ? " (unidades diferentes)" : ""
    }`,
    `Valor unitário médio (ponderado): ${l.valorMedio != null ? brl(l.valorMedio) : "—"}${
      l.valorMin != null && l.valorMax != null && l.valorMin !== l.valorMax ? ` · faixa ${brl(l.valorMin)} a ${brl(l.valorMax)}` : ""
    }${l.variacao != null ? ` · variação ${pct(l.variacao, 1)}` : ""}`,
    `Valor total: ${brl(l.valorTotal)}${l.abc ? ` (${participacaoTexto(l.participacao)} do total · curva ABC: ${l.abc})` : ""}`,
    `Itens: ${num(l.itens.length)} em ${num(origem.dfds.length)} DFD(s)${origem.dfds.length ? ` — ${origem.dfds.join(", ")}` : ""}${
      origem.protocolos.length ? ` · protocolo(s) ${origem.protocolos.join(", ")}` : ""
    }`,
  ];
  return linhas.join("\n");
}
