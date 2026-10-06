import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { chaveConversa, conversaDaChave } from "../src/lib/chat-core.ts";
import * as sqlChat from "../src/lib/chat-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";
describe("chat guardado por 7 dias — chaves e banco (driver D1 real)", () => {
  function banco() {
    const db = new DatabaseSync(":memory:");
    for (const arq of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(process.cwd(), "drizzle", arq), "utf8"));
    db.exec("INSERT INTO usuarios (id, email, nome, senha_hash, role, status) VALUES (1, 'a@x', 'Ana', 'h', 'membro', 'ativo'), (2, 'b@x', 'Bia', 'h', 'membro', 'ativo'), (3, 'c@x', 'Cid', 'h', 'membro', 'ativo')");
    return { db, orm: drizzle(d1Sobre(db) as never, { schema }) as never };
  }
  it("chave: a mesma para os dois lados; a tela de cada um vê a sua conversa", () => {
    assert.equal(chaveConversa("p2", 1, 7), "p1-2");
    assert.equal(chaveConversa("p1", 2, 7), "p1-2");
    assert.equal(chaveConversa("p1", 1, 7), null);
    assert.equal(chaveConversa("grupo", 1, 7), "g7");
    assert.equal(chaveConversa("grupo", 1, null), null);
    assert.equal(chaveConversa("cabc123", 1, 7), "cabc123");
    assert.equal(conversaDaChave("p1-2", 1, 7), "p2");
    assert.equal(conversaDaChave("p1-2", 2, 7), "p1");
    assert.equal(conversaDaChave("p1-2", 3, 7), null);
    assert.equal(conversaDaChave("g7", 1, 7), "grupo");
    assert.equal(conversaDaChave("g8", 1, 7), null);
    assert.equal(conversaDaChave("cabc123", 1, 7), "cabc123");
  });
  it("guarda (sem duplicar), lista com as não lidas, marca a lida e limpa o que passou de 7 dias", async () => {
    const { db, orm } = banco();
    const m = (id: string, de: number, em: number) => ({ id, chave: "p1-2", de, texto: `oi ${id}`, resp: null, em, participantes: [1, 2] });
    await (orm as { batch: (c: unknown[]) => Promise<unknown> }).batch(sqlChat.comandosGuardarMensagem(orm, m("aaaaaaaa01", 1, 1000)) as never);
    await (orm as { batch: (c: unknown[]) => Promise<unknown> }).batch(sqlChat.comandosGuardarMensagem(orm, m("aaaaaaaa02", 2, 2000)) as never);
    await (orm as { batch: (c: unknown[]) => Promise<unknown> }).batch(sqlChat.comandosGuardarMensagem(orm, m("aaaaaaaa02", 2, 2000)) as never);
    assert.equal((db.prepare("SELECT count(*) AS n FROM chat_mensagens").get() as { n: number }).n, 2);
    const ana = await sqlChat.consultaConversasChat(orm, 1, 0);
    assert.equal(ana.length, 1);
    assert.equal(ana[0].naoLidas, 1);
    assert.equal(ana[0].texto, "oi aaaaaaaa02");
    const bia = await sqlChat.consultaConversasChat(orm, 2, 0);
    assert.equal(bia[0].naoLidas, 0, "quem respondeu já leu a anterior");
    // Uma nova chega (3000) ANTES do sinal da lida (até a 02) chegar ao servidor (4000): ela continua não lida.
    await (orm as { batch: (c: unknown[]) => Promise<unknown> }).batch(sqlChat.comandosGuardarMensagem(orm, m("aaaaaaaa03", 2, 3000)) as never);
    await sqlChat.comandoMarcarLidaChat(orm, "p1-2", 1, "aaaaaaaa02", 4000);
    assert.equal((await sqlChat.consultaConversasChat(orm, 1, 0))[0].naoLidas, 1, "a hora lida é a da mensagem lida, não a do sinal");
    await sqlChat.comandoMarcarLidaChat(orm, "p1-2", 1, "aaaaaaaa03", 4100);
    assert.equal((await sqlChat.consultaConversasChat(orm, 1, 0))[0].naoLidas, 0);
    await sqlChat.comandoMarcarLidaChat(orm, "p1-2", 1, "aaaaaaaa01", 4200);
    assert.equal((await sqlChat.consultaConversasChat(orm, 1, 0))[0].naoLidas, 0, "nunca volta para trás");
    const lidas = await sqlChat.consultaLidasChat(orm, "p1-2");
    assert.deepEqual(lidas.find((l: { usuarioId: number }) => l.usuarioId === 1)?.lidaAte, "aaaaaaaa03", "o ✓✓ também não volta");
    const hist = await sqlChat.consultaHistoricoChat(orm, "p1-2", 0, 200);
    assert.deepEqual(hist.map((h: { id: string }) => h.id), ["aaaaaaaa03", "aaaaaaaa02", "aaaaaaaa01"]);
    assert.equal((await sqlChat.consultaParticipa(orm, "p1-2", 3)).length, 0);
    // limpeza: o que é anterior a 1500 sai; a conversa (última em 2000) fica
    await (orm as { batch: (c: unknown[]) => Promise<unknown> }).batch(sqlChat.comandosLimparChat(orm, 1500) as never);
    assert.equal((db.prepare("SELECT count(*) AS n FROM chat_mensagens").get() as { n: number }).n, 2);
    await (orm as { batch: (c: unknown[]) => Promise<unknown> }).batch(sqlChat.comandosLimparChat(orm, 9999) as never);
    assert.equal((db.prepare("SELECT count(*) AS n FROM chat_conversas").get() as { n: number }).n, 0);
  });
  it("conversa em grupo com 20 pessoas (lotes ≤ 100 parâmetros) e o chat do grupo pela chave do grupo", async () => {
    const { db, orm } = banco();
    const vals = Array.from({ length: 20 }, (_, i) => `(${10 + i}, 'p${i}@x', 'P${i}', 'h', 'membro', 'ativo')`).join(",");
    db.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, role, status) VALUES ${vals}`);
    const membros = Array.from({ length: 20 }, (_, i) => 10 + i);
    await (orm as { batch: (c: unknown[]) => Promise<unknown> }).batch(
      sqlChat.comandosGuardarMensagem(orm, { id: "cccccccc01", chave: "cabc123", de: 10, texto: "reunião", resp: null, em: 5000, participantes: membros, nome: "Compras", membros }) as never,
    );
    assert.equal((db.prepare("SELECT count(*) AS n FROM chat_conversas WHERE conversa = 'cabc123'").get() as { n: number }).n, 20);
    const p15 = await sqlChat.consultaConversasChat(orm, 15, 0);
    assert.equal(p15[0].nome, "Compras");
    assert.deepEqual(JSON.parse(p15[0].membros ?? "[]"), membros);
    // grupo
    await (orm as { batch: (c: unknown[]) => Promise<unknown> }).batch(sqlChat.comandosGuardarMensagem(orm, { id: "gggggggg01", chave: "g7", de: 1, texto: "bom dia", resp: null, em: 6000, participantes: [1] }) as never);
    const r = await sqlChat.consultaResumoGrupo(orm, "g7", 2, 0);
    assert.equal(r[0].naoLidas, 1);
    assert.equal(r[0].texto, "bom dia");
    assert.equal((await sqlChat.consultaConversasChat(orm, 1, 0)).length, 0, "o do grupo não entra na lista de privadas");
  });
});
