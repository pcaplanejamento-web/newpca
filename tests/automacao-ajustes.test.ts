import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AJUSTES_PADRAO, aplicarAjustes, lerAjustesCenti, lerMapaEntidades, MAX_MAPA_ENTIDADES, textoMudancaAjustes } from "../src/lib/automacao-ajustes-core.ts";
import { ajustesCentiPatchSchema } from "../src/lib/automacao-validation.ts";

describe("Ajustes da Automação — no sistema, os mesmos da tela e do banner da extensão", () => {
  it("qualquer JSON vira ajustes válidos (o que faltar = o padrão)", () => {
    assert.deepEqual(lerAjustesCenti(null), AJUSTES_PADRAO);
    assert.deepEqual(lerAjustesCenti({ valorReferencia: "sim", emitirData: true, entidades: 5 }), { ...AJUSTES_PADRAO, emitirData: true });
    assert.equal(lerAjustesCenti({ entidades: "x".repeat(400) }).entidades.length, 300);
  });
  it("o mapa só guarda órgão válido → ID válido, até o teto", () => {
    assert.deepEqual(lerMapaEntidades({ "o:12": " 02 ", "t:FUNDO": "03", lixo: "04", "o:13": "a b", "o:14": 5 }), { "o:12": "02", "t:FUNDO": "03" });
    const grande = Object.fromEntries(Array.from({ length: MAX_MAPA_ENTIDADES + 50 }, (_, i) => [`o:${i}`, "02"]));
    assert.equal(Object.keys(lerMapaEntidades(grande)).length, MAX_MAPA_ENTIDADES);
  });
  it("aplica a mudança parcial; um órgão do mapa entra ou sai sem mexer nos outros", () => {
    const a = { ...AJUSTES_PADRAO, mapa: { "o:1": "02" } };
    const b = aplicarAjustes(a, { ajustes: { emitirData: true } });
    assert.deepEqual(b, { ...a, emitirData: true }, "o mapa fica");
    const c = aplicarAjustes(b, { entidade: { orgao: "o:2", entidade: "03" } });
    assert.deepEqual(c.mapa, { "o:1": "02", "o:2": "03" });
    const d = aplicarAjustes(c, { entidade: { orgao: "o:1", entidade: "" } });
    assert.deepEqual(d.mapa, { "o:2": "03" }, "vazio tira");
    assert.deepEqual(aplicarAjustes(d, { ajustes: { mapa: { "o:9": "09" } } }).mapa, { "o:9": "09" }, "o mapa inteiro (a migração do aparelho)");
  });
  it("o que mudou em texto (auditoria)", () => {
    const antes = AJUSTES_PADRAO;
    assert.deepEqual(textoMudancaAjustes(antes, antes), []);
    assert.deepEqual(textoMudancaAjustes(antes, { ...antes, valorReferencia: false, entidades: "02" }), ["Emitir valor de referência: não", "IDs de órgão a tentar: 02"]);
  });
  it("o pedido: só os campos conhecidos, nada vazio, operação com GUID válido", () => {
    assert.ok(ajustesCentiPatchSchema.safeParse({ ajustes: { emitirData: true } }).success);
    assert.ok(ajustesCentiPatchSchema.safeParse({ gravacao: false }).success);
    assert.ok(ajustesCentiPatchSchema.safeParse({ entidade: { orgao: "o:12", entidade: "" } }).success);
    assert.ok(ajustesCentiPatchSchema.safeParse({ operacao: { moduleKey: 120477, guid: "1449d1d1-85f8-8080-7f63-df246a9e7f80" } }).success);
    assert.ok(!ajustesCentiPatchSchema.safeParse({}).success, "nada a mudar");
    assert.ok(!ajustesCentiPatchSchema.safeParse({ ajustes: { senha: "x" } }).success, "campo desconhecido");
    assert.ok(!ajustesCentiPatchSchema.safeParse({ outro: 1 }).success);
    assert.ok(!ajustesCentiPatchSchema.safeParse({ operacao: { moduleKey: 1, guid: "x" } }).success);
    assert.ok(!ajustesCentiPatchSchema.safeParse({ entidade: { orgao: "x", entidade: "02" } }).success, "chave de órgão inválida");
  });
});
