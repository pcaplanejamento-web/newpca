import {
  type OrcamentoItemParseado,
  type OrcamentoParseado,
  parseValorPlanilha,
  rotuloColunaOrcamento,
} from "./parse-orcamento-comum.ts";

/**
 * Núcleo PURO do parser de ORÇAMENTO a partir da MATRIZ de células (2D, já como texto).
 * As colunas são detectadas pelo CABEÇALHO por posição (Órgão/Unidade/Nome Elemento/
 * Código + os valores, em qualquer ordem), reaproveitando `rotuloColunaOrcamento`. Sem
 * SheetJS/D1 aqui → testável no Node com matrizes sintéticas. Espelha `parse-catalogo-xlsx-core`.
 */
export function parseOrcamentoFromMatriz(aoa: unknown[][], nomeArquivo?: string): OrcamentoParseado {
  const linhas = aoa.map((row) =>
    (Array.isArray(row) ? row : []).map((c) => (c == null ? "" : String(c).replace(/\s+/g, " ").trim())),
  );

  // Cabeçalho: 1ª linha que tem Órgão + Nome Elemento; mapeia TODAS as colunas presentes.
  const col: Partial<Record<string, number>> = {};
  let hi = -1;
  for (let r = 0; r < linhas.length; r++) {
    const achados: Partial<Record<string, number>> = {};
    linhas[r].forEach((cell, c) => {
      const k = rotuloColunaOrcamento(cell);
      if (k && achados[k] === undefined) achados[k] = c;
    });
    if (achados.orgao !== undefined && achados.nomeElemento !== undefined) {
      hi = r;
      Object.assign(col, achados);
      break;
    }
  }

  const nome = nomeArquivo ? nomeArquivo.replace(/\.(xlsx|xls)$/i, "").trim() || null : null;
  if (hi < 0) return { nome, itens: [], total: 0 };

  const txt = (row: string[], key: string): string => {
    const c = col[key];
    return c === undefined ? "" : (row[c] ?? "").trim();
  };
  const val = (row: string[], key: string): number => {
    const c = col[key];
    return c === undefined ? 0 : (parseValorPlanilha(row[c]) ?? 0);
  };

  const itens: OrcamentoItemParseado[] = [];
  let seq = 0;
  for (let r = hi + 1; r < linhas.length; r++) {
    const row = linhas[r];
    const orgao = txt(row, "orgao");
    // Terminador: rodapé "Qtd. total N" (na coluna do Órgão).
    if (/^qtd\.?\s*total/i.test(orgao)) break;
    const nomeElemento = txt(row, "nomeElemento");
    const codigoElemento = txt(row, "codigoElemento");
    const unidade = txt(row, "unidade");
    const valorEmendaImpositiva = val(row, "emenda");
    const valorInicial = val(row, "inicial");
    const valorSuplementacao = val(row, "suplementacao");
    const valorEmpenho = val(row, "empenho");
    const saldo = val(row, "saldo");
    const valorAnulacao = val(row, "anulacao");
    const temValor =
      valorEmendaImpositiva || valorInicial || valorSuplementacao || valorEmpenho || saldo || valorAnulacao;
    // Linha vazia/espaçadora: sem órgão, sem elemento e sem nenhum valor → ignora.
    if (!orgao && !nomeElemento && !codigoElemento && !temValor) continue;
    itens.push({
      orgao,
      unidade,
      nomeElemento,
      codigoElemento,
      valorEmendaImpositiva,
      valorInicial,
      valorSuplementacao,
      valorEmpenho,
      saldo,
      valorAnulacao,
      sequencial: seq++,
    });
  }

  const total = itens.reduce((s, it) => s + it.valorInicial, 0);
  return { nome, itens, total };
}
