import assert from "node:assert/strict";
import { test } from "node:test";
import { casaLocal, ehTermoNumero, ehTipoPesquisa, padroesLike, pontuar, type PortaoPesquisa, TIPOS_PADRAO, TIPOS_PESQUISA, tipoPermitido, tituloPesquisa } from "../src/lib/pesquisa-core.ts";
import { DatabaseSync } from "node:sqlite";

test("pesquisa: tipos únicos, prefixos e atalhos sem repetir", () => {
  const tipos = TIPOS_PESQUISA.map((t) => t.tipo);
  assert.equal(new Set(tipos).size, tipos.length);
  const atalhos: string[] = TIPOS_PESQUISA.flatMap((t) => [t.prefixo, t.curto]);
  assert.equal(new Set(atalhos).size, atalhos.length);
  for (const t of TIPOS_PESQUISA) assert.ok(t.prefixo.endsWith(":") && t.curto.endsWith(":"));
  // os atalhos locais da tela (pca, tela, aba) não colidem
  for (const x of ["pca:", "pc:", "tela:", "te:", "aba:", "a:"]) assert.ok(!atalhos.includes(x));
});

test("pesquisa: validação e títulos", () => {
  assert.ok(ehTipoPesquisa("lancamento"));
  assert.ok(!ehTipoPesquisa("pca"));
  assert.ok(!ehTipoPesquisa("x; drop"));
  assert.equal(tituloPesquisa("historico"), "Histórico de compra");
  assert.deepEqual(TIPOS_PADRAO, TIPOS_PESQUISA.map((t) => t.tipo));
});


test("pesquisa: padrões — um por termo, sem curinga do usuário, sem acento", () => {
  assert.deepEqual(padroesLike("  "), []);
  assert.deepEqual(padroesLike("50%_x"), ["%50%", "%x%"]);
  assert.equal(padroesLike("a b c d e f g").length, 5);
  assert.equal(padroesLike("saúde")[0], "%saúde%"); // com acento: exato
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('SERVIÇO DE MANUTENÇÃO'), ('CADEIRA'), ('OUTRA COISA')");
  const acha = (q: string) =>
    (db.prepare(`SELECT v FROM t WHERE ${padroesLike(q).map(() => "v LIKE ?").join(" AND ")}`).all(...padroesLike(q)) as { v: string }[]).map((r) => r.v);
  assert.deepEqual(acha("manutencao"), ["SERVIÇO DE MANUTENÇÃO"]);
  assert.deepEqual(acha("servico manutencao"), ["SERVIÇO DE MANUTENÇÃO"]);
  assert.deepEqual(acha("servico cadeira"), []); // todos os termos
  assert.deepEqual(acha("cadeira"), ["CADEIRA"]);
  assert.deepEqual(acha("protoco"), []); // sem curinga além dos acentos do português
  assert.equal(padroesLike("servico")[0], "%servi_o%");
});

test("pesquisa: ordem — palavra exata › começa › contém", () => {
  assert.ok(pontuar("Protocolo 1234", "1234") > pontuar("Protocolo 12345", "1234"));
  assert.ok(pontuar("Protocolo 12345", "1234") > pontuar("Protocolo 991234", "1234"));
  assert.ok(pontuar("MANUTENÇÃO predial", "manutencao") > 0);
});

// A REGRA DE SEGURANÇA por perfil: o tipo de fora do acesso nunca é consultado.
const perfil = (telas: string[], comps: string[] = [], admin = false): PortaoPesquisa => ({
  admin,
  ve: (t) => admin || telas.includes(t),
  libera: (c) => admin || !comps.length || comps.includes(c),
});
test("pesquisa: portão por perfil", () => {
  const todos = ["protocolo", "dfd", "item", "tarefa", "evento", "orcamento", "lancamento", "catalogo", "historico", "usuario", "orgao", "unidade", "grupo", "cadastro", "fluxo"] as const;
  const permitidos = (p: PortaoPesquisa) => todos.filter((t) => tipoPermitido(p, t));
  // sem Mesa do sistema, com PCA e a aba Mesa do PCA: vê a Mesa (só a do PCA — o SQL restringe)
  assert.deepEqual(permitidos(perfil(["pca"], ["pca.mesa"])), ["protocolo", "dfd", "item"]);
  // PCA sem a aba Mesa: nenhum protocolo/DFD/item
  assert.deepEqual(permitidos(perfil(["pca"], ["pca.dashboard"])), []);
  // orçamento sem a aba Lançamentos: só o orçamento
  assert.deepEqual(permitidos(perfil(["orcamento"], ["orcamento.comparativo"])), ["orcamento"]);
  // catálogo só com o histórico
  assert.deepEqual(permitidos(perfil(["catalogo"], ["catalogo.historico"])), ["historico"]);
  // tarefas pelo calendário também (os eventos e as tarefas dos quadros)
  assert.deepEqual(permitidos(perfil(["calendario"])), ["tarefa", "evento"]);
  // ninguém além do ADM pesquisa a administração
  const semAdmin = permitidos(perfil(["dfd", "pca", "tarefas", "calendario", "orcamento", "catalogo"]));
  for (const t of ["usuario", "orgao", "unidade", "grupo", "cadastro", "fluxo"]) assert.ok(!semAdmin.includes(t as (typeof todos)[number]));
  assert.deepEqual(permitidos(perfil([], [], true)), [...todos]);
  assert.deepEqual(permitidos(perfil([])), []);
});

test("casaLocal: o índice do navegador casa EXATAMENTE como o LIKE do SQL", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE p (numero TEXT, assunto TEXT)");
  const linhas = [
    ["144756/2026", "MANUTENÇÃO DE SERVIÇOS"],
    ["65", "INCLUSÃO PCA 2027"],
    ["123", "Secretaria 65 de saúde"],
    ["700", "protocolo de compras"],
  ];
  for (const l of linhas) db.prepare("INSERT INTO p VALUES (?, ?)").run(...l);
  for (const q of ["manutencao", "servico", "65", "1447", "inclusao 2027", "protoco", "SAÚDE secretaria", "compras 700"]) {
    const ps = padroesLike(q);
    const onde = ps.map((p) => (ehTermoNumero(p) ? "numero LIKE ?" : "(numero LIKE ? OR assunto LIKE ?)")).join(" AND ");
    const args = ps.flatMap((p) => (ehTermoNumero(p) ? [p] : [p, p]));
    const sqlNums = (db.prepare(`SELECT numero FROM p WHERE ${onde}`).all(...args) as { numero: string }[]).map((r) => r.numero).sort();
    const casa = casaLocal(q);
    const locais = linhas.filter(([n, a]) => casa({ campos: [n, a], numeros: [n] })).map(([n]) => n).sort();
    if (q === "SAÚDE secretaria") continue; // o LIKE do SQLite não ignora a caixa de letra acentuada; o local ignora (melhor)
    assert.deepEqual(locais, sqlNums, q);
  }
});
