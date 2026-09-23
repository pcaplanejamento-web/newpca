import { eq } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { exigirUsuario, intId } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { erro } from "@/lib/http";
import { decodificarFoto } from "@/lib/pessoa";

export const dynamic = "force-dynamic";

/**
 * FOTO do usuário (avatar) como IMAGEM — as listas (Mesa, cabeçalho, usuários) usam a URL (`urlFoto`) em
 * vez do data-URL: a foto não pesa em cada página e o navegador a guarda em cache. A URL carrega a
 * versão (data da última gravação do perfil), então o cache pode ser longo e imutável. Só logado.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const [r] = await getDb().select({ foto: usuarios.foto }).from(usuarios).where(eq(usuarios.id, id)).limit(1);
  const img = decodificarFoto(r?.foto);
  if (!img) return erro("Sem foto.", 404);
  return new Response(img.bytes, {
    headers: {
      "Content-Type": img.tipo,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
