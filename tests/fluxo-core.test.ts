import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chaveJuncao,
  comparar,
  executarFluxo,
  type Grafo,
  interpolar,
  lerFrequencia,
  lerGrafo,
  numeroDe,
  proximaExecucao,
  resolverCaminho,
  temCicloSemLaco,
  validarGrafo,
} from "../src/lib/fluxo-core.ts";
import { REGISTRO_NOS } from "../src/lib/fluxo-nos.ts";

const ctx = (host: Record<string, unknown> = {}, centi: (a: string, d: unknown) => Record<string, unknown> = () => ({ ok: false })) => ({
  centi: async (a: string, d: unknown) => centi(a, d),
  api: async () => ({ ok: false }),
  cancelado: () => false,
  host,
});

const no = (id: string, tipo: string, config: Record<string, unknown> = {}) => ({ id, tipo, config, x: 0, y: 0 });
const con = (de: string, para: string, saida = "saida", entrada = "entrada") => ({ de, saida, para, entrada });

test("lerGrafo descarta nós repetidos e conexões soltas", () => {
  const g = lerGrafo({ nos: [no("a", "gatilho.inicio"), no("a", "x"), { id: "", tipo: "y" }], conexoes: [con("a", "z"), con("a", "a")] });
  assert.equal(g.nos.length, 1);
  assert.equal(g.conexoes.length, 0);
});

test("validarGrafo exige o Início e os campos obrigatórios", () => {
  const p = validarGrafo({ v: 1, nos: [no("f", "dados.filtrar")], conexoes: [] }, REGISTRO_NOS);
  assert.ok(p.some((x) => /Início/.test(x.texto)));
  assert.ok(p.some((x) => /Campo/.test(x.texto)));
});

test("ciclo só pelo Laço", () => {
  const ciclo: Grafo = { v: 1, nos: [no("a", "dados.filtrar"), no("b", "dados.filtrar")], conexoes: [con("a", "b"), con("b", "a")] };
  assert.equal(temCicloSemLaco(ciclo, REGISTRO_NOS), true);
  const laco: Grafo = { v: 1, nos: [no("l", "logica.laco"), no("b", "dados.campos")], conexoes: [con("l", "b", "lote"), con("b", "l", "saida", "volta")] };
  assert.equal(temCicloSemLaco(laco, REGISTRO_NOS), false);
});

test("comparar: sem acento/caixa e números pt-BR", () => {
  assert.equal(comparar("Execução", "igual", "EXECUCAO"), true);
  assert.equal(comparar("1.234,50", "maior", "1000"), true);
  assert.equal(comparar("", "vazio", null), true);
  assert.equal(comparar("B", "na_lista", "a; b; c"), true);
  assert.equal(numeroDe("R$ 2.500,00"), 2500);
  assert.equal(chaveJuncao("00123"), "123");
  assert.equal(resolverCaminho({ a: { b: 2 } }, "a.b"), 2);
  assert.equal(interpolar("DFD {{n}} / {{x.y}}", { n: 5, x: { y: "ok" } }), "DFD 5 / ok");
});

test("frequência: diário, dias úteis, semanal e intervalo (Brasília)", () => {
  const agora = new Date("2026-10-06T12:00:00Z"); // 09:00 em Brasília, terça
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "diario", hora: "08:00" }), agora), "2026-10-07T11:00:00.000Z");
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "diario", hora: "10:00" }), agora), "2026-10-06T13:00:00.000Z");
  const sex = new Date("2026-10-09T23:00:00Z");
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "diario", hora: "08:00", diasUteis: true }), sex), "2026-10-12T11:00:00.000Z");
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "semanal", hora: "08:00", dias: [5] }), agora), "2026-10-09T11:00:00.000Z");
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "intervalo", minutos: 1 }), agora), "2026-10-06T12:05:00.000Z");
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "manual" }), agora), null);
});

test("motor: Comparar DFDs × CM002 e Apontar erros dos diferentes", async () => {
  const host = { mapaEntidades: { "o:1": "2" }, chaveOrgao: (id: number | null) => (id ? `o:${id}` : null) };
  const g: Grafo = {
    v: 1,
    nos: [
      no("i", "gatilho.inicio"),
      no("cm", "centi.cm002"),
      no("cmp", "logica.comparar", { chaveA: "planejamento", chaveB: "planejamento", campoA: "execucaoCenti", campoB: "situacao" }),
      no("ap", "erros.apontar", { mensagem: "DFD {{numero}}: {{b.situacao}}" }),
      no("sa", "sistema.protocolos", { dfds: true }),
    ],
    conexoes: [con("i", "cm"), con("i", "sa"), con("sa", "cmp", "saida", "a"), con("cm", "cmp", "saida", "b"), con("cmp", "ap", "diferentes")],
  };
  const protocolos = [{ numero: "10", dfds: [{ numero: "1", planejamento: "0100", execucaoCenti: "EXECUTADO" }, { numero: "2", planejamento: "200", execucaoCenti: "" }] }];
  const r = await executarFluxo(g, REGISTRO_NOS, ctx({ ...host, protocolos }, (a) =>
    a === "cm002" ? { ok: true, linhas: [{ id: "100", situacao: "Executado" }, { id: "200", situacao: "Cancelado" }, { id: "300", situacao: "x" }] } : { ok: false },
  ));
  assert.equal(r.estado, "concluido", r.erro);
  assert.equal(r.apontados.length, 1);
  assert.equal(r.apontados[0].mensagem, "DFD 2: Cancelado");
  assert.equal(r.passos.cmp.amostra?.soEmB.length, 1);
});

