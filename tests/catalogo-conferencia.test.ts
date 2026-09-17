import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type CatalogoRef, conferirItem, itensIguais, piorFalta, ROTULO_FALTA_CATALOGO, similaridade } from "../src/lib/catalogo-conferencia.ts";

const ref = (over: Partial<CatalogoRef> = {}): CatalogoRef => ({
  codigo: "5241948381",
  codigoRaw: "5241948381",
  descricao: "ÁGUA MINERAL NATURAL, SEM GÁS, GARRAFA 500 ML",
  unidade: "UNIDADE",
  tipos: [],
  catalogoNome: "Gêneros",
  ...over,
});
const item = (over: Partial<{ codigo: string | null; descricao: string | null; unidade: string | null }> = {}) => ({
  codigo: "5241948381",
  descricao: "ÁGUA MINERAL NATURAL, SEM GÁS, GARRAFA 500 ML",
  unidade: "UNIDADE",
  ...over,
});

describe("catalogo-conferencia", () => {
  it("item sem código → sem veredito", () => {
    assert.deepEqual(conferirItem(item({ codigo: null }), null, "DFD-S").faltas, []);
    assert.deepEqual(conferirItem(item({ codigo: "" }), ref(), "DFD-S").faltas, []);
  });

  it("conforme (descrição/unidade batem, tipo permitido) → sem faltas", () => {
    const r = conferirItem(item(), ref({ tipos: ["DFD-S"] }), "DFD-S");
    assert.deepEqual(r.faltas, []);
    assert.equal(r.sugestao, null);
  });

  it("código com pontos normaliza e casa com a entrada", () => {
    const r = conferirItem(item({ codigo: "524.194.8381" }), ref(), "DFD-S");
    assert.deepEqual(r.faltas, []); // 524.194.8381 → 5241948381
  });

  it("divergência de descrição → divergenteCatalogo + sugestão canônica (UND ≡ UNIDADE não diverge)", () => {
    const r = conferirItem(item({ descricao: "agua mineral 500ml", unidade: "UND" }), ref(), "DFD-S");
    assert.deepEqual(r.faltas, ["divergenteCatalogo"]);
    assert.equal(r.divergDescricao, true);
    assert.equal(r.divergUnidade, false); // UND é sinônimo de UNIDADE
    assert.equal(r.sugestao?.codigo, "5241948381");
    assert.equal(r.sugestao?.score, 1);
  });

  it("unidade divergente de verdade (KG vs UNIDADE)", () => {
    const r = conferirItem(item({ unidade: "KG" }), ref(), "DFD-S");
    assert.deepEqual(r.faltas, ["divergenteCatalogo"]);
    assert.equal(r.divergUnidade, true);
    assert.equal(r.divergDescricao, false);
  });

  it("tipo incompatível (DFD-O fora dos tipos do item)", () => {
    const r = conferirItem(item(), ref({ tipos: ["DFD-S", "DFD-R"] }), "DFD-O");
    assert.deepEqual(r.faltas, ["tipoIncompativel"]);
  });

  it("tipos vazio = sem restrição de tipo", () => {
    assert.deepEqual(conferirItem(item(), ref({ tipos: [] }), "DFD-O").faltas, []);
  });

  it("não catalogado → naoCatalogado + sugestão por semelhança de descrição", () => {
    const cand = ref({ codigo: "999", codigoRaw: "999", descricao: "ÁGUA MINERAL NATURAL SEM GÁS GARRAFA 500 ML CATMAT 445484" });
    const r = conferirItem(item({ codigo: "123456", descricao: "ÁGUA MINERAL NATURAL SEM GÁS GARRAFA 500 ML" }), null, "DFD-S", [cand]);
    assert.deepEqual(r.faltas, ["naoCatalogado"]);
    assert.equal(r.sugestao?.codigo, "999");
    assert.ok((r.sugestao?.score ?? 0) >= 0.5);
  });

  it("não catalogado sem semelhante suficiente → sem sugestão", () => {
    const cand = ref({ codigo: "999", descricao: "PARAFUSO SEXTAVADO ZINCADO 10MM ROSCA FINA" });
    const r = conferirItem(item({ codigo: "123456", descricao: "ÁGUA MINERAL NATURAL SEM GÁS" }), null, "DFD-S", [cand]);
    assert.deepEqual(r.faltas, ["naoCatalogado"]);
    assert.equal(r.sugestao, null);
  });

  it("similaridade: iguais (acento à parte) = 1, disjuntas = 0, vazia = 0", () => {
    assert.equal(similaridade("ÁGUA MINERAL NATURAL", "AGUA MINERAL NATURAL"), 1);
    assert.equal(similaridade("ÁGUA MINERAL", "PARAFUSO SEXTAVADO"), 0);
    assert.equal(similaridade("", "x"), 0);
  });

  it("piorFalta: precedência naoCatalogado > tipoIncompativel > divergenteCatalogo; [] → null", () => {
    assert.equal(piorFalta([]), null);
    assert.equal(piorFalta(["divergenteCatalogo", "naoCatalogado"]), "naoCatalogado");
    assert.equal(piorFalta(["divergenteCatalogo", "tipoIncompativel"]), "tipoIncompativel");
    assert.equal(piorFalta(["divergenteCatalogo"]), "divergenteCatalogo");
    assert.equal(ROTULO_FALTA_CATALOGO.naoCatalogado, "Fora do catálogo");
    assert.equal(ROTULO_FALTA_CATALOGO.tipoIncompativel, "Tipo incompatível");
  });

  it("itensIguais: descrição+unidade normalizadas (UND ≡ UNIDADE) → true; KG vs UNIDADE → false", () => {
    assert.equal(
      itensIguais({ descricao: "ÁGUA MINERAL 500ML", unidade: "UND" }, { descricao: "agua mineral 500ml", unidade: "UNIDADE" }),
      true,
    );
    assert.equal(itensIguais({ descricao: "AÇÚCAR", unidade: "KG" }, { descricao: "AÇÚCAR", unidade: "UNIDADE" }), false);
    assert.equal(itensIguais({ descricao: "CANETA AZUL", unidade: "UNIDADE" }, { descricao: "CANETA PRETA", unidade: "UNIDADE" }), false);
    assert.equal(itensIguais({ descricao: "X", unidade: null }, { descricao: "x", unidade: null }), true);
  });
});
