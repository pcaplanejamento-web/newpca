import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diasSemanaCurtos,

  ocorrenciaPrevista,
  temOculto,
  eventoVisivel,
  eventosDoCalendario,
  eventosDoDia,
  horaDeMinutos,
  layoutDoDia,
  lerOcultos,
  ocorrenciasNoIntervalo,
  adicionarBloco,
  blocosDaTarefa,
  blocosDisponiveis,
  blocosParaGravar,
  contadoresCalendario,
  contagemBlocos,
  type DadosBlocos,
  faixasDaSemana,
  fimDeSemana,
  lerBlocos,
  lerMes,
  moverBloco,
  reagendar,
  removerBloco,
  semanaDe,
  somarMes,
  textoMes,
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
  automacoesDoEvento,
  coerceModeloQuadro,
  coerceModeloTarefa,
  lerAcaoAutomacao,
  lerRecorrencia,
  notificacaoDePrazo,
  painelTarefas,
  prazoDoModelo,
  proximaOcorrencia,
  rotuloRecorrencia,
  tarefasDoRecorte,
  type Automacao,
  type ListaTarefas,
  type RecorteTarefas,
} from "../src/lib/tarefas-core.ts";
import { linhasPlanilhaTarefas } from "../src/lib/exportar-tarefas.ts";
import { blocosSchema, criarTarefaSchema, editarTarefaSchema, moverTarefaSchema, ordemListasSchema } from "../src/lib/tarefas-validation.ts";

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
  recorrencia: null,
  notas: 0,
  links: 0,
  eventos: 0,
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
    assert.equal(l[1][13], "");
  });
});

describe("tarefas — fase 3: recorrência", () => {
  const hoje = "2026-09-25";
  it("lê a regra com tolerância (inválida = null)", () => {
    assert.deepEqual(lerRecorrencia('{"freq":"semanal","intervalo":2,"dias":[3,1,1,9]}'), { freq: "semanal", intervalo: 2, dias: [1, 3], base: "prazo" });
    assert.equal(lerRecorrencia("x"), null);
    assert.equal(lerRecorrencia({ freq: "horaria", intervalo: 1 }), null);
    assert.equal(lerRecorrencia({ freq: "diaria", intervalo: 0 }), null);
    assert.deepEqual(lerRecorrencia({ freq: "mensal", intervalo: 1, dias: [1], base: "conclusao" }), { freq: "mensal", intervalo: 1, base: "conclusao" });
  });
  it("rótulo legível", () => {
    assert.equal(rotuloRecorrencia({ freq: "diaria", intervalo: 1, base: "prazo" }), "Diária");
    assert.equal(rotuloRecorrencia({ freq: "semanal", intervalo: 2, dias: [1, 3], base: "prazo" }), "A cada 2 semanas (seg, qua)");
    assert.equal(rotuloRecorrencia({ freq: "mensal", intervalo: 3, base: "conclusao" }), "A cada 3 meses após concluir");
  });
  it("próxima: diária, mensal presa ao fim do mês, anual e duração mantida", () => {
    assert.deepEqual(proximaOcorrencia({ freq: "diaria", intervalo: 1, base: "prazo" }, { inicio: null, prazo: "2026-09-25" }, "2026-09-25", hoje), { inicio: null, prazo: "2026-09-26" });
    assert.equal(proximaOcorrencia({ freq: "mensal", intervalo: 1, base: "prazo" }, { inicio: null, prazo: "2027-01-31" }, hoje, hoje).prazo, "2027-02-28");
    assert.equal(proximaOcorrencia({ freq: "mensal", intervalo: 1, base: "prazo" }, { inicio: null, prazo: "2027-12-15" }, hoje, hoje).prazo, "2028-01-15");
    assert.equal(proximaOcorrencia({ freq: "anual", intervalo: 1, base: "prazo" }, { inicio: null, prazo: "2028-02-29" }, hoje, "2028-02-29").prazo, "2029-02-28");
    assert.deepEqual(proximaOcorrencia({ freq: "semanal", intervalo: 1, base: "prazo" }, { inicio: "2026-09-28", prazo: "2026-10-02" }, hoje, hoje), { inicio: "2026-10-05", prazo: "2026-10-09" });
  });
  it("semanal com dias e intervalo", () => {
    // 2026-09-28 = segunda. Toda semana seg e qua.
    const r = { freq: "semanal" as const, intervalo: 1, dias: [1, 3], base: "prazo" as const };
    assert.equal(proximaOcorrencia(r, { inicio: null, prazo: "2026-09-28" }, hoje, hoje).prazo, "2026-09-30");
    assert.equal(proximaOcorrencia(r, { inicio: null, prazo: "2026-09-30" }, hoje, hoje).prazo, "2026-10-05");
    // A cada 2 semanas: da quarta pula para a segunda de DUAS semanas depois.
    assert.equal(proximaOcorrencia({ ...r, intervalo: 2 }, { inicio: null, prazo: "2026-09-30" }, hoje, hoje).prazo, "2026-10-12");
  });
  it("prazo que ficou para trás avança até hoje ou depois; sem prazo conta da conclusão; base conclusão", () => {
    assert.equal(proximaOcorrencia({ freq: "diaria", intervalo: 1, base: "prazo" }, { inicio: null, prazo: "2026-09-01" }, hoje, hoje).prazo, hoje);
    assert.equal(proximaOcorrencia({ freq: "semanal", intervalo: 1, base: "prazo" }, { inicio: null, prazo: null }, "2026-09-25", hoje).prazo, "2026-10-02");
    assert.equal(proximaOcorrencia({ freq: "diaria", intervalo: 3, base: "conclusao" }, { inicio: null, prazo: "2026-09-10" }, "2026-09-25", hoje).prazo, "2026-09-28");
  });
});

