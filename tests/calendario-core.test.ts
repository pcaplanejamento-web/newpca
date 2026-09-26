import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  avisoDiaNaoUtil,
  diaUtil,
  diasExibidos,
  dobrarIcs,
  escaparIcs,
  eventoComFim,
  eventoMovido,
  eventosPca,
  feriadosNacionais,
  feriadosNoIntervalo,
  gerarIcs,
  lembreteDevido,
  lerOpcoesCalendario,
  menosMinutos,
  notificacaoDeLembrete,
  pascoa,
  rotuloLembrete,
} from "../src/lib/calendario-core.ts";
import { eventosDoCalendario, semanaDe } from "../src/lib/tarefas-core.ts";

describe("calendário profissional", () => {
  it("Páscoa e os feriados móveis", () => {
    assert.equal(pascoa(2024), "2024-03-31");
    assert.equal(pascoa(2025), "2025-04-20");
    assert.equal(pascoa(2026), "2026-04-05");
    const f = feriadosNacionais(2026);
    const por = (nome: string) => f.filter((x) => x.nome === nome).map((x) => x.data);
    assert.deepEqual(por("Carnaval"), ["2026-02-16", "2026-02-17"]);
    assert.deepEqual(por("Sexta-feira Santa"), ["2026-04-03"]);
    assert.deepEqual(por("Corpus Christi"), ["2026-06-04"]);
    assert.ok(f.some((x) => x.data === "2026-11-20"));
    assert.ok(!feriadosNacionais(2023).some((x) => x.data === "2023-11-20"));
  });

  it("feriados no intervalo: nacionais + cadastrados (anual repete; 29/02 só em ano bissexto; sem repetir o nome)", () => {
    const cad = [
      { id: 1, data: "2020-08-05", nome: "Aniversário de Rio Verde", tipo: "municipal" as const, anual: true },
      { id: 2, data: "2026-09-18", nome: "Ponto facultativo local", tipo: "facultativo" as const, anual: false },
      { id: 3, data: "2024-02-29", nome: "Bissexto", tipo: "municipal" as const, anual: true },
      { id: 4, data: "2000-12-25", nome: "Natal", tipo: "nacional" as const, anual: true },
    ];
    const m = feriadosNoIntervalo(cad, "2026-01-01", "2027-12-31");
    assert.equal(m.get("2026-08-05")?.[0].nome, "Aniversário de Rio Verde");
    assert.equal(m.get("2027-08-05")?.[0].id, 1);
    assert.equal(m.get("2026-09-18")?.[0].tipo, "facultativo");
    assert.equal(m.has("2027-09-18"), false);
    assert.equal(m.has("2026-03-01"), false);
    assert.equal(m.get("2026-12-25")?.length, 1);
    assert.equal(diaUtil("2026-09-07", m), false);
    assert.equal(diaUtil("2026-09-08", m), true);
    assert.equal(diaUtil("2026-09-26", m), false);
    assert.match(avisoDiaNaoUtil("2026-12-25", m) ?? "", /feriado: Natal/);
    assert.equal(avisoDiaNaoUtil("2026-09-26", m), "cai num sábado");
    assert.equal(avisoDiaNaoUtil("2026-09-24", m), null);
  });

  it("opções: leitura tolerante e dias exibidos sem o fim de semana", () => {
    assert.deepEqual(lerOpcoesCalendario(null), { inicioSegunda: false, ocultarFimDeSemana: false });
    assert.deepEqual(lerOpcoesCalendario({ inicioSegunda: true, ocultarFimDeSemana: "sim" }), { inicioSegunda: true, ocultarFimDeSemana: false });
    assert.deepEqual(diasExibidos(semanaDe("2026-09-23"), { ocultarFimDeSemana: true }), ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]);
  });

  it("lembretes: momento do aviso, dia inteiro às 08:00, janela até o fim do dia, chave única", () => {
    assert.equal(menosMinutos("2026-09-25T00:10", 30), "2026-09-24T23:40");
    assert.equal(menosMinutos("2026-09-25T09:00", 1440), "2026-09-24T09:00");
    const e = { id: 7, titulo: "Reunião", data: "2026-09-25", diaInteiro: false, horaInicio: "09:00", horaFim: null, lembreteMin: 30, local: "Sala 2" };
    assert.equal(lembreteDevido(e, "2026-09-25T08:29"), false);
    assert.equal(lembreteDevido(e, "2026-09-25T08:30"), true);
    assert.equal(lembreteDevido(e, "2026-09-25T23:59"), true);
    assert.equal(lembreteDevido(e, "2026-09-26T00:00"), false);
    assert.equal(lembreteDevido({ ...e, lembreteMin: null }, "2026-09-25T09:00"), false);
    assert.equal(lembreteDevido({ ...e, diaInteiro: true, horaInicio: null, lembreteMin: 1440 }, "2026-09-24T08:00"), true);
    const n = notificacaoDeLembrete(e, { ticket: 3, titulo: "Pregão" }, "2026-09-25");
    assert.equal(n.titulo, "Hoje às 09:00: Reunião");
    assert.equal(n.chave, "lembrete:7:2026-09-25T09:00:30");
    assert.equal(n.link, "/painel/calendario?mes=2026-09&evento=e7");
    assert.equal(rotuloLembrete(60), "1 hora antes");
    assert.equal(rotuloLembrete(null), "Sem lembrete");
  });

  it("previsão do PCA: dia 1 do mês; anual em todo mês; fora do intervalo sai", () => {
    const base = { pcaId: 2, pcaNome: "PCA 2026", dfdId: 9, numero: "1234", planejamento: "1509", objeto: "Papel", sigla: "SME", valor: 100 };
    const ev = eventosPca([{ ...base, ano: 2026, mes: 9, anual: false }, { ...base, dfdId: 10, ano: 2026, mes: null, anual: true }, { ...base, dfdId: 11, ano: 2026, mes: 12, anual: false }], "2026-08-30", "2026-10-03");
    assert.deepEqual(ev.map((e) => e.chave).sort(), ["c2:10:2026-09", "c2:10:2026-10", "c2:9:2026-09"]);
    const e = ev.find((x) => x.chave === "c2:9:2026-09");
    assert.equal(e?.titulo, "DFD 1234 — Papel");
    assert.equal(e?.tipo, "pca");
    assert.equal(e?.pca?.anual, false);
  });

  it("mover evento: vários dias andam inteiros; com hora mantém a duração; preso às 23:59", () => {
    const ev = { id: 1, tarefaId: 2, titulo: "E", data: "2026-09-10", dataFim: "2026-09-12", diaInteiro: true, horaInicio: null, horaFim: null, local: null, descricao: null, cor: null, lembreteMin: 60 };
    assert.deepEqual([eventoMovido(ev, "2026-09-20", null).data, eventoMovido(ev, "2026-09-20", null).dataFim], ["2026-09-20", "2026-09-22"]);
    assert.equal("id" in eventoMovido(ev, "2026-09-20", null), false);
    const h = { ...ev, dataFim: null, diaInteiro: false, horaInicio: "09:00", horaFim: "10:30" };
    const m = eventoMovido(h, "2026-09-11", "14:00");
    assert.deepEqual([m.data, m.dataFim, m.horaInicio, m.horaFim, m.lembreteMin], ["2026-09-11", null, "14:00", "15:30", 60]);
    assert.equal(eventoMovido(h, "2026-09-11", "23:30").horaFim, "23:59");
    assert.equal(eventoMovido({ ...h, horaFim: null }, "2026-09-11", "08:00").horaFim, null);
    assert.equal(eventoMovido(h, "2026-09-11", null).horaInicio, "09:00");
    assert.equal(eventoComFim(h, "11:00").horaFim, "11:00");
  });

  it(".ics: dia inteiro com fim exclusivo, hora em UTC, lembrete, escape e dobra", () => {
    const t = { id: 1, quadroId: 1, ticket: 5, titulo: "Pregão; limpeza", inicio: null, prazo: "2026-09-25", concluidaEm: null, recorrencia: null };
    const ev = eventosDoCalendario(
      [t],
      [{ id: 3, tarefaId: 1, titulo: "Reunião, pauta", data: "2026-09-24", dataFim: null, diaInteiro: false, horaInicio: "09:30", horaFim: null, local: "Sala 2", descricao: "Linha 1\nLinha 2", cor: null, lembreteMin: 15 }],
      "2026-09-01",
      "2026-09-30",
    );
    const ics = gerarIcs(ev, { nome: "Calendário", agora: "20260925T120000Z" });
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.match(ics, /DTSTART;VALUE=DATE:20260925\r\nDTEND;VALUE=DATE:20260926/);
    assert.match(ics, /DTSTART:20260924T123000Z\r\nDTEND:20260924T133000Z/);
    assert.match(ics, /SUMMARY:Reunião\\, pauta/);
    assert.match(ics, /TRIGGER:-PT15M/);
    assert.match(ics, /UID:e3@governarv.com.br/);
    assert.equal(escaparIcs("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne");
    const longa = dobrarIcs(`DESCRIPTION:${"á".repeat(80)}`);
    assert.ok(longa.split("\r\n ").every((p) => new TextEncoder().encode(p).length <= 75));
    assert.equal(longa.split("\r\n ").join(""), `DESCRIPTION:${"á".repeat(80)}`);
  });
});

