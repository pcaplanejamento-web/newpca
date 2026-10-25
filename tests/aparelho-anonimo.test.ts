import assert from "node:assert/strict";
import { test } from "node:test";
import { aparelhoTemporario, COTA_ANONIMA, indicioPelaCota } from "../src/lib/aparelho-anonimo-core.ts";

const CHROME = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const SAFARI = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

test("indício pela cota: Chromium com cota baixa = provável; alta = não; outros = desconhecido", () => {
  assert.equal(indicioPelaCota(300 * 1024 ** 2, CHROME), "provavel");
  assert.equal(indicioPelaCota(COTA_ANONIMA * 20, CHROME), "nao");
  assert.equal(indicioPelaCota(300 * 1024 ** 2, SAFARI), "desconhecido");
  assert.equal(indicioPelaCota(null, CHROME), "desconhecido");
  assert.equal(indicioPelaCota(0, CHROME), "desconhecido");
});

test("temporário: usado só no dia do vínculo e o mesmo navegador nomeou outro depois", () => {
  const a = { id: 1, navegador: "Chrome no Windows", criadoEm: "2026-10-01T10:00:00Z", vistoEm: "2026-10-01T11:00:00Z" };
  const b = { id: 2, navegador: "Chrome no Windows", criadoEm: "2026-10-03T10:00:00Z", vistoEm: null };
  assert.equal(aparelhoTemporario(a, [a, b]), true);
  assert.equal(aparelhoTemporario(a, [a]), false);
  assert.equal(aparelhoTemporario({ ...a, vistoEm: "2026-10-05T10:00:00Z" }, [a, b]), false);
  assert.equal(aparelhoTemporario(a, [a, { ...b, navegador: "Safari no iOS" }]), false);
});
