import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { alternarColuna, coerceLayoutTabela, comOcultas, LAYOUT_TABELA_PADRAO, ocultasEfetivas } from "../src/lib/colunas-layout.ts";
import { chavePadrao, chavePadraoAdm, type EdicaoTabela, edicaoInicial, idPadraoAdm, lerPadroesAdm } from "../src/lib/edicoes-tabela-core.ts";
import {
  CAMPOS,
  camposDoPedido,
  chaveColuna,
  colunasNaoPermitidas,
  colunasPadraoOcultas,
  lerChaveColuna,
  valorParaPapel,
} from "../src/lib/mesa-campos-core.ts";
import { consultaCamposDfds, consultaCamposProtocolos } from "../src/lib/mesa-campos-sql.ts";
import { camposMesaSchema } from "../src/lib/mesa-campos-validation.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

test("catálogo dos campos: chaves únicas, coluna ida e volta, entidades por tabela", () => {
  for (const e of ["protocolo", "dfd"] as const) {
    const ks = CAMPOS[e].map((c) => c.chave);
    assert.equal(new Set(ks).size, ks.length, e);
    for (const k of ks) assert.deepEqual(lerChaveColuna(chaveColuna(e, k)), { entidade: e, campo: k });
  }
  assert.equal(lerChaveColuna("x:p:inexistente"), null);
  assert.equal(lerChaveColuna("estado"), null);
  assert.ok(colunasPadraoOcultas("protocolos").every((k) => k.startsWith("x:p:")));
  assert.ok(colunasPadraoOcultas("dfds").some((k) => k.startsWith("x:p:")), "a tabela de DFDs tem os do protocolo de origem");
  assert.ok(colunasPadraoOcultas("itens").some((k) => k.startsWith("x:d:")), "a de itens tem os do DFD");
  assert.deepEqual(colunasPadraoOcultas("consolidada"), [], "a Consolidada fica como está");
});

test("o papel: sem Valores o valor da capa não sai; com Mascarar os dados pessoais saem mascarados", () => {
  assert.deepEqual(colunasNaoPermitidas("protocolos", { valores: false }), ["x:p:valorCapa"]);
  assert.deepEqual(colunasNaoPermitidas("protocolos", { valores: true }), []);
  assert.deepEqual(
    camposDoPedido("protocolo", ["valorCapa", "interessado", "nada"], { valores: false }).map((c) => c.chave),
    ["interessado"],
  );
  const email = CAMPOS.dfd.find((c) => c.chave === "email");
  const just = CAMPOS.dfd.find((c) => c.chave === "secao:justificativa");
  assert.ok(email && just);
  assert.equal(valorParaPapel(email, "a@b.com", { dadosPessoais: "ver" }), "a@b.com");
  assert.equal(valorParaPapel(email, "a@b.com", { dadosPessoais: "mascarar" }), "•••");
  assert.equal(valorParaPapel(email, "", { dadosPessoais: "mascarar" }), null);
  assert.notEqual(valorParaPapel(just, "contato a@b.com", { dadosPessoais: "mascarar" }), "contato a@b.com", "texto livre passa pela máscara");
  assert.equal(camposMesaSchema.safeParse({ entidade: "dfd", ids: [1], campos: ["objeto"] }).success, true);
  assert.equal(camposMesaSchema.safeParse({ entidade: "item", ids: [1], campos: ["objeto"] }).success, false);
  assert.equal(camposMesaSchema.safeParse({ entidade: "dfd", ids: [], campos: ["objeto"] }).success, false);
});

