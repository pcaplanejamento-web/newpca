import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acaoSugerida,
  agregarDashboard,
  consolidarPca,
  type ItemDashboard,
  type LinhaVinculo,
  motivosNaoMover,
  previsaoDoDfd,
} from "../src/lib/pca-core.ts";

const base = { situacaoPermite: true, situacaoNome: "Aprovado", anoProtocolo: 2027, anoPca: 2027, totalDfds: 3, dfdsEmOutroPca: 0, fonteProtocolo: true };

describe("pca-core — travas para mover protocolo", () => {
  it("tudo certo ⇒ pode mover", () => assert.deepEqual(motivosNaoMover(base), []));
  it("sem situação / situação que não permite", () => {
    assert.match(motivosNaoMover({ ...base, situacaoPermite: null }).join(), /sem situação/);
    assert.match(motivosNaoMover({ ...base, situacaoPermite: false }).join(), /não permite/);
  });
  it("ano divergente ou ausente", () => {
    assert.match(motivosNaoMover({ ...base, anoProtocolo: 2026 }).join(), /PCA 2026/);
    assert.match(motivosNaoMover({ ...base, anoProtocolo: null }).join(), /sem ano/);
  });
  it("sem DFDs / todos em outro PCA / PCA de lista", () => {
    assert.match(motivosNaoMover({ ...base, totalDfds: 0 }).join(), /sem DFDs/);
    assert.match(motivosNaoMover({ ...base, dfdsEmOutroPca: 3 }).join(), /outro PCA/);
    assert.deepEqual(motivosNaoMover({ ...base, dfdsEmOutroPca: 1 }), []);
    assert.match(motivosNaoMover({ ...base, fonteProtocolo: false }).join(), /lista pronta/);
  });
});

describe("pca-core — ação sugerida pelo assunto", () => {
  it("inclusão/alteração/exclusão", () => {
    assert.equal(acaoSugerida("INCLUSÃO - PCA"), "incorporar");
    assert.equal(acaoSugerida("ALTERAÇÃO NÃO ONEROSA"), "substituir");
    assert.equal(acaoSugerida("EXCLUSÃO - PCA"), "excluir");
    assert.equal(acaoSugerida(null), "incorporar");
  });
});

describe("pca-core — consolidação", () => {
  const L = (dfdId: number, planejamento: string | null, acao: LinhaVinculo["acao"], ordem: string, camada: LinhaVinculo["camada"] = "publicado"): LinhaVinculo => ({ dfdId, planejamento, acao, ordem, camada });
  it("incorporar + substituir + excluir por planejamento", () => {
    const c = consolidarPca(
      [L(1, "640", "incorporar", "a"), L(2, "811", "incorporar", "a"), L(3, "640", "substituir", "b"), L(4, "811", "excluir", "c")],
      "preview",
    );
    assert.deepEqual(c.vigentes.sort(), [3]);
    assert.equal(c.retirados.get(1), 3);
    assert.equal(c.retirados.get(2), 4);
    assert.equal(c.avisos.length, 0);
  });
  it("substituir/excluir sem par geram aviso", () => {
    const c = consolidarPca([L(1, "1", "substituir", "a"), L(2, "2", "excluir", "a")], "preview");
    assert.deepEqual(c.vigentes, [1]);
    assert.equal(c.avisos.length, 2);
  });
  it("camada publicada ignora DFDs em preview", () => {
    const linhas = [L(1, "1", "incorporar", "a", "publicado"), L(2, "1", "substituir", "b", "preview")];
    assert.deepEqual(consolidarPca(linhas, "publicado").vigentes, [1]);
    assert.deepEqual(consolidarPca(linhas, "preview").vigentes, [2]);
  });
  it("sem planejamento: cada DFD se representa", () => {
    assert.equal(consolidarPca([L(1, null, "incorporar", "a"), L(2, "", "incorporar", "a")], "preview").vigentes.length, 2);
  });
});

describe("pca-core — previsão e dashboard", () => {
  it("mês/ano, anual e ausente", () => {
    assert.deepEqual(previsaoDoDfd([{ titulo: "5 - PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "Março de 2027" }], 2027), { ano: 2027, mes: 3 });
    assert.deepEqual(previsaoDoDfd([{ titulo: "PREVISÃO DE ENTREGA", texto: "ANUAL" }], 2027), { ano: 2027, anual: true });
    assert.equal(previsaoDoDfd([], 2027), null);
    assert.equal(previsaoDoDfd(null, 2027), null);
  });
  it("agrega resumo, fatias, cronograma (anual espalhado) e top", () => {
    const it0 = (id: number, v: number, extra: Partial<ItemDashboard> = {}): ItemDashboard => ({ id, codigoProduto: null, sequencial: id, nome: `I${id}`, unidadeMedida: "UN", quantidade: 1, valorUnitario: v, valorTotal: v, classificacao: "DFD-S", previsao: null, unidade: "SEMED", origem: null, ...extra });
    const d = agregarDashboard([
      it0(1, 1200, { previsao: { ano: 2027, anual: true } }),
      it0(2, 300, { previsao: { ano: 2027, mes: 2 }, unidade: "SEMUS", unidadeMedida: "CX" }),
    ]);
    assert.equal(d.resumo.total, 1500);
    assert.equal(d.resumo.count, 2);
    assert.equal(d.resumo.maiorNome, "I1");
    assert.equal(d.resumo.numUnidades, 2);
    assert.equal(d.porMes.length, 12);
    assert.equal(d.porMes.find((p) => p.mes === 2)?.total, 400);
    assert.equal(d.top[0].valor, 1200);
    assert.deepEqual(d.porUnidadeMedida.map((f) => f.label).sort(), ["CX", "UN"]);
    assert.equal(agregarDashboard([]).resumo.ticket, 0);
  });
});
