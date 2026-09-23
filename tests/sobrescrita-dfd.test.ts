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
  escolhasParaHistorico,
  estadoEscolha,
  listaCurta,
  MAX_ROTULOS_HISTORICO,
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

describe("sobrescrita com escolha — ordem, seções repetidas, histórico e escala", () => {
  const it2 = (n: number, codigo: string, descricao: string, quantidade: number, valorUnitario = 10): DfdItemParseado => ({
    item: n,
    codigo,
    descricao,
    unidade: "UN",
    quantidade,
    valorUnitario,
    valorTotal: quantidade * valorUnitario,
  });
  const semUnidade = (d: DfdParseado) => ({ ...semMarcas(d), reparticaoId: null, anoPca: null });

  it("a ordem dos itens segue o Nº do item depois das escolhas (manter tudo = o gravado, na ordem)", () => {
    const g = dfd({ itens: [it2(1, "100", "CADEIRA A", 1), it2(2, "200", "MESA", 1), it2(3, "100", "CADEIRA B", 1)] });
    const n = dfd({ itens: [it2(1, "200", "MESA", 1), it2(2, "100", "CADEIRA B", 1)] });
    const nov = marcarItensNovos(n);
    const entradas = entradasEscolha(comparacaoEscolha(g, nov));
    const w = aplicarTodas(entradas, "gravado", nov, g, nov);
    assert.deepEqual(
      w.itens.map((i) => i.item),
      [1, 2, 3],
    );
    assert.equal(compararDfd({ ...g, reparticaoId: null, anoPca: null }, semUnidade(w)).situacao, "igual");
    // Vai e volta: "usar todos os novos" devolve o arquivo novo, na ordem dele.
    const volta = aplicarTodas(entradas, "novo", aplicarTodas(entradas, "gravado", w, g, nov), g, nov);
    assert.deepEqual(
      semMarcas(volta).itens,
      semMarcas(nov).itens,
    );
  });

  it("código+descrição REPETIDOS no gravado: manter tudo continua igual ao gravado", () => {
    const g = dfd({ itens: [it2(1, "100", "CANETA", 5), it2(2, "100", "CANETA", 7), it2(3, "300", "LAPIS", 2)] });
    const n = dfd({ itens: [it2(1, "100", "CANETA", 9), it2(2, "300", "LAPIS", 2)] });
    const nov = marcarItensNovos(n);
    const entradas = entradasEscolha(comparacaoEscolha(g, nov));
    const w = aplicarTodas(entradas, "gravado", nov, g, nov);
    assert.equal(compararDfd({ ...g, reparticaoId: null, anoPca: null }, semUnidade(w)).situacao, "igual");
  });

  it("propriedade (sementes fixas): manter tudo = gravado e usar tudo = novo, sem perder/duplicar itens", () => {
    let seed = 7;
    const rnd = (k: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % k;
    };
    for (let caso = 0; caso < 300; caso++) {
      const base = Array.from({ length: 1 + rnd(8) }, (_, i) => it2(i + 1, String(100 + rnd(4) * 100), `ITEM ${rnd(3)}`, 1 + rnd(5)));
      const g = dfd({ itens: base });
      const n = dfd({
        itens: base
          .filter(() => rnd(4) > 0)
          .map((it) => (rnd(3) === 0 ? { ...it, quantidade: (it.quantidade ?? 0) + 1, valorTotal: ((it.quantidade ?? 0) + 1) * 10 } : it))
          .concat(rnd(2) ? [it2(50 + rnd(5), "999", "NOVO", 1)] : [])
          .map((it, i) => ({ ...it, item: i + 1 })),
      });
      const nov = marcarItensNovos(n);
      const entradas = entradasEscolha(comparacaoEscolha(g, nov));
      // Uma sequência aleatória de escolhas antes do "todos" não deixa resto.
      let w = nov;
      for (const e of entradas) if (rnd(2)) w = aplicarEscolha(e, rnd(2) ? "gravado" : "novo", w, g, nov);
      const tudoG = aplicarTodas(entradas, "gravado", w, g, nov);
      assert.equal(compararDfd({ ...g, reparticaoId: null, anoPca: null }, semUnidade(tudoG)).situacao, "igual", `caso ${caso} (gravado)`);
      const tudoN = aplicarTodas(entradas, "novo", w, g, nov);
      assert.equal(compararDfd({ ...n, reparticaoId: null, anoPca: null }, semUnidade(tudoN)).situacao, "igual", `caso ${caso} (novo)`);
      const refs = tudoN.itens.map((i) => i.ref);
      assert.equal(new Set(refs).size, refs.length, `caso ${caso}: marca repetida`);
      const nums = tudoG.itens.map((i) => i.item ?? 0);
      assert.deepEqual(nums, [...nums].sort((a, b) => a - b), `caso ${caso}: fora de ordem`);
    }
  });

  it("seção com o MESMO título em duas partes volta num bloco só, na ordem da fonte", () => {
    const g = dfd({
      secoes: [
        { numero: 3, titulo: "3 - JUSTIFICATIVA", texto: "Parte B." },
        { numero: 3, titulo: "3 - JUSTIFICATIVA", texto: "Parte A." },
        { numero: 6, titulo: "6 - PRIORIDADE", texto: "ALTA" },
      ],
    });
    const n = dfd({ secoes: [{ numero: 6, titulo: "6 - PRIORIDADE", texto: "ALTA" }] });
    const nov = marcarItensNovos(n);
    const e = entradasEscolha(comparacaoEscolha(g, nov)).find((x) => x.tipo === "secao");
    assert.ok(e);
    const w = aplicarEscolha(e, "gravado", nov, g, nov);
    assert.deepEqual(
      w.secoes.map((s) => s.texto),
      ["Parte B.", "Parte A.", "ALTA"],
    );
    assert.equal(estadoEscolha(e, w, g, nov), "gravado");
  });

  it("histórico: os primeiros rótulos + as quantidades (nunca recusa por excesso); lista curta com o total", () => {
    const muitos = Array.from({ length: 600 }, (_, i) => `Item ${i + 1}`);
    const h = escolhasParaHistorico({ mantidos: muitos, editados: ["x".repeat(300)] });
    assert.ok(h);
    assert.equal(h.mantidos.length, MAX_ROTULOS_HISTORICO);
    assert.equal(h.qtdMantidos, 600);
    assert.equal(h.editados[0].length, 200);
    assert.equal(escolhasParaHistorico({ mantidos: [], editados: [] }), null);
    assert.equal(listaCurta(h.mantidos, 12, h.qtdMantidos), `${h.mantidos.join(", ")} e mais 588`);
    assert.equal(listaCurta(["A", "B"], 12, 5), "A, B e mais 3");
  });
});
