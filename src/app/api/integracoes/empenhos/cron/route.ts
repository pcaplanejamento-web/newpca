import { cronAutorizado } from "@/lib/cron";
import { atualizarEmpenhosAuto } from "@/lib/empenhos-auto";
import { erro, ok } from "@/lib/http";
import { getConfigImportacoes } from "@/lib/importacoes-config";
import { registrarCron } from "@/lib/importacoes-cron";
import { situacoesDaCenti } from "@/lib/importacoes-cron-sql";
import { avisarFalhaSistema } from "@/lib/notificacoes";
import { chamadasDaRodada, depoisDaRodada, registraNaVez, textoTarefas, vezDaRodada } from "@/lib/rodada-cron-core";

export const dynamic = "force-dynamic";

/** O CRON da ATUALIZAÇÃO AUTOMÁTICA dos empenhos — uma tarefa pequena por chamada; a RODADA do `worker.ts` chama várias
 * vezes por disparo (`?vez=N`). A situação de cada card vai à tela (Configurações → Importações), nunca só ao log. */
export async function POST(req: Request) {
  if (!(await cronAutorizado(req))) return erro("Não autorizado.", 401);
  const vez = vezDaRodada(req.url);
  try {
    const { situacoes, trabalhou, servido } = await atualizarEmpenhosAuto(new Date(), vez, depoisDaRodada(req.url));
    if (registraNaVez(vez, trabalhou)) {
      const comTarefas = situacoes.map((s) => (s.card === 0 && s.situacao === "Ligada" ? { ...s, situacao: `Ligada · ${textoTarefas(vez, trabalhou)}` } : s));
      await registrarCron(situacoesDaCenti(comTarefas));
    }
    // A 1ª chamada diz à rodada o RITMO de agora (o ritmo leve no expediente — Configurações → Importações).
    const limite = vez === 0 ? chamadasDaRodada((await getConfigImportacoes()).expedienteLeve, new Date()) : undefined;
    return ok({ apis: situacoes, trabalhou, depois: servido, limite });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[empenhos] cron:", msg);
    await registrarCron([{ chave: "centi:geral", situacao: `Erro na execução: ${msg}`, erro: true }]);
    await avisarFalhaSistema("importacao", `A atualização automática das importações falhou: ${msg}`, "/painel/configuracoes?aba=importacoes");
    return erro(msg, 500);
  }
}
