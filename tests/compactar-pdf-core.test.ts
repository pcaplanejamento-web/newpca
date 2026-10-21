import { test } from "node:test";
import assert from "node:assert/strict";
import { cabe, NIVEIS_LEGIVEIS, versoesEscolhiveis, ehPdf, etapasCompactacao, LIMITE_DOCUMENTO, nomeDoDocumento, tamanhoBase64 } from "../src/lib/compactar-pdf-core.ts";

test("limite e cabe", () => {
  assert.equal(LIMITE_DOCUMENTO, 102400);
  assert.ok(cabe(LIMITE_DOCUMENTO));
  assert.ok(!cabe(LIMITE_DOCUMENTO + 1));
});

test("escada vai da melhor à menor qualidade", () => {
  const e = etapasCompactacao();
  assert.ok(e.length > 2);
  for (let i = 1; i < e.length; i++) assert.ok(e[i].escala * e[i].qualidade <= e[i - 1].escala * e[i - 1].qualidade);
});

test("ehPdf pelo cabeçalho", () => {
  assert.ok(ehPdf(new TextEncoder().encode("%PDF-1.7 x")));
  assert.ok(!ehPdf(new TextEncoder().encode("PK..")));
});

test("nome e base64", () => {
  assert.ok(nomeDoDocumento("relatorio.pdf").length > 0);
  assert.equal(tamanhoBase64(4), 8);
});

test("versoesEscolhiveis: do maior ao menor, dentro do limite, cada passo menor", () => {
  const v = versoesEscolhiveis(
    [
      { tamanho: 50_000, rotulo: "b" },
      { tamanho: 2_000_000, rotulo: "grande" },
      { tamanho: 300_000, rotulo: "a" },
      { tamanho: 49_500, rotulo: "quase igual" },
    ],
    1_000_000,
  );
  assert.deepEqual(v.map((x) => x.rotulo), ["a", "b"]);
  assert.equal(NIVEIS_LEGIVEIS[NIVEIS_LEGIVEIS.length - 1].escala, 1.25);
});