test("motor: SE com ramo vazio não roda o nó seguinte; Juntar espera as duas entradas", async () => {
  const g: Grafo = {
    v: 1,
    nos: [
      no("i", "gatilho.inicio"),
      no("d", "dados.campos", { linhas: "x = 1" }),
      no("se", "logica.se", { campo: "x", operador: "igual", valor: "1" }),
      no("cm", "centi.cm002", { entidades: "2" }),
      no("j", "logica.juntar"),
    ],
    conexoes: [con("i", "d"), con("d", "se"), con("se", "cm", "falso"), con("se", "j", "verdadeiro", "a"), con("cm", "j", "saida", "b")],
  };
  let chamou = false;
  const r = await executarFluxo(g, REGISTRO_NOS, ctx({}, () => {
    chamou = true;
    return { ok: true, linhas: [] };
  }));
  assert.equal(r.estado, "concluido", r.erro);
  assert.equal(chamou, false);
  assert.equal(r.passos.cm.estado, "ignorado");
  assert.equal(r.passos.j.itens, 1);
});

test("motor: Laço até o fim processa todos os lotes e entrega em fim", async () => {
  const g: Grafo = {
    v: 1,
    nos: [
      no("i", "gatilho.inicio"),
      no("rep", "centi.reparticoes"),
      no("l", "logica.laco", { tamanho: 2 }),
      no("c", "dados.campos", { linhas: "visto = sim" }),
      no("o", "dados.ordenar", { campo: "reparticao", ordem: "desc" }),
    ],
    conexoes: [con("i", "rep"), con("rep", "l"), con("l", "c", "lote"), con("c", "l", "saida", "volta"), con("l", "o", "fim")],
  };
  const r = await executarFluxo(g, REGISTRO_NOS, ctx({}, () => ({ ok: true, departamentos: ["A", "B", "C", "D", "E"] })));
  assert.equal(r.estado, "concluido", r.erro);
  assert.equal(r.passos.c.vezes, 3);
  assert.equal(r.passos.o.itens, 5);
  assert.equal(r.passos.o.amostra?.saida[0].reparticao, "E");
  assert.equal(r.passos.o.vezes, 1);
});

test("motor: erro sem a saída 'erro' para o fluxo; com ela, segue", async () => {
  const base: Grafo = { v: 1, nos: [no("i", "gatilho.inicio"), no("rep", "centi.reparticoes"), no("ap", "erros.apontar", { mensagem: "{{erro}}" })], conexoes: [con("i", "rep")] };
  const falha = () => ({ ok: false, erro: "Centi fora" });
  const r1 = await executarFluxo(base, REGISTRO_NOS, ctx({}, falha));
  assert.equal(r1.estado, "falhou");
  assert.equal(r1.noErro, "rep");
  const r2 = await executarFluxo({ ...base, conexoes: [...base.conexoes, con("rep", "ap", "erro")] }, REGISTRO_NOS, ctx({}, falha));
  assert.equal(r2.estado, "concluido", r2.erro);
  assert.equal(r2.apontados[0].mensagem, "Centi fora");
});

test("Protocolos por situação exige a extensão que filtra", async () => {
  const g: Grafo = { v: 1, nos: [no("i", "gatilho.inicio"), no("p", "centi.protocolos", { situacao: "ANALISADO" })], conexoes: [con("i", "p")] };
  const velho = await executarFluxo(g, REGISTRO_NOS, ctx({}, () => ({ ok: true, protocolos: [{ protocolo: "1" }] })));
  assert.equal(velho.estado, "falhou");
  const novo = await executarFluxo(g, REGISTRO_NOS, ctx({}, () => ({ ok: true, filtro: "ANALISADO", protocolos: [{ protocolo: "1", ano: "2026" }] })));
  assert.equal(novo.estado, "concluido");
  assert.equal(novo.passos.p.itens, 1);
});

test("modelos prontos são válidos", async () => {
  const { MODELOS_FLUXO } = await import("../src/lib/fluxo-modelos.ts");
  for (const m of MODELOS_FLUXO) assert.deepEqual(validarGrafo(m.grafo, REGISTRO_NOS).filter((p) => p.nivel === "erro"), [], m.nome);
});

test("modelo de protocolos analisados roda o laço com erro de leitura sem travar", async () => {
  const { MODELOS_FLUXO } = await import("../src/lib/fluxo-modelos.ts");
  const g = MODELOS_FLUXO.find((m) => m.id === "analisados")?.grafo as Grafo;
  let lidos = 0;
  const r = await executarFluxo(g, REGISTRO_NOS, {
    centi: async (a: string) =>
      a === "telaDepartamentos"
        ? { ok: true, departamentos: ["DEP. PLANEJAMENTO - PCA", "OUTRO"] }
        : { ok: true, filtro: "ANALISADO", protocolos: [{ protocolo: "1", ano: "2026", id: "9", departamento: "DEP. PLANEJAMENTO - PCA" }, { protocolo: "2", ano: "2026", id: "8", departamento: "DEP. PLANEJAMENTO - PCA" }, { protocolo: "3", ano: "2026", departamento: "OUTRO" }] },
    api: async () => ({ ok: false }),
    cancelado: () => false,
    host: {
      lerProtocolo: async (it: Record<string, unknown>) => {
        lidos++;
        if (it.protocolo === "2") throw new Error("Centi fora");
        return { leitura: "ok", leituraTexto: "3 DFD(s)" };
      },
    },
  });
  assert.equal(r.estado, "concluido", r.erro);
  assert.equal(lidos, 2);
  assert.equal(r.apontados.length, 1);
});
