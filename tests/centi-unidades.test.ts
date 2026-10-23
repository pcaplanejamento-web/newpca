import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  chaveSigla,
  lerValorVinculo,
  motivoVinculoInvalido,
  mudaVinculo,
  paresDasLinhas,
  rotuloUnidadeCenti,
  sugestoesPorSigla,
  type UnidadeCenti,
  valorVinculo,
} from "../src/lib/centi-unidades-core.ts";
import { comandoRegistrarUnidades, comandosVincular, consultaUnidadesCenti, contagemUnidadesDoLote } from "../src/lib/centi-unidades-sql.ts";
import { lerPaginaEmpenhos } from "../src/lib/empenhos-core.ts";
import { comandosGuardarPagina, comandosPromover, contagemDaPromocao } from "../src/lib/empenhos-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const cadastro = {
  orgaos: [
    { id: 1, sigla: "PMRV" },
    { id: 2, sigla: "F.M.S" },
  ],
  unidades: [
    { id: 10, orgaoId: 1 },
    { id: 20, orgaoId: 2 },
  ],
};

const u = (id: number, orgaoGestor: string, unidade = "", orgaoId: number | null = null): UnidadeCenti => ({
  id,
  orgaoGestor,
  unidade,
  orgaoId,
  reparticaoId: null,
  registros: 0,
  ultimoAno: null,
  vistoEm: "",
  vinculadoEm: null,
  vinculadoPor: null,
  gravados: 0,
});

test("unidades da Centi: o seletor, a conferência do vínculo e as sugestões pela sigla", () => {
  assert.deepEqual(
    paresDasLinhas([
      { orgaoGestor: "FMS", unidadeOrcamentaria: null },
      { orgaoGestor: "FMS", unidadeOrcamentaria: null },
      { orgaoGestor: "FMS", unidadeOrcamentaria: "02.01" },
    ]),
    [
      ["FMS", "", 2],
      ["FMS", "02.01", 1],
    ],
  );
  assert.equal(valorVinculo({ orgaoId: 1, reparticaoId: null }), "o:1");
  assert.equal(valorVinculo({ orgaoId: 1, reparticaoId: 10 }), "u:10");
  assert.equal(valorVinculo({ orgaoId: null, reparticaoId: null }), "");
  assert.deepEqual(lerValorVinculo("u:20", cadastro), { orgaoId: 2, reparticaoId: 20 }, "a unidade traz o órgão dela");
  assert.equal(lerValorVinculo("o:9", cadastro), undefined);
  assert.equal(lerValorVinculo("x", cadastro), undefined);
  assert.equal(lerValorVinculo("", cadastro), null);
  assert.equal(motivoVinculoInvalido({ orgaoId: 1, reparticaoId: 20 }, cadastro), "A unidade não pertence ao órgão informado.");
  assert.match(motivoVinculoInvalido({ orgaoId: 9, reparticaoId: null }, cadastro) ?? "", /Órgão fora/);
  assert.match(motivoVinculoInvalido({ orgaoId: 1, reparticaoId: 99 }, cadastro) ?? "", /Unidade fora/);
  assert.equal(motivoVinculoInvalido({ orgaoId: 2, reparticaoId: 20 }, cadastro), null);
  assert.equal(motivoVinculoInvalido(null, cadastro), null);
  assert.equal(chaveSigla(" f.m.s "), "FMS");
  assert.deepEqual(sugestoesPorSigla([u(1, "fms"), u(2, "PMRV", "", 1), u(3, "OUTRO")], cadastro), [{ id: 1, orgaoId: 2 }]);
  // Dois órgãos com a mesma sigla = nenhuma sugestão (nunca adivinha).
  assert.deepEqual(sugestoesPorSigla([u(1, "PMRV")], { ...cadastro, orgaos: [...cadastro.orgaos, { id: 3, sigla: "pmrv" }] }), []);
  assert.ok(!mudaVinculo(u(1, "X", "", 1), { orgaoId: 1, reparticaoId: null }));
  assert.ok(mudaVinculo(u(1, "X", "", 1), null));
  assert.equal(rotuloUnidadeCenti(u(1, "FMS", "02.01 - FUNDO")), "FMS · 02.01 - FUNDO");
});

