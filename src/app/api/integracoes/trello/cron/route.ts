import { cronAutorizado } from "@/lib/cron";
import { erro, ok } from "@/lib/http";
import { processarFila, reconciliarQuadros } from "@/lib/trello-processar";

export const dynamic = "force-dynamic";

/**
 * O CRON da sincronização com o Trello (a cada 5 min, pelo `scheduled` do `worker.ts` — nunca pela internet): reconcilia
 * os quadros ligados (o que um aviso perdido deixou para trás entra na fila) e processa a fila. Autenticado pelo cabeçalho
 * `x-cron-trello` (`cronAutorizado`).
 */
export async function POST(req: Request) {
  if (!(await cronAutorizado(req))) return erro("Não autorizado.", 401);
  const postos = await reconciliarQuadros(10);
  const r = await processarFila(25);
  return ok({ postos, ...r });
}
