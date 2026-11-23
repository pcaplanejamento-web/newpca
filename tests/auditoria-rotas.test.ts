import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { disparoValido, gravarDisparoMesa, lerDisparoMesa, temDisparoMesa, VALIDADE_DISPARO_MS } from "../src/lib/automacao-mesa.ts";
import { comandosGravarConferencia, comandosGravarExecucao, condicaoExecucao, fatiasJson, planoConferencia } from "../src/lib/automacao-dfds-sql.ts";
import { comandoGuardarRetrato } from "../src/lib/conferencia-centi-sql.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

function banco() {
  const db = bancoMigrado();
  for (let i = 1; i <= 5; i++) db.prepare("INSERT INTO dfds (id, numero) VALUES (?, ?)").run(i, `N${i}`);
  return { db, orm: drizzle(d1Sobre(db) as never, { schema }) };
}

// sessionStorage/window falsos (o disparo da Mesa mora na aba).
function abaFalsa() {
  const m = new Map<string, string>();
  (globalThis as Record<string, unknown>).sessionStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
  (globalThis as Record<string, unknown>).window = { dispatchEvent: () => true };
  return m;
}

test("disparo da Mesa vencido não roda horas depois (nem o formato sem data)", () => {
  const m = abaFalsa();
  assert.equal(gravarDisparoMesa({ fluxoId: 7, itens: [{ id: 1 }], acao: "corrigir" }), true);
  const agora = Date.now();
  assert.equal(temDisparoMesa(agora), true);
  assert.equal(lerDisparoMesa(agora + VALIDADE_DISPARO_MS + 1), null);
  assert.equal(m.size, 0); // apagado
  gravarDisparoMesa({ fluxoId: 7, itens: [{ id: 1 }] });
  assert.equal(temDisparoMesa(Date.now() + 3 * 60 * 60_000), false);
  assert.equal(m.size, 0);
  m.set("automacao:disparo", JSON.stringify({ fluxoId: 7, itens: [] })); // sem `em`
  assert.equal(lerDisparoMesa(), null);
  gravarDisparoMesa({ fluxoId: 9, itens: [{ id: 2 }], acao: "conferir" });
  assert.deepEqual(lerDisparoMesa(), { fluxoId: 9, itens: [{ id: 2 }], acao: "conferir" });
  assert.equal(disparoValido(undefined, Date.now()), false);
});

test("execução pela CM002: grava a situação só nos DFDs pedidos, numa ida por fatia", async () => {
  const { db, orm } = banco();
  const cmds = comandosGravarExecucao(orm as never, [
    { id: 1, situacao: "Executado" },
    { id: 3, situacao: "Cancelado" },
    { id: 99, situacao: "Executado" }, // não existe: ignorado
  ], "2026-11-23T10:00:00Z");
  assert.equal(cmds.length, 1);
  for (const c of cmds) await c;
  const l = db.prepare("SELECT id, execucao_centi s, execucao_centi_em em FROM dfds ORDER BY id").all() as { id: number; s: string | null; em: string | null }[];
  assert.deepEqual(l.map((x) => x.s), ["Executado", null, "Cancelado", null, null]);
  assert.equal(l[0].em, "2026-11-23T10:00:00Z");
  assert.equal(l[1].em, null);
});

test("execução pela CM002: a leitura do POST só traz os DFDs pedidos COM planejamento", async () => {
  const { db, orm } = banco();
  db.prepare("UPDATE dfds SET planejamento = id * 10 WHERE id IN (1, 2, 4)").run();
  const ids = async (pedidos: number[]) =>
    ((await orm.select({ id: schema.dfds.id }).from(schema.dfds).where(condicaoExecucao(pedidos))) as { id: number }[]).map((x) => x.id).sort();
  assert.deepEqual(await ids([1, 3, 4, 4, 99]), [1, 4]); // 3 sem planejamento, 99 não existe, repetido uma vez
  assert.deepEqual(await ids([5]), []);
});

test("conferência: status e motivo em lote; o DFD excluído não derruba o retrato dos outros", async () => {
  const { db, orm } = banco();
  for (const c of comandosGravarConferencia(orm as never, [
    { dfdId: 2, status: "divergente", motivo: "Valor total" },
    { dfdId: 4, status: "convergente" },
  ], "2026-11-23T11:00:00Z"))
    await c;
  const l = db.prepare("SELECT id, conferencia_centi s, conferencia_centi_motivo m FROM dfds WHERE id IN (2, 4) ORDER BY id").all() as { s: string; m: string | null }[];
  assert.deepEqual(l.map((x) => [x.s, x.m]), [["divergente", "Valor total"], ["convergente", null]]);
  // O retrato de um id inexistente quebra a FK e volta o lote inteiro — a rota filtra os existentes antes (vivos).
  const ret = (id: number) => comandoGuardarRetrato(orm as never, id, "{}", "2026-11-23T11:00:00Z");
  await assert.rejects(orm.batch([ret(2), ret(812)] as never));
  const existentes = new Set((db.prepare("SELECT id FROM dfds").all() as { id: number }[]).map((x) => x.id));
  const plano = planoConferencia(
    [
      { dfdId: 2, retrato: "{}", pdf: "AA==" },
      { dfdId: 812, retrato: "{}" }, // excluído durante a execução
      { dfdId: 4, retrato: "ruim" }, // retrato que não se lê = ausente
      { dfdId: 5 },
    ],
    existentes,
    (r) => r === "{}",
  );
  assert.deepEqual(plano.vivos.map((x) => x.dfdId), [2, 4, 5]);
  assert.deepEqual(plano.comRetrato.map((x) => x.dfdId), [2]);
  assert.deepEqual(plano.semRetrato, [4, 5]);
  assert.deepEqual(plano.semPdf, [4, 5]);
  await orm.batch(plano.comRetrato.map((x) => ret(x.dfdId)) as never);
  assert.equal((db.prepare("SELECT dfd_id d FROM conferencias_centi_retrato").all() as { d: number }[]).map((x) => x.d).join(), "2");
});

test("fatias do JSON respeitam o teto", () => {
  const itens = Array.from({ length: 10 }, (_, i) => ({ i, s: "x".repeat(100) }));
  const f = fatiasJson(itens, 400);
  assert.ok(f.length > 1);
  assert.equal(f.flat().length, 10);
  for (const x of f) assert.ok(JSON.stringify(x).length <= 400 || x.length === 1);
});
