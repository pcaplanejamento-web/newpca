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

/** A linha da execução aberta no painel ao lado do empenho (a liquidação ou o pagamento). */
export type AbertoExecucao = { tipo: "liquidacao"; item: LiquidacaoDoEmpenho } | { tipo: "pagamento"; item: PagamentoDoEmpenho };

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

/**
 * O TIPO de uma liquidação ou de um pagamento pelo ANO do empenho ligado pelo número × o ano do próprio registro (o da data;
 * sem data, o ano da importação):
 * - mesmo ano = **Nota de Empenho**; empenho de ano anterior = **Restos a Pagar**;
 * - o número veio, mas o empenho não está no sistema = **Restos a Pagar** presumido (o sistema traz os empenhos dos anos
 *   importados; o que falta é de ano anterior a eles);
 * - ERRO: sem número de empenho, ou empenho de ano POSTERIOR ao registro (não existe execução antes do empenho).
 */
export type TipoExecucao = { tipo: "ne" | "rp" | "erro"; presumido: boolean; motivo: string };

export const ROTULO_TIPO_EXECUCAO: Record<TipoExecucao["tipo"], string> = { ne: "Nota de Empenho", rp: "Restos a Pagar", erro: "Erro" };

/** O rótulo da célula e do filtro: o tipo; no erro, o motivo curto. */
export const rotuloTipoExecucao = (t: TipoExecucao): string => (t.tipo === "erro" ? t.motivo : ROTULO_TIPO_EXECUCAO[t.tipo]);

export const MOTIVO_SEM_NUMERO = "Sem número de empenho";
export const MOTIVO_EMPENHO_POSTERIOR = "Empenho de ano posterior";

/** O ano do registro: o da data (AAAA-…); sem ela, o da importação. */
export function anoDoRegistro(data: string | null | undefined, anoImportacao: number | null | undefined): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(data ?? "");
  if (m) return Number(m[1]);
  return Number.isInteger(anoImportacao) ? (anoImportacao as number) : null;
}

export function tipoDaExecucao(numeroEmpenho: string | null | undefined, anoEmpenho: number | null | undefined, data: string | null | undefined, anoImportacao?: number | null): TipoExecucao {
  if (!String(numeroEmpenho ?? "").trim()) return { tipo: "erro", presumido: false, motivo: MOTIVO_SEM_NUMERO };
  if (anoEmpenho == null || !Number.isInteger(anoEmpenho)) {
    return { tipo: "rp", presumido: true, motivo: "O empenho não está no sistema: é de um ano anterior aos importados" };
  }
  const ano = anoDoRegistro(data, anoImportacao);
  if (ano == null) return { tipo: "rp", presumido: true, motivo: "Sem data: tipo presumido" };
  if (anoEmpenho > ano) return { tipo: "erro", presumido: false, motivo: MOTIVO_EMPENHO_POSTERIOR };
  if (anoEmpenho < ano) return { tipo: "rp", presumido: false, motivo: `Empenho de ${anoEmpenho}, executado em ${ano}` };
  return { tipo: "ne", presumido: false, motivo: `Empenho e execução em ${ano}` };
}
