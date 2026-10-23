import { cronAutorizado } from "@/lib/cron";
import { atualizarEmpenhosAuto } from "@/lib/empenhos-auto";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O CRON da ATUALIZAÇÃO AUTOMÁTICA dos empenhos (a cada 5 min, no SEU gatilho do `worker.ts`) — só as APIs ligadas. */
export async function POST(req: Request) {
  if (!(await cronAutorizado(req))) return erro("Não autorizado.", 401);
  return ok({ apis: await atualizarEmpenhosAuto() });
}
