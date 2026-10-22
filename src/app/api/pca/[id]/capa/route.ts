import { exigirAcesso, intId, recusaPca } from "@/lib/api-auth";
import { erro } from "@/lib/http";
import { capaDoPca, getPcaEspaco } from "@/lib/pca-espaco";
import { decodificarFoto } from "@/lib/pessoa";

export const dynamic = "force-dynamic";

/**
 * CAPA do PCA (card 4:5) como IMAGEM — as listas carregam só a URL (`PcaEspaco.capa`, com a versão `?v=`), então a
 * data-URL não pesa em cada página e o navegador guarda a imagem em cache longo e imutável. A do PCA PUBLICADO é pública
 * (o seletor de PCA da tela pública mostra os cartões); a do PCA em Preview só para quem visualiza o PCA.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const publicado = (await getPcaEspaco(id))?.status === "publicado";
  if (!publicado) {
    const a = await exigirAcesso("pca", "visualizar");
    if ("erro" in a) return a.erro;
    const semPca = await recusaPca(id);
    if (semPca) return semPca;
  }
  const img = decodificarFoto(await capaDoPca(id));
  if (!img) return erro("Sem capa.", 404);
  return new Response(img.bytes, {
    headers: {
      "Content-Type": img.tipo,
      "Cache-Control": `${publicado ? "public" : "private"}, max-age=31536000, immutable`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
