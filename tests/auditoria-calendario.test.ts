import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escaparIcs, eventoArrastado, gerarIcs } from "../src/lib/calendario-core.ts";
import { lerIcs, urlAgendaValida } from "../src/lib/ics-core.ts";
import {
  dataValida,
  type EventoTarefa,
  eventoParaAuditoria,
  eventosDoCalendario,
  FILTRO_TAREFAS_PADRAO,
  filtrarTarefas,
  historicoSemPrivados,
  indiceReal,
  layoutDoDia,
  mascararPrivados,
  ocorrenciasDoEvento,
  proximaOcorrencia,
} from "../src/lib/tarefas-core.ts";
import { eventoSchema } from "../src/lib/tarefas-validation.ts";

// Os casos achados na AUDITORIA de Calendário e Tarefas — cada um reproduz o erro que existia.

const evento = (x: Partial<EventoTarefa> = {}): EventoTarefa => ({
  id: 1,
  tarefaId: 1,
  titulo: "E",
  data: "2026-09-10",
  dataFim: null,
  diaInteiro: true,
  horaInicio: null,
  horaFim: null,
  local: null,
  descricao: null,
  cor: null,
  lembreteMin: null,
  recorrencia: null,
  linkReuniao: null,
  ocupado: true,
  privado: false,
  criadoPor: 1,
  convidados: [],
  ...x,
});
const ics = (corpo: string) => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:X\r\n${corpo}\r\nEND:VEVENT\r\nEND:VCALENDAR`;

describe("auditoria — datas e recorrência", () => {
  it("data que não existe (31/02, 30/02 em ano comum) é inválida; 29/02 só em ano bissexto", () => {
    assert.equal(dataValida("2026-02-31"), false);
    assert.equal(dataValida("2026-02-29"), false);
    assert.equal(dataValida("2028-02-29"), true);
    assert.equal(eventoSchema.safeParse({ titulo: "E", data: "2026-02-31", diaInteiro: true, horaInicio: null, horaFim: null, local: null, descricao: null, cor: null }).success, false);
  });

  it("série ANTIGA (diária desde 2010) aparece em 2026; mensal e semanal também — sem o teto de passos", () => {
    const diaria = evento({ data: "2010-01-01", recorrencia: { freq: "diaria", intervalo: 1, dias: [], ate: null } });
    assert.equal(ocorrenciasDoEvento(diaria, "2026-09-01", "2026-09-30").length, 30);
    const cada3 = evento({ data: "2010-01-01", recorrencia: { freq: "diaria", intervalo: 3, dias: [], ate: null } });
    // A fase se mantém: 2010-01-01 + 3k.
    for (const d of ocorrenciasDoEvento(cada3, "2026-09-01", "2026-09-30")) assert.equal(Math.round((Date.parse(d) - Date.parse("2010-01-01")) / 86_400_000) % 3, 0);
    const mensal31 = evento({ data: "2012-01-31", recorrencia: { freq: "mensal", intervalo: 1, dias: [], ate: null } });
    assert.deepEqual(ocorrenciasDoEvento(mensal31, "2026-02-01", "2026-03-31"), ["2026-02-28", "2026-03-31"]);
    // Toda 2ª semana, seg e qua, desde 2011-01-03 (segunda).
    const quinzenal = evento({ data: "2011-01-03", recorrencia: { freq: "semanal", intervalo: 2, dias: [1, 3], ate: null } });
    const oc = ocorrenciasDoEvento(quinzenal, "2026-09-01", "2026-09-30");
    assert.ok(oc.length >= 4);
    // O mesmo resultado que andar passo a passo desde uma base próxima da mesma série.
    const ref = ocorrenciasDoEvento({ ...quinzenal, data: oc[0] }, "2026-09-01", "2026-09-30");
    assert.deepEqual(oc, ref);
    // Evento de vários dias começando antes do intervalo e terminando dentro dele entra.
    const longo = evento({ data: "2010-01-01", dataFim: "2010-01-05", recorrencia: { freq: "diaria", intervalo: 7, dias: [], ate: null } });
    // Toda sexta (2010-01-01 foi sexta), 5 dias: a de 11/09/2026 cobre o sábado 12/09; a quinta 10/09 fica de fora.
    assert.deepEqual(ocorrenciasDoEvento(longo, "2026-09-12", "2026-09-12"), ["2026-09-11"]);
    assert.deepEqual(ocorrenciasDoEvento(longo, "2026-09-10", "2026-09-10"), []);
  });

  it("próxima ocorrência de uma série muito atrasada chega a hoje sem estourar", () => {
    const r = { freq: "diaria" as const, intervalo: 1, base: "prazo" as const };
    assert.equal(proximaOcorrencia(r, { inicio: null, prazo: "2005-01-01" }, "2026-09-26", "2026-09-26").prazo, "2026-09-26");
  });

  it("recorrente ATRASADA não mostra ocorrências passadas (a próxima é de hoje em diante)", () => {
    const t = { id: 1, quadroId: 1, ticket: 1, titulo: "T", inicio: null, prazo: "2026-09-01", concluidaEm: null, recorrencia: { freq: "diaria" as const, intervalo: 1, base: "prazo" as const } };
    const oc = eventosDoCalendario([t], [], "2026-09-01", "2026-09-30", "2026-09-26").filter((e) => e.tipo === "recorrencia");
    assert.deepEqual(
      oc.map((e) => e.inicio),
      ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"],
    );
  });

  it("filtro 'Próximos 7 dias' = hoje + 6", () => {
    const hoje = "2026-09-26";
    const T = (id: number, prazo: string) => ({ id, prazo, pessoas: [], prioridade: "media" as const, etiquetas: [], concluidaEm: null, titulo: "x", ticket: id });
    const ts = [T(1, "2026-10-02"), T(2, "2026-10-03")];
    assert.deepEqual(filtrarTarefas(ts, { ...FILTRO_TAREFAS_PADRAO, prazo: "semana" }, { usuarioId: null, hoje }).map((t) => t.id), [1]);
  });

  it("kanban FILTRADO: o índice entre os visíveis vira a posição certa na lista completa", () => {
    const T = (id: number, ordem: number) => ({ id, listaId: 1, ordem, ticket: id, arquivada: false }) as never;
    const todas = [T(1, 1), T(2, 2), T(3, 3), T(4, 4), T(5, 5)];
    const visiveis = [T(1, 1), T(4, 4), T(5, 5)]; // B e C escondidos pelo filtro
    // Arrastar A para ENTRE D e E (índice 1 entre os visíveis sem A: D, E) = logo antes de E (sem A: B, C, D, E → 3).
    assert.equal(indiceReal(todas, visiveis, 1, 1, 1), 3);
    // Depois do último visível = o FIM; o topo = o topo da lista.
    assert.equal(indiceReal(todas, visiveis, 1, 1, 2), 4);
    assert.equal(indiceReal(todas, visiveis, 5, 1, 0), 0);
    // Sem filtro, o próprio índice.
    assert.equal(indiceReal(todas, todas, 1, 1, 2), 2);
    // Lista de destino sem visíveis: o fim.
    assert.equal(indiceReal(todas, [T(1, 1)], 1, 1, 0), 4);
  });

  it("grade de horas: fim antes do início atravessa a meia-noite (até 24:00)", () => {
    const [l] = layoutDoDia([{ horaInicio: "22:00", horaFim: "01:00" }]);
    assert.deepEqual([l.topo, l.altura], [22 * 60, 120]);
  });

  it("evento com hora em VÁRIOS dias é aceito (fim antes da hora de início, em outro dia)", () => {
    const base = { titulo: "E", data: "2026-09-26", diaInteiro: false, horaInicio: "14:00", horaFim: "10:00", local: null, descricao: null, cor: null };
    assert.equal(eventoSchema.safeParse(base).success, false);
    assert.equal(eventoSchema.safeParse({ ...base, dataFim: "2026-09-28" }).success, true);
  });

  it("arrastar uma OCORRÊNCIA move a série pela mesma distância (nunca salta para o dia solto)", () => {
    const serie = evento({ data: "2026-09-01", recorrencia: { freq: "semanal", intervalo: 1, dias: [], ate: null } });
    assert.equal(eventoArrastado(serie, "2026-09-15", "2026-09-16", null).data, "2026-09-02");
    assert.equal(eventoArrastado(evento({ data: "2026-09-10" }), "2026-09-10", "2026-09-12", null).data, "2026-09-12");
  });
});

describe("auditoria — .ics", () => {
  it("exportar: 23:30 sem fim termina 00:30 do dia seguinte; com hora em vários dias, início e fim reais; \\r escapado", () => {
    const t = { id: 1, quadroId: 1, ticket: 5, titulo: "T", inicio: null, prazo: null, concluidaEm: null, recorrencia: null };
    const evs = eventosDoCalendario(
      [t],
      [
        evento({ id: 3, data: "2026-09-26", diaInteiro: false, horaInicio: "23:30" }),
        evento({ id: 4, data: "2026-09-26", dataFim: "2026-09-28", diaInteiro: false, horaInicio: "14:00", horaFim: "10:00" }),
      ],
      "2026-09-01",
      "2026-09-30",
    );
    const txt = gerarIcs(evs, { nome: "C", agora: "20260925T120000Z" });
    assert.match(txt, /DTSTART:20260927T023000Z\r\nDTEND:20260927T033000Z/);
    assert.match(txt, /DTSTART:20260926T170000Z\r\nDTEND:20260928T130000Z/);
    assert.equal(escaparIcs("a\rb"), "a\\nb");
  });

  it("ler: TZID entre aspas com ':' (Outlook) não derruba o evento", () => {
    const [e] = lerIcs(ics('DTSTART;TZID="(UTC-03:00) Brasilia":20260910T100000'));
    assert.deepEqual([e.data, e.horaInicio], ["2026-09-10", "10:00"]);
  });

  it("ler: TZID conhecido é convertido para Brasília (Nova York 10:00 = 11:00)", () => {
    const [e] = lerIcs(ics("DTSTART;TZID=America/New_York:20260910T100000"));
    assert.deepEqual([e.data, e.horaInicio], ["2026-09-10", "11:00"]);
  });

  it("ler: série semanal em UTC que muda de dia em Brasília leva o BYDAY junto", () => {
    const [e] = lerIcs(ics("DTSTART:20260908T010000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=TU"));
    assert.deepEqual([e.data, e.horaInicio, e.recorrencia?.dias], ["2026-09-07", "22:00", [1]]);
  });

  it("ler: regra que o sistema não reproduz ('2ª terça do mês') aparece UMA vez — nunca em datas erradas", () => {
    const [e] = lerIcs(ics("DTSTART;VALUE=DATE:20260113\r\nRRULE:FREQ=MONTHLY;BYDAY=2TU"));
    assert.equal(e.recorrencia, null);
  });

  it("link da agenda: ponto final, faixas reservadas e internas recusadas", () => {
    for (const u of ["https://localhost./x", "https://foo.local./x", "https://metadata.google.internal./x", "https://198.18.0.1/x", "https://192.0.0.5/x", "https://203.0.113.9/x"])
      assert.equal(urlAgendaValida(u), null, u);
    assert.ok(urlAgendaValida("https://calendar.google.com/calendar/ical/x/basic.ics"));
  });
});

describe("auditoria — privacidade dos eventos", () => {
  it("o PRIVADO vai ao histórico só com a data; o público, inteiro", () => {
    const priv = eventoParaAuditoria({ titulo: "Consulta médica", data: "2026-09-10", privado: true, local: "Hospital" });
    assert.equal(priv.titulo, "evento privado");
    assert.deepEqual(priv.dados, { titulo: "Evento privado", data: "2026-09-10", privado: true });
    assert.equal(eventoParaAuditoria({ titulo: "Reunião", data: "2026-09-10", privado: false }).titulo, "Reunião");
  });

  it("histórico gravado ANTES da máscara também sai sem o conteúdo do privado", () => {
    const linhas = historicoSemPrivados([
      { resumo: 'Tarefa #1: evento "Consulta médica" em 10/09/2026', antes: null, depois: JSON.stringify({ titulo: "Consulta médica", local: "Hospital X", data: "2026-09-10", privado: true }) },
      { resumo: "Tarefa #2 criada", antes: null, depois: JSON.stringify({ titulo: "T", eventos: [{ titulo: "Segredo", data: "2026-09-11", privado: true }, { titulo: "Aberto", data: "2026-09-12", privado: false }] }) },
      { resumo: "outra", antes: null, depois: JSON.stringify({ titulo: "X" }) },
    ]);
    assert.equal(linhas[0].resumo, 'Tarefa #1: evento "evento privado" em 10/09/2026');
    assert.doesNotMatch(linhas[0].depois ?? "", /Hospital|Consulta/);
    assert.doesNotMatch(linhas[1].depois ?? "", /Segredo/);
    assert.match(linhas[1].depois ?? "", /Aberto/);
    assert.equal(linhas[2].depois, JSON.stringify({ titulo: "X" }));
  });

  it("a máscara do privado também esconde QUEM criou", () => {
    const [m] = mascararPrivados([evento({ privado: true, criadoPor: 5, titulo: "Segredo" })], 9, new Map());
    assert.deepEqual([m.titulo, m.criadoPor], ["Ocupado", null]);
  });
});
