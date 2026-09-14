/**
 * Responsáveis por DFDs de uma repartição. Modelo: **N padrões** + **N temporários**.
 * Todo responsável tem nome, matrícula, função e uma **nomeação** (ato: portaria/decreto/
 * lei + número + link). O temporário tem, além disso, **período** (início/fim). No período
 * de um temporário, ELE é o efetivo (os padrões ficam em cinza). Guardado como JSON na
 * coluna `reparticoes.responsavel_dfd` (reaproveitada; sem migração). Puro/testável.
 * Parse tolerante: aceita o objeto novo, o `{padrao,temporarios[ato]}` anterior, o array
 * de nomes e a string única antigos.
 */

export type TipoAto = "portaria" | "decreto" | "lei";

export const TIPOS_ATO: { valor: TipoAto; rotulo: string }[] = [
  { valor: "portaria", rotulo: "Portaria" },
  { valor: "decreto", rotulo: "Decreto" },
  { valor: "lei", rotulo: "Lei" },
];

/** Ato que nomeia o responsável (opcional). */
export type Nomeacao = { tipo: TipoAto | null; numero: string; link: string };
/** Responsável (padrão ou base do temporário). */
export type Responsavel = { nome: string; matricula: string; funcao: string; nomeacao: Nomeacao };
/** Responsável temporário = responsável + período de vigência. */
export type ResponsavelTemporario = Responsavel & { inicio: string; fim: string };
export type Responsaveis = { padroes: Responsavel[]; temporarios: ResponsavelTemporario[] };

export const RESPONSAVEIS_VAZIO: Responsaveis = { padroes: [], temporarios: [] };

/** Fábricas — sempre objetos NOVOS (sem referências compartilhadas). */
export function novaNomeacao(): Nomeacao {
  return { tipo: null, numero: "", link: "" };
}
export function novoResponsavel(nome = ""): Responsavel {
  return { nome, matricula: "", funcao: "", nomeacao: novaNomeacao() };
}
export function novoTemporario(): ResponsavelTemporario {
  return { ...novoResponsavel(), inicio: "", fim: "" };
}

/** Data LOCAL de hoje em "YYYY-MM-DD" (comparável lexicograficamente com as datas ISO). */
export function hojeISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function txt(v: unknown): string {
  return String(v ?? "").trim();
}

function normNomeacao(o: unknown): Nomeacao {
  const oo = (o ?? {}) as Record<string, unknown>;
  const tipo = oo.tipo === "portaria" || oo.tipo === "decreto" || oo.tipo === "lei" ? oo.tipo : null;
  return { tipo, numero: txt(oo.numero), link: txt(oo.link) };
}
function normResponsavel(o: unknown): Responsavel {
  const oo = (o ?? {}) as Record<string, unknown>;
  return { nome: txt(oo.nome), matricula: txt(oo.matricula), funcao: txt(oo.funcao), nomeacao: normNomeacao(oo.nomeacao) };
}
function normTemporario(o: unknown): ResponsavelTemporario {
  const oo = (o ?? {}) as Record<string, unknown>;
  return { ...normResponsavel(oo), inicio: txt(oo.inicio), fim: txt(oo.fim) };
}
/** Temporário do formato ANTERIOR ({nome, inicio, fim, ato}) — `ato` (texto livre) vira o número. */
function migrarTemporarioAntigo(o: unknown): ResponsavelTemporario {
  const oo = (o ?? {}) as Record<string, unknown>;
  const ato = txt(oo.ato);
  return {
    nome: txt(oo.nome),
    matricula: "",
    funcao: "",
    nomeacao: { tipo: null, numero: ato, link: "" },
    inicio: txt(oo.inicio),
    fim: txt(oo.fim),
  };
}