function banco() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  for (const m of ["0129_centi_apis", "0130_centi_apis_escopo", "0131_empenhos", "0132_centi_lote_passos", "0134_empenhos_conferencia"]) raw.exec(readFileSync(new URL(`../drizzle/${m}.sql`, import.meta.url), "utf8"));
  raw.exec("CREATE TABLE orgaos (id integer PRIMARY KEY, sigla text NOT NULL, oculto integer NOT NULL DEFAULT 0); CREATE TABLE reparticoes (id integer PRIMARY KEY, orgao_id integer)");
  raw.exec("INSERT INTO orgaos (id, sigla) VALUES (1, 'PMRV'), (2, 'FMS'), (3, 'FMS'); INSERT INTO reparticoes (id, orgao_id) VALUES (10, 1), (20, 2)");
  // Empenhos gravados ANTES da 0138 (a migração os liga pela sigla e apaga os sem órgão).
  raw.exec(`INSERT INTO empenhos (chave, ano, numero, orgao_gestor) VALUES ('2026|PMRV|1', 2026, '1', 'P.M.R.V'), ('2026|FMS|1', 2026, '1', 'FMS'), ('2026|XYZ|1', 2026, '1', 'XYZ')`);
  raw.exec(readFileSync(new URL("../drizzle/0138_centi_unidades.sql", import.meta.url), "utf8"));
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const lote = () => Number(raw.prepare("INSERT INTO centi_lotes (api_chave, ano) VALUES ('empenhos', 2026) RETURNING id").get()?.id);
  const n = (q: string) => (raw.prepare(q).get() as { n: number }).n;
  return { raw, db, lote, n };
}

test("migração 0138: liga pela SIGLA quando UM órgão casa; o resto fica sem vínculo e os empenhos dele SAEM", () => {
  const b = banco();
  const l = b.raw.prepare("SELECT orgao_gestor, orgao_id FROM centi_unidades ORDER BY orgao_gestor").all().map((x) => ({ ...x }));
  // "FMS" casa com DOIS órgãos (2 e 3) — não adivinha.
  assert.deepEqual(l, [
    { orgao_gestor: "FMS", orgao_id: null },
    { orgao_gestor: "P.M.R.V", orgao_id: 1 },
    { orgao_gestor: "XYZ", orgao_id: null },
  ]);
  assert.deepEqual(
    b.raw.prepare("SELECT orgao_gestor, orgao_id FROM empenhos").all().map((x) => ({ ...x })),
    [{ orgao_gestor: "P.M.R.V", orgao_id: 1 }],
  );
});

