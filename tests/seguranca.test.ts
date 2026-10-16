import assert from "node:assert/strict";
import { test } from "node:test";
import { excluirPreferenciaSchema, salvarPreferenciaSchema } from "../src/lib/preferencias-validation.ts";
import { avaliarAparelho, lerAparelhos, lerConfigSeguranca, renovarAtividade, resumoNavegador, SEGURANCA_PADRAO, sessaoInativa } from "../src/lib/seguranca-core.ts";

test("config: padrão e valores inválidos", () => {
  assert.deepEqual(lerConfigSeguranca(undefined), SEGURANCA_PADRAO);
  assert.deepEqual(lerConfigSeguranca({ inatividadeMin: 7, alertaAparelho: "x" }), SEGURANCA_PADRAO);
  assert.equal(lerConfigSeguranca({ inatividadeMin: 30 }).inatividadeMin, 30);
});

test("sessão inativa só além do limite; sem limite nunca", () => {
  const agora = Date.parse("2026-10-14T12:00:00Z");
  assert.equal(sessaoInativa("2026-10-14T11:00:00.000Z", agora, 0), false);
  assert.equal(sessaoInativa("2026-10-14T11:31:00.000Z", agora, 30), false);
  assert.equal(sessaoInativa("2026-10-14T11:29:00.000Z", agora, 30), true);
  assert.equal(sessaoInativa("2026-10-14 11:00:00", agora, 30), true); // formato do CURRENT_TIMESTAMP (UTC)
  assert.equal(sessaoInativa(null, agora, 30), false);
});

test("renovar a atividade no máximo a cada 1/4 do limite (≤ 5 min)", () => {
  const agora = Date.parse("2026-10-14T12:00:00Z");
  assert.equal(renovarAtividade("2026-10-14T11:58:00.000Z", agora, 60), false);
  assert.equal(renovarAtividade("2026-10-14T11:54:00.000Z", agora, 60), true);
  assert.equal(renovarAtividade("2026-10-14T11:56:00.000Z", agora, 15), true);
  assert.equal(renovarAtividade(null, agora, 0), true);
});

test("aparelho: o 1º não alerta, o desconhecido alerta, a lista tem teto", () => {
  assert.deepEqual(avaliarAparelho([], "a".repeat(32)), { novo: false, lista: ["a".repeat(32)] });
  const conhecidos = Array.from({ length: 10 }, (_, i) => String(i).repeat(32));
  const r = avaliarAparelho(conhecidos, "f".repeat(32));
  assert.equal(r.novo, true);
  assert.equal(r.lista.length, 10);
  assert.equal(r.lista[0], "f".repeat(32));
  assert.equal(avaliarAparelho(conhecidos, conhecidos[3]).novo, false);
  assert.deepEqual(lerAparelhos({ ids: ["xyz", "a".repeat(32)] }), ["a".repeat(32)]);
});

test("resumo do navegador", () => {
  assert.equal(resumoNavegador("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537"), "Chrome no Windows");
  assert.equal(resumoNavegador("Mozilla/5.0 (iPhone; CPU iPhone OS) Safari/604"), "Safari no iOS");
  assert.equal(resumoNavegador(null), "Navegador");
});

test("preferência genérica não grava chaves reservadas", () => {
  assert.equal(salvarPreferenciaSchema.safeParse({ chave: "seguranca:aparelhos", valor: { ids: [] } }).success, false);
  assert.equal(salvarPreferenciaSchema.safeParse({ chave: "cofre:centi-login", valor: {} }).success, false);
  assert.equal(excluirPreferenciaSchema.safeParse({ chave: "cofre:centi-login" }).success, false);
  assert.equal(salvarPreferenciaSchema.safeParse({ chave: "mesa:dados-completos", valor: { ligado: true } }).success, true);
});
