import { podeTela } from "@/lib/acesso";
import { exigirAcesso } from "@/lib/api-auth";
import { pdfDaDeclaracao } from "@/lib/declaracao-pdf";
import { contextoDeclaracoes, declaracaoDoContexto } from "@/lib/declaracoes";
import { erro } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O PDF da declaração (gerado no servidor do retrato): ver = quem visualiza; `?baixar=1` = quem EXPORTA no PCA. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; did: string }> }) {
  const g = await exigirAcesso("pca", "visualizar");
  if ("erro" in g) return g.erro;
  const baixar = new URL(req.url).searchParams.get("baixar") === "1";
  if (baixar && !podeTela(g.acesso, "pca").exportar) return erro("Sem permissão para baixar.", 403);
  const { id, did } = await ctx.params;
  const c = await contextoDeclaracoes(g, id, baixar ? "exportar" : "visualizar");
  if ("erro" in c) return c.erro;
  const d = await declaracaoDoContexto(c.pca, c.rep, did);
  const bytes = d ? await pdfDaDeclaracao(d, new URL(req.url).origin) : null;
  if (!d || !bytes) return erro("Declaração não encontrada.", 404);
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="declaracao-${d.numero}-${d.ano}.pdf"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
