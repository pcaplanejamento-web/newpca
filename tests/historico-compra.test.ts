import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogoOpSchema, compraHistoricoSchema, contratoHistoricoSchema, patchCatalogoSchema, pastaCatalogoSchema } from "../src/lib/catalogo-validation.ts";
import {
  COR_PADRAO_CATALOGO,
  corDoCatalogo,
  dataHistorico,
  LIMITES_HISTORICO,
  lerCsv,
  nomeSugeridoHistorico,
  numeroHistorico,
  parseHistoricoCompra,
  produtosDoHistorico,
  resumoHistorico,
  rotuloVariacao,
  valorAtualNoContrato,
  textoHistorico,
  tipoCatalogo,
} from "../src/lib/historico-compra-core.ts";

// O CABEÇALHO real do export do sistema de compras (o CUBO de contratos), com o ";" final.
const CAB =
  "Id Licitação;Órgão;Número Licitação;Processo de Compras;Id Contrato;Número Contrato;Credor;Unidade Gestora;Valor Contrato;Data Assinatura;Data Publicação;Modalidade Licitação;Protocolo;Objeto;Id Produto;Sequencial;Descricao Produto;Quantidade Contratada;Quantidade Aditada;Quantidade Empenhada;Quant. OF Empenhar;Saldo a Empenhar;Valor Unitário;Valor Contratado;Valor Empenhado;Saldo Valor a Empenhar;Qtd. Liquidado;Qtd. Liquidado Anulado;Qtd. Empenhado Anulado;Saldo Liquidar;Natureza objeto;Detalhamento natureza objeto;";

function linha(o: { contrato: string; credor: string; data: string; produto: string; seq: string; desc: string; qtd: string; unit: string; total: string; processo?: string; empenhado?: string }) {
  return [
    "19231",
    "PREFEITURA MUNICIPAL DE RIO VERDE",
    "93",
    o.processo ?? "47604",
    o.contrato,
    "41",
    o.credor,
    "",
    "23681.22",
    o.data,
    "27/02/2026",
    "PREGÃO",
    "9770/2026",
    "CONTRATO 074/2026$$ TEM COMO OBJETO A AQUISIÇÃO DE SALGADOS$$ SUCOS",
    o.produto,
    o.seq,
    o.desc,
    o.qtd,
    "0.00",
    o.empenhado ?? "",
    "",
    "",
    o.unit,
    o.total,
    o.empenhado ? o.total : "",
    "",
    "",
    "",
    "",
    "",
    "Demais aquisições (excluídas as de engenharia)",
    "Aquisição de gêneros alimentícios",
    "",
  ].join(";");
}

const A = { contrato: "26109", credor: "PANIFICADORA DOIS IRMAOS LTDA.", data: "23/02/2026" };
const B = { contrato: "26110", credor: "MERCADO BOM PRECO LTDA.", data: "10/08/2026" };
const CSV = [
  `﻿${CAB}`,
  linha({ ...A, produto: "14158863", seq: "2", desc: "BISCOITO DE QUEIJO", qtd: "10.0000", unit: "30.490000", total: "304.900000", empenhado: "10.0000" }),
  linha({ ...A, produto: "114161324", seq: "3", desc: "Bolinha de queijo com no mínimo 0$$20 gr", qtd: "5.0000", unit: "74.230000", total: "371.150000" }),
  // Repetida IDÊNTICA pelo export (sai).
  linha({ ...A, produto: "114161324", seq: "3", desc: "Bolinha de queijo com no mínimo 0$$20 gr", qtd: "5.0000", unit: "74.230000", total: "371.150000" }),
  // O mesmo produto em OUTRO contrato, mais caro e mais recente.
  linha({ ...B, produto: "14158863", seq: "1", desc: "BISCOITO DE QUEIJO", qtd: "30.0000", unit: "34.490000", total: "1034.700000" }),
  // Mesma chave, OUTRO processo — não é repetição.
  linha({ ...A, produto: "14158863", seq: "2", desc: "BISCOITO DE QUEIJO", qtd: "10.0000", unit: "30.490000", total: "304.900000", processo: "47605", empenhado: "10.0000" }),
  // Sem código → fora.
  linha({ ...A, produto: "", seq: "9", desc: "SEM CÓDIGO", qtd: "1", unit: "1", total: "1" }),
  "",
].join("\r\n");