test("unidades da Centi (D1 real): registrar, promover SÓ o vinculado (o resto conta como fora), vincular e desvincular", async () => {
  const b = banco();
  const l1 = b.lote();
  const regs = [
    { Numero: "5", OrgaoGestor: "P.M.R.V", ValorEmpenhado: 10 },
    { Numero: "6", OrgaoGestor: "FMS", UnidadeOrcamentaria: "02.01 - FUNDO", ValorEmpenhado: 20 },
    { Numero: "7", OrgaoGestor: "FMS", UnidadeOrcamentaria: "02.01 - FUNDO", ValorEmpenhado: 30 },
  ];
  const p = lerPaginaEmpenhos(JSON.stringify(regs), 2026);
  await b.db.batch([...comandosGuardarPagina(b.db, l1, 1, p.linhas), comandoRegistrarUnidades(b.db, l1, 2026, paresDasLinhas(p.linhas))] as never);
  // De novo na mesma leitura: soma os registros; em outra leitura, recomeça.
  await b.db.batch([comandoRegistrarUnidades(b.db, l1, 2026, [["FMS", "02.01 - FUNDO", 1]])]);
  const nova = (await consultaUnidadesCenti(b.db)).find((x) => x.unidade === "02.01 - FUNDO");
  assert.ok(nova);
  assert.equal(nova.registros, 3);
  assert.equal(nova.orgaoId, null, "a unidade nova entra sem vínculo");
  assert.deepEqual(await contagemUnidadesDoLote(b.db, l1), { total: 2, semVinculo: 1 });

  const c = await contagemDaPromocao(b.db, l1, 2026, 1);
  // O "1" do P.M.R.V gravado antes não veio: é marcado removido; 6 e 7 ficam fora (sem vínculo).
  assert.deepEqual(c, { inseridos: 1, atualizados: 0, removidos: 1, fora: 2 });
  await b.db.batch(comandosPromover(b.db, l1, 2026, 1, c) as never);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE removido_em IS NULL"), 1);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'FMS'"), 0, "nada de unidade sem vínculo no banco");
  assert.equal(b.n(`SELECT fora n FROM centi_lotes WHERE id = ${l1}`), 2);

  // Vincular a unidade nova à unidade 20 do FMS: a próxima importação a grava, com órgão e unidade.
  await b.db.batch(comandosVincular(b.db, [[nova.id, 2, 20]], "ADM") as never);
  const l2 = b.lote();
  await b.db.batch(comandosGuardarPagina(b.db, l2, 1, p.linhas) as never);
  await b.db.batch(comandosPromover(b.db, l2, 2026, 1, await contagemDaPromocao(b.db, l2, 2026, 1)) as never);
  assert.deepEqual(
    b.raw.prepare("SELECT numero, orgao_id, reparticao_id FROM empenhos WHERE orgao_gestor = 'FMS' ORDER BY numero").all().map((x) => ({ ...x })),
    [
      { numero: "6", orgao_id: 2, reparticao_id: 20 },
      { numero: "7", orgao_id: 2, reparticao_id: 20 },
    ],
  );
  assert.equal((await consultaUnidadesCenti(b.db)).find((x) => x.id === nova.id)?.gravados, 2);

  // Trocar o vínculo leva os gravados na hora; tirar APAGA.
  await b.db.batch(comandosVincular(b.db, [[nova.id, 2, null]], "ADM") as never);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'FMS' AND orgao_id = 2 AND reparticao_id IS NULL"), 2);
  await b.db.batch(comandosVincular(b.db, [[nova.id, null, null]], "ADM") as never);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'FMS'"), 0);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'P.M.R.V'"), 2, "as outras unidades não mudam");
});

test("unidades da Centi (D1 real): os GATILHOS acompanham o cadastro — unidade que muda de órgão, unidade e órgão excluídos", async () => {
  const b = banco();
  const id = Number(b.raw.prepare("INSERT INTO centi_unidades (orgao_gestor, unidade, orgao_id, reparticao_id) VALUES ('FMS', 'U', 2, 20) RETURNING id").get()?.id);
  b.raw.exec("INSERT INTO empenhos (chave, ano, numero, orgao_gestor, unidade_orcamentaria, orgao_id, reparticao_id) VALUES ('2026|FMS|9', 2026, '9', 'FMS', 'U', 2, 20)");
  b.raw.exec("UPDATE reparticoes SET orgao_id = 3 WHERE id = 20");
  assert.equal(b.n(`SELECT orgao_id n FROM centi_unidades WHERE id = ${id}`), 3);
  assert.equal(b.n("SELECT orgao_id n FROM empenhos WHERE numero = '9'"), 3);
  b.raw.exec("DELETE FROM reparticoes WHERE id = 20");
  assert.equal(b.n(`SELECT COUNT(*) n FROM centi_unidades WHERE id = ${id} AND orgao_id IS NULL AND reparticao_id IS NULL`), 1);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE numero = '9'"), 0);
  b.raw.exec("DELETE FROM orgaos WHERE id = 1");
  assert.equal(b.n("SELECT COUNT(*) n FROM centi_unidades WHERE orgao_id = 1"), 0);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'P.M.R.V'"), 0);
});
