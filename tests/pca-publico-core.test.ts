import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LinhaHistorico } from "../src/lib/auditoria-core.ts";
import type { DfdDetalhe } from "../src/lib/dfd.ts";
import { dfdPublico, historicoPublico, mascararTexto, solicitantePublico } from "../src/lib/pca-publico-core.ts";
import type { Solicitante } from "../src/lib/reparticao-responsaveis.ts";

const dfd = {
  id: 7,
  numero: "1586",
  planejamento: "1639",
  tipo: "DFD-S",
  objeto: "Canetas",
  orgaoEntidade: "PREFEITURA",
  setorRequisitante: "SMS",
  responsavel: "Fulano",
  matricula: "12345",
  email: "fulano@x.gov.br",
  telefone: "64 9999-0000",
  anoPca: 2027,
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  valorTotal: 30,
  totalItens: 2,
  reparticaoId: 3,
  reparticaoCodigo: "SMS",
  reparticaoNome: "Saúde",
  protocoloId: 9,
  nomeArquivo: "p.pdf",
  secoes: [{ numero: 3, titulo: "JUSTIFICATIVA", texto: "x" }],
  assinaturas: [{ nome: "Fulano", eCpf: "123.456.789-00", usuario: "fulano", local: "", data: "01/01/2027", ip: "", codigo: "ABC", url: "", fonte: "certificado" }],
  itens: [
    { id: 1, item: 1, codigo: "1", descricao: "A", unidade: "UN", quantidade: 1, valorUnitario: 10, valorTotal: 10 },
    { id: 2, item: 2, codigo: "2", descricao: "B", unidade: "UN", quantidade: 1, valorUnitario: 20, valorTotal: 20 },
  ],
} as unknown as DfdDetalhe;

const sol: Solicitante = {
  tipo: "padrao",
  nome: "Fulano",
  matricula: "12345",
  funcao: "Secretário",
  nomeacao: { tipo: "portaria", numero: "10", link: "" },
  assinaturaCodigo: "ABC",
  assinaturaData: "01/01/2027",
};

describe("consulta pública do PCA — higienização", () => {
  it("DFD sem matrícula/e-mail/telefone/assinaturas; só itens ativos e os totais deles", () => {
    const p = dfdPublico(dfd, sol, (id) => id !== 2);
    assert.equal(p.matricula, null);
    assert.equal(p.email, null);
    assert.equal(p.telefone, null);
    assert.deepEqual(p.assinaturas.lista, []);
    assert.equal(p.itens.length, 1);
    assert.equal(p.totalItens, 1);
    assert.equal(p.valorTotal, 10);
    assert.doesNotMatch(JSON.stringify(p), /123\\.456|fulano@|9999-0000|12345/);
  });
  it("solicitante: nome/função/ato ficam; matrícula e dados da assinatura saem", () => {
    const s = solicitantePublico(sol);
    assert.equal(s?.nome, "Fulano");
    assert.equal(s?.funcao, "Secretário");
    assert.equal(s?.matricula, "");
    assert.equal(s?.assinaturaCodigo, "");
    assert.equal(solicitantePublico(null), null);
  });
  it("histórico: só protocolos incorporados, sem autor e sem dados pessoais/assinaturas", () => {
    const base: LinhaHistorico = {
      id: 1,
      usuarioId: 5,
      usuarioNome: "Maria",
      acao: "editar",
      entidade: "dfd",
      entidadeId: 7,
      resumo: "x",
      antes: JSON.stringify({ email: "a@b", objeto: "A" }),
      depois: JSON.stringify({ email: "c@d", objeto: "B" }),
      origem: "banner",
      detalhe: JSON.stringify({
        campos: [
          { campo: "email", rotulo: "E-mail", antes: "a@b", depois: "c@d" },
          { campo: "objeto", rotulo: "Objeto", antes: "A", depois: "B" },
        ],
        assinaturas: { campo: "assinaturas", rotulo: "Assinaturas", antes: "CPF 123", depois: "CPF 456" },
      }),
      protocoloId: 9,
      protocoloNumero: "P-9",
      criadoEm: "2027-01-01 10:00:00",
    };
    const out = historicoPublico([base, { ...base, id: 2, protocoloId: 8 }, { ...base, id: 3, protocoloId: null }], new Set([9]));
    assert.equal(out.length, 1);
    assert.equal(out[0].usuarioNome, null);
    assert.equal(out[0].usuarioId, null);
    assert.doesNotMatch(`${out[0].antes}${out[0].depois}${out[0].detalhe}`, /a@b|c@d|CPF/);
    assert.match(out[0].detalhe ?? "", /Objeto/);
  });
});

it("mascararTexto: CPF, CNPJ, e-mail, telefone e matrícula em texto livre", () => {
  const t =
    "Equipe: JOÃO SILVA, CPF 123.456.789-09, matrícula nº 45.678, joao@rioverde.go.gov.br, (64) 99999-1234; CNPJ 12.345.678/0001-90; e-CPF ***.456.789-** ; cpf: 12345678909. Lei 14.133/2021 art. 12.";
  const m = mascararTexto(t);
  for (const x of ["123.456.789-09", "45.678", "joao@", "99999-1234", "12.345.678/0001-90", "***.456.789-**", "12345678909"]) assert.ok(!m.includes(x), x);
  assert.ok(m.includes("JOÃO SILVA") && m.includes("Lei 14.133/2021 art. 12."));
  assert.equal(mascararTexto(null), null);
});
