import assert from "node:assert/strict";
import { test } from "node:test";
import { chaveMotivo, conferenciaDoRetrato, montarRetrato, tiposDoMotivo } from "../src/lib/conferencia-dfd-centi.ts";
import { aplicarCentiPorTipos, planoCorrecao, tiposCorrigiveis } from "../src/lib/correcao-centi-core.ts";
import { compararDfdCenti } from "../src/lib/fluxo-nos.ts";
import { valorDosItens, type DfdParseado } from "../src/lib/parse-dfd-comum.ts";
import { estadoEscolha, semMarcas } from "../src/lib/sobrescrita-dfd.ts";

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
const retrato = (c: DfdParseado) => montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "1" }, { situacao: "Aprovado", numero: "123", tipo: c.tipo }, c, { objeto: true, tolerancia: 0.01 });
const comparavel = (d: DfdParseado) => ({ ...d, reparticaoId: 1 });

function centiDivergente(): DfdParseado {
  const c = base();
  c.objeto = "Aquisição de materiais de limpeza";
  c.secoes[0] = { ...c.secoes[0], texto: "Outra justificativa." };
  c.itens = [item(1, 20), { ...item(2), descricao: "PRODUTO DOIS" }, item(3)];
  c.valorTotal = valorDosItens(c.itens);
  return c;
}

test("corrigir pela Centi: aplicar todas as divergências deixa a conferência CONVERGENTE", () => {
  const s = base();
  const r = retrato(centiDivergente());
  assert.equal(conferenciaDoRetrato(comparavel(s), r).status, "divergente");
  const p = planoCorrecao(s, r, 2027);
  const corrigido = semMarcas(aplicarCentiPorTipos(s, p));
  assert.equal(corrigido.numero, "123");
  assert.equal(corrigido.planejamento, "456");
  assert.equal(corrigido.itens.length, 3);
  assert.equal(corrigido.valorTotal, valorDosItens(corrigido.itens));
  assert.deepEqual(conferenciaDoRetrato(comparavel(corrigido), r), { status: "convergente", motivo: null });
});

test("corrigir pela Centi: os tipos do plano são os do filtro da coluna Centi", () => {
  const s = base();
  const r = retrato(centiDivergente());
  const p = planoCorrecao(s, r, 2027);
  const doMotivo = tiposDoMotivo(conferenciaDoRetrato(comparavel(s), r).motivo);
  for (const t of tiposCorrigiveis(p)) assert.ok(doMotivo.includes(t), `tipo ${t} fora do motivo ${doMotivo.join(", ")}`);
  for (const t of doMotivo) assert.ok(tiposCorrigiveis(p).includes(t), `tipo ${t} do motivo sem correção`);
});

test("corrigir pela Centi: só os tipos escolhidos — o resto fica como no sistema", () => {
  const s = base();
  const r = retrato(centiDivergente());
  const p = planoCorrecao(s, r, 2027);
  const so = semMarcas(aplicarCentiPorTipos(s, p, ["Objeto"]));
  assert.equal(so.objeto, "Aquisição de materiais de limpeza");
  assert.equal(so.itens.length, 2);
  assert.equal(so.secoes[0].texto, s.secoes[0].texto);
  const qtd = semMarcas(aplicarCentiPorTipos(s, p, ["Item: quantidade"]));
  assert.equal(qtd.itens[0].quantidade, 20);
  assert.equal(qtd.itens[1].descricao, "PRODUTO 2 DE TESTE");
  assert.equal(qtd.objeto, s.objeto);
});

test("corrigir pela Centi: pontuação e centavos dentro da tolerância não são corrigidos", () => {
  const s = base();
  const c = base();
  c.objeto = "AQUISIÇÃO DE MATERIAIS DE ESCRITÓRIO.";
  c.itens = [{ ...item(1), valorUnitario: 5.0004, valorTotal: 50.004 }, item(2)];
  const p = planoCorrecao(s, retrato(c), 2027);
  assert.deepEqual(p.divergentes, []);
  assert.deepEqual(semMarcas(aplicarCentiPorTipos(s, p)).objeto, s.objeto);
});

