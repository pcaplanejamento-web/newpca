import assert from "node:assert/strict";
import { test } from "node:test";
import { campoVisivel, type CampoNo, type Grafo } from "../src/lib/fluxo-core.ts";
import { filtrarMarcados } from "../src/lib/fluxo-dados.ts";
import { buscaDoNo, opcoesDaBusca, restringirPelaEntrada } from "../src/lib/fluxo-ler-sistema.ts";
import { aceitaItensDeFora } from "../src/lib/fluxo-tipo-item.ts";

const dfd = (id: number, planejamento: string) => ({ id, numero: String(1000 + id), planejamento, sigla: "SEMED" });

test("filtrarMarcados: nenhuma marcada = todas; marcadas = só elas", () => {
  const itens = [dfd(1, "10"), dfd(2, "20"), dfd(3, "30")];
  assert.equal(filtrarMarcados(itens, undefined, (it) => String(it.id)), itens);
  assert.equal(filtrarMarcados(itens, [], (it) => String(it.id)), itens);
  assert.deepEqual(filtrarMarcados(itens, [2, "3"], (it) => String(it.id)).map((i) => i.id), [2, 3]);
  assert.deepEqual(filtrarMarcados(itens, ["0"], (_it, i) => String(i)).map((i) => i.id), [1]);
});

test("buscaDoNo: o objeto e o 'Quais' dele (padrão Todos)", () => {
  assert.deepEqual(buscaDoNo({}), { objeto: "dfds", busca: "todos" });
  assert.deepEqual(buscaDoNo({ objeto: "protocolos", buscaProtocolos: "id" }), { objeto: "protocolos", busca: "id" });
  assert.deepEqual(buscaDoNo({ objeto: "xyz", buscaDfds: "numero" }), { objeto: "dfds", busca: "numero" });
});

test("restringirPelaEntrada: só os itens de fora do MESMO tipo", () => {
  const lidos = [dfd(1, "10"), dfd(2, "20"), dfd(3, "30")];
  assert.deepEqual(restringirPelaEntrada(lidos, [dfd(2, "20")], "dfds").map((i) => i.id), [2]);
  assert.equal(restringirPelaEntrada(lidos, [{ id: 5, numero: "1/2026", idExterno: "9" }], "dfds"), lidos);
  assert.equal(restringirPelaEntrada(lidos, undefined, "dfds"), lidos);
});

test("opcoesDaBusca: os valores do sistema sem repetir", () => {
  const f = {
    protocolos: [{ id: 1, numero: "1/2026", idExterno: "77", assunto: "INCLUSÃO" }],
    dfds: [dfd(1, "10"), dfd(2, "10"), dfd(3, "30")],
    itens: [{ id: 1, codigo: "123", descricao: "CANETA", dfdNumero: "1001", dfdPlanejamento: "10" }],
  };
  assert.deepEqual(opcoesDaBusca(f as never, "dfds", "planejamento").map((o) => o.valor), ["10", "30"]);
  assert.deepEqual(opcoesDaBusca(f as never, "dfds", "numero").map((o) => o.valor), ["1001", "1002", "1003"]);
  assert.deepEqual(opcoesDaBusca(f as never, "protocolos", "id").map((o) => o.valor), ["77"]);
  assert.deepEqual(opcoesDaBusca(f as never, "itens", "produto").map((o) => o.valor), ["123"]);
});

test("campoVisivel respeita a regra 'visivel'", () => {
  const c: CampoNo = { chave: "valor", rotulo: "Valor", tipo: "texto", visivel: (cfg) => buscaDoNo(cfg).busca !== "todos" };
  assert.equal(campoVisivel(c, {}), false);
  assert.equal(campoVisivel(c, { buscaDfds: "planejamento" }), true);
});

test("aceitaItensDeFora: o Início alimenta quem aceita os itens", () => {
  const g = (config: Record<string, unknown>, tipo = "sistema.ler"): Grafo => ({
    nos: [
      { id: "a", tipo: "gatilho.inicio", x: 0, y: 0, config: {} },
      { id: "b", tipo, x: 0, y: 0, config },
    ],
    conexoes: [{ de: "a", saida: "saida", para: "b", entrada: "entrada" }],
  }) as unknown as Grafo;
  const cat = (t: string) => (t.startsWith("centi.") ? "centi" : "dados");
  const itens = [dfd(1, "10")];
  assert.equal(aceitaItensDeFora(g({ objeto: "dfds" }), itens, cat), true);
  assert.equal(aceitaItensDeFora(g({ objeto: "protocolos" }), itens, cat), false);
  assert.equal(aceitaItensDeFora(g({ objeto: "dfds", valor: "{{planejamento}}" }), itens, cat), true);
  assert.equal(aceitaItensDeFora(g({ objeto: "dfds", valor: "10" }), itens, cat), false);
  assert.equal(aceitaItensDeFora(g({}, "centi.cm002"), itens, cat), false);
  assert.equal(aceitaItensDeFora(g({}, "dados.filtrar"), itens, cat), true);
  assert.equal(aceitaItensDeFora(g({ objeto: "dfds" }), [], cat), false);
});
