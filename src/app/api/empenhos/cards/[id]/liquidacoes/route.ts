import { exigirAcesso, intId } from "@/lib/api-auth";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { getDb } from "@/lib/db";
import { erro, ok } from "@/lib/http";
import { anosLiquidacoes, textoLiquidacoes } from "@/lib/liquidacoes-tela";

export const dynamic = "force-dynamic";

/**
 * As LIQUIDAÇÕES de um card: sem `?ano=`, os anos gravados (no escopo da pessoa); com `?ano=` (e `?removidos=1`), as
 * linhas do ano em tuplas — o texto montado pelo banco, devolvido como está. O escopo é o do EMPENHO de cada liquidação.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAcesso("empenhos", "visualizar");
  if ("erro" in g) return g.erro;
  const card = intId((await ctx.params).id);
  if (!card) return erro("ID inválido.");
  const u = new URL(req.url);
  const escopo = await escopoDosEmpenhos();
  if (!u.searchParams.has("ano")) return ok({ anos: await anosLiquidacoes(card, escopo, getDb()) });
  const ano = Number(u.searchParams.get("ano"));
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return erro("Ano inválido.", 422);
  const texto = await textoLiquidacoes(card, ano, u.searchParams.get("removidos") === "1", escopo, getDb());
  return new Response(`{"ok":true,"linhas":${texto}}`, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
