import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coerceFonte } from "../src/lib/parse-dfd-comum.ts";
import {
  assinaturasAdobeDeTexto,
  assinaturasFoxitDeTexto,
  ehCandidatoOcr,
} from "../src/lib/parse-dfd-pdf-core.ts";

// Texto REAL do carimbo Foxit/ICP-Brasil (Formato E) como o OCR o entrega — colapsado numa linha
// (DFD 140 do pd101820, signatário BRUNO BOTELHO SALEH). O carimbo vem achatado como IMAGEM no PDF,
// então NENHUM parser de texto o lê; este texto é a SAÍDA do OCR da região do carimbo.
const CARIMBO_BRUNO =
  "Assinado digitalmente por BRUNO BOTELHO SALEH:03583205693 ND: C=BR, O=ICP-Brasil, " +
  "OU=Secretaria da Receita Federal do Brasil - RFB, OU=RFB e-CPF A1, OU=(EM BRANCO), " +
  "OU=37743132000113, OU=videoconferencia, CN=BRUNO BOTELHO SALEH:03583205693 " +
  "Razão: Eu sou o autor deste documento Localização: Data: 2026.07.06 14:08:20-03'00' " +
  "Foxit PDF Reader Versão: 2025.2.1";

describe("assinaturasFoxitDeTexto (Formato E — OCR)", () => {
  it("extrai nome + CPF mascarado + data do carimbo BRUNO", () => {
    const a = assinaturasFoxitDeTexto(CARIMBO_BRUNO);
    assert.equal(a.length, 1);
    assert.equal(a[0].nome, "BRUNO BOTELHO SALEH");
    assert.equal(a[0].eCpf, "***.832.056-**");
    assert.match(a[0].data, /^06\/07\/2026/); // AAAA.MM.DD → DD/MM/AAAA
    assert.equal(a[0].data, "06/07/2026 14:08:20 -03:00");
    assert.equal(a[0].fonte, "foxit");
  });

  it("tolera confusão de OCR nos dígitos do CPF (O→0)", () => {
    // OCR lê o "0" inicial do CPF como a letra "O": ":O3583205693" → digitosOcr corrige → CPF válido.
    const a = assinaturasFoxitDeTexto(CARIMBO_BRUNO.replaceAll(":03583205693", ":O3583205693"));
    assert.equal(a.length, 1);
    assert.equal(a[0].eCpf, "***.832.056-**");
    assert.equal(a[0].nome, "BRUNO BOTELHO SALEH");
  });

  it("lê o carimbo com a 1ª linha CORROMPIDA pelo nome grande (texto REAL do OCR do pd101820)", () => {
    // Saída literal do OCR (Tesseract) da caixa de detalhe: "Assinado digitalmente por…" saiu ilegível
    // (sobreposição do nome grande), mas o CN= e a Data saíram limpos → extrai pelo CN. Validado por harness.
    const real =
      "AsSSIauo UIguamnmente por DONUNV DU IELA SALEH:03583205693 ND: C=BR, O=ICP-Brasil, " +
      "OU=Secretaria da Receita Federal do Brasil - RFB, OU=RFB e CPF A1, OU=(EM BRANCO), OU= " +
      "37743132000113, OU=videoconferencia, CN BRUNO BOTELHO SALEH:03583205693 " +
      "Razão: Eu sou o autor deste documento Localização: Data: 2026.07.06 14:08:20-03'00' " +
      "Foxit PDF Reader Versão: 2025.2.1";
    const a = assinaturasFoxitDeTexto(real);
    assert.equal(a.length, 1);
    assert.equal(a[0].nome, "BRUNO BOTELHO SALEH");
    assert.equal(a[0].eCpf, "***.832.056-**");
    assert.equal(a[0].data, "06/07/2026 14:08:20 -03:00");
    assert.equal(a[0].fonte, "foxit");
  });

  it("aceita carimbo SEM CPF colado (só nome + data ISO)", () => {
    const a = assinaturasFoxitDeTexto(
      "Assinado digitalmente por RICARDO ROCHA BATISTA ND: C=BR, O=ICP-Brasil Data: 2026.03.10 08:00:00-03'00' Foxit PDF Reader",
    );
    assert.equal(a.length, 1);
    assert.equal(a[0].nome, "RICARDO ROCHA BATISTA");
    assert.equal(a[0].eCpf, "");
    assert.equal(a[0].data, "10/03/2026 08:00:00 -03:00");
    assert.equal(a[0].fonte, "foxit");
  });

  it("NÃO casa o Formato B (fonte sistema): 'em dd/mm/aaaa' não tem data ISO", () => {
    const b =
      "Assinado digitalmente por GISELE SOARES CHAVALHA, portador do CPF: ***.145.231-**, em 27/08/2026 09:34:50. utilizando o código: ABC";
    assert.deepEqual(assinaturasFoxitDeTexto(b), []);
  });

  it("NÃO casa o Formato D (Adobe 'de forma digital'): prefixo diferente", () => {
    const d = "Assinado de forma digital por FULANO DE TAL:12345678901 Dados: 2026.05.04 10:00:00 -03'00'";
    assert.deepEqual(assinaturasFoxitDeTexto(d), []);
  });

  it("dedup por nome+data (mesmo carimbo repetido) → 1", () => {
    assert.equal(assinaturasFoxitDeTexto([CARIMBO_BRUNO, CARIMBO_BRUNO]).length, 1);
  });

  it("página sem carimbo Foxit → vazio", () => {
    assert.deepEqual(assinaturasFoxitDeTexto("1 - IDENTIFICAÇÃO DA DEMANDA algum texto qualquer"), []);
  });
});