describe("histórico de compra — leitura do export do sistema de compras", () => {
  const r = parseHistoricoCompra(lerCsv(CSV));

  it("acha as colunas pelo cabeçalho, tira as linhas repetidas e as sem código", () => {
    assert.deepEqual(r.faltando, []);
    assert.equal(r.itens.length, 4);
    assert.equal(r.repetidas, 1);
    assert.equal(r.ignoradas, 1);
    assert.equal(r.contratos.length, 2);
    assert.equal(r.ano, 2026);
    assert.deepEqual(
      r.itens.map((i) => i.ordem),
      [0, 1, 2, 3],
    );
  });

  it("o $$ volta a ser vírgula; números, datas e o contrato vêm convertidos", () => {
    assert.equal(r.itens[1].descricao, "Bolinha de queijo com no mínimo 0,20 gr");
    assert.equal(r.contratos[0].objeto, "CONTRATO 074/2026, TEM COMO OBJETO A AQUISIÇÃO DE SALGADOS, SUCOS");
    assert.equal(r.contratos[0].dataAssinatura, "2026-02-23");
    assert.equal(r.contratos[0].unidadeGestora, null);
    assert.equal(r.itens[0].valorUnitario, 30.49);
    assert.equal(r.itens[0].qtdContratada, 10);
    assert.equal(r.itens[1].qtdEmpenhada, null, "vazio = null, nunca zero inventado");
    assert.equal(r.itens[0].sequencial, 2);
    assert.equal(r.itens[3].processo, "47605");
  });

  it("os dados lidos passam no Zod da gravação", () => {
    for (const c of r.contratos) assert.ok(contratoHistoricoSchema.safeParse(c).success);
    for (const i of r.itens) assert.ok(compraHistoricoSchema.safeParse(i).success);
  });

  it("arquivo sem as colunas obrigatórias diz quais faltam", () => {
    const x = parseHistoricoCompra([["Código", "Descrição", "Unidade"], ["1", "A", "UN"]]);
    assert.deepEqual(x.faltando, ["Id Contrato", "Id Produto", "Descricao Produto", "Valor Unitário"]);
    assert.equal(x.itens.length, 0);
  });

  it("texto longo é cortado na mesma régua do Zod (o arquivo nunca é recusado)", () => {
    const longa = "X".repeat(LIMITES_HISTORICO.descricao + 50);
    const m = lerCsv(`${CAB}\n${linha({ ...A, produto: "1", seq: "1", desc: longa, qtd: "1", unit: "1", total: "1" })}`);
    const x = parseHistoricoCompra(m);
    assert.equal(x.itens[0].descricao.length, LIMITES_HISTORICO.descricao);
    assert.ok(compraHistoricoSchema.safeParse(x.itens[0]).success);
  });
});

describe("histórico de compra — conversões", () => {
  it("CSV com aspas, separador no campo e quebra dentro das aspas", () => {
    assert.deepEqual(lerCsv('a;b;c\n1;"x;y";"linha\n2"\n'), [
      ["a", "b", "c"],
      ["1", "x;y", "linha\n2"],
    ]);
    assert.deepEqual(lerCsv('a,b\n"1 ""q""",2'), [
      ["a", "b"],
      ['1 "q"', "2"],
    ]);
  });
  it("números en/pt-BR e vazio", () => {
    assert.equal(numeroHistorico("10.0000"), 10);
    assert.equal(numeroHistorico("1.234,56"), 1234.56);
    assert.equal(numeroHistorico("R$ 5,5"), 5.5);
    assert.equal(numeroHistorico(""), null);
    assert.equal(numeroHistorico("abc"), null);
    assert.equal(numeroHistorico(7), 7);
  });
  it("datas dd/mm/aaaa, ISO, série da planilha; inválida = null", () => {
    assert.equal(dataHistorico("09/09/2026"), "2026-09-09");
    assert.equal(dataHistorico("2026-01-08"), "2026-01-08");
    assert.equal(dataHistorico(46000), "2025-12-09");
    assert.equal(dataHistorico("31/02/2026"), null);
    assert.equal(dataHistorico(""), null);
  });
  it("texto: $$, espaços e vazio", () => {
    assert.equal(textoHistorico("  A$$ B  "), "A, B");
    assert.equal(textoHistorico("   "), null);
  });
});

