import assert from "node:assert/strict";
import { test } from "node:test";
import { type DadosPesquisaPublica, hrefPublico, indicePublico, lerAbrirPublico, pesquisarPublico } from "../src/lib/pesquisa-publica-core.ts";
import type { ItemRow } from "../src/lib/queries.ts";

const item = (o: Partial<ItemRow>): ItemRow => ({
  id: 1,
  idProduto: "524194727",
  sequencial: 12,
  nomeProduto: "CADEIRA GIRATÓRIA",
  unidadeMedida: "UNIDADE",
  quantidade: 10,
  valorReferencia: 350,
  valorTotal: 3500,
  classificacao: "MOBILIÁRIO",
  dataDesejada: null,
  codigo: "SME",
  municipio: "Secretaria de Educação",
  dfdId: 7,
  dfdNumero: "1234",
  protocoloNumero: "144756/2026",
  itemNumero: 3,
  ...o,
});

const base = (o: Partial<DadosPesquisaPublica> = {}): DadosPesquisaPublica => ({
  pca: { id: 2, nome: "PCA 2027", ano: 2027 },
  vistas: ["dashboard", "consulta"],
  pcas: [{ id: 2, nome: "PCA 2027", ano: 2027 }],
  unidades: [],
  itens: [item({})],
  dfds: [{ id: 7, numero: "1234", planejamento: "1509", tipo: "DFD-O", sigla: "SME", protocoloNumero: "144756/2026", itens: 1, valor: 3500, objeto: "AQUISIÇÃO DE MOBILIÁRIO" }],
  protocolos: [{ id: 9, numero: "144756/2026", assunto: "INCLUSÃO PCA 2027", sigla: "SME", dfds: 1, itens: 1, valor: 3500, idExterno: "2289654", interessado: "SECRETARIA" }],
  documentos: [{ id: 4, nome: "Portaria de nomeação", paginas: 2 }],
  orcamento: [{ chave: "u5", sigla: "SME", nome: "Educação", orgaoSigla: "PMRV", orcamento: 1000, planejado: 500 }],
  ...o,
});

test("links da própria página pública", () => {
  assert.equal(hrefPublico(2, "dashboard"), "/?pca=2");
  assert.equal(hrefPublico(2, "consulta", { abrir: "item:1" }), "/?pca=2&aba=consulta&abrir=item%3A1");
});

test("qualquer coluna do item é pesquisável (texto e número)", () => {
  const ix = indicePublico(base());
  for (const termo of ["cadeira", "giratoria", "mobiliario", "educacao", "524194727", "144756", "1234", "3.500,00"]) {
    const g = pesquisarPublico(ix, termo, "item", 10);
    assert.equal(g[0]?.total, 1, termo);
  }
});

test("DFD, protocolo (Id da capa), documento e orçamento", () => {
  const ix = indicePublico(base({ vistas: ["dashboard", "consulta", "orcamento", "documentos"] }));
  assert.equal(pesquisarPublico(ix, "1509", "dfd", 5)[0].linhas[0].href, "/?pca=2&aba=consulta&abrir=dfd%3A7");
  assert.equal(pesquisarPublico(ix, "2289654", "protocolo", 5)[0].linhas[0].id, 9);
  assert.equal(pesquisarPublico(ix, "portaria", "documento", 5)[0].linhas[0].href, "/?pca=2&aba=documentos&abrir=documento%3A4");
  assert.equal(pesquisarPublico(ix, "educação", "orcamento", 5)[0].linhas[0].href, "/?pca=2&aba=orcamento&abrir=orcamento%3Au5");
});

test("aba NÃO publicada não entra no índice", () => {
  const ix = indicePublico(base({ vistas: ["dashboard", "consulta"] }));
  assert.equal(ix.has("documento"), false);
  assert.equal(ix.has("orcamento"), false);
  assert.deepEqual(pesquisarPublico(ix, "portaria", null, 5), []);
});

test("termo curto não pesquisa; o tipo restringe; a ordem põe o exato primeiro", () => {
  const ix = indicePublico(base({ itens: [item({ id: 1, nomeProduto: "PAPEL A4 CADEIRA" }), item({ id: 2, nomeProduto: "CADEIRA" })] }));
  assert.deepEqual(pesquisarPublico(ix, "c", null, 5), []);
  const g = pesquisarPublico(ix, "cadeira", "item", 5);
  assert.equal(g.length, 1);
  assert.equal(g[0].linhas[0].id, 2);
});

test("lerAbrirPublico", () => {
  assert.deepEqual(lerAbrirPublico("item:-5"), { tipo: "item", id: -5 });
  assert.deepEqual(lerAbrirPublico("orcamento:sem"), { tipo: "orcamento", chave: "sem" });
  assert.equal(lerAbrirPublico("tarefa:3"), null);
  assert.equal(lerAbrirPublico("dfd:"), null);
  assert.equal(lerAbrirPublico("lixo"), null);
});

test("sem acento/caixa e o número também no texto", () => {
  const ix = indicePublico(base());
  assert.equal(pesquisarPublico(ix, "GIRATORIA", "item", 5)[0]?.total, 1);
  assert.equal(pesquisarPublico(ix, "350", "item", 5)[0]?.total, 1); // o valor unitário R$ 350,00
  assert.deepEqual(pesquisarPublico(ix, "cadeira inexistente", null, 5), []);
});

test("o detalhe põe primeiro o campo onde o termo aparece; a prévia leva os campos", () => {
  const ix = indicePublico(base());
  const l = pesquisarPublico(ix, "mobiliario", "item", 5)[0].linhas[0];
  assert.match(l.detalhe, /^Classificação MOBILIÁRIO/);
  assert.ok(l.info.some(([r, v]) => r === "Valor total" && v.includes("3.500,00")));
});
