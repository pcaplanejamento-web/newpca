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
  vinculosNoPromover,
  vinculosNoRebaixar,
} from "../src/lib/orgao-unidade-ops.ts";

describe("orgao-unidade-ops — mapa de campos (o que SEGUE na transformação)", () => {
  it("PROMOVER: unidade → órgão (sigla←código; nº segue; assinatura por unidade; sem orgaoEntidade)", () => {
    const o = orgaoDeUnidade({ codigo: "AMAE", nome: "Agência de Água", numeroInteressado: "42", oculto: false });
    assert.equal(o.sigla, "AMAE");
    assert.equal(o.nome, "Agência de Água");
    assert.equal(o.numeroInteressado, "42");
    assert.equal(o.orgaoEntidade, null);
    assert.equal(o.assinaturaUnica, false);
    assert.equal(o.oculto, false);
  });

  it("REBAIXAR: órgão → unidade sob o destino (código←sigla; nº segue; sem setor; não é própria)", () => {
    const u = unidadeDeOrgao({ sigla: "SME", nome: "Educação", numeroInteressado: "7", oculto: true }, 9);
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
  });
});

describe("orgao-unidade-ops — com vínculo (a unidade que carrega os vínculos é PRESERVADA)", () => {
  it("PROMOVER c/ vínculo: a unidade vira a própria do novo órgão; o nº sobe p/ o órgão", () => {
    const p = unidadePreservadaNoPromover();
    assert.equal(p.orgaoProprio, true);
    assert.equal(p.numeroInteressado, null);
  });

  it("PROMOVER: os responsáveis — sem vínculo vão ao órgão; preservada mantém os seus ou copia os da origem ÚNICA", () => {
    const f = { preservar: true, unidadeTemVinculos: false, origemUnica: true, origemTemVinculos: true };
    assert.equal(vinculosNoPromover({ ...f, preservar: false }), "moverParaOrgao");
    assert.equal(vinculosNoPromover(f), "copiarDaOrigem");
    assert.equal(vinculosNoPromover({ ...f, unidadeTemVinculos: true }), "manter", "os seus têm precedência");
    assert.equal(vinculosNoPromover({ ...f, origemUnica: false }), "manter");
    assert.equal(vinculosNoPromover({ ...f, origemTemVinculos: false }), "manter");
  });

  it("REBAIXAR dual: a própria desce como comum; recebe o nº do órgão", () => {
    const o = { numeroInteressado: "7", oculto: false };
    const r = propriaRebaixada(o, { numeroInteressado: null, oculto: false }, 9);
    assert.equal(r.orgaoId, 9);
    assert.equal(r.orgaoProprio, false);
    assert.equal(r.numeroInteressado, "7");
    const r2 = propriaRebaixada({ ...o, oculto: true }, { numeroInteressado: "8", oculto: false }, 9);
    assert.equal(r2.numeroInteressado, "8");
    assert.equal(r2.oculto, true);
  });

  it("REBAIXAR: os responsáveis do órgão nunca ficam para trás", () => {
    const f = { propria: true, orgaoUnica: true, orgaoTemVinculos: true, propriaTemVinculos: true };
    assert.equal(vinculosNoRebaixar({ ...f, propria: false }), "moverDoOrgao", "unidade nova recebe os do órgão");
    assert.equal(vinculosNoRebaixar(f), "substituirPelosDoOrgao", "assinatura única: os do órgão eram os efetivos");
    assert.equal(vinculosNoRebaixar({ ...f, orgaoUnica: false }), "manter", "por unidade: a própria mantém os seus");
    assert.equal(vinculosNoRebaixar({ ...f, orgaoUnica: false, propriaTemVinculos: false }), "moverDoOrgao");
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
