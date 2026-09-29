/**
 * Cliente MÍNIMO da API do Resend (https://resend.com/docs/api-reference) — puro e testável: o `fetch` é injetável. Fala
 * SÓ com o host fixo `api.resend.com` e autentica pelo cabeçalho `Authorization: Bearer` (a chave nunca vai na URL, nem nos
 * logs). Tempo máximo por chamada: 10 s.
 */

export const HOST_RESEND = "https://api.resend.com";
const TEMPO_MS = 10_000;
/** Quantos e-mails o `/emails/batch` aceita por chamada. */
export const MAX_LOTE_RESEND = 100;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Falha de uma chamada ao Resend: `status` HTTP (0 = rede/tempo) e, no 429, quantos segundos esperar. */
export class ErroResend extends Error {
  readonly status: number;
  readonly esperarS: number | null;
  constructor(message: string, status: number, esperarS: number | null = null) {
    super(message);
    this.name = "ErroResend";
    this.status = status;
    this.esperarS = esperarS;
  }
  /** Vale tentar de novo depois (limite, rede, instabilidade do Resend). */
  get transitorio() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** A mensagem legível de um status do Resend (o corpo de erro dele é `{ statusCode, name, message }`). */
export function mensagemStatusResend(status: number, corpo: string): string {
  let motivo = corpo.trim();
  try {
    const j = JSON.parse(corpo) as { message?: unknown };
    if (typeof j?.message === "string") motivo = j.message;
  } catch {
    /* corpo não é JSON */
  }
  motivo = motivo.slice(0, 200);
  const de = motivo ? ` (Resend: ${motivo})` : "";
  if (status === 401 || status === 403) return `O Resend recusou a chave de API (inválida, revogada ou sem permissão)${de}.`;
  if (status === 404) return `Não encontrado no Resend${de}.`;
  if (status === 422) return `O Resend recusou o e-mail${de}.`;
  if (status === 429) return "Limite de envios do Resend — tentando de novo em instantes.";
  if (status >= 500) return "O Resend está instável agora — tentando de novo em instantes.";
  return motivo ? `Resend: ${motivo}` : `Resend respondeu ${status}.`;
}

export type EmailResend = { from: string; to: string[]; subject: string; html: string; text: string; reply_to?: string };
export type DominioResend = { id: string; name: string; status: string; region?: string };

export type ClienteResend = ReturnType<typeof clienteResend>;

export function clienteResend({ apiKey, fetch: buscar = (url, init) => fetch(url, init) }: { apiKey: string; fetch?: FetchLike }) {
  async function chamar<T>(metodo: "GET" | "POST", caminho: "/domains" | "/emails" | "/emails/batch", corpo?: unknown): Promise<T> {
    const ctl = new AbortController();
    const tempo = setTimeout(() => ctl.abort(), TEMPO_MS);
    let r: Response;
    try {
      r = await buscar(`${HOST_RESEND}${caminho}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        signal: ctl.signal,
        // "manual" (o Workers não aceita "error"): um redirecionamento NÃO é seguido — vira erro abaixo.
        redirect: "manual",
      });
    } catch (e) {
      console.error("[resend] falha de rede:", (e as Error)?.message);
      throw new ErroResend("Sem resposta do Resend (rede ou tempo esgotado).", 0);
    } finally {
      clearTimeout(tempo);
    }
    if (r.status >= 300 && r.status < 400) throw new ErroResend(`O Resend redirecionou a chamada (${r.status}).`, r.status);
    if (!r.ok) {
      const texto = await r.text().catch(() => "");
      const espera = r.status === 429 ? Math.min(60, Math.max(1, Number(r.headers.get("retry-after")) || 2)) : null;
      throw new ErroResend(mensagemStatusResend(r.status, texto), r.status, espera);
    }
    const texto = await r.text();
    return (texto ? JSON.parse(texto) : null) as T;
  }
  return {
    /** Os domínios da conta (exige a chave com acesso total). */
    async dominios(): Promise<DominioResend[]> {
      const r = await chamar<{ data?: DominioResend[] }>("GET", "/domains");
      return Array.isArray(r?.data) ? r.data : [];
    },
    /** Envia UM e-mail; devolve o id do Resend. */
    async enviar(email: EmailResend): Promise<string> {
      const r = await chamar<{ id?: string }>("POST", "/emails", email);
      return r?.id ?? "";
    },
    /** Envia até `MAX_LOTE_RESEND` e-mails numa chamada; devolve os ids na MESMA ordem. */
    async enviarLote(emails: EmailResend[]): Promise<string[]> {
      if (!emails.length) return [];
      if (emails.length > MAX_LOTE_RESEND) throw new ErroResend(`No máximo ${MAX_LOTE_RESEND} e-mails por lote.`, 400);
      const r = await chamar<{ data?: { id?: string }[] }>("POST", "/emails/batch", emails);
      return (r?.data ?? []).map((d) => d?.id ?? "");
    },
  };
}
