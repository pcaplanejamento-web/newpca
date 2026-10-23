/**
 * A TELA DE EMPENHOS — o núcleo PURO (testado em `tests/empenhos-tela.test.ts`). Os empenhos de um ano (dezenas de
 * milhares) chegam COMPACTOS: os textos repetidos (órgão, fonte, elemento, fornecedor…) num DICIONÁRIO por campo e cada
 * empenho como uma tupla de números — montados no PRÓPRIO banco (`empenhos-tela-sql.ts`), o Worker só junta os pedaços.
 * Medido em 2026 (21.536 empenhos): 10,4 MB em JSON cru → ~2,5 MB assim.
 */

/** Os campos que vão pelo dicionário (a ordem é a da tupla, depois do id e do número). */
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
export type EmpenhoNaTela = { id: number; numero: string } & Record<CampoDicionario, string | null> &
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

/** Um ano com empenhos (o seletor de ano da tela). */
export type AnoEmpenhos = { ano: number; n: number; soma: number; removidos: number; atualizadoEm: string | null };

/** O ano pedido na URL, se existe; senão o mais recente; sem nenhum, null. */
export function anoEscolhido(anos: readonly AnoEmpenhos[], pedido: unknown): number | null {
  const n = Number(pedido);
  if (Number.isInteger(n) && anos.some((a) => a.ano === n)) return n;
  return anos[0]?.ano ?? null;
}

/**
 * ESCOPO POR ÓRGÃO: o "Órgão gestor" da Centi é a SIGLA do órgão (ex.: "FMC") — casa com a sigla do órgão cadastrado,
 * sem caixa, acento, espaço nem pontuação. `null` = todos os órgãos (ADM, a "Geral", o módulo fora do filtro da unidade);
 * `[]` = nenhum (a pessoa não vê nada).
 */
export type OrgaosEmpenhos = readonly string[] | null;

export function chaveOrgaoGestor(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Os textos de "Órgão gestor" gravados (como vieram) que casam com as siglas dos órgãos da pessoa. */
export function gestoresDasSiglas(gestores: readonly string[], siglas: readonly string[]): string[] {
  const ok = new Set(siglas.map(chaveOrgaoGestor).filter(Boolean));
  return gestores.filter((g) => ok.has(chaveOrgaoGestor(g))).sort();
}

/** Os órgãos gestores SEM órgão cadastrado de mesma sigla (o ADM corrige a sigla — senão só ele os vê). */
export function gestoresSemOrgao(gestores: readonly string[], siglas: readonly string[]): string[] {
  const ok = new Set(siglas.map(chaveOrgaoGestor).filter(Boolean));
  return gestores.filter((g) => !ok.has(chaveOrgaoGestor(g))).sort();
}

/** O empenho entra no escopo? */
export function empenhoNoEscopo(orgaos: OrgaosEmpenhos, orgaoGestor: string): boolean {
  return orgaos === null || orgaos.includes(orgaoGestor);
}

/** Texto estável do escopo (chave de memória e da tela). */
export function chaveOrgaosEmpenhos(orgaos: OrgaosEmpenhos): string {
  return orgaos === null ? "*" : [...orgaos].sort().join("|");
}
