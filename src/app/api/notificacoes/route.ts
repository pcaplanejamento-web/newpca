import { exigirUsuario } from "@/lib/api-auth";
import { erro, ok, parseCorpo } from "@/lib/http";
import { adiarNotificacoes, contarNaoLidas, excluirNotificacoes, listarNotificacoes, marcarLidas } from "@/lib/notificacoes";
import { notificacoesDeleteSchema, notificacoesListaSchema, notificacoesPatchSchema } from "@/lib/notificacoes-validation";

export const dynamic = "force-dynamic";

/**
 * As NOTIFICAÇÕES da pessoa (o sino): uma PÁGINA (`?antes=<id>&filtro=nao-lidas|todas&limite=20`) + a contagem de não
 * lidas (`?contar=1` = só ela).
 */
export async function GET(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const q = new URL(req.url).searchParams;
  if (q.get("contar") === "1") {
    const n = await contarNaoLidas(a.u);
    return n == null ? erro("Não foi possível contar as notificações.", 503) : ok({ naoLidas: n });
  }
  const p = notificacoesListaSchema.safeParse(Object.fromEntries(q));
  if (!p.success) return erro("Consulta inválida.", 422);
  return ok(await listarNotificacoes(a.u, p.data));
}

/** ADIA (`{ids, adiarAte}`), marca como VISTAS (`{ids, visto}` — as não travadas), LIDAS ou NÃO lidas (`{ids, lida}` — a não lida fica TRAVADA) ou todas como lidas (`{todas:true}` — as travadas ficam) — só as da própria pessoa. */
export async function PATCH(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(notificacoesPatchSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  if ("adiarAte" in d) {
    await adiarNotificacoes(a.u, d.ids, d.adiarAte);
    return ok();
  }
  const alvo = "todas" in d ? d : { ids: d.ids, modo: "visto" in d ? ("visto" as const) : d.lida ? ("lida" as const) : ("nao-lida" as const) };
  return ok({ marcadas: await marcarLidas(a.u, alvo) });
}

/** EXCLUI do banco (`{ids}`) ou LIMPA (`{limpar: "lidas" | "todas"}`) — só as da própria pessoa; os avisos de prazo/lembrete limpos não voltam. */
export async function DELETE(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(notificacoesDeleteSchema, req);
  if ("resp" in p) return p.resp;
  return ok({ excluidas: await excluirNotificacoes(a.u, p.data) });
}
