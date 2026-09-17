import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type Metricas, parseMetricas, queryMetricas } from "./cloudflare-core.ts";

// Integração com a API GraphQL de Analytics da Cloudflare — números OFICIAIS de
// uso do D1 (linhas lidas/escritas por dia + tamanho), para o painel de
// Armazenamento monitorar o consumo do plano gratuito.
//
// Requer dois valores no ambiente do Worker (instalados pelo ADM; NUNCA no repo):
//   - CF_ANALYTICS_TOKEN  (secret) — token com permissão "Account Analytics: Read"
//   - CF_ACCOUNT_ID       (var)    — o Account ID da conta Cloudflare
// Sem eles, retorna `{ disponivel: false }` e a tela usa só a auto-medição/binding.

const GQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const DATABASE_ID = "132b761f-7a2b-4723-bd92-a95d51f977e6"; // newpca-db (wrangler.jsonc)

export type UsoOficialDia = {
  data: string;
  rowsRead: number;
  rowsWritten: number;
  readQueries: number;
  writeQueries: number;
};

export type UsoOficial =
  | { disponivel: false; motivo: string }
  | { disponivel: true; dias: UsoOficialDia[]; hoje: UsoOficialDia; storageBytes: number | null };

const DIA_VAZIO = (data: string): UsoOficialDia => ({
  data,
  rowsRead: 0,
  rowsWritten: 0,
  readQueries: 0,
  writeQueries: 0,
});

type GqlResposta = {
  data?: {
    viewer?: {
      accounts?: Array<{
        d1AnalyticsAdaptiveGroups?: Array<{
          sum?: { rowsRead?: number; rowsWritten?: number; readQueries?: number; writeQueries?: number };
          dimensions?: { date?: string };
        }>;
        d1StorageAdaptiveGroups?: Array<{ max?: { databaseSizeBytes?: number } }>;
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

const CONSULTA = `
query Uso($accountTag: string!, $dbId: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(
        limit: 1000
        filter: { databaseId: $dbId, date_geq: $start, date_leq: $end }
        orderBy: [date_ASC]
      ) {
        sum { rowsRead rowsWritten readQueries writeQueries }
        dimensions { date }
      }
      d1StorageAdaptiveGroups(
        limit: 1
        filter: { databaseId: $dbId, date_geq: $start, date_leq: $end }
        orderBy: [date_DESC]
      ) {
        max { databaseSizeBytes }
      }
    }
  }
}`;

/** Uso oficial do D1 (últimos `dias`) via GraphQL Analytics. Falha graciosamente. */
export async function getUsoOficial(dias = 7): Promise<UsoOficial> {
  const { env } = getCloudflareContext();
  const e = env as unknown as { CF_ANALYTICS_TOKEN?: string; CF_ACCOUNT_ID?: string };
  const token = e.CF_ANALYTICS_TOKEN;
  const accountTag = e.CF_ACCOUNT_ID;
  if (!token || !accountTag) {
    return {
      disponivel: false,
      motivo: "Configure os secrets CF_ANALYTICS_TOKEN e CF_ACCOUNT_ID no Worker.",
    };
  }

  const agora = new Date();
  const inicio = new Date(agora.getTime() - (dias - 1) * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const hojeStr = fmt(agora);

  try {
    const resp = await fetch(GQL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: CONSULTA,
        variables: { accountTag, dbId: DATABASE_ID, start: fmt(inicio), end: hojeStr },
      }),
    });
    if (!resp.ok) return { disponivel: false, motivo: `Cloudflare respondeu HTTP ${resp.status}.` };
    const j = (await resp.json()) as GqlResposta;
    if (j.errors && j.errors.length > 0) {
      return { disponivel: false, motivo: j.errors[0]?.message ?? "Erro na API GraphQL da Cloudflare." };
    }
    const acc = j.data?.viewer?.accounts?.[0];
    const grupos = acc?.d1AnalyticsAdaptiveGroups ?? [];
    const diasArr: UsoOficialDia[] = grupos.map((g) => ({
      data: g.dimensions?.date ?? "",
      rowsRead: Number(g.sum?.rowsRead ?? 0),
      rowsWritten: Number(g.sum?.rowsWritten ?? 0),
      readQueries: Number(g.sum?.readQueries ?? 0),
      writeQueries: Number(g.sum?.writeQueries ?? 0),
    }));
    const hoje = diasArr.find((d) => d.data === hojeStr) ?? DIA_VAZIO(hojeStr);
    const storageBytes = Number(acc?.d1StorageAdaptiveGroups?.[0]?.max?.databaseSizeBytes ?? 0) || null;
    return { disponivel: true, dias: diasArr, hoje, storageBytes };
  } catch (err) {
    return { disponivel: false, motivo: err instanceof Error ? err.message : "Falha ao consultar a Cloudflare." };
  }
}

// ---- Métricas de INVOCAÇÃO do Worker (requests/errors/CPU) para a tela de Integrações.
// Reusa os MESMOS Worker Secrets do uso de D1 acima (CF_ANALYTICS_TOKEN/CF_ACCOUNT_ID);
// query/parse puros em `cloudflare-core`. Cache de 60s (respeita rate limit).
export type ResultadoMetricas = { disponivel: true; metricas: Metricas } | { disponivel: false; motivo: string };

let cacheMetricas: { at: number; dados: Metricas } | null = null;

export async function getMetricasWorker(dias = 7): Promise<ResultadoMetricas> {
  const { env } = getCloudflareContext();
  const e = env as unknown as { CF_ANALYTICS_TOKEN?: string; CF_ACCOUNT_ID?: string };
  const token = e.CF_ANALYTICS_TOKEN;
  const accountTag = e.CF_ACCOUNT_ID;
  if (!token || !accountTag) {
    return { disponivel: false, motivo: "Configure os secrets CF_ANALYTICS_TOKEN e CF_ACCOUNT_ID no Worker." };
  }
  if (cacheMetricas && Date.now() - cacheMetricas.at < 60_000) {
    return { disponivel: true, metricas: cacheMetricas.dados };
  }
  const agora = new Date();
  const inicio = new Date(agora.getTime() - (dias - 1) * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  try {
    const resp = await fetch(GQL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: queryMetricas(), variables: { accountTag, start: fmt(inicio), end: fmt(agora) } }),
    });
    if (!resp.ok) return { disponivel: false, motivo: `Cloudflare respondeu HTTP ${resp.status}.` };
    const j = (await resp.json()) as { errors?: Array<{ message?: string }> };
    if (j.errors && j.errors.length > 0) {
      return { disponivel: false, motivo: j.errors[0]?.message ?? "Erro na API GraphQL da Cloudflare." };
    }
    const metricas = parseMetricas(j);
    cacheMetricas = { at: Date.now(), dados: metricas };
    return { disponivel: true, metricas };
  } catch (err) {
    return { disponivel: false, motivo: err instanceof Error ? err.message : "Falha ao consultar a Cloudflare." };
  }
}