test("aceite: a chave do motivo muda quando a divergência muda", () => {
  assert.equal(chaveMotivo("a"), chaveMotivo("a"));
  assert.notEqual(chaveMotivo("a"), chaveMotivo("b"));
});

test("retrato: refazer a conferência dá o MESMO motivo da automação", () => {
  const c = centiDivergente();
  const s = base();
  const r = compararDfdCenti(
    [{ id: 1, numero: "123", planejamento: "456", tipo: "DFD-S", entidade: "1", dfdSistema: comparavel(s), centi: { numero: "123", tipo: c.tipo, situacao: "Aprovado", dfd: c } }],
    { tolerancia: 0.01, objeto: true },
  );
  assert.equal(r.divergentes.length, 1);
  assert.equal(conferenciaDoRetrato(comparavel(s), retrato(c)).motivo, r.divergentes[0].mensagem);
});

test("banner: só as divergências vêm “Usar Centi”; pontuação diferente fica “Manter sistema”", () => {
  const s = base();
  const c = centiDivergente();
  c.responsavel = "fulano."; // só pontuação/caixa: não diverge
  const p = planoCorrecao(s, retrato(c), 2027);
  const trabalho = aplicarCentiPorTipos(s, p);
  const divergentes = new Set(p.divergentes.map((d) => d.entrada.chave));
  for (const e of p.entradas) {
    const est = estadoEscolha(e, trabalho, s, p.centi);
    assert.equal(est, divergentes.has(e.chave) ? "novo" : "gravado", `${e.chave}: ${est}`);
  }
  assert.ok(p.entradas.some((e) => e.chave === "responsavel"));
  assert.ok(!divergentes.has("responsavel"));
});

test("massa: no item dos dois lados, só os campos dos tipos escolhidos", () => {
  const s = base();
  const c = base();
  c.itens = [{ ...item(1, 20), descricao: "PRODUTO UM" }, item(2), item(3)];
  const p = planoCorrecao(s, retrato(c), 2027);
  const d = semMarcas(aplicarCentiPorTipos(s, p, ["Item: descrição"]));
  assert.equal(d.itens[0].descricao, "PRODUTO UM");
  assert.equal(d.itens[0].quantidade, 10, "a quantidade fica a do sistema");
  assert.equal(d.itens.length, 2, "o item só da Centi não entra");
  const v = semMarcas(aplicarCentiPorTipos(s, p, ["Valor total"]));
  assert.equal(v.itens[0].quantidade, 20);
  assert.equal(v.itens[0].valorTotal, 100);
  assert.equal(v.itens[0].descricao, "PRODUTO 1 DE TESTE");
  assert.equal(v.itens.length, 2, "Valor total não acrescenta itens");
  assert.equal(v.valorTotal, valorDosItens(v.itens));
});

test("retrato: o Tipo e o nº comparados são os do LOAD da Centi (como a automação)", () => {
  const s = base();
  const c = base();
  c.tipo = null; // o PDF sem o "Tipo DFD:"
  const r = montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "1" }, { situacao: "Aprovado", numero: "123", tipo: "DFD-R" }, c, { objeto: true, tolerancia: 0.01 });
  const auto = compararDfdCenti(
    [{ id: 1, numero: "123", planejamento: "456", tipo: "DFD-S", entidade: "1", dfdSistema: comparavel(s), centi: { numero: "123", tipo: "DFD-R", situacao: "Aprovado", dfd: c } }],
    { tolerancia: 0.01, objeto: true },
  );
  const rec = conferenciaDoRetrato(comparavel(s), r);
  assert.equal(rec.status, "divergente");
  assert.equal(rec.motivo, auto.divergentes[0].mensagem);
  const corrigido = semMarcas(aplicarCentiPorTipos(s, planoCorrecao(s, r, 2027)));
  assert.equal(corrigido.tipo, "DFD-R");
  assert.equal(conferenciaDoRetrato(comparavel(corrigido), r).status, "convergente");
});
