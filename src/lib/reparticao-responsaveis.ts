/**
 * Responsáveis por DFDs de uma repartição. Modelo: **N padrões** + **N temporários**.
 * Todo responsável tem nome, matrícula, função e uma **nomeação** (ato: portaria/decreto/
 * lei + número + link). O temporário tem, além disso, **período** (início/fim). No período
 * de um temporário, ELE é o efetivo (os padrões ficam em cinza). Guardado como JSON na
 * coluna `reparticoes.responsavel_dfd` (reaproveitada; sem migração). Puro/testável.
 * Parse tolerante: aceita o objeto novo, o `{padrao,temporarios[ato]}` anterior, o array
 * de nomes e a string única antigos.
 */

import { type Assinatura, norm } from "./parse-dfd-comum.ts";

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

// ————————————————————————————————————————————————————————————————————————————
// Conferência da ASSINATURA DIGITAL do DFD contra os responsáveis da repartição.
// Puro/testável — fonte única usada no cliente (banner) e no servidor (gravação).
// ————————————————————————————————————————————————————————————————————————————

/** Data da assinatura ("31/08/2026 16:20:00" | "31/08/2026") → ISO "2026-08-31"
 * (comparável com `inicio`/`fim`); "" se não casar. */
export function dataAssinaturaISO(data: string): string {
  const m = String(data ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** PDF exige assinatura (avulso/protocolo). O `.xlsx` nunca tem. */
export function pdfExigeAssinatura(nomeArquivo: string | null | undefined): boolean {
  return /\.pdf$/i.test(String(nomeArquivo ?? ""));
}

function mesmoNome(a: string, b: string): boolean {
  const na = norm(a);
  return na.length > 0 && na === norm(b);
}

/** O responsável que SOLICITOU a consolidação do DFD no PCA (assinatura que casou)
 * — snapshot p/ exibição. Não é ele quem autoriza; é quem pede a inclusão. */
export type Solicitante = {
  tipo: "padrao" | "temporario";
  nome: string;
  matricula: string;
  funcao: string;
  nomeacao: Nomeacao;
  inicio?: string;
  fim?: string;
  assinaturaCodigo: string;
  assinaturaData: string;
};

/**
 * Resultado da conferência: `ok` (com o responsável que casou), `sem-assinatura`
 * (informativo, só `.xlsx`) ou `erro` (bloqueia importar/protocolar/salvar).
 */
export type ResultadoAssinatura =
  | { status: "ok"; tipo: "padrao" | "temporario"; assinatura: Assinatura; responsavel: Responsavel }
  | { status: "sem-assinatura" }
  | { status: "erro"; motivo: string };

/**
 * Confere as assinaturas do DFD contra os responsáveis da repartição:
 * - sem assinatura → `erro` se PDF (exigeAssinatura), senão `sem-assinatura` (.xlsx);
 * - com assinatura mas sem responsável cadastrado → `erro` (bloqueia até cadastrar);
 * - vale se AO MENOS UMA assinatura casar (nome) com um **padrão**, ou com um
 *   **temporário** cujo período cobre a data da assinatura; senão → `erro`.
 */
export function validarAssinatura(
  assinaturas: Assinatura[],
  responsaveis: Responsaveis,
  opts: { exigeAssinatura: boolean },
): ResultadoAssinatura {
  if (assinaturas.length === 0) {
    return opts.exigeAssinatura
      ? { status: "erro", motivo: "DFD sem assinatura digital — o PDF precisa vir assinado." }
      : { status: "sem-assinatura" };
  }
  if (responsaveis.padroes.length === 0 && responsaveis.temporarios.length === 0) {
    return {
      status: "erro",
      motivo: "Repartição sem responsável por DFDs cadastrado — cadastre o responsável para conferir a assinatura.",
    };
  }
  for (const a of assinaturas) {
    const padrao = responsaveis.padroes.find((p) => mesmoNome(p.nome, a.nome));
    if (padrao) return { status: "ok", tipo: "padrao", assinatura: a, responsavel: padrao };
  }
  for (const a of assinaturas) {
    const iso = dataAssinaturaISO(a.data);
    const temp = responsaveis.temporarios.find(
      (t) => mesmoNome(t.nome, a.nome) && t.inicio && t.fim && t.inicio <= iso && iso <= t.fim,
    );
    if (temp) return { status: "ok", tipo: "temporario", assinatura: a, responsavel: temp };
  }
  return {
    status: "erro",
    motivo:
      "Assinante não é responsável autorizado desta repartição (ou fora do período do responsável temporário).",
  };
}

/** `true` quando o resultado bloqueia a gravação. */
export function bloqueiaAssinatura(r: ResultadoAssinatura): boolean {
  return r.status === "erro";
}

/** Snapshot do responsável que solicitou a consolidação (a partir de um resultado `ok`). */
export function solicitanteDeResultado(r: ResultadoAssinatura): Solicitante | null {
  if (r.status !== "ok") return null;
  const base: Solicitante = {
    tipo: r.tipo,
    nome: r.responsavel.nome,
    matricula: r.responsavel.matricula,
    funcao: r.responsavel.funcao,
    nomeacao: r.responsavel.nomeacao,
    assinaturaCodigo: r.assinatura.codigo,
    assinaturaData: r.assinatura.data,
  };
  if (r.tipo === "temporario") {
    const t = r.responsavel as ResponsavelTemporario;
    base.inicio = t.inicio;
    base.fim = t.fim;
  }
  return base;
}
