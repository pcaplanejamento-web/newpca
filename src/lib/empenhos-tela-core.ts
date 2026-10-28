/**
 * A TELA DE EMPENHOS — o núcleo PURO (testado em `tests/empenhos-tela.test.ts`). Os empenhos de um ano (dezenas de
 * milhares) chegam COMPACTOS: os textos repetidos (órgão, fonte, elemento, fornecedor…) num DICIONÁRIO por campo e cada
 * empenho como uma tupla de números — montados no PRÓPRIO banco (`empenhos-tela-sql.ts`), o Worker só junta os pedaços.
 * Medido em 2026 (21.536 empenhos): 10,4 MB em JSON cru → ~2,5 MB assim.
 */

/** Os campos que vão pelo dicionário (a ordem é a da tupla, depois do id e do número). `unidade` = a SIGLA da unidade do
 * cadastro vinculada (sem unidade, a do órgão) — calculada no banco (`unidade_sistema`, `empenhos-tela-sql.ts`). */
export const CAMPOS_DICIONARIO = [
  "data",
  "orgaoGestor",
  "unidadeOrcamentaria",
  "fornecedor",
  "cpfCnpj",
  "modalidade",
  "licitacao",
  "funcao",
  "subfuncao",
  "programa",
  "acao",
  "elemento",
  "subelemento",
  "fonte",
  "unidade",
] as const;
export type CampoDicionario = (typeof CAMPOS_DICIONARIO)[number];

/** A coluna do banco de cada campo do dicionário (só estes nomes entram no SQL — nunca texto de fora). */
export const COLUNA_SQL: Record<CampoDicionario, string> = {
  data: "data",
  orgaoGestor: "orgao_gestor",
  unidadeOrcamentaria: "unidade_orcamentaria",
  fornecedor: "fornecedor",
  cpfCnpj: "cpf_cnpj",
  modalidade: "modalidade",
  licitacao: "licitacao",
  funcao: "funcao",
  subfuncao: "subfuncao",
  programa: "programa",
  acao: "acao",
  elemento: "elemento",
  subelemento: "subelemento",
  fonte: "fonte",
  unidade: "unidade_sistema",
};

/** Os valores (na ordem da tupla, depois dos campos do dicionário). */
export const VALORES_EMPENHO = ["valorEmpenhado", "valorAnulado", "valorLiquidado", "valorPago", "saldoPagar"] as const;
export const COLUNA_VALOR: Record<(typeof VALORES_EMPENHO)[number], string> = {
  valorEmpenhado: "valor_empenhado",
  valorAnulado: "valor_anulado",
  valorLiquidado: "valor_liquidado",
  valorPago: "valor_pago",
  saldoPagar: "saldo_pagar",
};

/** Quantos empenhos por pedaço (cada pedaço é UM texto do banco — o D1 recusa texto acima de 2 MB; ~120 bytes cada). */
export const EMPENHOS_POR_PEDACO = 6000;

/** Um empenho na tabela (sem o histórico — ele vem no detalhe). */
export type EmpenhoNaTela = {
  id: number;
  numero: string;
  /** O card que gravou o empenho (a coluna Card da tabela única). */
  cardId?: number;
  /** O ano do empenho (o do pacote lido — a coluna Ano de "Todos os anos"). */
  ano?: number;
} & Record<CampoDicionario, string | null> &
  Record<(typeof VALORES_EMPENHO)[number], number>;

/** O que a rota entrega: o dicionário de cada campo como pares [índice, texto] e as tuplas. */
export type PacoteEmpenhos = {
  n: number;
  dic: Partial<Record<CampoDicionario, [number, string | null][]>>;
  linhas: (number | string | null)[][];
};

/** As tuplas → os empenhos (índice fora do dicionário = vazio; valor ausente = 0 — nunca quebra). */
export function empenhosDoPacote(p: PacoteEmpenhos): EmpenhoNaTela[] {
  const dic = CAMPOS_DICIONARIO.map((c) => {
    const m = new Map<number, string | null>();
    for (const [i, v] of p.dic[c] ?? []) m.set(i, v);
    return m;
  });
  const nD = CAMPOS_DICIONARIO.length;
  return p.linhas.map((t) => {
    const e: Record<string, unknown> = { id: Number(t[0]), numero: String(t[1] ?? "") };
    CAMPOS_DICIONARIO.forEach((c, i) => {
      e[c] = dic[i].get(Number(t[2 + i])) ?? null;
    });
    VALORES_EMPENHO.forEach((c, i) => {
      const v = Number(t[2 + nD + i]);
      e[c] = Number.isFinite(v) ? v : 0;
    });
    // O card vem DEPOIS dos valores (o último da tupla — pacotes sem ele seguem valendo).
    const card = t[2 + nD + VALORES_EMPENHO.length];
    if (card != null && Number.isInteger(Number(card))) e.cardId = Number(card);
    return e as EmpenhoNaTela;
  });
}

export type ResumoEmpenhos = { n: number; empenhado: number; anulado: number; liquidado: number; pago: number; aPagar: number };

/** Os totais das linhas (os KPIs acompanham os filtros da tabela). */
export function resumoEmpenhos(linhas: readonly EmpenhoNaTela[]): ResumoEmpenhos {
  const r = { n: linhas.length, empenhado: 0, anulado: 0, liquidado: 0, pago: 0, aPagar: 0 };
  for (const e of linhas) {
    r.empenhado += e.valorEmpenhado;
    r.anulado += e.valorAnulado;
    r.liquidado += e.valorLiquidado;
    r.pago += e.valorPago;
    r.aPagar += e.saldoPagar;
  }
  return r;
}

