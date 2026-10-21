import { exigirAcesso, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ehPdf, parteValida } from "@/lib/compactar-pdf-core";
import { getDocumento, gravarParte } from "@/lib/documentos";
import { formatBytes } from "@/lib/format";
import { erro, ok } from "@/lib/http";
import { origemPermitida } from "@/lib/origem";

export const dynamic = "force-dynamic";

/** Uma parte do PDF (`?ordem=N`, corpo binário) do envio que a própria pessoa abriu; a última conclui. Importar em Documentos. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("documentos", "importar");
  if ("erro" in a) return a.erro;
  if (!origemPermitida(req)) return erro("Origem não permitida.", 403);
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const ordem = Number(new URL(req.url).searchParams.get("ordem"));
  const d = await getDocumento(id);
  if (!d || d.completo || d.criadoPor !== a.u.id) return erro("Envio não encontrado.", 404);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!parteValida(ordem, bytes.length, d.tamanho)) return erro("Parte do arquivo inválida.", 422);
  if (ordem === 0 && !ehPdf(bytes)) return erro("O arquivo não é um PDF.", 422);
  const completo = await gravarParte(id, ordem, bytes, d.partes, d.tamanho);
  if (completo)
    await registrarAuditoria({
      usuario: a.u,
      acao: "criar",
      entidade: "documento",
      entidadeId: id,
      resumo: `Documento "${d.nome}" (${formatBytes(d.tamanho)}${d.compactado ? `, compactado de ${formatBytes(d.tamanhoOriginal)}` : ""})`,
    });
  return ok({ completo });
}
