import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fimDoHorario, horarioLivre, horariosLivres, slugDe, slugValido } from "../src/lib/agendamento-core.ts";
import { diferencaFuso, horaNoFuso, lerOpcoesCalendario, rotuloGmt } from "../src/lib/calendario-core.ts";
import { dataHoraIcs, datasDoEventoIcs, eventosExternos, lerIcs, regraIcs, urlAgendaValida } from "../src/lib/ics-core.ts";
import { eventoVisivel, lerOcultos, OCULTOS_VAZIO } from "../src/lib/tarefas-core.ts";

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:a1@x",
  "DTSTART:20260925T130000Z",
  "DTEND:20260925T143000Z",
  "SUMMARY:Reunião\\, com vírgula",
  "LOCATION:Sala 2",
  "DESCRIPTION:Linha 1\\nLinha 2 muito longa que foi",
  "  dobrada",
  "BEGIN:VALARM",
  "TRIGGER:-PT15M",
  "DESCRIPTION:alarme",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:feriado@x",
  "DTSTART;VALUE=DATE:20261012",
  "DTEND;VALUE=DATE:20261013",
  "SUMMARY:Nossa Senhora Aparecida",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:viagem@x",
  "DTSTART;VALUE=DATE:20261005",
  "DTEND;VALUE=DATE:20261008",
  "SUMMARY:Viagem",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:daily@x",
  "DTSTART;TZID=America/Sao_Paulo:20260921T080000",
  "DTEND;TZID=America/Sao_Paulo:20260921T081500",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5",
  "EXDATE;TZID=America/Sao_Paulo:20260923T080000",
  "SUMMARY:Daily",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:daily@x",
  "RECURRENCE-ID;TZID=America/Sao_Paulo:20260925T080000",
  "DTSTART;TZID=America/Sao_Paulo:20260925T090000",
  "SUMMARY:Daily (remarcada)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:cancelado@x",
  "STATUS:CANCELLED",
  "DTSTART:20260925T130000Z",
  "SUMMARY:Cancelado",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("agendas externas (.ics)", () => {
  const evs = lerIcs(ICS);
  it("lê os eventos: UTC → Brasília, texto desescapado, linha dobrada, alarme ignorado, cancelado fora", () => {
    assert.equal(evs.length, 5);
    const r = evs[0];
    assert.deepEqual([r.data, r.horaInicio, r.horaFim], ["2026-09-25", "10:00", "11:30"]);
    assert.equal(r.titulo, "Reunião, com vírgula");
    assert.equal(r.descricao, "Linha 1\nLinha 2 muito longa que foi dobrada");
    assert.equal(r.local, "Sala 2");
  });
  it("dia inteiro: o DTEND é exclusivo (1 dia; vários dias)", () => {
    const f = evs.find((e) => e.uid === "feriado@x");
    assert.deepEqual([f?.diaInteiro, f?.data, f?.dataFim], [true, "2026-10-12", null]);
    const v = evs.find((e) => e.uid === "viagem@x");
    assert.equal(v?.dataFim, "2026-10-07");
  });
  it("série: BYDAY + COUNT + EXDATE + ocorrência alterada fora da série", () => {
    const d = evs.find((e) => e.uid === "daily@x" && e.recorrencia);
    assert.ok(d);
    assert.deepEqual(d.recorrencia?.dias, [1, 3, 5]);
    // COUNT=5 a partir de 21/09 (seg): 21, 23, 25, 28, 30 — sem 23 (EXDATE) e 25 (remarcada).
    assert.deepEqual(datasDoEventoIcs(d, "2026-09-01", "2026-10-31"), ["2026-09-21", "2026-09-28", "2026-09-30"]);
    assert.deepEqual(datasDoEventoIcs(d, "2026-09-29", "2026-10-31"), ["2026-09-30"]);
  });
  it("eventosExternos: tipo externo, chave estável, somente leitura", () => {
    const l = eventosExternos([{ id: 7, nome: "Google", cor: "#0ea5e9", eventos: evs }], "2026-09-01", "2026-10-31");
    const r = l.find((e) => e.titulo.startsWith("Reunião"));
    assert.equal(r?.tipo, "externo");
    assert.equal(r?.chave, "x7:a1@x:2026-09-25");
    assert.deepEqual(r?.externo, { agendaId: 7, agendaNome: "Google" });
    assert.equal(l.find((e) => e.titulo === "Viagem")?.fim, "2026-10-07");
  });
  it("RRULE que o sistema não repete (horária) = evento único; DTSTART inválido some", () => {
    assert.equal(regraIcs("FREQ=HOURLY"), null);
    assert.equal(regraIcs("FREQ=MONTHLY;INTERVAL=2;UNTIL=20261231T235959Z")?.recorrencia.ate, "2026-12-31");
    assert.equal(dataHoraIcs({ params: {}, valor: "2026-09-25" }), null);
    assert.deepEqual(lerIcs("BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:x\nEND:VEVENT\nEND:VCALENDAR"), []);
  });
  it("URL: só HTTPS pública (webcal vira https; localhost/IP privado/credenciais recusados)", () => {
    assert.equal(urlAgendaValida("webcal://calendar.google.com/x/basic.ics"), "https://calendar.google.com/x/basic.ics");
    for (const u of ["http://x.com/a.ics", "https://localhost/a.ics", "https://10.0.0.1/a.ics", "https://192.168.1.2/a", "https://[::1]/a", "https://u:p@x.com/a", "https://intranet/a", "lixo"]) assert.equal(urlAgendaValida(u), null, u);
  });
  it("ocultar uma agenda externa (preferência tolerante)", () => {
    const [e] = eventosExternos([{ id: 3, nome: "A", cor: null, eventos: evs.slice(0, 1) }], "2026-09-01", "2026-09-30");
    assert.equal(eventoVisivel(e, OCULTOS_VAZIO), true);
    assert.equal(eventoVisivel(e, lerOcultos({ externos: [3] })), false);
    assert.equal(eventoVisivel(e, lerOcultos({ tipos: ["externo"] })), false);
    assert.deepEqual(lerOcultos({ externos: ["x", 2, 2] }).externos, [2]);
  });
});

