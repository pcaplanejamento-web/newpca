import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { esperaReconexao, lerCookie, origemDoProprioSite } from "../src/lib/ao-vivo-core.ts";
import { CATALOGO_AVISOS, compactarNotificacoes, emailsDaPessoa, lerPrefsEmail, noSino, querEmail, resolverNotificacoes } from "../src/lib/notificacoes-config-core.ts";
import { comandosExcluirNotificacoes, comandosRetencaoNotificacoes, consultaDispensadas, TETO_NOTIFICACOES } from "../src/lib/notificacoes-sql.ts";
import { dataHoraCompleta, grupoDoDia, mesclarPrimeiraPagina, secoesDeAvisos, tempoRelativo, tituloComContagem } from "../src/lib/notificacoes-tela-core.ts";
import { TIPOS_NOTIFICACAO } from "../src/lib/tarefas-core.ts";
import { comandosNotificacoes } from "../src/lib/tarefas-sql.ts";
import { configNotificacoesSchema, notificacoesDeleteSchema, notificacoesListaSchema, notificacoesPatchSchema } from "../src/lib/notificacoes-validation.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

describe("notificações — configuração do ADM (o e-mail no mínimo)", () => {
  it("todo tipo do sino está no catálogo, sem repetir", () => {
    const chaves = CATALOGO_AVISOS.map((i) => i.chave);
    assert.equal(new Set(chaves).size, chaves.length);
    for (const t of TIPOS_NOTIFICACAO) assert.ok(chaves.includes(t), t);
  });

  it("o padrão manda por e-mail SÓ o fundamental", () => {
    const cfg = resolverNotificacoes(undefined);
    const porEmail = CATALOGO_AVISOS.filter((i) => cfg[i.chave].email).map((i) => i.chave);
    assert.deepEqual(porEmail.sort(), ["acesso", "atrasada", "atribuida", "cadastro", "convite", "protocolo"].sort());
    // Tudo existe no sino (menos o só-e-mail).
    assert.equal(noSino(cfg, "comentario"), true);
    assert.equal(noSino(cfg, "acesso"), false);
    assert.equal(noSino(cfg, "inexistente"), false);
  });

  it("guarda só o que difere do padrão; JSON solto é tolerado; o só-e-mail nunca ganha sino", () => {
    const cfg = resolverNotificacoes({ comentario: { email: true }, lembrete: { sino: false }, acesso: { sino: true }, x: { email: true }, mencionada: "lixo" });
    assert.equal(cfg.comentario.email, true);
    assert.equal(cfg.lembrete.sino, false);
    assert.equal(cfg.acesso.sino, false);
    assert.deepEqual(compactarNotificacoes(cfg), { comentario: { email: true }, lembrete: { sino: false } });
    assert.deepEqual(compactarNotificacoes(resolverNotificacoes(null)), {});
  });

  it("a pessoa só desliga o que o ADM deixou desligável; o Perfil lista o que o ADM manda", () => {
    const cfg = resolverNotificacoes({ cadastro: { desligavel: false } });
    const prefs = lerPrefsEmail({ ligado: false });
    assert.equal(querEmail(cfg, prefs, "atribuida"), false);
    assert.equal(querEmail(cfg, prefs, "cadastro"), true);
    const lista = emailsDaPessoa(cfg, lerPrefsEmail(null));
    assert.ok(lista.every((l) => cfg[l.item.chave].email));
    assert.equal(lista.find((l) => l.item.chave === "cadastro")?.fixo, true);
  });

  it("validação das rotas", () => {
    assert.deepEqual(notificacoesPatchSchema.parse({ ids: [1] }), { ids: [1], lida: true });
    assert.equal(notificacoesPatchSchema.safeParse({ ids: [] }).success, false);
    assert.equal(notificacoesDeleteSchema.safeParse({ limpar: "lidas" }).success, true);
    assert.equal(notificacoesDeleteSchema.safeParse({ limpar: "outras" }).success, false);
    assert.deepEqual(notificacoesListaSchema.parse({ antes: "30" }), { antes: 30, filtro: "todas", limite: 20 });
    assert.equal(notificacoesListaSchema.safeParse({ limite: "500" }).success, false);
    assert.equal(configNotificacoesSchema.safeParse({ avisos: { atribuida: { sino: true, email: false, desligavel: true } } }).success, true);
    assert.equal(configNotificacoesSchema.safeParse({ avisos: { atribuida: { sino: "sim" } } }).success, false);
  });
});

