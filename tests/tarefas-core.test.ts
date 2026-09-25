import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estadoPrazo,
  excedeWip,
  FILTRO_TAREFAS_PADRAO,
  filtrarTarefas,
  moverCartao,
  ordemEntre,
  resumoQuadro,
  gradeMes,
  hrefVinculo,
  lerVinculo,
  mencoesDoTexto,
  progressoChecklist,
  rotuloData,
  tarefasPorPrazo,
  textoMencao,
  somarDias,
  type TarefaResumo,
  vizinhos,
} from "../src/lib/tarefas-core.ts";
import { linhasPlanilhaTarefas } from "../src/lib/exportar-tarefas.ts";
import { criarTarefaSchema, editarTarefaSchema, moverTarefaSchema, ordemListasSchema } from "../src/lib/tarefas-validation.ts";

const T = (id: number, listaId: number, ordem: number, x: Partial<TarefaResumo> = {}): TarefaResumo => ({
  id,
  listaId,
  ticket: id,
  titulo: `Tarefa ${id}`,
  prioridade: "media",
  inicio: null,
  prazo: null,
  ordem,
  concluidaEm: null,
  arquivada: false,
  pessoas: [],
  observadores: [],
  etiquetas: [],
  criadoEm: null,
  atualizadoEm: null,
  estimativaH: null,
  vinculo: null,
  checklist: { feitos: 0, total: 0 },
  comentarios: 0,
  anexos: 0,
  ...x,
});
const LISTAS = [
  { id: 1, nome: "A fazer", ordem: 1, limiteWip: null, concluida: false, arquivada: false },
  { id: 2, nome: "Concluído", ordem: 2, limiteWip: null, concluida: true, arquivada: false },
];

