import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  colunaVisivel,
  metricasPermitidas,
  MSG_RESPONSAVEL_NAO,
  MSG_RESPONSAVEL_SI,
  motivoResponsavel,
  motivoResponsavelPadrao,
  ocultasDe,
  padraoAoProtocolar,
  pessoasDesignaveis,
  podeSubAcao,
  podeTrocarResponsavel,
  soOsMeus,
  VISAO_TUDO,
  visaoMesa,
} from "../src/lib/mesa-visao-core.ts";
import { coerceDetalhes, detalhesPadrao } from "../src/lib/papeis-detalhes-core.ts";

const visao = (bruto: unknown, admin = false) => visaoMesa(coerceDetalhes(bruto), admin);
const EU = 7;

describe("visão da Mesa — efetivo dos detalhes", () => {
  it("o padrão não oculta nada e libera tudo", () => {
    const v = visao({});
    for (const t of ["protocolos", "dfds", "itens", "consolidada"] as const) assert.deepEqual(v.colunasOcultas[t], []);
    assert.deepEqual(v, VISAO_TUDO);
  });

  it("o Administrador ignora os detalhes (regra firme)", () => {
    const d = { mesa: { responsavel: { ver: false }, distribuicao: false, linhas: "meus", valores: false }, historico: { dfd: "nao" } };
    assert.deepEqual(visao(d, true), VISAO_TUDO);
  });

  it("Responsável/Distribuição/Valores entram nas colunas ocultas efetivas", () => {
    const v = visao({ mesa: { responsavel: { ver: false }, distribuicao: false, valores: false, colunasOcultas: { protocolos: ["data"] } } });
    assert.deepEqual([...ocultasDe(v, "protocolos")].sort(), ["data", "distribuicao", "responsavel", "valor"]);
    assert.deepEqual([...ocultasDe(v, "itens")].sort(), ["vtotal", "vunit"]);
    assert.deepEqual([...ocultasDe(v, "consolidada")].sort(), ["abc", "variacao", "vmedio", "vtotal"]);
    assert.equal(colunaVisivel(v, "protocolos", "numero"), true);
    assert.equal(colunaVisivel(v, "protocolos", "responsavel"), false);
  });

  it("só os meus", () => {
    assert.equal(soOsMeus(visao({})), false);
    assert.equal(soOsMeus(visao({ mesa: { linhas: "meus" } })), true);
  });
});

