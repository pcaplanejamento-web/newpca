import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DfdDetalhe } from "../src/lib/dfd.ts";
import { type CapaEditavel, detalheParaParseado, diffCapaGravada, diffDfdGravado } from "../src/lib/dfd-edicao.ts";

const gravado = (): DfdDetalhe => ({
  id: 7,
  numero: "1586",
  planejamento: "1639",
  tipo: "DFD-S · Solução",
  objeto: "Aquisição de canetas",
  setorRequisitante: "SMIR",
  responsavel: "Fulano",
  valorTotal: 10,
  totalItens: 1,
  atualizadoEm: null,
  reparticaoId: 3,
  reparticaoCodigo: "SMIR",
  reparticaoNome: "Infraestrutura",
  protocoloId: 1,
  protocoloNumero: "144756/2026",
  protocoloAssunto: "INCLUSÃO - PCA",
  protocoloAnoPca: 2027,
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  assinaturaGrupos: ["centi"],
  orgaoEntidade: "PREFEITURA",
  matricula: "1",
  email: null,
  telefone: null,
  anoPca: 2027,
  nomeArquivo: "p.pdf",
  secoes: [{ numero: 3, titulo: "JUSTIFICATIVA", texto: "x" }],
  assinaturas: [],
  itens: [{ id: 1, item: 1, codigo: "1001", descricao: "CANETA", unidade: "UN", quantidade: 2, valorUnitario: 5, valorTotal: 10 }],
});

describe("diffDfdGravado — salvar só o que mudou no DFD gravado", () => {
  it("rascunho igual ao gravado ⇒ nada a salvar", () => {
    const o = gravado();
    assert.deepEqual(diffDfdGravado(o, detalheParaParseado(o), o.reparticaoId, false), {});
  });

  it("detecta unidade, seções, campos de texto e (só quando editados) os itens", () => {
    const o = gravado();
    const d = detalheParaParseado(o);
    const editado = { ...d, secoes: [{ numero: 3, titulo: "JUSTIFICATIVA", texto: "nova" }], telefone: "64 9999-0000" };
    const body = diffDfdGravado(o, editado, 9, true);
    assert.equal(body.reparticaoId, 9);
    assert.deepEqual(body.secoes, editado.secoes);
    assert.equal(body.telefone, "64 9999-0000");
    assert.deepEqual(body.itens, editado.itens);
    assert.equal("tipo" in body, false);
    assert.equal("assinaturas" in body, false);
  });

  it("detalheParaParseado preserva o nome do arquivo (a exigência de assinatura segue o servidor)", () => {
    assert.equal(detalheParaParseado(gravado()).nomeArquivo, "p.pdf");
    assert.equal(detalheParaParseado({ ...gravado(), nomeArquivo: null }).nomeArquivo, "");
  });
});

describe("diffCapaGravada — capa do protocolo gravado", () => {
  const o: CapaEditavel = { reparticaoId: 3, interessado: "FUNDO", documento: null, assunto: "INCLUSÃO", observacao: null, valorCapa: 100, localReparticao: null };
  it("igual ⇒ {}; texto vazio vira null; valor da capa substituído pela somatória entra", () => {
    assert.deepEqual(diffCapaGravada(o, { ...o }), {});
    assert.deepEqual(diffCapaGravada(o, { ...o, interessado: "  " }), { interessado: null });
    assert.deepEqual(diffCapaGravada(o, { ...o, valorCapa: 97588.2 }), { valorCapa: 97588.2 });
    assert.deepEqual(diffCapaGravada(o, { ...o, reparticaoId: null }), { reparticaoId: null });
  });
});
