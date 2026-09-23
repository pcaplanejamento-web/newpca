import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vinculosOrcamentoSchema } from "../src/lib/orcamento-validation.ts";
import {
  alvoDoTexto,
  chaveVinculo,
  linhasVinculo,
  mapaVinculos,
  nomeSemCodigo,
  sugerirAlvo,
} from "../src/lib/orcamento-vinculo.ts";

const ORGAOS = [
  { id: 1, sigla: "PMRV", nome: "Prefeitura Municipal de Rio Verde" },
  { id: 2, sigla: "FME", nome: "Fundo Municipal de Educação" },
  { id: 3, sigla: "OCU", nome: "Fundo Oculto", oculto: true },
];
const UNIDADES = [
  { id: 15, sigla: "SME", nome: "Secretaria Municipal de Educação", orgaoId: 1 },
  { id: 16, sigla: "SMS", nome: "Secretaria Municipal de Saúde", orgaoId: 1 },
  { id: 26, sigla: "FMACL", nome: "Fundo Mun. de Assistência", orgaoId: 1 },
];

describe("orcamento-vinculo — chave e código", () => {
  it("chave ignora acento, caixa e espaços (o mesmo texto em anos diferentes casa)", () => {
    assert.equal(chaveVinculo("2 - Secretaria  Municipal de Educação "), chaveVinculo("2 - SECRETARIA MUNICIPAL DE EDUCACAO"));
    assert.equal(chaveVinculo(null), "");
  });
  it("nomeSemCodigo tira o código numérico do CUBO", () => {
    assert.equal(nomeSemCodigo("2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO"), "SECRETARIA MUNICIPAL DE EDUCAÇÃO");
    assert.equal(nomeSemCodigo("26 - FMACL"), "FMACL");
    assert.equal(nomeSemCodigo("FUNDO MUNICIPAL"), "FUNDO MUNICIPAL");
  });
});

describe("orcamento-vinculo — sugestão", () => {
  it("nome igual (sem código/acento) ⇒ sugere", () => {
    assert.equal(sugerirAlvo("2 - SECRETARIA MUNICIPAL DE EDUCACAO", UNIDADES), 15);
  });
  it("sigla igual ⇒ sugere", () => {
    assert.equal(sugerirAlvo("26 - FMACL", UNIDADES), 26);
  });
  it("nome semelhante ≥ limiar ⇒ sugere; distante ⇒ nada", () => {
    assert.equal(sugerirAlvo("FUNDO MUNICIPAL DE EDUCACAO DE RIO VERDE", ORGAOS), 2);
    assert.equal(sugerirAlvo("CAMARA DE VEREADORES", ORGAOS), null);
  });
  it("ignora alvos ocultos e texto vazio", () => {
    assert.equal(sugerirAlvo("FUNDO OCULTO", ORGAOS), null);
    assert.equal(sugerirAlvo("", ORGAOS), null);
  });
  it("empate de semelhança ⇒ não sugere (nunca sugere errado)", () => {
    const dup = [
      { id: 1, sigla: "A", nome: "Fundo Municipal Alfa" },
      { id: 2, sigla: "B", nome: "Fundo Municipal Beta" },
    ];
    assert.equal(sugerirAlvo("FUNDO MUNICIPAL", dup), null);
  });
});

describe("orcamento-vinculo — linhas da tela", () => {
  const lanc = [
    { orgao: "FUNDO MUNICIPAL DE EDUCACAO DE RIO VERDE", unidade: "2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO", valorInicial: 100 },
    { orgao: "FUNDO MUNICIPAL DE EDUCACAO DE RIO VERDE", unidade: "2 - Secretaria Municipal de Educação", valorInicial: 50 },
    { orgao: "PREFEITURA", unidade: "26 - FMACL", valorInicial: 10 },
    { orgao: null, unidade: "  ", valorInicial: 5 },
  ];
  const vinc = [{ tipo: "unidade" as const, chave: chaveVinculo("2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO"), texto: "x", alvoId: 16 }];
  const linhas = linhasVinculo(lanc, vinc, { orgaos: ORGAOS, unidades: UNIDADES });

  it("agrupa textos distintos (órgãos primeiro), soma lançamentos e dotação, ignora vazio", () => {
    assert.deepEqual(
      linhas.map((l) => [l.tipo, l.lancamentos, l.valorInicial]),
      [
        ["orgao", 2, 150],
        ["orgao", 1, 10],
        ["unidade", 2, 150],
        ["unidade", 1, 10],
      ],
    );
  });
  it("aplica o vínculo gravado (sem sugestão) e sugere para os não vinculados", () => {
    const sme = linhas.find((l) => l.texto.startsWith("2 -"));
    assert.equal(sme?.alvoId, 16); // a escolha do usuário prevalece sobre a sugestão
    assert.equal(sme?.sugestaoId, null);
    assert.equal(sme?.contexto, "FUNDO MUNICIPAL DE EDUCACAO DE RIO VERDE");
    assert.equal(linhas.find((l) => l.texto === "26 - FMACL")?.sugestaoId, 26);
  });
  it("mapa/alvoDoTexto resolvem pelo texto normalizado; alvo null não entra", () => {
    const m = mapaVinculos([...vinc, { tipo: "orgao", chave: "X", texto: "X", alvoId: null }]);
    assert.equal(alvoDoTexto(m, "unidade", "2 - secretaria municipal de educacao"), 16);
    assert.equal(alvoDoTexto(m, "orgao", "X"), null);
    assert.equal(alvoDoTexto(m, "unidade", null), null);
  });
});

describe("vinculosOrcamentoSchema", () => {
  it("aceita vincular e desvincular", () => {
    const r = vinculosOrcamentoSchema.safeParse({ vinculos: [{ tipo: "orgao", texto: "FUNDO", alvoId: 1 }, { tipo: "unidade", texto: "2 - SME", alvoId: null }] });
    assert.equal(r.success, true);
  });
  it("recusa tipo inválido, texto vazio, lista vazia e acima de 200", () => {
    assert.equal(vinculosOrcamentoSchema.safeParse({ vinculos: [{ tipo: "x", texto: "A", alvoId: 1 }] }).success, false);
    assert.equal(vinculosOrcamentoSchema.safeParse({ vinculos: [{ tipo: "orgao", texto: "  ", alvoId: 1 }] }).success, false);
    assert.equal(vinculosOrcamentoSchema.safeParse({ vinculos: [] }).success, false);
    const muitos = Array.from({ length: 201 }, (_, i) => ({ tipo: "orgao", texto: `T${i}`, alvoId: 1 }));
    assert.equal(vinculosOrcamentoSchema.safeParse({ vinculos: muitos }).success, false);
  });
});
