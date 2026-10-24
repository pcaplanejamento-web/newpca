/**
 * LIQUIDAÇÕES da Centi — o núcleo PURO (testado em `tests/liquidacoes.test.ts`). A MESMA lógica dos empenhos (o ano lido
 * semana a semana, o staging, a conferência e a promoção), com as PARTICULARIDADES da API `getliquidacoes`:
 * - exige o ÓRGÃO da Centi (`idOrgao` — o "ID na Centi" cadastrado no órgão): uma importação = um lote por órgão;
 * - NÃO pagina nem informa o total: cada período vem inteiro numa resposta — o total do período é o que veio;
 * - não traz unidade orçamentária nem ação, só o NÚMERO DO EMPENHO: a liquidação só é gravada quando o empenho dela já
 *   está no card (o vínculo é o do empenho); sem ele, nada é guardado.
 */
import { esqueletoResposta, lerJsonCenti, registrosDaResposta } from "./centi-resposta-core.ts";
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

function texto(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/** A CHAVE da liquidação = o Id da Centi (único; o número da liquidação é o da nota e se repete). */
export const chaveLiquidacao = (id: number) => String(id);

/** Um registro do portal → a linha (ou o motivo da recusa: sem Id ou sem o número do empenho, não entra). */
export function linhaLiquidacao(item: Record<string, unknown>, ano: number): { linha: LinhaLiquidacao } | { recusado: string } {
  const id = Number(item.Id);
  if (!Number.isInteger(id) || id <= 0) return { recusado: "sem Id" };
  const numeroEmpenho = texto(item.NumeroEmpenho);
  if (!numeroEmpenho) return { recusado: "sem o número do empenho" };
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
export function corpoLiquidacoes(parametros: string, ano: number, periodo: Periodo, idOrgao: number): Record<string, unknown> {
  return { ...(corpoDaPagina(parametros, ano, 1, periodo) as Record<string, unknown>), idOrgao };
}

/** A CHAVE de busca do empenho de uma liquidação no card: o órgão gestor + o número do empenho. */
export const chaveEmpenhoDaLiquidacao = (orgao: string, numeroEmpenho: string) => `${orgao}\u001f${numeroEmpenho}`;

/** Os ÓRGÃOS da Centi que as liquidações do card pedem: o "ID na Centi" dos órgãos de destino dos vínculos (sem repetir). */
export function orgaosCentiDoCard(destinos: readonly { orgaoId: number }[], idCentiDoOrgao: ReadonlyMap<number, string | null>): { ids: number[]; semId: number[] } {
  const ids = new Set<number>();
  const semId = new Set<number>();
  for (const d of destinos) {
    const n = Number(idCentiDoOrgao.get(d.orgaoId) ?? "");
    if (Number.isInteger(n) && n > 0) ids.add(n);
    else semId.add(d.orgaoId);
  }
  return { ids: [...ids].sort((a, b) => a - b), semId: [...semId] };
}

/** Uma liquidação com valor negativo ou acima disto é SUSPEITA (erro de leitura) — a conclusão não promove o lote. */
export const LIMITE_VALOR_LIQUIDACAO = 1_000_000_000;
