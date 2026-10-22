import assert from "node:assert/strict";
import { test } from "node:test";
import { orcamentoNaVisao } from "../src/lib/orcamento-pca-visao.ts";

const alvos = { orgaos: [], unidades: [] };
const it = (id: number, funcao: string, valorInicial: number) => ({ id, orgao: "O", unidade: "U", acao: "A", nomeElemento: "E", codigoElemento: "1", funcao, valorInicial });

test("orcamentoNaVisao: sem visão soma tudo; a visão filtra e não muda o bruto", () => {
  const itens = [it(1, "Saúde", 100), it(2, "Educação", 50)];
  const todo = orcamentoNaVisao(itens, [], null, alvos);
  assert.equal(todo.bruto, 150);
  assert.equal(todo.filtrado, 150);
  assert.equal(todo.visaoNome, null);
  const visao = { id: 7, nome: "Só saúde", filtros: { funcao: ["Saúde"] }, proprias: [] } as never;
  const v = orcamentoNaVisao(itens, [], visao, alvos);
  assert.equal(v.bruto, 150);
  assert.equal(v.filtrado, 100);
  assert.deepEqual(v.linhas.map((l) => l.id), [1]);
  assert.equal(v.visaoId, 7);
});