describe("notificações — a tela do sino", () => {
  // 05/10/2026 15:00 de Brasília = 18:00 UTC.
  const agora = Date.parse("2026-10-05T18:00:00Z");

  it("o dia de Brasília: hoje, ontem, a semana e antes (a meia-noite UTC não engana)", () => {
    assert.equal(grupoDoDia("2026-10-05 13:00:00", agora), "Hoje");
    // 02:00 UTC do dia 5 = 23:00 do dia 4 em Brasília.
    assert.equal(grupoDoDia("2026-10-05 02:00:00", agora), "Ontem");
    assert.equal(grupoDoDia("2026-10-01 12:00:00", agora), "Esta semana");
    assert.equal(grupoDoDia("2026-09-01 12:00:00", agora), "Antes");
    assert.equal(grupoDoDia(null, agora), "Antes");
  });

  it("a hora relativa e a completa", () => {
    assert.equal(tempoRelativo("2026-10-05 17:59:40", agora), "agora");
    assert.equal(tempoRelativo("2026-10-05 17:55:00", agora), "há 5 min");
    assert.equal(tempoRelativo("2026-10-05 15:00:00", agora), "há 3 h");
    assert.equal(tempoRelativo("2026-10-04 15:00:00", agora), "ontem");
    assert.equal(tempoRelativo("2026-10-01 15:00:00", agora), "há 4 dias");
    assert.equal(tempoRelativo("2026-09-01 15:00:00", agora), "01/09");
    assert.equal(dataHoraCompleta("2026-10-05 18:00:00"), "05/10/2026 às 15:00");
    assert.equal(tempoRelativo("lixo", agora), "");
  });

  it("junta os REPETIDOS em sequência (mesmo tipo, mesma tarefa, mesma situação) — sem tarefa nunca junta", () => {
    const n = (id: number, tipo: string, tarefaId: number | null, lida = false, criadoEm = "2026-10-05 17:00:00") => ({ id, tipo, tarefaId, lida, criadoEm });
    const secoes = secoesDeAvisos([n(9, "comentario", 1), n(8, "comentario", 1), n(7, "comentario", 1, true), n(6, "cadastro", null), n(5, "cadastro", null), n(4, "comentario", 1, false, "2026-10-04 17:00:00")], agora);
    assert.deepEqual(
      secoes.map((s) => [s.grupo, s.linhas.map((l) => [l.principal.id, l.outros.map((o) => o.id)])]),
      [
        ["Hoje", [[9, [8]], [7, []], [6, []], [5, []]]],
        ["Ontem", [[4, []]]],
      ],
    );
  });

  it("o título da aba leva o número de não lidas (sem acumular)", () => {
    assert.equal(tituloComContagem("Mesa", 3), "(3) Mesa");
    assert.equal(tituloComContagem("(3) Mesa", 120), "(99+) Mesa");
    assert.equal(tituloComContagem("(99+) Mesa", 0), "Mesa");
  });
});

describe("notificações — canal ao vivo", () => {
  it("lê o cookie, confere a origem e espera cada vez mais para reconectar", () => {
    assert.equal(lerCookie("a=1; pca_session=abc%3D; b=2", "pca_session"), "abc=");
    assert.equal(lerCookie("pca_session=", "pca_session"), null);
    assert.equal(lerCookie(null, "pca_session"), null);
    assert.equal(origemDoProprioSite("https://governarv.com.br", "https://governarv.com.br/api/notificacoes/ao-vivo"), true);
    assert.equal(origemDoProprioSite("https://mal.com", "https://governarv.com.br/api/notificacoes/ao-vivo"), false);
    assert.equal(origemDoProprioSite(null, "https://governarv.com.br/x"), false);
    assert.equal(esperaReconexao(0, 0), 2000);
    assert.equal(esperaReconexao(3, 0), 16000);
    assert.equal(esperaReconexao(20, 0), 60000);
    assert.equal(esperaReconexao(20, 1), 72000);
  });
});

