import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  casarOrgao,
  casarPorInteressado,
  preverUnidade,
  preverUnidadeDoDfd,
} from "../src/lib/reparticao-match.ts";

// A UNIDADE do DFD é prevista SÓ pela ASSINATURA (assinante = responsável da unidade); o
// "Setor Requisitante" NÃO é mais usado (ponto 1). O ÓRGÃO vem do campo "Órgão/Entidade".

describe("casarPorInteressado (ponto 2 — protocolo em nome do ÓRGÃO ou da UNIDADE)", () => {
  const unidades = [
    { id: 1, codigo: "FMS", nome: "FUNDO MUNICIPAL DE SAÚDE", numeroInteressado: "1008171" },
    { id: 2, codigo: "SME", nome: "SECRETARIA MUNICIPAL DE EDUCAÇÃO" },
  ];
  const orgaos = [{ id: 10, sigla: "PMRV", nome: "Prefeitura Municipal de Rio Verde", numeroInteressado: "42" }];

  it("número casa a UNIDADE", () => {
    assert.deepEqual(casarPorInteressado("1008171 - FUNDO MUNICIPAL DE SAUDE", orgaos, unidades), { tipo: "unidade", id: 1 });
  });
  it("número casa o ÓRGÃO", () => {
    assert.deepEqual(casarPorInteressado("42 - PREFEITURA", orgaos, unidades), { tipo: "orgao", id: 10 });
  });
  it("número não cadastrado ⇒ fallback pelo NOME (unidade)", () => {
    assert.deepEqual(casarPorInteressado("99 - SECRETARIA MUNICIPAL DE EDUCACAO", orgaos, unidades), { tipo: "unidade", id: 2 });
  });
  it("OCULTO nunca casa (ponto 8)", () => {
    const ocultas = unidades.map((u) => (u.id === 1 ? { ...u, oculto: true } : u));
    assert.equal(casarPorInteressado("1008171 - FUNDO", orgaos, ocultas), null);
  });
  it("sem interessado → null", () => {
    assert.equal(casarPorInteressado(null, orgaos, unidades), null);
  });
});

describe("preverUnidade (ponto 1 — SÓ pela assinatura)", () => {
  const assinaturas = [
    { nome: "Ana Gestora", eCpf: "", usuario: "", local: "", data: "2026-01-01", ip: "", codigo: "", url: "", fonte: "sistema" as const },
  ];
  const unidades = [
    {
      id: 1,
      codigo: "SME",
      nome: "SECRETARIA MUNICIPAL DE EDUCAÇÃO",
      responsaveis: { padroes: [{ nome: "ANA GESTORA", matricula: "", funcao: "", nomeacao: { tipo: null, numero: "", link: "" } }], temporarios: [] },
    },
    { id: 2, codigo: "SMS", nome: "SECRETARIA MUNICIPAL DE SAÚDE", responsaveis: { padroes: [], temporarios: [] } },
  ];

  it("prevê pela ASSINATURA quando o órgão é POR UNIDADE (o assinante identifica a unidade)", () => {
    assert.equal(preverUnidade({ assinaturas }, unidades, { assinaturaPorUnidade: true }), 1);
  });
  it("assinatura ÚNICA (assinaturaPorUnidade=false) ⇒ null (o assinante não distingue a unidade)", () => {
    assert.equal(preverUnidade({ assinaturas }, unidades, { assinaturaPorUnidade: false }), null);
  });
  it("sem assinante que case ⇒ null (o Setor Requisitante NÃO é mais usado)", () => {
    assert.equal(preverUnidade({ assinaturas: [] }, unidades, { assinaturaPorUnidade: true }), null);
  });
});

