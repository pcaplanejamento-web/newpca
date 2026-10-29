import { caminhoExtrato, codigoEmpresa, HOST_AUTH_VOLUS, HOST_EXTRATO_VOLUS, mensagemStatusVolus, type TipoTransacao, texto } from "./volus-core.ts";

/**
 * Cliente MÍNIMO da API da Vólus — puro e testável (o `fetch` é injetável). Só os hosts FIXOS (`auth.api.volus.com` e
 * `extrato.api.volus.com`), credenciais no corpo do formulário e o token no cabeçalho `Authorization` (nunca na URL nem nos
 * logs). O token (1 h) fica na memória do processo e é renovado 2 min antes de vencer. O extrato é lido em STREAMING com
 * teto de bytes: passou do teto, a leitura PARA e devolve o tamanho — quem chama divide o período (a resposta não tem
 * paginação e ler um JSON grande estoura a CPU do Worker).
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const TEMPO_AUTH_MS = 15_000;
const TEMPO_EXTRATO_MS = 25_000;

/** Falha de uma chamada à Vólus: `status` HTTP (0 = rede/tempo); `transitorio` = vale tentar de novo depois. */
export class ErroVolus extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ErroVolus";
    this.status = status;
  }
  get transitorio() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export type EmpresaVolus = { id: string; nome: string };
type Token = { token: string; vence: number; empresas: EmpresaVolus[] };
const tokens = new Map<string, Token>();

/** O resultado da leitura de um extrato: o texto inteiro, ou `grande` (passou do teto — `bytes` = o que já tinha vindo). */
export type Extrato = { grande: false; texto: string; bytes: number; ms: number } | { grande: true; bytes: number; ms: number };

export function clienteVolus({ clientId, clientSecret, fetch: buscar = (url, init) => fetch(url, init), agora = () => Date.now() }: { clientId: string; clientSecret: string; fetch?: FetchLike; agora?: () => number }) {
  // A memória do token é por CREDENCIAL (trocar o segredo não reaproveita o token da anterior).
  const chaveToken = `${clientId}:${clientSecret}`;
  async function chamar(url: string, init: RequestInit, tempoMs: number): Promise<Response> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), tempoMs);
    try {
      return await buscar(url, { ...init, signal: ctl.signal, redirect: "manual" });
    } catch (e) {
      const tempo = (e as Error)?.name === "AbortError";
      throw new ErroVolus(tempo ? "A Vólus demorou demais para responder." : "Sem resposta da Vólus (rede).", 0);
    } finally {
      clearTimeout(t);
    }
  }

  /** O token (da memória, se ainda vale) + as empresas (contratos) que a credencial alcança. */
  async function autenticar(forcar = false): Promise<Token> {
    const guardado = tokens.get(chaveToken);
    if (!forcar && guardado && agora() < guardado.vence - 120_000) return guardado;
    const r = await chamar(
      `${HOST_AUTH_VOLUS}/v1/partners/auth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString(),
      },
      TEMPO_AUTH_MS,
    );
    const corpo = await r.text().catch(() => "");
    if (r.status >= 300 && r.status < 400) throw new ErroVolus(`A Vólus redirecionou a autenticação (${r.status}).`, r.status);
    if (!r.ok) throw new ErroVolus(mensagemStatusVolus(r.status, corpo), r.status);
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(corpo) as Record<string, unknown>;
    } catch {
      throw new ErroVolus("A autenticação da Vólus respondeu num formato inesperado.", r.status);
    }
    const dados = (j.data && typeof j.data === "object" ? j.data : j) as Record<string, unknown>;
    const token = texto(dados.access_token, 8000);
    if (!token) throw new ErroVolus("A autenticação da Vólus respondeu sem o token.", r.status);
    const empresas = (Array.isArray(dados.companies) ? dados.companies : [])
      .map((c) => {
        const x = (c ?? {}) as Record<string, unknown>;
        return { id: codigoEmpresa(x.id ?? x.company_id), nome: texto(x.name ?? x.company_name, 200) ?? "" };
      })
      .filter((c) => c.id);
    const t: Token = { token, vence: agora() + (Number(dados.expires_in) > 0 ? Number(dados.expires_in) : 3600) * 1000, empresas };
    tokens.set(chaveToken, t);
    return t;
  }

  /** Um extrato (empresa × período), com teto de `maxBytes`. 401 renova o token UMA vez. */
  async function extrato(tipo: TipoTransacao, contrato: string, inicio: string, fim: string, maxBytes: number): Promise<Extrato> {
    const params = new URLSearchParams({ start_date: inicio, end_date: fim, company_id: contrato });
    const url = `${HOST_EXTRATO_VOLUS}${caminhoExtrato(tipo)}?${params.toString()}`;
    const t0 = agora();
    for (let tentativa = 0; ; tentativa++) {
      const { token } = await autenticar(tentativa > 0);
      const r = await chamar(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, TEMPO_EXTRATO_MS);
      if (r.status === 401 && tentativa === 0) {
        await r.body?.cancel().catch(() => {});
        continue;
      }
      if (r.status >= 300 && r.status < 400) throw new ErroVolus(`A Vólus redirecionou o extrato (${r.status}).`, r.status);
      if (!r.ok) throw new ErroVolus(mensagemStatusVolus(r.status, await r.text().catch(() => "")), r.status);
      const comprimento = Number(r.headers.get("content-length"));
      if (Number.isFinite(comprimento) && comprimento > maxBytes) {
        await r.body?.cancel().catch(() => {});
        return { grande: true, bytes: comprimento, ms: agora() - t0 };
      }
      if (!r.body) {
        const s = await r.text();
        return s.length > maxBytes ? { grande: true, bytes: s.length, ms: agora() - t0 } : { grande: false, texto: s, bytes: s.length, ms: agora() - t0 };
      }
      const leitor = r.body.getReader();
      const dec = new TextDecoder();
      let s = "";
      let lidos = 0;
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        lidos += value.byteLength;
        if (lidos > maxBytes) {
          await leitor.cancel().catch(() => {});
          return { grande: true, bytes: lidos, ms: agora() - t0 };
        }
        s += dec.decode(value, { stream: true });
      }
      s += dec.decode();
      return { grande: false, texto: s, bytes: lidos, ms: agora() - t0 };
    }
  }

  return { autenticar, extrato };
}

export type ClienteVolus = ReturnType<typeof clienteVolus>;
