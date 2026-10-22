// TERMO DE USO + APARELHOS DA CONTA — a configuração do ADM e as regras de APARELHO (núcleo PURO, testado em
// tests/termo-aparelhos.test.ts). Blob `configuracoes`, chave `acessoConta`. Padrão = DESLIGADO: nada muda para ninguém
// até o ADM pôr em TESTE (só os testadores) ou ATIVO (todos).

export const MODOS_IMPLANTACAO = ["desligado", "teste", "ativo"] as const;
export type ModoImplantacao = (typeof MODOS_IMPLANTACAO)[number];

export type ConfigAcessoConta = {
  /** Implantação: desligado · teste (só os testadores) · ativo (todos). */
  modo: ModoImplantacao;
  /** Os usuários do TESTE. */
  testadores: number[];
  /** No teste: cada login do testador começa do zero (aceita o termo e nomeia o aparelho de novo; sem trava). */
  repetirAoEntrar: boolean;
  /** Aparelhos por conta (padrão) — 1 a 10. */
  limite: number;
  /** Exceções por papel (id do papel → limite). */
  porPapel: Record<string, number>;
  /** Dias sem nova troca depois que a pessoa troca um aparelho (0 = sem trava). */
  trocaDias: number;
  /** O Administrador fica de fora do limite (padrão; no teste, o ADM testador segue as regras). */
  isentarAdm: boolean;
  /** O encarregado pelo tratamento de dados pessoais (LGPD art. 41) — vai às cláusulas automáticas. */
  encarregado: { nome: string; email: string; telefone: string };
};

export const LIMITE_MIN = 1;
export const LIMITE_MAX = 10;
export const TROCA_MAX_DIAS = 180;
export const MAX_TESTADORES = 200;
export const OPCOES_TROCA_DIAS = [0, 1, 7, 15, 30, 60, 90, 180] as const;

export const ACESSO_CONTA_PADRAO: ConfigAcessoConta = {
  modo: "desligado",
  testadores: [],
  repetirAoEntrar: false,
  limite: 2,
  porPapel: {},
  trocaDias: 30,
  isentarAdm: true,
  encarregado: { nome: "", email: "", telefone: "" },
};

const inteiro = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
};
// biome-ignore lint/suspicious/noControlCharactersInRegex: tirar os caracteres de controle é o objetivo
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

