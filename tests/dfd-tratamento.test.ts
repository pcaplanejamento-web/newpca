import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estadoItem,
  estadoProtocolo,
  faltasDoItem,
  itemComErro,
  linhasRelatorioDfd,
  linhasRelatorioProtocolo,
  situacaoProtocolo,
} from "../src/lib/dfd-tratamento.ts";
import { tipoCurtoDfd } from "../src/lib/parse-dfd-comum.ts";

const item = (over: Record<string, unknown> = {}) => ({
  item: 1,
  codigo: "C1",
  descricao: "D",
  unidade: "UN",
  quantidade: 2,
  valorUnitario: 5,
  valorTotal: 10,
  ...over,
});

describe("tipoCurtoDfd", () => {
  it("extrai o código curto do tipo", () => {
    assert.equal(tipoCurtoDfd("DFD-S — Solução / com ETP"), "DFD-S");
    assert.equal(tipoCurtoDfd("DFD-R — Renovação / Ata vigente"), "DFD-R");
    assert.equal(tipoCurtoDfd("dfd-o algo"), "DFD-O");
    assert.equal(tipoCurtoDfd("DFD-E"), "DFD-E");
  });
  it("null quando não casa", () => {
    assert.equal(tipoCurtoDfd(null), null);
    assert.equal(tipoCurtoDfd("qualquer coisa"), null);
    assert.equal(tipoCurtoDfd("DFD-X"), null); // só S/R/O/E
  });
});

describe("estado por item", () => {
  it("regular quando tem valor unitário e quantidade", () => {
    assert.equal(itemComErro(item()), false);
    assert.equal(estadoItem(item()), "regular");
    assert.deepEqual(faltasDoItem(item()), []);
  });
  it("erro quando falta valor unitário", () => {
    assert.equal(itemComErro(item({ valorUnitario: null })), true);
    assert.equal(estadoItem(item({ valorUnitario: 0 })), "erro");
    assert.deepEqual(faltasDoItem(item({ valorUnitario: null })), ["valor unitário"]);
  });
  it("erro quando falta quantidade", () => {
    assert.deepEqual(faltasDoItem(item({ quantidade: null })), ["quantidade"]);
    assert.deepEqual(faltasDoItem(item({ valorUnitario: null, quantidade: null })), ["valor unitário", "quantidade"]);
  });
});

describe("estado/situação do protocolo", () => {
  it("regular quando a capa bate com a somatória", () => {
    assert.equal(estadoProtocolo({ valorCapa: 1000, valorTotal: 1000, totalDfds: 3 }), "regular");
  });
  it("atenção quando a capa está zerada ou diverge", () => {
    assert.equal(estadoProtocolo({ valorCapa: 0, valorTotal: 1000, totalDfds: 3 }), "atencao");
    assert.equal(estadoProtocolo({ valorCapa: null, valorTotal: 1000, totalDfds: 3 }), "atencao");
    assert.equal(estadoProtocolo({ valorCapa: 900, valorTotal: 1000, totalDfds: 3 }), "atencao");
  });
  it("sem DFDs → regular (nada a conferir) e situação Vazio", () => {
    assert.equal(estadoProtocolo({ valorCapa: null, valorTotal: 0, totalDfds: 0 }), "regular");
    assert.equal(situacaoProtocolo({ totalDfds: 0 }), "vazio");
    assert.equal(situacaoProtocolo({ totalDfds: 2 }), "preenchido");
  });
});

describe("relatório de erros (copiável)", () => {
  it("DFD: cabeçalho + faltas + itens + assinatura", () => {
    const linhas = linhasRelatorioDfd({
      numero: "531",
      planejamento: "600",
      tipo: "DFD-S — Solução",
      faltas: ["repartição vinculada"],
      assinaturaMotivo: "assinante não autorizado",
      itensComErro: [{ item: 3, codigo: "40300", faltas: ["valor unitário"] }],
    });
    const txt = linhas.join("\n");
    assert.match(txt, /DFD 531 \(DFD-S\) — Planejamento 600/);
    assert.match(txt, /repartição vinculada/);
    assert.match(txt, /assinante não autorizado/);
    assert.match(txt, /item 3 \(cód\. 40300\): falta valor unitário/);
  });
  it("DFD sem erros → 'Sem erros.'", () => {
    const linhas = linhasRelatorioDfd({ numero: "1", faltas: [], itensComErro: [] });
    assert.equal(linhas[linhas.length - 1], "Sem erros.");
  });
  it("Protocolo: capa + DFDs com erro", () => {
    const linhas = linhasRelatorioProtocolo({
      numero: "97608/2026",
      idExterno: "2273524",
      capaMotivo: "valor da capa zerado/nulo",
      dfdsComErro: [{ numero: "531", motivo: "valor unitário em todos os itens" }],
    });
    const txt = linhas.join("\n");
    assert.match(txt, /Protocolo 97608\/2026 — Id 2273524/);
    assert.match(txt, /valor da capa zerado\/nulo/);
    assert.match(txt, /DFD 531: valor unitário/);
  });
});
