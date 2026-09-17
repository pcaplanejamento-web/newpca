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
export type PontoMetrica = { data: string; requests: number; errors: number };
export type Metricas = {
  dias: PontoMetrica[];
  totalRequests: number;
  totalErrors: number;
  erroPct: number; // 0-100
  cpuP50: number | null; // µs
  cpuP99: number | null; // µs
};

/** Query GraphQL de invocações do Worker por dia (requests/errors/CPU) no nível da conta. */
export function queryMetricas(): string {
  return `query($accountTag: String!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(limit: 1000, filter: { date_geq: $start, date_leq: $end }, orderBy: [date_ASC]) {
        sum { requests errors }
        quantiles { cpuTimeP50 cpuTimeP99 }
        dimensions { date }
      }
    }
  }
}`;
}

type LinhaCF = {
  sum?: { requests?: number; errors?: number };
  quantiles?: { cpuTimeP50?: number; cpuTimeP99?: number };
  dimensions?: { date?: string };
};

/** Converte a resposta GraphQL em `Metricas` (tolerante a campos ausentes). Puro. */
export function parseMetricas(json: unknown): Metricas {
  const linhas: LinhaCF[] =
    (json as { data?: { viewer?: { accounts?: { workersInvocationsAdaptive?: LinhaCF[] }[] } } })?.data?.viewer
      ?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
  const dias: PontoMetrica[] = linhas.map((l) => ({
    data: l.dimensions?.date ?? "",
    requests: Number(l.sum?.requests ?? 0),
    errors: Number(l.sum?.errors ?? 0),
  }));
  const totalRequests = dias.reduce((s, d) => s + d.requests, 0);
  const totalErrors = dias.reduce((s, d) => s + d.errors, 0);
  const erroPct = totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 1000) / 10 : 0;
  const ultimo = linhas[linhas.length - 1]?.quantiles;
  return {
    dias,
    totalRequests,
    totalErrors,
    erroPct,
    cpuP50: ultimo?.cpuTimeP50 != null ? Number(ultimo.cpuTimeP50) : null,
    cpuP99: ultimo?.cpuTimeP99 != null ? Number(ultimo.cpuTimeP99) : null,
  };
}