/** Qualquer JSON → a configuração válida (o que não vale volta ao padrão — nunca derruba). */
export function lerConfigAcessoConta(v: unknown): ConfigAcessoConta {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const modo = (MODOS_IMPLANTACAO as readonly string[]).includes(o.modo as string) ? (o.modo as ModoImplantacao) : "desligado";
  const testadores = Array.isArray(o.testadores)
    ? [...new Set(o.testadores.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_TESTADORES)
    : [];
  const porPapel: Record<string, number> = {};
  if (o.porPapel && typeof o.porPapel === "object") {
    for (const [k, val] of Object.entries(o.porPapel as Record<string, unknown>)) {
      if (!/^\d+$/.test(k)) continue;
      const n = Number(val);
      if (Number.isInteger(n) && n >= LIMITE_MIN && n <= LIMITE_MAX) porPapel[k] = n;
    }
  }
  const enc = o.encarregado && typeof o.encarregado === "object" ? (o.encarregado as Record<string, unknown>) : {};
  return {
    modo,
    testadores,
    repetirAoEntrar: o.repetirAoEntrar === true,
    limite: inteiro(o.limite, LIMITE_MIN, LIMITE_MAX, ACESSO_CONTA_PADRAO.limite),
    porPapel,
    trocaDias: inteiro(o.trocaDias, 0, TROCA_MAX_DIAS, ACESSO_CONTA_PADRAO.trocaDias),
    isentarAdm: typeof o.isentarAdm === "boolean" ? o.isentarAdm : true,
    encarregado: { nome: texto(enc.nome, 120), email: texto(enc.email, 160), telefone: texto(enc.telefone, 40) },
  };
}

export type PessoaRegra = { id: number; admin: boolean };

/** As regras novas (termo e aparelhos) valem para a pessoa? O ÚNICO ponto que decide — layout, guardas, login, cadastro. */
export function regrasValemPara(cfg: ConfigAcessoConta, u: PessoaRegra): boolean {
  if (cfg.modo === "ativo") return true;
  return cfg.modo === "teste" && cfg.testadores.includes(u.id);
}

/** Pessoa em teste com "repetir a cada login". */
export function repeteAoEntrar(cfg: ConfigAcessoConta, u: PessoaRegra): boolean {
  return cfg.modo === "teste" && cfg.repetirAoEntrar && cfg.testadores.includes(u.id);
}

/** O aceite feito agora é de TESTE (não vale como oficial)? */
export const aceiteDeTeste = (cfg: ConfigAcessoConta) => cfg.modo === "teste";

/** O limite de aparelhos vale para a pessoa? (O ADM isento fica de fora — menos quando está no teste.) */
export function aparelhosValemPara(cfg: ConfigAcessoConta, u: PessoaRegra): boolean {
  if (!regrasValemPara(cfg, u)) return false;
  if (u.admin && cfg.isentarAdm && cfg.modo !== "teste") return false;
  return true;
}

/** O limite efetivo: o da pessoa › o do papel › o padrão. */
export function limiteEfetivo(cfg: ConfigAcessoConta, papelId: number | null, daPessoa: number | null | undefined): number {
  if (Number.isInteger(daPessoa) && (daPessoa as number) >= LIMITE_MIN && (daPessoa as number) <= LIMITE_MAX) return daPessoa as number;
  const doPapel = papelId != null ? cfg.porPapel[String(papelId)] : undefined;
  return doPapel ?? cfg.limite;
}

/** A trava de troca está valendo? (ISO; vazio = não.) */
export function emTrava(trocaAte: string | null | undefined, agoraMs: number): boolean {
  if (!trocaAte) return false;
  const t = Date.parse(trocaAte);
  return Number.isFinite(t) && t > agoraMs;
}

export type SituacaoNovoAparelho =
  /** Há vaga: nomear e pronto. */
  | { tipo: "livre" }
  /** Sem vaga: escolher um aparelho para trocar. */
  | { tipo: "lotado" }
  /** Troca recente: aparelho novo não entra até a data (mesmo com vaga). */
  | { tipo: "trava"; ate: string };

/**
 * Um aparelho NOVO pode entrar? `total` = os aparelhos já registrados. A trava (depois de uma troca feita pela pessoa)
 * barra QUALQUER aparelho novo até a data — senão "remover agora e entrar depois" escaparia dela. Sem aparelho algum
 * nunca há trava. No teste com "repetir", não há trava.
 */
export function situacaoNovoAparelho(a: { total: number; limite: number; trocaAte: string | null; agoraMs: number; semTrava?: boolean }): SituacaoNovoAparelho {
  if (a.total > 0 && !a.semTrava && emTrava(a.trocaAte, a.agoraMs)) return { tipo: "trava", ate: a.trocaAte as string };
  return a.total < a.limite ? { tipo: "livre" } : { tipo: "lotado" };
}

/** A data em que a trava termina, a partir de agora (0 dias = sem trava → null). */
export function fimDaTrava(agoraMs: number, dias: number): string | null {
  return dias > 0 ? new Date(agoraMs + dias * 86_400_000).toISOString() : null;
}

export const NOME_APARELHO_MIN = 2;
export const NOME_APARELHO_MAX = 40;

/** O nome do aparelho, limpo (sem controles/invisíveis, espaços juntos) — `null` = inválido. */
export function nomeAparelhoValido(nome: unknown): string | null {
  if (typeof nome !== "string") return null;
  const n = nome
    // biome-ignore lint/suspicious/noControlCharactersInRegex: tirar os caracteres de controle é o objetivo
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return n.length >= NOME_APARELHO_MIN && n.length <= NOME_APARELHO_MAX ? n : null;
}

/** Iniciais públicas de um nome ("Ana Maria Souza" → "A. M. S.") — a verificação pública nunca mostra o nome inteiro. */
export function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÀ-Ý]/.test(p))
    .map((p) => `${p[0].toUpperCase()}.`)
    .slice(0, 5)
    .join(" ");
}

/** O cookie do aparelho (o MESMO do alerta de login suspeito — 32 hex aleatórios, httpOnly, 2 anos). */
export const COOKIE_APARELHO = "pca_aparelho";
export const idAparelhoValido = (v: string | undefined | null): v is string => !!v && /^[0-9a-f]{32}$/.test(v);

/** O hash do aparelho guardado na tabela `aparelhos` (o banco nunca vê o cookie). */
export async function hashDoAparelho(cookieId: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`aparelho:${cookieId}`));
  return [...new Uint8Array(b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}

/** O que a sessão exige antes de liberar o sistema (calculado no `getUsuarioAtual`, sem consulta a mais). */
export type PendenciaAcesso = {
  /** O aparelho desta sessão ainda não tem nome. */
  nomearAparelho: boolean;
  /** O termo: em dia · na carência (aviso) · vencido (bloqueia). */
  termo: "ok" | "carencia" | "bloqueado";
  /** O aparelho nomeado da sessão (null = ainda sem nome). */
  aparelhoId: number | null;
};
export const SEM_PENDENCIA: PendenciaAcesso = { nomearAparelho: false, termo: "ok", aparelhoId: null };

/** A pessoa precisa resolver algo ANTES de usar o sistema (a tela vai a `/acesso/...`; a API responde 403)? */
export function destinoBloqueio(p: PendenciaAcesso): "/acesso/aparelho" | "/acesso/termo" | null {
  if (p.nomearAparelho) return "/acesso/aparelho";
  if (p.termo === "bloqueado") return "/acesso/termo";
  return null;
}
