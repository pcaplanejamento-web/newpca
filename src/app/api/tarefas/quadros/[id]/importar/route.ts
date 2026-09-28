import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { etiquetasDoQuadroTodas, importarCartoes, importarEstrutura, importarVinculos, listasDoQuadro, MSG_QUADRO_ARQUIVADO, pessoasDoQuadro, quadroAcessivel } from "@/lib/tarefas";
import { importarTrelloSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/**
 * IMPORTAR DO TRELLO para este quadro (editores), em 3 passos — `estrutura` (listas + etiquetas), `cartoes` (até 20 por
 * chamada; um lote atômico por cartão, retomável) e `vinculos` (tarefa ↔ tarefa). Listas/etiquetas/pessoas são conferidas
 * contra o quadro (as de fora são ignoradas).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!q) return erro("Quadro não encontrado.", 404);
  if (q.arquivado) return erro(MSG_QUADRO_ARQUIVADO, 409);
  const p = await parseCorpo(importarTrelloSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  if (d.modo === "estrutura") {
    const r = await importarEstrutura(q.id, d);
    await registrarAuditoria({
      usuario: a.u,
      acao: "importar",
      entidade: "tarefa_quadro",
      entidadeId: q.id,
      resumo: `Importação do Trello no quadro "${q.nome}": ${d.listas.length} lista(s) e ${d.etiquetas.length} etiqueta(s)`,
    });
    return ok(r);
  }
  if (d.modo === "vinculos") return ok({ vinculados: await importarVinculos(q.id, d.pares) });
  const [listas, etiquetas, pessoas] = await Promise.all([listasDoQuadro(q.id), etiquetasDoQuadroTodas(q.id), pessoasDoQuadro(q)]);
  const idsListas = new Set(listas.map((l) => l.id));
  if (d.cartoes.some((c) => !idsListas.has(c.listaId))) return erro("Lista inválida.", 422);
  const idsEtq = new Set(etiquetas.map((e) => e.id));
  const idsPessoas = new Set(pessoas.map((x) => x.id));
  const cartoes = d.cartoes.map((c) => ({ ...c, etiquetas: c.etiquetas.filter((e) => idsEtq.has(e)), pessoas: c.pessoas.filter((x) => idsPessoas.has(x)) }));
  const r = await importarCartoes(a.u, q.id, cartoes);
  const n = Object.keys(r.ids).length;
  if (n)
    await registrarAuditoria({ usuario: a.u, acao: "importar", entidade: "tarefa_quadro", entidadeId: q.id, resumo: `${n} tarefa(s) importada(s) do Trello no quadro "${q.nome}"` });
  return ok(r);
}
