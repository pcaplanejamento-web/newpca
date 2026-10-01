import { exigirAcesso, intId } from "@/lib/api-auth";
import { getCatalogo } from "@/lib/catalogo";
import { getHistorico } from "@/lib/catalogo-historico";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O HISTÓRICO DE COMPRA de um catálogo (contratos + itens) — carregado só ao abrir o card (Visualizar o Catálogo). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("catalogo", "visualizar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const cat = await getCatalogo(id);
  if (!cat) return erro("Catálogo não encontrado.", 404);
  if (cat.tipo !== "historico") return erro("Este catálogo não é um histórico de compra.", 422);
  return ok(await getHistorico(id));
}
