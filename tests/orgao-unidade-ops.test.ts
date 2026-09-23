import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  orgaoDeUnidade,
  podePromoverUnidade,
  podeRebaixarOrgao,
  podeRemoverUnidadePropria,
  podeTornarUnidade,
  propriaRebaixada,
  unidadeDeOrgao,
  unidadePreservadaNoPromover,
  unidadePropriaDeOrgao,
} from "../src/lib/orgao-unidade-ops.ts";

describe("orgao-unidade-ops — mapa de campos (o que SEGUE na transformação)", () => {
  it("PROMOVER: unidade → órgão (sigla←código; nº e responsáveis seguem; assinatura por unidade; sem orgaoEntidade)", () => {
    const o = orgaoDeUnidade({ codigo: "AMAE", nome: "Agência de Água", numeroInteressado: "42", responsavelDfd: '{"padroes":[]}', oculto: false });
    assert.equal(o.sigla, "AMAE");
    assert.equal(o.nome, "Agência de Água");
    assert.equal(o.numeroInteressado, "42");
    assert.equal(o.responsavelDfd, '{"padroes":[]}');
    assert.equal(o.orgaoEntidade, null);
    assert.equal(o.assinaturaUnica, false);
    assert.equal(o.oculto, false);
  });

  it("REBAIXAR: órgão → unidade sob o destino (código←sigla; nº e responsáveis seguem; sem setor; não é própria)", () => {
    const u = unidadeDeOrgao({ sigla: "SME", nome: "Educação", numeroInteressado: "7", responsavelDfd: null, oculto: true }, 9);
    assert.equal(u.codigo, "SME");
    assert.equal(u.orgaoId, 9);
    assert.equal(u.numeroInteressado, "7");
    assert.equal(u.setorRequisitante, null);
    assert.equal(u.orgaoProprio, false);
    assert.equal(u.oculto, true); // preserva o estado de oculto
  });

  it("TAMBÉM UNIDADE: unidade própria herda nome/sigla/oculto mas NÃO o nº do interessado nem responsáveis", () => {
    const u = unidadePropriaDeOrgao({ sigla: "PMRV", nome: "Prefeitura", oculto: false }, 1);
    assert.equal(u.codigo, "PMRV");
    assert.equal(u.orgaoId, 1);
    assert.equal(u.orgaoProprio, true);
    assert.equal(u.numeroInteressado, null); // o órgão detém o número (único global)
    assert.equal(u.responsavelDfd, null);
  });
});

describe("orgao-unidade-ops — com vínculo (a unidade que carrega os vínculos é PRESERVADA)", () => {
  it("PROMOVER c/ vínculo: a unidade vira a própria do novo órgão; o nº sobe p/ o órgão; responsáveis ficam", () => {
    const p = unidadePreservadaNoPromover({ responsavelDfd: '{"padroes":["A"]}' }, { assinaturaUnica: true, responsavelDfd: '{"padroes":["X"]}' });
    assert.equal(p.orgaoProprio, true);
    assert.equal(p.numeroInteressado, null);
    assert.equal(p.responsavelDfd, '{"padroes":["A"]}'); // os seus têm precedência
  });

  it("PROMOVER c/ vínculo: sem responsáveis próprios, herda os do órgão de origem de assinatura ÚNICA", () => {
    assert.equal(unidadePreservadaNoPromover({ responsavelDfd: null }, { assinaturaUnica: true, responsavelDfd: "R" }).responsavelDfd, "R");
    assert.equal(unidadePreservadaNoPromover({ responsavelDfd: null }, { assinaturaUnica: false, responsavelDfd: "R" }).responsavelDfd, null);
    assert.equal(unidadePreservadaNoPromover({ responsavelDfd: null }, null).responsavelDfd, null);
  });

  it("REBAIXAR dual: a própria desce como comum; recebe o nº do órgão e os responsáveis efetivos", () => {
    const o = { numeroInteressado: "7", assinaturaUnica: true, responsavelDfd: "ORG", oculto: false };
    const r = propriaRebaixada(o, { numeroInteressado: null, responsavelDfd: "UNI", oculto: false }, 9);
    assert.equal(r.orgaoId, 9);
    assert.equal(r.orgaoProprio, false);
    assert.equal(r.numeroInteressado, "7");
    assert.equal(r.responsavelDfd, "ORG"); // assinatura única → os do órgão eram os efetivos
    const r2 = propriaRebaixada({ ...o, assinaturaUnica: false, oculto: true }, { numeroInteressado: "8", responsavelDfd: "UNI", oculto: false }, 9);
    assert.equal(r2.numeroInteressado, "8");
    assert.equal(r2.responsavelDfd, "UNI");
    assert.equal(r2.oculto, true);
  });
});

describe("orgao-unidade-ops — permissões (mesmas travas do ponto 8)", () => {
  it("promover: qualquer unidade comum (com vínculo ela é preservada); nunca a própria do órgão", () => {
    assert.equal(podePromoverUnidade({ orgaoProprio: false }).ok, true);
    assert.equal(podePromoverUnidade({ orgaoProprio: true }).ok, false);
  });

  it("rebaixar: qualquer órgão sem unidades-FILHAS (com vínculo ou dual pode)", () => {
    assert.equal(podeRebaixarOrgao({ temUnidadesFilhas: false }).ok, true);
    assert.equal(podeRebaixarOrgao({ temUnidadesFilhas: true }).ok, false);
  });

  it("tornar unidade: só órgão sem unidades-filhas e não-dual", () => {
    assert.equal(podeTornarUnidade({ temUnidadesFilhas: false, jaEhDual: false }).ok, true);
    assert.equal(podeTornarUnidade({ temUnidadesFilhas: true, jaEhDual: false }).ok, false);
    assert.equal(podeTornarUnidade({ temUnidadesFilhas: false, jaEhDual: true }).ok, false);
  });

  it("remover unidade própria: barrado com vínculo", () => {
    assert.equal(podeRemoverUnidadePropria({ temVinculo: false }).ok, true);
    assert.equal(podeRemoverUnidadePropria({ temVinculo: true }).ok, false);
  });
});
