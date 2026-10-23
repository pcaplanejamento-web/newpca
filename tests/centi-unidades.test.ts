import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { opcoesOrgaoGestor, opcoesUnidadeOrcamentaria, paresDasLinhas, rotuloUnidadeCenti, type UnidadeCenti } from "../src/lib/centi-unidades-core.ts";
import { comandoRegistrarUnidades, consultaUnidadesCenti, contagemUnidadesDoLote } from "../src/lib/centi-unidades-sql.ts";
import { lerPaginaEmpenhos } from "../src/lib/empenhos-core.ts";
import { comandosGuardarPagina, comandosPromover, contagemDaPromocao } from "../src/lib/empenhos-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const u = (id: number, orgaoGestor: string, unidade = "", reparticaoId: number | null = null): UnidadeCenti => ({
  id,
  orgaoGestor,
  unidade,
  orgaoId: null,
  reparticaoId,
  registros: 0,
  ultimoAno: null,
  vistoEm: "",
  vinculadoEm: null,
  vinculadoPor: null,
  gravados: 0,
});

test("unidades da Centi: os pares da página e as opções dos dropdowns do cadastro", () => {
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
  assert.equal(rotuloUnidadeCenti(u(1, "FMS", "02.01 - FUNDO")), "FMS · 02.01 - FUNDO");
  assert.equal(rotuloUnidadeCenti(u(1, "FMS")), "FMS");
  const lista = [u(1, "FMS", "02.01"), u(2, "FMS", "02.02", 20), u(3, "PMRV", "01.01"), u(4, "PMRV", "01.02", 10)];
  // A unidade 10 (já com a 4): as livres + a dela; com o órgão gestor do órgão, só as dele.
  assert.deepEqual(
    opcoesUnidadeOrcamentaria(lista, 4, null, 10).map((o) => o.valor),
    ["", "1", "3", "4"],
  );
  assert.deepEqual(
    opcoesUnidadeOrcamentaria(lista, 4, "PMRV", 10).map((o) => o.valor),
    ["", "3", "4"],
  );
  // A escolhida que é de outro órgão gestor continua à vista (não some ao filtrar).
  assert.deepEqual(
    opcoesUnidadeOrcamentaria(lista, 1, "PMRV", 10).map((o) => o.valor),
    ["", "1", "3", "4"],
  );
  // O órgão: os órgãos gestores que nenhum OUTRO órgão escolheu (o atual sempre entra).
  assert.deepEqual(
    opcoesOrgaoGestor(lista, ["FMS", null], null).map((o) => o.valor),
    ["", "PMRV"],
  );
  assert.deepEqual(
    opcoesOrgaoGestor(lista, ["FMS", "PMRV"], "FMS").map((o) => o.valor),
    ["", "FMS"],
  );
});

function banco() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  for (const m of ["0129_centi_apis", "0130_centi_apis_escopo", "0131_empenhos", "0132_centi_lote_passos", "0134_empenhos_conferencia"]) raw.exec(readFileSync(new URL(`../drizzle/${m}.sql`, import.meta.url), "utf8"));
  raw.exec("CREATE TABLE orgaos (id integer PRIMARY KEY, sigla text NOT NULL, oculto integer NOT NULL DEFAULT 0); CREATE TABLE reparticoes (id integer PRIMARY KEY, orgao_id integer)");
  raw.exec("INSERT INTO orgaos (id, sigla) VALUES (1, 'PMRV'), (2, 'FMS'), (3, 'FMS'); INSERT INTO reparticoes (id, orgao_id) VALUES (10, 1), (20, 2)");
  // Empenhos gravados ANTES da 0138 (a 0138 os liga pela sigla e apaga os sem órgão; a 0139 passa o vínculo ao cadastro).
  raw.exec(`INSERT INTO empenhos (chave, ano, numero, orgao_gestor) VALUES ('2026|PMRV|1', 2026, '1', 'P.M.R.V'), ('2026|FMS|1', 2026, '1', 'FMS'), ('2026|XYZ|1', 2026, '1', 'XYZ')`);
  raw.exec(readFileSync(new URL("../drizzle/0138_centi_unidades.sql", import.meta.url), "utf8"));
  raw.exec(readFileSync(new URL("../drizzle/0139_centi_vinculo_cadastro.sql", import.meta.url), "utf8"));
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const lote = () => Number(raw.prepare("INSERT INTO centi_lotes (api_chave, ano) VALUES ('empenhos', 2026) RETURNING id").get()?.id);
  const n = (q: string) => (raw.prepare(q).get() as { n: number }).n;
  return { raw, db, lote, n };
}

test("migrações 0138 + 0139: o vínculo pela sigla vai ao CADASTRO (o órgão guarda o órgão gestor); sem órgão = fora", () => {
  const b = banco();
  assert.deepEqual(
    b.raw.prepare("SELECT id, centi_orgao_gestor FROM orgaos ORDER BY id").all().map((x) => ({ ...x })),
    [
      { id: 1, centi_orgao_gestor: "P.M.R.V" },
      { id: 2, centi_orgao_gestor: null },
      { id: 3, centi_orgao_gestor: null },
    ],
    "“FMS” casa com DOIS órgãos — não adivinha",
  );
  assert.deepEqual(
    b.raw.prepare("SELECT orgao_gestor, orgao_id FROM empenhos").all().map((x) => ({ ...x })),
    [{ orgao_gestor: "P.M.R.V", orgao_id: 1 }],
  );
});

