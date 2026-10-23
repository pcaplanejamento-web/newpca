import { exigirAdmin } from "@/lib/api-auth";
import { listarApisCenti, orgaosDoCadastro, unidadesDoCadastro } from "@/lib/centi-apis";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O cadastro das APIs da Centi (Integrações → "APIs da Centi") + os órgãos e as unidades do cadastro para a escolha. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const [apis, orgaos, unidades] = await Promise.all([listarApisCenti(), orgaosDoCadastro(), unidadesDoCadastro()]);
  return ok({ apis, orgaos, unidades });
}
