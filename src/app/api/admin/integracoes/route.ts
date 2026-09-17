import { eq, sql } from "drizzle-orm";
import { exigirAdmin } from "@/lib/api-auth";
import { configuracoes } from "@/db/schema";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { invalidarIntegracoes } from "@/lib/integracoes";
import { coerceIntegracoes, type Integracoes, toView } from "@/lib/integracoes-core";
import { integracoesSchema } from "@/lib/integracoes-validation";
import { cifrarSegredo, temChaveMestra } from "@/lib/integracoes-segredos";

export const dynamic = "force-dynamic";

// Config de integrações do ADM. Chave `integracoes` do blob `configuracoes` id=1 (preserva
// as irmãs — aparência/avaliação). SEGREDOS são cifrados e NUNCA devolvidos (só `definido`).

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
  const atual = coerceIntegracoes((await lerBlob()).integracoes);
  return ok({ integracoes: toView(atual, temChaveMestra()) });
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(integracoesSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const entrada = corpo.data;

  const blob = await lerBlob();
  const atual = coerceIntegracoes(blob.integracoes);

  // Segredo novo (não-vazio) é cifrado; vazio = mantém o atual. Só exige a chave mestra
  // quando há segredo novo para cifrar (só o Turnstile guarda segredo cifrado aqui).
  if (entrada.turnstile.secret.length > 0 && !temChaveMestra()) {
    return erro("Defina a chave mestra (INTEGRACOES_CHAVE) no Cloudflare antes de salvar segredos.", 400);
  }
  const turnstileSecret =
    entrada.turnstile.secret.length > 0 ? await cifrarSegredo(entrada.turnstile.secret) : atual.turnstile.secret;

  const novoInteg: Integracoes = {
    turnstile: { ativo: entrada.turnstile.ativo, siteKey: entrada.turnstile.siteKey, secret: turnstileSecret },
    monitoramento: { ativo: entrada.monitoramento.ativo },
  };

  const novo = { ...blob, integracoes: novoInteg };
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify(novo), atualizadoPor: g.u.id, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  invalidarIntegracoes(); // loader tem cache de 60s
  return ok({ integracoes: toView(novoInteg, temChaveMestra()) });
}

export async function DELETE() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const blob = await lerBlob();
  const novo = { ...blob, integracoes: {} };
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify(novo), atualizadoPor: g.u.id, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  invalidarIntegracoes();
  return ok({ integracoes: toView(coerceIntegracoes(undefined), temChaveMestra()) });
}
