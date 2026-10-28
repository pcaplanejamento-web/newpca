import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { contextoDeclaracoes, emitirDeclaracao } from "@/lib/declaracoes";
import { type Finalidade, ROTULO_FINALIDADE } from "@/lib/declaracoes-core";
import { emitirDeclaracaoSchema } from "@/lib/declaracoes-validation";
import { brl } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** EMITE uma declaração do PCA (itens total ou parcial): quem MANIPULA no PCA e tem o componente Declarações. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAcesso("pca", "manipular");
  if ("erro" in g) return g.erro;
  const c = await contextoDeclaracoes(g, (await ctx.params).id, "manipular");
  if ("erro" in c) return c.erro;
  const p = await parseCorpo(emitirDeclaracaoSchema, req);
  if ("resp" in p) return p.resp;
  const r = await emitirDeclaracao(g.u, c.pca, { ...p.data, finalidade: p.data.finalidade as Finalidade }, c.rep);
  if ("erro" in r) return erro(r.erro, r.status);
  const d = r.declaracao;
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "declaracao",
    entidadeId: d.id,
    resumo: `Declaração ${d.rotulo} emitida no PCA "${c.pca.nome}" — ${ROTULO_FINALIDADE[d.finalidade]}, ${d.totalItens} item(ns), ${brl(d.valorTotal)}`,
  });
  return ok({ declaracao: d });
}
