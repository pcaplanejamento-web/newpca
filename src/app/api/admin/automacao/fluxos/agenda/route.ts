import { exigirAdmin } from "@/lib/api-auth";
import { agendaDosFluxos } from "@/lib/fluxos";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A AGENDA das automações da pessoa (o vigia do layout): a próxima hora e os fluxos já devidos. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok(await agendaDosFluxos(g.u.id));
}
