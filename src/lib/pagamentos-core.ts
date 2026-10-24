/**
 * PAGAMENTOS da Centi (ordens de pagamento) — o núcleo PURO (testado em `tests/pagamentos.test.ts`). A MESMA lógica das
 * LIQUIDAÇÕES (`liquidacoes-core.ts` — todos os órgãos com o "ID na Centi" numa importação, lidos em paralelo; o staging,
 * a conferência em tempo real e a promoção), com as PARTICULARIDADES da API `GetOrdempaPamento`:
 * - exige o ANO (número) e o ÓRGÃO da Centi (`idOrgao`); o recorte é o MÊS (`mes`) — sem ele, a Centi devolve o ano inteiro
 *   do órgão de uma vez (~10 MB); datas e páginas são ignoradas. O ano é lido MÊS A MÊS (o mês não se divide);
 * - NÃO pagina nem informa o total: o total do mês é o que veio;
 * - não traz unidade nem ação: o NÚMERO DO EMPENHO (`IdNotaEmpenho` = o `Numero` do empenho, o Id dele na Centi — o mesmo
 *   `NumeroEmpenho` das liquidações) liga o pagamento ao EMPENHO — o órgão e a unidade do cadastro são os dele; sem o empenho
 *   no sistema, o órgão do cadastro com o ID na Centi, sem unidade.
 */
import { esqueletoResposta, lerJsonCenti, lerParametros, montarCorpo, registrosDaResposta, textoCenti } from "./centi-resposta-core.ts";
import { dataIso, type PaginaLida, type Periodo, valor } from "./empenhos-core.ts";

/** O endereço da API de pagamentos (no mesmo portal do card — só o endpoint muda). */
export const ENDPOINT_PAGAMENTOS = "GetOrdempaPamento";

export type LinhaPagamento = {
  chave: string;
  ano: number;
  srcId: number | null;
  data: string | null;
  numeroEmpenho: string;
  orgao: string;
  credor: string | null;
  cpfCnpj: string | null;
  historico: string | null;
  /** O valor do documento (a ordem de pagamento, antes das retenções). */
  valor: number;
  valorRetencao: number;
  valorLiquido: number;
  /** 1 = a ordem tem anulação (fica guardada, fora das somas do pago). */
  anulado: number;
  motivoAnulacao: string | null;
};

const texto = textoCenti;

/** A CHAVE do pagamento = o Id da ordem de pagamento na Centi (único). */
export const chavePagamento = (id: number) => String(id);

/** Um registro do portal → a linha (ou o motivo da recusa: sem o Id da ordem, não entra). */
export function linhaPagamento(item: Record<string, unknown>, ano: number): { linha: LinhaPagamento } | { recusado: string } {
  const id = Number(item.IdOrdemPagamento);
  if (!Number.isInteger(id) || id <= 0) return { recusado: "sem Id" };
  const anulado = item.PossuiAnulacao === true || String(item.PossuiAnulacao).toLowerCase() === "true";
  return {
    linha: {
      chave: chavePagamento(id),
      ano,
      srcId: id,
      data: dataIso(item.DataOrdemPagamento),
      numeroEmpenho: texto(item.IdNotaEmpenho) ?? "",
      orgao: texto(item.Orgao) ?? "",
      credor: texto(item.NomeCredor),
      cpfCnpj: texto(item.CpfCnpjCredor),
      historico: texto(item.Historico),
      valor: valor(item.ValorDocumento),
      valorRetencao: valor(item.ValorRetencao),
      valorLiquido: valor(item.ValorLiquido),
      anulado: anulado ? 1 : 0,
      motivoAnulacao: anulado ? texto(item.MotivoAnulacao) : null,
    },
  };
}

export type PaginaPagamentos = Omit<PaginaLida, "linhas"> & { linhas: LinhaPagamento[]; orgaos: string[] };

/**
 * Lê a resposta de UM mês de UM órgão (JSON). Sem paginação, a resposta É o mês inteiro: o total = os registros distintos
 * que vieram (+ os recusados). A SOMA = o pago líquido das ordens não anuladas.
 */
export function lerPaginaPagamentos(textoResposta: string, ano: number): PaginaPagamentos {
  const lido = lerJsonCenti(textoResposta);
  if (!lido.ok) throw new Error(`A resposta da Centi não é JSON (${lido.erro}) — ${esqueletoResposta(textoResposta)}.`);
  const regs = registrosDaResposta(lido.valor);
  if (!regs) throw new Error(`A resposta da Centi não traz uma lista de registros — veio ${esqueletoResposta(textoResposta, lido.valor)}.`);
  const vistas = new Set<string>();
  const linhas: LinhaPagamento[] = [];
  const orgaos = new Set<string>();
  let recusados = 0;
  let repetidos = 0;
  for (const r of regs) {
    const l = linhaPagamento(r, ano);
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
  const soma = linhas.reduce((t, l) => t + (l.anulado ? 0 : l.valorLiquido), 0);
  return { recebidos: regs.length, linhas, recusados, repetidos, total: linhas.length + recusados, soma, reparado: lido.reparado, orgaos: [...orgaos] };
}

const ULTIMO_DIA = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** O MÊS de um período que é exatamente um mês inteiro (1–12) — senão null (os pagamentos só se pedem por mês). */
export function mesDoPeriodo(p: Periodo): number | null {
  const m = p.inicio.match(/^(\d{4})-(\d{2})-01$/);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  return p.fim === `${m[1]}-${m[2]}-${String(ULTIMO_DIA(ano, mes)).padStart(2, "0")}` ? mes : null;
}

/** O período de um mês do ano. */
export function periodoDoMes(ano: number, mes: number): Periodo {
  const m = String(mes).padStart(2, "0");
  return { inicio: `${ano}-${m}-01`, fim: `${ano}-${m}-${String(ULTIMO_DIA(ano, mes)).padStart(2, "0")}` };
}

/**
 * O corpo do pedido: os parâmetros do card (com o ano) + o ANO e o MÊS como números e o órgão da Centi — sempre, mesmo que
 * os parâmetros não tragam (sem o mês, a Centi devolveria o ano inteiro). A API não pagina.
 */
export function corpoPagamentos(parametros: string, ano: number, periodo: Periodo, idOrgao: number): Record<string, unknown> {
  const mes = mesDoPeriodo(periodo);
  if (mes == null) throw new Error("Os pagamentos só se pedem por mês inteiro.");
  const p = lerParametros(parametros);
  if (!p.ok) throw new Error(p.motivo);
  const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const base = montarCorpo(p.valor, { ano, pagina: 1, inicio: br(periodo.inicio), fim: br(periodo.fim) }) as Record<string, unknown>;
  return { ...base, ano, mes, idOrgao };
}

/** Um pagamento com valor negativo ou acima disto é SUSPEITO (erro de leitura) — a conclusão não promove o lote. */
export const LIMITE_VALOR_PAGAMENTO = 1_000_000_000;
