/**
 * LIQUIDAÇÕES da Centi — o núcleo PURO (testado em `tests/liquidacoes.test.ts`). A MESMA lógica dos empenhos (o ano lido
 * semana a semana, o staging, a conferência e a promoção), com as PARTICULARIDADES da API `getliquidacoes`:
 * - exige o ÓRGÃO da Centi (`idOrgao` — o "ID na Centi" cadastrado no órgão): uma importação = um lote por órgão;
 * - NÃO pagina nem informa o total: cada período vem inteiro numa resposta — o total do período é o que veio;
 * - não traz unidade orçamentária nem ação: TUDO o que a Centi devolve para o órgão é dele — a liquidação é gravada com o
 *   órgão e a unidade do órgão do card (`OrgaoDoCard`), INDEPENDENTE dos empenhos (o número do empenho fica como dado).
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
export function corpoLiquidacoes(parametros: string, ano: number, periodo: Periodo, idOrgao: number): Record<string, unknown> {
  return { ...(corpoDaPagina(parametros, ano, 1, periodo) as Record<string, unknown>), idOrgao };
}

/** Um ÓRGÃO de um card de liquidações: o órgão do cadastro (o "ID na Centi" dele é o `idOrgao` do pedido) e, opcional, a
 * unidade de destino. */
export type OrgaoDoCard = { orgaoId: number; reparticaoId: number | null };

/** O que se pede à Centi por um órgão do card: o `idOrgao` e para onde vão as liquidações dele. */
export type PedidoLiquidacao = { idOrgao: number } & OrgaoDoCard;

/** O "ID na Centi" de um órgão do cadastro (texto) como o número do pedido — null = não cadastrado/inválido. */
export function idCenti(v: string | null | undefined): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Os PEDIDOS do card (um por órgão com o "ID na Centi", na ordem do ID) e os órgãos sem o ID (não são lidos). */
export function pedidosDoCard(orgaos: readonly OrgaoDoCard[], idCentiDoOrgao: ReadonlyMap<number, string | null>): { pedidos: PedidoLiquidacao[]; semId: number[] } {
  const pedidos: PedidoLiquidacao[] = [];
  const semId: number[] = [];
  for (const o of orgaos) {
    const id = idCenti(idCentiDoOrgao.get(o.orgaoId));
    if (id == null) semId.push(o.orgaoId);
    else if (!pedidos.some((p) => p.idOrgao === id)) pedidos.push({ idOrgao: id, ...o });
  }
  return { pedidos: pedidos.sort((a, b) => a.idOrgao - b.idOrgao), semId };
}

export const MAX_ORGAOS_CARD = 100;

/**
 * A REGRA dos órgãos de um card de liquidações (a MESMA na tela e no servidor): cada órgão uma vez, com o "ID na Centi"
 * cadastrado e sem repetir o ID; a unidade de destino tem de ser do próprio órgão. null = vale.
 */
export function motivoOrgaosInvalidos(
  orgaos: readonly OrgaoDoCard[],
  cadastro: { orgaos: ReadonlyMap<number, { nome: string; centi: string | null }>; unidades: ReadonlyMap<number, number | null> },
): string | null {
  if (orgaos.length > MAX_ORGAOS_CARD) return `No máximo ${MAX_ORGAOS_CARD} órgãos por card.`;
  const vistos = new Set<number>();
  const ids = new Map<number, string>();
  for (const o of orgaos) {
    const c = cadastro.orgaos.get(o.orgaoId);
    if (!c) return "Um dos órgãos não existe mais no cadastro.";
    if (vistos.has(o.orgaoId)) return `O órgão ${c.nome} aparece duas vezes.`;
    vistos.add(o.orgaoId);
    const id = idCenti(c.centi);
    if (id == null) return `O órgão ${c.nome} não tem o “ID na Centi” cadastrado (Órgãos e Unidades) — sem ele a Centi não entrega as liquidações.`;
    const outro = ids.get(id);
    if (outro) return `${c.nome} e ${outro} têm o mesmo ID na Centi (${id}).`;
    ids.set(id, c.nome);
    if (o.reparticaoId != null && cadastro.unidades.get(o.reparticaoId) !== o.orgaoId) return `A unidade de destino de ${c.nome} tem de ser uma unidade desse órgão.`;
  }
  return null;
}

/** Uma liquidação com valor negativo ou acima disto é SUSPEITA (erro de leitura) — a conclusão não promove o lote. */
export const LIMITE_VALOR_LIQUIDACAO = 1_000_000_000;

/** Um lote de liquidações do card (a rodada da atualização automática): id (crescente), ano e órgão da Centi. */
export type LoteDaRodada = { id: number; ano: number; idOrgaoCenti: number | null };

/**
 * A RODADA da atualização automática de um card de liquidações: a API pede um órgão por vez, então uma atualização é uma
 * sequência de lotes (um por órgão, na ordem). A rodada começa pelo 1º órgão; enquanto houver órgão do MESMO ano sem lote
 * depois do lote do 1º, a rodada CONTINUA por ele (sem esperar a frequência). null = nenhuma rodada em curso (a próxima
 * começa quando o card estiver na hora).
 */
export function proximoOrgaoDaRodada(lotes: readonly LoteDaRodada[], orgaos: readonly number[]): { ano: number; idOrgao: number } | null {
  if (!orgaos.length) return null;
  const ordem = [...lotes].sort((a, b) => b.id - a.id);
  const inicio = ordem.find((l) => l.idOrgaoCenti === orgaos[0]);
  if (!inicio) return null;
  for (const o of orgaos.slice(1)) {
    const ultimo = ordem.find((l) => l.idOrgaoCenti === o && l.ano === inicio.ano);
    if (!ultimo || ultimo.id < inicio.id) return { ano: inicio.ano, idOrgao: o };
  }
  return null;
}
