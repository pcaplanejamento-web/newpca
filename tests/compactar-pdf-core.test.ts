import { test } from "node:test";
import assert from "node:assert/strict";
import { cabe, limiteAlvo, ehPdf, etapasCompactacao, LIMITE_DOCUMENTO, nomeDoDocumento, tamanhoBase64 } from "../src/lib/compactar-pdf-core.ts";

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

test("limiteAlvo: % sobre o original, nunca acima de 100 KB", () => {
  assert.equal(limiteAlvo(400_000, 0), LIMITE_DOCUMENTO);
  assert.equal(limiteAlvo(80_000, 50), 40_000);
  assert.equal(limiteAlvo(400_000, 50), LIMITE_DOCUMENTO);
  assert.equal(limiteAlvo(10_000, 90), 1_000);
});
