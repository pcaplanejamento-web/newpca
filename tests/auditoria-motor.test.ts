import assert from "node:assert/strict";
import { test } from "node:test";
import { agendadaVencida, agendaMudou, type DefNo, executarFluxo, type Item, lerFrequencia, lerGrafo, type Portas } from "../src/lib/fluxo-core.ts";

// Registro mínimo (independente dos nós reais): início, iterador um por vez, corpo, coletor e junção.
const base = { descricao: "", icone: "", campos: [] };
const def = (d: Partial<DefNo> & Pick<DefNo, "tipo" | "executar">): DefNo => ({ categoria: "dados", rotulo: d.tipo, entradas: ["entrada"], saidas: ["saida"], ...base, ...d }) as DefNo;
const coletados: Record<string, Item[]> = {};
let corpoRodou = 0;
const REG = new Map<string, DefNo>([
  ["t.inicio", def({ tipo: "t.inicio", categoria: "gatilho", entradas: [], unico: true, executar: async (_e, c) => ({ saida: (c.itens as Item[]) ?? [{ n: 1 }] }) })],
  [
    "t.iter",
    def({
      tipo: "t.iter",
      entradas: ["entrada", "volta"],
      saidas: ["item", "fim"],
      rodaSemItens: true,
      entregaParcial: true,
      iterador: true,
      executar: async (e, c, _ctx, est): Promise<Portas> => {
        if (c.falhar) throw new Error("falhou");
        if (e.entrada) est.fila = [...e.entrada];
        const fila = est.fila as Item[];
        const prox = fila.shift();
        return prox ? { item: [prox] } : { fim: [] };
      },
    }),
  ],
  [
    "t.corpo",
    def({
      tipo: "t.corpo",
      executar: async (e) => {
        corpoRodou++;
        return { saida: e.entrada ?? [] };
      },
    }),
  ],
  [
    "t.coletar",
    def({
      tipo: "t.coletar",
      saidas: [],
      executar: async (e, c) => {
        coletados[c.nome as string] = [...(coletados[c.nome as string] ?? []), ...Object.values(e).flat()];
        return {};
      },
    }),
  ],
  [
    "t.lista",
    def({ tipo: "t.lista", entradas: ["entrada", "volta"], saidas: ["saida", "item", "fim"], iterador: true, executar: async (e) => ({ saida: e.entrada ?? [], fim: [] }) }),
  ],
  // Laço sem fim: a volta sempre devolve o mesmo item ao corpo.
  ["t.semfim", def({ tipo: "t.semfim", entradas: ["entrada", "volta"], saidas: ["item", "fim"], rodaSemItens: true, entregaParcial: true, iterador: true, executar: async (e) => ({ item: e.entrada ?? e.volta ?? [] }) })],
  ["t.juntar", def({ tipo: "t.juntar", entradas: ["a", "b"], rodaSemItens: true, executar: async (e) => ({ saida: [...(e.a ?? []), ...(e.b ?? [])] }) })],
]);
const ctx = { centi: async () => ({ ok: false }), api: async () => ({ ok: false }), cancelado: () => false, host: {} };
const no = (id: string, tipo: string, config: Record<string, unknown> = {}, extra = {}) => ({ id, tipo, config, x: 0, y: 0, ...extra });
const con = (de: string, para: string, saida = "saida", entrada = "entrada") => ({ de, saida, para, entrada });
const limpar = () => {
  for (const k of Object.keys(coletados)) delete coletados[k];
  corpoRodou = 0;
};

test("erro num iterador com a saída 'erro' ligada não realimenta o laço", async () => {
  limpar();
  const g = {
    nos: [no("i", "t.inicio"), no("it", "t.iter", { falhar: true }), no("c", "t.corpo"), no("e", "t.coletar", { nome: "erros" })],
    conexoes: [con("i", "it"), con("it", "c", "item"), con("c", "it", "saida", "volta"), con("it", "e", "erro")],
  };
  const r = await executarFluxo(lerGrafo(g), REG, ctx);
  assert.equal(r.estado, "concluido", `${r.erro}`);
  assert.equal(coletados.erros.length, 1);
  assert.equal(corpoRodou, 0);
});

