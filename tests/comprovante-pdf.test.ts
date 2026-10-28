import assert from "node:assert/strict";
import { test } from "node:test";
import { larguraDasColunas, montarDocumento } from "../src/lib/documento-pdf-core.ts";
import { gerarDocumentoPdf } from "../src/lib/documento-pdf-gerar.ts";

const medir = (s: string, tam: number) => s.length * tam * 0.5;
const blocos = [
  { tipo: "titulo" as const, texto: "Termo" },
  ...Array.from({ length: 120 }, (_, i) => ({ tipo: "paragrafo" as const, texto: `Cláusula ${i} — texto longo do termo de uso para ocupar várias páginas.` })),
  { tipo: "quadro" as const, titulo: "ASSINATURA", cor: "@titulo", itens: [{ rotulo: "Código", valor: "ABC" }], nota: "nota" },
];
const carimbo = { titulo: "ASSINADO · página {pagina} de {total}", linhas: ["Fulano · código ABC"], cor: "@titulo" };

const temCarimbo = (p: ReturnType<typeof montarDocumento>[number], i: number, total: number) =>
  p.some((o) => o.t === "texto" && o.texto === `ASSINADO · página ${i + 1} de ${total}`);

test("a ASSINATURA ocupa o lugar do carimbo só na página dela; as demais levam o carimbo com o número da página", () => {
  const ps = montarDocumento(blocos, medir, { titulo: "T", rodape: "r", carimbo });
  assert.ok(ps.length > 1);
  const ult = ps.length - 1;
  // O painel da assinatura fica inteiro na página final — sem o carimbo.
  assert.ok(ps[ult].some((o) => o.t === "texto" && o.texto === "ASSINATURA"));
  assert.equal(temCarimbo(ps[ult], ult, ps.length), false);
  ps.slice(0, ult).forEach((p, i) => {
    assert.ok(temCarimbo(p, i, ps.length));
  });
  // O rodapé (Página N de M) continua em todas.
  ps.forEach((p, i) => {
    assert.ok(p.some((o) => o.t === "texto" && o.texto === `Página ${i + 1} de ${ps.length}`));
  });
});

test("a assinatura usa o espaço do carimbo: cabe na página em que o carimbo a empurraria para a seguinte", () => {
  const curto = (n: number) => [
    ...Array.from({ length: n }, (_, i) => ({ tipo: "paragrafo" as const, texto: `Linha ${i}` })),
    { tipo: "quadro" as const, titulo: "ASSINATURA", cor: "@titulo", itens: [{ rotulo: "Código", valor: "ABC" }] },
  ];
  // O maior nº de linhas em que a assinatura ainda cabe na 1ª página COM o carimbo.
  let n = 1;
  while (montarDocumento(curto(n + 1), medir, { titulo: "T", rodape: "r", carimbo, desenhoAntigo: true }).length === 1) n++;
  const antigo = montarDocumento(curto(n + 1), medir, { titulo: "T", rodape: "r", carimbo, desenhoAntigo: true });
  const novo = montarDocumento(curto(n + 1), medir, { titulo: "T", rodape: "r", carimbo });
  assert.equal(antigo.length, 2);
  assert.equal(novo.length, 1);
  assert.equal(temCarimbo(novo[0], 0, 1), false);
});

test("desenho antigo (`desenhoAntigo`): o carimbo em TODAS as páginas", () => {
  const ps = montarDocumento(blocos, medir, { titulo: "T", rodape: "r", carimbo, desenhoAntigo: true });
  ps.forEach((p, i) => {
    assert.ok(temCarimbo(p, i, ps.length));
  });
});

test("o conteúdo nunca invade o carimbo", () => {
  const sem = montarDocumento(blocos, medir, { titulo: "T", rodape: "r" });
  const com = montarDocumento(blocos, medir, { titulo: "T", rodape: "r", carimbo });
  assert.ok(com.length >= sem.length);
});

test("PDF DETERMINÍSTICO: os mesmos dados dão os mesmos bytes; uma letra muda o arquivo", async () => {
  const o = { rodape: "r", sistema: "S", carimbo, data: new Date("2026-10-01T12:00:00.000Z") };
  const a = await gerarDocumentoPdf({ titulo: "T", blocos }, o);
  const b = await gerarDocumentoPdf({ titulo: "T", blocos }, o);
  assert.deepEqual(a, b);
  const c = await gerarDocumentoPdf({ titulo: "T.", blocos }, o);
  assert.notDeepEqual(a, c);
});

test("nenhuma palavra partida: cada coluna tem ao menos a largura da maior palavra; o resto vai pelo peso", () => {
  const tb = {
    tipo: "tabela" as const,
    colunas: [
      { titulo: "Item", peso: 0.1 },
      { titulo: "Planejamento", peso: 0.1 },
      { titulo: "Descrição", peso: 5 },
    ],
    linhas: [{ celulas: ["1", "1509", "CADEIRA GIRATÓRIA ESTOFADA"] }],
  };
  const larg = larguraDasColunas(tb, 400, 7.5, medir);
  assert.ok(Math.abs(larg.reduce((s, w) => s + w, 0) - 400) < 1e-6);
  assert.ok(larg[1] >= medir("Planejamento", 7.5) + 8);
  assert.ok(larg[2] > larg[1]);
  // A palavra gigante (um hash) não toma a tabela: fica em até 45%.
  const hash = { ...tb, linhas: [{ celulas: ["1", "a".repeat(200), "x"] }] };
  assert.ok(larguraDasColunas(hash, 400, 7.5, medir)[1] <= 180 + 1e-6);
});
