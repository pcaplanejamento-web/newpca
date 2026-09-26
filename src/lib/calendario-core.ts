/**
 * CALENDÁRIO profissional (migração `0047`) — núcleo PURO (sem D1/DOM; testado em `tests/calendario-core.test.ts`):
 * FERIADOS (nacionais calculados — a Páscoa move Carnaval, Sexta-feira Santa e Corpus Christi — + os cadastrados pelo
 * ADM), LEMBRETES dos eventos (o momento de avisar e a notificação do sino), as OPÇÕES da pessoa (semana começando na
 * segunda, ocultar o fim de semana), a PREVISÃO do PCA como eventos e a exportação/assinatura `.ics` (RFC 5545).
 */
import { type DadosEvento, dataValida, diasEntre, type EventoCalendario, type EventoPca, type EventoTarefa, fimDoEvento, horaDeMinutos, horaValida, minutosDe, rotuloTicket, somarDias } from "./tarefas-core.ts";

// ─── Mover um evento cadastrado (arrastar no calendário) ─────────────────────────────────────────────────────

/**
 * O evento ARRASTADO para `dia` (e `hora`, na grade de horas): o de vários dias anda inteiro (mesma duração em dias); o com
 * hora, solto numa hora, muda o início e mantém a duração (preso às 23:59; sem fim, segue sem fim). Devolve os dados a
 * gravar (sem id/tarefa).
 */
export function eventoMovido(ev: EventoTarefa, dia: string, hora: string | null): DadosEvento {
  const { id: _id, tarefaId: _t, ...d } = ev;
  const out: DadosEvento = { ...d, data: dia, dataFim: fimDoEvento(ev) > ev.data ? somarDias(dia, diasEntre(ev.data, fimDoEvento(ev))) : null };
  if (hora && !ev.diaInteiro && horaValida(ev.horaInicio)) {
    const dur = horaValida(ev.horaFim) && minutosDe(ev.horaFim) > minutosDe(ev.horaInicio) ? minutosDe(ev.horaFim) - minutosDe(ev.horaInicio) : null;
    out.horaInicio = hora;
    out.horaFim = dur != null ? horaDeMinutos(Math.min(minutosDe(hora) + dur, 23 * 60 + 59)) : null;
    if (out.horaFim && out.horaFim <= hora) out.horaFim = null;
  }
  return out;
}

/** Os dados a gravar do evento com o FIM novo (a borda arrastada). */
export const eventoComFim = (ev: EventoTarefa, horaFim: string): DadosEvento => {
  const { id: _id, tarefaId: _t, ...d } = ev;
  return { ...d, horaFim };
};

// ─── Feriados ─────────────────────────────────────────────────────────────────────────────────────────────────

export const TIPOS_FERIADO = ["nacional", "estadual", "municipal", "facultativo"] as const;
export type TipoFeriado = (typeof TIPOS_FERIADO)[number];
export const ROTULO_TIPO_FERIADO: Record<TipoFeriado, string> = { nacional: "Nacional", estadual: "Estadual", municipal: "Municipal", facultativo: "Ponto facultativo" };
export const coerceTipoFeriado = (v: unknown): TipoFeriado => ((TIPOS_FERIADO as readonly unknown[]).includes(v) ? (v as TipoFeriado) : "municipal");

/** Um feriado cadastrado (`anual` = repete todo ano no mesmo dia/mês). */
export type FeriadoCadastro = { id: number; data: string; nome: string; tipo: TipoFeriado; anual: boolean };
/** Um feriado num DIA do calendário (`id` null = nacional calculado). */
export type FeriadoDia = { id: number | null; data: string; nome: string; tipo: TipoFeriado };