describe("Responsável em 3 níveis", () => {
  const grupo = visao({});
  const si = visao({ mesa: { responsavel: { alterar: "si" } } });
  const nao = visao({ mesa: { responsavel: { alterar: "nao" } } });
  const oculto = visao({ mesa: { responsavel: { ver: false } } });

  it("manter o mesmo nunca é recusado", () => {
    for (const v of [grupo, si, nao, oculto]) {
      assert.equal(motivoResponsavel(v, EU, 3, 3), null);
      assert.equal(motivoResponsavel(v, EU, null, null), null);
      assert.equal(motivoResponsavel(v, EU, undefined, null), null);
    }
  });

  it("qualquer pessoa do grupo: tudo passa (a régua do grupo fica à parte)", () => {
    assert.equal(motivoResponsavel(grupo, EU, null, 3), null);
    assert.equal(motivoResponsavel(grupo, EU, 3, 4), null);
    assert.equal(motivoResponsavel(grupo, EU, 3, null), null);
  });

  it("só assume para si: assumir o sem responsável e soltar o seu", () => {
    assert.equal(motivoResponsavel(si, EU, null, EU), null);
    assert.equal(motivoResponsavel(si, EU, EU, null), null);
    assert.equal(motivoResponsavel(si, EU, 3, EU), MSG_RESPONSAVEL_SI); // tomar o de outra pessoa
    assert.equal(motivoResponsavel(si, EU, null, 3), MSG_RESPONSAVEL_SI);
    assert.equal(motivoResponsavel(si, EU, EU, 3), MSG_RESPONSAVEL_SI);
    assert.equal(motivoResponsavel(si, EU, 3, null), MSG_RESPONSAVEL_SI);
  });

  it("não altera (e Responsável oculto) recusa qualquer troca", () => {
    for (const v of [nao, oculto]) {
      assert.equal(motivoResponsavel(v, EU, null, EU), MSG_RESPONSAVEL_NAO);
      assert.equal(motivoResponsavel(v, EU, EU, null), MSG_RESPONSAVEL_NAO);
    }
  });

  it("a célula é editável conforme o nível", () => {
    assert.equal(podeTrocarResponsavel(grupo, EU, 3), true);
    assert.equal(podeTrocarResponsavel(si, EU, null), true);
    assert.equal(podeTrocarResponsavel(si, EU, EU), true);
    assert.equal(podeTrocarResponsavel(si, EU, 3), false);
    assert.equal(podeTrocarResponsavel(nao, EU, null), false);
    assert.equal(podeTrocarResponsavel(oculto, EU, null), false);
    assert.equal(podeTrocarResponsavel(grupo, null, null), false);
  });

  it("pessoas oferecidas: o grupo, só a própria pessoa, ou ninguém", () => {
    const pessoas = [{ id: 3 }, { id: EU }, { id: 9 }];
    assert.deepEqual(pessoasDesignaveis(grupo, EU, pessoas), pessoas);
    assert.deepEqual(pessoasDesignaveis(si, EU, pessoas), [{ id: EU }]);
    assert.deepEqual(pessoasDesignaveis(nao, EU, pessoas), []);
    assert.deepEqual(pessoasDesignaveis(oculto, EU, pessoas), []);
  });

  it("o padrão ao protocolar e o padrão do Perfil", () => {
    assert.equal(padraoAoProtocolar(grupo, EU, 3), 3);
    assert.equal(padraoAoProtocolar(si, EU, 3), null);
    assert.equal(padraoAoProtocolar(si, EU, EU), EU);
    assert.equal(padraoAoProtocolar(nao, EU, EU), null);
    assert.equal(padraoAoProtocolar(grupo, EU, null), null);
    assert.equal(motivoResponsavelPadrao(grupo, EU, null, 3), null);
    assert.equal(motivoResponsavelPadrao(si, EU, null, EU), null);
    assert.notEqual(motivoResponsavelPadrao(si, EU, null, 3), null);
    assert.equal(motivoResponsavelPadrao(nao, EU, null, EU), MSG_RESPONSAVEL_NAO);
    assert.equal(motivoResponsavelPadrao(nao, EU, 3, 3), null); // manter
    assert.equal(motivoResponsavelPadrao(nao, EU, 3, null), null); // limpar
  });
});

describe("métricas permitidas no Dashboard", () => {
  it("padrão: tudo", () => {
    const m = metricasPermitidas(visao({}));
    assert.equal(m.dados.length, 9);
    assert.equal(m.medidas.length, 6);
    assert.ok(m.responsavel && m.desempenho && m.periodo && m.kpiTempo && m.kpiConformidade && m.kpiValor);
  });

  it("sem desempenho: sem Dados de pessoa e sem a medida Ações", () => {
    const m = metricasPermitidas(visao({ mesa: { desempenho: false } }));
    assert.ok(!m.dados.includes("responsavel") && !m.dados.includes("distribuicao"));
    assert.ok(!m.medidas.includes("acoes"));
    assert.equal(m.desempenho, false);
    assert.equal(m.responsavel, true); // o foco pelo Responsável segue
  });

  it("Responsável oculto: sem o Dado nem o foco; a Distribuição segue", () => {
    const m = metricasPermitidas(visao({ mesa: { responsavel: { ver: false } } }));
    assert.ok(!m.dados.includes("responsavel"));
    assert.ok(m.dados.includes("distribuicao"));
    assert.equal(m.responsavel, false);
  });

  it("Data/Estado/Situação ocultos e Valores ocultos", () => {
    const m = metricasPermitidas(visao({ mesa: { colunasOcultas: { protocolos: ["data", "estado", "situacao"] }, valores: false } }));
    for (const d of ["data", "tempo", "estado", "situacao"] as const) assert.ok(!m.dados.includes(d), d);
    assert.ok(!m.medidas.includes("valor"));
    assert.equal(m.periodo, false);
    assert.equal(m.kpiConformidade, false);
    assert.equal(m.kpiValor, false);
  });
});

describe("sub-ações", () => {
  it("= Manipular ∧ o detalhe", () => {
    const v = visaoMesa(coerceDetalhes({ mesa: { alteracoes: { vincular: false } } }), false);
    assert.equal(podeSubAcao({ manipular: true }, v, "situacao"), true);
    assert.equal(podeSubAcao({ manipular: true }, v, "vincular"), false);
    assert.equal(podeSubAcao({ manipular: false }, v, "situacao"), false);
    assert.equal(podeSubAcao({ manipular: true }, visaoMesa(detalhesPadrao(), false), "vincular"), true);
  });
});
