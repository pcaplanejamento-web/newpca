import { eq, sql } from "drizzle-orm";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { configuracoes } from "@/db/schema";
import { ok, parseCorpo } from "@/lib/http";
import { invalidarAparencia } from "@/lib/aparencia";
import { type Aparencia, parseAparencia } from "@/lib/theme";
import { aparenciaSchema } from "@/lib/theme-validation";

export const dynamic = "force-dynamic";

async function lerDados() {
  const [row] = await getDb()
    .select({ dados: configuracoes.dados })
    .from(configuracoes)
    .where(eq(configuracoes.id, 1))
    .limit(1);
  return parseAparencia(row?.dados);
}

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ aparencia: await lerDados() });
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(aparenciaSchema, req);
  if ("resp" in corpo) return corpo.resp;

  const atual = await lerDados();
  const d = corpo.data;
  // Merge raso; cores e identidade mesclam por chave (o resto substitui).
  const novo: Aparencia = {
    ...atual,
    ...d,
    cores: {
      light: { ...(atual.cores?.light ?? {}), ...(d.cores?.light ?? {}) },
      dark: { ...(atual.cores?.dark ?? {}), ...(d.cores?.dark ?? {}) },
    },
    identidade: { ...(atual.identidade ?? {}), ...(d.identidade ?? {}) },
  };

  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify(novo), atualizadoPor: g.u.id, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  invalidarAparencia();
  return ok({ aparencia: novo });
}

export async function DELETE() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  await getDb()
    .update(configuracoes)
    .set({ dados: "{}", atualizadoPor: g.u.id, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  invalidarAparencia();
  return ok({ aparencia: {} });
}
