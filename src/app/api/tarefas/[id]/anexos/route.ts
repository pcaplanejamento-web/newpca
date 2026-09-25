import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarAnexo, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { anexoSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** Até quantos anexos por tarefa (o arquivo mora no D1 — o teto protege o banco). */
const MAX_ANEXOS = 30;

/** ANEXA um link (http/s) ou um arquivo pequeno (imagem/PDF ≤ 1 MB, em data-URL) à tarefa. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  if (r.tarefa.anexos >= MAX_ANEXOS) return erro(`A tarefa já tem ${MAX_ANEXOS} anexos — exclua algum antes.`, 409);
  const p = await parseCorpo(anexoSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  const anexoId =
    d.tipo === "link"
      ? await criarAnexo({ tarefaId: id, tipo: "link", nome: d.nome || d.url, url: d.url, criadoPor: a.u.id })
      : await criarAnexo({
          tarefaId: id,
          tipo: "arquivo",
          nome: d.nome,
          conteudo: d.conteudo,
          mime: d.conteudo.slice(5, d.conteudo.indexOf(";")),
          tamanho: Math.floor(((d.conteudo.length - d.conteudo.indexOf(",") - 1) * 3) / 4),
          criadoPor: a.u.id,
        });
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa", entidadeId: id, resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)}: anexo "${d.tipo === "link" ? d.nome || d.url : d.nome}"` });
  return ok({ id: anexoId });
}
