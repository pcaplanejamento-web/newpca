import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acaoSugerida,
  agregarDashboard,
  consolidarPca,
  type ItemDashboard,
  type LinhaVinculo,
  edicaoPermitidaTravado,
  estaTravado,
  mensagemTravaPca,
  motivoNaoDevolver,
  motivoNaoExcluirProtocolo,
  motivosNaoEnviar,
  motivosNaoIncorporar,
  previsaoDoDfd,
} from "../src/lib/pca-core.ts";

const base = { anoProtocolo: 2027, anoPca: 2027, totalDfds: 3, fonteProtocolo: true, jaEmPca: null };

describe("pca-core — enviar ao PCA", () => {
  it("tudo certo ⇒ pode enviar", () => assert.deepEqual(motivosNaoEnviar(base), []));
  it("ano divergente ou ausente", () => {
    assert.match(motivosNaoEnviar({ ...base, anoProtocolo: 2026 }).join(), /PCA 2026/);
    assert.match(motivosNaoEnviar({ ...base, anoProtocolo: null }).join(), /sem ano/);
  });
  it("sem DFDs / já em PCA / PCA de lista", () => {
    assert.match(motivosNaoEnviar({ ...base, totalDfds: 0 }).join(), /sem DFDs/);
    assert.match(motivosNaoEnviar({ ...base, jaEmPca: "PCA 2027" }).join(), /Já está no PCA 2027/);
    assert.match(motivosNaoEnviar({ ...base, fonteProtocolo: false }).join(), /lista pronta/);
  });
});

describe("pca-core — incorporar, devolver e trava", () => {
  const inc = { enviadoAEste: true, incorporado: false, totalDfds: 2, dfdsEmOutroPca: 0 };
  it("incorporar", () => {
    assert.deepEqual(motivosNaoIncorporar(inc), []);
    assert.match(motivosNaoIncorporar({ ...inc, enviadoAEste: false }).join(), /não está na Mesa/);
    assert.match(motivosNaoIncorporar({ ...inc, incorporado: true }).join(), /Já incorporado/);
    assert.match(motivosNaoIncorporar({ ...inc, dfdsEmOutroPca: 2 }).join(), /outro PCA/);
    assert.deepEqual(motivosNaoIncorporar({ ...inc, dfdsEmOutroPca: 1 }), []);
  });
  it("devolver só o não incorporado deste PCA", () => {
    assert.equal(motivoNaoDevolver({ pcaId: 5, pcaIncorporadoEm: null }, 5), null);
    assert.match(motivoNaoDevolver({ pcaId: 5, pcaIncorporadoEm: "2027-01-01" }, 5) ?? "", /permanente/);
    assert.match(motivoNaoDevolver({ pcaId: 6, pcaIncorporadoEm: null }, 5) ?? "", /não está/);
  });
  it("protocolo em um PCA (enviado ou incorporado) NÃO é excluído; fora de PCA, pode", () => {
    assert.equal(motivoNaoExcluirProtocolo({ pcaId: null, pcaIncorporadoEm: null }), null);
    assert.equal(motivoNaoExcluirProtocolo({ pcaId: undefined, pcaIncorporadoEm: undefined }), null);
    const enviado = motivoNaoExcluirProtocolo({ pcaId: 5, pcaIncorporadoEm: null }, "PCA 2027") ?? "";
    assert.match(enviado, /Mesa do PCA 2027/);
    assert.match(enviado, /devolva-o à Mesa principal/);
    assert.equal(motivoNaoExcluirProtocolo({ pcaId: 5, pcaIncorporadoEm: "2027-01-01" }, "PCA 2027"), mensagemTravaPca("PCA 2027"));
    assert.match(motivoNaoExcluirProtocolo({ pcaId: 5, pcaIncorporadoEm: null }) ?? "", /Mesa do PCA —/); // sem nome: "PCA"
  });
  it("travado: só a gestão passa", () => {
    assert.equal(edicaoPermitidaTravado({ situacaoId: 3, origem: "celula" }), true);
    assert.equal(edicaoPermitidaTravado({ responsavelId: null }), true);
    assert.equal(edicaoPermitidaTravado({ situacaoId: 3, assunto: "X" }), false);
    assert.equal(edicaoPermitidaTravado({ valorCapa: 10, assunto: undefined }), false);
    assert.match(mensagemTravaPca("PCA 2027"), /Incorporado ao PCA 2027/);
    assert.equal(estaTravado({ pcaId: 1, pcaIncorporadoEm: "2027-01-01" }), true);
    assert.equal(estaTravado({ pcaId: null, pcaIncorporadoEm: "2027-01-01" }), false);
    assert.equal(estaTravado({ pcaId: 1, pcaIncorporadoEm: null }), false);
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
  const L = (dfdId: number, planejamento: string | null, acao: LinhaVinculo["acao"], ordem: string): LinhaVinculo => ({ dfdId, planejamento, acao, ordem });
  it("incorporar + substituir + excluir por planejamento", () => {
    const c = consolidarPca(
      [L(1, "640", "incorporar", "a"), L(2, "811", "incorporar", "a"), L(3, "640", "substituir", "b"), L(4, "811", "excluir", "c")],
    );
    assert.deepEqual(c.vigentes.sort(), [3]);
    assert.equal(c.retirados.get(1), 3);
    assert.equal(c.retirados.get(2), 4);
    assert.equal(c.avisos.length, 0);
  });
  it("substituir/excluir sem par geram aviso", () => {
    const c = consolidarPca([L(1, "1", "substituir", "a"), L(2, "2", "excluir", "a")]);
    assert.deepEqual(c.vigentes, [1]);
    assert.equal(c.avisos.length, 2);
  });
  it("a ordem cronológica decide (a situação/camada não interfere)", () => {
    assert.deepEqual(consolidarPca([L(2, "1", "substituir", "b"), L(1, "1", "incorporar", "a")]).vigentes, [2]);
  });
  it("sem planejamento: cada DFD se representa", () => {
    assert.equal(consolidarPca([L(1, null, "incorporar", "a"), L(2, "", "incorporar", "a")]).vigentes.length, 2);
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
