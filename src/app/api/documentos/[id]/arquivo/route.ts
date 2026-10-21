import { podeTela } from "@/lib/acesso";
import { exigirAcesso, intId } from "@/lib/api-auth";
import { pdfDoGoogle } from "@/lib/documento-google";
import { bytesDoDocumento, getDocumento } from "@/lib/documentos";
import { erro } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O PDF do documento: inline para VER (Visualizar); `?baixar=1` como anexo (Exportar em Documentos). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("documentos", "visualizar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const baixar = new URL(req.url).searchParams.get("baixar") === "1";
  if (baixar && !podeTela(a.acesso, "documentos").exportar) return erro("Sem permissão para baixar documentos.", 403);
  const d = await getDocumento(id);
  if (!d?.completo) return erro("Documento não encontrado.", 404);
  // Documento do Drive: lido do Google AGORA (sempre a versão atual do arquivo).
  let bytes: Uint8Array<ArrayBuffer>;
  if (d.urlExterna) {
    try {
      bytes = new Uint8Array((await pdfDoGoogle(d.urlExterna)).bytes);
    } catch (e) {
      return erro(e instanceof Error ? e.message : "O Google não entregou o arquivo.", 502);
    }
  } else bytes = await bytesDoDocumento(d);
  const nome = d.nomeArquivo.toLowerCase().endsWith(".pdf") ? d.nomeArquivo : `${d.nomeArquivo}.pdf`;
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": d.urlExterna ? "private, no-store" : "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