describe("tarefas — fase 3: notificação de prazo", () => {
  const t = { id: 5, ticket: 12, titulo: "Relatório", prazo: "2026-09-26", quadroId: 3, quadroNome: "Compras" };
  it("vence amanhã, atrasada (até 30 dias) e nada fora disso", () => {
    const n = notificacaoDePrazo(t, "2026-09-25");
    assert.equal(n?.tipo, "vence_amanha");
    assert.equal(n?.chave, "vence:5:2026-09-26");
    assert.equal(n?.link, "/painel/tarefas/3?tarefa=5");
    assert.equal(notificacaoDePrazo(t, "2026-09-27")?.tipo, "atrasada");
    assert.equal(notificacaoDePrazo(t, "2026-09-26"), null);
    assert.equal(notificacaoDePrazo(t, "2026-11-30"), null);
    assert.equal(notificacaoDePrazo({ ...t, prazo: null }, "2026-09-25"), null);
  });
});

describe("tarefas — fase 3: dashboard", () => {
  const hoje = "2026-09-25";
  const listas: ListaTarefas[] = [
    { id: 1, nome: "A fazer", ordem: 1, limiteWip: 2, concluida: false, arquivada: false },
    { id: 2, nome: "Feito", ordem: 2, limiteWip: null, concluida: true, arquivada: false },
  ];
  const ts = [
    T(1, 1, 1, { prazo: "2026-09-20", pessoas: [7], criadoEm: "2026-09-21 12:00:00" }),
    T(2, 1, 2, { prazo: "2026-09-26", pessoas: [7, 8], prioridade: "alta", criadoEm: "2026-09-22 12:00:00" }),
    T(3, 1, 3, { criadoEm: "2026-09-01 12:00:00" }),
    T(4, 2, 1, { prazo: "2026-09-24", concluidaEm: "2026-09-23 15:00:00", criadoEm: "2026-09-20 12:00:00" }),
    T(5, 2, 2, { prazo: "2026-09-10", concluidaEm: "2026-09-12 15:00:00", criadoEm: "2026-09-10 12:00:00" }),
    T(6, 1, 4, { arquivada: true, criadoEm: "2026-09-22 12:00:00" }),
  ];
  const p = painelTarefas(ts, listas, hoje);
  it("KPIs e faixas (arquivadas fora)", () => {
    assert.equal(p.abertas, 3);
    assert.deepEqual(p.faixas, { atrasada: 1, vence: 1, ok: 1 });
    assert.equal(p.concluidasMes, 2);
    assert.equal(p.noPrazo, 50);
    assert.equal(p.leadTime, 2.5);
    assert.equal(p.semResponsavel, 1);
    assert.deepEqual(p.porLista.map((l) => l.n), [3, 2]);
  });
  it("carga por pessoa (sem responsável por último) e semanas", () => {
    assert.deepEqual(p.carga.map((c) => [c.id, c.total]), [[7, 2], [8, 1], [null, 1]]);
    assert.equal(p.semanas.length, 12);
    const atual = p.semanas.at(-1);
    assert.equal(atual?.inicio, "2026-09-21");
    assert.equal(atual?.criadas, 2);
    assert.equal(atual?.concluidas, 1);
  });
  it("a soma do recorte = o número clicado", () => {
    const casos: [RecorteTarefas, number][] = [
      [{ dim: "abertas" }, p.abertas],
      [{ dim: "faixa", faixa: "atrasada" }, p.faixas.atrasada],
      [{ dim: "concluidasMes" }, p.concluidasMes],
      [{ dim: "pessoa", id: 7 }, 2],
      [{ dim: "pessoa", id: null }, 1],
      [{ dim: "lista", id: 1 }, 3],
      [{ dim: "prioridade", prioridade: "alta" }, 1],
      [{ dim: "semana", inicio: "2026-09-21", serie: "criadas" }, 2],
      [{ dim: "semana", inicio: "2026-09-21", serie: "concluidas" }, 1],
    ];
    for (const [r, n] of casos) assert.equal(tarefasDoRecorte(ts, r, hoje).length, n, JSON.stringify(r));
  });
});

