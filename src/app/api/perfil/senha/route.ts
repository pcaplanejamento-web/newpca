import { and, eq, ne, sql } from "drizzle-orm";
import { sessoes, usuarios } from "@/db/schema";
import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { hashSenha, sessaoAtualId } from "@/lib/auth";
import { trocarSenhaSchema } from "@/lib/auth-validation";
import { consumirCodigo } from "@/lib/codigo-email";
import { MENSAGEM_CODIGO } from "@/lib/codigo-email-core";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Trocar (ou CRIAR) a senha no Perfil: vale depois do código de 6 dígitos enviado ao e-mail da conta. As OUTRAS sessões
 * são encerradas (a atual continua). */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const corpo = await parseCorpo(trocarSenhaSchema, req);
  if ("resp" in corpo) return corpo.resp;

  const r = await consumirCodigo(a.u.email, "senha", corpo.data.codigo);
  if (r !== "ok") return erro(MENSAGEM_CODIGO[r], 422);
  const db = getDb();
  const atual = await sessaoAtualId();
  await db.batch([
    db
      .update(usuarios)
      .set({ senhaHash: await hashSenha(corpo.data.novaSenha), emailVerificadoEm: sql`COALESCE(${usuarios.emailVerificadoEm}, CURRENT_TIMESTAMP)`, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(usuarios.id, a.u.id)),
    db.delete(sessoes).where(atual ? and(eq(sessoes.usuarioId, a.u.id), ne(sessoes.id, atual)) : eq(sessoes.usuarioId, a.u.id)),
  ]);
  // Registra só o FATO (nunca a senha).
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "usuario", entidadeId: a.u.id, resumo: "Senha alterada (confirmada pelo código enviado ao e-mail)" });
  return ok();
}