describe("validação do calendário", async () => {
  const { eventoSchema } = await import("../src/lib/tarefas-validation.ts");
  const { feriadoSchema } = await import("../src/lib/calendario-validation.ts");
  const base = { titulo: "E", data: "2026-09-10", diaInteiro: true, horaInicio: null, horaFim: null, local: null, descricao: null, cor: null };
  it("evento: data final e lembrete (opcionais, compatíveis com o formato anterior)", () => {
    const ant = eventoSchema.parse(base);
    assert.deepEqual([ant.dataFim, ant.lembreteMin], [null, null]);
    const r = eventoSchema.parse({ ...base, dataFim: "2026-09-12", lembreteMin: 1440 });
    assert.deepEqual([r.dataFim, r.lembreteMin], ["2026-09-12", 1440]);
    assert.equal(eventoSchema.parse({ ...base, dataFim: "2026-09-10" }).dataFim, null);
    assert.equal(eventoSchema.safeParse({ ...base, dataFim: "2026-09-09" }).success, false);
    assert.equal(eventoSchema.safeParse({ ...base, lembreteMin: 20000 }).success, false);
  });
  it("feriado: data real, tipo conhecido", () => {
    assert.equal(feriadoSchema.safeParse({ data: "2026-08-05", nome: "Aniversário", tipo: "municipal", anual: true }).success, true);
    assert.equal(feriadoSchema.safeParse({ data: "2027-02-29", nome: "X", tipo: "municipal", anual: false }).success, false);
    assert.equal(feriadoSchema.safeParse({ data: "2026-08-05", nome: " ", tipo: "municipal", anual: false }).success, false);
    assert.equal(feriadoSchema.safeParse({ data: "2026-08-05", nome: "X", tipo: "outro", anual: false }).success, false);
  });
});
