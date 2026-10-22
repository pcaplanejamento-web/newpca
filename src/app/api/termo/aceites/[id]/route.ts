import { exigirUsuario, intId } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { aceitePorId, seloConfere, termoPorId } from "@/lib/termo-uso";

export const dynamic = "force-dynamic";

/** Os dados do COMPROVANTE de um aceite (o PDF é montado no navegador): a própria pessoa ou o Administrador. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Aceite inválido.", 400);
  const a = await aceitePorId(id);
  if (!a || (a.usuarioId !== g.u.id && !g.u.admin)) return erro("Comprovante não encontrado.", 404);
  const t = await termoPorId(a.termoId);
  if (!t?.textoFinal) return erro("Comprovante não encontrado.", 404);
  const { usuarioId: _u, termoId: _t, ...dados } = a;
  return ok({
    aceite: { ...dados, usuarioId: a.usuarioId },
    texto: t.textoFinal,
    titulo: t.titulo,
    integro: await seloConfere(a),
    urlVerificacao: `${new URL(req.url).origin}/termo/verificar/${a.codigo}`,
  });
}
