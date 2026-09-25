import { exigirUsuario } from "@/lib/api-auth";
import { ok, parseCorpo } from "@/lib/http";
import { contarNaoLidas, listarNotificacoes, marcarLidas } from "@/lib/notificacoes";
import { notificacoesPatchSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** As NOTIFICAÇÕES da pessoa (o sino): as últimas 50, não lidas primeiro, + a contagem de não lidas (`?contar=1` = só ela). */
export async function GET(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  if (new URL(req.url).searchParams.get("contar") === "1") return ok({ naoLidas: await contarNaoLidas(a.u) });
  return ok(await listarNotificacoes(a.u));
}

/** Marca como LIDAS (`{ids}` ou `{todas:true}`) — só as da própria pessoa. */
export async function PATCH(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(notificacoesPatchSchema, req);
  if ("resp" in p) return p.resp;
  await marcarLidas(a.u, p.data);
  return ok();
}
