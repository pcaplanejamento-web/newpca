import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizarLinha, parseDataDesejada } from "../src/lib/normalize.ts";
import { lerPlanilhas } from "../src/lib/parse-xlsx-core.ts";
import { chaveProtocoloExterno, unirPlanilhaEProtocolos } from "../src/lib/pca-uniao.ts";

const CAB = ["LOCAL", "SEQUENCIAL", "CÓDIGO", "PRODUTO", "UNIDADES (DIVERSOS) DE MEDIDA", "CLASSIFICAÇÃO", "DOMÍNIO", "QUANTIDADE", "VALOR UNITÁRIO", "DATA PARA CONTRATAÇÃO", "VALOR TOTAL", "PRIORIDADE", "ID PROTOCOLO", "DFD"];
const mar = new Date(Date.UTC(2026, 2, 1, 3));

describe("planilha consolidada (Enviar_PCA)", () => {
  const aoa: unknown[][] = [
    CAB,
    ["AMAE", 2, 524190502, "CERTIFICADO DIGITAL", "UNIDADE", "OUTROS SERVIÇO TERCEIROS – PJ", "MATERIAL", 1, 144.3, mar, "R$ 144,30", "BAIXA"],
    ["AMAE", 3, "5241922583", "CALIBRAÇÃO", "SERVIÇO", "SERVIÇO", "SERVIÇO", 2, 1198.06, "ANUAL", "", "alta", "2334977"],
    ["FEMBOM", 824, "122184-FEMBOM", "CORRENTE", "UNIDADE", "FERRAMENTAS", "MATERIAL", 4, 124.67, mar, "", "Média", "2334977"],
    [],
    [null, null, null, null],
  ];
  const l = lerPlanilhas(aoa, "Enviar_PCA26.xlsx");
  it("uma planilha por LOCAL", () => {
    assert.equal(l.formato, "consolidado");
    assert.deepEqual(l.planilhas.map((p) => [p.codigo, p.rows.length]), [["AMAE", 2], ["FEMBOM", 1]]);
  });
  it("código só dígitos; o longo fica inteiro", () => {
    assert.equal(l.planilhas[0].rows[1].idProduto, "5241922583");
    assert.equal(l.planilhas[1].rows[0].idProduto, "122184");
    assert.ok(l.problemas.some((p) => p.tipo.startsWith("Código com texto")));
  });
  it("aponta vazias, protocolo em duas unidades e prioridades diferentes", () => {
    const t = l.problemas.map((p) => p.tipo).join("|");
    assert.match(t, /Linhas vazias/);
    assert.match(t, /Protocolo em mais de uma unidade/);
    assert.match(t, /Prioridades diferentes/);
  });
  it("normaliza: data → mês, ANUAL genérica, prioridade padrão, Id só dígitos", () => {
    const a = normalizarLinha(l.planilhas[0].rows[0]);
    assert.equal(a.mesDesejado, 3);
    assert.equal(a.anoDesejado, 2026);
    assert.equal(a.prioridade, "BAIXA");
    const b = normalizarLinha(l.planilhas[0].rows[1]);
    assert.equal(b.previsaoGenerica, "ANUAL");
    assert.equal(b.prioridade, "ALTA");
    assert.equal(b.protocoloIdExterno, "2334977");
    assert.equal(b.valorTotal, 2396.12);
  });
  it("formato por unidade continua igual", () => {
    const u = lerPlanilhas([["Código", "SMS"], ["Município", "RIO VERDE"], ["Id Produto", "Sequencial", "Nome do Produto", "Unidade Medida", "Quantidade", "Valor Referência"], [1, 1, "X", "UN", 2, 3]], "a.xlsx");
    assert.equal(u.formato, "unidade");
    assert.equal(u.planilhas[0].codigo, "SMS");
  });
  it("mm/aaaa", () => assert.deepEqual(parseDataDesejada("03/2026"), { iso: "2026-03-01", mes: 3, ano: 2026 }));
});

describe("união planilha × protocolos (o protocolo vence, nada é gravado)", () => {
  const planilha = [
    { id: 1, pid: "2334977" },
    { id: 2, pid: "02334977" },
    { id: 3, pid: null },
    { id: 4, pid: "999" },
  ];
  const r = unirPlanilhaEProtocolos(planilha, [{ x: 1 }], (p) => p.pid, ["2334977", null]);
  it("tira só as linhas do protocolo incorporado", () => {
    assert.deepEqual(r.planilha.map((p) => p.id), [3, 4]);
    assert.equal(r.substituidos, 2);
    assert.deepEqual([...r.protocolosCasados], ["2334977"]);
  });
  it("protocolo intacto", () => assert.deepEqual(r.protocolo, [{ x: 1 }]));
  it("chave", () => assert.equal(chaveProtocoloExterno(" 0123-a"), "123"));
});
