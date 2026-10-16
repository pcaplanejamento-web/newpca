import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ESCOPO_NENHUMA,
  ESCOPO_TODAS,
  escopoDeAcesso,
  FILTRO_NENHUMA,
  FILTRO_TODAS,
  filtroDeLista,
  idDoFiltro,
  unidadeNoEscopo,
} from "../src/lib/escopo-unidades-core.ts";

// Escopo de unidades em 3 estados: antes "sem unidade" virava `null` = sem filtro — quem não tinha grupo (todo
// recém-aprovado) via a Mesa inteira, e o grupo com a "Geral" via tudo na lista mas era recusado no detalhe.

const GERAL = { id: 1, codigo: "GERAL" };
const EDU = { id: 5, codigo: "SEMED" };
const SAUDE = { id: 6, codigo: "SMS" };

describe("escopo de ACESSO (detalhe e escrita)", () => {
  it("ADM = todas, mesmo sem grupo (regra firme)", () => {
    assert.deepEqual(escopoDeAcesso(true, []), ESCOPO_TODAS);
  });

  it("grupo com a 'Geral' = todas (também no detalhe e na escrita)", () => {
    assert.deepEqual(escopoDeAcesso(false, [EDU, { id: 1, codigo: " geral " }]), ESCOPO_TODAS);
    assert.equal(unidadeNoEscopo(escopoDeAcesso(false, [GERAL]), 999), true);
  });

  it("sem grupo ou grupo sem unidade = nenhuma (nem o registro sem unidade)", () => {
    const e = escopoDeAcesso(false, []);
    assert.deepEqual(e, ESCOPO_NENHUMA);
    assert.equal(unidadeNoEscopo(e, 5), false);
    assert.equal(unidadeNoEscopo(e, null), false);
  });

  it("unidades do grupo: só elas (+ o registro sem unidade, como sempre foi)", () => {
    const e = escopoDeAcesso(false, [EDU, SAUDE, EDU]);
    assert.deepEqual(e, { tipo: "unidades", ids: [5, 6] });
    assert.equal(unidadeNoEscopo(e, 5), true);
    assert.equal(unidadeNoEscopo(e, 7), false);
    assert.equal(unidadeNoEscopo(e, null), true);
    assert.equal(unidadeNoEscopo(e, undefined), true);
  });
});

describe("filtro das LISTAS (unidade ativa do cabeçalho)", () => {
  it("unidade específica ativa = só ela", () => {
    const f = filtroDeLista(false, EDU);
    assert.deepEqual(f, { tipo: "unidade", id: 5, codigo: "SEMED" });
    assert.equal(idDoFiltro(f), 5);
  });

  it("'Geral' ativa = todas", () => {
    assert.deepEqual(filtroDeLista(false, GERAL), FILTRO_TODAS);
    assert.equal(idDoFiltro(FILTRO_TODAS), null);
  });

  it("sem unidade ativa: nenhuma (a lista é vazia); o ADM vê todas", () => {
    assert.deepEqual(filtroDeLista(false, null), FILTRO_NENHUMA);
    assert.equal(idDoFiltro(FILTRO_NENHUMA), false);
    assert.deepEqual(filtroDeLista(true, null), FILTRO_TODAS);
  });
});

describe("modo de unidades do grupo (v1.115.0)", async () => {
  const { unidadesDoMembro, lerModoUnidades, escopoDeAcesso: esc } = await import("../src/lib/escopo-unidades-core.ts");
  const a = { id: 1, codigo: "SMS" };
  const b = { id: 2, codigo: "SME" };
  const g = { id: 9, codigo: "GERAL" };
  it("lista = as do grupo; cadastro = só a unidade da pessoa", () => {
    assert.deepEqual(unidadesDoMembro("lista", [a, b], b), [a, b]);
    assert.deepEqual(unidadesDoMembro("cadastro", [a, b], b), [b]);
    assert.deepEqual(esc(false, unidadesDoMembro("cadastro", [a], b)), { tipo: "unidades", ids: [2] });
  });
  it("cadastro sem unidade = nenhuma; a Geral nunca vale por cadastro", () => {
    assert.deepEqual(esc(false, unidadesDoMembro("cadastro", [g], null)), { tipo: "nenhuma" });
    assert.deepEqual(unidadesDoMembro("cadastro", [], g), []);
  });
  it("modo desconhecido = lista", () => {
    assert.equal(lerModoUnidades("x"), "lista");
    assert.equal(lerModoUnidades("cadastro"), "cadastro");
  });
});
