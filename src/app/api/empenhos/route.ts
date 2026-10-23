import { exigirAcesso } from "@/lib/api-auth";
import { pacoteEmpenhos } from "@/lib/empenhos-tela";
import { erro } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Os empenhos de um ANO no pacote compacto (`empenhos-tela-core.ts`) — `?removidos=1` = os que a Centi não traz
 * mais. O corpo é o texto montado pelo banco, devolvido como está (o Worker não lê as dezenas de milhares de linhas).
 */
export async function GET(req: Request) {
  const g = await exigirAcesso("empenhos", "visualizar");
  if ("erro" in g) return g.erro;
  const u = new URL(req.url);
  const ano = Number(u.searchParams.get("ano"));
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return erro("Ano inválido.", 422);
  const texto = await pacoteEmpenhos(ano, u.searchParams.get("removidos") === "1");
  if (texto == null) return erro("Os empenhos deste ano estão sendo atualizados agora — tente de novo em instantes.", 503);
  return new Response(`{"ok":true,"pacote":${texto}}`, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
