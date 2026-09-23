import { exigirUsuario, intId } from "@/lib/api-auth";
import { erro } from "@/lib/http";
import { capaDoPca } from "@/lib/pca-espaco";
import { decodificarFoto } from "@/lib/pessoa";

export const dynamic = "force-dynamic";

/**
 * CAPA do PCA (card 4:5) como IMAGEM — as listas carregam só a URL (`PcaEspaco.capa`, com a versão `?v=`), então a
 * data-URL não pesa em cada página e o navegador guarda a imagem em cache longo e imutável. Só logado.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const img = decodificarFoto(await capaDoPca(id));
  if (!img) return erro("Sem capa.", 404);
  return new Response(img.bytes, {
    headers: {
      "Content-Type": img.tipo,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
