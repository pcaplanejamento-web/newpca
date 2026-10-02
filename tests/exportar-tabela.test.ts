import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colunasExportaveis, dataDaPlanilha, linhasPlanilhaTabela, linhaTotal, nomeArquivoPlanilha } from "../src/lib/exportar-tabela.ts";

// Exportar a tabela em .xlsx: as linhas à vista (filtradas, na ordem) e as colunas visíveis — números como números, os
// vários valores unidos, as datas em dd/mm/aaaa, as colunas de ação fora.

type Linha = { numero: string; estado: string[]; valor: number | null; criado: string; itens: number };
const linhas: Linha[] = [
  { numero: "144756/2026", estado: ["Sem prioridade", "Item sem valor"], valor: 1234.5, criado: "2026-09-30T14:05:00", itens: 3 },
  { numero: "144757/2026", estado: [], valor: null, criado: "2026-01-02", itens: 0 },
];
const colunas = [
  { cabecalho: "Nº processo", valor: (l: Linha) => l.numero },
  { cabecalho: "Estado", valores: (l: Linha) => l.estado, valor: () => "Regular" },
  { cabecalho: "Valor", numero: (l: Linha) => l.valor, valor: (l: Linha) => (l.valor == null ? "—" : String(l.valor)) },
  { cabecalho: "Data", data: true, valor: (l: Linha) => l.criado },
  { cabecalho: "Itens", numero: (l: Linha) => l.itens },
  { cabecalho: "", valor: () => "ações" },
  { cabecalho: "Só visual" },
];

describe("exportar tabela (.xlsx)", () => {
  it("cabeçalho + uma linha por registro, na ordem; ações e colunas sem valor ficam de fora", () => {
    const out = linhasPlanilhaTabela(colunas, linhas);
    assert.deepEqual(out[0], ["Nº processo", "Estado", "Valor", "Data", "Itens"]);
    assert.deepEqual(out[1], ["144756/2026", "Sem prioridade; Item sem valor", 1234.5, "30/09/2026 14:05", 3]);
    // Sem os vários valores, vale o texto; número vazio com texto "—" = vazio; zero é número.
    assert.deepEqual(out[2], ["144757/2026", "Regular", "", "02/01/2026", 0]);
    assert.equal(colunasExportaveis(colunas).length, 5);
    // A linha TOTAL: soma as colunas numéricas (vazio fora), "TOTAL" na 1ª não somada.
    assert.deepEqual(out[3], ["TOTAL", "", 1234.5, "", 3]);
    assert.equal(out.length, 4);
  });

  it("linha TOTAL: só as somáveis, arredondada ao centavo; total:false fica em branco", () => {
    type X = { q: number | null; u: number; seq: number };
    const cols = [
      { cabecalho: "Seq.", numero: (x: X) => x.seq, total: false as const },
      { cabecalho: "Qtd.", numero: (x: X) => x.q },
      { cabecalho: "Unit.", numero: (x: X) => x.u, total: false as const },
    ];
    const xs = [
      { q: 0.1, u: 5, seq: 1 },
      { q: 0.2, u: 7, seq: 2 },
      { q: null, u: 1, seq: 3 },
    ];
    assert.deepEqual(linhaTotal(cols, xs), ["TOTAL", 0.3, ""]);
    assert.equal(linhaTotal(cols, []), null);
    assert.equal(linhaTotal([cols[0], cols[2]], xs), null, "sem coluna somável, sem linha");
    assert.deepEqual(linhaTotal([cols[1]], xs), [0.3], "todas somadas: sem rótulo");
  });

  it("sem linhas = só o cabeçalho", () => {
    assert.deepEqual(linhasPlanilhaTabela(colunas, []), [["Nº processo", "Estado", "Valor", "Data", "Itens"]]);
  });

  it("número inválido (NaN/infinito) sai vazio, nunca \"NaN\"", () => {
    const out = linhasPlanilhaTabela([{ cabecalho: "N", numero: () => Number.NaN }, { cabecalho: "M", numero: () => Number.POSITIVE_INFINITY }], [1]);
    assert.deepEqual(out[1], ["", ""]);
    assert.deepEqual(out[2], [0, 0], "o total ignora o que não é número");
  });

  it("datas ISO viram dd/mm/aaaa (com a hora quando há); outro texto fica como está", () => {
    assert.equal(dataDaPlanilha("2026-09-30"), "30/09/2026");
    assert.equal(dataDaPlanilha("2026-09-30 08:07:00"), "30/09/2026 08:07");
    assert.equal(dataDaPlanilha("sem data"), "sem data");
  });

  it("nome do arquivo sem caracteres proibidos e com a data", () => {
    assert.equal(nomeArquivoPlanilha("Mesa: Protocolos/2026", "2026-09-30"), "Mesa- Protocolos-2026 - 2026-09-30.xlsx");
    assert.equal(nomeArquivoPlanilha("   ", "2026-09-30"), "tabela - 2026-09-30.xlsx");
  });
});