test("iterador DESATIVADO não repassa a volta ao corpo sem fim", async () => {
  limpar();
  const g = {
    nos: [no("i", "t.inicio"), no("it", "t.iter", {}, { desativado: true }), no("c", "t.corpo"), no("f", "t.coletar", { nome: "fim" })],
    conexoes: [con("i", "it"), con("it", "c", "item"), con("c", "it", "saida", "volta"), con("it", "f", "fim")],
  };
  const r = await executarFluxo(lerGrafo(g), REG, ctx);
  assert.equal(r.estado, "concluido", `${r.erro}`);
  assert.equal(corpoRodou, 0);
  assert.deepEqual(coletados.fim, [{ n: 1 }]);
});

test("nó desativado entrega a saída 'erro' vazia (a junção não trava)", async () => {
  limpar();
  const g = {
    nos: [no("i", "t.inicio"), no("a", "t.corpo", {}, { desativado: true }), no("j", "t.juntar"), no("s", "t.coletar", { nome: "fim" })],
    conexoes: [con("i", "a"), con("a", "j", "saida", "a"), con("a", "j", "erro", "b"), con("j", "s")],
  };
  const r = await executarFluxo(lerGrafo(g), REG, ctx);
  assert.equal(r.estado, "concluido", `${r.erro}`);
  assert.deepEqual(coletados.fim, [{ n: 1 }]);
});

test("iterador um por vez com 1.500 itens não estoura o teto de passos no meio", async () => {
  limpar();
  const itens = Array.from({ length: 1500 }, (_, n) => ({ n }));
  const g = {
    nos: [no("i", "t.inicio", { itens }), no("it", "t.iter"), no("c", "t.corpo"), no("f", "t.coletar", { nome: "fim" })],
    conexoes: [con("i", "it"), con("it", "c", "item"), con("c", "it", "saida", "volta"), con("it", "f", "fim")],
  };
  const r = await executarFluxo(lerGrafo(g), REG, ctx);
  assert.equal(r.estado, "concluido", `${r.erro}`);
  assert.equal(corpoRodou, 1500);
});

test("salvar sem mudar frequência nem ligado não reagenda", () => {
  const freq = lerFrequencia({ tipo: "intervalo", minutos: 60 });
  const atual = { frequencia: freq, ativo: true };
  assert.equal(agendaMudou(atual, lerFrequencia(JSON.parse(JSON.stringify(freq))), true), false);
  assert.equal(agendaMudou(atual, freq, false), true);
  assert.equal(agendaMudou(atual, lerFrequencia({ tipo: "intervalo", minutos: 120 }), true), true);
});

test("a agendada que venceu DURANTE a manual fica; a que já vencia antes, a manual cobre", () => {
  const agora = Date.parse("2026-11-23T11:03:00Z");
  const inicio = Date.parse("2026-11-23T10:50:00Z");
  assert.equal(agendadaVencida("2026-11-23T11:00:00Z", agora, inicio), true);
  assert.equal(agendadaVencida("2026-11-23T08:00:00Z", agora, inicio), false);
  assert.equal(agendadaVencida("2026-11-23T12:00:00Z", agora, inicio), false);
  assert.equal(agendadaVencida(null, agora, inicio), false);
  assert.equal(agendadaVencida("2026-11-23T11:00:00Z", agora, Number.NaN), false);
});

test("iterador desativado cuja 1ª saída é 'saida' repassa a entrada por ela", async () => {
  limpar();
  const g = {
    nos: [no("i", "t.inicio"), no("l", "t.lista", {}, { desativado: true }), no("s", "t.coletar", { nome: "saida" })],
    conexoes: [con("i", "l"), con("l", "s")],
  };
  const r = await executarFluxo(lerGrafo(g), REG, ctx);
  assert.equal(r.estado, "concluido", `${r.erro}`);
  assert.deepEqual(coletados.saida, [{ n: 1 }]);
});

test("laço sem fim para num teto proporcional à fila", async () => {
  limpar();
  const g = {
    nos: [no("i", "t.inicio"), no("it", "t.semfim"), no("c", "t.corpo")],
    conexoes: [con("i", "it"), con("it", "c", "item"), con("c", "it", "saida", "volta")],
  };
  const r = await executarFluxo(lerGrafo(g), REG, ctx);
  assert.equal(r.estado, "falhou");
  assert.match(r.erro ?? "", /Passos demais \(2012\)/);
});
