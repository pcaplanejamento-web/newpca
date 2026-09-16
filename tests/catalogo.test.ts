import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogoItemImportSchema,
  catalogoOpSchema,
  normalizarTipos,
  patchCatalogoSchema,
  patchItensTiposSchema,
  tiposDfdSchema,
} from "../src/lib/catalogo-validation.ts";

// Testes puros do schema do Catálogo (fonte única cliente+servidor).

describe("catalogo-validation", () => {
  it("tiposDfdSchema aceita subconjunto de TIPOS_DFD e rejeita inválido", () => {
    assert.deepEqual(tiposDfdSchema.parse(["DFD-S", "DFD-R"]), ["DFD-S", "DFD-R"]);
    assert.deepEqual(tiposDfdSchema.parse(undefined), []); // default
    assert.throws(() => tiposDfdSchema.parse(["DFD-X"]));
  });

  it("normalizarTipos remove duplicados e ordena na ordem canônica", () => {
    assert.deepEqual(normalizarTipos(["DFD-R", "DFD-S", "DFD-R"]), ["DFD-S", "DFD-R"]);
    assert.deepEqual(normalizarTipos(["lixo"]), []);
    assert.deepEqual(normalizarTipos([]), []);
  });

  it("catalogoItemImportSchema aplica defaults para campos ausentes", () => {
    const r = catalogoItemImportSchema.parse({ codigo: "524177339", descricao: "Recarga de gás" });
    assert.equal(r.sequencial, null);
    assert.equal(r.unidade, null);
    assert.equal(r.codigoRaw, null);
    assert.throws(() => catalogoItemImportSchema.parse({ codigo: "", descricao: "x" }));
  });

  it("catalogoOpSchema (start) exige nome e ao menos 1 linha", () => {
    const ok = catalogoOpSchema.parse({
      mode: "start-catalogo",
      nome: "Catálogo Gás",
      tiposPadrao: ["DFD-S"],
      totalItens: 1,
      rows: [{ codigo: "524177339", descricao: "Recarga de gás", unidade: "UNIDADE", sequencial: 1 }],
    });
    assert.equal(ok.mode, "start-catalogo");
    if (ok.mode === "start-catalogo") assert.equal(ok.catalogoId, null); // default (catálogo novo)
    assert.throws(() =>
      catalogoOpSchema.parse({ mode: "start-catalogo", nome: "", tiposPadrao: [], totalItens: 0, rows: [] }),
    );
  });

  it("catalogoOpSchema (append) exige catalogoId e desde", () => {
    const ap = catalogoOpSchema.parse({
      mode: "append-catalogo-itens",
      catalogoId: 3,
      desde: 200,
      rows: [{ codigo: "1", descricao: "x", unidade: null, sequencial: null }],
    });
    assert.equal(ap.mode, "append-catalogo-itens");
    assert.throws(() =>
      catalogoOpSchema.parse({ mode: "append-catalogo-itens", desde: 0, rows: [{ codigo: "1", descricao: "x" }] }),
    );
  });

  it("patchCatalogoSchema exige ao menos um campo", () => {
    assert.deepEqual(patchCatalogoSchema.parse({ nome: "Novo nome" }).nome, "Novo nome");
    assert.throws(() => patchCatalogoSchema.parse({}));
  });

  it("patchItensTiposSchema exige ids e valida tipos", () => {
    assert.throws(() => patchItensTiposSchema.parse({ ids: [], tipos: [] }));
    const p = patchItensTiposSchema.parse({ ids: [1, 2], tipos: ["DFD-O"] });
    assert.deepEqual(p.tipos, ["DFD-O"]);
    assert.throws(() => patchItensTiposSchema.parse({ ids: [1], tipos: ["ZZZ"] }));
  });
});
