import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_DESTAQUES_ACESSO, TEXTOS_ACESSO_PADRAO, textosAcesso } from "../src/lib/acesso-core.ts";
import { soAparencia } from "../src/lib/theme.ts";
import { aparenciaSchema } from "../src/lib/theme-validation.ts";

describe("textos da tela de acesso", () => {
  it("nada gravado = os padrões; lixo não quebra", () => {
    assert.deepEqual(textosAcesso(undefined), TEXTOS_ACESSO_PADRAO);
    assert.deepEqual(textosAcesso("x"), TEXTOS_ACESSO_PADRAO);
    assert.deepEqual(textosAcesso({ titulo: 42 }).titulo, TEXTOS_ACESSO_PADRAO.titulo);
  });

  it("gravado vale; vazio volta ao padrão; destaque sem título some; no máximo 3", () => {
    const t = textosAcesso({
      rotulo: "  PCA 2027 ",
      titulo: "",
      aviso: "Só servidores.",
      destaques: [{ titulo: "A", texto: "a" }, { titulo: "", texto: "some" }, { titulo: "C", texto: "" }, { titulo: "D", texto: "d" }],
    });
    assert.equal(t.rotulo, "PCA 2027");
    assert.equal(t.titulo, TEXTOS_ACESSO_PADRAO.titulo);
    assert.equal(t.aviso, "Só servidores.");
    assert.deepEqual(t.destaques, [{ titulo: "A", texto: "a" }, { titulo: "C", texto: "" }]);
    assert.equal(textosAcesso({ destaques: [] }).destaques.length, 0);
    assert.ok(textosAcesso({ destaques: Array(9).fill({ titulo: "x", texto: "" }) }).destaques.length <= MAX_DESTAQUES_ACESSO);
  });

  it("schema do ADM e a rota da aparência levam o bloco `acesso`", () => {
    const ok = aparenciaSchema.safeParse({ acesso: { ...TEXTOS_ACESSO_PADRAO } });
    assert.equal(ok.success, true);
    assert.equal(aparenciaSchema.safeParse({ acesso: { ...TEXTOS_ACESSO_PADRAO, titulo: "x".repeat(500) } }).success, false);
    assert.equal(aparenciaSchema.safeParse({ acesso: { ...TEXTOS_ACESSO_PADRAO, destaques: Array(4).fill({ titulo: "a", texto: "b" }) } }).success, false);
    assert.deepEqual(soAparencia({ acesso: { rotulo: "r" }, avaliacao: {} }), { acesso: { rotulo: "r" } });
  });
});
