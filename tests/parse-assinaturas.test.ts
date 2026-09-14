import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extrairAssinaturas } from "../src/lib/parse-dfd-comum.ts";

// Linhas REAIS da página "Assinaturas Digitais" do protocolo (pdf.js reconstrói o
// código na linha de baixo; o rodapé "Centi" traz OUTRO código, que NÃO é assinatura).
const paginaUmaAssinatura = [
  "Assinaturas Digitais (Certificado Digital)",
  "Assinatura digital - Nome: ISAAC PIRES CABRAL e-CPF: ***.390.771-** Usuário: isaac.pires Local: BR Data: 31/08/2026 16:20:00 IP:  e-Assinatura:",
  "pVSGdg58teX - http://servicos.rioverde.go.gov.br/servicos/autenticacaorelatorios",
  "Centi ® e-Assinatura: 0tQGdg58teX",
  "Emitido por isaac.pires",
  "Página 1 de 1",
];

describe("extrairAssinaturas", () => {
  it("extrai uma assinatura com o código quebrado na linha seguinte", () => {
    const a = extrairAssinaturas(paginaUmaAssinatura);
    assert.equal(a.length, 1);
    assert.equal(a[0].nome, "ISAAC PIRES CABRAL");
    assert.equal(a[0].eCpf, "***.390.771-**");
    assert.equal(a[0].usuario, "isaac.pires");
    assert.equal(a[0].local, "BR");
    assert.equal(a[0].data, "31/08/2026 16:20:00");
    assert.equal(a[0].ip, ""); // IP nunca vem preenchido
    // o código da ASSINATURA (não o do rodapé "Centi": 0tQGdg58teX)
    assert.equal(a[0].codigo, "pVSGdg58teX");
    assert.match(a[0].url, /autenticacaorelatorios$/);
  });

  it("extrai VÁRIAS assinaturas na mesma página", () => {
    const linhas = [
      "Assinaturas Digitais (Certificado Digital)",
      "Assinatura digital - Nome: MARIA DE SOUSA e-CPF: ***.111.222-** Usuário: maria.sousa Local: BR Data: 01/09/2026 09:36:30 IP:  e-Assinatura: AB1Cdg58teX - https://servicos.rioverde.go.gov.br/servicos/autenticacaorelatorios",
      "Assinatura digital - Nome: JOAO LIMA e-CPF: ***.333.444-** Usuário: joao.lima Local: BR Data: 02/09/2026 10:00:00 IP:  e-Assinatura:",
      "ZZ9Xdg58teX - https://servicos.rioverde.go.gov.br/servicos/autenticacaorelatorios",
    ];
    const a = extrairAssinaturas(linhas);
    assert.equal(a.length, 2);
    assert.equal(a[0].nome, "MARIA DE SOUSA");
    assert.equal(a[0].codigo, "AB1Cdg58teX");
    assert.equal(a[1].nome, "JOAO LIMA");
    assert.equal(a[1].codigo, "ZZ9Xdg58teX"); // 2ª também com código quebrado
    assert.equal(a[1].data, "02/09/2026 10:00:00");
  });

  it("página sem assinatura → lista vazia", () => {
    assert.deepEqual(extrairAssinaturas(["1 - IDENTIFICAÇÃO DA DEMANDA", "algum texto", "Página 1 de 3"]), []);
  });
});
