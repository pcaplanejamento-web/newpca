import { test } from "node:test";
import assert from "node:assert/strict";
import { cabe, NIVEIS_LEGIVEIS, versoesEscolhiveis, ehPdf, etapasCompactacao, LIMITE_DOCUMENTO, nomeDoDocumento, partesDe, parteValida, TAMANHO_PARTE } from "../src/lib/compactar-pdf-core.ts";

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

test("nome do documento", () => {
  assert.ok(nomeDoDocumento("relatorio.pdf").length > 0);
});

test("partes: um PDF de 3,8 MB vira 4 partes; só a última é menor", () => {
  const total = Math.round(3.8 * 1024 * 1024);
  assert.equal(partesDe(total), 4);
  assert.ok(parteValida(0, TAMANHO_PARTE, total));
  assert.ok(parteValida(3, total - 3 * TAMANHO_PARTE, total));
  assert.ok(!parteValida(3, TAMANHO_PARTE, total));
  assert.ok(!parteValida(4, 1, total));
  assert.ok(parteValida(0, 500, 500));
});

test("versoesEscolhiveis: o original de 3,8 MB fica na barra (teto do ADM)", () => {
  const v = versoesEscolhiveis([{ tamanho: 3_984_588, rotulo: "Original" }, { tamanho: 400_000, rotulo: "Mínimo" }]);
  assert.deepEqual(v.map((x) => x.rotulo), ["Original", "Mínimo"]);
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
