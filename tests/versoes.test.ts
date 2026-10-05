import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CATALOGO_AVISOS, resolverNotificacoes } from "../src/lib/notificacoes-config-core.ts";
import {
  avisoNovaVersao,
  compararVersoes,
  linkInterno,
  problemasDasVersoes,
  textoMudancas,
  versaoDoAviso,
  VERSAO_ATUAL,
  VERSOES,
  type Versao,
} from "../src/lib/versoes.ts";

describe("versões do sistema", () => {
  it("o registro está em ordem e válido (números, datas, links internos)", () => {
    assert.deepEqual(problemasDasVersoes(), []);
  });

  it("a versão do package.json é a atual do registro", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.version, VERSAO_ATUAL);
    assert.equal(VERSAO_ATUAL, VERSOES[0].versao);
  });

  it("compara por número, não por texto", () => {
    assert.ok(compararVersoes("1.10.0", "1.9.9") > 0);
    assert.ok(compararVersoes("2.0.0", "10.0.0") < 0);
    assert.equal(compararVersoes("1.2.3", "1.2.3"), 0);
  });

  it("acusa versão fora de ordem, link externo e versão sem mudança", () => {
    const ruim: Versao[] = [
      { versao: "1.0.0", data: "2026-10-05", titulo: "A", mudancas: [{ tipo: "novo", area: "X", texto: "x", link: "https://fora.com" }] },
      { versao: "1.1.0", data: "2026-10-01", titulo: "B", mudancas: [] },
    ];
    const p = problemasDasVersoes(ruim);
    assert.ok(p.some((x) => x.includes("não é maior")));
    assert.ok(p.some((x) => x.includes("link externo")));
    assert.ok(p.some((x) => x.includes("sem mudanças")));
    assert.equal(linkInterno("//fora.com"), false);
    assert.equal(linkInterno("/painel/configuracoes?aba=pcas"), true);
  });

  it("o aviso do ADM traz o que mudou, abre as Novidades da versão e é UM por versão", () => {
    const a = avisoNovaVersao(7);
    assert.equal(a.tipo, "versao");
    assert.equal(a.chave, `versao-sistema:${VERSAO_ATUAL}`);
    assert.equal(a.link, null); // o sino abre as Novidades num banner — não há página
    assert.equal(versaoDoAviso(a.titulo), VERSAO_ATUAL);
    assert.equal(versaoDoAviso("Nova versão 1.2.0 — Configurações reorganizadas"), "1.2.0");
    assert.equal(versaoDoAviso("Nova versão 9.9.9 — inexistente"), VERSAO_ATUAL);
    for (const m of VERSOES[0].mudancas.slice(0, 4)) assert.ok(a.texto.includes(m.texto));
    const muitas: Versao = { versao: "9.0.0", data: "2026-10-05", titulo: "T", mudancas: Array.from({ length: 6 }, (_, i) => ({ tipo: "novo" as const, area: "A", texto: `m${i}` })) };
    assert.match(textoMudancas(muitas), /e mais 2 mudanças$/);
  });

  it("o aviso está no catálogo: no sino, sem e-mail por padrão", () => {
    assert.ok(CATALOGO_AVISOS.some((i) => i.chave === "versao"));
    const cfg = resolverNotificacoes(undefined);
    assert.equal(cfg.versao.sino, true);
    assert.equal(cfg.versao.email, false);
  });
});
