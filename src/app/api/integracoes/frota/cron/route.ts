import { cronAutorizado } from "@/lib/cron";
import { passoAutomaticoFrota } from "@/lib/frota";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O CRON da atualização automática da FROTA (Vólus): um período por execução, pelo cursor mais atrasado. */
export async function POST(req: Request) {
  if (!(await cronAutorizado(req))) return new Response("Não autorizado.", { status: 401 });
  try {
    return ok({ feito: await passoAutomaticoFrota() });
  } catch (e) {
    console.error("[frota] cron:", (e as Error)?.message);
    return ok({ feito: "falhou" });
  }
}