describe("tarefas-core", () => {
  it("estado do prazo: atrasada · hoje · vence em até 2 dias · no prazo · sem · concluída", () => {
    const hoje = "2026-09-25";
    assert.equal(estadoPrazo("2026-09-24", hoje, false), "atrasada");
    assert.equal(estadoPrazo("2026-09-25", hoje, false), "hoje");
    assert.equal(estadoPrazo("2026-09-27", hoje, false), "vence");
    assert.equal(estadoPrazo("2026-09-28", hoje, false), "ok");
    assert.equal(estadoPrazo(null, hoje, false), "sem");
    assert.equal(estadoPrazo("lixo", hoje, false), "sem");
    assert.equal(estadoPrazo("2026-09-01", hoje, true), "concluida");
    assert.equal(somarDias("2026-12-30", 3), "2027-01-02");
  });

  it("ordem fracionária entre vizinhos (pontas e renumeração quando o vão acaba)", () => {
    assert.deepEqual(ordemEntre(null, null), { ordem: 1, renumerar: false });
    assert.deepEqual(ordemEntre(null, 5), { ordem: 4, renumerar: false });
    assert.deepEqual(ordemEntre(5, null), { ordem: 6, renumerar: false });
    assert.equal(ordemEntre(1, 2).ordem, 1.5);
    assert.equal(ordemEntre(1, 1 + 1e-7).renumerar, true);
  });

  it("mover: vizinhos certos, ordem entre eles e conclusão ao entrar/sair da lista de concluídas", () => {
    const ts = [T(1, 1, 1), T(2, 1, 2), T(3, 1, 3), T(4, 2, 1)];
    assert.deepEqual(vizinhos(ts, 3, 1, 1), { anteriorId: 1, proximoId: 2 });
    const m = moverCartao(ts, LISTAS, 3, 1, 1, "2026-09-25 10:00:00");
    assert.equal(m.find((t) => t.id === 3)?.ordem, 1.5);
    const c = moverCartao(ts, LISTAS, 1, 2, 0, "2026-09-25 10:00:00");
    assert.deepEqual([c[0].listaId, c[0].concluidaEm, c[0].ordem], [2, "2026-09-25 10:00:00", 0]);
    const volta = moverCartao(c, LISTAS, 1, 1, 0, "x");
    assert.equal(volta[0].concluidaEm, null);
  });

  it("filtros: eu · sem responsável · pessoa · prazo · prioridade · etiqueta · busca por título ou ticket", () => {
    const hoje = "2026-09-25";
    const ts = [
      T(1, 1, 1, { pessoas: [7], prazo: "2026-09-20", prioridade: "alta", etiquetas: [3] }),
      T(2, 1, 2, { pessoas: [], prazo: "2026-09-25" }),
      T(3, 1, 3, { pessoas: [8], prazo: "2026-09-29", titulo: "Relatório mensal" }),
      T(4, 1, 4, { pessoas: [7], prazo: "2026-09-20", concluidaEm: "x" }),
    ];
    const f = (x: Partial<typeof FILTRO_TAREFAS_PADRAO>) => filtrarTarefas(ts, { ...FILTRO_TAREFAS_PADRAO, ...x }, { usuarioId: 7, hoje }).map((t) => t.id);
    assert.deepEqual(f({ responsavel: "eu" }), [1, 4]);
    assert.deepEqual(f({ responsavel: "sem" }), [2]);
    assert.deepEqual(f({ responsavel: 8 }), [3]);
    assert.deepEqual(f({ prazo: "atrasadas" }), [1]);
    assert.deepEqual(f({ prazo: "hoje" }), [2]);
    assert.deepEqual(f({ prazo: "semana" }), [2, 3]);
    assert.deepEqual(f({ prioridade: "alta" }), [1]);
    assert.deepEqual(f({ etiqueta: 3 }), [1]);
    assert.deepEqual(f({ busca: "relatorio" }), [3]);
    assert.deepEqual(f({ busca: "#2:#4" }), [2, 4]);
  });

  it("WIP e resumo do quadro", () => {
    assert.equal(excedeWip(5, 4), true);
    assert.equal(excedeWip(4, 4), false);
    assert.equal(excedeWip(9, null), false);
    const r = resumoQuadro([T(1, 1, 1, { prazo: "2026-01-01" }), T(2, 1, 2, { concluidaEm: "x" }), T(3, 1, 3, { arquivada: true })], "2026-09-25");
    assert.deepEqual(r, { abertas: 1, atrasadas: 1, concluidas: 1 });
  });

  it("validação: título, datas (início ≤ prazo), mover e ordem sem repetição", () => {
    assert.equal(criarTarefaSchema.safeParse({ quadroId: 1, listaId: 1, titulo: " " }).success, false);
    assert.equal(criarTarefaSchema.safeParse({ quadroId: 1, listaId: 1, titulo: "X", inicio: "2026-10-02", prazo: "2026-10-01" }).success, false);
    assert.equal(criarTarefaSchema.safeParse({ quadroId: 1, listaId: 1, titulo: "X", prazo: "2026-02-30" }).success, true); // Date.parse aceita; a data vira "sem" se inválida
    assert.equal(editarTarefaSchema.safeParse({ prioridade: "critica" }).success, false);
    assert.deepEqual(criarTarefaSchema.parse({ quadroId: 1, listaId: 1, titulo: "X", pessoas: [2, 2, 3] }).pessoas, [2, 3]);
    assert.equal(moverTarefaSchema.safeParse({ listaId: 1, anteriorId: null, proximoId: 4 }).success, true);
    assert.equal(ordemListasSchema.safeParse({ ids: [1, 1] }).success, false);
  });
});

describe("rotuloData", () => {
  it("dia/mês no ano corrente, com o ano fora dele; inválida = vazio", () => {
    assert.equal(rotuloData("2026-09-25", "2026-01-01"), "25/09");
    assert.equal(rotuloData("2027-01-03", "2026-12-31"), "03/01/2027");
    assert.equal(rotuloData(null, "2026-01-01"), "");
    assert.equal(rotuloData("x", "2026-01-01"), "");
  });
});