test("layout: as ocultas no padrão seguem ocultas em visão salva antes delas; ligar uma vai às exibidas", () => {
  const padrao = ["x:d:objeto", "x:d:email"];
  const antiga = coerceLayoutTabela({ ocultas: ["estado"] });
  assert.deepEqual(antiga.exibidas, []);
  assert.deepEqual(ocultasEfetivas(antiga, padrao).sort(), ["estado", "x:d:email", "x:d:objeto"]);
  const ligada = alternarColuna(antiga, "x:d:objeto", padrao);
  assert.deepEqual(ligada.exibidas, ["x:d:objeto"]);
  assert.deepEqual(ocultasEfetivas(ligada, padrao).sort(), ["estado", "x:d:email"]);
  const todas = comOcultas(LAYOUT_TABELA_PADRAO, [], padrao);
  assert.deepEqual(ocultasEfetivas(todas, padrao), []);
  assert.deepEqual(coerceLayoutTabela(JSON.parse(JSON.stringify(ligada))), ligada, "ida e volta pelo JSON");
});

test("estado inicial: a padrão da pessoa vence a do ADM; a do ADM só vale pública", () => {
  const K = "mesa:dfds";
  const e = (id: number, publico: boolean, minha: boolean): EdicaoTabela => ({ id, chave: K, nome: `V${id}`, publico, minha, autor: "A", valor: {} });
  const lista = [e(1, false, true), e(2, true, false), e(3, false, false)];
  assert.equal(edicaoInicial(lista, { [chavePadraoAdm(K)]: { id: 2 } }, K)?.id, 2);
  assert.equal(edicaoInicial(lista, { [chavePadraoAdm(K)]: { id: 2 }, [chavePadrao(K)]: { id: 1 } }, K)?.id, 1);
  assert.equal(edicaoInicial(lista, { [chavePadraoAdm(K)]: { id: 3 } }, K), null, "privada não vira padrão para todos");
  assert.equal(edicaoInicial(lista, { [chavePadraoAdm(K)]: { id: 2 }, [chavePadrao(K)]: { id: 99 } }, K)?.id, 2, "a da pessoa sumiu: a do ADM");
  assert.equal(idPadraoAdm({ [chavePadraoAdm(K)]: { id: "2" } }, K), null);
  assert.deepEqual(lerPadroesAdm({ a: 1, b: "2", c: -1, "": 3 }), { a: 1 });
  assert.deepEqual(lerPadroesAdm(null), {});
});

test("consultas dos campos extras no driver D1 real (ids num parâmetro JSON; seções só quando pedidas)", async () => {
  const sq = bancoMigrado();
  sq.exec(`INSERT INTO usuarios (id, nome, email, senha_hash, apelido) VALUES (7, 'Ana Souza', 'ana@x', 'h', 'Ana');
    INSERT INTO orgaos (id, nome, sigla) VALUES (5, 'Prefeitura', 'PMRV');
    INSERT INTO dfd_protocolos (id, numero, interessado, documento, observacao, orgao_id, pca_enviado_por, pca_enviado_em) VALUES (1, '1/2026', 'SEC X', '123', 'obs', 5, 7, '2026-01-02 10:00:00');
    INSERT INTO dfd_protocolos (id, numero) VALUES (2, '2/2026');
    INSERT INTO dfds (id, numero, protocolo_id, objeto, email, criado_por, secoes) VALUES (10, 'D1', 1, 'OBJ', 'e@x', 7, '[{"numero":3,"titulo":"3 - JUSTIFICATIVA","texto":"Porque sim"}]');`);
  const db = drizzle(d1Sobre(sq) as never, { schema });
  const ps = await consultaCamposProtocolos(db, [1, 2, 99]);
  assert.equal(ps.length, 2);
  const p1 = ps.find((p) => p.id === 1);
  assert.equal(p1?.orgao, "Prefeitura");
  assert.equal(p1?.enviadoPor, "Ana");
  assert.equal(p1?.documento, "123");
  const semSecoes = await consultaCamposDfds(db, [10], false);
  assert.equal(semSecoes[0].secoes, null);
  const comSecoes = await consultaCamposDfds(db, [10], true);
  assert.equal(comSecoes[0].objeto, "OBJ");
  assert.equal(comSecoes[0].criadoPor, "Ana");
  assert.match(comSecoes[0].secoes ?? "", /JUSTIFICATIVA/);
  assert.equal(comSecoes[0].protocoloId, 1);
});
