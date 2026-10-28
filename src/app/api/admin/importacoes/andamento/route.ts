import { exigirAdmin } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { andamentoDasImportacoes } from "@/lib/importacoes-andamento";

export const dynamic = "force-dynamic";

/** As importações em andamento (e as recém-terminadas) de TODOS os cards — o painel ao vivo do ADM; com `?ultima=<tipo>`,
 * também a última importação daquele tipo (o relógio dos indicadores da Execução). */
export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const pedido = new URL(req.url).searchParams.get("ultima");
  const tipo = pedido === "empenhos" || pedido === "liquidacoes" || pedido === "pagamentos" ? pedido : undefined;
  const { lotes, ultima } = await andamentoDasImportacoes(tipo);
  return ok({ lotes, ultima, agora: new Date().toISOString() });
}
