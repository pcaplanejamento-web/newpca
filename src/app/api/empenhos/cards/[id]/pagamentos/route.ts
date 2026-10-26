import { exigirSessao, recusa } from "@/lib/api-auth";
import { cardDaRota } from "@/lib/empenho-card-rota";
import { telaDoCard } from "@/lib/empenho-cards-core";
import { anosTabelaExecucao, escopoDosEmpenhos, textoTabelaExecucao } from "@/lib/empenhos-tela";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Os PAGAMENTOS de um card: sem `?ano=`, os anos gravados (no escopo da pessoa); com `?ano=` (e `?removidos=1`), as
 * linhas do ano em tuplas — o texto montado pelo banco, devolvido como está. O escopo é o do EMPENHO de cada pagamento.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const negado = recusa(g.acesso, telaDoCard(a.card), "visualizar");
  if (negado) return negado;
  const card = a.card.id;
  const u = new URL(req.url);
  const escopo = await escopoDosEmpenhos();
  if (!u.searchParams.has("ano")) return ok({ anos: await anosTabelaExecucao("pagamentos", card, escopo) });
  const ano = Number(u.searchParams.get("ano"));
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return erro("Ano inválido.", 422);
  const texto = await textoTabelaExecucao("pagamentos", card, ano, u.searchParams.get("removidos") === "1", escopo);
  return new Response(`{"ok":true,"linhas":${texto}}`, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
