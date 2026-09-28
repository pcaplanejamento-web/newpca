import { exigirUsuario } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { ErroTrello } from "@/lib/trello-api";
import { trelloDaConfig } from "@/lib/trello-config";
import { boardsDaConta } from "@/lib/trello-vincular";

export const dynamic = "force-dynamic";

/** Os quadros ABERTOS da conta institucional do Trello (para "Ligar a um quadro existente" — o dono de um quadro privado também liga), com os já ligados marcados. */
export async function GET() {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const t = await trelloDaConfig();
  if ("erro" in t) return erro(t.erro, 422);
  try {
    return ok({ boards: await boardsDaConta(t.cliente) });
  } catch (e) {
    return erro((e as Error).message, e instanceof ErroTrello && e.transitorio ? 503 : 422);
  }
}
