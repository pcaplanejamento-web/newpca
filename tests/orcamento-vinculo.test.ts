import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criarVinculosOrcamentoSchema, editarVinculoOrcamentoSchema } from "../src/lib/orcamento-validation.ts";
import {
  alvosDaUnidade,
  chaveVinculo,
  comVinculos,
  conflitoVinculo,
  lerListaAcoes,
  linhasVinculos,
  mapaVinculos,
  nomeSemCodigo,
  SEM_ACAO,
  SEM_VINCULO_ORC,
  semVinculo,
  sugerirAlvo,
  unidadeDoLancamento,
  unidadesDoOrcamento,
  type VinculoOrcamento,
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

describe("orcamento-vinculo — vínculos CRIADOS (uma unidade do CUBO → várias cadastradas)", () => {
  const SAUDE = "2 - SECRETARIA MUNICIPAL DE SAÚDE";
  const lanc = [
    { orgao: "FUNDO MUNICIPAL DE SAUDE", unidade: SAUDE, acao: "2001 Atenção Básica", valorInicial: 100 },
    { orgao: "FUNDO MUNICIPAL DE SAUDE", unidade: SAUDE, acao: "2002 Vigilância", valorInicial: 50 },
    { orgao: "FUNDO MUNICIPAL DE SAUDE", unidade: SAUDE, acao: "2003 Hospital", valorInicial: 30 },
    { orgao: "PREFEITURA", unidade: "26 - FMACL", acao: null, valorInicial: 10 },
    { orgao: null, unidade: "  ", acao: "X", valorInicial: 5 },
  ];
  const k = chaveVinculo(SAUDE);
  const v = (id: number, alvoId: number, acoes: string[] | null, acoesFora: string[] = []): VinculoOrcamento => ({ id, chave: k, texto: SAUDE, alvoId, acoes, acoesFora });
  // As DEMAIS → SMS (menos o hospital); a vigilância → outra unidade (explícita vence as demais).
  const vinc = [v(1, 16, null, [chaveVinculo("2003 Hospital")]), v(2, 15, [chaveVinculo("2002 Vigilância")])];
  const unidades = unidadesDoOrcamento(lanc);

  it("as unidades do orçamento com as ações (vazia ignorada; ação vazia = '—')", () => {
    assert.deepEqual(unidades.map((u) => [u.texto, u.lancamentos, u.valorInicial, u.acoes.length]), [
      [SAUDE, 3, 180, 3],
      ["26 - FMACL", 1, 10, 1],
    ]);
    assert.equal(unidades[1].acoes[0].chave, SEM_ACAO);
  });
  it("cada AÇÃO vai a UMA unidade: a explícita vence as demais; a de fora fica sem vínculo", () => {
    const m = mapaVinculos(vinc);
    assert.equal(unidadeDoLancamento(m, SAUDE, "2001 ATENÇÃO BÁSICA"), 16);
    assert.equal(unidadeDoLancamento(m, SAUDE, "2002 vigilância"), 15);
    assert.equal(unidadeDoLancamento(m, SAUDE, "2003 Hospital"), null);
    assert.equal(unidadeDoLancamento(m, "26 - FMACL", null), null);
    assert.deepEqual(alvosDaUnidade(m, SAUDE).sort(), [15, 16]);
  });
  it("linhasVinculos: as ações e a dotação que cada vínculo leva neste orçamento", () => {
    const l = linhasVinculos(unidades, vinc);
    assert.deepEqual(
      l.map((x) => [x.vinculo.id, x.acoes.map((a) => a.texto), x.valorInicial]),
      [
        [1, ["2001 Atenção Básica"], 100],
        [2, ["2002 Vigilância"], 50],
      ],
    );
  });
  it("semVinculo: as ações que faltam (sem sugestão quando a unidade já tem vínculo) e a sugestão das sem nenhum", () => {
    const p = semVinculo(unidades, vinc, UNIDADES);
    assert.deepEqual(
      p.map((x) => [x.unidade.texto, x.acoes.map((a) => a.texto), x.valorInicial, x.vinculada, x.sugestaoId]),
      [
        [SAUDE, ["2003 Hospital"], 30, true, null],
        ["26 - FMACL", [SEM_ACAO], 10, false, 26],
      ],
    );
  });
  it("conflitoVinculo: uma cadastrada por vez, um só 'com as demais', lista não vazia e sem ação repetida", () => {
    const outros = [{ alvoId: 16, acoes: null }, { alvoId: 15, acoes: ["A"] }];
    assert.match(conflitoVinculo(outros, { alvoId: 16, acoes: ["B"] }) ?? "", /já tem um vínculo/);
    assert.match(conflitoVinculo(outros, { alvoId: 26, acoes: null }) ?? "", /DEMAIS/);
    assert.match(conflitoVinculo(outros, { alvoId: 26, acoes: [] }) ?? "", /ao menos uma/);
    assert.match(conflitoVinculo(outros, { alvoId: 26, acoes: ["A"] }, () => "Ação A") ?? "", /"Ação A" já está/);
    assert.equal(conflitoVinculo(outros, { alvoId: 26, acoes: ["B"] }), null);
    assert.equal(conflitoVinculo([], { alvoId: 26, acoes: null }), null);
  });
  it("comVinculos: Unidade e Órgão do CADASTRO por ação", () => {
    const r = comVinculos(lanc, vinc, { orgaos: ORGAOS, unidades: UNIDADES });
    assert.deepEqual(
      r.map((x) => x.unidadeSistema),
      ["SMS — Secretaria Municipal de Saúde", "SME — Secretaria Municipal de Educação", SEM_VINCULO_ORC, SEM_VINCULO_ORC, SEM_VINCULO_ORC],
    );
    assert.equal(r[0].orgaoSistema, "PMRV — Prefeitura Municipal de Rio Verde");
  });
  it("lerListaAcoes: null = as demais; tolera lixo", () => {
    assert.equal(lerListaAcoes(null), null);
    assert.deepEqual(lerListaAcoes('["A","A","",1]'), ["A"]);
    assert.equal(lerListaAcoes("x"), null);
  });
});

describe("schemas dos vínculos", () => {
  it("criar: vários, com ações explícitas ou as demais (padrão sem fora); recusa vazio e acima de 200", () => {
    const r = criarVinculosOrcamentoSchema.safeParse({ vinculos: [{ texto: "A", alvoId: 1, acoes: ["2001"] }, { texto: "B", alvoId: 2, acoes: null }] });
    assert.equal(r.success, true);
    assert.deepEqual(r.success && r.data.vinculos[1].acoesFora, []);
    assert.equal(criarVinculosOrcamentoSchema.safeParse({ vinculos: [{ texto: " ", alvoId: 1, acoes: null }] }).success, false);
    assert.equal(criarVinculosOrcamentoSchema.safeParse({ vinculos: [{ texto: "A", alvoId: null, acoes: null }] }).success, false, "o vínculo tem unidade");
    assert.equal(criarVinculosOrcamentoSchema.safeParse({ vinculos: [] }).success, false);
    const muitos = Array.from({ length: 201 }, (_, i) => ({ texto: `T${i}`, alvoId: 1, acoes: null }));
    assert.equal(criarVinculosOrcamentoSchema.safeParse({ vinculos: muitos }).success, false);
  });
  it("editar: a unidade e as ações", () => {
    assert.equal(editarVinculoOrcamentoSchema.safeParse({ alvoId: 3, acoes: null, acoesFora: ["X"] }).success, true);
    assert.equal(editarVinculoOrcamentoSchema.safeParse({ acoes: null }).success, false);
  });
});
