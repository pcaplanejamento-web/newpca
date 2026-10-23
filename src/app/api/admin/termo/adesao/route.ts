import { exigirAdmin } from "@/lib/api-auth";
import { getAcessoConta } from "@/lib/acesso-conta";
import { ok } from "@/lib/http";
import { adesaoAoTermo } from "@/lib/termo-uso";

export const dynamic = "force-dynamic";

/** A ADESÃO à versão vigente: quem aceitou, quem deve e quem ainda não nomeou um aparelho (as pessoas das regras). */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok(await adesaoAoTermo(await getAcessoConta({ fresco: true })));
}
