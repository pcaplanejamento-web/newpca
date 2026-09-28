import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aplicarAcaoTexto, lerInline, lerTextoFormatado, textoPlano } from "../src/lib/texto-formatado.ts";

describe("texto formatado (markdown restrito)", () => {
  it("inline: negrito, itálico, código, link http(s), url solta e @menção; link de outro esquema vira texto", () => {
    assert.deepEqual(lerInline("a **b** c"), [{ t: "texto", v: "a " }, { t: "negrito", f: [{ t: "texto", v: "b" }] }, { t: "texto", v: " c" }]);
    assert.deepEqual(lerInline("*x* e _y_"), [{ t: "italico", f: [{ t: "texto", v: "x" }] }, { t: "texto", v: " e " }, { t: "italico", f: [{ t: "texto", v: "y" }] }]);
    assert.deepEqual(lerInline("`a*b*`"), [{ t: "codigo", v: "a*b*" }]);
    assert.deepEqual(lerInline("[site](https://ex.com/a)"), [{ t: "link", href: "https://ex.com/a", f: [{ t: "texto", v: "site" }] }]);
    assert.deepEqual(lerInline("[x](javascript:alert(1))"), [{ t: "texto", v: "[x](javascript:alert(1))" }]);
    assert.deepEqual(lerInline("veja https://ex.com."), [{ t: "texto", v: "veja " }, { t: "link", href: "https://ex.com", f: [{ t: "texto", v: "https://ex.com" }] }, { t: "texto", v: "." }]);
    assert.deepEqual(lerInline("oi @ana.souza!"), [{ t: "texto", v: "oi " }, { t: "mencao", v: "@ana.souza" }, { t: "texto", v: "!" }]);
    // e-mail não é menção; asterisco solto (2 * 3) não é itálico.
    assert.deepEqual(lerInline("a@b.com e 2 * 3 * 4"), [{ t: "texto", v: "a@b.com e 2 * 3 * 4" }]);
  });

  it("blocos: título, listas, citação, separador e parágrafos com quebra", () => {
    const b = lerTextoFormatado("# Passos\n- um\n- dois\n1. a\n2. b\n\nlinha 1\nlinha 2\n> citado\n---");
    assert.deepEqual(
      b.map((x) => x.t),
      ["titulo", "lista", "lista", "par", "citacao", "separador"],
    );
    assert.equal(b[1].t === "lista" && !b[1].ordenada && b[1].itens.length, 2);
    assert.equal(b[2].t === "lista" && b[2].ordenada, true);
    assert.deepEqual(b[3].t === "par" && b[3].f.map((n) => n.t), ["texto", "quebra", "texto"]);
    assert.deepEqual(lerTextoFormatado(null), []);
    assert.equal(textoPlano("**Oi** _você_\n- a\n- b"), "Oi você a · b");
  });

  it("editor: envolve a seleção ou insere a marcação; lista alterna o prefixo nas linhas", () => {
    assert.deepEqual(aplicarAcaoTexto("abc", 1, 2, "negrito"), { texto: "a**b**c", ini: 3, fim: 4 });
    assert.deepEqual(aplicarAcaoTexto("", 0, 0, "italico"), { texto: "*texto*", ini: 1, fim: 6 });
    const l = aplicarAcaoTexto("um\ndois", 0, 5, "lista");
    assert.equal(l.texto, "- um\n- dois");
    assert.equal(aplicarAcaoTexto(l.texto, 0, l.texto.length, "lista").texto, "um\ndois");
    assert.equal(aplicarAcaoTexto("a\nb", 0, 3, "numerada").texto, "1. a\n2. b");
    assert.equal(aplicarAcaoTexto("site", 0, 4, "link").texto, "[site](https://)");
  });
});
