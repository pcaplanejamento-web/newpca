import {
  acharTitulo,
  type CatalogoItemParseado,
  type CatalogoParseado,
  duplicadosDe,
  normalizarCodigo,
  rotuloColuna,
} from "./parse-catalogo-comum.ts";

/**
 * Núcleo PURO do parser de CATÁLOGO a partir de uma PLANILHA. Recebe a MATRIZ de
 * células (2D, já como texto) e reconstrói os itens. Como no PDF, as colunas são
 * detectadas pelo CABEÇALHO (código/descrição/unidade + Nº opcional, em qualquer
 * ordem), reaproveitando `rotuloColuna` de `parse-catalogo-comum`. Sem SheetJS/D1
 * aqui → testável no Node com matrizes sintéticas.
 */
export function parseCatalogoFromMatriz(aoa: unknown[][], _nomeArquivo: string): CatalogoParseado {
  const linhas = aoa.map((row) =>
    (Array.isArray(row) ? row : []).map((c) => (c == null ? "" : String(c).replace(/\s+/g, " ").trim())),
  );

  // Cabeçalho: 1ª linha com um rótulo de CÓDIGO e um de DESCRIÇÃO; mapeia as colunas.
  let hi = -1;
  let cCod = -1;
  let cDesc = -1;
  let cUni = -1;
  let cItem = -1;
  for (let r = 0; r < linhas.length; r++) {
    let cod = -1;
    let desc = -1;
    let uni = -1;
    let item = -1;
    linhas[r].forEach((cell, c) => {
      const k = rotuloColuna(cell);
      if (k === "codigo" && cod < 0) cod = c;
      else if (k === "descricao" && desc < 0) desc = c;
      else if (k === "unidade" && uni < 0) uni = c;
      else if (k === "item" && item < 0) item = c;
    });
    if (cod >= 0 && desc >= 0) {
      hi = r;
      cCod = cod;
      cDesc = desc;
      cUni = uni;
      cItem = item;
      break;
    }
  }

  const nome = acharTitulo(linhas.slice(0, hi >= 0 ? hi : linhas.length).map((r) => r.join(" ")));
  if (hi < 0) return { nome, itens: [], duplicadosNoArquivo: [] };

  const itens: CatalogoItemParseado[] = [];
  for (let r = hi + 1; r < linhas.length; r++) {
    const row = linhas[r];
    const codigoRaw = (row[cCod] ?? "").trim() || null;
    const codigo = normalizarCodigo(codigoRaw);
    if (!codigo) continue; // sem código → linha vazia/apoio, ignora
    const descricao = (cDesc >= 0 ? (row[cDesc] ?? "") : "").trim();
    const unidade = cUni >= 0 ? row[cUni] || null : null;
    const seqStr = cItem >= 0 ? (row[cItem] ?? "") : "";
    const sequencial = /^\d+$/.test(seqStr) ? Number(seqStr) : null;
    itens.push({ sequencial, codigo, codigoRaw, descricao, unidade });
  }

  return { nome, itens, duplicadosNoArquivo: duplicadosDe(itens) };
}
