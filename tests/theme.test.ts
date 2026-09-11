import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aparenciaToCss, parseAparencia } from "../src/lib/theme.ts";

describe("theme — aparenciaToCss (serialização segura)", () => {
  it("serializa cores válidas por tema", () => {
    const css = aparenciaToCss({ cores: { light: { accent: "#123456" }, dark: { bg: "#000" } } });
    assert.ok(css.includes('[data-theme="light"]{--accent:#123456;}'));
    assert.ok(css.includes('[data-theme="dark"]{--bg:#000;}'));
  });

  it("anti-XSS: ignora chave fora da allowlist e valor não-hex", () => {
    const css = aparenciaToCss({
      cores: { light: { accent: "red;}</style><script>alert(1)</script>", hacker: "#fff", surface: "#ffffff" } },
    });
    assert.ok(!css.includes("script"));
    assert.ok(!css.includes("hacker"));
    assert.ok(css.includes("--surface:#ffffff;"));
    assert.ok(!css.includes("--accent")); // valor inválido descartado
  });

  it("raio clampado em [0,24]", () => {
    assert.ok(aparenciaToCss({ radius: 999 }).includes("--radius-card:24px;"));
    assert.ok(aparenciaToCss({ radius: -5 }).includes("--radius-card:0px;"));
  });

  it("vazio → css vazio", () => {
    assert.equal(aparenciaToCss({}), "");
  });

  it("parseAparencia tolera null/JSON inválido", () => {
    assert.deepEqual(parseAparencia(null), {});
    assert.deepEqual(parseAparencia("não-json"), {});
    assert.deepEqual(parseAparencia('{"radius":10}'), { radius: 10 });
  });
});
