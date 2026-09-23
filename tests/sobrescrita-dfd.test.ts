import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compararDfd } from "../src/lib/comparar-protocolo.ts";
import type { Assinatura, DfdItemParseado, DfdParseado } from "../src/lib/parse-dfd-comum.ts";
import {
  aplicarEscolha,
  aplicarTodas,
  blocoDe,
  comparacaoEscolha,
  entradasEscolha,
  estadoEscolha,
  listaCurta,
  marcarItensNovos,
  resumoEscolhas,
  semMarcas,
} from "../src/lib/sobrescrita-dfd.ts";

const item = (n: number, codigo: string, quantidade: number, valorUnitario = 10): DfdItemParseado => ({
  item: n,
  codigo,
  descricao: `ITEM ${codigo}`,
  unidade: "UN",
  quantidade,
  valorUnitario,
  valorTotal: quantidade * valorUnitario,
});
const ass = (nome: string, data: string): Assinatura => ({ nome, eCpf: "", usuario: "", local: "", data, ip: "", codigo: "", url: "", fonte: "certificado" });

function dfd(p: Partial<DfdParseado>): DfdParseado {
  const itens = p.itens ?? [];
  const soma = itens.reduce((t, it) => t + (it.valorTotal ?? 0), 0);
  return {
    numero: "1525",
    planejamento: "640",
    tipo: "DFD-S — Solução",
    objeto: "AQUISIÇÃO",
    orgaoEntidade: "PREFEITURA",
    setorRequisitante: "SMIR",
    siglaSetor: "SMIR",
    responsavel: "FULANO",
    matricula: null,
    email: null,
    telefone: null,
    anoPca: 2027,
    numeroContrato: null,
    numeroAta: null,
    numeroLicitacao: null,
    nomeArquivo: "dfd.pdf",
    secoes: [
      { numero: 3, titulo: "3 - JUSTIFICATIVA", texto: "Justificativa gravada." },
      { numero: 6, titulo: "6 - PRIORIDADE", texto: "ALTA" },
    ],
    itens: [],
    assinaturas: [ass("FULANO", "01/03/2026 10:00:00")],
    ...p,
    // O valor do DFD é SEMPRE a soma dos itens (como no parse real).
    valorTotal: soma > 0 ? soma : null,
  };
}

