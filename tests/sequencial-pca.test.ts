import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { itens } from "../src/db/schema.ts";
import { numerarItensDoProtocolo } from "../src/lib/pca-itens-sql.ts";
import { comandoSobrescrever, comandosLimparVazias, comandoTotaisUnidades, consultaMaximoSequencial, consultaSequenciaisDeProtocolo } from "../src/lib/pca-upload-sql.ts";
import { atribuirSequenciais, repetidos, textoNumeros } from "../src/lib/sequencial-pca-core.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

describe("sequencial sagrado (núcleo)", () => {
  it("repetidos acha os nºs que aparecem duas vezes", () => {
    assert.deepEqual(repetidos([3, 1, null, 3, 2, 1, null]), [1, 3]);
    assert.deepEqual(repetidos([null, null, 5]), []);
  });
  it("sem nº segue a sequência depois do maior do PCA e do lote, na ordem", () => {
    assert.deepEqual(atribuirSequenciais([null, null], 10), [11, 12]);
    assert.deepEqual(atribuirSequenciais([4, null, 30, null], 10), [4, 31, 30, 32]);
    assert.deepEqual(atribuirSequenciais([], 7), []);
  });
  it("textoNumeros resume listas longas", () => {
    assert.equal(textoNumeros([1, 2, 3]), "1, 2, 3");
    assert.equal(textoNumeros([1, 2, 3, 4], 2), "1, 2 e mais 2");
  });
});

describe("sequencial sagrado (D1 real: sobrescrita, gatilhos e numeração dos protocolos)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const seqs = () => (db.prepare("SELECT sequencial AS s, unidade_id AS u FROM itens WHERE pca_id = 1 ORDER BY sequencial").all() as { s: number; u: number }[]).map((r) => ({ ...r }));

  before(() => {
    db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
    db.exec("PRAGMA foreign_keys = ON");
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO pcas (id, nome, ano, fonte) VALUES (1, 'PCA 2027', 2027, 'lista');
      INSERT INTO pca_uploads (id, pca_id, nome_arquivo) VALUES (1, 1, 'a.xlsx'), (2, 1, 'b.xlsx');
      INSERT INTO unidades (id, codigo, municipio, pca_id, upload_id) VALUES (1, 'SME', 'RV', 1, 1), (2, 'SMS', 'RV', 1, 2);
      INSERT INTO itens (unidade_id, pca_id, sequencial, valor_total) VALUES (1, 1, 1, 10), (1, 1, 2, 20);`);
  });

  it("o banco recusa o mesmo sequencial duas vezes no PCA", () => {
    assert.throws(() => db.exec("INSERT INTO itens (unidade_id, pca_id, sequencial) VALUES (2, 1, 2)"), /sequencial_duplicado/);
  });

  it("o nº que chega sobrescreve o item que o tinha (em outro upload), e os totais acompanham", async () => {
    await orm.batch([comandoSobrescrever(orm, 1, [2]), orm.insert(itens).values([{ unidadeId: 2, pcaId: 1, sequencial: 2, valorTotal: 99 }]), comandoTotaisUnidades(orm, 1), ...comandosLimparVazias(orm, 1)]);
    assert.deepEqual(seqs(), [
      { s: 1, u: 1 },
      { s: 2, u: 2 },
    ]);
    const tot = db.prepare("SELECT total_itens AS n, valor_total AS v FROM unidades WHERE id = 1").get() as { n: number; v: number };
    assert.deepEqual({ ...tot }, { n: 1, v: 10 });
  });

  it("a planilha que perdeu todos os itens sai, e o upload sem planilhas também", async () => {
    await orm.batch([comandoSobrescrever(orm, 1, [1]), orm.insert(itens).values([{ unidadeId: 2, pcaId: 1, sequencial: 1 }]), comandoTotaisUnidades(orm, 1), ...comandosLimparVazias(orm, 1)]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM unidades WHERE id = 1").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM pca_uploads WHERE id = 1").get() as { n: number }).n, 0);
  });

  it("os protocolos continuam a sequência do PCA (depois da planilha) e nunca repetem", async () => {
    db.exec(`INSERT INTO dfd_protocolos (id, numero, pca_id) VALUES (10, 'P-10', 1);
      INSERT INTO dfds (id, numero, protocolo_id) VALUES (100, 'D100', 10);
      INSERT INTO dfd_itens (id, dfd_id, sequencial) VALUES (1, 100, 1), (2, 100, 2);
      INSERT INTO pca_dfds (pca_id, dfd_id, acao) VALUES (1, 100, 'incorporar');`);
    await orm.batch([numerarItensDoProtocolo(orm, 1, 10)]);
    const ns = (db.prepare("SELECT sequencial AS s FROM pca_itens WHERE pca_id = 1 ORDER BY sequencial").all() as { s: number }[]).map((r) => r.s);
    assert.deepEqual(ns, [3, 4]);
    const [m] = await consultaMaximoSequencial(orm, 1);
    assert.equal(m.max, 4);
    assert.deepEqual((await consultaSequenciaisDeProtocolo(orm, 1, [2, 3, 9])).map((x) => x.sequencial), [3]);
    assert.throws(() => db.exec("INSERT INTO itens (unidade_id, pca_id, sequencial) VALUES (2, 1, 4)"), /sequencial_duplicado/);
  });
});
