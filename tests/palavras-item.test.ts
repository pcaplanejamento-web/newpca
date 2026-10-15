import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chavePalavra, coerceRegras, palavrasNoItem, regrasPadrao, termosDoTexto } from "../src/lib/avaliacao-core.ts";
import { avaliacaoSchema } from "../src/lib/avaliacao-validation.ts";
import { avaliarDfd, mensagensDfd, mensagensItem } from "../src/lib/dfd-tratamento.ts";
import { pendenciasDoDfd } from "../src/lib/pendencias-core.ts";

const regras = (ponto: string, grupos: { id: string; termos: string[]; nivel?: string }[]) =>
  coerceRegras({ pontos: { "item.palavras": ponto }, palavrasItem: grupos });

describe("palavras apontadas no item", () => {
  it("termos por ';', sem vazios nem repetidos (sem acento/caixa)", () => {
    assert.deepEqual(termosDoTexto(" pneu ; Pneu;; câmara de ar ;CAMARA DE AR"), ["pneu", "câmara de ar"]);
    assert.equal(chavePalavra("Ar-Condicionado!"), "AR CONDICIONADO");
  });

  it("desligado por padrão: sem regra nenhuma apontada", () => {
    const r = coerceRegras({ palavrasItem: [{ id: "a", termos: ["PNEU"] }] });
    assert.deepEqual(palavrasNoItem("PNEU 175/70", r), []);
    assert.deepEqual(palavrasNoItem("PNEU", regrasPadrao()), []);
  });

  it("palavra INTEIRA, sem acento/caixa; expressão com pontuação", () => {
    const r = regras("intermediario", [{ id: "a", termos: ["carro", "ar condicionado"] }]);
    assert.equal(palavrasNoItem("CARROCERIA DE AÇO", r).length, 0);
    assert.deepEqual(palavrasNoItem("Locação de Carro popular", r)[0].termos, ["carro"]);
    assert.deepEqual(palavrasNoItem("APARELHO DE AR-CONDICIONADO 12.000 BTUS", r)[0].termos, ["ar condicionado"]);
  });

  it("cada conjunto com a sua importância; ignorar desliga só aquele", () => {
    const r = regras("intermediario", [
      { id: "a", termos: ["PNEU"], nivel: "fundamental" },
      { id: "b", termos: ["RODA"] },
      { id: "c", termos: ["CALOTA"], nivel: "ignorar" },
    ]);
    const achadas = palavrasNoItem("PNEU, RODA E CALOTA", r);
    assert.deepEqual(achadas.map((a) => [a.grupo, a.comportamento]), [["a", "bloqueia"], ["b", "avisa"]]);
  });

  it("importância desconhecida no conjunto cai na do ponto; conjunto vazio sai", () => {
    const r = regras("intermediario", [{ id: "a", termos: ["PNEU"], nivel: "nao-existe" }, { id: "b", termos: [] }]);
    assert.equal(r.palavrasItem?.length, 1);
    assert.equal(r.palavrasItem?.[0].nivel, undefined);
    assert.equal(palavrasNoItem("PNEU", r)[0].comportamento, "avisa");
  });

  it("mensagens do item, do DFD, avaliação e pendências seguem o pior conjunto", () => {
    const r = regras("intermediario", [{ id: "a", termos: ["PNEU"], nivel: "fundamental" }, { id: "b", termos: ["RODA"] }]);
    const itens = [
      { item: 1, codigo: "1", descricao: "PNEU ARO 14", unidade: "UN", quantidade: 1, valorUnitario: 10, valorTotal: 10 },
      { item: 2, codigo: "2", descricao: "RODA ARO 14", unidade: "UN", quantidade: 1, valorUnitario: 10, valorTotal: 10 },
      { item: 3, codigo: "3", descricao: "PARAFUSO", unidade: "UN", quantidade: 1, valorUnitario: 10, valorTotal: 10 },
    ];
    assert.equal(mensagensItem(itens[0], null, r).find((m) => m.chave === "item.palavras")?.status, "erro");
    assert.equal(mensagensItem(itens[1], null, r).find((m) => m.chave === "item.palavras")?.status, "atencao");
    assert.equal(mensagensItem(itens[2], null, r).some((m) => m.chave === "item.palavras"), false);
    const d = { planejamento: "1", itens, secoes: [] };
    const msg = mensagensDfd(d, r).find((m) => m.chave === "item.palavras");
    assert.equal(msg?.status, "erro");
    assert.match(msg?.texto ?? "", /2 itens/);
    assert.ok(avaliarDfd(d, r).bloqueantes.some((b) => /palavras/.test(b)));
    const p = pendenciasDoDfd({ chave: 1, numero: "1", planejamento: "1", tipo: null, secoes: [], itens }, msg ? [msg] : [], undefined, undefined, r);
    assert.deepEqual(p.itens.map((x) => [x.idx, x.status]), [[0, "erro"], [1, "atencao"]]);
    assert.equal(p.itens[0].problemas[0].alvo.ancora, "descricao");
  });

  it("Zod: aceita conjuntos válidos, recusa importância que o ponto não permite", () => {
    assert.ok(avaliacaoSchema.safeParse({ palavrasItem: [{ id: "a", termos: ["PNEU"], nivel: "fundamental" }] }).success);
    assert.equal(avaliacaoSchema.safeParse({ palavrasItem: [{ id: "a", termos: ["PNEU"], nivel: "automatico" }] }).success, false);
    assert.equal(avaliacaoSchema.safeParse({ palavrasItem: [{ id: "a", termos: [] }] }).success, false);
  });
});