// Gravado: itens 1 (qtd 5), 2 (qtd 3). Novo: item 1 (qtd 8 — alterado), 3 (novo); o 2 saiu (removido).
const gravado = dfd({ objeto: "AQUISIÇÃO", itens: [item(1, "111", 5), item(2, "222", 3)] });
const novo = dfd({
  objeto: "AQUISIÇÃO DE SERVIÇO",
  secoes: [
    { numero: 3, titulo: "3 - JUSTIFICATIVA", texto: "Justificativa NOVA." },
    { numero: 6, titulo: "6 - PRIORIDADE", texto: "ALTA" },
    { numero: 7, titulo: "7 - FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
  ],
  itens: [item(1, "111", 8), item(3, "333", 2)],
  assinaturas: [ass("BELTRANO", "05/03/2026 09:00:00")],
});

describe("sobrescrita com escolha — entradas e estado", () => {
  const c = comparacaoEscolha(gravado, novo);
  const entradas = entradasEscolha(c);
  const porChave = (k: string) => {
    const e = entradas.find((x) => x.chave === k);
    assert.ok(e, `entrada ausente: ${k}`);
    return e;
  };

  it("cada diferença vira uma escolha (campo, seção, assinaturas, item novo/alterado/removido)", () => {
    const chaves = entradas.map((e) => e.chave);
    assert.ok(chaves.includes("objeto"));
    assert.ok(chaves.includes("assinaturas"));
    assert.ok(chaves.some((k) => k.startsWith("secao:")));
    assert.ok(chaves.includes("a:0:0"), "item 1 alterado");
    assert.ok(chaves.includes("n:1"), "item 3 novo");
    assert.ok(chaves.includes("r:1"), "item 2 removido");
    // O valor total (Σ itens) não é escolha nem diferença do arquivo — segue os itens escolhidos.
    assert.ok(!chaves.includes("valorTotal"));
    assert.ok(!c.campos.some((d) => d.campo === "valorTotal"));
    assert.equal(c.total, entradas.length + c.campos.filter((d) => !entradas.some((e) => e.chave === d.campo)).length);
    assert.equal(blocoDe(porChave("objeto")), "cabecalho");
    assert.equal(blocoDe(porChave("a:0:0")), "itens");
  });

  it("partida = tudo NOVO; manter o gravado copia o valor dele; editar à mão = 'editado'", () => {
    let w = marcarItensNovos(novo);
    const obj = porChave("objeto");
    assert.equal(estadoEscolha(obj, w, gravado, novo), "novo");
    w = aplicarEscolha(obj, "gravado", w, gravado, novo);
    assert.equal(w.objeto, "AQUISIÇÃO");
    assert.equal(estadoEscolha(obj, w, gravado, novo), "gravado");
    w = { ...w, objeto: "OUTRO OBJETO" };
    assert.equal(estadoEscolha(obj, w, gravado, novo), "editado");
    w = aplicarEscolha(obj, "novo", w, gravado, novo);
    assert.equal(w.objeto, "AQUISIÇÃO DE SERVIÇO");
  });

  it("seção: manter a gravada troca o texto; a que só o novo tem pode sair", () => {
    let w = marcarItensNovos(novo);
    const just = entradas.find((e) => e.tipo === "secao" && e.rotulo.includes("JUSTIFICATIVA"));
    const fund = entradas.find((e) => e.tipo === "secao" && e.rotulo.includes("FUNDAMENTA"));
    assert.ok(just && fund);
    w = aplicarEscolha(just, "gravado", w, gravado, novo);
    assert.equal(w.secoes.find((s) => s.numero === 3)?.texto, "Justificativa gravada.");
    assert.equal(estadoEscolha(just, w, gravado, novo), "gravado");
    // A fundamentação só existe no novo: "manter o gravado" = sem ela.
    w = aplicarEscolha(fund, "gravado", w, gravado, novo);
    assert.equal(w.secoes.some((s) => s.numero === 7), false);
    assert.equal(estadoEscolha(fund, w, gravado, novo), "gravado");
    // Voltar ao novo recoloca a seção na ORDEM pelo número.
    w = aplicarEscolha(fund, "novo", w, gravado, novo);
    assert.deepEqual(
      w.secoes.map((s) => s.numero),
      [3, 6, 7],
    );
  });

  it("itens: alterado volta ao gravado, o novo sai, o removido volta — total recalculado", () => {
    let w = marcarItensNovos(novo);
    assert.equal(estadoEscolha(porChave("a:0:0"), w, gravado, novo), "novo");
    assert.equal(estadoEscolha(porChave("n:1"), w, gravado, novo), "novo");
    assert.equal(estadoEscolha(porChave("r:1"), w, gravado, novo), "novo"); // removido = ausente no trabalho
    w = aplicarEscolha(porChave("a:0:0"), "gravado", w, gravado, novo);
    assert.equal(w.itens.find((i) => i.codigo === "111")?.quantidade, 5);
    w = aplicarEscolha(porChave("n:1"), "gravado", w, gravado, novo);
    assert.equal(w.itens.some((i) => i.codigo === "333"), false);
    w = aplicarEscolha(porChave("r:1"), "gravado", w, gravado, novo);
    assert.deepEqual(
      w.itens.map((i) => i.codigo),
      ["111", "222"],
    );
    assert.equal(w.valorTotal, 80); // 5×10 + 3×10
    for (const k of ["a:0:0", "n:1", "r:1"]) assert.equal(estadoEscolha(porChave(k), w, gravado, novo), "gravado");
    // Um item editado à mão (quantidade) = "editado".
    const i222 = w.itens.findIndex((i) => i.codigo === "222");
    w = { ...w, itens: w.itens.map((it, k) => (k === i222 ? { ...it, quantidade: 99 } : it)) };
    assert.equal(estadoEscolha(porChave("r:1"), w, gravado, novo), "editado");
  });

  it("MANTER TUDO do gravado = o gravado (sem diferenças); resumo p/ o histórico", () => {
    const w = aplicarTodas(entradas, "gravado", marcarItensNovos(novo), gravado, novo);
    const cmp = compararDfd({ ...gravado, reparticaoId: null, anoPca: null }, { ...semMarcas(w), reparticaoId: null, anoPca: null });
    assert.equal(cmp.situacao, "igual");
    const r = resumoEscolhas(entradas, w, gravado, novo);
    assert.equal(r.novos, 0);
    assert.equal(r.editados.length, 0);
    assert.equal(r.mantidos.length, entradas.length);
    const t = aplicarTodas(entradas, "novo", w, gravado, novo);
    assert.equal(resumoEscolhas(entradas, t, gravado, novo).novos, entradas.length);
  });

  it("semMarcas tira a origem dos itens (não vai ao servidor); lista curta", () => {
    const w = marcarItensNovos(novo);
    assert.ok(w.itens.every((i) => i.ref));
    assert.ok(semMarcas(w).itens.every((i) => !("ref" in i)));
    assert.equal(listaCurta(["A", "B", "C"], 2), "A, B e mais 1");
  });
});
