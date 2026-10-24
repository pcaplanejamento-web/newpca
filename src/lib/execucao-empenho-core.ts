/**
 * A EXECUÇÃO de um EMPENHO — o núcleo PURO (testado em `tests/execucao-empenho.test.ts`): as liquidações e os pagamentos
 * ligados pelo NÚMERO do empenho (o mesmo `Numero` da Centi nas três APIs) e a conferência com os totais que a própria
 * Centi informa no empenho. Medido em 2025: `ValorLiquidado` = Σ (valor − anulado) das liquidações; `ValorPago` = Σ valor
 * (bruto, antes da retenção) dos pagamentos NÃO anulados.
 */

export type LiquidacaoDoEmpenho = {
  id: number;
  chave: string;
  cardId: number;
  ano: number;
  numero: string | null;
  data: string | null;
  valor: number;
  valorAnulado: number;
  valorLiquido: number;
  valorPago: number;
};

export type PagamentoDoEmpenho = {
  id: number;
  chave: string;
  cardId: number;
  ano: number;
  srcId: number | null;
  data: string | null;
  valor: number;
  valorRetencao: number;
  valorLiquido: number;
  anulado: boolean;
};

/** O que a tela recebe: `null` = a pessoa não vê aquela tela (o bloco some). */
export type ExecucaoEmpenho = { liquidacoes: LiquidacaoDoEmpenho[] | null; pagamentos: PagamentoDoEmpenho[] | null; limite: number };

/** O máximo de liquidações e de pagamentos por empenho na tela (acima, a tela avisa que a lista foi cortada). */
export const LIMITE_EXECUCAO = 300;

/** A diferença abaixo de 1 centavo não conta. */
const TOLERANCIA = 0.005;
const centavos = (n: number) => Math.round(n * 100) / 100;

export type ConferenciaValor = { soma: number; centi: number; diferenca: number; confere: boolean };

const conferir = (soma: number, centi: number): ConferenciaValor => {
  const s = centavos(soma);
  const c = centavos(centi);
  return { soma: s, centi: c, diferenca: centavos(s - c), confere: Math.abs(s - c) < TOLERANCIA };
};

/** A conferência: Σ das liquidações × liquidado e Σ dos pagamentos × pago (cada uma só quando a pessoa vê a lista). */
export function conferirExecucao(
  empenho: { valorLiquidado: number; valorPago: number },
  exec: Pick<ExecucaoEmpenho, "liquidacoes" | "pagamentos">,
): { liquidado: ConferenciaValor | null; pago: ConferenciaValor | null } {
  return {
    liquidado: exec.liquidacoes ? conferir(exec.liquidacoes.reduce((t, l) => t + l.valor - l.valorAnulado, 0), empenho.valorLiquidado) : null,
    pago: exec.pagamentos ? conferir(exec.pagamentos.reduce((t, p) => t + (p.anulado ? 0 : p.valor), 0), empenho.valorPago) : null,
  };
}

/**
 * A liquidação PROVÁVEL de cada pagamento (não gravada — só mostrada): a do mesmo empenho cujo valor líquido de anulação é
 * IGUAL ao valor do pagamento, na ordem das datas, cada liquidação uma vez. Sem par = sem liquidação apontada.
 */
export function liquidacaoProvavel(liqs: readonly LiquidacaoDoEmpenho[], pags: readonly PagamentoDoEmpenho[]): Map<number, LiquidacaoDoEmpenho> {
  const porData = <T extends { data: string | null; id: number }>(a: T, b: T) => (a.data ?? "").localeCompare(b.data ?? "") || a.id - b.id;
  const livres = [...liqs].sort(porData);
  const usadas = new Set<number>();
  const r = new Map<number, LiquidacaoDoEmpenho>();
  for (const p of [...pags].filter((x) => !x.anulado).sort(porData)) {
    const l = livres.find((x) => !usadas.has(x.id) && Math.abs(centavos(x.valor - x.valorAnulado) - centavos(p.valor)) < TOLERANCIA && (x.data ?? "") <= (p.data ?? "9999"));
    if (l) {
      usadas.add(l.id);
      r.set(p.id, l);
    }
  }
  return r;
}

/** O mesmo registro em dois cards (a mesma chave da Centi) aparece UMA vez — o do card mais antigo (a lista vem nessa ordem). */
export function semRepetir<T extends { chave: string }>(l: readonly T[]): T[] {
  const vistos = new Set<string>();
  return l.filter((x) => {
    if (vistos.has(x.chave)) return false;
    vistos.add(x.chave);
    return true;
  });
}
