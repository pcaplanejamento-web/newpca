import { podeLigarTrello } from "@/lib/acesso";
import { exigirSessao, intId } from "@/lib/api-auth";
import { quadroAcessivel } from "@/lib/tarefas";
import { erro, ok } from "@/lib/http";
import { ErroTrello } from "@/lib/trello-api";
import { trelloDaConfig } from "@/lib/trello-config";
import { boardsDaConta } from "@/lib/trello-vincular";

export const dynamic = "force-dynamic";

/** Os quadros ABERTOS da conta institucional do Trello (para "Ligar a um quadro existente"), com os já ligados marcados —
 * só para quem pode ligar o quadro `?quadro=` (Configurar Tarefas no grupo dele; o privado, o dono). */
export async function GET(req: Request) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const qid = intId(new URL(req.url).searchParams.get("quadro") ?? "");
  const q = qid ? await quadroAcessivel(g.u, qid) : null;
  if (!q) return erro("Quadro não encontrado.", 404);
  if (!podeLigarTrello(g.acesso, q)) return erro("Seu papel não permite ligar este quadro ao Trello.", 403);
  const t = await trelloDaConfig();
  if ("erro" in t) return erro(t.erro, 422);
  try {
    return ok({ boards: await boardsDaConta(t.cliente) });
  } catch (e) {
    return erro((e as Error).message, e instanceof ErroTrello && e.transitorio ? 503 : 422);
  }
}
