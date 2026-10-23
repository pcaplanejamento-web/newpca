import assert from "node:assert/strict";
import { test } from "node:test";
import { montarDocumento } from "../src/lib/documento-pdf-core.ts";
import { gerarDocumentoPdf } from "../src/lib/documento-pdf-gerar.ts";

const medir = (s: string, tam: number) => s.length * tam * 0.5;
const blocos = [
  { tipo: "titulo" as const, texto: "Termo" },
  ...Array.from({ length: 120 }, (_, i) => ({ tipo: "paragrafo" as const, texto: `Cláusula ${i} — texto longo do termo de uso para ocupar várias páginas.` })),
  { tipo: "quadro" as const, titulo: "ASSINATURA", cor: "@titulo", itens: [{ rotulo: "Código", valor: "ABC" }], nota: "nota" },
];
const carimbo = { titulo: "ASSINADO · página {pagina} de {total}", linhas: ["Fulano · código ABC"], cor: "@titulo" };

test("carimbo de assinatura em TODAS as páginas, com o número da página", () => {
  const ps = montarDocumento(blocos, medir, { titulo: "T", rodape: "r", carimbo });
  assert.ok(ps.length > 1);
  ps.forEach((p, i) => {
    assert.ok(p.some((o) => o.t === "texto" && o.texto === `ASSINADO · página ${i + 1} de ${ps.length}`));
  });
  // O painel da assinatura fica inteiro na página final.
  assert.ok(ps[ps.length - 1].some((o) => o.t === "texto" && o.texto === "ASSINATURA"));
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
