/**
 * Núcleo PURO das integrações Cloudflare (Turnstile + monitoramento). Sem env/DB/fetch →
 * testável. Os fetchers server-side ficam em `turnstile.ts` (siteverify) e em
 * `cf-analytics.ts` (`getMetricasWorker`, que reusa os Worker Secrets do Armazenamento).
 */

// ---- Turnstile (captcha) ----
export const TURNSTILE_SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export type ResultadoTurnstile = { ok: boolean; motivo?: string };

/**
 * Decide o resultado da conferência a partir da resposta do siteverify e da presença do
 * token. Fail-OPEN em erro de infra (resposta nula/inválida → não bloqueia login por falha
 * transitória); reprova só quando há token e o Cloudflare responde `success:false`, ou
 * quando o token está ausente (usuário não resolveu o desafio).
 */
export function interpretarSiteverify(resp: unknown, tokenPresente: boolean): ResultadoTurnstile {
  if (!tokenPresente) return { ok: false, motivo: "Confirme que você não é um robô." };
  if (!resp || typeof resp !== "object") return { ok: true }; // infra → fail-open
  const success = (resp as { success?: boolean }).success;
  if (success === true) return { ok: true };
  if (success === false) return { ok: false, motivo: "Falha na verificação anti-robô. Tente novamente." };
  return { ok: true }; // formato inesperado → fail-open
}

// ---- Monitoramento (Cloudflare GraphQL Analytics) — o endpoint fica em `cf-analytics.ts`
// (GQL_ENDPOINT), que já faz o fetch reusando os Worker Secrets. Aqui só a query/parse puros.
// Exibido na tela de ARMAZENAMENTO (junto do uso do D1); o liga/desliga fica em Integrações.

/** O Worker do sistema — o `name` do `wrangler.jsonc` (as métricas são SÓ dele, não da conta inteira). */
export const NOME_WORKER = "newpca";
/** Teto diário de requisições do Worker no plano gratuito (Workers Free). */
export const CAP_REQUISICOES = 100_000;

export type PontoMetrica = { data: string; requests: number; errors: number; subrequests: number };
export type Metricas = {
  dias: PontoMetrica[];
  totalRequests: number;
  totalErrors: number;
  totalSubrequests: number;
  erroPct: number; // 0-100
  cpuP50: number | null; // µs — do PERÍODO inteiro
  cpuP99: number | null; // µs — do PERÍODO inteiro
};

/**
 * Query GraphQL das invocações do Worker `$script`: por dia (requests/errors/subrequests) + `periodo` (a mesma consulta
 * SEM dimensão = os quantis de CPU EXATOS do período). O GraphQL da Cloudflare usa o escalar MINÚSCULO `string`
 * (`String` é recusado — era o erro do painel).
 */
export function queryMetricas(): string {
  return `query Metricas($accountTag: string!, $script: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      dias: workersInvocationsAdaptive(limit: 1000, filter: { scriptName: $script, date_geq: $start, date_leq: $end }, orderBy: [date_ASC]) {
        sum { requests errors subrequests }
        dimensions { date }
      }
      periodo: workersInvocationsAdaptive(limit: 1, filter: { scriptName: $script, date_geq: $start, date_leq: $end }) {
        quantiles { cpuTimeP50 cpuTimeP99 }
      }
    }
  }
}`;
}

type LinhaCF = {
  sum?: { requests?: number; errors?: number; subrequests?: number };
  quantiles?: { cpuTimeP50?: number; cpuTimeP99?: number };
  dimensions?: { date?: string };
};

const numOuNull = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** Converte a resposta GraphQL em `Metricas` (tolerante a campos ausentes; dias repetidos são somados). Puro. */
export function parseMetricas(json: unknown): Metricas {
  const acc = (json as { data?: { viewer?: { accounts?: { dias?: LinhaCF[]; periodo?: LinhaCF[] }[] } } })?.data?.viewer
    ?.accounts?.[0];
  const porDia = new Map<string, PontoMetrica>();
  for (const l of acc?.dias ?? []) {
    const data = l.dimensions?.date ?? "";
    const p = porDia.get(data) ?? { data, requests: 0, errors: 0, subrequests: 0 };
    p.requests += Number(l.sum?.requests ?? 0) || 0;
    p.errors += Number(l.sum?.errors ?? 0) || 0;
    p.subrequests += Number(l.sum?.subrequests ?? 0) || 0;
    porDia.set(data, p);
  }
  const dias = [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data));
  const totalRequests = dias.reduce((s, d) => s + d.requests, 0);
  const totalErrors = dias.reduce((s, d) => s + d.errors, 0);
  const totalSubrequests = dias.reduce((s, d) => s + d.subrequests, 0);
  const erroPct = totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 1000) / 10 : 0;
  const q = acc?.periodo?.[0]?.quantiles;
  return {
    dias,
    totalRequests,
    totalErrors,
    totalSubrequests,
    erroPct,
    cpuP50: numOuNull(q?.cpuTimeP50),
    cpuP99: numOuNull(q?.cpuTimeP99),
  };
}

/** Requisições de HOJE (dia UTC — o teto do plano reseta 00:00 UTC). */
export function requisicoesDoDia(m: Metricas, diaUtc: string): number {
  return m.dias.find((d) => d.data === diaUtc)?.requests ?? 0;
}

/** Tempo de CPU (µs) legível: "850 µs" / "12,4 ms". */
export function formatarCpu(us: number | null): string {
  if (us == null) return "—";
  if (us < 1000) return `${Math.round(us)} µs`;
  return `${(us / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ms`;
}

/** Mensagem de erro da API GraphQL/HTTP da Cloudflare em pt-BR, com o que fazer. Puro. */
export function motivoErroCloudflare(msg: string | undefined, status?: number): string {
  const m = (msg ?? "").toLowerCase();
  if (status === 401 || status === 403 || /not authori[sz]ed|authz|permission|unauthori[sz]ed/.test(m))
    return "O token CF_ANALYTICS_TOKEN não tem acesso — crie-o com a permissão “Account Analytics: Read” desta conta.";
  if (/account/.test(m) && /(not found|invalid|does not)/.test(m))
    return "A conta não foi encontrada — confira o CF_ACCOUNT_ID (Account ID do painel Cloudflare).";
  if (/rate|limit|too many/.test(m) || status === 429) return "A Cloudflare limitou as consultas — tente de novo em 1 minuto.";
  if (status && status >= 500) return `A Cloudflare está indisponível (HTTP ${status}) — tente de novo em instantes.`;
  if (status && !msg) return `Cloudflare respondeu HTTP ${status}.`;
  return msg || "Erro na API GraphQL da Cloudflare.";
}
