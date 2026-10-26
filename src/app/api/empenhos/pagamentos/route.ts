import { exigirAcesso } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { erro, ok } from "@/lib/http";
import { anosPagamentos, textoPagamentos } from "@/lib/pagamentos-tela";

export const dynamic = "force-dynamic";

/**
 * A TABELA ÚNICA de PAGAMENTOS (todos os cards do tipo — o mesmo registro em dois cards uma vez): sem `?ano=`, os anos
 * gravados (no escopo da pessoa); com `?ano=` (e `?removidos=1`), as linhas do ano em tuplas (com o card de cada uma — o
 * banner pede pelo card da linha). A MESMA resposta da rota do card.
 */
export async function GET(req: Request) {
  const g = await exigirAcesso("pagamentos", "visualizar");
  if ("erro" in g) return g.erro;
  const u = new URL(req.url);
  const escopo = await escopoDosEmpenhos();
  if (!u.searchParams.has("ano")) return ok({ anos: await anosPagamentos(null, escopo, getDb()) });
  const ano = Number(u.searchParams.get("ano"));
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return erro("Ano inválido.", 422);
  const texto = await textoPagamentos(null, ano, u.searchParams.get("removidos") === "1", escopo, getDb());
  return new Response(`{"ok":true,"linhas":${texto}}`, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
