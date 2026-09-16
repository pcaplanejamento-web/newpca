import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  casarOrgao,
  casarReparticao,
  casarUnidade,
  casarUnidadePorInteressado,
  divergenciaOrgaoUnidade,
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

describe("casarUnidadePorInteressado (Interessado do protocolo → unidade)", () => {
  const unidades = [
    { id: 1, codigo: "FMS", nome: "FUNDO MUNICIPAL DE SAÚDE", numeroInteressado: "1008171" },
    { id: 2, codigo: "SME", nome: "SECRETARIA MUNICIPAL DE EDUCAÇÃO" },
  ];

  it("casa pelo NÚMERO do interessado (cadastrado)", () => {
    assert.equal(casarUnidadePorInteressado("1008171 - FUNDO MUNICIPAL DE SAUDE", unidades), 1);
  });

  it("número não cadastrado ⇒ fallback pelo NOME (comportamento atual)", () => {
    assert.equal(casarUnidadePorInteressado("42 - SECRETARIA MUNICIPAL DE EDUCACAO", unidades), 2);
  });

  it("sem interessado → null", () => {
    assert.equal(casarUnidadePorInteressado(null, unidades), null);
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