describe("tarefas — fase 3: automações e modelos", () => {
  const regras: Automacao[] = [
    { id: 1, gatilho: "entrar_lista", listaId: 2, acao: { tipo: "atribuir", usuarioId: 7 }, ativa: true },
    { id: 2, gatilho: "concluir", listaId: null, acao: { tipo: "notificar" }, ativa: true },
    { id: 3, gatilho: "entrar_lista", listaId: 2, acao: { tipo: "prioridade", prioridade: "alta" }, ativa: false },
  ];
  it("só as ativas do evento", () => {
    assert.deepEqual(automacoesDoEvento(regras, { listaId: 2, concluida: false }), [{ tipo: "atribuir", usuarioId: 7 }]);
    assert.deepEqual(automacoesDoEvento(regras, { listaId: 2, concluida: true }).map((a) => a.tipo), ["atribuir", "notificar"]);
    assert.deepEqual(automacoesDoEvento(regras, { listaId: 1, concluida: false }), []);
  });
  it("lê a ação gravada (inválida = null)", () => {
    assert.deepEqual(lerAcaoAutomacao('{"tipo":"mover_lista","listaId":4}'), { tipo: "mover_lista", listaId: 4 });
    assert.equal(lerAcaoAutomacao('{"tipo":"mover_lista"}'), null);
    assert.equal(lerAcaoAutomacao('{"tipo":"prioridade","prioridade":"x"}'), null);
    assert.equal(lerAcaoAutomacao("{"), null);
  });
  it("modelos: qualquer JSON vira válido", () => {
    const q = coerceModeloQuadro({ listas: [{ nome: " Fila ", limiteWip: 3 }, { nome: "" }, { nome: "OK", concluida: true }], etiquetas: [{ nome: "Urg", cor: "bad" }], cor: "#112233" });
    assert.deepEqual(q.listas, [{ nome: "Fila", limiteWip: 3, concluida: false }, { nome: "OK", limiteWip: null, concluida: true }]);
    assert.equal(q.etiquetas[0].cor, "#6366f1");
    assert.equal(coerceModeloQuadro(null).listas.length, 1);
    const t = coerceModeloTarefa({ titulo: "", checklist: ["a", "", 3], prazoDias: 5, recorrencia: { freq: "diaria", intervalo: 1 } });
    assert.equal(t.titulo, "Nova tarefa");
    assert.deepEqual(t.checklist, ["a"]);
    assert.equal(prazoDoModelo(t, "2026-09-25"), "2026-09-30");
    assert.equal(t.recorrencia?.freq, "diaria");
    assert.equal(prazoDoModelo(coerceModeloTarefa({}), "2026-09-25"), null);
  });
});

