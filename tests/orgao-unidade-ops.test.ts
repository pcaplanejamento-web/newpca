import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  orgaoDeUnidade,
  podePromoverUnidade,
  podeRebaixarOrgao,
  podeRemoverUnidadePropria,
  podeTornarUnidade,
  unidadeDeOrgao,
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

describe("orgao-unidade-ops — permissões (mesmas travas do ponto 8)", () => {
  it("promover: só unidade comum e sem vínculo", () => {
    assert.equal(podePromoverUnidade({ orgaoProprio: false, temVinculo: false }).ok, true);
    assert.equal(podePromoverUnidade({ orgaoProprio: true, temVinculo: false }).ok, false); // é a própria do órgão
    assert.equal(podePromoverUnidade({ orgaoProprio: false, temVinculo: true }).ok, false); // seria excluída
  });

  it("rebaixar: só órgão sem unidades e sem vínculo", () => {
    assert.equal(podeRebaixarOrgao({ temUnidades: false, temVinculo: false }).ok, true);
    assert.equal(podeRebaixarOrgao({ temUnidades: true, temVinculo: false }).ok, false);
    assert.equal(podeRebaixarOrgao({ temUnidades: false, temVinculo: true }).ok, false);
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