describe("histórico de compra — análise por produto", () => {
  const r = parseHistoricoCompra(lerCsv(CSV));
  const p = produtosDoHistorico(r.itens, r.contratos);

  it("um por código, na ordem do maior valor contratado", () => {
    assert.deepEqual(
      p.map((x) => x.codigo),
      ["14158863", "114161324"],
    );
  });
  it("valor atual no contrato: um preço = ele (linhas iguais não somam); dois = o menor (aditivo) somado ao maior", () => {
    assert.deepEqual(valorAtualNoContrato([30.49, 30.49]), { valor: 30.49, base: 30.49, menor: 30.49, aditivo: null });
    assert.deepEqual(valorAtualNoContrato([8.75, 0.8]), { valor: 9.55, base: 8.75, menor: 0.8, aditivo: 0.8 });
    assert.deepEqual(valorAtualNoContrato([0.8, null, 8.75, 0]), { valor: 9.55, base: 8.75, menor: 0.8, aditivo: 0.8 });
    assert.equal(valorAtualNoContrato([null, 0]), null);
  });
  it("menor, maior e médio ENTRE contratos (valor atual de cada um) e o valor atual = o do contrato assinado por último", () => {
    const b = p[0];
    assert.equal(b.linhas, 3);
    assert.equal(b.contratos, 2);
    assert.equal(b.credores, 2);
    assert.equal(b.quantidade, 50);
    assert.equal(b.menor, 30.49);
    assert.equal(b.maior, 34.49);
    assert.ok(Math.abs((b.medio ?? 0) - (30.49 + 34.49) / 2) < 1e-9, "média simples dos contratos, não das linhas");
    assert.deepEqual(b.atual, { idContrato: b.porContrato[0].idContrato, valor: 34.49, base: 34.49, menor: 34.49, aditivo: null, quantidade: 30, linhas: 1, data: "2026-08-10", credor: "MERCADO BOM PRECO LTDA." });
    assert.deepEqual(
      b.porContrato.map((x) => x.data),
      ["2026-08-10", "2026-02-23"],
    );
    assert.ok(Math.abs(b.valorTotal - (304.9 * 2 + 1034.7)) < 1e-6);
  });
  it("aditivo: o contrato mais recente com aditivo é o valor atual (base + aditivo) e entra assim na média", () => {
    const base = r.itens[0];
    const itens = [
      { ...base, ordem: 0, codigo: "9", idContrato: r.contratos[0].idContrato, valorUnitario: 10 },
      { ...base, ordem: 1, codigo: "9", idContrato: r.contratos[1].idContrato, valorUnitario: 8.75 },
      { ...base, ordem: 2, codigo: "9", idContrato: r.contratos[1].idContrato, valorUnitario: 0.8 },
    ];
    const [x] = produtosDoHistorico(itens, r.contratos);
    assert.ok(Math.abs((x.atual?.valor ?? 0) - 9.55) < 1e-9);
    assert.equal(x.atual?.aditivo, 0.8);
    assert.deepEqual([x.atual?.menor, x.atual?.base, x.atual?.linhas], [0.8, 8.75, 2], "menor e maior DENTRO do contrato");
    assert.equal(x.menor, 9.55);
    assert.equal(x.maior, 10);
    assert.equal(x.contratoMenor?.idContrato, r.contratos[1].idContrato, "o contrato do menor valor (com o aditivo)");
    assert.equal(x.contratoMaior?.idContrato, r.contratos[0].idContrato, "o contrato do maior valor");
    assert.ok(Math.abs((x.medio ?? 0) - 9.775) < 1e-9);
  });
  it("quantidade no contrato: só as linhas no preço base (a do aditivo repete a quantidade); linhas iguais somam", () => {
    const base = r.itens[0];
    const c = r.contratos[0].idContrato;
    const [x] = produtosDoHistorico(
      [
        { ...base, ordem: 0, codigo: "7", idContrato: c, valorUnitario: 8.75, qtdContratada: 115000 },
        { ...base, ordem: 1, codigo: "7", idContrato: c, valorUnitario: 0.8, qtdContratada: 102160 },
      ],
      r.contratos,
    );
    assert.equal(x.atual?.quantidade, 115000);
    const [y] = produtosDoHistorico(
      [
        { ...base, ordem: 0, codigo: "8", idContrato: c, valorUnitario: 30.49, qtdContratada: 10 },
        { ...base, ordem: 1, codigo: "8", idContrato: c, valorUnitario: 30.49, qtdContratada: 8 },
      ],
      r.contratos,
    );
    assert.deepEqual([y.atual?.quantidade, y.atual?.valor], [18, 30.49]);
  });
  it("variação entre contratos (a régua da Consolidada) e o rótulo do filtro", () => {
    assert.ok(Math.abs((p[0].variacao ?? 0) - 0.08705) < 1e-3, "30,49 × 34,49 — um preço por contrato");
    assert.equal(p[1].variacao, null, "1 preço = sem comparação");
    assert.equal(rotuloVariacao(0.6), "Alta (acima de 50%)");
    assert.equal(rotuloVariacao(0.3), "Atenção (25% a 50%)");
    assert.equal(rotuloVariacao(0.1), "Homogênea (até 25%)");
    assert.equal(rotuloVariacao(null), "Sem comparação (1 preço)");
  });
  it("resumo do topo", () => {
    const s = resumoHistorico(r.itens, r.contratos);
    assert.equal(s.contratos, 2);
    assert.equal(s.produtos, 2);
    assert.equal(s.credores, 2);
    assert.equal(s.de, "2026-02-23");
    assert.equal(s.ate, "2026-08-10");
    assert.ok(Math.abs(s.valorContratado - (304.9 * 2 + 371.15 + 1034.7)) < 1e-6);
  });
  it("escala: 30 mil itens em pouco tempo", () => {
    const itens = Array.from({ length: 30000 }, (_, i) => ({ ...r.itens[0], ordem: i, codigo: String(i % 900), idContrato: String(i % 150) }));
    const t = Date.now();
    assert.equal(produtosDoHistorico(itens, r.contratos).length, 900);
    assert.ok(Date.now() - t < 1500);
  });
});

