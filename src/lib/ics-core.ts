/**
 * AGENDAS EXTERNAS (puro, testável): lê um `.ics` (RFC 5545) de outra agenda — Google, Outlook, feriados de um órgão — e
 * o transforma nos eventos do calendário, SOMENTE LEITURA. Tolerante: o que não entende é ignorado (nunca lança).
 *
 * - Linhas dobradas (espaço/tab no início) são desdobradas; texto com `\n`, `\,`, `\;` e `\\` volta ao normal.
 * - DTSTART/DTEND com `VALUE=DATE` = dia inteiro (o DTEND é EXCLUSIVO — o último dia é o anterior); com `Z` (UTC) ou um
 *   TZID que o `Intl` conhece, levado a Brasília (UTC−3, sem horário de verão desde 2019); sem fuso ou com fuso
 *   desconhecido (nomes do Windows) = o horário como está escrito. Parâmetros entre aspas podem ter ":" e ";".
 * - RRULE: FREQ (DAILY/WEEKLY/MONTHLY/YEARLY), INTERVAL, UNTIL, COUNT e BYDAY (na semanal; anda junto quando o fuso muda
 *   o dia) — a MESMA expansão dos eventos do sistema (`ocorrenciasDoEvento`); regra que o sistema não reproduz ("2ª terça
 *   do mês", BYMONTHDAY/BYSETPOS…) = o evento aparece uma vez. EXDATE e as ocorrências alteradas (RECURRENCE-ID) saem da
 *   série.
 * - STATUS:CANCELLED some. Teto de `MAX_EVENTOS_ICS` eventos por agenda.
 */
import { dataValida, diasEntre, type EventoCalendario, ocorrenciasDoEvento, type RecorrenciaEvento, somarDias } from "./tarefas-core.ts";

export const MAX_EVENTOS_ICS = 3000;
/** Tamanho máximo do arquivo baixado (bytes). */
export const MAX_BYTES_ICS = 2_000_000;
export const MAX_AGENDAS_EXTERNAS = 10;

export type EventoIcs = {
  uid: string;
  titulo: string;
  local: string | null;
  descricao: string | null;
  data: string;
  dataFim: string | null;
  diaInteiro: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  recorrencia: RecorrenciaEvento | null;
  /** COUNT da RRULE (quantas ocorrências a série tem). */
  total: number | null;
  /** As datas tiradas da série (EXDATE e as ocorrências alteradas). */
  excecoes: string[];
};

export type AgendaExterna = { id: number; nome: string; cor: string | null; eventos: EventoIcs[] };

const desescapar = (t: string) => t.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c)).trim();

type Prop = { nome: string; params: Record<string, string>; valor: string };
/** "NOME;PARAM=valor;PARAM="valor com ; e :":VALOR" — os valores entre aspas podem ter ":" e ";" (o TZID do Outlook). */
function lerProp(linha: string): Prop | null {
  const m = /^[A-Za-z0-9-]+/.exec(linha);
  if (!m) return null;
  const params: Record<string, string> = {};
  let i = m[0].length;
  while (linha[i] === ";") {
    const igual = linha.indexOf("=", i + 1);
    if (igual < 0) return null;
    const nome = linha.slice(i + 1, igual).toUpperCase();
    let valor = "";
    i = igual + 1;
    while (i < linha.length && linha[i] !== ";" && linha[i] !== ":") {
      if (linha[i] === '"') {
        const fecha = linha.indexOf('"', i + 1);
        if (fecha < 0) return null;
        valor += linha.slice(i + 1, fecha);
        i = fecha + 1;
      } else valor += linha[i++];
    }
    params[nome] = valor;
  }
  if (linha[i] !== ":") return null;
  return { nome: m[0].toUpperCase(), params, valor: linha.slice(i + 1) };
}

/** Diferença (min) entre o relógio do fuso e o UTC no instante `t` — `null` = fuso que o `Intl` não conhece (ex.: os
 * nomes do Windows), aí o horário vale como está escrito. Formatador em cache por fuso (milhares de eventos). */
const formatadores = new Map<string, Intl.DateTimeFormat | null>();
function deslocamentoMin(tz: string, t: number): number | null {
  if (!formatadores.has(tz)) {
    try {
      formatadores.set(tz, new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }));
    } catch {
      formatadores.set(tz, null);
    }
  }
  const f = formatadores.get(tz);
  if (!f) return null;
  const v: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(t))) if (p.type !== "literal") v[p.type] = Number(p.value);
  return Math.round((Date.UTC(v.year, v.month - 1, v.day, v.hour % 24, v.minute) - Math.floor(t / 60_000) * 60_000) / 60_000);
}

/** O instante (ms UTC) do horário de parede `data hora` no fuso `tz` (`null` = fuso desconhecido). */
function instanteNoFuso(data: string, hora: string, tz: string): number | null {
  const parede = Date.parse(`${data}T${hora}:00Z`);
  const d1 = deslocamentoMin(tz, parede);
  if (d1 == null) return null;
  const d2 = deslocamentoMin(tz, parede - d1 * 60_000) ?? d1;
  return parede - d2 * 60_000;
}

