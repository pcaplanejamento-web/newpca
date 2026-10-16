import assert from "node:assert/strict";
import { test } from "node:test";
import { aberturaDoItem, dadosDfdDoItem, tipoDoItem, tipoDosItens } from "../src/lib/fluxo-tipo-item.ts";

test("tipoDoItem reconhece protocolo, DFD e item", () => {
  assert.equal(tipoDoItem({ id: 3, dfdId: 9, descricao: "X", item: 1 }), "item");
  assert.equal(tipoDoItem({ id: 9, numero: "1209", planejamento: "1509" }), "dfd");
  assert.equal(tipoDoItem({ id: 5, numero: "144756/2026", idExterno: "88" }), "protocolo");
  assert.equal(tipoDoItem({ id: 5, dfds: [] }), "protocolo");
  assert.equal(tipoDoItem({ nome: "SEMED" }), null);
});

test("tipoDosItens: misturado ou vazio = null", () => {
  assert.equal(tipoDosItens([]), null);
  assert.equal(tipoDosItens([{ id: 1, numero: "1", planejamento: "2" }, { id: 2, numero: "3", planejamento: "4" }]), "dfd");
  assert.equal(tipoDosItens([{ id: 1, numero: "1", planejamento: "2" }, { nome: "x" }]), null);
});

test("aberturaDoItem abre o banner certo", () => {
  assert.deepEqual(aberturaDoItem({ id: 9, numero: "1", planejamento: "2" }), { tipo: "dfd", id: 9 });
  assert.deepEqual(aberturaDoItem({ id: 3, dfdId: 9, descricao: "X", item: 4, codigo: "123" }), {
    tipo: "item",
    dfdId: 9,
    itemId: 3,
    item: { item: 4, codigo: "123" },
  });
  assert.equal(aberturaDoItem({ nome: "x" }), null);
});

test("dadosDfdDoItem mapeia para a planilha de DFDs", () => {
  const d = dadosDfdDoItem({ id: 9, numero: "1209", planejamento: "1509", sigla: "SEMED", totalItens: 3, valor: 10.5, protocolo: "1/2026", execucaoCenti: "Executado" });
  assert.equal(d.numero, "1209");
  assert.equal(d.planejamento, "1509");
  assert.equal(d.itens, 3);
  assert.equal(d.valor, 10.5);
  assert.equal(d.protocolo, "1/2026");
  assert.equal(d.execucao, "Executado");
});