describe("tarefas — calendário profissional", () => {
  it("semanaDe (domingo → sábado) e fim de semana", () => {
    assert.deepEqual(semanaDe("2026-09-25"), ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"]);
    assert.equal(fimDeSemana("2026-09-26"), true);
    assert.equal(fimDeSemana("2026-09-20"), true);
    assert.equal(fimDeSemana("2026-09-23"), false);
  });

  it("reagendar: o início anda junto (mesma duração); sem início, só o prazo; início depois do dia é puxado", () => {
    assert.deepEqual(reagendar({ inicio: "2026-09-01", prazo: "2026-09-05" }, "2026-09-10"), { inicio: "2026-09-06", prazo: "2026-09-10" });
    assert.deepEqual(reagendar({ inicio: null, prazo: "2026-09-05" }, "2026-09-02"), { inicio: null, prazo: "2026-09-02" });
    assert.deepEqual(reagendar({ inicio: "2026-09-20", prazo: null }, "2026-09-10"), { inicio: "2026-09-10", prazo: "2026-09-10" });
    assert.deepEqual(reagendar({ inicio: "2026-09-01", prazo: null }, "2026-09-10"), { inicio: "2026-09-01", prazo: "2026-09-10" });
  });

  it("faixasDaSemana: início → prazo contínuo, cortado na semana, empilhado sem sobrepor", () => {
    const sem = semanaDe("2026-09-23");
    const t = (id: number, inicio: string | null, fim: string | null) => ({ id, inicio, fim });
    const f = faixasDaSemana([t(1, "2026-09-15", "2026-09-22"), t(2, null, "2026-09-22"), t(3, "2026-09-24", "2026-10-02"), t(4, null, null), t(5, null, "2026-10-10")], sem);
    const por = new Map(f.map((x) => [x.item.id, x]));
    assert.equal(por.size, 3);
    assert.deepEqual([por.get(1)?.coluna, por.get(1)?.span, por.get(1)?.antes, por.get(1)?.depois], [0, 3, true, false]);
    assert.deepEqual([por.get(3)?.coluna, por.get(3)?.span, por.get(3)?.depois], [4, 3, true]);
    // A 1 e a 2 se cruzam (dia 22): linhas diferentes; a 3 cabe na linha 0.
    assert.notEqual(por.get(1)?.linha, por.get(2)?.linha);
    assert.equal(por.get(3)?.linha, 0);
  });

  it("contadoresCalendario: só as abertas", () => {
    const c = contadoresCalendario(
      [
        { prazo: "2026-09-20", concluidaEm: null },
        { prazo: "2026-09-25", concluidaEm: null },
        { prazo: "2026-09-26", concluidaEm: null },
        { prazo: "2026-09-30", concluidaEm: null },
        { prazo: null, concluidaEm: null },
        { prazo: "2026-09-01", concluidaEm: "2026-09-02" },
      ],
      "2026-09-25",
    );
    assert.deepEqual(c, { atrasadas: 1, hoje: 1, naSemana: 2, semPrazo: 1 });
  });

  it("lerMes / somarMes / textoMes", () => {
    assert.deepEqual(lerMes("2026-02", "2026-09-25"), { ano: 2026, mes: 2 });
    assert.deepEqual(lerMes("2026-13", "2026-09-25"), { ano: 2026, mes: 9 });
    assert.deepEqual(lerMes(undefined, "2026-09-25"), { ano: 2026, mes: 9 });
    assert.deepEqual(somarMes(2026, 12, 1), { ano: 2027, mes: 1 });
    assert.deepEqual(somarMes(2026, 1, -1), { ano: 2025, mes: 12 });
    assert.equal(textoMes(2026, 3), "2026-03");
  });
});

describe("tarefas — blocos", () => {
  const vazio: DadosBlocos = { inicio: null, prazo: null, pessoas: [], observadores: [], etiquetas: [], vinculo: null, estimativaH: null, recorrencia: null, checklist: 0, eventos: 0 };

  it("lerBlocos é tolerante: inválido sai, bloco único não repete, JSON quebrado = null", () => {
    assert.equal(lerBlocos(null), null);
    assert.equal(lerBlocos("{quebrado"), null);
    const l = lerBlocos(
      JSON.stringify([
        { id: "a", tipo: "nota", texto: " oi " },
        { id: "b", tipo: "prazo" },
        { id: "c", tipo: "prazo" },
        { id: "d", tipo: "xyz" },
        { id: "e", tipo: "link", url: "javascript:alert(1)", titulo: "x" },
        { id: "a", tipo: "nota", texto: "dup id" },
      ]),
    );
    assert.deepEqual(l, [
      { id: "a", tipo: "nota", texto: "oi" },
      { id: "b", tipo: "prazo" },
      { id: "e", tipo: "link", url: "", titulo: "x" },
    ]);
  });

  it("blocosDaTarefa: tarefa antiga deriva dos campos; bloco com dado nunca some; ordem gravada é mantida", () => {
    assert.deepEqual(blocosDaTarefa(null, vazio), []);
    const d = { ...vazio, prazo: "2026-09-30", pessoas: [1], checklist: 2 };
    assert.deepEqual(
      blocosDaTarefa(null, d).map((b) => b.tipo),
      ["checklist", "prazo", "pessoas"],
    );
    const g = blocosDaTarefa([{ id: "b1", tipo: "pessoas" }, { id: "b2", tipo: "nota", texto: "x" }], d);
    assert.deepEqual(
      g.map((b) => b.tipo),
      ["pessoas", "nota", "checklist", "prazo"],
    );
    assert.equal(new Set(g.map((b) => b.id)).size, g.length);
  });

  it("adicionar / mover / remover / disponíveis", () => {
    let l = adicionarBloco([], "nota");
    l = adicionarBloco(l, "prazo", 0);
    l = adicionarBloco(l, "prazo"); // único: não repete
    l = adicionarBloco(l, "nota");
    assert.deepEqual(
      l.map((b) => b.tipo),
      ["prazo", "nota", "nota"],
    );
    assert.ok(!blocosDisponiveis(l).includes("prazo"));
    assert.ok(blocosDisponiveis(l).includes("nota"));
    const movido = moverBloco(l, l[0].id, 2);
    assert.deepEqual(
      movido.map((b) => b.tipo),
      ["nota", "nota", "prazo"],
    );
    assert.equal(removerBloco(l, l[1].id).length, 2);
    let cheio: ReturnType<typeof adicionarBloco> = [];
    for (let i = 0; i < 40; i++) cheio = adicionarBloco(cheio, "nota");
    assert.equal(cheio.length, 30);
    assert.deepEqual(blocosDisponiveis(cheio), []);
  });

  it("para gravar: sem nota vazia nem link sem endereço; contagem do cartão", () => {
    const l = blocosParaGravar([
      { id: "a", tipo: "nota", texto: "  " },
      { id: "b", tipo: "nota", texto: " x " },
      { id: "c", tipo: "link", url: "", titulo: "" },
      { id: "d", tipo: "link", url: "https://ex.com", titulo: "" },
      { id: "e", tipo: "checklist" },
    ]);
    assert.deepEqual(
      l.map((b) => b.id),
      ["b", "d", "e"],
    );
    assert.deepEqual(contagemBlocos(l), { notas: 1, links: 1 });
    assert.deepEqual(contagemBlocos(null), { notas: 0, links: 0 });
  });

  it("blocosSchema recusa link não-http, bloco único repetido e id repetido", () => {
    assert.ok(blocosSchema.safeParse([{ id: "a", tipo: "nota", texto: "x" }, { id: "b", tipo: "link", url: "https://ex.com", titulo: "" }]).success);
    assert.ok(!blocosSchema.safeParse([{ id: "a", tipo: "link", url: "ftp://ex.com", titulo: "" }]).success);
    assert.ok(!blocosSchema.safeParse([{ id: "a", tipo: "prazo" }, { id: "b", tipo: "prazo" }]).success);
    assert.ok(!blocosSchema.safeParse([{ id: "a", tipo: "nota", texto: "" }, { id: "a", tipo: "nota", texto: "" }]).success);
    assert.ok(criarTarefaSchema.safeParse({ quadroId: 1, listaId: 1, titulo: "T", blocos: [{ id: "a", tipo: "estimativa" }] }).success);
  });
});

describe("calendário por eventos", () => {
  const t = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    quadroId: 1,
    ticket: id,
    titulo: `T${id}`,
    inicio: null as string | null,
    prazo: null as string | null,
    concluidaEm: null as string | null,
    recorrencia: null as null | { freq: "semanal"; intervalo: number; base: "prazo" | "conclusao" },
    ...extra,
  });

  it("ocorrências da recorrência: só a base prazo, depois do prazo, dentro do intervalo, com teto", () => {
    const r = { freq: "semanal" as const, intervalo: 1, base: "prazo" as const };
    assert.deepEqual(ocorrenciasNoIntervalo(r, "2026-09-01", "2026-09-01", "2026-09-30"), ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"]);
    assert.deepEqual(ocorrenciasNoIntervalo({ ...r, base: "conclusao" }, "2026-09-01", "2026-09-01", "2026-09-30"), []);
    assert.deepEqual(ocorrenciasNoIntervalo(r, null, "2026-09-01", "2026-09-30"), []);
    assert.equal(ocorrenciasNoIntervalo({ freq: "diaria" as never, intervalo: 1, base: "prazo" }, "2026-01-01", "2026-01-01", "2026-12-31").length, 60);
  });

  it("eventosDoCalendario: período, recorrência (só aberta), eventos cadastrados; fora do intervalo sai", () => {
    const tarefas = [
      t(1, { inicio: "2026-09-10", prazo: "2026-09-12" }),
      t(2, { prazo: "2026-09-05", recorrencia: { freq: "semanal", intervalo: 1, base: "prazo" } }),
      t(3, { prazo: "2026-09-05", concluidaEm: "2026-09-05", recorrencia: { freq: "semanal", intervalo: 1, base: "prazo" } }),
      t(4, { prazo: "2026-11-01" }),
    ];
    const eventos = [
      { id: 7, tarefaId: 4, titulo: "Reunião", data: "2026-09-20", dataFim: null, diaInteiro: false, horaInicio: "09:30", horaFim: "10:00", local: "Sala 2", descricao: null, cor: "#16a34a", lembreteMin: 30 },
      { id: 8, tarefaId: 4, titulo: "Fora", data: "2026-10-20", dataFim: null, diaInteiro: true, horaInicio: null, horaFim: null, local: null, descricao: null, cor: null, lembreteMin: null },
      { id: 9, tarefaId: 99, titulo: "Órfão", data: "2026-09-20", dataFim: null, diaInteiro: true, horaInicio: null, horaFim: null, local: null, descricao: null, cor: null, lembreteMin: null },
      { id: 10, tarefaId: 4, titulo: "Viagem", data: "2026-08-30", dataFim: "2026-09-02", diaInteiro: true, horaInicio: null, horaFim: null, local: null, descricao: null, cor: null, lembreteMin: null },
    ];
    const ev = eventosDoCalendario(tarefas, eventos, "2026-09-01", "2026-09-30");
    const chaves = ev.map((e) => e.chave);
    assert.ok(chaves.includes("p1") && chaves.includes("p2") && chaves.includes("p3"));
    assert.ok(!chaves.includes("p4"));
    assert.deepEqual(chaves.filter((c) => c.startsWith("r2:")), ["r2:2026-09-12", "r2:2026-09-19", "r2:2026-09-26"]);
    assert.ok(!chaves.some((c) => c.startsWith("r3:")));
    assert.deepEqual(chaves.filter((c) => c.startsWith("e")).sort(), ["e10", "e7"]);
    // Evento de VÁRIOS dias: começa antes do intervalo e termina dentro — entra, com o fim.
    assert.deepEqual([ev.find((e) => e.chave === "e10")?.inicio, ev.find((e) => e.chave === "e10")?.fim], ["2026-08-30", "2026-09-02"]);
    assert.equal(ev.find((e) => e.chave === "e7")?.lembreteMin, 30);
    const e7 = ev.find((e) => e.chave === "e7");
    assert.equal(e7?.diaInteiro, false);
    assert.equal(e7?.horaInicio, "09:30");
    assert.equal(ev.find((e) => e.chave === "p1")?.inicio, "2026-09-10");
    assert.equal(eventosDoDia(ev, "2026-09-11").map((e) => e.chave).join(), "p1");
  });

  it("layoutDoDia: sobrepostos lado a lado, sem fim = 60 min, separados em coluna única", () => {
    const e = (h: string, f: string | null) => ({ horaInicio: h, horaFim: f });
    const l = layoutDoDia([e("09:00", "10:00"), e("09:30", null), e("11:00", "11:30"), e("09:45", "10:15")]);
    const por = (h: string) => l.find((x) => x.evento.horaInicio === h);
    assert.equal(por("09:00")?.colunas, 3);
    assert.notEqual(por("09:00")?.coluna, por("09:30")?.coluna);
    assert.equal(por("09:30")?.altura, 60);
    assert.equal(por("11:00")?.colunas, 1);
    assert.equal(por("11:00")?.topo, 660);
    assert.equal(horaDeMinutos(605), "10:05");
  });

  it("ocultos: leitura tolerante e visibilidade por tarefa, quadro, PCA e tipo", () => {
    assert.deepEqual(lerOcultos(null), { tarefas: [], quadros: [], pcas: [], tipos: [], feriados: false });
    const o = lerOcultos({ tarefas: [2, 2, "x"], quadros: [5], pcas: [3], tipos: ["recorrencia", "nada"], feriados: true });
    assert.deepEqual(o, { tarefas: [2], quadros: [5], pcas: [3], tipos: ["recorrencia"], feriados: true });
    assert.equal(temOculto(lerOcultos({})), false);
    assert.equal(temOculto(lerOcultos({ feriados: true })), true);
    assert.equal(eventoVisivel({ tarefaId: 1, quadroId: 1, tipo: "periodo", pca: null }, o), true);
    assert.equal(eventoVisivel({ tarefaId: 2, quadroId: 1, tipo: "periodo", pca: null }, o), false);
    assert.equal(eventoVisivel({ tarefaId: 1, quadroId: 5, tipo: "periodo", pca: null }, o), false);
    assert.equal(eventoVisivel({ tarefaId: 1, quadroId: 1, tipo: "recorrencia", pca: null }, o), false);
    const pca = (pcaId: number) => ({ pcaId, pcaNome: "PCA", dfdId: 1, numero: "1", planejamento: null, objeto: null, sigla: null, valor: 0, anual: false });
    assert.equal(eventoVisivel({ tarefaId: 0, quadroId: 0, tipo: "pca", pca: pca(3) }, o), false);
    assert.equal(eventoVisivel({ tarefaId: 0, quadroId: 0, tipo: "pca", pca: pca(4) }, o), true);
  });

  it("recorrência que conta da CONCLUSÃO: a próxima ocorrência PREVISTA (se concluída hoje ou no prazo futuro)", () => {
    const r = { freq: "semanal" as const, intervalo: 1, base: "conclusao" as const };
    assert.equal(ocorrenciaPrevista({ inicio: null, prazo: "2026-09-20", concluidaEm: null, recorrencia: r }, "2026-09-25"), "2026-10-02");
    assert.equal(ocorrenciaPrevista({ inicio: null, prazo: "2026-09-30", concluidaEm: null, recorrencia: r }, "2026-09-25"), "2026-10-07");
    assert.equal(ocorrenciaPrevista({ inicio: null, prazo: "2026-09-30", concluidaEm: "2026-09-24", recorrencia: r }, "2026-09-25"), null);
    assert.equal(ocorrenciaPrevista({ inicio: null, prazo: "2026-09-30", concluidaEm: null, recorrencia: { ...r, base: "prazo" } }, "2026-09-25"), null);
    const ev = eventosDoCalendario([t(5, { prazo: "2026-09-20", recorrencia: r })], [], "2026-09-01", "2026-10-31", "2026-09-25");
    const prev = ev.find((e) => e.chave === "r5:prev");
    assert.equal(prev?.inicio, "2026-10-02");
    assert.equal(prev?.prevista, true);
  });

  it("semana começando na SEGUNDA e faixas só nos dias exibidos (fim de semana oculto)", () => {
    assert.deepEqual(semanaDe("2026-09-27", 1)[0], "2026-09-21");
    assert.equal(semanaDe("2026-09-27", 1)[6], "2026-09-27");
    assert.equal(gradeMes(2026, 9, 1)[0][0], "2026-08-31");
    assert.deepEqual(diasSemanaCurtos(1), ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    const uteis = semanaDe("2026-09-23").filter((d) => !fimDeSemana(d));
    const f = faixasDaSemana([{ inicio: "2026-09-19", fim: "2026-09-22" }, { inicio: "2026-09-26", fim: "2026-09-26" }], uteis);
    assert.equal(f.length, 1);
    assert.deepEqual([f[0].coluna, f[0].span, f[0].antes], [0, 2, true]);
  });
});
