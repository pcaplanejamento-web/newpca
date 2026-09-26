/**
 * PÁGINA DE AGENDAMENTO (puro, testável): a pessoa publica um link (`/agendar/<slug>`) onde qualquer um escolhe um
 * HORÁRIO LIVRE dela — os horários saem da janela configurada (dias da semana, das HH:MM às HH:MM, em blocos da duração)
 * menos o que já está OCUPADO na agenda dela (eventos "Ocupado" que ela criou ou em que foi convidada e não recusou) e os
 * feriados; nada antes da antecedência mínima. O agendamento vira um EVENTO na tarefa escolhida.
 */
import { horaValida, minutosDe as minutos, somarDias } from "./tarefas-core.ts";

const minutosDe = (h: string) => (horaValida(h) ? minutos(h) : null);

export type PaginaAgendamento = {
  id: number;
  usuarioId: number;
  tarefaId: number;
  slug: string;
  titulo: string;
  descricao: string | null;
  duracaoMin: number;
  /** 0 = domingo … 6 = sábado. */
  dias: number[];
  horaInicio: string;
  horaFim: string;
  /** Horas mínimas entre agora e o horário. */
  antecedenciaH: number;
  /** Quantos dias à frente a página oferece. */
  janelaDias: number;
  ativa: boolean;
};

/** Um bloco OCUPADO da agenda (dia inteiro não bloqueia — como no Google Agenda). */
export type Ocupado = { data: string; horaInicio: string; horaFim: string | null };

export const DURACOES_AGENDAMENTO = [15, 30, 45, 60, 90, 120] as const;
export const JANELA_MAX_DIAS = 90;
export const MAX_PAGINAS_AGENDAMENTO = 5;
export const slugValido = (s: string) => /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(s);
/** Sugere o endereço a partir do título ("Atendimento PCA" → "atendimento-pca"). */
export const slugDe = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const diaDaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/**
 * Os horários LIVRES por dia (`agora` = "AAAA-MM-DDTHH:MM" de Brasília). Só dias com algum horário entram no mapa, na
 * ordem. Um bloco sem fim ocupa 1 hora.
 */
export function horariosLivres(p: Pick<PaginaAgendamento, "duracaoMin" | "dias" | "horaInicio" | "horaFim" | "antecedenciaH" | "janelaDias">, ocupados: Ocupado[], agora: string, feriados: Set<string> = new Set()): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const dur = Math.max(5, p.duracaoMin);
  const ini = minutosDe(p.horaInicio);
  const fim = minutosDe(p.horaFim);
  if (ini === null || fim === null || fim - ini < dur) return out;
  const porDia = new Map<string, [number, number][]>();
  for (const o of ocupados) {
    const a = minutosDe(o.horaInicio);
    if (a === null) continue;
    const b = minutosDe(o.horaFim ?? "") ?? a + 60;
    porDia.set(o.data, [...(porDia.get(o.data) ?? []), [a, Math.max(b, a + 1)]]);
  }
  const hoje = agora.slice(0, 10);
  const minimo = Date.parse(`${agora}:00Z`) + Math.max(0, p.antecedenciaH) * 3600_000;
  const janela = Math.min(JANELA_MAX_DIAS, Math.max(1, p.janelaDias));
  for (let i = 0; i < janela; i++) {
    const d = somarDias(hoje, i);
    if (!p.dias.includes(diaDaSemana(d)) || feriados.has(d)) continue;
    const blocos = porDia.get(d) ?? [];
    const livres: string[] = [];
    for (let s = ini; s + dur <= fim; s += dur) {
      if (Date.parse(`${d}T${hhmm(s)}:00Z`) < minimo) continue;
      if (blocos.some(([a, b]) => s < b && s + dur > a)) continue;
      livres.push(hhmm(s));
    }
    if (livres.length) out.set(d, livres);
  }
  return out;
}

/** O horário ainda está livre? (a confirmação do servidor refaz a conta). */
export const horarioLivre = (...[p, ocupados, agora, feriados, data, hora]: [...Parameters<typeof horariosLivres>, string, string]) =>
  horariosLivres(p, ocupados, agora, feriados).get(data)?.includes(hora) ?? false;

/** O fim do horário agendado. */
export const fimDoHorario = (hora: string, duracaoMin: number) => hhmm(Math.min(23 * 60 + 59, (minutosDe(hora) ?? 0) + duracaoMin));
