import { cronAutorizado } from "@/lib/cron";
import { passoAutomaticoFrota } from "@/lib/frota";
import { ok } from "@/lib/http";
import { registrarCron } from "@/lib/importacoes-cron";
import { situacaoComErro } from "@/lib/importacoes-cron-sql";
import { frotaTrabalhou, registraNaVez, vezDaRodada } from "@/lib/rodada-cron-core";

export const dynamic = "force-dynamic";

/** O CRON da atualização automática da FROTA (Vólus): um período por chamada, pelo cursor mais atrasado; a RODADA do
 * `worker.ts` chama várias vezes por disparo. A situação vai à tela (Configurações → Importações → Frotas). */
export async function POST(req: Request) {
  if (!(await cronAutorizado(req))) return new Response("Não autorizado.", { status: 401 });
  const vez = vezDaRodada(req.url);
  try {
    const feito = await passoAutomaticoFrota();
    const trabalhou = frotaTrabalhou(feito);
    if (registraNaVez(vez, trabalhou)) await registrarCron([{ chave: "frota:geral", situacao: feito, erro: situacaoComErro(feito) }]);
    return ok({ feito, trabalhou });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[frota] cron:", msg);
    await registrarCron([{ chave: "frota:geral", situacao: `Erro na execução: ${msg}`, erro: true }]);
    return ok({ feito: "falhou", trabalhou: false });
  }
}
