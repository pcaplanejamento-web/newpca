import {
  COLUNAS_ORCAMENTO,
  type ErroPlanilhaOrcamento,
  type OrcamentoItemParseado,
  type OrcamentoParseado,
  parseValorPlanilha,
  rotuloColunaOrcamento,
} from "./parse-orcamento-comum.ts";

/** No máximo tantos problemas listados (o total segue contado na mensagem). */
export const MAX_ERROS_PLANILHA = 500;

/**
 * Núcleo PURO do parser de ORÇAMENTO a partir da MATRIZ de células (2D, já como texto).
 * As colunas são detectadas pelo CABEÇALHO por posição (Órgão/Unidade/Função/Programa/Ação/
 * Nome Elemento/Código/Ficha/Fonte + os valores, em qualquer ordem), reaproveitando `rotuloColunaOrcamento`, e a
 * planilha é CONFERIDA: `faltam` = as colunas obrigatórias (`COLUNAS_ORCAMENTO`) ausentes e `erros` = os dados
 * incorretos por linha (texto obrigatório vazio, valor que não é número, Ficha que não é só dígitos, Código sem
 * número). Com qualquer um, a tela não importa. Sem SheetJS/D1 aqui → testável no Node com matrizes sintéticas.
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
  const faltam = COLUNAS_ORCAMENTO.filter((c) => col[c.key] === undefined).map((c) => c.rotulo);
  if (hi < 0) return { nome, itens: [], total: 0, faltam, erros: [] };
  const erros: ErroPlanilhaOrcamento[] = [];
  let nErros = 0;
  const erro = (linha: number, coluna: string, motivo: string) => {
    nErros++;
    if (erros.length < MAX_ERROS_PLANILHA) erros.push({ linha, coluna, motivo });
  };

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
    const funcao = txt(row, "funcao");
    const programa = txt(row, "programa");
    const acao = txt(row, "acao");
    const ficha = txt(row, "ficha");
    const fonte = txt(row, "fonte");
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
    // CONFERÊNCIA da linha (só as colunas que a planilha tem — as que faltam já travam a importação).
    const n = r + 1;
    for (const c of COLUNAS_ORCAMENTO) {
      const j = col[c.key];
      if (j === undefined) continue;
      const bruto = (row[j] ?? "").trim();
      if (c.texto) {
        if (!bruto) erro(n, c.rotulo, "vazio");
      } else if (bruto && parseValorPlanilha(bruto) == null) erro(n, c.rotulo, `"${bruto.slice(0, 40)}" não é um valor`);
    }
    if (ficha && !/^\d+$/.test(ficha)) erro(n, "Ficha", `"${ficha.slice(0, 40)}" não é um número de ficha`);
    if (codigoElemento && !/\d/.test(codigoElemento)) erro(n, "Código Elemento", `"${codigoElemento.slice(0, 40)}" não tem número`);
    itens.push({
      orgao,
      unidade,
      nomeElemento,
      codigoElemento,
      funcao,
      programa,
      acao,
      ficha,
      fonte,
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
  if (nErros > erros.length) erros.push({ linha: 0, coluna: "", motivo: `e mais ${nErros - erros.length} problema(s)` });
  return { nome, itens, total, faltam, erros };
}