test("unidades da Centi (D1 real): registrar, promover SÓ o vinculado e o vínculo escolhido NO CADASTRO (gatilhos)", async () => {
  const b = banco();
  const l1 = b.lote();
  const regs = [
    { Numero: "5", OrgaoGestor: "P.M.R.V", ValorEmpenhado: 10 },
    { Numero: "6", OrgaoGestor: "FMS", UnidadeOrcamentaria: "02.01 - FUNDO", ValorEmpenhado: 20 },
    { Numero: "7", OrgaoGestor: "FMS", UnidadeOrcamentaria: "02.01 - FUNDO", ValorEmpenhado: 30 },
  ];
  const p = lerPaginaEmpenhos(JSON.stringify(regs), 2026);
  await b.db.batch([...comandosGuardarPagina(b.db, l1, 1, p.linhas), comandoRegistrarUnidades(b.db, l1, 2026, paresDasLinhas(p.linhas))] as never);
  // De novo na mesma leitura: soma os registros.
  await b.db.batch([comandoRegistrarUnidades(b.db, l1, 2026, [["FMS", "02.01 - FUNDO", 1]])]);
  const nova = (await consultaUnidadesCenti(b.db)).find((x) => x.unidade === "02.01 - FUNDO");
  assert.ok(nova);
  assert.equal(nova.registros, 3);
  assert.equal(nova.orgaoId, null, "sem órgão gestor escolhido, entra sem vínculo");
  assert.deepEqual(await contagemUnidadesDoLote(b.db, l1), { total: 2, semVinculo: 1 });

  const c = await contagemDaPromocao(b.db, l1, 2026, 1);
  assert.deepEqual(c, { inseridos: 1, atualizados: 0, removidos: 1, fora: 2 });
  await b.db.batch(comandosPromover(b.db, l1, 2026, 1, c) as never);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'FMS'"), 0, "nada de unidade sem vínculo no banco");

  // A UNIDADE 20 escolhe a unidade orçamentária: a próxima importação a grava, com órgão e unidade.
  b.raw.exec(`UPDATE reparticoes SET centi_unidade_id = ${nova.id} WHERE id = 20`);
  assert.deepEqual({ ...(b.raw.prepare(`SELECT orgao_id, reparticao_id FROM centi_unidades WHERE id = ${nova.id}`).get() as object) }, { orgao_id: 2, reparticao_id: 20 });
  const l2 = b.lote();
  await b.db.batch(comandosGuardarPagina(b.db, l2, 1, p.linhas) as never);
  await b.db.batch(comandosPromover(b.db, l2, 2026, 1, await contagemDaPromocao(b.db, l2, 2026, 1)) as never);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'FMS' AND orgao_id = 2 AND reparticao_id = 20"), 2);

  // A unidade muda de órgão: o vínculo e os empenhos acompanham.
  b.raw.exec("UPDATE reparticoes SET orgao_id = 3 WHERE id = 20");
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'FMS' AND orgao_id = 3"), 2);
  // O ÓRGÃO 3 escolhe o órgão gestor "FMS"; a unidade tira a dela: os empenhos ficam com o órgão (sem unidade).
  b.raw.exec("UPDATE orgaos SET centi_orgao_gestor = 'FMS' WHERE id = 3");
  b.raw.exec("UPDATE reparticoes SET centi_unidade_id = NULL WHERE id = 20");
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'FMS' AND orgao_id = 3 AND reparticao_id IS NULL"), 2);
  // Unidade nova do mesmo órgão gestor já nasce no órgão.
  await b.db.batch([comandoRegistrarUnidades(b.db, l2, 2026, [["FMS", "09.09", 1]])]);
  assert.equal(b.n("SELECT orgao_id n FROM centi_unidades WHERE unidade = '09.09'"), 3);
  // O órgão tira o órgão gestor: tudo dele SAI do banco; as outras unidades não mudam.
  b.raw.exec("UPDATE orgaos SET centi_orgao_gestor = NULL WHERE id = 3");
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'FMS'"), 0);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE orgao_gestor = 'P.M.R.V'"), 2);
  // Excluir o órgão do cadastro: o vínculo some e os empenhos dele saem.
  b.raw.exec("DELETE FROM reparticoes WHERE orgao_id = 1; DELETE FROM orgaos WHERE id = 1");
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos"), 0);
  assert.equal(b.n("SELECT COUNT(*) n FROM centi_unidades WHERE orgao_id IS NOT NULL"), 0);
  // Cada órgão gestor e cada unidade orçamentária vale para UM órgão / UMA unidade (índice único).
  b.raw.exec("UPDATE orgaos SET centi_orgao_gestor = 'FMS' WHERE id = 2");
  assert.throws(() => b.raw.exec("UPDATE orgaos SET centi_orgao_gestor = 'FMS' WHERE id = 3"));
});
