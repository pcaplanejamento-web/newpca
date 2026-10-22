import { exigirUsuario } from "@/lib/api-auth";
import { getAcessoConta } from "@/lib/acesso-conta";
import { limiteEfetivo } from "@/lib/acesso-conta-core";
import { contaDe, listarAparelhos } from "@/lib/aparelhos";
import { ok } from "@/lib/http";
import { aceitesDe } from "@/lib/termo-uso";

export const dynamic = "force-dynamic";

/** Os aparelhos da PRÓPRIA conta (com o desta sessão marcado), o limite, a trava e os termos aceitos. */
export async function GET() {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const [lista, conta, cfg, termos] = await Promise.all([listarAparelhos(g.u.id), contaDe(g.u.id), getAcessoConta(), aceitesDe(g.u.id)]);
  return ok({ lista, atualId: g.u.pendencia.aparelhoId, limite: limiteEfetivo(cfg, g.u.papel.id, conta.limite), trocaAte: conta.trocaAte, termos });
}
