import { cronAutorizado } from "@/lib/cron";
import { passoAutomaticoFrota } from "@/lib/frota";
import { ok } from "@/lib/http";
import { registrarCron } from "@/lib/importacoes-cron";
import { situacaoComErro } from "@/lib/importacoes-cron-sql";

export const dynamic = "force-dynamic";

/** O CRON da atualização automática da FROTA (Vólus): um período por execução, pelo cursor mais atrasado. A situação vai à
 * tela (Configurações → Importações → Frotas). */
export async function POST(req: Request) {
  if (!(await cronAutorizado(req))) return new Response("Não autorizado.", { status: 401 });
  try {
    const feito = await passoAutomaticoFrota();
    await registrarCron([{ chave: "frota:geral", situacao: feito, erro: situacaoComErro(feito) }]);
    return ok({ feito });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[frota] cron:", msg);
    await registrarCron([{ chave: "frota:geral", situacao: `Erro na execução: ${msg}`, erro: true }]);
    return ok({ feito: "falhou" });
  }
}
