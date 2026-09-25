import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok } from "@/lib/http";
import { decodificarDataUrl } from "@/lib/pessoa";
import { excluirAnexo, getAnexo, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function anexo(ctx: Ctx) {
  const a = await exigirUsuario();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const an = id ? await getAnexo(id) : null;
  const r = an ? await tarefaAcessivel(a.u, an.tarefaId) : null;
  if (!an || !r) return { resp: erro("Anexo não encontrado.", 404) };
  return { u: a.u, an, r };
}

/** Serve o ARQUIVO anexado (imagem/PDF) — só para quem vê a tarefa; o nome original no download. */
export async function GET(_req: Request, ctx: Ctx) {
  const x = await anexo(ctx);
  if ("resp" in x) return x.resp;
  const arq = decodificarDataUrl(x.an.conteudo, /^(image\/(?:png|jpe?g|webp)|application\/pdf)$/);
  if (!arq) return erro("Sem arquivo.", 404);
  return new Response(arq.bytes, {
    headers: {
      "Content-Type": arq.tipo,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(x.an.nome)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Exclui o anexo — quem o anexou ou um editor (admin/gestor). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const x = await anexo(ctx);
  if ("resp" in x) return x.resp;
  if (x.an.criadoPor !== x.u.id && x.u.role !== "admin" && x.u.role !== "gestor") return erro("Só quem anexou pode excluir.", 403);
  await excluirAnexo(x.an.id);
  await registrarAuditoria({ usuario: x.u, acao: "excluir", entidade: "tarefa", entidadeId: x.r.tarefa.id, resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: anexo "${x.an.nome}" excluído` });
  return ok();
}
