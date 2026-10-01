import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listasDoTexto, listasParaTexto } from "../src/lib/mesa-listas.ts";

// As listas grandes da Mesa vão ao cliente num ÚNICO texto JSON (menos CPU no Worker): a ida e a volta devolvem as MESMAS
// linhas, e o texto estranho nunca quebra a tela.

describe("mesa-listas — as listas da Mesa em um texto", () => {
  const protocolos = [
    { id: 1, numero: "144756/2026", responsavelId: null, valorCapa: 1234.56, assunto: "INCLUSÃO — “aspas” e \\ barra" },
    { id: 2, numero: "2/2026", responsavelId: 7, valorCapa: null, assunto: null },
  ];
  const dfds = [{ id: 10, numero: "1209", assinaturaGrupos: ["centi", "dropsigner"], prioridade: "ALTA", valorTotal: 0 }];

  it("ida e volta: as mesmas linhas", () => {
    const t = listasParaTexto({ protocolos, dfds }, 1700000000000);
    assert.equal(typeof t, "string");
    assert.deepEqual(listasDoTexto(t), { protocolos, dfds });
  });

  it("a carga muda o texto (cada carga do servidor = listas novas no cliente)", () => {
    assert.notEqual(listasParaTexto({ protocolos, dfds }, 1), listasParaTexto({ protocolos, dfds }, 2));
  });

  it("texto inválido ou fora do formato = listas vazias", () => {
    for (const t of [null, undefined, "", "não é json", "[]", '"x"', "null", '{"protocolos":{},"dfds":"x"}']) {
      assert.deepEqual(listasDoTexto(t), { protocolos: [], dfds: [] }, String(t));
    }
    assert.deepEqual(listasDoTexto('{"protocolos":[{"id":1}]}'), { protocolos: [{ id: 1 }], dfds: [] });
  });
});
