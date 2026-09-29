import { exigirUsuario } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { versaoDados } from "@/lib/versao-dados";

export const dynamic = "force-dynamic";

/** A VERSÃO DOS DADOS (`versaoDados`) — o `SincronizarDados` só recarrega a tela quando ela muda. */
export async function GET() {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const r = ok({ versao: await versaoDados() });
  r.headers.set("Cache-Control", "no-store");
  return r;
}
