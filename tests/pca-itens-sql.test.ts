import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { dfdItens, dfdProtocolos } from "../src/db/schema.ts";
import {
  baixarNumeros,
  baixarNumerosPendentes,
  desvincularDfdDoPca,
  desvincularProtocoloDoPca,
  gravarSequencialDoDfd,
  gravarSequencialNosItens,
  numerarItensDoDfd,
  numerarItensDoProtocolo,
  reativarVigentes,
  religarNumeros,
  retratarNumeros,
  vincularDfdAoPca,
} from "../src/lib/pca-itens-sql.ts";
import { MOTIVO_NUMERO, type NumeroLivre, parearNumeros } from "../src/lib/pca-numeracao-core.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// A NUMERAÇÃO dos itens no PCA pelos MESMOS builders do servidor, no driver `drizzle-orm/d1` REAL (sobre um D1
// mínimo em `node:sqlite`) e DENTRO de `db.batch` — como a incorporação. Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("sequencial do item no PCA (builders no db.batch do D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  /** O lote da incorporação (depois do upsert em `pca_dfds`): numera + grava no item + marca o protocolo. */
  const incorporar = (pca: number, protocolo: number) =>
    orm.batch([
      numerarItensDoProtocolo(orm, pca, protocolo),
      gravarSequencialNosItens(orm, pca, protocolo),
      orm
        .update(dfdProtocolos)
        .set({ pcaIncorporadoEm: "2027-01-01" })
        .where(and(eq(dfdProtocolos.id, protocolo), eq(dfdProtocolos.pcaId, pca))),
    ]);
  const numeros = (pca: number) =>
    (db.prepare("SELECT sequencial AS s, dfd_item_id AS i FROM pca_itens WHERE pca_id = ? ORDER BY sequencial").all(pca) as { s: number; i: number }[]).map(
      (r) => ({ ...r }),
    );

  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO pcas (id, nome, ano, fonte) VALUES (1, 'PCA 2027', 2027, 'protocolo'), (2, 'Outro', 2027, 'protocolo');
      INSERT INTO dfd_protocolos (id, numero, pca_id) VALUES (10, 'P-10', 1), (20, 'P-20', 1), (30, 'P-30', 2);
      INSERT INTO dfds (id, numero, protocolo_id) VALUES (100, 'D100', 10), (101, 'D101', 10), (200, 'D200', 20), (201, 'D201', 20), (300, 'D300', 30);
      INSERT INTO dfd_itens (id, dfd_id, sequencial) VALUES (1, 100, 1), (2, 100, 2), (3, 101, 1), (4, 200, 1), (5, 200, 2), (6, 201, 1), (7, 300, 1);
      INSERT INTO pca_dfds (pca_id, dfd_id, acao) VALUES (1, 100, 'incorporar'), (1, 101, 'incorporar'), (1, 200, 'incorporar'), (1, 201, 'excluir'), (2, 300, 'incorporar');`);
  });

  it("numera 1..N na ordem DFD → item e grava o nº no próprio item", async () => {
    await incorporar(1, 10);
    assert.deepEqual(numeros(1), [
      { s: 1, i: 1 },
      { s: 2, i: 2 },
      { s: 3, i: 3 },
    ]);
    assert.deepEqual({ ...(db.prepare("SELECT pca_id AS p, pca_sequencial AS s FROM dfd_itens WHERE id = 3").get() as object) }, { p: 1, s: 3 });
    assert.ok((db.prepare("SELECT pca_incorporado_em AS e FROM dfd_protocolos WHERE id = 10").get() as { e: string | null }).e);
  });

  it("idempotente: repetir o lote não duplica", async () => {
    await incorporar(1, 10);
    assert.equal(numeros(1).length, 3);
  });

  it("o próximo protocolo continua a sequência; DFD com ação 'excluir' não numera", async () => {
    await incorporar(1, 20);
    assert.deepEqual(
      numeros(1).map((n) => n.s),
      [1, 2, 3, 4, 5],
    );
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM pca_itens WHERE dfd_item_id = 6").get() as { n: number }).n, 0);
  });

  it("número INATIVO nunca é reaproveitado; cada PCA tem a sua sequência", async () => {
    db.exec("UPDATE pca_itens SET ativo = 0 WHERE pca_id = 1 AND sequencial = 5");
    await incorporar(2, 30);
    assert.deepEqual(numeros(2), [{ s: 1, i: 7 }]);
    db.exec("INSERT INTO dfd_itens (id, dfd_id, sequencial) VALUES (8, 200, 3)");
    await incorporar(1, 20);
    assert.equal(numeros(1).at(-1)?.s, 6, "o nº 5 (inativo) segue ocupado — o novo item ganha o 6");
  });

  it("o par (pca, sequencial) é ÚNICO", () => {
    assert.throws(() => db.exec("INSERT INTO pca_itens (pca_id, sequencial) VALUES (1, 1)"));
  });
});

// PROTOCOLO INCORPORADO EDITÁVEL (migração 0077): a regravação dos itens, a entrada/saída do DFD e as baixas — os MESMOS
// builders e o MESMO pareamento puro do servidor (`pca-sincronia.ts`), no driver D1 real dentro de `db.batch`.
describe("protocolo incorporado editável: o nº do item segue o item", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  type Item = { item: number; codigo: string; descricao: string; unidade: string };
  const it0 = (item: number, codigo: string, descricao: string, unidade = "UN"): Item => ({ item, codigo, descricao, unidade });
  const numerosDoDfd = (dfd: number) =>
    (
      db
        .prepare(
          "SELECT p.sequencial AS s, p.ativo AS a, p.baixado_em IS NOT NULL AS b, i.descricao AS d FROM pca_itens p LEFT JOIN dfd_itens i ON i.id = p.dfd_item_id WHERE p.dfd_id = ? ORDER BY p.sequencial",
        )
        .all(dfd) as { s: number; a: number; b: number; d: string | null }[]
    ).map((r) => ({ ...r }));
  const seqDosItens = (dfd: number) =>
    (db.prepare("SELECT descricao AS d, pca_sequencial AS s FROM dfd_itens WHERE dfd_id = ? ORDER BY sequencial").all(dfd) as { d: string; s: number | null }[]).map(
      (r) => ({ ...r }),
    );
  /** Os nºs livres para uma regravação: os não baixados do DFD com a identidade do item (vivo) ou o retrato. */
  const livres = (dfd: number, apagados: (seq: number | null) => boolean): NumeroLivre[] =>
    (
      db
        .prepare(
          `SELECT p.pca_id AS pcaId, p.sequencial, COALESCE(i.item, p.item) AS item, COALESCE(i.codigo, p.codigo) AS codigo,
             COALESCE(i.descricao, p.descricao) AS descricao, COALESCE(i.unidade, p.unidade) AS unidade, i.sequencial AS seqItem
           FROM pca_itens p LEFT JOIN dfd_itens i ON i.id = p.dfd_item_id WHERE p.dfd_id = ? AND p.baixado_em IS NULL`,
        )
        .all(dfd) as (NumeroLivre & { seqItem: number | null })[]
    )
      .filter((r) => r.seqItem == null || apagados(r.seqItem))
      .map(({ seqItem: _s, ...r }) => ({ ...r }));
  /** Uma gravação do servidor: retrato → apaga (`desde`: só os de sequencial > desde) → insere com o nº pareado → religa;
   * `completo`: numera os novos, grava no item e baixa os pendentes. */
  const gravar = async (dfd: number, lote: Item[], o: { desde: number; completo: boolean }) => {
    const { numeros } = parearNumeros(lote, livres(dfd, (s) => s == null || s > o.desde));
    const valores = lote.map((x, j) => ({
      dfdId: dfd,
      ...x,
      sequencial: o.desde + j + 1,
      pcaId: numeros[j]?.pcaId ?? null,
      pcaSequencial: numeros[j]?.sequencial ?? null,
    }));
    await orm.batch([
      retratarNumeros(orm, { dfdId: dfd }),
      orm.delete(dfdItens).where(and(eq(dfdItens.dfdId, dfd), gt(dfdItens.sequencial, o.desde))),
      ...(valores.length ? [orm.insert(dfdItens).values(valores)] : []),
      religarNumeros(orm, dfd),
      ...(o.completo
        ? [numerarItensDoDfd(orm, dfd), gravarSequencialDoDfd(orm, dfd), baixarNumerosPendentes(orm, dfd, MOTIVO_NUMERO.itemRemovido, null)]
        : []),
    ]);
  };

  before(async () => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO pcas (id, nome, ano, fonte) VALUES (1, 'PCA 2027', 2027, 'protocolo'), (2, 'PCA 2028', 2028, 'protocolo');
      INSERT INTO dfd_protocolos (id, numero, pca_id, pca_incorporado_em) VALUES (10, 'P-10', 1, '2027-01-01'), (20, 'P-20', 1, '2027-01-02'), (30, 'P-30', NULL, NULL), (40, 'P-40', 2, '2027-02-01');
      INSERT INTO dfds (id, numero, protocolo_id, total_itens) VALUES (100, 'D100', 10, 4), (200, 'D200', 20, 1);
      INSERT INTO dfd_itens (dfd_id, item, codigo, descricao, unidade, sequencial) VALUES
        (100, 1, '111', 'CADEIRA', 'UN', 1), (100, 2, '222', 'MESA', 'UN', 2), (100, 3, '333', 'ARMÁRIO', 'UN', 3), (100, 4, '444', 'ESTANTE', 'UN', 4),
        (200, 1, '555', 'SOFÁ', 'UN', 1);
      INSERT INTO pca_dfds (pca_id, dfd_id, acao, protocolo_id) VALUES (1, 100, 'incorporar', 10), (1, 200, 'incorporar', 20);`);
    await orm.batch([numerarItensDoProtocolo(orm, 1, 10), gravarSequencialNosItens(orm, 1, 10)]);
    await orm.batch([numerarItensDoProtocolo(orm, 1, 20), gravarSequencialNosItens(orm, 1, 20)]);
  });

  it("a incorporação grava o retrato do item no nº", () => {
    assert.deepEqual({ ...(db.prepare("SELECT codigo, descricao, unidade, item FROM pca_itens WHERE sequencial = 2").get() as object) }, {
      codigo: "222",
      descricao: "MESA",
      unidade: "UN",
      item: 2,
    });
  });

  it("regravar tudo (o banner salvou uma quantidade): os nºs ficam com os mesmos itens", async () => {
    await gravar(100, [it0(1, "111", "CADEIRA"), it0(2, "222", "MESA"), it0(3, "333", "ARMÁRIO"), it0(4, "444", "ESTANTE")], { desde: 0, completo: true });
    assert.deepEqual(seqDosItens(100), [
      { d: "CADEIRA", s: 1 },
      { d: "MESA", s: 2 },
      { d: "ARMÁRIO", s: 3 },
      { d: "ESTANTE", s: 4 },
    ]);
    assert.equal(numerosDoDfd(100).filter((n) => n.b).length, 0);
  });

  it("remover no meio NÃO desloca; o novo ganha o próximo nº do PCA; o removido é baixado", async () => {
    // Sai a MESA (nº 2); o ARMÁRIO e a ESTANTE sobem de posição; entra um ARQUIVO.
    await gravar(100, [it0(1, "111", "CADEIRA"), it0(2, "333", "ARMÁRIO"), it0(3, "444", "ESTANTE"), it0(4, "666", "ARQUIVO")], { desde: 0, completo: true });
    assert.deepEqual(seqDosItens(100), [
      { d: "CADEIRA", s: 1 },
      { d: "ARMÁRIO", s: 3 },
      { d: "ESTANTE", s: 4 },
      { d: "ARQUIVO", s: 6 }, // o 5 é do SOFÁ (outro protocolo): o MAX do PCA
    ]);
    const mesa = numerosDoDfd(100).find((n) => n.s === 2);
    assert.deepEqual(mesa, { s: 2, a: 0, b: 1, d: null });
    assert.equal((db.prepare("SELECT descricao AS d, motivo AS m FROM pca_itens WHERE sequencial = 2").get() as { d: string; m: string }).d, "MESA", "o retrato fica");
  });

  it("o nº baixado não volta — o mesmo produto de novo ganha um nº novo", async () => {
    await gravar(100, [it0(1, "111", "CADEIRA"), it0(2, "333", "ARMÁRIO"), it0(3, "444", "ESTANTE"), it0(4, "666", "ARQUIVO"), it0(5, "222", "MESA")], {
      desde: 0,
      completo: true,
    });
    assert.equal(seqDosItens(100).at(-1)?.s, 7);
  });

  it("descrição corrigida e item renumerado: o nº segue pelo código/nº do item", async () => {
    await gravar(
      100,
      [it0(1, "111", "CADEIRA GIRATÓRIA"), it0(2, "333", "ARMÁRIO"), it0(3, "444", "ESTANTE"), it0(4, "666", "ARQUIVO"), it0(5, "222", "MESA")],
      { desde: 0, completo: true },
    );
    assert.deepEqual(
      seqDosItens(100).map((x) => x.s),
      [1, 3, 4, 6, 7],
    );
  });

  it("o item RETIRADO do PCA continua retirado depois da regravação", async () => {
    db.exec("UPDATE pca_itens SET ativo = 0, motivo = 'Retirado do PCA' WHERE sequencial = 3");
    await gravar(
      100,
      [it0(1, "111", "CADEIRA GIRATÓRIA"), it0(2, "333", "ARMÁRIO"), it0(3, "444", "ESTANTE"), it0(4, "666", "ARQUIVO"), it0(5, "222", "MESA")],
      { desde: 0, completo: true },
    );
    assert.deepEqual(numerosDoDfd(100).find((n) => n.s === 3), { s: 3, a: 0, b: 0, d: "ARMÁRIO" });
  });

  it("em LOTES (start + append): os nºs seguem; o retry do append não duplica; os pendentes só baixam no fim", async () => {
    const todos = [it0(1, "111", "CADEIRA GIRATÓRIA"), it0(2, "333", "ARMÁRIO"), it0(3, "444", "ESTANTE"), it0(4, "666", "ARQUIVO"), it0(5, "222", "MESA")];
    await gravar(100, todos.slice(0, 2), { desde: 0, completo: false });
    assert.equal(numerosDoDfd(100).filter((n) => n.b).length, 1, "no meio da gravação nada novo é baixado (só a MESA de antes)");
    await gravar(100, todos.slice(2, 4), { desde: 2, completo: false });
    await gravar(100, todos.slice(2, 4), { desde: 2, completo: false }); // retry do mesmo lote
    await gravar(100, todos.slice(4), { desde: 4, completo: true });
    assert.deepEqual(
      seqDosItens(100).map((x) => x.s),
      [1, 3, 4, 6, 7],
    );
    assert.equal((db.prepare("SELECT MAX(sequencial) AS m FROM pca_itens WHERE pca_id = 1").get() as { m: number }).m, 7, "nenhum nº gasto à toa");
  });

  it("repetidos UNIFICADOS: o que fica mantém o nº dele; o do outro é baixado", async () => {
    db.exec("INSERT INTO dfds (id, numero, protocolo_id, total_itens) VALUES (101, 'D101', 10, 2); INSERT INTO pca_dfds (pca_id, dfd_id, acao, protocolo_id) VALUES (1, 101, 'incorporar', 10)");
    await gravar(101, [it0(1, "777", "PAPEL"), it0(2, "777", "PAPEL")], { desde: 0, completo: true });
    const [a, b] = seqDosItens(101).map((x) => x.s as number);
    await gravar(101, [it0(1, "777", "PAPEL")], { desde: 0, completo: true });
    assert.deepEqual(seqDosItens(101), [{ d: "PAPEL", s: a }]);
    assert.equal(numerosDoDfd(101).find((n) => n.s === b)?.b, 1);
  });

  it("o DFD SAI do PCA (movido/devolvido): vínculo de incorporação removido, nºs baixados e o item sem nº", async () => {
    await orm.batch([
      retratarNumeros(orm, { dfdId: 101 }),
      ...baixarNumeros(orm, { dfdId: 101 }, 1, MOTIVO_NUMERO.dfdSaiu, null),
      desvincularDfdDoPca(orm, 101, 1),
    ]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM pca_dfds WHERE dfd_id = 101").get() as { n: number }).n, 0);
    assert.ok(numerosDoDfd(101).every((n) => n.b === 1 && n.a === 0));
    assert.deepEqual(seqDosItens(101), [{ d: "PAPEL", s: null }]);
  });

  it("o DFD ENTRA num protocolo incorporado: ganha o vínculo (ação do protocolo) e nºs novos", async () => {
    db.exec("UPDATE pca_dfds SET acao = 'substituir' WHERE dfd_id = 100");
    await orm.batch([
      vincularDfdAoPca(orm, 101, 1, 10, "incorporar", null),
      numerarItensDoDfd(orm, 101),
      gravarSequencialDoDfd(orm, 101),
    ]);
    assert.equal((db.prepare("SELECT acao AS a, protocolo_id AS p FROM pca_dfds WHERE dfd_id = 101").get() as { a: string }).a, "substituir");
    assert.equal(seqDosItens(101)[0].s, 10, "nº novo (o MAX do PCA) — os antigos (8 e 9) ficam baixados");
  });

  it("o vínculo LEGADO (sem protocolo) nunca é tirado; o de mesmo PCA vira do protocolo", async () => {
    db.exec("INSERT INTO dfds (id, numero, protocolo_id) VALUES (102, 'D102', 30); INSERT INTO pca_dfds (pca_id, dfd_id, acao) VALUES (2, 102, 'incorporar')");
    await orm.batch([desvincularDfdDoPca(orm, 102, 2)]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM pca_dfds WHERE dfd_id = 102").get() as { n: number }).n, 1);
    await orm.batch([vincularDfdAoPca(orm, 102, 2, 40, "excluir", null)]);
    assert.deepEqual({ ...(db.prepare("SELECT acao AS a, protocolo_id AS p FROM pca_dfds WHERE dfd_id = 102").get() as object) }, { a: "incorporar", p: 40 });
  });

  it("devolver/excluir o PROTOCOLO: baixa os nºs de todos os DFDs dele e tira os vínculos", async () => {
    await orm.batch([
      retratarNumeros(orm, { protocoloId: 20 }),
      ...baixarNumeros(orm, { protocoloId: 20 }, 1, MOTIVO_NUMERO.protocoloDevolvido, null),
      desvincularProtocoloDoPca(orm, 20, 1),
    ]);
    assert.ok(numerosDoDfd(200).every((n) => n.b === 1));
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM pca_dfds WHERE protocolo_id = 20").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT descricao AS d FROM pca_itens WHERE dfd_id = 200").get() as { d: string }).d, "SOFÁ");
  });

  it("o NÃO VIGENTE volta a valer: reativado (o baixado e o retirado, não)", async () => {
    db.exec("UPDATE pca_itens SET ativo = 0, motivo = 'DFD substituído/excluído no PCA' WHERE dfd_id = 100 AND sequencial IN (1, 4)");
    await orm.batch([reativarVigentes(orm, 1, [100], MOTIVO_NUMERO.naoVigente)]);
    const n = numerosDoDfd(100);
    assert.equal(n.find((x) => x.s === 1)?.a, 1);
    assert.equal(n.find((x) => x.s === 4)?.a, 1);
    assert.equal(n.find((x) => x.s === 3)?.a, 0, "o retirado segue retirado");
    assert.equal(n.find((x) => x.s === 2)?.a, 0, "o baixado segue baixado");
  });
});
