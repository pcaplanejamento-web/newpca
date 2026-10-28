import { exigirAdmin } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { andamentoDasImportacoes } from "@/lib/importacoes-andamento";

export const dynamic = "force-dynamic";

/** As importações em andamento (e as recém-terminadas) de TODOS os cards — o painel ao vivo do ADM. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ lotes: await andamentoDasImportacoes(), agora: new Date().toISOString() });
}
