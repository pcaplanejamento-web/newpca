import { eq, sql } from "drizzle-orm";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { invalidarAvaliacao, parseRegrasAvaliacao } from "@/lib/avaliacao";
import { avaliacaoSchema } from "@/lib/avaliacao-validation";
import { getDb } from "@/lib/db";
import { configuracoes } from "@/db/schema";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

// Regras de avaliação do ADM. Compartilham a linha `configuracoes` id=1 com a aparência
// (chave `avaliacao` do blob `dados`) — as duas rotas preservam as chaves irmãs ao gravar.

/** Lê o blob COMPLETO de `configuracoes` id=1 (para preservar `cores`/`identidade`/etc.). */
async function lerBlob(): Promise<Record<string, unknown>> {
  const [row] = await getDb()
    .select({ dados: configuracoes.dados })
    .from(configuracoes)
    .where(eq(configuracoes.id, 1))
    .limit(1);
  try {
    return row?.dados ? (JSON.parse(row.dados) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const [row] = await getDb()
    .select({ dados: configuracoes.dados })
    .from(configuracoes)
    .where(eq(configuracoes.id, 1))
    .limit(1);
  return ok({ avaliacao: parseRegrasAvaliacao(row?.dados) });
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(avaliacaoSchema, req);
  if ("resp" in corpo) return corpo.resp;

  // Substitui só a chave `avaliacao`, preservando as demais (aparência).
  const blob = await lerBlob();
  const novo = { ...blob, avaliacao: corpo.data };
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify(novo), atualizadoPor: g.u.id, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  invalidarAvaliacao();
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: "Regras de avaliação (ADM) atualizadas" });
  return ok({ avaliacao: parseRegrasAvaliacao(JSON.stringify(novo)) });
}

export async function DELETE() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const blob = await lerBlob();
  const novo = { ...blob, avaliacao: {} };
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify(novo), atualizadoPor: g.u.id, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  invalidarAvaliacao();
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: "Regras de avaliação (ADM) restauradas ao padrão" });
  return ok({ avaliacao: parseRegrasAvaliacao(JSON.stringify(novo)) });
}
