import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { coerceModeloQuadro } from "../src/lib/tarefas-core.ts";
import {
  comandosAtualizarEvento,
  comandosCriarEvento,
  comandosCriarQuadroDoModelo,
  comandosComentariosImportados,
  comandosCriarTarefa,
  comandosEquipe,
  comandosEsvaziarLista,
  comandosMassa,
  comandosMover,
  comandosMoverQuadro,
  comandosNotificacoes,
  comandosValoresCampos,
  comandosVinculos,
  comandosVinculosTarefa,
  pessoaNaTarefa,
  quadroVisivel,
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

  it("concluir NO LUGAR: entre listas comuns a conclusão fica; sair da lista de concluídas reabre", async () => {
    db.exec("INSERT INTO tarefa_listas (id, quadro_id, nome, ordem, concluida) VALUES (3, 1, 'Dia 2', 3, 0)");
    const conc = () => (db.prepare("SELECT concluida_em AS c FROM tarefas WHERE id = 2").get() as { c: string | null }).c;
    db.exec("UPDATE tarefas SET concluida_em = '2026-03-21 09:00:00' WHERE id = 2");
    await orm.batch(comandosMover(orm, 2, 3, 1, false) as never);
    assert.equal(conc(), "2026-03-21 09:00:00");
    await orm.batch(comandosMover(orm, 2, 2, 1, true) as never);
    assert.equal(conc(), "2026-03-21 09:00:00");
    await orm.batch(comandosMover(orm, 2, 3, 1, false) as never);
    assert.equal(conc(), null);
    await orm.batch(comandosMover(orm, 2, 1, 2, false) as never);
    db.exec("DELETE FROM tarefa_listas WHERE id = 3");
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
    const d = { ...base, listaId: 1, titulo: "Rotina", pessoas: [9501], etiquetas: [], prazo: "2026-09-26", recorrencia: rec, recorrenciaAnteriorId: 2, checklists: [{ nome: "Rotina", itens: ["a", "b"] }] };
    const r = await orm.batch(comandosCriarTarefa(orm, d));
    const nova = (r.at(-1) as { id: number; ticket: number }[])[0];
    const t = db.prepare("SELECT recorrencia AS r, recorrencia_anterior_id AS a FROM tarefas WHERE id = ?").get(nova.id) as { r: string; a: number };
    assert.deepEqual([JSON.parse(t.r), t.a], [rec, 2]);
    const itens = db.prepare("SELECT texto, feito, ordem FROM tarefa_checklist WHERE tarefa_id = ? ORDER BY ordem").all(nova.id) as { texto: string; feito: number }[];
    assert.deepEqual(itens.map((i) => [i.texto, i.feito]), [["a", 0], ["b", 0]]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_checklists WHERE tarefa_id = ? AND nome = 'Rotina'").get(nova.id) as { n: number }).n, 1);
    const prox = (db.prepare("SELECT prox_ticket AS p FROM tarefa_quadros WHERE id = 1").get() as { p: number }).p;
    await assert.rejects(orm.batch(comandosCriarTarefa(orm, d)));
    assert.equal((db.prepare("SELECT prox_ticket AS p FROM tarefa_quadros WHERE id = 1").get() as { p: number }).p, prox);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefas WHERE recorrencia_anterior_id = 2").get() as { n: number }).n, 1);
  });

  it("CHECKLISTS NOMEADOS: a tarefa nova nasce com vários, 45 itens em INSERTs de até 16 (≤ 100 parâmetros), cada item no seu", async () => {
    const itens = Array.from({ length: 45 }, (_, i) => `Servidor ${i + 1}`);
    const cmds = comandosCriarTarefa(orm, { ...base, listaId: 1, titulo: "Faltas", pessoas: [], etiquetas: [], checklists: [{ nome: "SERVIDORES COM FALTA", itens }, { nome: "BIOMETRIA", itens: ["x"] }] });
    for (const c of cmds) assert.ok(c.toSQL().params.length <= 100, `${c.toSQL().params.length} parâmetros`);
    const r = await orm.batch(cmds);
    const [{ id }] = r.at(-1) as { id: number }[];
    const porChecklist = db
      .prepare("SELECT c.nome AS nome, COUNT(i.id) AS n, MAX(i.ordem) AS ultimo FROM tarefa_checklists c LEFT JOIN tarefa_checklist i ON i.checklist_id = c.id WHERE c.tarefa_id = ? GROUP BY c.id ORDER BY c.ordem")
      .all(id) as { nome: string; n: number; ultimo: number }[];
    assert.deepEqual(porChecklist.map((x) => [x.nome, x.n, x.ultimo]), [["SERVIDORES COM FALTA", 45, 45], ["BIOMETRIA", 1, 1]]);
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
  it("evento com 40 CONVIDADOS: INSERTs de até 30 (≤ 100 parâmetros), tudo num lote; editar mantém as respostas", async () => {
    const ids = Array.from({ length: 40 }, (_, i) => 9600 + i);
    db.exec(`INSERT INTO usuarios (id, nome, email, senha_hash) VALUES ${ids.map((u) => `(${u}, 'P${u}', 'p${u}@x', 'h')`).join(", ")}`);
    const ev = { titulo: "Reunião", data: "2026-09-10", dataFim: null, diaInteiro: true, horaInicio: null, horaFim: null, local: null, descricao: null, cor: null, lembreteMin: null, recorrencia: null, linkReuniao: null, ocupado: true, privado: false, convidados: ids };
    const cmds = comandosCriarEvento(orm, 1, ev, 9501);
    for (const c of cmds) assert.ok(c.toSQL().params.length <= 100, `${c.toSQL().params.length} parâmetros`);
    const r = await orm.batch(cmds);
    const [{ id }] = r.at(-1) as { id: number }[];
    const n = () => (db.prepare("SELECT COUNT(*) AS n FROM tarefa_evento_convidados WHERE evento_id = ?").get(id) as { n: number }).n;
    assert.equal(n(), 40);
    db.exec(`UPDATE tarefa_evento_convidados SET resposta = 'sim' WHERE evento_id = ${id} AND usuario_id = 9600`);
    const upd = comandosAtualizarEvento(orm, id, { ...ev, convidados: [...ids.slice(0, 35), 9501] });
    for (const c of upd) assert.ok(c.toSQL().params.length <= 100);
    await orm.batch(upd as never);
    assert.equal(n(), 36);
    assert.equal((db.prepare("SELECT resposta AS r FROM tarefa_evento_convidados WHERE evento_id = ? AND usuario_id = 9600").get(id) as { r: string }).r, "sim");
  });

  it("tarefa NOVA com evento e convidados: os convidados entram no mesmo lote", async () => {
    const ev = { titulo: "Visita", data: "2026-09-11", dataFim: null, diaInteiro: true, horaInicio: null, horaFim: null, local: null, descricao: null, cor: null, lembreteMin: null, recorrencia: null, linkReuniao: null, ocupado: true, privado: false, convidados: [9502] };
    const r = await orm.batch(comandosCriarTarefa(orm, { ...base, listaId: 1, titulo: "Com evento", pessoas: [], etiquetas: [], eventos: [ev] }));
    const [{ id }] = r.at(-1) as { id: number }[];
    const c = db.prepare("SELECT c.usuario_id AS u FROM tarefa_evento_convidados c JOIN tarefa_eventos e ON e.id = c.evento_id WHERE e.tarefa_id = ?").all(id) as { u: number }[];
    assert.deepEqual(c.map((x) => x.u), [9502]);
  });

  it("EQUIPES: 40 membros em INSERTs de até 30; criar/editar num lote; a tarefa com a equipe envolve os membros", async () => {
    const membros = Array.from({ length: 40 }, (_, i) => 9600 + i); // criadas no teste dos convidados
    const criar = comandosEquipe(orm, { quadroId: 1, nome: "Compras", cor: "#16a34a", membros: [...membros, membros[0]] });
    for (const c of criar) assert.ok(c.toSQL().params.length <= 100, `${c.toSQL().params.length} parâmetros`);
    await orm.batch(criar as never);
    const eqId = (db.prepare("SELECT MAX(id) AS id FROM tarefa_equipes").get() as { id: number }).id;
    const nMembros = () => (db.prepare("SELECT COUNT(*) AS n FROM tarefa_equipe_membros WHERE equipe_id = ?").get(eqId) as { n: number }).n;
    assert.equal(nMembros(), 40);
    // Editar troca os membros (e o nome) no mesmo lote.
    await orm.batch(comandosEquipe(orm, { id: eqId, quadroId: 1, nome: "Compras 2", cor: "#16a34a", membros: [9600, 9502] }) as never);
    assert.equal(nMembros(), 2);
    assert.equal((db.prepare("SELECT nome AS n FROM tarefa_equipes WHERE id = ?").get(eqId) as { n: string }).n, "Compras 2");
    // A tarefa nasce com a equipe; a pessoa da equipe é "da tarefa" (a mesma régua de `envolvidos`); a de fora não.
    const r = await orm.batch(comandosCriarTarefa(orm, { ...base, listaId: 1, titulo: "Da equipe", pessoas: [], etiquetas: [], equipes: [eqId] }));
    const [{ id }] = r.at(-1) as { id: number }[];
    const da = async (u: number) => (await orm.select({ id: schema.tarefas.id }).from(schema.tarefas).where(pessoaNaTarefa(u))).map((x) => x.id);
    assert.ok((await da(9600)).includes(id));
    assert.ok(!(await da(9610)).includes(id));
    // Tirar a equipe (vínculos) e pôr de novo pela massa.
    await orm.batch(comandosVinculos(orm, id, { equipes: [] }) as never);
    assert.ok(!(await da(9600)).includes(id));
    await orm.batch(comandosMassa(orm, [id], { campo: "equipe", modo: "adicionar", equipeId: eqId }) as never);
    assert.ok((await da(9600)).includes(id));
    // Excluir a equipe tira das tarefas (cascade).
    await orm.delete(schema.tarefaEquipes).where(eq(schema.tarefaEquipes.id, eqId));
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_equipes_links").get() as { n: number }).n, 0);
  });

  it("CAMPOS: 45 valores em INSERTs de até 20 (≤ 100 parâmetros) na tarefa nova; trocar/tirar num lote; mover troca pelos do destino", async () => {
    db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (60, 9500, 'Campos')");
    db.exec("INSERT INTO tarefa_listas (id, quadro_id, nome, ordem) VALUES (600, 60, 'A fazer', 1)");
    const ids = Array.from({ length: 45 }, (_, i) => 600 + i);
    db.exec(`INSERT INTO tarefa_campos (id, quadro_id, nome) VALUES ${ids.map((i) => `(${i}, 60, 'C${i}')`).join(", ")}`);
    const cmds = comandosCriarTarefa(orm, { ...base, quadroId: 60, listaId: 600, titulo: "Com campos", pessoas: [], etiquetas: [], campos: ids.map((c) => ({ campoId: c, valor: `v${c}` })) });
    for (const c of cmds) assert.ok(c.toSQL().params.length <= 100);
    const r = await orm.batch(cmds);
    const [{ id }] = r.at(-1) as { id: number }[];
    const contar = () => (db.prepare("SELECT COUNT(*) AS n FROM tarefa_campo_valores WHERE tarefa_id = ?").get(id) as { n: number }).n;
    assert.equal(contar(), 45);
    const troca = comandosValoresCampos(orm, id, [
      { campoId: 600, valor: "novo" },
      { campoId: 601, valor: null },
    ]);
    await orm.batch(troca as never);
    assert.equal(contar(), 44);
    assert.equal((db.prepare("SELECT valor FROM tarefa_campo_valores WHERE tarefa_id = ? AND campo_id = 600").get(id) as { valor: string }).valor, "novo");
    // Mover para outro quadro: os valores antigos saem e entram os mapeados.
    db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (61, 9500, 'Destino')");
    db.exec("INSERT INTO tarefa_listas (id, quadro_id, nome, ordem) VALUES (610, 61, 'A fazer', 1)");
    db.exec("INSERT INTO tarefa_campos (id, quadro_id, nome) VALUES (700, 61, 'C600')");
    await orm.batch(comandosMoverQuadro(orm, { id, quadroId: 61, listaId: 610, concluida: false, etiquetas: [], novasEtiquetas: [], pessoas: [], equipes: [], campos: [{ campoId: 700, valor: "novo" }] }) as never);
    assert.deepEqual(db.prepare("SELECT campo_id AS c, valor AS v FROM tarefa_campo_valores WHERE tarefa_id = ?").all(id).map((x) => ({ ...(x as object) })), [{ c: 700, v: "novo" }]);
    // Excluir o campo tira o valor (cascade).
    db.exec("DELETE FROM tarefa_campos WHERE id = 700");
    assert.equal(contar(), 0);
  });

  it("VÍNCULOS múltiplos: a tarefa nova nasce com vários; trocar reescreve os dois lados (a outra tarefa perde o reverso)", async () => {
    const r = await orm.batch(comandosCriarTarefa(orm, { ...base, listaId: 1, titulo: "V1", pessoas: [], etiquetas: [], vinculos: [{ tipo: "protocolo", id: 44 }, { tipo: "pca", id: 2 }] }));
    const [{ id: a }] = r.at(-1) as { id: number }[];
    const r2 = await orm.batch(comandosCriarTarefa(orm, { ...base, listaId: 1, titulo: "V2", pessoas: [], etiquetas: [], vinculos: [{ tipo: "tarefa", id: a }] }));
    const [{ id: b }] = r2.at(-1) as { id: number }[];
    const linhas = () =>
      db
        .prepare("SELECT tarefa_id AS t, tipo, alvo_id AS a FROM tarefa_vinculos WHERE tarefa_id IN (?, ?) OR alvo_id IN (?, ?) ORDER BY t, tipo, a")
        .all(a, b, a, b)
        .map((x) => ({ ...(x as object) }));
    assert.equal(linhas().length, 3);
    // A tarefa A (que vê B pelo reverso) troca os vínculos: fica só com B (e sem a si mesma), gravado a partir dela.
    const cmds = comandosVinculosTarefa(orm, a, [
      { tipo: "tarefa", id: b },
      { tipo: "tarefa", id: a },
    ]);
    for (const c of cmds) assert.ok(c.toSQL().params.length <= 100);
    await orm.batch(cmds as never);
    assert.deepEqual(linhas(), [{ t: a, tipo: "tarefa", a: b }]);
    db.exec(`DELETE FROM tarefas WHERE id = ${a}`);
    assert.deepEqual(linhas(), []);
  });

  it("IMPORTAÇÃO do Trello: nasce arquivada e com itens MARCADOS; 40 comentários com autor e data em INSERTs de até 16", async () => {
    const itens = Array.from({ length: 30 }, (_, i) => `i${i}`);
    const r = await orm.batch(
      comandosCriarTarefa(orm, { ...base, listaId: 1, titulo: "Do Trello", pessoas: [], etiquetas: [], arquivada: true, checklists: [{ nome: "S", itens, feitos: itens.map((_, i) => i % 2 === 0) }] }),
    );
    const [{ id }] = r.at(-1) as { id: number }[];
    assert.equal((db.prepare("SELECT arquivada AS a FROM tarefas WHERE id = ?").get(id) as { a: number }).a, 1);
    assert.equal((db.prepare("SELECT SUM(feito) AS n FROM tarefa_checklist WHERE tarefa_id = ?").get(id) as { n: number }).n, 15);
    const coment = comandosComentariosImportados(
      orm,
      id,
      Array.from({ length: 40 }, (_, i) => ({ autor: `P${i}`, data: i === 0 ? null : "2026-10-01T13:00:00.000Z", texto: `c${i}` })),
    );
    for (const c of coment) assert.ok(c.toSQL().params.length <= 100);
    await orm.batch(coment as never);
    const l = db.prepare("SELECT usuario_id AS u, usuario_nome AS n, criado_em AS d FROM tarefa_comentarios WHERE tarefa_id = ? ORDER BY id").all(id) as { u: number | null; n: string; d: string }[];
    assert.equal(l.length, 40);
    assert.deepEqual([l[1].u, l[1].n, l[1].d], [null, "P1", "2026-10-01 13:00:00"]);
    assert.ok(l[0].d);
  });

  it("COPIAR para outro quadro (template, no topo, etiqueta nova criada) e MOVER entre quadros (ticket novo, pessoas filtradas)", async () => {
    db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (50, 9500, 'Outubro')");
    db.exec("INSERT INTO tarefa_listas (id, quadro_id, nome, ordem, concluida) VALUES (500, 50, 'TEMPLATES', 1, 0), (501, 50, 'Concluído', 2, 1)");
    db.exec("INSERT INTO tarefa_etiquetas (id, quadro_id, nome, cor) VALUES (500, 50, 'urgente', '#ff0000')");
    const r = await orm.batch(comandosCriarTarefa(orm, { ...base, listaId: 1, titulo: "Origem", pessoas: [9501], etiquetas: [1], checklists: [{ nome: "Passos", itens: ["a", "b"] }] }));
    const [{ id: origem }] = r.at(-1) as { id: number }[];
    await orm.batch(comandosCriarTarefa(orm, { ...base, quadroId: 50, listaId: 500, titulo: "Existente", pessoas: [], etiquetas: [] }));
    const copia = comandosCriarTarefa(orm, {
      ...base,
      quadroId: 50,
      listaId: 500,
      titulo: "Origem",
      concluida: true,
      pessoas: [9501],
      etiquetas: [500],
      novasEtiquetas: [{ nome: "Canal", cor: "#00ff00" }],
      checklists: [{ nome: "Passos", itens: ["a", "b"] }],
      template: true,
      copiadaDe: origem,
      noInicio: true,
    });
    for (const c of copia) assert.ok(c.toSQL().params.length <= 100);
    const rc = await orm.batch(copia);
    const [{ id: nova, ticket }] = rc.at(-1) as { id: number; ticket: number }[];
    assert.equal(ticket, 2);
    const t = db.prepare("SELECT template, copiada_de AS c, concluida_em AS ce, ordem FROM tarefas WHERE id = ?").get(nova) as { template: number; c: number; ce: string | null; ordem: number };
    // O template nunca nasce concluído; no TOPO (antes do "Existente", ordem 1).
    assert.deepEqual([t.template, t.c, t.ce, t.ordem], [1, origem, null, 0]);
    const nomes = (db.prepare("SELECT e.nome AS n FROM tarefa_etiqueta_links l JOIN tarefa_etiquetas e ON e.id = l.etiqueta_id WHERE l.tarefa_id = ? ORDER BY e.nome").all(nova) as { n: string }[]).map((x) => x.n);
    assert.deepEqual(nomes, ["Canal", "urgente"]);
    assert.equal((db.prepare("SELECT quadro_id AS q FROM tarefa_etiquetas WHERE nome = 'Canal'").get() as { q: number }).q, 50);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_checklist WHERE tarefa_id = ?").get(nova) as { n: number }).n, 2);
    // MOVER a origem para o quadro 2 (lista de concluídas): ticket do destino, conclui, etiquetas trocadas, só a pessoa que fica.
    db.exec(`INSERT INTO tarefa_pessoas (tarefa_id, usuario_id, papel) VALUES (${origem}, 9502, 'observador')`);
    const mover = comandosMoverQuadro(orm, { id: origem, quadroId: 50, listaId: 501, concluida: true, etiquetas: [500], novasEtiquetas: [], pessoas: [9502], equipes: [], campos: [] });
    for (const c of mover) assert.ok(c.toSQL().params.length <= 100);
    const rm = await orm.batch(mover as never);
    assert.deepEqual((rm as unknown[]).at(-1), [{ id: origem, ticket: 3 }]);
    const m = db.prepare("SELECT quadro_id AS q, lista_id AS l, concluida_em AS ce FROM tarefas WHERE id = ?").get(origem) as { q: number; l: number; ce: string | null };
    assert.deepEqual([m.q, m.l], [50, 501]);
    assert.ok(m.ce);
    assert.deepEqual(db.prepare("SELECT usuario_id AS u FROM tarefa_pessoas WHERE tarefa_id = ?").all(origem).map((x) => (x as { u: number }).u), [9502]);
    assert.deepEqual(db.prepare("SELECT etiqueta_id AS e FROM tarefa_etiqueta_links WHERE tarefa_id = ?").all(origem).map((x) => (x as { e: number }).e), [500]);
    // O checklist foi junto (é da tarefa).
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_checklist WHERE tarefa_id = ?").get(origem) as { n: number }).n, 2);
  });
});

describe("tarefas — excluir lista movendo os cartões (comandosEsvaziarLista no db.batch do D1)", () => {
  it("move TODOS (inclusive arquivados) ao fim do destino, na ordem, com a conclusão pela lista; depois a lista sai", async () => {
    const db = aplicarTudo();
    const orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO grupos (id, nome) VALUES (9600, 'G')");
    db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (1, 9600, 'Q')");
    db.exec("INSERT INTO tarefa_listas (id, quadro_id, nome, ordem, concluida) VALUES (1, 1, 'Origem', 1, 1), (2, 1, 'Destino', 2, 0)");
    db.exec(`INSERT INTO tarefas (id, quadro_id, lista_id, ticket, titulo, ordem, arquivada, concluida_em) VALUES
      (1, 1, 2, 1, 'D1', 5, 0, NULL),
      (2, 1, 1, 2, 'O-b', 0.5, 0, '2026-01-01 00:00:00'),
      (3, 1, 1, 3, 'O-a', -2, 1, '2026-01-01 00:00:00')`);
    await orm.batch([...comandosEsvaziarLista(orm, 1, 2, false), orm.delete(schema.tarefaListas).where(eq(schema.tarefaListas.id, 1))] as never);
    const ts = db.prepare("SELECT id, lista_id AS l, ordem AS o, concluida_em AS c FROM tarefas ORDER BY ordem").all() as { id: number; l: number; o: number; c: string | null }[];
    assert.deepEqual(ts.map((t) => t.id), [1, 3, 2]);
    assert.ok(ts.every((t) => t.l === 2));
    assert.ok(ts[1].o > 5);
    // Saíram de uma lista de CONCLUÍDAS para uma comum: reabrem.
    assert.deepEqual(ts.map((t) => t.c), [null, null, null]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tarefa_listas").get() as { n: number }).n, 1);
  });
});

describe("tarefas — quadro PRIVADO (quadroVisivel no driver D1 real)", () => {
  it("o privado só aparece para quem o criou; os demais, para todos", async () => {
    const db = aplicarTudo();
    const orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (9701, 'Ana', 'a@x', 'h'), (9702, 'Bia', 'b@x', 'h')");
    db.exec("INSERT INTO grupos (id, nome) VALUES (9700, 'G')");
    db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome, privado, criado_por) VALUES (1, 9700, 'Público', 0, 9701), (2, 9700, 'Da Ana', 1, 9701), (3, 9700, 'Da Bia', 1, 9702)");
    const ver = async (u: number) =>
      (await orm.select({ id: schema.tarefaQuadros.id }).from(schema.tarefaQuadros).where(quadroVisivel(u)).orderBy(schema.tarefaQuadros.id)).map((q) => q.id);
    assert.deepEqual(await ver(9701), [1, 2]);
    assert.deepEqual(await ver(9702), [1, 3]);
    assert.deepEqual(await ver(1), [1]);
  });
});
