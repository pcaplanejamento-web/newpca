import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFIG_PRESENCA_PADRAO,
  ficaInvisivel,
  lerConfigPresenca,
  lerEstadoMensagem,
  lerListaMensagem,
  lerPrefsPresenca,
  listaPresenca,
  ordenarPresenca,
} from "../src/lib/presenca-core.ts";
import { configPresencaSchema, prefsPresencaSchema } from "../src/lib/presenca-validation.ts";

describe("presença: configuração e preferência", () => {
  it("padrão desligado; qualquer JSON vira válido", () => {
    assert.deepEqual(lerConfigPresenca(undefined), CONFIG_PRESENCA_PADRAO);
    assert.equal(CONFIG_PRESENCA_PADRAO.ativo, false);
    assert.deepEqual(lerConfigPresenca({ ativo: true, ausente: "x", lixo: 1 }), { ativo: true, ausente: true, invisivel: true });
    assert.deepEqual(lerConfigPresenca("texto"), CONFIG_PRESENCA_PADRAO);
  });
  it("preferência: texto JSON, objeto ou lixo", () => {
    assert.deepEqual(lerPrefsPresenca('{"invisivel":true}'), { invisivel: true });
    assert.deepEqual(lerPrefsPresenca({ invisivel: "sim" }), { invisivel: false });
    assert.deepEqual(lerPrefsPresenca("{quebrado"), { invisivel: false });
    assert.deepEqual(lerPrefsPresenca(null), { invisivel: false });
  });
  it("invisível só quando o ADM permite", () => {
    assert.equal(ficaInvisivel({ ativo: true, ausente: true, invisivel: true }, { invisivel: true }), true);
    assert.equal(ficaInvisivel({ ativo: true, ausente: true, invisivel: false }, { invisivel: true }), false);
  });
  it("schemas estritos", () => {
    assert.equal(configPresencaSchema.safeParse({ ativo: true, ausente: false, invisivel: true }).success, true);
    assert.equal(configPresencaSchema.safeParse({ ativo: true, ausente: false, invisivel: true, x: 1 }).success, false);
    assert.equal(prefsPresencaSchema.safeParse({ invisivel: "1" }).success, false);
  });
});

describe("presença: a lista do grupo", () => {
  it("uma pessoa por item, o melhor estado entre as abas, sem invisíveis, ordenada pelo id", () => {
    const l = listaPresenca([
      { id: 5, estado: "ausente", invisivel: false },
      { id: 2, estado: "ausente", invisivel: false },
      { id: 5, estado: "online", invisivel: false },
      { id: 5, estado: "ausente", invisivel: false },
      { id: 9, estado: "online", invisivel: true },
    ]);
    assert.deepEqual(l, [
      [2, "a"],
      [5, "o"],
    ]);
  });
  it("sem ausentes quando o ADM não os mostra", () => {
    assert.deepEqual(
      listaPresenca(
        [
          { id: 1, estado: "ausente", invisivel: false },
          { id: 3, estado: "online", invisivel: false },
        ],
        false,
      ),
      [[3, "o"]],
    );
  });
  it("mensagens: só o formato esperado", () => {
    assert.equal(lerEstadoMensagem('{"estado":"ausente"}'), "ausente");
    assert.equal(lerEstadoMensagem('{"estado":"dormindo"}'), null);
    assert.equal(lerEstadoMensagem("ping"), null);
    assert.equal(lerEstadoMensagem("x".repeat(200)), null);
    const m = lerListaMensagem(JSON.stringify({ t: "presenca", p: [[1, "o"], [2, "a"], ["x", "o"], [3, "z"]] }));
    assert.deepEqual([...(m ?? [])], [
      [1, "online"],
      [2, "ausente"],
    ]);
    assert.equal(lerListaMensagem('{"t":"mudou"}'), null);
  });
  it("tela: você primeiro, depois online e ausente pelo nome; só quem está no diretório", () => {
    const pessoas = [
      { id: 1, nome: "Zeca", apelido: null },
      { id: 2, nome: "Bruna", apelido: null },
      { id: 3, nome: "Ana", apelido: null },
      { id: 4, nome: "Carla", apelido: "Cacá" },
    ];
    const estados = new Map([
      [1, "online" as const],
      [2, "ausente" as const],
      [3, "online" as const],
      [4, "online" as const],
      [99, "online" as const],
    ]);
    const l = ordenarPresenca(pessoas, estados, 2);
    assert.deepEqual(
      l.map((x) => [x.pessoa.id, x.estado, x.voce]),
      [
        [2, "ausente", true],
        [3, "online", false],
        [4, "online", false],
        [1, "online", false],
      ],
    );
  });
});
