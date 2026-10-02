import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vinculosOrcamentoSchema } from "../src/lib/orcamento-validation.ts";
import {
  chaveVinculo,
  comVinculos,
  lerAcoesFora,
  linhasVinculo,
  mapaVinculos,
  nomeSemCodigo,
  SEM_ACAO,
  SEM_VINCULO_ORC,
  sugerirAlvo,
  unidadeDoLancamento,
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

describe("orcamento-vinculo — linhas da tela (só UNIDADES + as ações)", () => {
  const lanc = [
    { orgao: "FUNDO MUNICIPAL DE EDUCACAO DE RIO VERDE", unidade: "2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO", acao: "2010 ENSINO", valorInicial: 100 },
    { orgao: "FUNDO MUNICIPAL DE EDUCACAO DE RIO VERDE", unidade: "2 - Secretaria Municipal de Educação", acao: "2011 Transporte", valorInicial: 50 },
    { orgao: "PREFEITURA", unidade: "26 - FMACL", acao: null, valorInicial: 10 },
    { orgao: null, unidade: "  ", acao: "X", valorInicial: 5 },
  ];
  const vinc = [{ chave: chaveVinculo("2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO"), texto: "x", alvoId: 16, acoesFora: [chaveVinculo("2011 TRANSPORTE"), "ACAO QUE SUMIU"] }];
  const linhas = linhasVinculo(lanc, vinc, UNIDADES);

  it("só unidades (o órgão não se vincula), soma lançamentos e dotação, ignora vazio", () => {
    assert.deepEqual(
      linhas.map((l) => [l.texto, l.lancamentos, l.valorInicial]),
      [
        ["2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO", 2, 150],
        ["26 - FMACL", 1, 10],
      ],
    );
  });
  it("as AÇÕES de cada unidade, com as de fora só as que existem; ação vazia vira '—'", () => {
    const sme = linhas[0];
    assert.deepEqual(
      sme.acoes.map((a) => [a.texto, a.lancamentos, a.valorInicial]),
      [
        ["2010 ENSINO", 1, 100],
        ["2011 Transporte", 1, 50],
      ],
    );
    assert.deepEqual(sme.acoesFora, [chaveVinculo("2011 Transporte")]);
    assert.deepEqual(linhas[1].acoes.map((a) => a.chave), [SEM_ACAO]);
  });
  it("aplica o vínculo gravado (sem sugestão) e sugere para os não vinculados", () => {
    assert.equal(linhas[0].alvoId, 16); // a escolha do usuário prevalece sobre a sugestão
    assert.equal(linhas[0].sugestaoId, null);
    assert.equal(linhas[0].contexto, "FUNDO MUNICIPAL DE EDUCACAO DE RIO VERDE");
    assert.equal(linhas[1].sugestaoId, 26);
  });
  it("o lançamento só vai à unidade se a AÇÃO dele entra; alvo null não entra", () => {
    const m = mapaVinculos([...vinc, { chave: "X", texto: "X", alvoId: null, acoesFora: [] }]);
    assert.equal(unidadeDoLancamento(m, "2 - secretaria municipal de educacao", "2010 ensino"), 16);
    assert.equal(unidadeDoLancamento(m, "2 - secretaria municipal de educacao", "2011 TRANSPORTE"), null, "ação de fora");
    assert.equal(unidadeDoLancamento(m, "X", "Y"), null);
    assert.equal(unidadeDoLancamento(m, null, null), null);
  });
  it("comVinculos: Unidade e Órgão do CADASTRO (o órgão = o dono da unidade vinculada)", () => {
    const r = comVinculos(lanc, vinc, { orgaos: ORGAOS, unidades: UNIDADES });
    assert.deepEqual(
      r.map((x) => [x.unidadeSistema, x.orgaoSistema]),
      [
        ["SMS — Secretaria Municipal de Saúde", "PMRV — Prefeitura Municipal de Rio Verde"],
        [SEM_VINCULO_ORC, SEM_VINCULO_ORC],
        [SEM_VINCULO_ORC, SEM_VINCULO_ORC],
        [SEM_VINCULO_ORC, SEM_VINCULO_ORC],
      ],
    );
  });
  it("lerAcoesFora tolera qualquer coisa", () => {
    assert.deepEqual(lerAcoesFora('["A","A","",1]'), ["A"]);
    assert.deepEqual(lerAcoesFora("x"), []);
    assert.deepEqual(lerAcoesFora(null), []);
  });
});

describe("vinculosOrcamentoSchema", () => {
  it("aceita vincular e desvincular, com as ações de fora (padrão: nenhuma)", () => {
    const r = vinculosOrcamentoSchema.safeParse({ vinculos: [{ texto: "FUNDO", alvoId: 1, acoesFora: ["2011"] }, { texto: "2 - SME", alvoId: null }] });
    assert.equal(r.success, true);
    assert.deepEqual(r.success && r.data.vinculos[1].acoesFora, []);
  });
  it("recusa texto vazio, lista vazia e acima de 200", () => {
    assert.equal(vinculosOrcamentoSchema.safeParse({ vinculos: [{ texto: "  ", alvoId: 1 }] }).success, false);
    assert.equal(vinculosOrcamentoSchema.safeParse({ vinculos: [] }).success, false);
    const muitos = Array.from({ length: 201 }, (_, i) => ({ texto: `T${i}`, alvoId: 1 }));
    assert.equal(vinculosOrcamentoSchema.safeParse({ vinculos: muitos }).success, false);
  });
});
