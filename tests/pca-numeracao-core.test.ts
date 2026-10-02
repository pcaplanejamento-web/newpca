import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  avisoIncorporado,
  impactoSaidaPca,
  type NumeroLivre,
  parearNumeros,
  planoVinculoDfd,
  vinculoDesejado,
} from "../src/lib/pca-numeracao-core.ts";

const n = (sequencial: number, item: number | null, codigo: string | null, descricao: string | null, unidade: string | null = "UN"): NumeroLivre => ({
  pcaId: 1,
  sequencial,
  item,
  codigo,
  descricao,
  unidade,
});
const l = (item: number | null, codigo: string | null, descricao: string | null, unidade: string | null = "UN") => ({ item, codigo, descricao, unidade });
const seqs = (r: ReturnType<typeof parearNumeros>) => r.numeros.map((x) => x?.sequencial ?? null);

describe("parearNumeros — o nº do PCA segue o item na regravação", () => {
  const antes = [n(1, 1, "111", "CADEIRA"), n(2, 2, "222", "MESA"), n(3, 3, "333", "ARMÁRIO")];

  it("tudo igual: cada item com o seu nº", () => {
    const r = parearNumeros([l(1, "111", "CADEIRA"), l(2, "222", "MESA"), l(3, "333", "ARMÁRIO")], antes);
    assert.deepEqual(seqs(r), [1, 2, 3]);
    assert.deepEqual(r.sobra, []);
  });

  it("removido no meio: os de baixo NÃO herdam o nº dele (sobra o do removido)", () => {
    const r = parearNumeros([l(1, "111", "CADEIRA"), l(2, "333", "ARMÁRIO")], antes);
    assert.deepEqual(seqs(r), [1, 3]);
    assert.deepEqual(
      r.sobra.map((x) => x.sequencial),
      [2],
    );
  });

  it("item novo fica sem nº (a gravação numera no fim); a ordem não importa", () => {
    const r = parearNumeros([l(1, "999", "ARQUIVO"), l(2, "333", "ARMÁRIO"), l(3, "111", "CADEIRA"), l(4, "222", "MESA")], antes);
    assert.deepEqual(seqs(r), [null, 3, 1, 2]);
  });

  it("descrição corrigida (pelo nº do item + código), código corrigido (pelo nº do item + descrição), unidade corrigida", () => {
    const r = parearNumeros([l(1, "111", "CADEIRA GIRATÓRIA"), l(2, "22-2X", "MESA"), l(3, "333", "ARMÁRIO", "CX")], antes);
    assert.deepEqual(seqs(r), [1, 2, 3]);
  });

  it("pontuação, caixa, acento e espaços não mudam a identidade", () => {
    const r = parearNumeros([l(7, "1.1.1", "  cadeira. "), l(8, "222", "Mesa"), l(9, "333", "ARMARIO")], antes);
    assert.deepEqual(seqs(r), [1, 2, 3]);
  });

  it("descrição E código trocados no mesmo item: é outro item (novo nº; o antigo sobra)", () => {
    const r = parearNumeros([l(1, "888", "BANCO")], [n(1, 1, "111", "CADEIRA")]);
    assert.deepEqual(seqs(r), [null]);
    assert.equal(r.sobra.length, 1);
  });

  it("repetidos (mesmo código, descrição e unidade): o nº do item pelo nº dele; unificar mantém o do que fica", () => {
    const dup = [n(5, 7, "777", "PAPEL"), n(6, 9, "777", "PAPEL")];
    assert.deepEqual(seqs(parearNumeros([l(7, "777", "PAPEL"), l(9, "777", "PAPEL")], dup)), [5, 6]);
    assert.deepEqual(seqs(parearNumeros([l(9, "777", "PAPEL")], dup)), [6], "o que fica é o item 9 — mantém o 6");
    assert.deepEqual(seqs(parearNumeros([l(1, "777", "PAPEL")], dup)), [5], "renumerado: o menor nº vai ao primeiro");
  });

  it("cada nº vai a UMA linha só; sem livres, ninguém ganha nº", () => {
    const r = parearNumeros([l(1, "111", "CADEIRA"), l(2, "111", "CADEIRA")], [n(1, 1, "111", "CADEIRA")]);
    assert.deepEqual(seqs(r), [1, null]);
    assert.deepEqual(seqs(parearNumeros([l(1, "111", "CADEIRA")], [])), [null]);
  });

  it("chaves vazias: sem código e sem descrição só casa pelo nº do item… e nem assim (não há conteúdo para conferir)", () => {
    const r = parearNumeros([l(1, null, null)], [n(1, 1, null, null)]);
    assert.deepEqual(seqs(r), [null]);
    assert.deepEqual(seqs(parearNumeros([l(null, "111", "CADEIRA")], [n(1, null, "111", "CADEIRA")])), [1], "sem nº do item, pelo conteúdo");
  });

  it("escala: 5.000 itens regravados com 1 removido no início em tempo linear", () => {
    const livres = Array.from({ length: 5000 }, (_, i) => n(i + 1, i + 1, String(100000 + i), `ITEM ${i}`));
    const linhas = livres.slice(1).map((x, i) => l(i + 1, x.codigo ?? null, x.descricao ?? null));
    const t0 = performance.now();
    const r = parearNumeros(linhas, livres);
    assert.ok(performance.now() - t0 < 500);
    assert.equal(r.numeros[0]?.sequencial, 2);
    assert.equal(r.numeros.at(-1)?.sequencial, 5000);
    assert.deepEqual(
      r.sobra.map((x) => x.sequencial),
      [1],
    );
  });
});