/** O domingo de PÁSCOA do ano (algoritmo de Meeus/Jones/Butcher — calendário gregoriano). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const FIXOS: [string, string, TipoFeriado][] = [
  ["01-01", "Confraternização Universal", "nacional"],
  ["04-21", "Tiradentes", "nacional"],
  ["05-01", "Dia do Trabalho", "nacional"],
  ["09-07", "Independência do Brasil", "nacional"],
  ["10-12", "Nossa Senhora Aparecida", "nacional"],
  ["10-28", "Dia do Servidor Público", "facultativo"],
  ["11-02", "Finados", "nacional"],
  ["11-15", "Proclamação da República", "nacional"],
  ["11-20", "Dia Nacional de Zumbi e da Consciência Negra", "nacional"],
  ["12-25", "Natal", "nacional"],
];

/** A data existe de fato (29/02 só em ano bissexto — o `Date` "rolaria" para 01/03). */
const dataReal = (d: string) => dataValida(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** Os feriados NACIONAIS (e pontos facultativos federais) do ano — os fixos + os móveis pela Páscoa. */
export function feriadosNacionais(ano: number): FeriadoDia[] {
  const p = pascoa(ano);
  const moveis: FeriadoDia[] = [
    { id: null, data: somarDias(p, -48), nome: "Carnaval", tipo: "facultativo" },
    { id: null, data: somarDias(p, -47), nome: "Carnaval", tipo: "facultativo" },
    { id: null, data: somarDias(p, -2), nome: "Sexta-feira Santa", tipo: "nacional" },
    { id: null, data: somarDias(p, 60), nome: "Corpus Christi", tipo: "facultativo" },
  ];
  return [...FIXOS.filter(([md]) => ano >= 2024 || md !== "11-20").map(([md, nome, tipo]) => ({ id: null, data: `${ano}-${md}`, nome, tipo })), ...moveis].sort((a, b) =>
    a.data.localeCompare(b.data),
  );
}

/**
 * Os FERIADOS entre `de` e `ate` por dia: os nacionais calculados + os cadastrados (o ANUAL repete o dia/mês em cada ano
 * do intervalo). O cadastrado no MESMO dia de um nacional de mesmo nome não repete.
 */
export function feriadosNoIntervalo(cadastrados: FeriadoCadastro[], de: string, ate: string): Map<string, FeriadoDia[]> {
  const m = new Map<string, FeriadoDia[]>();
  const por = (f: FeriadoDia) => {
    if (f.data < de || f.data > ate) return;
    const l = m.get(f.data) ?? [];
    if (!l.some((x) => x.nome.toLowerCase() === f.nome.toLowerCase())) l.push(f);
    m.set(f.data, l);
  };
  const a0 = Number(de.slice(0, 4));
  const a1 = Number(ate.slice(0, 4));
  for (let ano = a0; ano <= a1 && ano - a0 < 20; ano++) {
    for (const f of feriadosNacionais(ano)) por(f);
    for (const c of cadastrados)
      if (c.anual && dataValida(c.data)) {
        const d = `${ano}-${c.data.slice(5)}`;
        if (dataReal(d)) por({ id: c.id, data: d, nome: c.nome, tipo: c.tipo });
      }
  }
  for (const c of cadastrados) if (!c.anual && dataValida(c.data)) por({ id: c.id, data: c.data, nome: c.nome, tipo: c.tipo });
  return m;
}

/** O dia é ÚTIL? (nem sábado/domingo nem feriado — ponto facultativo conta como não útil). */
export const diaUtil = (dia: string, feriados: Map<string, FeriadoDia[]>) => {
  const w = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6 && !feriados.has(dia);
};

/** O aviso quando um PRAZO cai em dia não útil ("cai num sábado", "cai em feriado: Natal"); `null` = dia útil. */
export function avisoDiaNaoUtil(dia: string | null, feriados: Map<string, FeriadoDia[]>): string | null {
  if (!dataValida(dia)) return null;
  const f = feriados.get(dia);
  if (f?.length) return `cai em ${f[0].tipo === "facultativo" ? "ponto facultativo" : "feriado"}: ${f.map((x) => x.nome).join(", ")}`;
  const w = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return w === 0 ? "cai num domingo" : w === 6 ? "cai num sábado" : null;
}

// ─── Opções da pessoa ─────────────────────────────────────────────────────────────────────────────────────────

/** As OPÇÕES da pessoa (`calendario:opcoes`): semana na segunda, sem fim de semana, sem as tarefas concluídas, o número
 * da semana e o HORÁRIO DE EXPEDIENTE (a grade de horas sombreia o que fica fora e abre no início). */
export type OpcoesCalendario = {
  inicioSegunda: boolean;
  ocultarFimDeSemana: boolean;
  ocultarConcluidas: boolean;
  numeroSemana: boolean;
  /** "HH:MM"; `null` = sem expediente. */
  expedienteInicio: string | null;
  expedienteFim: string | null;
};
export const OPCOES_CALENDARIO_PADRAO: OpcoesCalendario = {
  inicioSegunda: false,
  ocultarFimDeSemana: false,
  ocultarConcluidas: false,
  numeroSemana: false,
  expedienteInicio: "08:00",
  expedienteFim: "18:00",
};
export const CHAVE_OPCOES_CALENDARIO = "calendario:opcoes";
export function lerOpcoesCalendario(v: unknown): OpcoesCalendario {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const hora = (x: unknown, padrao: string | null) => (x === null ? null : typeof x === "string" && horaValida(x) ? x : padrao);
  const ini = hora(o.expedienteInicio, OPCOES_CALENDARIO_PADRAO.expedienteInicio);
  const fim = hora(o.expedienteFim, OPCOES_CALENDARIO_PADRAO.expedienteFim);
  const expediente = ini && fim && fim > ini ? { expedienteInicio: ini, expedienteFim: fim } : { expedienteInicio: null, expedienteFim: null };
  return {
    inicioSegunda: o.inicioSegunda === true,
    ocultarFimDeSemana: o.ocultarFimDeSemana === true,
    ocultarConcluidas: o.ocultarConcluidas === true,
    numeroSemana: o.numeroSemana === true,
    ...expediente,
  };
}
/** Os dias EXIBIDOS de uma semana (sem sábado/domingo quando ocultos). */
export const diasExibidos = (semana: string[], o: Pick<OpcoesCalendario, "ocultarFimDeSemana">) =>
  o.ocultarFimDeSemana ? semana.filter((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) : semana;

/** O número da SEMANA (ISO 8601 — a semana de segunda a domingo; a 1ª semana do ano é a que tem a 1ª quinta-feira). */
export function semanaIso(dia: string): number {
  const d = new Date(`${dia}T12:00:00Z`);
  const w = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - w + 3); // a quinta-feira da semana
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

/** As VISTAS do calendário (as do Google: Dia · 4 dias · Semana · Mês · Ano · Programação). */
export const VISTAS_CALENDARIO = ["dia", "ndias", "semana", "mes", "ano", "agenda"] as const;
export type VistaCalendario = (typeof VISTAS_CALENDARIO)[number];
/** Quantos dias a vista "N dias" mostra. */
export const N_DIAS = 4;

/**
 * O INTERVALO que o calendário carrega: as semanas inteiras do mês (com a semana escolhida) + 1 semana depois (a vista de
 * 4 dias e a semana que atravessa o fim do mês) — ou, com `anual`, o ANO inteiro (a vista Ano). A MESMA conta no
 * servidor (a carga) e no cliente (os eventos derivados).
 */
export function intervaloCalendario(mes: { ano: number; mes: number }, inicioSemana: 0 | 1, anual = false): { de: string; ate: string } {
  if (anual) return { de: somarDias(`${mes.ano}-01-01`, -7), ate: somarDias(`${mes.ano}-12-31`, 7) };
  const p = new Date(Date.UTC(mes.ano, mes.mes - 1, 1));
  const de = somarDias(p.toISOString().slice(0, 10), -((p.getUTCDay() - inicioSemana + 7) % 7));
  const ultimo = new Date(Date.UTC(mes.ano, mes.mes, 0)).toISOString().slice(0, 10);
  const fimSemana = somarDias(ultimo, (6 - ((new Date(`${ultimo}T12:00:00Z`).getUTCDay() - inicioSemana + 7) % 7) + 7) % 7);
  return { de, ate: somarDias(fimSemana, 7) };
}

// ─── Lembretes ────────────────────────────────────────────────────────────────────────────────────────────────

export const OPCOES_LEMBRETE: { min: number; rotulo: string }[] = [
  { min: 0, rotulo: "No horário" },
  { min: 10, rotulo: "10 minutos antes" },
  { min: 30, rotulo: "30 minutos antes" },
  { min: 60, rotulo: "1 hora antes" },
  { min: 1440, rotulo: "1 dia antes" },
  { min: 10080, rotulo: "1 semana antes" },
];
/** O maior lembrete aceito (1 semana). */
export const LEMBRETE_MAX_MIN = 10080;
/** O evento de dia inteiro "começa" às 08:00 para o lembrete (1 dia antes = às 08:00 do dia anterior). */
export const HORA_DIA_INTEIRO = "08:00";

export const rotuloLembrete = (min: number | null) =>
  min == null ? "Sem lembrete" : (OPCOES_LEMBRETE.find((o) => o.min === min)?.rotulo ?? (min % 1440 === 0 ? `${min / 1440} dia(s) antes` : min % 60 === 0 ? `${min / 60} h antes` : `${min} min antes`));

/** "AAAA-MM-DDTHH:MM" menos `min` minutos (horário local, sem fuso). */
export function menosMinutos(quando: string, min: number): string {
  const [d, h] = quando.split("T");
  const total = minutosDe(h) - min;
  const dias = Math.floor(total / 1440);
  const resto = total - dias * 1440;
  return `${somarDias(d, dias)}T${String(Math.floor(resto / 60)).padStart(2, "0")}:${String(resto % 60).padStart(2, "0")}`;
}

/** O INÍCIO de um evento como "AAAA-MM-DDTHH:MM" (o de dia inteiro, às `HORA_DIA_INTEIRO`). */
export const inicioDoEvento = (e: { data: string; diaInteiro: boolean; horaInicio: string | null }) =>
  `${e.data}T${!e.diaInteiro && horaValida(e.horaInicio) ? e.horaInicio : HORA_DIA_INTEIRO}`;

/**
 * O lembrete do evento está DEVIDO agora? (`agora` = "AAAA-MM-DDTHH:MM" em Brasília): do momento do aviso até o fim do
 * dia do evento — depois disso, não avisa mais (quem não abriu o sistema não recebe um lembrete velho).
 */
export function lembreteDevido(e: { data: string; diaInteiro: boolean; horaInicio: string | null; lembreteMin: number | null }, agora: string): boolean {
  if (e.lembreteMin == null || !dataValida(e.data)) return false;
  return agora >= menosMinutos(inicioDoEvento(e), e.lembreteMin) && agora <= `${e.data}T23:59`;
}

/** A notificação do sino de um lembrete (chave única por evento + momento + antecedência — mudou, avisa de novo). */
export function notificacaoDeLembrete(
  e: { id: number; titulo: string; data: string; diaInteiro: boolean; horaInicio: string | null; horaFim: string | null; lembreteMin: number | null; local: string | null },
  t: { ticket: number; titulo: string },
  hoje: string,
): { tipo: "lembrete"; chave: string; titulo: string; texto: string; link: string } {
  const quando = e.data === hoje ? "Hoje" : e.data === somarDias(hoje, 1) ? "Amanhã" : `${e.data.slice(8)}/${e.data.slice(5, 7)}`;
  const hora = !e.diaInteiro && horaValida(e.horaInicio) ? ` às ${e.horaInicio}` : " (dia inteiro)";
  return {
    tipo: "lembrete",
    chave: `lembrete:${e.id}:${inicioDoEvento(e)}:${e.lembreteMin}`,
    titulo: `${quando}${hora}: ${e.titulo}`,
    texto: `${rotuloTicket(t.ticket)} ${t.titulo}${e.local ? ` · ${e.local}` : ""}`,
    link: linkEvento(e.data, `e${e.id}`),
  };
}

/** O link que abre o EVENTO no Calendário (o mês dele + o banner aberto). */
export const linkEvento = (data: string, chave: string) => `/painel/calendario?mes=${data.slice(0, 7)}&evento=${encodeURIComponent(chave)}`;

// ─── Previsão do PCA ──────────────────────────────────────────────────────────────────────────────────────────

/** Um DFD vigente de um PCA com a PREVISÃO de entrega (`mes` 1–12, ou `anual`). */
export type DfdPrevisao = Omit<EventoPca, "anual"> & { ano: number; mes: number | null; anual: boolean };

/**
 * Os eventos da PREVISÃO DE ENTREGA do PCA entre `de` e `ate`: um evento de dia inteiro no DIA 1 do mês previsto (a
 * previsão ANUAL entra em todo mês do ano). Chave `c{pcaId}:{dfdId}:{AAAA-MM}`.
 */
export function eventosPca(dfds: DfdPrevisao[], de: string, ate: string): EventoCalendario[] {
  const out: EventoCalendario[] = [];
  for (const d of dfds) {
    const meses = d.anual ? Array.from({ length: 12 }, (_, i) => i + 1) : d.mes ? [d.mes] : [];
    for (const m of meses) {
      const dia = `${d.ano}-${String(m).padStart(2, "0")}-01`;
      if (dia < de || dia > ate) continue;
      const { ano: _a, mes: _m, ...pca } = d;
      out.push({
        chave: `c${d.pcaId}:${d.dfdId}:${dia.slice(0, 7)}`,
        tipo: "pca",
        tarefaId: 0,
        quadroId: 0,
        ticket: 0,
        titulo: `DFD ${d.numero}${d.objeto ? ` — ${d.objeto}` : ""}`,
        tarefaTitulo: d.pcaNome,
        tarefaPrazo: null,
        inicio: dia,
        fim: dia,
        diaInteiro: true,
        horaInicio: null,
        horaFim: null,
        local: null,
        descricao: null,
        cor: null,
        concluida: false,
        recorrente: d.anual,
        eventoId: null,
        lembreteMin: null,
        prevista: false,
        pca: { ...pca, anual: d.anual },
      });
    }
  }
  return out;
}

// ─── .ics (exportar e assinar) ────────────────────────────────────────────────────────────────────────────────

/** Brasília não tem horário de verão desde 2019: o horário local + 3 h = UTC. */
const utc = (data: string, hora: string) => {
  const t = menosMinutos(`${data}T${hora}`, -180);
  return `${t.replace(/-/g, "").replace(":", "")}00Z`;
};
const dataIcs = (d: string) => d.replace(/-/g, "");
/** Escapa o texto do .ics (\ ; , e quebras). */
export const escaparIcs = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Dobra a linha em 75 octetos (RFC 5545 §3.1) — continuação começa com espaço. */
export function dobrarIcs(linha: string): string {
  const enc = new TextEncoder();
  if (enc.encode(linha).length <= 75) return linha;
  const partes: string[] = [];
  let atual = "";
  let bytes = 0;
  for (const ch of linha) {
    const n = enc.encode(ch).length;
    if (bytes + n > (partes.length ? 74 : 75)) {
      partes.push(atual);
      atual = "";
      bytes = 0;
    }
    atual += ch;
    bytes += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

/**
 * O calendário em `.ics` (RFC 5545): um VEVENT por evento — dia inteiro com DTEND exclusivo (o dia seguinte ao fim), com
 * hora em UTC (fim ausente = +1 h), o lembrete como VALARM, a tarefa/DFD na descrição e um UID estável (a chave).
 * `agora` = "AAAAMMDDTHHMMSSZ" (DTSTAMP).
 */
export function gerarIcs(eventos: EventoCalendario[], opts: { nome: string; agora: string; dominio?: string; url?: (e: EventoCalendario) => string | null }): string {
  const dom = opts.dominio ?? "governarv.com.br";
  const l: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Plataforma PCA//Calendario//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escaparIcs(opts.nome)}`, "X-WR-TIMEZONE:America/Sao_Paulo"];
  for (const e of eventos) {
    const comHora = !e.diaInteiro && horaValida(e.horaInicio) && e.inicio === e.fim;
    const desc = e.pca
      ? `${e.pca.pcaNome} · DFD ${e.pca.numero}${e.pca.planejamento ? ` (Planej. ${e.pca.planejamento})` : ""}${e.pca.sigla ? ` · ${e.pca.sigla}` : ""}`
      : `${rotuloTicket(e.ticket)} ${e.tarefaTitulo}${e.descricao ? `\n\n${e.descricao}` : ""}`;
    l.push("BEGIN:VEVENT", `UID:${e.chave}@${dom}`, `DTSTAMP:${opts.agora}`);
    if (comHora) {
      const fim = horaValida(e.horaFim) && minutosDe(e.horaFim) > minutosDe(e.horaInicio as string) ? e.horaFim : null;
      l.push(`DTSTART:${utc(e.inicio, e.horaInicio as string)}`, `DTEND:${fim ? utc(e.inicio, fim) : utc(e.inicio, menosMinutos(`${e.inicio}T${e.horaInicio}`, -60).slice(11))}`);
    } else l.push(`DTSTART;VALUE=DATE:${dataIcs(e.inicio)}`, `DTEND;VALUE=DATE:${dataIcs(somarDias(e.fim, 1))}`);
    l.push(`SUMMARY:${escaparIcs(e.titulo)}`, `DESCRIPTION:${escaparIcs(desc)}`);
    if (e.local) l.push(`LOCATION:${escaparIcs(e.local)}`);
    const url = opts.url?.(e);
    if (url) l.push(`URL:${url}`);
    if (e.concluida) l.push("STATUS:CANCELLED");
    if (e.lembreteMin != null)
      l.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escaparIcs(e.titulo)}`, `TRIGGER:-PT${e.lembreteMin}M`, "END:VALARM");
    l.push("END:VEVENT");
  }
  l.push("END:VCALENDAR");
  return `${l.map(dobrarIcs).join("\r\n")}\r\n`;
}

/** O DTSTAMP de agora ("AAAAMMDDTHHMMSSZ"). */
export const carimboIcs = (d: Date) => `${d.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;

/** A duração padrão (sem hora de fim) por extenso — o banner diz "09:00 (1 h)". */
export const DURACAO_PADRAO_MIN_ROTULO = "1 h";

/** Duração do evento em dias (inclusive) — o banner diz "3 dias". */
export const diasDoEvento = (e: Pick<EventoCalendario, "inicio" | "fim">) => diasEntre(e.inicio, e.fim) + 1;