describe("vínculo, checklist e menções", () => {
  it("lerVinculo/hrefVinculo: protocolo e DFD abrem na Mesa, PCA e orçamento no espaço deles; inválido = null", () => {
    assert.deepEqual(lerVinculo("protocolo:12"), { tipo: "protocolo", id: 12 });
    assert.equal(lerVinculo("dfd:0"), null);
    assert.equal(lerVinculo("x:1"), null);
    assert.equal(lerVinculo(undefined), null);
    assert.equal(hrefVinculo({ tipo: "dfd", id: 7 }), "/painel/mesa?abrir=dfd:7");
    assert.equal(hrefVinculo({ tipo: "pca", id: 3 }), "/painel/pca/3");
    assert.equal(hrefVinculo({ tipo: "orcamento", id: 4 }), "/painel/orcamento/4");
  });
  it("progressoChecklist conta os feitos", () => {
    assert.deepEqual(progressoChecklist([{ feito: true }, { feito: false }, { feito: true }]), { feitos: 2, total: 3 });
    assert.deepEqual(progressoChecklist([]), { feitos: 0, total: 0 });
  });
  it("mencoesDoTexto: apelido, nome inteiro sem espaço e 1º nome (só quando não é ambíguo), sem caixa/acento", () => {
    const pessoas = [
      { id: 1, nome: "Ana Souza", apelido: "Aninha" },
      { id: 2, nome: "Ana Lima", apelido: null },
      { id: 3, nome: "José Álvares", apelido: null },
    ];
    assert.deepEqual(mencoesDoTexto("oi @aninha e @jose", pessoas).sort(), [1, 3]);
    assert.deepEqual(mencoesDoTexto("@Ana, veja", pessoas), []); // dois "Ana": ambíguo
    assert.deepEqual(mencoesDoTexto("@AnaLima", pessoas), [2]);
    assert.deepEqual(mencoesDoTexto("sem citação", pessoas), []);
    assert.equal(textoMencao({ nome: "José Álvares", apelido: null }), "@José");
    assert.equal(textoMencao({ nome: "Ana Souza", apelido: "Ana S" }), "@AnaS");
  });
});

describe("calendário", () => {
  it("gradeMes: semanas de domingo a sábado cobrindo o mês", () => {
    const g = gradeMes(2026, 9); // set/2026 começa numa terça
    assert.equal(g[0][0], "2026-08-30");
    assert.equal(g[0][2], "2026-09-01");
    assert.equal(g.at(-1)?.at(-1), "2026-10-03");
    assert.ok(g.every((s) => s.length === 7));
    assert.equal(gradeMes(2026, 2).length, 4); // fev/2026: dom 01 → sáb 28 = exatamente 4 semanas
  });
  it("tarefasPorPrazo agrupa por dia e ignora sem prazo", () => {
    const m = tarefasPorPrazo([T(2, 1, 1, { prazo: "2026-09-10" }), T(1, 1, 2, { prazo: "2026-09-10" }), T(3, 1, 3)]);
    assert.deepEqual(m.get("2026-09-10")?.map((t) => t.id), [1, 2]);
    assert.equal(m.size, 1);
  });
});

describe("exportar", () => {
  it("linhasPlanilhaTarefas: cabeçalho + uma linha por tarefa, com nomes e rótulos", () => {
    const l = linhasPlanilhaTarefas([T(5, 1, 1, { prazo: "2026-09-01", pessoas: [7], etiquetas: [3], checklist: { feitos: 1, total: 2 }, vinculo: { tipo: "dfd", id: 9, rotulo: "1209" } })], {
      listas: [{ id: 1, nome: "A fazer", ordem: 1, limiteWip: null, concluida: false, arquivada: false }],
      etiquetas: [{ id: 3, nome: "Licitação", cor: "#000000" }],
      pessoas: [{ id: 7, nome: "Ana Souza", apelido: "Ana", foto: null }],
      hoje: "2026-09-25",
    });
    assert.equal(l.length, 2);
    assert.deepEqual(l[1].slice(0, 6), ["#5", "Tarefa 5", "A fazer", "Média", "Atrasada", "01/09/2026"]);
    assert.equal(l[1][8], "Ana");
    assert.equal(l[1][10], "Licitação");
    assert.equal(l[1][11], "1/2");
    assert.equal(l[1][12], "DFD 1209");
  });
});
