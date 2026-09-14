/**
 * Responsáveis por DFDs de uma repartição — modelo com **1 padrão** + **N temporários**
 * (cada um com período início/fim e, opcionalmente, portaria/decreto). Durante o período
 * de um temporário, ELE é o responsável efetivo (o padrão fica inativo). Guardado como
 * JSON na coluna `reparticoes.responsavel_dfd` (reaproveitada; sem migração). Puro/testável.
 * Parse tolerante: aceita o objeto novo, o array de nomes antigo E a string única antiga.
 */

export type ResponsavelTemporario = {
  nome: string;
  inicio: string; // "YYYY-MM-DD"
  fim: string; // "YYYY-MM-DD"
  ato: string | null; // portaria/decreto que nomeia (opcional)
};

export type Responsaveis = {
  padrao: string;
  temporarios: ResponsavelTemporario[];
};

export const RESPONSAVEIS_VAZIO: Responsaveis = { padrao: "", temporarios: [] };

/** Data LOCAL de hoje em "YYYY-MM-DD" (comparável lexicograficamente com as datas ISO). */
export function hojeISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function normalizarTemporario(t: unknown): ResponsavelTemporario {
  const o = (t ?? {}) as Record<string, unknown>;
  const ato = o.ato == null ? null : String(o.ato).trim() || null;
  return {
    nome: String(o.nome ?? "").trim(),
    inicio: String(o.inicio ?? "").trim(),
    fim: String(o.fim ?? "").trim(),
    ato,
  };
}

/** Lê a coluna → `Responsaveis` (tolerante ao formato novo e aos antigos). */
export function parseResponsaveis(raw: string | null | undefined): Responsaveis {
  if (raw == null) return { padrao: "", temporarios: [] };
  const s = String(raw).trim();
  if (!s) return { padrao: "", temporarios: [] };

  // Formato novo: objeto { padrao, temporarios }.
  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (o && typeof o === "object" && !Array.isArray(o)) {
        const temporarios = Array.isArray(o.temporarios)
          ? o.temporarios.map(normalizarTemporario).filter((t) => t.nome)
          : [];
        return { padrao: typeof o.padrao === "string" ? o.padrao.trim() : "", temporarios };
      }
    } catch {
      /* cai no fallback */
    }
  }

  // Formato antigo: array de nomes → o 1º vira o padrão.
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        const nome = arr.map((x) => String(x).trim()).find(Boolean) ?? "";
        return { padrao: nome, temporarios: [] };
      }
    } catch {
      /* cai no fallback */
    }
  }

  // Formato antigo: string única.
  return { padrao: s, temporarios: [] };
}

/** `Responsaveis` → texto para gravar (JSON), ou `null` se vazio. Descarta temporários
 * sem nome ou sem as duas datas. */
export function serializeResponsaveis(r: Responsaveis): string | null {
  const padrao = r.padrao.trim();
  const temporarios = r.temporarios
    .map((t) => ({ nome: t.nome.trim(), inicio: t.inicio.trim(), fim: t.fim.trim(), ato: t.ato?.trim() || null }))
    .filter((t) => t.nome && t.inicio && t.fim);
  if (!padrao && temporarios.length === 0) return null;
  return JSON.stringify({ padrao, temporarios });
}

export type EstadoTemporario = "agendado" | "vigente" | "encerrado";

/** Estado de um temporário em relação a `hoje` (datas incompletas → agendado). */
export function estadoTemporario(t: ResponsavelTemporario, hoje: string): EstadoTemporario {
  if (!t.inicio || !t.fim) return "agendado";
  if (hoje < t.inicio) return "agendado";
  if (hoje > t.fim) return "encerrado";
  return "vigente";
}

/** O temporário VIGENTE hoje (o 1º cujo período cobre `hoje`), ou `null`. */
export function temporarioVigente(r: Responsaveis, hoje: string): ResponsavelTemporario | null {
  return (
    r.temporarios.find((t) => t.nome && t.inicio && t.fim && t.inicio <= hoje && hoje <= t.fim) ?? null
  );
}

/** Responsável EFETIVO hoje: o temporário vigente, senão o padrão. `null` se nenhum. */
export function responsavelVigente(
  r: Responsaveis,
  hoje: string,
): { nome: string; tipo: "temporario" | "padrao" } | null {
  const t = temporarioVigente(r, hoje);
  if (t) return { nome: t.nome, tipo: "temporario" };
  const p = r.padrao.trim();
  return p ? { nome: p, tipo: "padrao" } : null;
}
