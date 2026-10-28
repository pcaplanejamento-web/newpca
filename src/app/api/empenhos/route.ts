import { exigirAcesso } from "@/lib/api-auth";
import { escopoDosEmpenhos, pacoteEmpenhos } from "@/lib/empenhos-tela";
import { erro } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Os empenhos de um ANO de um CARD (`?card=`; sem ele, de TODOS os cards — a tabela única, o mesmo empenho uma vez) no pacote compacto (`empenhos-tela-core.ts`) — `?removidos=1` = os que a
 * Centi não traz mais; só os do escopo da pessoa (`escopoDosEmpenhos`). O corpo é o texto montado pelo banco, devolvido como está (o Worker não lê as dezenas de milhares de linhas).
 */
export async function GET(req: Request) {
  const g = await exigirAcesso("empenhos", "visualizar");
  if ("erro" in g) return g.erro;
  const u = new URL(req.url);
  const ano = Number(u.searchParams.get("ano"));
  const card = u.searchParams.has("card") ? Number(u.searchParams.get("card")) : null;
  if (card !== null && (!Number.isInteger(card) || card < 1)) return erro("Card inválido.", 422);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return erro("Ano inválido.", 422);
  const texto = await pacoteEmpenhos(card, ano, u.searchParams.get("removidos") === "1", await escopoDosEmpenhos());
  if (texto == null) return erro("Os empenhos deste ano estão sendo atualizados agora — tente de novo em instantes.", 503);
  return new Response(`{"ok":true,"pacote":${texto}}`, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
