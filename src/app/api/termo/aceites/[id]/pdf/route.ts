import { exigirUsuario, intId } from "@/lib/api-auth";
import { pdfDoComprovante } from "@/lib/comprovante-termo-pdf";
import { erro } from "@/lib/http";
import { aceitePorId, termoPorId } from "@/lib/termo-uso";

export const dynamic = "force-dynamic";

/** O PDF do COMPROVANTE (gerado no servidor, sempre igual): a própria pessoa ou o Administrador. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Aceite inválido.", 400);
  const a = await aceitePorId(id);
  if (!a || (a.usuarioId !== g.u.id && !g.u.admin)) return erro("Comprovante não encontrado.", 404);
  const t = await termoPorId(a.termoId);
  if (!t?.textoFinal) return erro("Comprovante não encontrado.", 404);
  const bytes = await pdfDoComprovante(a, { textoFinal: t.textoFinal, publicadoEm: t.publicadoEm }, new URL(req.url).origin);
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="termo-de-uso-v${a.versao}-${a.codigo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
