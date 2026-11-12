import assert from "node:assert/strict";
import { test } from "node:test";
import { diferencasDfdCenti, MAX_MOTIVO_CENTI, motivoDivergencias } from "../src/lib/conferencia-dfd-centi.ts";
import { compararDfdCenti } from "../src/lib/fluxo-nos.ts";
import type { DfdParseado } from "../src/lib/parse-dfd-comum.ts";

const item = (n: number, q = 10, vu = 5) => ({ item: n, codigo: `12345${n}`, descricao: `PRODUTO ${n} DE TESTE`, unidade: "UN", quantidade: q, valorUnitario: vu, valorTotal: q * vu });
const base = (): DfdParseado => ({
  numero: "123",
  planejamento: "456",
  tipo: "DFD-S",
  objeto: "Aquisição de materiais de escritório",
  orgaoEntidade: "PREFEITURA",
  setorRequisitante: "SEC. ADMINISTRAÇÃO",
  siglaSetor: null,
  responsavel: "FULANO",
  matricula: "123",
  email: "a@b.gov.br",
  telefone: "64 9999-0000",
  anoPca: 2027,
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  valorTotal: 100,
  nomeArquivo: "x.pdf",
  secoes: [
    { numero: 3, titulo: "3 - JUSTIFICATIVA", texto: "Necessidade de reposição, conforme demanda." },
    { numero: 6, titulo: "6 - PRIORIDADE", texto: "ALTA" },
  ],
  itens: [item(1), item(2)],
  assinaturas: [],
});
const sistema = (d = base()) => ({ ...d, reparticaoId: 1, anoPca: 2027 });

test("conferência × Centi: igual = nenhuma diferença (quebra de linha e pontuação não contam)", () => {
  const c = base();
  c.secoes[0] = { ...c.secoes[0], texto: "Necessidade de reposição conforme\ndemanda" };
  c.secoes[1] = { ...c.secoes[1], texto: "alta" };
  c.objeto = "AQUISIÇÃO DE MATERIAIS  DE ESCRITÓRIO.";
  assert.deepEqual(diferencasDfdCenti(sistema(), c), []);
});

test("conferência × Centi: cada diferença em frase (cabeçalho, seção, itens)", () => {
  const c = base();
  c.objeto = "Aquisição de cadeiras";
  c.responsavel = "BELTRANO";
  c.secoes[0] = { ...c.secoes[0], texto: "Outro motivo" };
  c.itens = [item(1, 12, 6), item(3)];
  c.valorTotal = 122;
  const d = diferencasDfdCenti(sistema(), c);
  assert.ok(d.some((x) => x.startsWith("Objeto: “Aquisição de materiais de escritório” no sistema × “Aquisição de cadeiras” na Centi")));
  assert.ok(d.some((x) => x.startsWith("Responsável: “FULANO” no sistema × “BELTRANO”")));
  assert.ok(d.some((x) => x.startsWith("Seção 3 - JUSTIFICATIVA diferente")));
  assert.ok(d.some((x) => /^Item 1 \(cód\. 123451\): quantidade 10 × 12, valor unitário R\$\s5,00 × R\$\s6,00 \(sistema × Centi\)$/.test(x)));
  assert.ok(d.includes("Item 3 (cód. 123453) só na Centi"));
  assert.ok(d.includes("Item 2 (cód. 123452) só no sistema"));
  assert.ok(d.some((x) => /^Valor total: R\$\s100,00 no sistema × R\$\s122,00 na Centi$/.test(x)));
});

test("conferência × Centi: valor dentro da tolerância não é diferença", () => {
  const c = base();
  c.valorTotal = 100.005;
  assert.deepEqual(diferencasDfdCenti(sistema(), c, 0.01), []);
});

test("motivo: teto com “e mais N”", () => {
  const difs = Array.from({ length: 200 }, (_, i) => `Diferença número ${i} com algum texto para ocupar espaço`);
  const m = motivoDivergencias("DFD 1 (Planej. 2)", difs);
  assert.ok(m.length <= MAX_MOTIVO_CENTI);
  assert.match(m, /^DFD 1 \(Planej\. 2\): 200 diferenças — /);
  assert.match(m, /; e mais \d+$/);
});

test("compararDfdCenti: com o DFD inteiro dos dois lados, o motivo lista tudo; o DFD inteiro não segue adiante", () => {
  const c = base();
  c.objeto = "Aquisição de cadeiras";
  const r = compararDfdCenti(
    [{ id: 9, numero: "123", planejamento: "456", tipo: "DFD-S", valor: 100, totalItens: 2, objeto: base().objeto, dfdSistema: sistema(), centi: { numero: "123", tipo: "DFD-S", valor: 100, totalItens: 2, dfd: c } }],
    { tolerancia: 0.01, objeto: true },
  );
  assert.equal(r.divergentes.length, 1);
  assert.match(String(r.divergentes[0].mensagem), /^DFD 123 \(Planej\. 456\): 1 diferença — Objeto: /);
  assert.equal("dfdSistema" in r.divergentes[0], false);
  assert.equal("dfd" in (r.divergentes[0].centi as object), false);
  const igual = compararDfdCenti([{ id: 9, numero: "123", planejamento: "456", dfdSistema: sistema(), centi: { numero: "123", dfd: base() } }], { tolerancia: 0.01, objeto: true });
  assert.equal(igual.conformes.length, 1);
});
