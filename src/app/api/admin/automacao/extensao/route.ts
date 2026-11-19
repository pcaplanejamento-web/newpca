import { exigirAdmin } from "@/lib/api-auth";
import { getAparencia } from "@/lib/aparencia";
import { VERSAO_EXTENSAO_CENTI, VERSAO_MINIMA_CENTI } from "@/lib/automacao-centi-core";
import { ARQUIVOS_EXTENSAO } from "@/lib/extensao-centi-arquivos";
import { pngDoDataUrl, zipDaExtensao } from "@/lib/extensao-zip";

export const dynamic = "force-dynamic";

// O .zip da extensão da Automação (só ADM), montado na hora: a versão publicada + a logo do sistema como ícone.
// `?info=1` = só a versão publicada (a ATUALIZAÇÃO AUTOMÁTICA da extensão confere por ela, a cada 30 min).
export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  if (new URL(req.url).searchParams.get("info") === "1")
    return Response.json({ ok: true, versao: VERSAO_EXTENSAO_CENTI, minima: VERSAO_MINIMA_CENTI }, { headers: { "Cache-Control": "no-store" } });
  const icone = pngDoDataUrl((await getAparencia()).identidade?.favicon);
  const corpo = new Blob(zipDaExtensao(ARQUIVOS_EXTENSAO, icone).map((b) => b as Uint8Array<ArrayBuffer>), { type: "application/zip" });
  return new Response(corpo, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="extensao-centi-${VERSAO_EXTENSAO_CENTI}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
