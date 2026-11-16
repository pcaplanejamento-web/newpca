import { exigirAdmin, intId } from "@/lib/api-auth";
import { fluxoEditavel } from "@/lib/fluxo-core";
import { getFluxo, reservarExecucaoFluxo } from "@/lib/fluxos";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * RESERVA a execução AGENDADA (antes de rodar): só quem recebe `{fluxo}` roda — a próxima já fica gravada. 409 = não
 * está devido ou outra aba/navegador/ADM já reservou (nunca roda duas vezes).
 */
export async function POST(_req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await params).id);
  if (!id) return erro("Id inválido.", 400);
  const f = await getFluxo(id);
  if (!f || !fluxoEditavel(f, g.u.id)) return erro("Fluxo não encontrado.", 404);
  const r = await reservarExecucaoFluxo(id);
  return r ? ok(r) : erro("Esta execução agendada já foi reservada (ou não está mais devida).", 409);
}
