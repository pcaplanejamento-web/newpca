import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { cancelarDeclaracao, contextoDeclaracoes, declaracaoDoContexto } from "@/lib/declaracoes";
import { cancelarDeclaracaoSchema } from "@/lib/declaracoes-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; did: string }> };

/** A declaração com o retrato congelado (os itens) — quem visualiza no PCA. */
export async function GET(_req: Request, ctx: Ctx) {
  const g = await exigirAcesso("pca", "visualizar");
  if ("erro" in g) return g.erro;
  const { id, did } = await ctx.params;
  const c = await contextoDeclaracoes(g, id, "visualizar");
  if ("erro" in c) return c.erro;
  const v = await declaracaoDoContexto(c.pca, c.rep, did);
  if (!v) return erro("Declaração não encontrada.", 404);
  const { conteudoTexto: _t, ...resto } = v.d;
  return ok({ declaracao: resto });
}

/** CANCELA a declaração (com o motivo): o saldo volta aos itens e a verificação pública passa a dizer "cancelada". */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await exigirAcesso("pca", "excluir");
  if ("erro" in g) return g.erro;
  const { id, did } = await ctx.params;
  const c = await contextoDeclaracoes(g, id, "excluir");
  if ("erro" in c) return c.erro;
  const p = await parseCorpo(cancelarDeclaracaoSchema, req);
  if ("resp" in p) return p.resp;
  const v = await declaracaoDoContexto(c.pca, c.rep, did);
  if (!v) return erro("Declaração não encontrada.", 404);
  if (!v.todos) return erro("A declaração tem itens de outras unidades — só quem vê todos eles pode cancelá-la.", 403);
  const d = v.d;
  if (d.cancelada || !(await cancelarDeclaracao(d.id, g.u.nome, p.data.motivo as string))) return erro("A declaração já está cancelada.", 409);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "declaracao",
    entidadeId: d.id,
    resumo: `Declaração ${d.rotulo} CANCELADA — ${p.data.motivo}`,
  });
  return ok();
}
