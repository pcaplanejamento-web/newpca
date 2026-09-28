import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { casarMembro, codigoCartaoTrello, corTrello, dataHoraTrello, lerTrello, resumoTrello } from "../src/lib/trello-import.ts";
import { importarTrelloSchema } from "../src/lib/tarefas-validation.ts";

// Um quadro exportado do Trello (o recorte que a importação lê).
const QUADRO = {
  name: "Planejamento — Outubro",
  lists: [
    { id: "L2", name: "02 - OUTUBRO - 2026", closed: false, pos: 2 },
    { id: "L1", name: "TEMPLATES", closed: false, pos: 1 },
    { id: "L3", name: "Antiga", closed: true, pos: 3 },
  ],
  labels: [
    { id: "E1", name: "FALTAS", color: "orange_dark" },
    { id: "E2", name: "", color: null },
  ],
  members: [
    { id: "M1", fullName: "Ana Souza", username: "anasouza" },
    { id: "M2", fullName: "Zé", username: "ze" },
  ],
  cards: [
    {
      id: "C1",
      shortLink: "aaa111",
      idList: "L2",
      name: "2. Protocolo - FALTA - 144756",
      desc: "**STATUS:** aguardando",
      due: "2026-10-05T15:30:00.000Z",
      start: "2026-10-01T12:00:00.000Z",
      dueComplete: true,
      closed: false,
      pos: 2,
      idLabels: ["E1"],
      idMembers: ["M1"],
      attachments: [
        { url: "https://trello.com/c/bbb222/12-outro", name: "outro" },
        { url: "https://sei.gov.br/doc/1", name: "SEI" },
        { url: "ftp://x", name: "ftp" },
      ],
    },
    { id: "C2", shortLink: "bbb222", idList: "L1", name: "Modelo", isTemplate: true, pos: 1 },
    { id: "C3", idList: "L3", name: "Velho", closed: true, pos: 1 },
    { id: "C4", idList: "NAO-EXISTE", name: "Órfão" },
    { id: "C5", idList: "L2", name: "", pos: 1, due: "lixo" },
  ],
  checklists: [
    {
      id: "K1",
      idCard: "C1",
      name: "SERVIDORES",
      pos: 1,
      checkItems: [
        { name: "Maria", state: "complete", pos: 2 },
        { name: "João", state: "incomplete", pos: 1 },
        { name: "  ", state: "complete", pos: 3 },
      ],
    },
  ],
  actions: [
    { type: "commentCard", date: "2026-10-02T13:00:00.000Z", data: { card: { id: "C1" }, text: "Segundo" }, memberCreator: { fullName: "Ana Souza" } },
    { type: "commentCard", date: "2026-10-01T13:00:00.000Z", data: { card: { id: "C1" }, text: "Primeiro" }, memberCreator: { fullName: "Zé" } },
    { type: "updateCard", data: { card: { id: "C1" } } },
  ],
};

