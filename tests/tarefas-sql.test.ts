import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { coerceModeloQuadro } from "../src/lib/tarefas-core.ts";
import {
  comandosCriarQuadroDoModelo,
  comandosCriarTarefa,
  comandosMassa,
  comandosMover,
  comandosNotificacoes,
  comandosVinculos,
} from "../src/lib/tarefas-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// TAREFAS pelos MESMOS builders do servidor, no driver `drizzle-orm/d1` REAL e DENTRO de `db.batch`.
const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("tarefas — criar/mover/vínculos (builders no db.batch do D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const base = { quadroId: 1, descricao: null, prioridade: "media" as const, inicio: null, prazo: null, concluida: false, criadoPor: 9501 };
  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9501, 'Ana', 'a@x', 'h'), (9502, 'Bia', 'b@x', 'h')");
    db.exec("INSERT INTO grupos (id, nome) VALUES (9500, 'Planejamento')");
    db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (1, 9500, 'Rotinas')");
    db.exec("INSERT INTO tarefa_listas (id, quadro_id, nome, ordem, concluida) VALUES (1, 1, 'A fazer', 1, 0), (2, 1, 'Concluído', 2, 1)");
    db.exec("INSERT INTO tarefa_etiquetas (id, quadro_id, nome, cor) VALUES (1, 1, 'Urgente', '#ff0000')");
  });

  it("cria com ticket sequencial, no fim da lista, com responsáveis e etiquetas — tudo num lote", async () => {
    const r1 = await orm.batch(comandosCriarTarefa(orm, { ...base, listaId: 1, titulo: "Primeira", pessoas: [9501, 9502], etiquetas: [1] }));
    const r2 = await orm.batch(comandosCriarTarefa(orm, { ...base, listaId: 1, titulo: "Segunda", pessoas: [], etiquetas: [] }));
    assert.deepEqual(r1.at(-1), [{ id: 1, ticket: 1 }]);
    assert.deepEqual(r2.at(-1), [{ id: 2, ticket: 2 }]);
    const ts = db.prepare("SELECT id, ticket, ordem FROM tarefas ORDER BY id").all() as { id: number; ticket: number; ordem: number }[];
    assert.deepEqual(ts.map((t) => [t.ticket, t.ordem]), [[1, 1], [2, 2]]);
    assert.equal((db.prepare("SELECT prox_ticket AS p FROM tarefa_quadros WHERE id = 1").get() as { p: number }).p, 3);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_pessoas WHERE tarefa_id = 1").get() as { n: number }).n, 2);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_etiqueta_links WHERE tarefa_id = 1").get() as { n: number }).n, 1);
  });

  it("mover para a lista de concluídas marca a conclusão (e renumera quando pedido); voltar desmarca", async () => {
    await orm.batch(comandosMover(orm, 1, 2, 1, true) as never);
    let t = db.prepare("SELECT lista_id AS l, concluida_em AS c FROM tarefas WHERE id = 1").get() as { l: number; c: string | null };
    assert.equal(t.l, 2);
    assert.ok(t.c);
    await orm.batch(comandosMover(orm, 1, 1, 0.5, false, [[2, 7]]) as never);
    t = db.prepare("SELECT lista_id AS l, concluida_em AS c FROM tarefas WHERE id = 1").get() as { l: number; c: string | null };
    assert.deepEqual([t.l, t.c], [1, null]);
    assert.equal((db.prepare("SELECT ordem AS o FROM tarefas WHERE id = 2").get() as { o: number }).o, 7);
  });

  it("troca responsáveis e etiquetas (undefined = não mexe)", async () => {
    await orm.batch(comandosVinculos(orm, 1, { pessoas: [9502] }) as never);
    const ps = db.prepare("SELECT usuario_id AS u FROM tarefa_pessoas WHERE tarefa_id = 1").all() as { u: number }[];
    assert.deepEqual(ps.map((p) => p.u), [9502]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_etiqueta_links WHERE tarefa_id = 1").get() as { n: number }).n, 1);
  });

  it("observador: responsável prevalece; virar responsável tira da observação", async () => {
    const papeis = () =>
      (db.prepare("SELECT usuario_id AS u, papel AS p FROM tarefa_pessoas WHERE tarefa_id = 1 ORDER BY usuario_id").all() as { u: number; p: string }[]).map(
        (r) => `${r.u}:${r.p}`,
      );
    await orm.batch(comandosVinculos(orm, 1, { observadores: [9501, 9502] }) as never);
    assert.deepEqual(papeis(), ["9501:observador", "9502:responsavel"]);
    await orm.batch(comandosVinculos(orm, 1, { pessoas: [9501, 9502], observadores: [] }) as never);
    assert.deepEqual(papeis(), ["9501:responsavel", "9502:responsavel"]);
  });

  it("massa: mover leva ao FIM da lista de destino (na ordem) e conclui; responsável/etiqueta/prioridade/arquivar", async () => {
    await orm.batch(comandosMassa(orm, [1, 2], { campo: "lista", listaId: 2 }, true) as never);
    const ts = db.prepare("SELECT id, lista_id AS l, ordem AS o, concluida_em AS c FROM tarefas ORDER BY id").all() as {
      id: number;
      l: number;
      o: number;
      c: string | null;
    }[];
    assert.deepEqual(ts.map((t) => [t.l, t.o]), [[2, 1], [2, 2]]);
    assert.ok(ts.every((t) => t.c));
    await orm.batch(comandosMassa(orm, [1, 2], { campo: "responsavel", modo: "adicionar", usuarioId: 9501 }) as never);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_pessoas WHERE usuario_id = 9501 AND papel = 'responsavel'").get() as { n: number }).n, 2);
    await orm.batch(comandosMassa(orm, [1, 2], { campo: "responsavel", modo: "remover", usuarioId: 9501 }) as never);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_pessoas WHERE usuario_id = 9501").get() as { n: number }).n, 0);
    await orm.batch(comandosMassa(orm, [1, 2], { campo: "etiqueta", modo: "adicionar", etiquetaId: 1 }) as never);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_etiqueta_links").get() as { n: number }).n, 2);
    await orm.batch(comandosMassa(orm, [2], { campo: "prioridade", prioridade: "urgente" }) as never);
    await orm.batch(comandosMassa(orm, [1], { campo: "arquivar", arquivada: true }) as never);
    const r = db.prepare("SELECT id, prioridade AS p, arquivada AS a FROM tarefas ORDER BY id").all() as { id: number; p: string; a: number }[];
    assert.deepEqual(r.map((x) => [x.p, x.a]), [["media", 1], ["urgente", 0]]);
  });

  it("recorrência: a próxima nasce com checklist e a regra; a MESMA anterior de novo derruba o lote (sem duplicar nem gastar ticket)", async () => {
    const rec = { freq: "diaria" as const, intervalo: 1, base: "prazo" as const };
    const d = { ...base, listaId: 1, titulo: "Rotina", pessoas: [9501], etiquetas: [], prazo: "2026-09-26", recorrencia: rec, recorrenciaAnteriorId: 2, checklist: ["a", "b"] };
    const r = await orm.batch(comandosCriarTarefa(orm, d));
    const nova = (r.at(-1) as { id: number; ticket: number }[])[0];
    const t = db.prepare("SELECT recorrencia AS r, recorrencia_anterior_id AS a FROM tarefas WHERE id = ?").get(nova.id) as { r: string; a: number };
    assert.deepEqual([JSON.parse(t.r), t.a], [rec, 2]);
    const itens = db.prepare("SELECT texto, feito, ordem FROM tarefa_checklist WHERE tarefa_id = ? ORDER BY ordem").all(nova.id) as { texto: string; feito: number }[];
    assert.deepEqual(itens.map((i) => [i.texto, i.feito]), [["a", 0], ["b", 0]]);
    const prox = (db.prepare("SELECT prox_ticket AS p FROM tarefa_quadros WHERE id = 1").get() as { p: number }).p;
    await assert.rejects(orm.batch(comandosCriarTarefa(orm, d)));
    assert.equal((db.prepare("SELECT prox_ticket AS p FROM tarefa_quadros WHERE id = 1").get() as { p: number }).p, prox);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefas WHERE recorrencia_anterior_id = 2").get() as { n: number }).n, 1);
  });

  it("quadro a partir de modelo: listas na ordem e etiquetas, num lote", async () => {
    const m = coerceModeloQuadro({ listas: [{ nome: "Fila" }, { nome: "Pronto", concluida: true, limiteWip: 4 }], etiquetas: [{ nome: "Doc", cor: "#123456" }] });
    const r = await orm.batch(comandosCriarQuadroDoModelo(orm, { grupoId: 9500, nome: "Novo", cor: "#112233", descricao: null, criadoPor: 9501 }, m));
    const [{ id }] = r.at(-1) as { id: number }[];
    const ls = db.prepare("SELECT nome, concluida AS c, limite_wip AS w FROM tarefa_listas WHERE quadro_id = ? ORDER BY ordem").all(id) as { nome: string; c: number; w: number | null }[];
    assert.deepEqual(ls.map((l) => [l.nome, l.c, l.w]), [["Fila", 0, null], ["Pronto", 1, 4]]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_etiquetas WHERE quadro_id = ?").get(id) as { n: number }).n, 1);
  });

  it("notificações: lotes de 9 linhas; a chave repetida da mesma pessoa é ignorada", async () => {
    const linhas = Array.from({ length: 20 }, (_, i) => ({ usuarioId: 9501, tipo: "atribuida" as const, titulo: `N${i}` }));
    const cmds = comandosNotificacoes(orm, [...linhas, { usuarioId: 9502, tipo: "atrasada", titulo: "A", chave: "k" }]);
    assert.equal(cmds.length, 3);
    await orm.batch(cmds as never);
    await orm.batch(comandosNotificacoes(orm, [{ usuarioId: 9502, tipo: "atrasada", titulo: "A", chave: "k" }, { usuarioId: 9501, tipo: "atrasada", titulo: "A", chave: "k" }]) as never);
    const n = (u: number) => (db.prepare("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = ?").get(u) as { n: number }).n;
    assert.deepEqual([n(9501), n(9502)], [21, 1]);
  });
});
