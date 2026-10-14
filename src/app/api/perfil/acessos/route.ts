import { exigirUsuario } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { historicoDeAcesso } from "@/lib/seguranca-alertas";

export const dynamic = "force-dynamic";

/** O HISTÓRICO DE ACESSO da própria pessoa (Perfil): cada login com data/hora, dispositivo, canal e IP + o último acesso. */
export async function GET() {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  return ok(await historicoDeAcesso(a.u.id));
}