/** "20260925" / "20260925T130000[Z]" → data + hora de Brasília (`null` = dia inteiro). UTC (`Z`) e TZID conhecido são
 * convertidos para Brasília (UTC−3); sem fuso ou com um fuso desconhecido, o horário vale como está escrito. */
export function dataHoraIcs(p: Pick<Prop, "params" | "valor">): { data: string; hora: string | null } | null {
  const v = p.valor.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const data = `${m[1]}-${m[2]}-${m[3]}`;
  if (!dataValida(data)) return null;
  if (!m[4] || p.params.VALUE === "DATE") return { data, hora: null };
  const hora = `${m[4]}:${m[5]}`;
  const tz = (p.params.TZID ?? "").trim();
  const instante = m[7] === "Z" || /^(utc|gmt|etc\/utc|z)$/i.test(tz) ? Date.parse(`${data}T${hora}:00Z`) : tz ? instanteNoFuso(data, hora, tz) : null;
  if (instante == null) return { data, hora };
  const t = new Date(instante - 3 * 3600_000).toISOString();
  return { data: t.slice(0, 10), hora: t.slice(11, 16) };
}

const DIAS_ICS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const FREQ_ICS: Record<string, RecorrenciaEvento["freq"]> = { DAILY: "diaria", WEEKLY: "semanal", MONTHLY: "mensal", YEARLY: "anual" };

/** A RRULE → a regra do sistema (+ COUNT); `null` = regra que o sistema não repete (horária, "2ª terça do mês" etc.). */
export function regraIcs(valor: string): { recorrencia: RecorrenciaEvento; total: number | null } | null {
  const o: Record<string, string> = {};
  for (const par of valor.split(";")) {
    const i = par.indexOf("=");
    if (i > 0) o[par.slice(0, i).toUpperCase()] = par.slice(i + 1);
  }
  const freq = FREQ_ICS[(o.FREQ ?? "").toUpperCase()];
  if (!freq) return null;
  // Regras que o sistema não repete com fidelidade ("2ª terça do mês", dia do mês/posição/semana do ano): o evento
  // aparece UMA vez (a data de início) — nunca em datas erradas.
  if (o.BYSETPOS || o.BYMONTHDAY || o.BYYEARDAY || o.BYWEEKNO || o.BYHOUR || o.BYMINUTE || (freq !== "semanal" && o.BYDAY)) return null;
  const intervalo = Math.min(365, Math.max(1, Number.parseInt(o.INTERVAL ?? "1", 10) || 1));
  const dias = freq === "semanal" && o.BYDAY ? [...new Set(o.BYDAY.split(",").map((d) => DIAS_ICS.indexOf(d.trim().slice(-2).toUpperCase())).filter((d) => d >= 0))].sort() : [];
  const ate = o.UNTIL ? (dataHoraIcs({ params: {}, valor: o.UNTIL })?.data ?? null) : null;
  const total = o.COUNT ? Math.max(1, Number.parseInt(o.COUNT, 10) || 1) : null;
  return { recorrencia: { freq, intervalo, dias, ate }, total };
}

/** O texto `.ics` → os eventos (as séries ficam compactas; `eventosExternos` as expande no intervalo). */
export function lerIcs(texto: string): EventoIcs[] {
  const linhas = texto.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: EventoIcs[] = [];
  const alteradas = new Map<string, string[]>();
  let atual: Prop[] | null = null;
  // Componentes DENTRO do evento (VALARM) são pulados.
  let aninhado = 0;
  for (const l of linhas) {
    const t = l.trim();
    if (/^BEGIN:VEVENT$/i.test(t)) {
      atual = [];
      aninhado = 0;
    } else if (atual && /^END:VEVENT$/i.test(t)) {
      const ev = eventoDe(atual, alteradas);
      if (ev) out.push(ev);
      atual = null;
      if (out.length >= MAX_EVENTOS_ICS) break;
    } else if (atual && /^BEGIN:/i.test(t)) aninhado++;
    else if (atual && /^END:/i.test(t)) aninhado = Math.max(0, aninhado - 1);
    else if (atual && aninhado === 0) {
      const p = lerProp(t);
      if (p) atual.push(p);
    }
  }
  // As ocorrências ALTERADAS saem da série (entram como eventos soltos).
  return out.map((e) => (e.recorrencia && alteradas.has(e.uid) ? { ...e, excecoes: [...e.excecoes, ...(alteradas.get(e.uid) ?? [])] } : e));
}