describe("preverUnidadeDoDfd (ponto 1/4 — identifica órgão, ESCOPA, prevê pela assinatura)", () => {
  const resp = (nome: string) => ({
    padroes: [{ nome, matricula: "", funcao: "", nomeacao: { tipo: null, numero: "", link: "" } }],
    temporarios: [],
  });
  const assDe = (nome: string) => [
    { nome, eCpf: "", usuario: "", local: "", data: "2026-01-01", ip: "", codigo: "", url: "", fonte: "sistema" as const },
  ];
  const orgaos = [
    { id: 1, sigla: "PMRV", nome: "Prefeitura", orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE", assinaturaUnica: false },
    { id: 2, sigla: "AMAE", nome: "Água", orgaoEntidade: "AGENCIA MUNICIPAL DE AGUA", assinaturaUnica: false },
  ];
  const unidades = [
    { id: 10, codigo: "SME", nome: "EDUCAÇÃO", orgaoId: 1, responsaveis: resp("MARIA EDU") },
    { id: 20, codigo: "DAE", nome: "ÁGUA", orgaoId: 2, responsaveis: resp("JOAO AGUA") },
  ];

  it("escopa ao órgão identificado e prevê pela ASSINATURA", () => {
    const r = preverUnidadeDoDfd({ orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE", assinaturas: assDe("MARIA EDU") }, orgaos, unidades);
    assert.equal(r, 10);
  });
  it("assinante de unidade de OUTRO órgão não casa (respeita o escopo do órgão)", () => {
    // JOAO AGUA é da unidade 20 (órgão 2); com o órgão PMRV o escopo é só a unidade 10 → não casa.
    const r = preverUnidadeDoDfd({ orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE", assinaturas: assDe("JOAO AGUA") }, orgaos, unidades);
    assert.equal(r, null);
  });

  it("ÓRGÃO-QUE-É-UNIDADE (orgaoProprio): resolve a unidade própria mesmo sem assinatura que case", () => {
    const orgaosDual = [{ id: 3, sigla: "FME", nome: "Fundo Municipal de Educação", orgaoEntidade: "FUNDO MUNICIPAL DE EDUCACAO", assinaturaUnica: true }];
    const unidadesDual = [
      { id: 30, codigo: "FME", nome: "Fundo Municipal de Educação", orgaoId: 3, orgaoProprio: true, responsaveis: { padroes: [], temporarios: [] } },
    ];
    // Sem assinante que case, mas o órgão dual resolve para a unidade própria (senão o DFD travaria).
    const r = preverUnidadeDoDfd({ orgaoEntidade: "FUNDO MUNICIPAL DE EDUCACAO", assinaturas: [] }, orgaosDual, unidadesDual);
    assert.equal(r, 30);
  });

  it("órgão comum (SEM orgaoProprio) + assinante que não casa → null (não força)", () => {
    const r = preverUnidadeDoDfd({ orgaoEntidade: "AGENCIA MUNICIPAL DE AGUA", assinaturas: assDe("DESCONHECIDO") }, orgaos, unidades);
    assert.equal(r, null);
  });
});

describe("casarOrgao (Órgão/Entidade do DFD → órgão)", () => {
  const orgaos = [
    { id: 1, sigla: "PMRV", nome: "Prefeitura Municipal de Rio Verde", orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE" },
    { id: 2, sigla: "AMAE", nome: "Agência Municipal de Água e Esgoto" },
  ];

  it("casa pelo PADRÃO Órgão/Entidade configurado", () => {
    assert.equal(casarOrgao("PREFEITURA MUNICIPAL DE RIO VERDE", orgaos), 1);
  });

  it("fallback pelo NOME do órgão", () => {
    assert.equal(casarOrgao("AGÊNCIA MUNICIPAL DE ÁGUA E ESGOTO", orgaos), 2);
  });

  it("fallback pela SIGLA", () => {
    assert.equal(casarOrgao("AMAE", orgaos), 2);
  });

  it("desconhecido → null", () => {
    assert.equal(casarOrgao("TRIBUNAL DE CONTAS", orgaos), null);
  });
});
