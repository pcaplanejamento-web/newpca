// LER um ZIP (src/lib/zip-ler.ts): a Centi pode entregar os documentos de um protocolo num .zip.
import assert from "node:assert/strict";
import test from "node:test";
import { ZipArmazenar } from "../src/lib/zip-armazenar.ts";
import { arquivosDoZip, ehZip, entradasZip } from "../src/lib/zip-ler.ts";

const pdf = (t: string) => new TextEncoder().encode(`%PDF-1.7 ${t}`);
const juntar = (partes: Uint8Array[]) => {
  const r = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    r.set(p, i);
    i += p.length;
  }
  return r;
};
const ehPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50;

test("zip: lê as entradas STORE (o zip do próprio sistema), na ordem natural dos nomes, só os PDFs", async () => {
  const z = new ZipArmazenar(new Date(2026, 9, 2));
  const zip = juntar([
    ...z.adicionar("docs/DFD 10.pdf", pdf("dez")),
    ...z.adicionar("docs/DFD 2.pdf", pdf("dois")),
    ...z.adicionar("leia.txt", new TextEncoder().encode("texto")),
    ...z.fechar(),
  ]);
  assert.equal(ehZip(zip), true);
  assert.equal(ehZip(pdf("x")), false);
  assert.equal(entradasZip(zip).length, 3);
  const r = await arquivosDoZip(zip, ehPdf);
  assert.deepEqual(
    r.map((x) => [x.nome, new TextDecoder().decode(x.dados)]),
    [
      ["docs/DFD 2.pdf", "%PDF-1.7 dois"],
      ["docs/DFD 10.pdf", "%PDF-1.7 dez"],
    ],
  );
});

test("zip: descomprime DEFLATE e ignora ZIP quebrado", async () => {
  // Um ZIP com UMA entrada DEFLATE, montado à mão (cabeçalho local + diretório central + fim).
  const dados = pdf("comprimido ".repeat(20));
  const comp = new Uint8Array(await new Response(new Blob([dados]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  const nome = new TextEncoder().encode("p.pdf");
  const local = new Uint8Array(30 + nome.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(8, 8, true);
  lv.setUint32(18, comp.length, true);
  lv.setUint32(22, dados.length, true);
  lv.setUint16(26, nome.length, true);
  local.set(nome, 30);
  const central = new Uint8Array(46 + nome.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(20, comp.length, true);
  cv.setUint32(24, dados.length, true);
  cv.setUint16(28, nome.length, true);
  cv.setUint32(42, 0, true);
  central.set(nome, 46);
  const fim = new Uint8Array(22);
  const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, 1, true);
  fv.setUint16(10, 1, true);
  fv.setUint32(12, central.length, true);
  fv.setUint32(16, local.length + comp.length, true);
  const zip = juntar([local, comp, central, fim]);
  const r = await arquivosDoZip(zip, ehPdf);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].dados, dados);
  assert.deepEqual(entradasZip(zip.subarray(0, 40)), []);
});
