import { exigirAdmin } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { saudeDosDados } from "@/lib/saude-dados";

export const dynamic = "force-dynamic";

/** A SAÚDE DOS DADOS (só ADM): integridade dos totais + os dados a tratar. `?fresco=1` (botão Verificar) refaz a leitura. */
export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  try {
    const saude = await saudeDosDados({ fresco: new URL(req.url).searchParams.get("fresco") === "1" });
    return ok({ saude });
  } catch {
    return erro("Não foi possível verificar os dados agora. Tente de novo.", 500);
  }
}