/**
 * "TODOS OS ANOS" juntos: cada ano é lido num pedido próprio (o seu dicionário — nunca se misturam) e as linhas levam o ano.
 * O empenho não se repete entre anos (a chave leva o ano — `chaveEmpenho`).
 */
export function juntarAnos(pacotes: readonly { ano: number; pacote: PacoteEmpenhos }[]): EmpenhoNaTela[] {
  const todas: EmpenhoNaTela[] = [];
  for (const { ano, pacote } of pacotes) for (const e of empenhosDoPacote(pacote)) todas.push({ ...e, ano });
  return todas;
}

/** O valor do seletor "Todos os anos" (o padrão das tabelas de empenhos, liquidações e pagamentos). */
export const ANO_TODOS = 0;

/** O texto do recorte de anos ("todos os anos" | "2026") — nomes de arquivo e textos vazios das tabelas. */
export const rotuloRecorteAno = (ano: number): string => (ano === ANO_TODOS ? "todos os anos" : String(ano));

/** Os anos que um recorte pede: "Todos os anos" = cada ano da lista (um pedido por ano); senão, o próprio ano. */
export const anosDoRecorte = (ano: number, anos: readonly { ano: number }[]): number[] => (ano === ANO_TODOS ? anos.map((a) => a.ano) : [ano]);

/** Um ano com empenhos (o seletor de ano da tela). */
export type AnoEmpenhos = { ano: number; n: number; soma: number; removidos: number; atualizadoEm: string | null };

/** O ano pedido na URL, se existe; senão "Todos os anos" (`ANO_TODOS`); sem nenhum ano, null. */
export function anoEscolhido(anos: readonly { ano: number }[], pedido: unknown): number | null {
  if (!anos.length) return null;
  const n = Number(pedido);
  if (pedido != null && pedido !== "" && Number.isInteger(n) && anos.some((a) => a.ano === n)) return n;
  return ANO_TODOS;
}

/**
 * ESCOPO: cada empenho está VINCULADO ao cadastro (pelos vínculos do card: um órgão e, opcional, uma unidade dele —
 * `empenho_card_vinculos`). A pessoa vê o empenho vinculado a uma das SUAS unidades ou, quando o vínculo é só ao órgão, a um
 * órgão de uma das suas unidades. `null` = todos (ADM, a "Geral", o módulo fora do filtro da unidade); vazio = nenhum.
 */
export type EscopoEmpenhos = { unidades: readonly number[]; orgaos: readonly number[] } | null;

/** O escopo não deixa ver nada. */
export const escopoVazio = (e: EscopoEmpenhos): boolean => e !== null && e.unidades.length === 0 && e.orgaos.length === 0;

/** O empenho entra no escopo? */
export function empenhoNoEscopo(escopo: EscopoEmpenhos, e: { orgaoId: number | null; reparticaoId: number | null }): boolean {
  if (escopo === null) return true;
  if (e.reparticaoId != null) return escopo.unidades.includes(e.reparticaoId);
  return e.orgaoId != null && escopo.orgaos.includes(e.orgaoId);
}

/** Texto estável do escopo (chave de memória e da tela). */
export function chaveEscopoEmpenhos(escopo: EscopoEmpenhos): string {
  if (escopo === null) return "*";
  const ord = (l: readonly number[]) => [...l].sort((a, b) => a - b).join(",");
  return `u${ord(escopo.unidades)}|o${ord(escopo.orgaos)}`;
}

/** Os PROBLEMAS internos de um empenho (os valores que a própria Centi informa não fecham entre si), ao centavo. */
export const PROBLEMAS_EMPENHO = {
  liquidadoAcima: "Liquidado acima do empenhado",
  pagoAcima: "Pago acima do liquidado",
  saldo: "Saldo a pagar não fecha",
} as const;
export type ProblemaEmpenho = keyof typeof PROBLEMAS_EMPENHO;
export const REGULAR_EMPENHO = "Regular";

/**
 * A CONFERÊNCIA de um empenho (só os valores dele — nada a mais a ler): liquidado ≤ empenhado − anulado, pago ≤ liquidado e
 * a pagar = empenhado − anulado − pago (a régua da Centi; medido em 2025, 25.334 empenhos: 236 com o liquidado acima, 1 com o
 * pago acima, 37 com o saldo fora da conta). A diferença abaixo de 1 centavo não conta.
 */
export function problemasDoEmpenho(e: Pick<EmpenhoNaTela, "valorEmpenhado" | "valorAnulado" | "valorLiquidado" | "valorPago" | "saldoPagar">): ProblemaEmpenho[] {
  const c = (n: number) => Math.round(n * 100);
  const p: ProblemaEmpenho[] = [];
  if (c(e.valorLiquidado) > c(e.valorEmpenhado - e.valorAnulado)) p.push("liquidadoAcima");
  if (c(e.valorPago) > c(e.valorLiquidado)) p.push("pagoAcima");
  if (c(e.saldoPagar) !== c(e.valorEmpenhado - e.valorAnulado - e.valorPago)) p.push("saldo");
  return p;
}
