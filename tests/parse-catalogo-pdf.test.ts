import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCatalogoFromPdfItems } from "../src/lib/parse-catalogo-pdf-core.ts";
import type { PdfItem } from "../src/lib/parse-dfd-pdf-core.ts";

// Fixtures sintéticos ({page,x,y,str}) reproduzindo os LAYOUTS reais dos catálogos. y
// cresce para CIMA (topo = maior y), como no pdf.js. Cada `Tok` = [x, y, str].
type Tok = [number, number, string];
function pg(page: number, toks: Tok[]): PdfItem[] {
  return toks.map(([x, y, str]) => ({ page, x, y, str }));
}

describe("parse-catalogo-pdf-core", () => {
  it("layout 4-col (Item | Cód | Descrição | Und.Med) + código com pontos + descrição multi-linha", () => {
    const items = pg(1, [
      [40, 760, "CATÁLAGO GENEROS ALIMENTICIOS NÃO PERECÍVEIS"],
      // cabeçalho
      [50, 700, "Item"],
      [120, 700, "Cód. Prod"],
      [260, 700, "Descrição"],
      [600, 700, "Und.Med"],
      // item 1 (descrição em 2 linhas)
      [50, 680, "1"],
      [120, 680, "524.175.984"],
      [260, 680, "Açafrão em pó de coloração"],
      [600, 680, "UNIDADE"],
      [260, 665, "alaranjada, isenta de matérias"],
      // item 2
      [50, 640, "2"],
      [120, 640, "5.241.904.427"],
      [260, 640, "ACHOCOLATADO 400 GRAMAS"],
      [600, 640, "UNIDADE"],
    ]);
    const r = parseCatalogoFromPdfItems(items, "cat.pdf");
    assert.equal(r.nome, "CATÁLAGO GENEROS ALIMENTICIOS NÃO PERECÍVEIS");
    assert.equal(r.itens.length, 2);
    const [a, b] = r.itens;
    assert.equal(a.codigo, "524175984");
    assert.equal(a.codigoRaw, "524.175.984");
    assert.equal(a.sequencial, 1);
    assert.equal(a.unidade, "UNIDADE");
    assert.match(a.descricao, /Açafrão em pó de coloração alaranjada, isenta de matérias/);
    assert.equal(b.codigo, "5241904427");
    assert.equal(b.sequencial, 2);
  });

  it("layout com Und ANTES da descrição (Item | Cód | Und | Descrição | Qtd)", () => {
    const items = pg(1, [
      [40, 760, "CATÁLAGO LANCHES"],
      [50, 700, "Item"],
      [120, 700, "Cod Produto"],
      [210, 700, "Unidade Medida"],
      [300, 700, "Descrição"],
      [620, 700, "Quantidade"],
      [50, 680, "1"],
      [120, 680, "5241924358"],
      [210, 680, "UNIDADE"],
      [300, 680, "ÁGUA MINERAL NATURAL, SEM GÁS"],
    ]);
    const r = parseCatalogoFromPdfItems(items, "lanches.pdf");
    assert.equal(r.itens.length, 1);
    assert.equal(r.itens[0].codigo, "5241924358");
    assert.equal(r.itens[0].unidade, "UNIDADE");
    assert.match(r.itens[0].descricao, /ÁGUA MINERAL NATURAL/);
  });

  it("layout 3-col SEM Nº de item (Código | Unidade | Descrição) — Gás", () => {
    const items = pg(1, [
      [200, 760, "CATÁLOGO GÁS"],
      [50, 700, "CÓDIGO"],
      [160, 700, "UNIDADE"],
      [160, 688, "DE MEDIDA"],
      [320, 700, "DESCRIÇÃO"],
      [50, 675, "524177339"],
      [160, 675, "UNIDADE"],
      [320, 675, "Recarga de gás para botijão"],
      [320, 660, "propano e butano"],
    ]);
    const r = parseCatalogoFromPdfItems(items, "gas.pdf");
    assert.equal(r.itens.length, 1);
    const it = r.itens[0];
    assert.equal(it.sequencial, null); // sem coluna de item
    assert.equal(it.codigo, "524177339");
    assert.equal(it.unidade, "UNIDADE");
    assert.match(it.descricao, /Recarga de gás para botijão propano e butano/);
  });

  it("layout com Und DUPLICADA (antes E depois da descrição) — Construção", () => {
    const items = pg(1, [
      [40, 760, "CATÁLOGO DE SERVIÇOS DE MATERIAIS"],
      [40, 700, "N° Seq"],
      [120, 700, "Cód. Prod"],
      [210, 700, "Und"],
      [300, 700, "Descrição"],
      [600, 700, "Und"],
      [680, 700, "Qtd"],
      [50, 680, "1"],
      [120, 680, "314.167.956"],
      [210, 680, "CAIX"],
      [300, 680, "REBITE DE ALUMÍNIO POP 3,2"],
      [600, 680, "CAIX"],
    ]);
    const r = parseCatalogoFromPdfItems(items, "constr.pdf");
    assert.equal(r.itens.length, 1);
    const it = r.itens[0];
    assert.equal(it.codigo, "314167956");
    assert.equal(it.sequencial, 1);
    assert.equal(it.unidade, "CAIX"); // não "CAIXCAIX"
    assert.equal(it.descricao, "REBITE DE ALUMÍNIO POP 3,2"); // sem "CAIX" vazando
  });

  it("unidade que quebra em 2 linhas (UNIDA/DE) + código centralizado — Hospedagens", () => {
    const items = pg(1, [
      [300, 760, "Catálogo hospedagens"],
      [50, 700, "ITEM"],
      [120, 700, "CODIGO"],
      [250, 700, "DESCRIÇÃO"],
      [550, 700, "UND. MED"],
      // descrição em 3 linhas; código e unidade centralizados no meio
      [250, 690, "Hospedagem em apartamento"],
      [50, 675, "1"],
      [120, 675, "5241948381"],
      [250, 675, "individual, com ar condicionado"],
      [550, 675, "UNIDA"],
      [250, 660, "banheiro, TV, chuveiro"],
      [550, 660, "DE"],
    ]);
    const r = parseCatalogoFromPdfItems(items, "hosp.pdf");
    assert.equal(r.itens.length, 1);
    const it = r.itens[0];
    assert.equal(it.codigo, "5241948381");
    assert.equal(it.sequencial, 1);
    assert.equal(it.unidade, "UNIDADE"); // "UNIDA" + "DE" rejuntados
    assert.match(it.descricao, /Hospedagem em apartamento individual, com ar condicionado banheiro, TV, chuveiro/);
  });

  it("descrição que ATRAVESSA a página continua no item da página anterior", () => {
    const p1 = pg(1, [
      [50, 700, "Item"],
      [120, 700, "Código"],
      [250, 700, "Descrição"],
      [600, 700, "Und"],
      [50, 680, "1"],
      [120, 680, "111"],
      [250, 680, "Primeira linha da descrição"],
      [600, 680, "UNIDADE"],
    ]);
    const p2 = pg(2, [
      [250, 720, "continuação na página dois"], // no topo, acima do item 2 → é do item 1
      [50, 690, "2"],
      [120, 690, "222"],
      [250, 690, "Segundo item"],
      [600, 690, "KG"],
    ]);
    const r = parseCatalogoFromPdfItems([...p1, ...p2], "multi.pdf");
    assert.equal(r.itens.length, 2);
    assert.equal(r.itens[0].codigo, "111");
    assert.match(r.itens[0].descricao, /Primeira linha da descrição continuação na página dois/);
    assert.equal(r.itens[1].codigo, "222");
    assert.equal(r.itens[1].descricao, "Segundo item");
  });

  it("dígito DENTRO da descrição (CATMAT) não vira código; duplicado no arquivo é apontado", () => {
    const items = pg(1, [
      [50, 700, "Item"],
      [120, 700, "Código"],
      [250, 700, "Descrição"],
      [600, 700, "Und"],
      [50, 680, "1"],
      [120, 680, "999"],
      [250, 680, "ÁGUA MINERAL. CATMAT"],
      [400, 680, "445484"], // dígito no fim da descrição (ainda na coluna da descrição)
      [600, 680, "UNIDADE"],
      [50, 660, "2"],
      [120, 660, "999"], // código repetido no arquivo
      [250, 660, "OUTRO ITEM"],
      [600, 660, "KG"],
    ]);
    const r = parseCatalogoFromPdfItems(items, "dup.pdf");
    assert.equal(r.itens.length, 2);
    assert.equal(r.itens[0].codigo, "999");
    assert.match(r.itens[0].descricao, /ÁGUA MINERAL. CATMAT 445484/);
    assert.deepEqual(r.duplicadosNoArquivo, ["999"]);
  });

  it("PDF sem cabeçalho de tabela → nenhum item (nome ainda extraído)", () => {
    const items = pg(1, [
      [200, 760, "CATÁLOGO QUALQUER"],
      [50, 700, "Texto solto sem tabela"],
    ]);
    const r = parseCatalogoFromPdfItems(items, "vazio.pdf");
    assert.equal(r.itens.length, 0);
    assert.equal(r.nome, "CATÁLOGO QUALQUER");
  });
});
