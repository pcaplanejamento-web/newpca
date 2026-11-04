import { exigirAdmin } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { mapaDosCentros } from "@/lib/subunidades";

export const dynamic = "force-dynamic";

/** O MAPA dos centros de custo cadastrados (todas as unidades): onde cada um está vinculado — a verificação da tabela de
 * unidades (`CentrosCustoUnidades`). */
export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  return ok({ linhas: await mapaDosCentros() });
}
