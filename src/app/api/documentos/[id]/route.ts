import { avisarAdmsDocumento } from "@/lib/avisos-mesa";
import { exigirAcesso, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { definirPcasDocumento, excluirDocumento, getDocumento, renomearDocumento } from "@/lib/documentos";
import { pcasDoAcesso } from "@/lib/acesso";
import { documentoVisivel, lerPcasDocumento, mesclarPcasDoGrupo } from "@/lib/documentos-core";
import { editarDocumentoSchema } from "@/lib/documentos-validation";
import { listarPcas } from "@/lib/dfd";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Renomeia o documento ou troca os PCAs dele ("todos" ou a lista). Manipular em Documentos. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("documentos", "manipular");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(editarDocumentoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getDocumento(id);
  const permitidos = pcasDoAcesso(a.acesso);
  if (!antes || !documentoVisivel(lerPcasDocumento(antes.pcas), permitidos)) return erro("Documento não encontrado.", 404);
  if ("pcas" in p.data) {
    // O grupo restrito só mexe nos PCAs dele; os de fora ficam.
    const novos = mesclarPcasDoGrupo(lerPcasDocumento(antes.pcas), p.data.pcas, permitidos);
    if (!novos) return erro("Só quem acessa todos os PCAs vincula o documento a todos eles.", 403);
    if (novos !== "todos") {
      const existem = new Set((await listarPcas()).map((x) => x.id));
      if (novos.some((x) => !existem.has(x))) return erro("PCA inexistente.", 422);
    }
    await definirPcasDocumento(id, novos);
    const nomes = new Map((await listarPcas()).map((x) => [x.id, x.ano != null ? `PCA ${x.ano}` : x.nome]));
    const texto = (v: ReturnType<typeof lerPcasDocumento>) => (v === "todos" ? "todos os PCAs" : v.length ? v.map((x) => nomes.get(x) ?? `#${x}`).join(", ") : "nenhum PCA");
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "documento",
      entidadeId: id,
      resumo: `Documento "${antes.nome}": PCAs ${texto(lerPcasDocumento(antes.pcas))} → ${texto(novos)}`,
    });
    await avisarAdmsDocumento(a.u, "PCAs de um documento alterados", `"${antes.nome}": ${texto(novos)}`, id);
    return ok();
  }
  await renomearDocumento(id, p.data.nome);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "documento", entidadeId: id, resumo: `Documento "${antes.nome}" → "${p.data.nome}"` });
  await avisarAdmsDocumento(a.u, "Documento renomeado", `"${antes.nome}" → "${p.data.nome}"`, id);
  return ok();
}

/** Exclui o documento. Excluir em Documentos. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("documentos", "excluir");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getDocumento(id);
  if (!antes || !documentoVisivel(lerPcasDocumento(antes.pcas), pcasDoAcesso(a.acesso))) return erro("Documento não encontrado.", 404);
  await excluirDocumento(id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "documento", entidadeId: id, resumo: `Documento "${antes.nome}" excluído` });
  await avisarAdmsDocumento(a.u, "Documento excluído", antes.nome);
  return ok();
}
