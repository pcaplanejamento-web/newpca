/**
 * Cliente MÍNIMO da API REST do Trello (https://developer.atlassian.com/cloud/trello/rest/) — puro e testável: o `fetch`
 * é injetável. Fala SÓ com o host fixo `api.trello.com` (sem SSRF: o caminho é validado) e autentica pelo cabeçalho
 * `Authorization: OAuth` (a chave e o token nunca vão na URL, nem nos logs). Tempo máximo por chamada: 10 s.
 */

export const HOST_TRELLO = "https://api.trello.com/1";
const TEMPO_MS = 10_000;
/** O caminho aceito: "/boards/abc/lists", "/members/me" — sem esquema, host, "..", nem query solta. */
const CAMINHO = /^\/[A-Za-z0-9_\-/]+$/;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type Parametros = Record<string, string | number | boolean | null | undefined>;

/** Falha de uma chamada ao Trello: `status` HTTP (0 = rede/tempo) e, no 429, quantos segundos esperar. */
export class ErroTrello extends Error {
  readonly status: number;
  readonly esperarS: number | null;
  constructor(message: string, status: number, esperarS: number | null = null) {
    super(message);
    this.name = "ErroTrello";
    this.status = status;
    this.esperarS = esperarS;
  }
  /** Vale tentar de novo depois (limite, rede, instabilidade do Trello). */
  get transitorio() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** A mensagem legível de um status do Trello. */
export function mensagemStatusTrello(status: number, corpo: string): string {
  if (status === 401) {
    // O Trello responde 401 tanto para o token inválido quanto para um item que a conta NÃO PODE ver ("unauthorized …
    // permission requested") — o motivo de lá distingue os dois.
    const motivo = corpo.trim().slice(0, 160);
    if (!motivo || /invalid|expired|token/i.test(motivo)) return `O Trello recusou a chave ou o token (inválido ou expirado)${motivo ? ` (Trello: ${motivo})` : ""}.`;
    return `A conta do Trello não tem acesso a este item (Trello: ${motivo}).`;
  }
  if (status === 403) {
    const motivo = corpo.trim().slice(0, 160);
    return `A conta do Trello não tem permissão para isso${motivo ? ` (Trello: ${motivo})` : ""}.`;
  }
  if (status === 404) return "Não encontrado no Trello (excluído ou sem acesso).";
  if (status === 429) return "Limite de requisições do Trello — tentando de novo em instantes.";
  if (status >= 500) return "O Trello está instável agora — tentando de novo em instantes.";
  const texto = corpo.trim().slice(0, 200);
  return texto ? `Trello: ${texto}` : `Trello respondeu ${status}.`;
}

/** A query string (valores nulos/indefinidos saem). */
export function queryTrello(p: Parametros = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type ClienteTrello = ReturnType<typeof clienteTrello>;

export function clienteTrello({ apiKey, token, fetch: buscar = (url, init) => fetch(url, init) }: { apiKey: string; token: string; fetch?: FetchLike }) {
  const auth = `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`;
  async function chamar<T>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, params?: Parametros, corpo?: unknown): Promise<T> {
    if (!CAMINHO.test(caminho) || caminho.includes("//")) throw new ErroTrello("Caminho inválido para o Trello.", 400);
    const ctl = new AbortController();
    const tempo = setTimeout(() => ctl.abort(), TEMPO_MS);
    let r: Response;
    try {
      r = await buscar(`${HOST_TRELLO}${caminho}${queryTrello(params)}`, {
        method: metodo,
        headers: { Authorization: auth, Accept: "application/json", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        signal: ctl.signal,
        // "manual" (o Workers não aceita "error"): um redirecionamento NÃO é seguido — vira erro abaixo.
        redirect: "manual",
      });
    } catch (e) {
      console.error("[trello] falha de rede:", (e as Error)?.message);
      throw new ErroTrello("Sem resposta do Trello (rede ou tempo esgotado).", 0);
    } finally {
      clearTimeout(tempo);
    }
    if (r.status >= 300 && r.status < 400) throw new ErroTrello(`O Trello redirecionou a chamada (${r.status}).`, r.status);
    if (!r.ok) {
      const texto = await r.text().catch(() => "");
      const espera = r.status === 429 ? Math.min(60, Math.max(1, Number(r.headers.get("retry-after")) || 10)) : null;
      throw new ErroTrello(mensagemStatusTrello(r.status, texto), r.status, espera);
    }
    const texto = await r.text();
    return (texto ? JSON.parse(texto) : null) as T;
  }
  return {
    get: <T>(c: string, p?: Parametros) => chamar<T>("GET", c, p),
    post: <T>(c: string, p?: Parametros, corpo?: unknown) => chamar<T>("POST", c, p, corpo),
    put: <T>(c: string, p?: Parametros, corpo?: unknown) => chamar<T>("PUT", c, p, corpo),
    del: <T>(c: string, p?: Parametros) => chamar<T>("DELETE", c, p),
    /** A conta do token. */
    eu: () => chamar<MembroTrelloApi>("GET", "/members/me", { fields: "id,username,fullName" }),
    /** Um membro pelo nome de usuário (ou id). */
    membro: (usuario: string) => {
      const u = usuario.trim().replace(/^@/, "");
      if (!/^[A-Za-z0-9_]{1,100}$/.test(u)) throw new ErroTrello("Usuário do Trello inválido (só letras, números e _).", 400);
      return chamar<MembroTrelloApi>("GET", `/members/${u}`, { fields: "id,username,fullName" });
    },
    /** Os membros das áreas de trabalho da conta (sem repetir). */
    async membrosDasAreas(): Promise<MembroTrelloApi[]> {
      const orgs = await chamar<{ id: string }[]>("GET", "/members/me/organizations", { fields: "id" });
      const vistos = new Map<string, MembroTrelloApi>();
      for (const o of orgs.slice(0, 10)) {
        const ms = await chamar<MembroTrelloApi[]>("GET", `/organizations/${o.id}/members`, { fields: "id,username,fullName" });
        for (const m of ms) vistos.set(m.id, m);
      }
      return [...vistos.values()];
    },
  };
}

export type MembroTrelloApi = { id: string; username: string; fullName: string };
