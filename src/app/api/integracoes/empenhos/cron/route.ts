import { cronAutorizado } from "@/lib/cron";
import { atualizarEmpenhosAuto } from "@/lib/empenhos-auto";
import { erro, ok } from "@/lib/http";
import { registrarCron } from "@/lib/importacoes-cron";
import { situacoesDaCenti } from "@/lib/importacoes-cron-sql";

export const dynamic = "force-dynamic";

/** O CRON da ATUALIZAÇÃO AUTOMÁTICA dos empenhos (duas vezes por minuto, nos gatilhos do `worker.ts` — uma tarefa pequena
 * por execução). A situação de cada card vai à tela (Configurações → Importações), nunca só ao log. */
export async function POST(req: Request) {
  if (!(await cronAutorizado(req))) return erro("Não autorizado.", 401);
  try {
    const apis = await atualizarEmpenhosAuto();
    await registrarCron(situacoesDaCenti(apis));
    return ok({ apis });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[empenhos] cron:", msg);
    await registrarCron([{ chave: "centi:geral", situacao: `Erro na execução: ${msg}`, erro: true }]);
    return erro(msg, 500);
  }
}
