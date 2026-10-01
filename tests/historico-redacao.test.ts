import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LinhaHistorico } from "../src/lib/auditoria-core.ts";
import { REGRA_COMPLETA, REGRA_PUBLICA, regraHistoricoMesa, redigirHistorico } from "../src/lib/historico-redacao.ts";
import { visaoMesa } from "../src/lib/mesa-visao-core.ts";
import { historicoPublico } from "../src/lib/pca-publico-core.ts";
import { coerceDetalhes } from "../src/lib/papeis-detalhes-core.ts";

const linha = (extra: Partial<LinhaHistorico>): LinhaHistorico => ({
  id: 1,
  usuarioId: 5,
  usuarioNome: "Maria",
  acao: "editar",
  entidade: "protocolo",
  entidadeId: 9,
  resumo: "Protocolo P-9: Responsável, Situação",
  antes: null,
  depois: null,
  origem: "celula",
  detalhe: null,
  protocoloId: 9,
  protocoloNumero: "P-9",
  criadoEm: "2027-01-01 10:00:00",
  ...extra,
});
const gestao = (campos: { campo: string; rotulo: string; antes: string; depois: string }[]) => JSON.stringify({ campos });
const RESP = { campo: "responsavelId", rotulo: "Responsável", antes: "Ana Souza", depois: "Bia Lima" };
const SIT = { campo: "situacaoId", rotulo: "Situação", antes: "Nova", depois: "Em análise" };

describe("redação do histórico", () => {
  it("sem restrição: a MESMA lista", () => {
    const l = [linha({ detalhe: gestao([RESP]) })];
    assert.equal(redigirHistorico(l, REGRA_COMPLETA), l);
    assert.equal(redigirHistorico(l, regraHistoricoMesa(visaoMesa(coerceDetalhes({}), false))), l);
  });

  it("Responsável oculto: a mudança só dele SOME; com outra mudança, fica a outra (e o resumo sai)", () => {
    const r = regraHistoricoMesa(visaoMesa(coerceDetalhes({ mesa: { responsavel: { ver: false } } }), false));
    assert.deepEqual(redigirHistorico([linha({ detalhe: gestao([RESP]) })], r), []);
    const [l] = redigirHistorico([linha({ detalhe: gestao([RESP, SIT]) })], r);
    assert.doesNotMatch(l.detalhe ?? "", /Ana Souza|Bia Lima|Responsável/);
    assert.match(l.detalhe ?? "", /Em análise/);
    assert.equal(l.resumo, null);
    assert.equal(l.usuarioNome, "Maria"); // o autor segue (o nível é "completo")
  });

  it("pela CHAVE, nunca pelo rótulo: o 'responsavel' do formulário do DFD fica", () => {
    const r = regraHistoricoMesa(visaoMesa(coerceDetalhes({ mesa: { responsavel: { ver: false } } }), false));
    const dfd = linha({ entidade: "dfd", detalhe: gestao([{ campo: "responsavel", rotulo: "Responsável", antes: "Fulano", depois: "Beltrano" }]) });
    const [l] = redigirHistorico([dfd], r);
    assert.match(l.detalhe ?? "", /Beltrano/);
  });

  it("formato legado (antes/depois por chave)", () => {
    const r = regraHistoricoMesa(visaoMesa(coerceDetalhes({ mesa: { responsavel: { ver: false } } }), false));
    const legado = linha({ antes: JSON.stringify({ responsavelId: 3 }), depois: JSON.stringify({ responsavelId: 4 }) });
    assert.deepEqual(redigirHistorico([legado], r), []);
    const misto = linha({ antes: JSON.stringify({ responsavelId: 3, assunto: "A" }), depois: JSON.stringify({ responsavelId: 4, assunto: "B" }) });
    const [l] = redigirHistorico([misto], r);
    assert.deepEqual(JSON.parse(l.depois ?? "{}"), { assunto: "B" });
  });

  it("linhas sem mudança de campo (protocolar, excluir) ficam", () => {
    const r = regraHistoricoMesa(visaoMesa(coerceDetalhes({ mesa: { responsavel: { ver: false } } }), false));
    const l = linha({ acao: "protocolar", resumo: "Protocolado", origem: "protocolacao" });
    assert.equal(redigirHistorico([l], r).length, 1);
  });

  it("Distribuição oculta: as linhas da PROTOCOLAÇÃO saem sem o autor (quem protocolou É a Distribuição); as demais ficam", () => {
    const r = regraHistoricoMesa(visaoMesa(coerceDetalhes({ mesa: { distribuicao: false } }), false));
    const [prot, imp, cel] = redigirHistorico(
      [
        linha({ acao: "protocolar", resumo: "Protocolado", origem: "protocolacao", detalhe: null }),
        linha({ id: 2, acao: "importar", entidade: "dfd", resumo: "DFD 1209 importado", origem: "protocolacao", detalhe: null }),
        linha({ id: 3, detalhe: gestao([SIT]) }),
      ],
      r,
    );
    assert.equal(prot.usuarioId, null);
    assert.equal(prot.usuarioNome, null);
    assert.equal(imp.usuarioNome, null);
    assert.equal(cel.usuarioNome, "Maria");
    // Com a Distribuição visível, o autor da protocolação fica.
    const vis = regraHistoricoMesa(visaoMesa(coerceDetalhes({}), false));
    assert.equal(redigirHistorico([linha({ acao: "protocolar", origem: "protocolacao" })], vis)[0].usuarioNome, "Maria");
  });

  it("sem autores: anonimiza", () => {
    const r = regraHistoricoMesa(visaoMesa(coerceDetalhes({}), false), "anonimo");
    const [l] = redigirHistorico([linha({ detalhe: gestao([SIT]) })], r);
    assert.equal(l.usuarioId, null);
    assert.equal(l.usuarioNome, null);
  });
});

describe("consulta PÚBLICA do PCA — vazamento corrigido", () => {
  it("Responsável e Situação (nomes) não saem mais no histórico público", () => {
    const out = historicoPublico([linha({ detalhe: gestao([RESP, SIT]) }), linha({ id: 2, detalhe: gestao([RESP]) })], new Set([9]));
    assert.equal(out.length, 0);
    const [l] = historicoPublico([linha({ detalhe: gestao([RESP, { campo: "assunto", rotulo: "Assunto", antes: "A", depois: "B" }]) })], new Set([9]));
    assert.doesNotMatch(`${l.detalhe}${l.resumo}`, /Ana Souza|Bia Lima/);
    assert.equal(l.usuarioNome, null);
    assert.equal(REGRA_PUBLICA.anonimo, true);
  });
});
