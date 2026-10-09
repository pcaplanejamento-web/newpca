import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sql } from "drizzle-orm";
import { notificacoes } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * O ALCANCE dos avisos (últimos N dias — `?dias=30`): por tipo, quantos foram criados, lidos, o tempo médio até a
 * leitura, os e-mails que saíram e os que esperam na fila; + o canal ao vivo (o binding existe?). Mostra o que é ruído.
 */
export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const dias = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("dias")) || 30));
  const linhas = await getDb()
    .select({
      tipo: notificacoes.tipo,
      total: sql<number>`COUNT(*)`,
      lidas: sql<number>`SUM(CASE WHEN ${notificacoes.lida} = 1 THEN 1 ELSE 0 END)`,
      horasLeitura: sql<number | null>`AVG(CASE WHEN ${notificacoes.lidaEm} IS NOT NULL THEN (julianday(${notificacoes.lidaEm}) - julianday(${notificacoes.criadoEm})) * 24 END)`,
      emails: sql<number>`SUM(CASE WHEN ${notificacoes.emailOk} = 1 THEN 1 ELSE 0 END)`,
      naFila: sql<number>`SUM(CASE WHEN ${notificacoes.emailEnviadoEm} IS NULL THEN 1 ELSE 0 END)`,
      pessoas: sql<number>`COUNT(DISTINCT ${notificacoes.usuarioId})`,
    })
    .from(notificacoes)
    .where(sql`${notificacoes.criadoEm} >= datetime('now', ${`-${dias} days`})`)
    .groupBy(notificacoes.tipo);
  let aoVivo = false;
  try {
    aoVivo = !!getCloudflareContext().env.CAIXA_NOTIFICACOES;
  } catch {
    /* fora do Worker */
  }
  return ok({
    dias,
    aoVivo,
    tipos: linhas.map((l) => ({ ...l, total: Number(l.total), lidas: Number(l.lidas), emails: Number(l.emails), naFila: Number(l.naFila), pessoas: Number(l.pessoas), horasLeitura: l.horasLeitura == null ? null : Number(l.horasLeitura) })),
  });
}