describe("notificações — limpeza no banco (builders no driver D1 real)", () => {
  function banco() {
    const db = new DatabaseSync(":memory:");
    for (const arq of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(process.cwd(), "drizzle", arq), "utf8"));
    db.exec("INSERT INTO usuarios (id, email, nome, senha_hash, role, status) VALUES (901, 'ana@x.com', 'Ana', 'h', 'membro', 'ativo'), (902, 'bia@x.com', 'Bia', 'h', 'membro', 'ativo')");
    return { db, orm: drizzle(d1Sobre(db) as never, { schema }) };
  }
  const conta = (db: DatabaseSync, u: number) => (db.prepare("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = ?").get(u) as { n: number }).n;

  it("a gravação devolve quem recebeu de fato (a chave repetida não volta) e o sem e-mail já nasce tratado", async () => {
    const { db, orm } = banco();
    const r1 = await orm.batch(comandosNotificacoes(orm, [{ usuarioId: 901, tipo: "atrasada", titulo: "A", chave: "k" }, { usuarioId: 902, tipo: "comentario", titulo: "C", semEmail: true }]) as never);
    assert.deepEqual((r1 as { usuarioId: number }[][]).flat().map((x) => x.usuarioId).sort(), [901, 902]);
    const r2 = await orm.batch(comandosNotificacoes(orm, [{ usuarioId: 901, tipo: "atrasada", titulo: "A", chave: "k" }]) as never);
    assert.deepEqual((r2 as unknown[][]).flat(), []);
    assert.notEqual((db.prepare("SELECT email_enviado_em AS e FROM notificacoes WHERE usuario_id = 902").get() as { e: string | null }).e, null);
    assert.equal((db.prepare("SELECT email_enviado_em AS e FROM notificacoes WHERE usuario_id = 901").get() as { e: string | null }).e, null);
  });

  it("excluir apaga do banco SÓ as da pessoa; o derivado limpo fica DISPENSADO (não volta)", async () => {
    const { db, orm } = banco();
    db.exec(`INSERT INTO notificacoes (id, usuario_id, tipo, titulo, chave, lida) VALUES
      (1, 901, 'atrasada', 'A', 'atrasada:5:2026-10-01', 1), (2, 901, 'comentario', 'B', NULL, 1), (3, 901, 'atribuida', 'C', NULL, 0), (4, 902, 'comentario', 'D', NULL, 1)`);
    const [, apagadas] = (await orm.batch(comandosExcluirNotificacoes(orm, 901, { limpar: "lidas" }) as never)) as unknown[][];
    assert.equal((apagadas as unknown[]).length, 2);
    assert.deepEqual([conta(db, 901), conta(db, 902)], [1, 1]);
    assert.deepEqual(
      (await consultaDispensadas(orm, 901)).map((d) => d.chave),
      ["atrasada:5:2026-10-01"],
    );
    // Pedir os ids de OUTRA pessoa não apaga nada dela.
    await orm.batch(comandosExcluirNotificacoes(orm, 901, { ids: [4] }) as never);
    assert.equal(conta(db, 902), 1);
    await orm.batch(comandosExcluirNotificacoes(orm, 901, { limpar: "todas" }) as never);
    assert.equal(conta(db, 901), 0);
  });

  it("a retenção: lidas > 30 dias, não lidas > 90, o teto por pessoa (as lidas mais antigas saem antes) e as dispensas vencidas", async () => {
    const { db, orm } = banco();
    db.exec("INSERT INTO notificacoes (usuario_id, tipo, titulo, lida, criado_em) VALUES (902, 'x', 'lida velha', 1, datetime('now', '-31 days')), (902, 'x', 'não lida velha', 0, datetime('now', '-91 days')), (902, 'x', 'não lida de 40 dias', 0, datetime('now', '-40 days'))");
    const ins = db.prepare("INSERT INTO notificacoes (usuario_id, tipo, titulo, lida) VALUES (901, 'x', ?, ?)");
    for (let i = 0; i < TETO_NOTIFICACOES + 30; i++) ins.run(`n${i}`, i < 30 ? 1 : 0);
    db.exec("INSERT INTO notificacoes_dispensadas (usuario_id, chave, ate) VALUES (901, 'velha', date('now', '-1 day')), (901, 'vale', date('now', '+5 days'))");
    await orm.batch(comandosRetencaoNotificacoes(orm) as never);
    assert.equal(conta(db, 901), TETO_NOTIFICACOES);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = 901 AND lida = 1").get() as { n: number }).n, 0);
    assert.deepEqual(
      (db.prepare("SELECT titulo FROM notificacoes WHERE usuario_id = 902").all() as { titulo: string }[]).map((r) => r.titulo),
      ["não lida de 40 dias"],
    );
    assert.deepEqual(
      (await consultaDispensadas(orm, 901)).map((d) => d.chave),
      ["vale"],
    );
  });
});

describe("notificações — o aviso ao vivo mescla a 1ª página", () => {
  const n = (id: number, lida = false) => ({ id, lida });
  it("novos no topo, os que mudaram trocados, as páginas carregadas abaixo ficam e o que a tela limpa não volta", () => {
    const atuais = [n(10), n(9), n(8), n(5), n(4)];
    // A 1ª página agora traz o 11 (novo), o 10 lido, o 9 sumiu (excluído em outra aba) e vai até o 8 — há mais.
    assert.deepEqual(mesclarPrimeiraPagina(atuais, [n(11), n(10, true), n(8)], true), [n(11), n(10, true), n(8), n(5), n(4)]);
    // Sem mais páginas, a página é a lista inteira.
    assert.deepEqual(mesclarPrimeiraPagina(atuais, [n(11)], false), [n(11)]);
    assert.deepEqual(mesclarPrimeiraPagina(atuais, [], false), []);
    // O que a tela está limpando (Desfazer valendo) não volta.
    assert.deepEqual(mesclarPrimeiraPagina(atuais, [n(11), n(10)], false, new Set([10])), [n(11)]);
  });
});
