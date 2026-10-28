import { exigirAdmin } from "@/lib/api-auth";
import { listarCards } from "@/lib/empenho-cards";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Os CARDS de importação da Centi dos três tipos (Configurações → Importações — só o ADM; sem recorte de unidade). */
export async function GET() {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const [empenhos, liquidacoes, pagamentos] = await Promise.all([listarCards(null, "empenhos"), listarCards(null, "liquidacoes"), listarCards(null, "pagamentos")]);
  return ok({ cards: [...empenhos, ...liquidacoes, ...pagamentos] });
}
