import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chaveAssunto,
  coerceMesaResponsavel,
  FILTRO_MESA_TODOS,
  filtroInicialMesa,
  filtroMesaAtivo,
  opcoesAssuntoMesa,
  passaFiltroMesa,
} from "../src/lib/mesa-filtros.ts";

describe("filtros de hierarquia da Mesa (responsável + assunto)", () => {
  const p = (responsavelId: number | null, assunto: string | null) => ({ responsavelId, assunto });
  it("todos ⇒ passa tudo; nenhum filtro ativo", () => {
    assert.equal(passaFiltroMesa(p(null, null), FILTRO_MESA_TODOS), true);
    assert.equal(filtroMesaAtivo(FILTRO_MESA_TODOS), false);
  });
  it("responsável: uma pessoa, ou 'sem responsável'", () => {
    assert.equal(passaFiltroMesa(p(7, "X"), { responsavel: 7, assunto: null }), true);
    assert.equal(passaFiltroMesa(p(8, "X"), { responsavel: 7, assunto: null }), false);
    assert.equal(passaFiltroMesa(p(null, "X"), { responsavel: 7, assunto: null }), false);
    assert.equal(passaFiltroMesa(p(null, "X"), { responsavel: "sem", assunto: null }), true);
    assert.equal(passaFiltroMesa(p(3, "X"), { responsavel: "sem", assunto: null }), false);
  });
  it("assunto: igual ignorando espaços; '' = sem assunto; combina com o responsável", () => {
    assert.equal(passaFiltroMesa(p(1, "  INCLUSÃO   PCA "), { responsavel: "todos", assunto: "INCLUSÃO PCA" }), true);
    assert.equal(passaFiltroMesa(p(1, "EXCLUSÃO"), { responsavel: "todos", assunto: "INCLUSÃO PCA" }), false);
    assert.equal(passaFiltroMesa(p(1, null), { responsavel: "todos", assunto: "" }), true);
    assert.equal(passaFiltroMesa(p(2, "INCLUSÃO PCA"), { responsavel: 1, assunto: "INCLUSÃO PCA" }), false);
    assert.equal(filtroMesaAtivo({ responsavel: "todos", assunto: "" }), true);
  });
  it("opções de assunto: distintas, ordem natural, 'sem assunto' por último", () => {
    assert.deepEqual(opcoesAssuntoMesa([p(1, "b"), p(1, " A "), p(1, null), p(1, "A"), p(1, "c 10"), p(1, "c 9")]), ["A", "b", "c 9", "c 10", ""]);
    assert.equal(chaveAssunto(null), "");
  });
});

// Perfil → Mesa: o filtro com que a Mesa ABRE (o padrão é "só os meus").
describe("responsável inicial da Mesa (preferência do Perfil)", () => {
  it("'eu' (o padrão) abre filtrada pelo próprio usuário; 'todos' = geral; 'sem' = sem responsável", () => {
    assert.deepEqual(filtroInicialMesa("eu", 42), { responsavel: 42, assunto: null });
    assert.deepEqual(filtroInicialMesa("todos", 42), FILTRO_MESA_TODOS);
    assert.deepEqual(filtroInicialMesa("sem", 42), { responsavel: "sem", assunto: null });
  });
  it("sem usuário, 'eu' vira geral (nunca um filtro vazio)", () => {
    assert.deepEqual(filtroInicialMesa("eu", null), FILTRO_MESA_TODOS);
  });
  it("preferência gravada: ausente ou desconhecida = 'eu'", () => {
    assert.equal(coerceMesaResponsavel(null), "eu");
    assert.equal(coerceMesaResponsavel(undefined), "eu");
    assert.equal(coerceMesaResponsavel("qualquer"), "eu");
    assert.equal(coerceMesaResponsavel("todos"), "todos");
    assert.equal(coerceMesaResponsavel("sem"), "sem");
  });
});
