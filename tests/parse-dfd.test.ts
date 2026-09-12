import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDfdFromMatriz } from "../src/lib/parse-dfd-core.ts";

// Fixtures = matriz de células (texto formatado, como `sheet_to_json({raw:false})`),
// modeladas no arquivo real EmitirDFDPlanejamento (1).xlsx (aba Page1) — com valores
// por item (VALOR UNITÁRIO / VALOR TOTAL), linha "VALOR TOTAL" e demais seções.

/** Constrói uma linha esparsa de 19 colunas a partir de pares [coluna, valor]. */
function linha(pares: Array<[number, string]>): (string | null)[] {
  const r = new Array<string | null>(19).fill(null);
  for (const [i, v] of pares) r[i] = v;
  return r;
}

function dfdCompleto(): (string | null)[][] {
  const aoa: (string | null)[][] = Array.from({ length: 23 }, () => new Array(19).fill(null));
  aoa[4] = linha([[5, "AQUISIÇÃO DE SERVIÇO Número DFD:1586 / Planejamento: 1639"]]);
  aoa[6] = linha([[5, "Tipo DFD: DFD-S — Solução / com ETP"]]);
  aoa[11] = linha([[1, "Órgão/Entidade: PREFEITURA MUNICIPAL DE RIO VERDE"]]);
  aoa[12] = linha([[1, "Setor Requisitante: SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL"]]);
  aoa[13] = linha([
    [1, "Responsável pela Demanda: CLAUDIO LUIZ DE SOUSA"],
    [10, "Matrícula: 1043055"],
  ]);
  aoa[14] = linha([
    [1, "E-mail: claudioluiz99685320@gmail.com"],
    [10, "Telefone: (64) 99968-5320"],
  ]);
  aoa[16] = linha([[1, "2 - IDENTIFICAÇÃO DA DEMANDA"]]);
  aoa[17] = linha([[1, "DISPENSA DE LICITAÇÃO PARA CONTRATAÇÃO DE ITENS FRACASSADOS."]]);
  aoa[19] = linha([[1, "3 - JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO"]]);
  aoa[20] = linha([[1, "A malha viária rural depende de içamento de peças pré-moldadas."]]);
  aoa[22] = linha([[1, "4 - QUANTIDADE DE MATERIAL/SERVIÇOS A SER CONTRATADA"]]);
  // Cabeçalho da tabela: ITEM(B) CÓDIGO(D) DESCRIÇÃO(G) UNIDADE(I) QUANTIDADE(L) VLR UNIT(O) VLR TOTAL(Q)
  aoa.push(
    linha([
      [1, "ITEM"],
      [3, "CÓDIGO"],
      [6, "DESCRIÇÃO"],
      [8, "UNIDADE"],
      [11, "QUANTIDADE"],
      [14, "VALOR UNITÁRIO "],
      [16, "VALOR TOTAL"],
    ]),
  );
  aoa.push(
    linha([[1, "1"], [3, "5241937263"], [6, "GUINDASTE MODELO 1"], [8, "DIAS"], [11, "56"], [14, " 3.256,1200"], [16, " 182.342,7200"]]),
  );
  aoa.push(
    linha([[1, "2"], [3, "5241937264"], [6, "GUINDASTE MODELO 2"], [8, "DIAS"], [11, "20"], [14, " 8.000,0000"], [16, " 160.000,0000"]]),
  );
  aoa.push(linha([[1, "VALOR TOTAL"], [16, " 342.342,7200"]])); // grand total (encerra a tabela)
  aoa.push(
    linha([[1, "O LEVANTAMENTO. A ESTIMATIVA DO VALOR DA CONTRATAÇÃO É DE R$ 342.342,72, CONFORME EDITAL."]]),
  );
  aoa.push(new Array(19).fill(null));
  aoa.push(linha([[1, "5 - PREVISÃO DE ENTREGA/EXECUÇÃO"]]));
  aoa.push(linha([[1, "A PREVISÃO PARA INÍCIO É JANEIRO/2027."]]));
  aoa.push(new Array(19).fill(null));
  aoa.push(linha([[1, "7 - FUNDAMENTAÇÃO LEGAL"]]));
  aoa.push(linha([[1, "LEI 14.133/2021."]]));
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
    assert.equal(d.itens.length, 2);
  });

  it("extrai matrícula, e-mail e telefone", () => {
    const d = parseDfdFromMatriz(dfdCompleto(), "x.xlsx");
    assert.equal(d.matricula, "1043055");
    assert.equal(d.email, "claudioluiz99685320@gmail.com");
    assert.equal(d.telefone, "(64) 99968-5320");
  });

  it("preserva código longo, lê quantidade e valores por item + total", () => {
    const d = parseDfdFromMatriz(dfdCompleto(), "x.xlsx");
    assert.equal(d.itens[0].codigo, "5241937263");
    assert.equal(d.itens[0].quantidade, 56);
    assert.equal(d.itens[0].valorUnitario, 3256.12);
    assert.equal(d.itens[0].valorTotal, 182342.72);
    assert.equal(d.itens[1].valorUnitario, 8000);
    assert.equal(d.itens[1].valorTotal, 160000);
    assert.equal(d.valorTotal, 342342.72); // linha "VALOR TOTAL"
  });

  it("coleta as demais seções (2, 3, 5, 7) ignorando 1 e 4", () => {
    const d = parseDfdFromMatriz(dfdCompleto(), "x.xlsx");
    const nums = d.secoes.map((s) => s.numero);
    assert.deepEqual(nums, [2, 3, 5, 7]);
    const s2 = d.secoes.find((s) => s.numero === 2);
    assert.ok(s2?.texto.startsWith("DISPENSA"));
    assert.ok(d.secoes.find((s) => s.numero === 7)?.texto.includes("14.133"));
  });

  it("lança erro claro quando falta o Número DFD", () => {
    const aoa = dfdCompleto().map((r) =>
      r.map((c) => (typeof c === "string" && /Número DFD/i.test(c) ? "AQUISIÇÃO DE SERVIÇO" : c)),
    );
    assert.throws(() => parseDfdFromMatriz(aoa, "x.xlsx"), /Número DFD/i);
  });

  it("lança erro quando não há itens na Seção 4", () => {
    const aoa: (string | null)[][] = Array.from({ length: 14 }, () => new Array(19).fill(null));
    aoa[4] = linha([[5, "AQUISIÇÃO DE SERVIÇO Número DFD:1586 / Planejamento: 1639"]]);
    assert.throws(() => parseDfdFromMatriz(aoa, "x.xlsx"), /Seção 4|itens/i);
  });
});
