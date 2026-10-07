import { exigirAdmin } from "@/lib/api-auth";
import { dadosDaAutomacao } from "@/lib/automacao-dados";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Os dados da tela da Automação — a Mesa a monta em segundo plano para rodar uma automação sem sair dela. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ dados: await dadosDaAutomacao(g.u) });
}