describe("importar do Trello — leitura do JSON", () => {
  it("listas na ordem, etiquetas com a cor, cartões órfãos fora, prazo em Brasília, concluído, template e arquivado", () => {
    const t = lerTrello(QUADRO);
    assert.ok(t);
    assert.equal(t.nome, "Planejamento — Outubro");
    assert.deepEqual(t.listas.map((l) => [l.chave, l.arquivada]), [["L1", false], ["L2", false], ["L3", true]]);
    assert.deepEqual(t.etiquetas.map((e) => [e.nome, e.cor]), [["FALTAS", "#ea580c"], ["Sem nome", "#64748b"]]);
    assert.deepEqual(t.cartoes.map((c) => c.chave), ["C2", "C3", "C5", "C1"]);
    const c1 = t.cartoes.find((c) => c.chave === "C1");
    assert.ok(c1);
    assert.deepEqual([c1.prazo, c1.prazoHora, c1.inicio, c1.concluida], ["2026-10-05", "12:30", "2026-10-01", true]);
    assert.deepEqual(c1.checklists, [{ nome: "SERVIDORES", itens: ["João", "Maria"], feitos: [false, true] }]);
    assert.deepEqual(c1.vinculos, ["C2"]);
    assert.deepEqual(c1.links, [{ url: "https://sei.gov.br/doc/1", titulo: "SEI" }]);
    assert.deepEqual(c1.comentarios.map((c) => [c.autor, c.texto]), [["Zé", "Primeiro"], ["Ana Souza", "Segundo"]]);
    assert.equal(t.cartoes.find((c) => c.chave === "C2")?.template, true);
    assert.equal(t.cartoes.find((c) => c.chave === "C3")?.arquivada, true);
    const c5 = t.cartoes.find((c) => c.chave === "C5");
    assert.deepEqual([c5?.titulo, c5?.prazo], ["(Sem título)", null]);
    assert.deepEqual(resumoTrello(t), { listas: 3, cartoes: 4, arquivados: 1, templates: 1, etiquetas: 2, checklists: 1, comentarios: 2, vinculos: 1 });
  });

  it("não é quadro do Trello = null; cor e data tolerantes; código do cartão no endereço", () => {
    assert.equal(lerTrello(null), null);
    assert.equal(lerTrello({ name: "x" }), null);
    assert.equal(lerTrello("texto"), null);
    assert.equal(corTrello("sky_light"), "#0891b2");
    assert.equal(corTrello(undefined), "#64748b");
    assert.equal(dataHoraTrello("2026-01-01T02:00:00.000Z")?.data, "2025-12-31");
    assert.equal(dataHoraTrello(123), null);
    assert.equal(codigoCartaoTrello("https://trello.com/c/AbC123/5-nome"), "AbC123");
    assert.equal(codigoCartaoTrello("https://trello.com/b/xyz"), null);
  });

  it("membro → pessoa só quando UMA casa (nome completo, ou usuário/nome = apelido)", () => {
    const pessoas = [
      { id: 1, nome: "Ana Souza", apelido: "Ana" },
      { id: 2, nome: "José Lima", apelido: "ze" },
      { id: 3, nome: "Ana Souza", apelido: null },
    ];
    assert.equal(casarMembro({ nome: "Ana Souza", usuario: "anasouza" }, pessoas), null);
    assert.equal(casarMembro({ nome: "Zé", usuario: "ze" }, pessoas), 2);
    assert.equal(casarMembro({ nome: "JOSÉ LIMA", usuario: "" }, pessoas), 2);
    assert.equal(casarMembro({ nome: "Fulano", usuario: "fulano" }, pessoas), null);
  });

  it("schema da importação: estrutura, cartões (até 20) e vínculos", () => {
    assert.equal(importarTrelloSchema.safeParse({ modo: "estrutura", listas: [{ chave: "L1", nome: "A", arquivada: false }], etiquetas: [], limparVazias: true }).success, true);
    const cartao = {
      chave: "C1",
      listaId: 1,
      titulo: "T",
      descricao: null,
      inicio: null,
      prazo: "2026-10-05",
      prazoHora: "12:30",
      concluida: true,
      arquivada: false,
      template: false,
      etiquetas: [],
      pessoas: [],
      checklists: [{ nome: "S", itens: ["a"], feitos: [true] }],
      links: [{ url: "https://x.y", titulo: "" }],
      comentarios: [{ autor: "Ana", data: null, texto: "oi" }],
    };
    assert.equal(importarTrelloSchema.safeParse({ modo: "cartoes", cartoes: [cartao] }).success, true);
    assert.equal(importarTrelloSchema.safeParse({ modo: "cartoes", cartoes: Array(21).fill(cartao) }).success, false);
    assert.equal(importarTrelloSchema.safeParse({ modo: "cartoes", cartoes: [{ ...cartao, links: [{ url: "ftp://x", titulo: "" }] }] }).success, false);
    assert.equal(importarTrelloSchema.safeParse({ modo: "vinculos", pares: [{ de: 1, para: 2 }] }).success, true);
  });
});
