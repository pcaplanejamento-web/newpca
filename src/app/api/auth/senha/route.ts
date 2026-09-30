import { eq, sql } from "drizzle-orm";
import { sessoes, usuarios } from "@/db/schema";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarSessao, definirCookieSessao, hashSenha } from "@/lib/auth";
import { redefinirSenhaSchema } from "@/lib/auth-validation";
import { consumirCodigo } from "@/lib/codigo-email";
import { MENSAGEM_CODIGO } from "@/lib/codigo-email-core";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * "ESQUECI A SENHA" (e criar a senha de quem só entrava pelo Google): a nova senha vale depois do código de 6 dígitos
 * enviado ao e-mail da conta. As outras sessões são encerradas; com a conta ativa, já entra.
 */
export async function POST(req: Request) {
  const corpo = await parseCorpo(redefinirSenhaSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { email, senha, codigo } = corpo.data;

  try {
    const r = await consumirCodigo(email, "senha", codigo);
    if (r !== "ok") return erro(MENSAGEM_CODIGO[r], 422);
    const db = getDb();
    const [u] = await db.select({ id: usuarios.id, nome: usuarios.nome, status: usuarios.status }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
    if (!u || u.status === "inativo") return erro(MENSAGEM_CODIGO.inexistente, 422);

    await db.batch([
      db
        .update(usuarios)
        .set({ senhaHash: await hashSenha(senha), emailVerificadoEm: sql`COALESCE(${usuarios.emailVerificadoEm}, CURRENT_TIMESTAMP)`, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
        .where(eq(usuarios.id, u.id)),
      db.delete(sessoes).where(eq(sessoes.usuarioId, u.id)),
    ]);
    await registrarAuditoria({ usuario: { id: u.id, nome: u.nome, email }, acao: "editar", entidade: "usuario", entidadeId: u.id, resumo: "Senha redefinida pelo código enviado ao e-mail" });

    if (u.status !== "ativo") return ok({ autenticado: false, pendente: true });
    await definirCookieSessao(await criarSessao(u.id));
    return ok({ autenticado: true });
  } catch (e) {
    console.error("[senha] falha:", (e as Error).message);
    return erro("Erro ao redefinir a senha. Tente novamente.", 500);
  }
}