describe("catálogo — tipos, cores e validação", () => {
  it("tipo desconhecido = agenda; a cor escolhida ou a do tipo", () => {
    assert.equal(tipoCatalogo("historico"), "historico");
    assert.equal(tipoCatalogo(null), "agenda");
    assert.equal(tipoCatalogo("x"), "agenda");
    assert.equal(corDoCatalogo(null, "historico"), COR_PADRAO_CATALOGO.historico);
    assert.equal(corDoCatalogo("#123456", "agenda"), "#123456");
    assert.equal(corDoCatalogo("red", "agenda"), COR_PADRAO_CATALOGO.agenda);
    assert.equal(nomeSugeridoHistorico(2026), "Histórico de compra 2026");
    assert.equal(nomeSugeridoHistorico(null), "Histórico de compra");
  });
  it("start/append do histórico no schema do envio", () => {
    assert.ok(catalogoOpSchema.safeParse({ mode: "start-historico", nome: "H", totalItens: 3, contratos: [] }).success);
    assert.ok(!catalogoOpSchema.safeParse({ mode: "start-historico", nome: "H", totalItens: 0, contratos: [] }).success);
    const ap = catalogoOpSchema.safeParse({ mode: "append-historico", catalogoId: 1, rows: [{ ordem: 0, idContrato: "1", codigo: "12", descricao: "X" }] });
    assert.ok(ap.success);
    assert.ok(!catalogoOpSchema.safeParse({ mode: "append-historico", catalogoId: 1, rows: [{ ordem: 0, idContrato: "1", codigo: "12a", descricao: "X" }] }).success, "código só com dígitos");
  });
  it("pasta e edição do catálogo (cor/pasta)", () => {
    assert.ok(pastaCatalogoSchema.safeParse({ nome: "Gêneros", cor: "#2563EB" }).success);
    assert.ok(!pastaCatalogoSchema.safeParse({ nome: " ", cor: "#2563EB" }).success);
    assert.ok(!pastaCatalogoSchema.safeParse({ nome: "A", cor: "azul" }).success);
    assert.ok(patchCatalogoSchema.safeParse({ pastaId: null }).success, "tirar da pasta");
    assert.ok(patchCatalogoSchema.safeParse({ cor: null }).success, "voltar à cor do tipo");
    assert.ok(!patchCatalogoSchema.safeParse({}).success);
  });
});
