import { eq } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { SENHA_INUTILIZAVEL } from "@/lib/google-oauth-core";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** DESVINCULA a conta Google do próprio usuário. Quem entrou só pelo Google (sem senha) não desvincula — ficaria sem acesso. */
export async function DELETE() {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const db = getDb();
  const [u] = await db.select({ senhaHash: usuarios.senhaHash, googleEmail: usuarios.googleEmail }).from(usuarios).where(eq(usuarios.id, a.u.id)).limit(1);
  if (!u?.googleEmail) return ok();
  if (u.senhaHash === SENHA_INUTILIZAVEL) return erro("Sua conta entra só pelo Google (não tem senha) — desvincular deixaria você sem acesso.", 409);
  await db.update(usuarios).set({ googleSub: null, googleEmail: null }).where(eq(usuarios.id, a.u.id));
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "usuario", entidadeId: a.u.id, resumo: `${a.u.nome} desvinculou a conta Google ${u.googleEmail}` });
  return ok();
}
