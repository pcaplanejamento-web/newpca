import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  assinaturaConfiavel,
  assinaturaDfd,
  assinaturaProtocolo,
  type BaseDfdCampos,
  type BaseProtocoloCampos,
  chaveContexto,
  chavesUnidades,
} from "../src/lib/conferencia-cache-core.ts";
import { comandosGravarConferencias, comandosLimparOrfas, consultaConferencias, LINHAS_POR_INSERT } from "../src/lib/conferencia-cache-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// CONFERÊNCIA GUARDADA: o Estado só vale com a MESMA assinatura de entrada — qualquer entrada que a conferência lê
// muda a assinatura (e o guardado deixa de valer sozinho). Os builders rodam no driver D1 real (≤ 100 parâmetros).

const dfd: BaseDfdCampos = {
  id: 10,
  atualizadoEm: "2026-10-01 10:00:00",
  reparticaoId: 5,
  protocoloId: 1,
  protocoloAssunto: "INCLUSÃO PCA 2027",
  anoPca: 2027,
  protocoloAnoPca: 2027,
  totalItens: 3,
};
const proto: BaseProtocoloCampos = {
  id: 1,
  dfdsAtualizadoEm: "2026-10-01 10:00:00",
  totalDfds: 1,
  valorTotal: 100,
  sobrescritos: 0,
  valorSobrescritos: 0,
  valorCapa: 100,
  assunto: "INCLUSÃO PCA 2027",
  anoPca: 2027,
};
const unidade = { id: 5, orgaoId: 2, responsaveis: { padrao: [{ nome: "ANA" }] } };

describe("conferência guardada — assinatura", () => {
  it("muda com cada entrada da conferência", async () => {
    const ctx = await chaveContexto({ a: 1 }, [{ id: 2 }]);
    const u = await chavesUnidades([unidade]);
    const base = assinaturaDfd(dfd, ctx, u);
    const variacoes: Partial<BaseDfdCampos>[] = [
      { atualizadoEm: "2026-10-02 10:00:00" },
      { reparticaoId: 6 },
      { protocoloId: 2 },
      { protocoloAssunto: "EXCLUSÃO" },
      { anoPca: 2028 },
      { protocoloAnoPca: 2028 },
      { totalItens: 4 },
    ];
    for (const v of variacoes) assert.notEqual(assinaturaDfd({ ...dfd, ...v }, ctx, u), base, JSON.stringify(v));
    assert.notEqual(assinaturaDfd(dfd, await chaveContexto({ a: 2 }, [{ id: 2 }]), u), base, "regras");
    assert.notEqual(assinaturaDfd(dfd, await chaveContexto({ a: 1 }, [{ id: 3 }]), u), base, "órgãos");
    const outraU = await chavesUnidades([{ ...unidade, responsaveis: { padrao: [{ nome: "BIA" }] } }]);
    assert.notEqual(assinaturaDfd(dfd, ctx, outraU), base, "responsáveis");
    assert.equal(assinaturaDfd({ ...dfd }, ctx, u), base, "as mesmas entradas = a mesma assinatura");
  });

  it("unidade desconhecida = assinatura não confiável (nunca usa o guardado)", async () => {
    const a = assinaturaDfd(dfd, await chaveContexto(null, null), new Map());
    assert.equal(assinaturaConfiavel(a), false);
    assert.equal(assinaturaConfiavel(assinaturaDfd({ ...dfd, reparticaoId: null }, "c", new Map())), true);
  });

  it("protocolo: muda com a capa, o ano ou QUALQUER DFD dele (a ordem não importa)", async () => {
    const base = await assinaturaProtocolo(proto, "c", ["a", "b"]);
    assert.equal(await assinaturaProtocolo(proto, "c", ["b", "a"]), base);
    assert.notEqual(await assinaturaProtocolo(proto, "c", ["a", "b2"]), base);
    assert.notEqual(await assinaturaProtocolo({ ...proto, valorCapa: 99 }, "c", ["a", "b"]), base);
    assert.notEqual(await assinaturaProtocolo({ ...proto, anoPca: 2028 }, "c", ["a", "b"]), base);
    assert.notEqual(await assinaturaProtocolo(proto, "d", ["a", "b"]), base);
  });
});

describe("conferência guardada — builders no D1 real", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO dfd_protocolos (id, numero) VALUES (1, '1/2026')");
    for (let i = 1; i <= 50; i++) db.prepare("INSERT INTO dfds (id, numero) VALUES (?, ?)").run(i, String(i));
  });

  it("upsert de 50 linhas (mais de um INSERT, ≤ 100 parâmetros) e a leitura por json_each", async () => {
    const linhas = Array.from({ length: 50 }, (_, i) => ({ alvoId: i + 1, assinatura: `s${i + 1}`, resultado: "{}" }));
    const cmds = comandosGravarConferencias(orm, "dfd", linhas);
    assert.equal(cmds.length, Math.ceil(50 / LINHAS_POR_INSERT));
    for (const c of cmds) assert.ok(c.toSQL().params.length <= 100);
    await orm.batch(cmds as never);
    await orm.batch(comandosGravarConferencias(orm, "dfd", [{ alvoId: 3, assinatura: "nova", resultado: '{"x":1}' }]) as never);
    const lidas = await consultaConferencias(orm, "dfd", [3, 4, 999]);
    const m = new Map(lidas.map((l) => [l.alvoId, l]));
    assert.equal(m.size, 2);
    assert.equal(m.get(3)?.assinatura, "nova");
    assert.equal(m.get(3)?.resultado, '{"x":1}');
    assert.equal((await consultaConferencias(orm, "protocolo", [3])).length, 0, "o tipo separa");
  });

  it("limpa as órfãs (DFD e protocolo que não existem mais)", async () => {
    await orm.batch(comandosGravarConferencias(orm, "protocolo", [
      { alvoId: 1, assinatura: "p", resultado: "{}" },
      { alvoId: 77, assinatura: "p", resultado: "{}" },
    ]) as never);
    db.exec("DELETE FROM dfds WHERE id = 4");
    const [a, b] = comandosLimparOrfas(orm);
    await orm.batch([a, b]);
    assert.deepEqual((await consultaConferencias(orm, "dfd", [3, 4])).map((l) => l.alvoId), [3]);
    assert.deepEqual((await consultaConferencias(orm, "protocolo", [1, 77])).map((l) => l.alvoId), [1]);
  });
});