describe("planoVinculoDfd — o DFD está no PCA do protocolo incorporado em que está", () => {
  it("entra, sai, troca de protocolo no mesmo PCA, nada a fazer", () => {
    assert.deepEqual(planoVinculoDfd([], { pcaId: 1, protocoloId: 10 }), { sai: [], entra: { pcaId: 1, protocoloId: 10 }, troca: null });
    assert.deepEqual(planoVinculoDfd([{ pcaId: 1, protocoloId: 10 }], null), { sai: [1], entra: null, troca: null });
    assert.deepEqual(planoVinculoDfd([{ pcaId: 1, protocoloId: 10 }], { pcaId: 1, protocoloId: 20 }), {
      sai: [],
      entra: null,
      troca: { pcaId: 1, protocoloId: 20 },
    });
    assert.deepEqual(planoVinculoDfd([{ pcaId: 1, protocoloId: 10 }], { pcaId: 1, protocoloId: 10 }), { sai: [], entra: null, troca: null });
  });
  it("de um PCA para outro: sai de um e entra no outro", () => {
    assert.deepEqual(planoVinculoDfd([{ pcaId: 1, protocoloId: 10 }], { pcaId: 2, protocoloId: 40 }), {
      sai: [1],
      entra: { pcaId: 2, protocoloId: 40 },
      troca: null,
    });
  });
  it("vinculoDesejado: só o protocolo INCORPORADO (enviado ou na Mesa do sistema não põe no PCA)", () => {
    assert.deepEqual(vinculoDesejado({ protocoloId: 10, pcaId: 1, pcaIncorporadoEm: "2027-01-01" }), { pcaId: 1, protocoloId: 10 });
    assert.equal(vinculoDesejado({ protocoloId: 10, pcaId: 1, pcaIncorporadoEm: null }), null);
    assert.equal(vinculoDesejado({ protocoloId: 10, pcaId: null, pcaIncorporadoEm: null }), null);
    assert.equal(vinculoDesejado(null), null);
  });
});

describe("textos do incorporado", () => {
  it("aviso e impacto", () => {
    assert.match(avisoIncorporado("PCA 2027"), /^Incorporado ao PCA 2027 — as alterações entram no PCA na hora/);
    assert.match(avisoIncorporado(null), /^Incorporado ao PCA —/);
    assert.match(impactoSaidaPca("PCA 2027", 1), /o item perde o nº/);
    assert.match(impactoSaidaPca("PCA 2027", 1200), /os 1\.200 itens perdem o nº/);
    assert.equal(impactoSaidaPca("PCA 2027", 0), "Sai do PCA 2027.");
  });
});
