import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DfdParseado } from "../src/lib/parse-dfd-comum.ts";
import {
  estadoDfd,
  normalizarSecoesDfd,
  setTextoSecao,
  textoSecao,
  TRATAVEIS,
} from "../src/lib/dfd-tratamento.ts";

const base = (secoes: { numero: number; titulo: string; texto: string }[]): DfdParseado => ({
  numero: "1",
  planejamento: null,
  tipo: null,
  objeto: null,
  orgaoEntidade: null,
  setorRequisitante: null,
  siglaSetor: null,
  responsavel: null,
  matricula: null,
  email: null,
  telefone: null,
  valorEstimado: null,
  valorTotal: null,
  nomeArquivo: "x",
  secoes,
  itens: [],
});

describe("dfd-tratamento", () => {
  it("normaliza PRIORIDADE e PREVISÃO auto, marcando os campos corrigidos", () => {
    const d = base([
      { numero: 6, titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "PRIORIDADE ALTA" },
      { numero: 5, titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "FEVEREIRO DE 2027" },
    ]);
    const r = normalizarSecoesDfd(d);
    assert.deepEqual(r.auto.sort(), ["previsao", "prioridade"]);
    assert.equal(textoSecao(r.dfd.secoes, "PRIORIDADE"), "ALTA");
    assert.equal(textoSecao(r.dfd.secoes, "PREVISAO DE ENTREGA"), "FEVEREIRO/2027");
  });

  it("não mexe quando já canônico (auto vazio)", () => {
    const d = base([{ numero: 6, titulo: "PRIORIDADE DA COMPRA", texto: "ALTA" }]);
    const r = normalizarSecoesDfd(d);
    assert.deepEqual(r.auto, []);
    assert.equal(r.dfd, d); // mesma referência (sem cópia)
  });

  it("setTextoSecao cria a seção que faltava (título/numero canônico)", () => {
    const cfg = TRATAVEIS[0];
    const secoes = setTextoSecao([], cfg, "BAIXA");
    assert.equal(secoes.length, 1);
    assert.equal(secoes[0].titulo, cfg.titulo);
    assert.equal(textoSecao(secoes, "PRIORIDADE"), "BAIXA");
  });

  it("estadoDfd: precedência erro > editado > regularizado > regular", () => {
    assert.equal(estadoDfd(2, true, true), "erro");
    assert.equal(estadoDfd(0, true, true), "editado");
    assert.equal(estadoDfd(0, true, false), "regularizado");
    assert.equal(estadoDfd(0, false, false), "regular");
  });
});