describe("página de agendamento", () => {
  const p = { duracaoMin: 30, dias: [1, 2, 3, 4, 5], horaInicio: "08:00", horaFim: "10:00", antecedenciaH: 2, janelaDias: 7 };
  it("horários livres: dias da semana, antecedência, ocupados e feriados", () => {
    // Agora: sexta 25/09/2026 07:30 → antecedência de 2 h tira 08:00–09:00 de hoje.
    const m = horariosLivres(p, [{ data: "2026-09-28", horaInicio: "08:15", horaFim: "09:00" }], "2026-09-25T07:30", new Set(["2026-09-29"]));
    assert.deepEqual(m.get("2026-09-25"), ["09:30"]);
    assert.equal(m.has("2026-09-26"), false); // sábado
    assert.deepEqual(m.get("2026-09-28"), ["09:00", "09:30"]); // 08:00 e 08:30 cruzam 08:15–09:00
    assert.equal(m.has("2026-09-29"), false); // feriado
    assert.equal([...m.keys()].at(-1), "2026-10-01"); // janela de 7 dias
  });
  it("bloco sem fim ocupa 1 hora; conferência do horário", () => {
    const o = [{ data: "2026-09-28", horaInicio: "08:00", horaFim: null }];
    assert.deepEqual(horariosLivres(p, o, "2026-09-25T00:00").get("2026-09-28"), ["09:00", "09:30"]);
    assert.equal(horarioLivre(p, o, "2026-09-25T00:00", new Set(), "2026-09-28", "08:30"), false);
    assert.equal(horarioLivre(p, o, "2026-09-25T00:00", new Set(), "2026-09-28", "09:30"), true);
    assert.equal(fimDoHorario("09:30", 45), "10:15");
  });
  it("endereço (slug)", () => {
    assert.equal(slugDe("Atendimento do PCA — Sala 2"), "atendimento-do-pca-sala-2");
    assert.equal(slugValido("atendimento-pca"), true);
    for (const s of ["ab", "-ab", "ab-", "Ab c", "a".repeat(41)]) assert.equal(slugValido(s), false, s);
  });
});

describe("fuso secundário", () => {
  it("diferença para Brasília e a hora no outro fuso", () => {
    assert.equal(diferencaFuso("America/Manaus", "2026-09-25"), -60);
    assert.equal(diferencaFuso("UTC", "2026-09-25"), 180);
    assert.equal(diferencaFuso("Europe/Lisbon", "2026-07-01"), 240); // horário de verão de lá
    assert.equal(diferencaFuso("Europe/Lisbon", "2026-12-01"), 180);
    assert.equal(horaNoFuso("23:00", 180), "02:00");
    assert.equal(horaNoFuso("01:00", -60), "00:00");
    assert.equal(rotuloGmt(-60), "GMT-04");
    assert.equal(rotuloGmt(180), "GMT+00");
  });
  it("a opção só aceita os fusos da lista", () => {
    assert.equal(lerOpcoesCalendario({ fusoSecundario: "America/Manaus" }).fusoSecundario, "America/Manaus");
    assert.equal(lerOpcoesCalendario({ fusoSecundario: "Mars/Olympus" }).fusoSecundario, null);
  });
});

describe("validação (agendas e agendamento)", async () => {
  const { agendarSchema, externoSchema, paginaAgendamentoSchema } = await import("../src/lib/tarefas-validation.ts");
  it("página: endereço, dias, horário e duração", () => {
    const base = { tarefaId: 1, slug: "Atendimento-PCA", titulo: "Atendimento", duracaoMin: 30, dias: [5, 1, 1], horaInicio: "08:00", horaFim: "12:00", antecedenciaH: 2, janelaDias: 30 };
    const ok = paginaAgendamentoSchema.safeParse(base);
    assert.equal(ok.success, true);
    if (ok.success) assert.deepEqual([ok.data.slug, ok.data.dias, ok.data.ativa], ["atendimento-pca", [1, 5], true]);
    assert.equal(paginaAgendamentoSchema.safeParse({ ...base, horaFim: "07:00" }).success, false);
    assert.equal(paginaAgendamentoSchema.safeParse({ ...base, duracaoMin: 20 }).success, false);
    assert.equal(paginaAgendamentoSchema.safeParse({ ...base, dias: [] }).success, false);
    assert.equal(paginaAgendamentoSchema.safeParse({ ...base, slug: "a b" }).success, false);
  });
  it("agendar: nome, e-mail e horário", () => {
    assert.equal(agendarSchema.safeParse({ data: "2026-09-28", hora: "09:00", nome: "Ana", email: "ANA@X.COM" }).success, true);
    assert.equal(agendarSchema.safeParse({ data: "2026-09-28", hora: "9:00", nome: "Ana", email: "a@x.com" }).success, false);
    assert.equal(agendarSchema.safeParse({ data: "2026-09-28", hora: "09:00", nome: "A", email: "a@x.com" }).success, false);
    assert.equal(externoSchema.safeParse({ nome: "", url: "https://x.com/a.ics" }).success, false);
  });
});
