import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { consultaConflitosEntreCards } from "../src/lib/empenho-cards-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";

/** Os gatilhos da `0155`: liquidações e pagamentos acompanham o cadastro como os empenhos. */
function banco() {
  const db = bancoMigrado();
  db.exec("INSERT INTO orgaos (id, nome, sigla, entidade_centi) VALUES (1, 'Prefeitura', 'PMRV', '2'), (2, 'Saúde', 'FMS', '3'), (3, 'Cultura', 'FCRV', NULL)");
  db.exec("INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (5, 'SEFAZ', 'Fazenda', 1), (6, 'SAUDE', 'Saúde', 2)");
  db.exec("INSERT INTO empenho_cards (id, nome) VALUES (1, 'Empenhos')");
  db.exec("INSERT INTO empenho_cards (id, nome, tipo) VALUES (2, 'Liquidações', 'liquidacoes'), (3, 'Pagamentos', 'pagamentos')");
  db.exec("INSERT INTO empenhos (card_id, chave, ano, numero, orgao_gestor, orgao_id, reparticao_id) VALUES (1, 'a', 2025, '100', 'G', 1, 5)");
  // Com empenho (unidade 5) e sem empenho (só pelo ID na Centi).
  db.exec("INSERT INTO liquidacoes (chave, ano, numero_empenho, id_orgao_centi, orgao_id, reparticao_id, card_id) VALUES ('l1', 2025, '100', 2, 1, 5, 2), ('l2', 2025, '999', 3, 2, NULL, 2), ('l3', 2025, '998', 2, 1, NULL, 2)");
  db.exec("INSERT INTO pagamentos (chave, ano, numero_empenho, id_orgao_centi, orgao_id, reparticao_id, card_id) VALUES ('p1', 2025, '100', 2, 1, 5, 3), ('p2', 2025, '999', 3, 2, NULL, 3)");
  return db;
}
const orgaoDe = (db: ReturnType<typeof banco>, t: string, chave: string) => (db.prepare(`SELECT orgao_id o FROM ${t} WHERE chave = ?`).get(chave) as { o: number }).o;

test("a unidade que muda de órgão leva as liquidações e os pagamentos dela", () => {
  const db = banco();
  db.exec("UPDATE reparticoes SET orgao_id = 2 WHERE id = 5");
  assert.equal(orgaoDe(db, "empenhos", "a"), 2);
  assert.equal(orgaoDe(db, "liquidacoes", "l1"), 2);
  assert.equal(orgaoDe(db, "pagamentos", "p1"), 2);
  assert.equal(orgaoDe(db, "liquidacoes", "l3"), 1, "sem a unidade, não muda");
});

test("o ID na Centi que muda leva só as liquidações e os pagamentos SEM empenho", () => {
  const db = banco();
  // O ID 3 passa da Saúde para a Cultura.
  db.exec("UPDATE orgaos SET entidade_centi = NULL WHERE id = 2");
  assert.equal(orgaoDe(db, "liquidacoes", "l2"), 2, "sem órgão com o ID: fica onde está");
  db.exec("UPDATE orgaos SET entidade_centi = '3' WHERE id = 3");
  assert.equal(orgaoDe(db, "liquidacoes", "l2"), 3);
  assert.equal(orgaoDe(db, "pagamentos", "p2"), 3);
  // O ID 2 da Prefeitura passa à Saúde: o com empenho segue o empenho; o sem empenho, o ID.
  db.exec("UPDATE orgaos SET entidade_centi = NULL WHERE id = 1");
  db.exec("UPDATE orgaos SET entidade_centi = ' 2 ' WHERE id = 2");
  assert.equal(orgaoDe(db, "liquidacoes", "l1"), 1);
  assert.equal(orgaoDe(db, "pagamentos", "p1"), 1);
  assert.equal(orgaoDe(db, "liquidacoes", "l3"), 2);
});

test("o aviso dos empenhos de mesmo número em outro card com outro destino", async () => {
  const raw = banco();
  raw.exec("INSERT INTO empenho_cards (id, nome) VALUES (4, 'Outro')");
  raw.exec("INSERT INTO empenhos (card_id, chave, ano, numero, orgao_gestor, orgao_id, reparticao_id) VALUES (4, 'b', 2025, '100', 'G', 2, 6), (4, 'c', 2025, '101', 'G', 1, 5)");
  raw.exec("INSERT INTO empenhos (card_id, chave, ano, numero, orgao_gestor, orgao_id, reparticao_id) VALUES (1, 'd', 2025, '101', 'G', 1, 5)");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  assert.deepEqual(await consultaConflitosEntreCards(db, 1), [{ cardId: 4, nome: "Outro", empenhos: 1 }], "o 101 tem o mesmo destino — não conta");
  raw.exec("UPDATE empenhos SET removido_em = 'x' WHERE chave = 'b'");
  assert.deepEqual(await consultaConflitosEntreCards(db, 1), []);
});
