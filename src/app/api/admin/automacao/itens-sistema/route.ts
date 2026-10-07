import { exigirAdmin } from "@/lib/api-auth";
import { listarItensDfds } from "@/lib/dfd";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Os itens dos DFDs da Mesa do sistema (o nó "Ler do sistema" — lidos UMA vez por execução do fluxo). */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ itens: await listarItensDfds() });
}
