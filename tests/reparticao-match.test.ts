import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  casarOrgao,
  casarPorInteressado,
  casarReparticao,
  casarUnidade,
  divergenciaOrgaoUnidade,
  preverUnidade,
  preverUnidadeDoDfd,
} from "../src/lib/reparticao-match.ts";

// Auto-match do Setor Requisitante do DFD com a repartição: 1) pela sigla
// (código), 2) fallback pelo nome (ignora acentos/conectores/"MUNICIPAL").

describe("reparticao-match (casarReparticao)", () => {
  const reps = [
    { id: 1, codigo: "SME", nome: "SECRETARIA MUNICIPAL DE EDUCAÇÃO" },
    { id: 2, codigo: "SIR", nome: "Secretaria de Infraestrutura Rural" },
  ];

  it("casa pela SIGLA (código = sigla do setor)", () => {
    assert.equal(casarReparticao({ siglaSetor: "SME", setorRequisitante: "SME - Educação" }, reps), 1);
  });

  it("fallback pelo NOME quando a sigla diverge (SMIR × SIR)", () => {
    const r = casarReparticao(
      { siglaSetor: "SMIR", setorRequisitante: "SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL" },
      reps,
    );
    assert.equal(r, 2); // casa "Secretaria de Infraestrutura Rural" por chaveNome
  });

  it("fallback pelo ÓRGÃO/ENTIDADE quando o setor não casa", () => {
    // setor genérico não casa; órgão = a própria secretaria.
    const r = casarReparticao(
      { siglaSetor: null, setorRequisitante: "GABINETE", orgaoEntidade: "SECRETARIA MUNICIPAL DE EDUCAÇÃO" },
      reps,
    );
    assert.equal(r, 1);
  });

  it("nenhum match → null (sigla/setor/órgão fora da lista)", () => {
    assert.equal(
      casarReparticao(
        { siglaSetor: "XYZ", setorRequisitante: "XYZ - Desconhecido", orgaoEntidade: "FUNDO MUNICIPAL DO IDOSO" },
        reps,
      ),
      null,
    );
  });

  it("sem setor → null", () => {
    assert.equal(casarReparticao({}, reps), null);
  });
});

describe("casarUnidade — padrão de Setor Requisitante configurado (escape hatch)", () => {
  const unidades = [
    { id: 1, codigo: "SMF", nome: "Secretaria Municipal de Fazenda", setorRequisitante: "SUPERINTENDÊNCIA DE COMPRAS" },
    { id: 2, codigo: "SME", nome: "SECRETARIA MUNICIPAL DE EDUCAÇÃO" },
  ];

  it("casa pelo PADRÃO quando código e nome NÃO batem", () => {
    // DFD com setor "SUC - SUPERINTENDÊNCIA DE COMPRAS": não é o código nem o nome da
    // unidade, mas foi cadastrado como padrão em SMF.
    const r = casarUnidade({ siglaSetor: "SUC", setorRequisitante: "SUC - SUPERINTENDÊNCIA DE COMPRAS" }, unidades);
    assert.equal(r, 1);
  });

  it("padrão vazio ⇒ IDÊNTICO ao comportamento atual (sigla) — invariante", () => {
    const r = casarUnidade({ siglaSetor: "SME", setorRequisitante: "SME - Educação" }, unidades);
    assert.equal(r, 2);
  });
});

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

describe("preverUnidade (ponto 5 — assinatura → setor requisitante → null)", () => {
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
    { id: 2, codigo: "SMS", nome: "SECRETARIA MUNICIPAL DE SAÚDE", setorRequisitante: "SMS - SAÚDE", responsaveis: { padroes: [], temporarios: [] } },
  ];

  it("prevê pela ASSINATURA quando o órgão é POR UNIDADE (o assinante identifica a unidade)", () => {
    assert.equal(preverUnidade({ setorRequisitante: "GENÉRICO", assinaturas }, unidades, { assinaturaPorUnidade: true }), 1);
  });
  it("assinatura ÚNICA ⇒ ignora o assinante; cai no SETOR REQUISITANTE", () => {
    assert.equal(preverUnidade({ setorRequisitante: "SMS - SAÚDE", assinaturas }, unidades, { assinaturaPorUnidade: false }), 2);
  });
  it("nem assinatura nem setor ⇒ null (erro até o usuário definir)", () => {
    assert.equal(preverUnidade({ setorRequisitante: "DESCONHECIDO" }, unidades, { assinaturaPorUnidade: true }), null);
  });
});

