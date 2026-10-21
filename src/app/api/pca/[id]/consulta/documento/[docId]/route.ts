import { intId } from "@/lib/api-auth";
import { vePreviaPca } from "@/lib/acesso";
import { pdfDoGoogle } from "@/lib/documento-google";
import { documentoNoPca, lerPcasDocumento } from "@/lib/documentos-core";
import { bytesDoDocumento, getDocumento } from "@/lib/documentos";
import { erro } from "@/lib/http";
import { getPcaEspaco } from "@/lib/pca-espaco";
import { getConfigPublico } from "@/lib/publico";
import { podeLerPublico } from "@/lib/publico-core";

export const dynamic = "force-dynamic";

/**
 * CONSULTA PÚBLICA — o PDF de um documento do PCA (só VER, nunca baixar como anexo). Só com: aba Documentos publicada pelo
 * ADM + PCA publicado (em Preview, quem visualiza o PCA) + documento ligado a ESTE PCA e concluído. Fora disso, 404 (não
 * revela o que existe).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; docId: string }> }) {
  const p = await ctx.params;
  const pcaId = intId(p.id);
  const docId = intId(p.docId);
  const nao = () => erro("Documento não encontrado.", 404);
  if (!pcaId || !docId) return nao();
  const [cfg, pca] = await Promise.all([getConfigPublico(), getPcaEspaco(pcaId)]);
  if (!podeLerPublico(pca, cfg, "documentos", pca?.status === "publicado" ? false : await vePreviaPca())) return nao();
  const d = await getDocumento(docId);
  if (!d?.completo || !documentoNoPca(lerPcasDocumento(d.pcas), pcaId)) return nao();
  let bytes: Uint8Array<ArrayBuffer>;
  if (d.urlExterna) {
    try {
      bytes = new Uint8Array((await pdfDoGoogle(d.urlExterna)).bytes);
    } catch {
      return erro("O arquivo não está disponível agora.", 502);
    }
  } else bytes = await bytesDoDocumento(d);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
