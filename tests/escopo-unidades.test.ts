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

describe("escopo por tela e várias unidades de cadastro (v1.141.0)", async () => {
  const m = await import("../src/lib/escopo-unidades-core.ts");
  const a = { id: 1, codigo: "SMS" };
  const b = { id: 2, codigo: "SME" };
  const g = { id: 9, codigo: "GERAL" };
  it("várias unidades de cadastro: sem repetir e sem a Geral", () => {
    assert.deepEqual(m.unidadesDoMembro("cadastro", [], [a, b, a, g]), [a, b]);
    assert.deepEqual(m.escopoDeAcesso(false, m.unidadesDoMembro("cadastro", [], [a, b])), { tipo: "unidades", ids: [1, 2] });
    assert.deepEqual(m.unidadesDoMembro("cadastro", [], []), []);
  });
  it("lerEscopoTelas: só 'todas' com chave válida; lixo = vazio", () => {
    assert.deepEqual(m.lerEscopoTelas('{"dfd":"todas","pca":"cadastro","X!":"todas"}'), { dfd: "todas" });
    assert.deepEqual(m.lerEscopoTelas("não é json"), {});
    assert.deepEqual(m.lerEscopoTelas(null), {});
    assert.deepEqual(m.lerEscopoTelas(["dfd"]), {});
  });
  it("telaVeTodas: só no modo cadastro, com a tela marcada", () => {
    const e = { tarefas: "todas" } as const;
    assert.equal(m.telaVeTodas("cadastro", e, "tarefas"), true);
    assert.equal(m.telaVeTodas("cadastro", e, "dfd"), false);
    assert.equal(m.telaVeTodas("lista", e, "tarefas"), false);
    assert.equal(m.telaVeTodas("cadastro", e, null), false);
    assert.deepEqual(m.telasComTodas("cadastro", e), ["tarefas"]);
    assert.deepEqual(m.telasComTodas("lista", e), []);
  });
  it("compactar guarda só as telas do grupo", () => {
    assert.deepEqual(m.compactarEscopoTelas({ dfd: "todas", pca: "todas" }, ["pca", "tarefas"]), { pca: "todas" });
  });
  it("unirEscopos: a Mesa do sistema + a do PCA", () => {
    assert.deepEqual(m.unirEscopos(m.ESCOPO_NENHUMA, { tipo: "unidades", ids: [2] }), { tipo: "unidades", ids: [2] });
    assert.deepEqual(m.unirEscopos({ tipo: "unidades", ids: [1, 2] }, { tipo: "unidades", ids: [2, 3] }), { tipo: "unidades", ids: [1, 2, 3] });
    assert.equal(m.unirEscopos({ tipo: "unidades", ids: [1] }, m.ESCOPO_TODAS).tipo, "todas");
    assert.equal(m.unirEscopos(m.ESCOPO_NENHUMA, m.ESCOPO_NENHUMA).tipo, "nenhuma");
  });
  it("telaDaRota: a aba Mesa do PCA segue a tela PCA (a Mesa do sistema é outra tela)", () => {
    assert.equal(m.telaDaRota("/painel/pca/12"), "pca");
  });
  it("telaDaRota: as rotas do painel → a tela", () => {
    assert.equal(m.telaDaRota("/painel/mesa"), "dfd");
    assert.equal(m.telaDaRota("/painel/pca/12"), "pca");
    assert.equal(m.telaDaRota("/painel/tarefas/3"), "tarefas");
    assert.equal(m.telaDaRota("/painel/pcax"), null);
    assert.equal(m.telaDaRota("/painel/perfil"), null);
  });
});

import * as geral from "../src/lib/escopo-unidades-core.ts";

describe("Geral das minhas unidades (virtual)", () => {
  const a = { id: 3, codigo: "SME", nome: "Educação" };
  const b = { id: 7, codigo: "SMS", nome: "Saúde" };
  it("aparece primeiro só com 2+ unidades, sem a Geral real, para todos", () => {
    const l = geral.listaComGeral([a, b]);
    assert.equal(l[0].id, geral.ID_MINHAS_UNIDADES);
    assert.equal(l.length, 3);
    assert.equal(geral.listaComGeral([a]).length, 1);
    assert.equal(l[0].codigo, "Geral (2 unidades)");
    assert.equal(geral.listaComGeral([a, b, { id: 1, codigo: "GERAL", nome: "Geral" }]).length, 3);
  });
  it("não dá acesso a todas: filtra pela SOMA das unidades da pessoa", () => {
    const l = geral.listaComGeral([a, b]);
    const reais = l.filter((r) => r.id !== geral.ID_MINHAS_UNIDADES);
    assert.deepEqual(geral.escopoDeAcesso(false, reais), { tipo: "unidades", ids: [3, 7] });
    const f = geral.filtroDeLista(false, l[0], reais);
    assert.deepEqual(geral.idDoFiltro(f), [3, 7]);
    assert.equal(geral.passaFiltroId([3, 7], 7), true);
    assert.equal(geral.passaFiltroId([3, 7], 9), false);
    assert.equal(geral.passaFiltroId([3, 7], null), false);
    assert.equal(geral.chaveFiltroId([7, 3]), "3,7");
    assert.equal(geral.ehGeral(l[0]), true);
    assert.equal(geral.ehGeral(a), false);
  });
});