/** Lê a coluna → `Responsaveis` (tolerante aos formatos novo e antigos). */
export function parseResponsaveis(raw: string | null | undefined): Responsaveis {
  if (raw == null) return { padroes: [], temporarios: [] };
  const s = String(raw).trim();
  if (!s) return { padroes: [], temporarios: [] };

  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (o && typeof o === "object" && !Array.isArray(o)) {
        // Formato novo: { padroes: [...], temporarios: [...] }.
        if (Array.isArray(o.padroes)) {
          return {
            padroes: o.padroes.map(normResponsavel).filter((r) => r.nome),
            temporarios: Array.isArray(o.temporarios) ? o.temporarios.map(normTemporario).filter((t) => t.nome) : [],
          };
        }
        // Formato anterior: { padrao: string, temporarios: [{nome, inicio, fim, ato}] }.
        const padroes: Responsavel[] = [];
        if (typeof o.padrao === "string" && o.padrao.trim()) padroes.push(novoResponsavel(o.padrao.trim()));
        const temporarios = Array.isArray(o.temporarios)
          ? o.temporarios.map(migrarTemporarioAntigo).filter((t) => t.nome)
          : [];
        return { padroes, temporarios };
      }
    } catch {
      /* cai no fallback */
    }
  }

  // Formato antigo: array de nomes → 1º vira padrão.
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        const nome = arr.map((x) => txt(x)).find(Boolean) ?? "";
        return { padroes: nome ? [novoResponsavel(nome)] : [], temporarios: [] };
      }
    } catch {
      /* cai no fallback */
    }
  }

  // Formato antigo: string única.
  return { padroes: [novoResponsavel(s)], temporarios: [] };
}

function limparNomeacao(n: Nomeacao): Nomeacao {
  if (!n.tipo) return { tipo: null, numero: "", link: "" }; // sem ato → zera número/link
  return { tipo: n.tipo, numero: n.numero.trim(), link: n.link.trim() };
}
function limparResponsavel(r: Responsavel): Responsavel {
  return { nome: r.nome.trim(), matricula: r.matricula.trim(), funcao: r.funcao.trim(), nomeacao: limparNomeacao(r.nomeacao) };
}

/** `Responsaveis` → JSON para gravar, ou `null` se vazio. Descarta responsáveis sem nome e
 * temporários sem as duas datas. */
export function serializeResponsaveis(r: Responsaveis): string | null {
  const padroes = r.padroes.map(limparResponsavel).filter((p) => p.nome);
  const temporarios = r.temporarios
    .map((t) => ({ ...limparResponsavel(t), inicio: t.inicio.trim(), fim: t.fim.trim() }))
    .filter((t) => t.nome && t.inicio && t.fim);
  if (padroes.length === 0 && temporarios.length === 0) return null;
  return JSON.stringify({ padroes, temporarios });
}

export type EstadoTemporario = "agendado" | "vigente" | "encerrado";

/** Estado de um temporário em relação a `hoje` (datas incompletas → agendado). */
export function estadoTemporario(t: ResponsavelTemporario, hoje: string): EstadoTemporario {
  if (!t.inicio || !t.fim) return "agendado";
  if (hoje < t.inicio) return "agendado";
  if (hoje > t.fim) return "encerrado";
  return "vigente";
}

/** Temporários VIGENTES hoje (período cobre `hoje`). */
export function temporariosVigentes(r: Responsaveis, hoje: string): ResponsavelTemporario[] {
  return r.temporarios.filter((t) => t.nome && t.inicio && t.fim && t.inicio <= hoje && hoje <= t.fim);
}

/** Os padrões ficam INATIVOS (cinza) quando há ao menos um temporário vigente. */
export function padroesInativos(r: Responsaveis, hoje: string): boolean {
  return temporariosVigentes(r, hoje).length > 0;
}

/** Responsáveis EFETIVOS hoje: os temporários vigentes, senão os padrões. */
export function responsaveisVigentes(
  r: Responsaveis,
  hoje: string,
): { resp: Responsavel; tipo: "temporario" | "padrao" }[] {
  const temps = temporariosVigentes(r, hoje);
  if (temps.length > 0) return temps.map((t) => ({ resp: t, tipo: "temporario" as const }));
  return r.padroes.filter((p) => p.nome).map((p) => ({ resp: p, tipo: "padrao" as const }));
}