describe("assinaturasAdobeDeTexto (Formato D) — sem regressão", () => {
  it("continua casando 'Assinado de forma digital por NOME:CPF Dados: AAAA.MM.DD'", () => {
    const a = assinaturasAdobeDeTexto(
      "Assinado de forma digital por RHAFAEL PEREIRA BARROS:98765432100 Dados: 2026.02.01 09:00:00 -03'00'",
    );
    assert.equal(a.length, 1);
    assert.equal(a[0].nome, "RHAFAEL PEREIRA BARROS");
    assert.equal(a[0].fonte, "adobe");
    assert.equal(a[0].data, "01/02/2026 09:00:00 -03:00");
  });

  it("Adobe NÃO casa o carimbo Foxit ('digitalmente por')", () => {
    assert.deepEqual(assinaturasAdobeDeTexto(CARIMBO_BRUNO), []);
  });
});

describe("ehCandidatoOcr (detector de candidato)", () => {
  it("candidato quando NÃO há assinatura e a página tem imagem", () => {
    assert.equal(ehCandidatoOcr(false, { temImagem: true }), true);
  });
  it("NÃO é candidato se já há assinatura (nunca gasta OCR à toa)", () => {
    assert.equal(ehCandidatoOcr(true, { temImagem: true }), false);
  });
  it("NÃO é candidato sem imagem", () => {
    assert.equal(ehCandidatoOcr(false, { temImagem: false }), false);
  });
});

describe("coerceFonte (leitura do banco preserva a fonte — round-trip)", () => {
  it("preserva TODAS as fontes válidas, inclusive foxit", () => {
    for (const f of ["certificado", "sistema", "dropsigner", "adobe", "foxit"] as const) {
      assert.equal(coerceFonte(f), f);
    }
  });
  it("valor desconhecido/nulo cai em certificado (fallback seguro)", () => {
    assert.equal(coerceFonte("lixo"), "certificado");
    assert.equal(coerceFonte(undefined), "certificado");
    assert.equal(coerceFonte(null), "certificado");
    assert.equal(coerceFonte(""), "certificado");
  });
});
