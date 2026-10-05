import { exigirUsuario } from "@/lib/api-auth";
import { erro, ok, parseCorpo } from "@/lib/http";
import { contarNaoLidas, excluirNotificacoes, listarNotificacoes, marcarLidas } from "@/lib/notificacoes";
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

/** Marca como LIDAS ou NÃO lidas (`{ids, lida}`) ou todas como lidas (`{todas:true}`) — só as da própria pessoa. */
export async function PATCH(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(notificacoesPatchSchema, req);
  if ("resp" in p) return p.resp;
  await marcarLidas(a.u, p.data);
  return ok();
}

/** EXCLUI do banco (`{ids}`) ou LIMPA (`{limpar: "lidas" | "todas"}`) — só as da própria pessoa; os avisos de prazo/lembrete limpos não voltam. */
export async function DELETE(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(notificacoesDeleteSchema, req);
  if ("resp" in p) return p.resp;
  return ok({ excluidas: await excluirNotificacoes(a.u, p.data) });
}
