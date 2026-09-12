import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDfdFromMatriz } from "../src/lib/parse-dfd-core.ts";

// Fixtures = matriz de células (texto formatado, como `sheet_to_json({raw:false})`),
// modeladas no arquivo real EmitirDFDPlanejamento.xlsx (aba Page1).

/** Constrói uma linha esparsa de 17 colunas a partir de pares [coluna, valor]. */
function linha(pares: Array<[number, string]>): (string | null)[] {
  const r = new Array<string | null>(17).fill(null);
  for (const [i, v] of pares) r[i] = v;
  return r;
}

function dfdCompleto(): (string | null)[][] {
  const aoa: (string | null)[][] = Array.from({ length: 24 }, () => new Array(17).fill(null));
  aoa[4] = linha([[5, "AQUISIÇÃO DE SERVIÇO Número DFD:1586 / Planejamento: 1639"]]);
  aoa[6] = linha([[5, "Tipo DFD: DFD-S — Solução / com ETP"]]);
  aoa[11] = linha([[1, "Órgão/Entidade: PREFEITURA MUNICIPAL DE RIO VERDE"]]);
  aoa[12] = linha([[1, "Setor Requisitante: SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL"]]);
  aoa[13] = linha([[1, "Responsável pela Demanda: CLAUDIO LUIZ DE SOUSA"]]);
  // Cabeçalho da tabela (linha 24 no arquivo → índice 23): B/D/G/M/O
  aoa[23] = linha([
    [1, "ITEM"],
    [3, "CÓDIGO"],
    [6, "DESCRIÇÃO"],
    [12, "UNIDADE"],
    [14, "QUANTIDADE"],
  ]);
  // Item 1 e 2
  aoa.push(linha([[1, "1"], [3, "5241937263"], [6, "GUINDASTE HIDRAULICO AUTOPROPELIDO (MODELO 1)"], [12, "DIAS"], [14, "56"]]));
  aoa.push(linha([[1, "2"], [3, "5241937264"], [6, "GUINDASTE HIDRAULICO AUTOPROPELIDO (MODELO 2)"], [12, "DIAS"], [14, "20"]]));
  // Nota (encerra a tabela) — contém o valor estimado embutido, na coluna ITEM.
  aoa.push(
    linha([
      [
        1,
        "O LEVANTAMENTO FOI ELABORADO A PARTIR DA CONSOLIDAÇÃO. A ESTIMATIVA DO VALOR DA CONTRATAÇÃO É DE R$ 342.342,72, CONFORME EDITAL - PREGÃO ELETRÔNICO Nº 90.027/2026.",
      ],
    ]),
  );
  return aoa;
}

describe("parse-dfd-core", () => {
  it("extrai cabeçalho + itens do DFD real", () => {
    const d = parseDfdFromMatriz(dfdCompleto(), "EmitirDFDPlanejamento.xlsx");
    assert.equal(d.numero, "1586");
    assert.equal(d.planejamento, "1639");
    assert.equal(d.tipo, "DFD-S — Solução / com ETP");
    assert.equal(d.objeto, "AQUISIÇÃO DE SERVIÇO");
    assert.equal(d.orgaoEntidade, "PREFEITURA MUNICIPAL DE RIO VERDE");
    assert.equal(d.setorRequisitante, "SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL");
    assert.equal(d.siglaSetor, "SMIR");
    assert.equal(d.responsavel, "CLAUDIO LUIZ DE SOUSA");
    assert.equal(d.valorEstimado, 342342.72);
    assert.equal(d.nomeArquivo, "EmitirDFDPlanejamento.xlsx");
    assert.equal(d.itens.length, 2);
  });

  it("preserva o código longo como texto exato e lê quantidade", () => {
    const d = parseDfdFromMatriz(dfdCompleto(), "x.xlsx");
    assert.equal(d.itens[0].item, 1);
    assert.equal(d.itens[0].codigo, "5241937263");
    assert.equal(d.itens[0].unidade, "DIAS");
    assert.equal(d.itens[0].quantidade, 56);
    assert.ok(d.itens[0].descricao?.startsWith("GUINDASTE"));
    assert.equal(d.itens[1].codigo, "5241937264");
    assert.equal(d.itens[1].quantidade, 20);
  });

  it("pula linhas em branco entre o cabeçalho e os itens", () => {
    const aoa = dfdCompleto();
    aoa.splice(24, 0, new Array(17).fill(null)); // linha vazia após o cabeçalho
    const d = parseDfdFromMatriz(aoa, "x.xlsx");
    assert.equal(d.itens.length, 2);
    assert.equal(d.itens[0].item, 1);
  });

  it("lança erro claro quando falta o Número DFD", () => {
    const aoa = dfdCompleto().map((r) =>
      r.map((c) => (typeof c === "string" && /Número DFD/i.test(c) ? "AQUISIÇÃO DE SERVIÇO" : c)),
    );
    assert.throws(() => parseDfdFromMatriz(aoa, "x.xlsx"), /Número DFD/i);
  });

  it("lança erro quando não há itens na Seção 4", () => {
    const aoa: (string | null)[][] = Array.from({ length: 14 }, () => new Array(17).fill(null));
    aoa[4] = linha([[5, "AQUISIÇÃO DE SERVIÇO Número DFD:1586 / Planejamento: 1639"]]);
    assert.throws(() => parseDfdFromMatriz(aoa, "x.xlsx"), /Seção 4|itens/i);
  });
});