function eventoDe(props: Prop[], alteradas: Map<string, string[]>): EventoIcs | null {
  const um = (n: string) => props.find((p) => p.nome === n);
  if ((um("STATUS")?.valor ?? "").trim().toUpperCase() === "CANCELLED") return null;
  const ini = um("DTSTART") ? dataHoraIcs(um("DTSTART") as Prop) : null;
  if (!ini) return null;
  const uid = (um("UID")?.valor ?? "").trim().slice(0, 200) || `${ini.data}:${(um("SUMMARY")?.valor ?? "").slice(0, 40)}`;
  const rid = um("RECURRENCE-ID");
  if (rid) {
    const d = dataHoraIcs(rid)?.data;
    if (d) alteradas.set(uid, [...(alteradas.get(uid) ?? []), d]);
  }
  const fimP = um("DTEND") ? dataHoraIcs(um("DTEND") as Prop) : null;
  const diaInteiro = ini.hora === null;
  let dataFim: string | null = null;
  let horaFim: string | null = null;
  if (fimP) {
    // O DTEND do dia inteiro é EXCLUSIVO.
    const ultimo = diaInteiro ? somarDias(fimP.data, -1) : fimP.data;
    if (ultimo > ini.data) dataFim = ultimo;
    if (!diaInteiro && fimP.hora && (fimP.data > ini.data || fimP.hora > (ini.hora ?? ""))) horaFim = fimP.hora;
  }
  let regra = !rid && um("RRULE") ? regraIcs((um("RRULE") as Prop).valor) : null;
  // A conversão de fuso pode MUDAR O DIA (terça 01:00 UTC = segunda 22:00 em Brasília): os dias da semana andam junto.
  const escrito = /^(\d{4})(\d{2})(\d{2})/.exec((um("DTSTART") as Prop).valor.trim());
  const desloc = escrito ? diasEntre(`${escrito[1]}-${escrito[2]}-${escrito[3]}`, ini.data) : 0;
  if (regra && desloc && regra.recorrencia.dias.length)
    regra = { ...regra, recorrencia: { ...regra.recorrencia, dias: [...new Set(regra.recorrencia.dias.map((d) => (((d + desloc) % 7) + 7) % 7))].sort() } };
  const excecoes = props
    .filter((p) => p.nome === "EXDATE")
    .flatMap((p) => p.valor.split(",").map((v) => dataHoraIcs({ params: p.params, valor: v })?.data))
    .filter((d): d is string => !!d);
  const texto = (n: string, max: number) => {
    const v = um(n)?.valor;
    return v ? desescapar(v).slice(0, max) || null : null;
  };
  return {
    uid,
    titulo: texto("SUMMARY", 200) ?? "(Sem título)",
    local: texto("LOCATION", 200),
    descricao: texto("DESCRIPTION", 2000),
    data: ini.data,
    dataFim,
    diaInteiro,
    horaInicio: ini.hora,
    horaFim,
    recorrencia: regra?.recorrencia ?? null,
    total: regra?.total ?? null,
    excecoes,
  };
}

/** As datas de um evento externo que CRUZAM o intervalo (a série expandida, sem as exceções, respeitando o COUNT). */
export function datasDoEventoIcs(e: EventoIcs, de: string, ate: string): string[] {
  const dur = e.dataFim ? Math.max(0, Math.round((Date.parse(`${e.dataFim}T00:00:00Z`) - Date.parse(`${e.data}T00:00:00Z`)) / 86_400_000)) : 0;
  const serie = e.total ? ocorrenciasDoEvento(e, e.data, ate, e.total) : ocorrenciasDoEvento(e, de, ate);
  const fora = new Set(e.excecoes);
  return serie.filter((d) => !fora.has(d) && somarDias(d, dur) >= de && d <= ate);
}

/** Os eventos das agendas externas no intervalo — tipo `externo`, chave `x{agenda}:{uid}:{data}`, SOMENTE LEITURA. */
export function eventosExternos(agendas: AgendaExterna[], de: string, ate: string): EventoCalendario[] {
  const lista: EventoCalendario[] = [];
  for (const a of agendas)
    for (const e of a.eventos)
      for (const d of datasDoEventoIcs(e, de, ate)) {
        const fim = e.dataFim ? somarDias(d, Math.round((Date.parse(`${e.dataFim}T00:00:00Z`) - Date.parse(`${e.data}T00:00:00Z`)) / 86_400_000)) : d;
        lista.push({
          chave: `x${a.id}:${e.uid.slice(0, 60)}:${d}`,
          tipo: "externo",
          tarefaId: 0,
          quadroId: 0,
          ticket: 0,
          titulo: e.titulo,
          tarefaTitulo: a.nome,
          tarefaPrazo: null,
          inicio: d,
          fim,
          diaInteiro: e.diaInteiro,
          horaInicio: e.horaInicio,
          horaFim: e.horaFim,
          local: e.local,
          descricao: e.descricao,
          cor: a.cor,
          concluida: false,
          recorrente: !!e.recorrencia,
          eventoId: null,
          lembreteMin: null,
          prevista: false,
          pca: null,
          externo: { agendaId: a.id, agendaNome: a.nome },
        });
      }
  return lista;
}

/** A URL da agenda: `webcal://` vira `https://`; só HTTPS e nunca um endereço interno (localhost, IP privado). */
export function urlAgendaValida(bruta: string): string | null {
  const s = bruta.trim().replace(/^webcals?:\/\//i, "https://");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  // O ponto final ("localhost.", "x.internal.") é o MESMO nome — sai antes das checagens.
  const h = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
  // IP literal: recusa os privados/reservados (v4) e todo IPv6 literal.
  if (h.startsWith("[")) return null;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    const c = Number(ip[3]);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    )
      return null;
  }
  return u.toString().slice(0, 1000);
}
