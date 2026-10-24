/**
 * LIQUIDAÇÕES da Centi — o núcleo PURO (testado em `tests/liquidacoes.test.ts`). A MESMA lógica dos empenhos (o ano lido
 * semana a semana, o staging, a conferência e a promoção), com as PARTICULARIDADES da API `getliquidacoes`:
 * - exige o ÓRGÃO da Centi (`idOrgao` — o "ID na Centi" cadastrado no órgão, Órgãos e Unidades): UMA importação lê TODOS
 *   os órgãos com o ID — a lista fica no lote (`orgaosCenti`) e, em cada período, a "página" N é o N-ésimo órgão;
 * - NÃO pagina nem informa o total: cada órgão no período vem inteiro numa resposta — o total é o que veio;
 * - não traz unidade orçamentária nem ação: o NÚMERO DO EMPENHO (`NumeroEmpenho` = o `Numero` do empenho, o Id dele na
 *   Centi) liga a liquidação ao EMPENHO — o órgão e a unidade do cadastro são os dele; sem o empenho no sistema, o órgão
 *   do cadastro com o ID na Centi, sem unidade. O mesmo número ligará os pagamentos.
 */
import { esqueletoResposta, lerJsonCenti, registrosDaResposta, textoCenti } from "./centi-resposta-core.ts";
import { corpoDaPagina, dataIso, type PaginaLida, type Periodo, valor } from "./empenhos-core.ts";

/** O endereço da API de liquidações (no mesmo portal do card — só o endpoint muda). */
export const ENDPOINT_LIQUIDACOES = "getliquidacoes";

export type LinhaLiquidacao = {
  chave: string;
  ano: number;
  srcId: number | null;
  numero: string | null;
  data: string | null;
  numeroEmpenho: string;
  orgao: string;
  credor: string | null;
  cpfCnpj: string | null;
  historico: string | null;
  valor: number;
  valorAnulado: number;
  valorLiquido: number;
  valorPago: number;
  saldo: number;
};

const texto = textoCenti;

/** A CHAVE da liquidação = o Id da Centi (único; o número da liquidação é o da nota e se repete). */
export const chaveLiquidacao = (id: number) => String(id);

/** Um registro do portal → a linha (ou o motivo da recusa: sem o Id da Centi, não entra). O número do empenho é só dado. */
export function linhaLiquidacao(item: Record<string, unknown>, ano: number): { linha: LinhaLiquidacao } | { recusado: string } {
  const id = Number(item.Id);
  if (!Number.isInteger(id) || id <= 0) return { recusado: "sem Id" };
  const numeroEmpenho = texto(item.NumeroEmpenho) ?? "";
  return {
    linha: {
      chave: chaveLiquidacao(id),
      ano,
      srcId: id,
      numero: texto(item.NumeroLiquidacao),
      data: dataIso(item.DataLiquidacao),
      numeroEmpenho,
      orgao: texto(item.Orgao) ?? "",
      credor: texto(item.Credor),
      cpfCnpj: texto(item.CpfCnpjCredor),
      historico: texto(item.Historico),
      valor: valor(item.Valor),
      valorAnulado: valor(item.ValorAnulacao),
      valorLiquido: valor(item.ValorLiquido),
      valorPago: valor(item.ValorPago),
      saldo: valor(item.Saldo),
    },
  };
}

export type PaginaLiquidacoes = Omit<PaginaLida, "linhas"> & { linhas: LinhaLiquidacao[]; orgaos: string[] };

/**
 * Lê a resposta de UM período (JSON). Sem paginação, a resposta É o período inteiro: o total do período = os registros
 * distintos que vieram (+ os recusados) — a conferência do lote fecha quando todos os períodos foram lidos.
 */
export function lerPaginaLiquidacoes(textoResposta: string, ano: number): PaginaLiquidacoes {
  const lido = lerJsonCenti(textoResposta);
  if (!lido.ok) throw new Error(`A resposta da Centi não é JSON (${lido.erro}) — ${esqueletoResposta(textoResposta)}.`);
  const regs = registrosDaResposta(lido.valor);
  if (!regs) throw new Error(`A resposta da Centi não traz uma lista de registros — veio ${esqueletoResposta(textoResposta, lido.valor)}.`);
  const vistas = new Set<string>();
  const linhas: LinhaLiquidacao[] = [];
  const orgaos = new Set<string>();
  let recusados = 0;
  let repetidos = 0;
  for (const r of regs) {
    const l = linhaLiquidacao(r, ano);
    if ("recusado" in l) {
      recusados++;
      continue;
    }
    if (vistas.has(l.linha.chave)) {
      repetidos++;
      continue;
    }
    vistas.add(l.linha.chave);
    if (l.linha.orgao) orgaos.add(l.linha.orgao);
    linhas.push(l.linha);
  }
  const soma = linhas.reduce((t, l) => t + l.valor, 0);
  return { recebidos: regs.length, linhas, recusados, repetidos, total: linhas.length + recusados, soma, reparado: lido.reparado, orgaos: [...orgaos] };
}

/** O corpo do pedido: os parâmetros do card (com o período) + o órgão da Centi. A API não pagina — sempre a 1ª página. */
export function corpoComOrgao(parametros: string, ano: number, periodo: Periodo, idOrgao: number): Record<string, unknown> {
  return { ...(corpoDaPagina(parametros, ano, 1, periodo) as Record<string, unknown>), idOrgao };
}

/** O "ID na Centi" de um órgão do cadastro (texto) como o número do pedido — null = não cadastrado/inválido. */
export function idCenti(v: string | null | undefined): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Os ÓRGÃOS da Centi de uma importação: os "ID na Centi" do cadastro, sem repetir, em ordem crescente. */
export function orgaosDaCenti(cadastro: readonly (string | null | undefined)[]): number[] {
  return [...new Set(cadastro.map(idCenti).filter((n): n is number => n != null))].sort((a, b) => a - b);
}

/** A lista de órgãos gravada no lote (JSON) — inválida = null. */
export function lerOrgaosCenti(v: string | null | undefined): number[] | null {
  if (!v) return null;
  try {
    const l = JSON.parse(v);
    return Array.isArray(l) && l.length && l.every((n) => Number.isInteger(n) && n > 0) ? (l as number[]) : null;
  } catch {
    return null;
  }
}

/** O órgão da Centi da "página" de um lote de liquidações (1 = o 1º) — null = fora da lista. */
export const orgaoDaPagina = (orgaos: readonly number[] | null, pagina: number): number | null => orgaos?.[pagina - 1] ?? null;

/** Uma liquidação com valor negativo ou acima disto é SUSPEITA (erro de leitura) — a conclusão não promove o lote. */
export const LIMITE_VALOR_LIQUIDACAO = 1_000_000_000;