describe("preverUnidadeDoDfd (ponto 4 — identifica órgão, ESCOPA as unidades, prevê)", () => {
  const orgaos = [
    { id: 1, sigla: "PMRV", nome: "Prefeitura", orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE", assinaturaUnica: false },
    { id: 2, sigla: "AMAE", nome: "Água", orgaoEntidade: "AGENCIA MUNICIPAL DE AGUA", assinaturaUnica: false },
  ];
  const unidades = [
    { id: 10, codigo: "SME", nome: "EDUCAÇÃO", orgaoId: 1, setorRequisitante: "SME - EDUCAÇÃO", responsaveis: { padroes: [], temporarios: [] } },
    { id: 20, codigo: "DAE", nome: "ÁGUA", orgaoId: 2, setorRequisitante: "DAE - ÁGUA", responsaveis: { padroes: [], temporarios: [] } },
  ];

  it("escopa ao órgão identificado e prevê pelo setor", () => {
    const r = preverUnidadeDoDfd({ orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE", setorRequisitante: "SME - EDUCAÇÃO" }, orgaos, unidades);
    assert.equal(r, 10);
  });
  it("setor de OUTRO órgão não casa (respeita o escopo do órgão identificado)", () => {
    const r = preverUnidadeDoDfd({ orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE", setorRequisitante: "DAE - ÁGUA" }, orgaos, unidades);
    assert.equal(r, null);
  });

  it("ÓRGÃO-QUE-É-UNIDADE (orgaoProprio): resolve a unidade própria mesmo sem casar o setor", () => {
    const orgaosDual = [{ id: 3, sigla: "FME", nome: "Fundo Municipal de Educação", orgaoEntidade: "FUNDO MUNICIPAL DE EDUCACAO", assinaturaUnica: true }];
    const unidadesDual = [
      { id: 30, codigo: "FME", nome: "Fundo Municipal de Educação", orgaoId: 3, orgaoProprio: true, setorRequisitante: null, responsaveis: { padroes: [], temporarios: [] } },
    ];
    // Setor não casa a unidade própria, mas o órgão dual resolve para ela (senão o DFD travaria).
    const r = preverUnidadeDoDfd({ orgaoEntidade: "FUNDO MUNICIPAL DE EDUCACAO", setorRequisitante: "QUALQUER SETOR" }, orgaosDual, unidadesDual);
    assert.equal(r, 30);
  });

  it("órgão comum com uma unidade (SEM orgaoProprio) + setor divergente → null (não força)", () => {
    // Garante que o auto-resolve é ESTREITO ao orgao_proprio (não a qualquer órgão de 1 unidade).
    const r = preverUnidadeDoDfd({ orgaoEntidade: "AGENCIA MUNICIPAL DE AGUA", setorRequisitante: "OUTRO" }, orgaos, unidades);
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

describe("divergenciaOrgaoUnidade (item 6.3 — atenção, não bloqueia)", () => {
  const orgaos = [
    { id: 1, sigla: "PMRV", nome: "Prefeitura", orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE" },
    { id: 2, sigla: "AMAE", nome: "Água e Esgoto", orgaoEntidade: "AGENCIA MUNICIPAL DE AGUA E ESGOTO" },
  ];
  const unidades = [
    { id: 10, codigo: "SME", nome: "SECRETARIA MUNICIPAL DE EDUCAÇÃO", orgaoId: 1 },
    { id: 11, codigo: "DAE", nome: "DIRETORIA DE ÁGUA", orgaoId: 2 },
  ];

  it("acusa quando o Órgão/Entidade diverge do órgão da unidade", () => {
    // Setor casa SME (órgão 1), mas o campo Órgão/Entidade aponta a AMAE (órgão 2).
    const d = { siglaSetor: "SME", setorRequisitante: "SME - EDUCAÇÃO", orgaoEntidade: "AGENCIA MUNICIPAL DE AGUA E ESGOTO" };
    assert.equal(divergenciaOrgaoUnidade(d, unidades, orgaos), true);
  });

  it("NÃO acusa quando batem", () => {
    const d = { siglaSetor: "SME", setorRequisitante: "SME - EDUCAÇÃO", orgaoEntidade: "PREFEITURA MUNICIPAL DE RIO VERDE" };
    assert.equal(divergenciaOrgaoUnidade(d, unidades, orgaos), false);
  });

  it("NÃO acusa quando o órgão do campo não resolve", () => {
    const d = { siglaSetor: "SME", setorRequisitante: "SME - EDUCAÇÃO", orgaoEntidade: "ÓRGÃO EXTERNO" };
    assert.equal(divergenciaOrgaoUnidade(d, unidades, orgaos), false);
  });
});
