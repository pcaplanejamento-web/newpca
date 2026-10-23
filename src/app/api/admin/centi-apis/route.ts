import { exigirAdmin } from "@/lib/api-auth";
import { listarApisCenti } from "@/lib/centi-apis";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O cadastro das APIs da Centi (Integrações → "APIs da Centi"). */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ apis: await listarApisCenti() });
}
