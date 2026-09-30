import { eq, sql } from "drizzle-orm";
import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { perfilSchema } from "@/lib/auth-validation";
import { ok, parseCorpo } from "@/lib/http";
import { normalizarApelido } from "@/lib/pessoa";

export const dynamic = "force-dynamic";

/** O próprio perfil: SÓ o apelido e a foto — nome, e-mail, matrícula e unidade são alterados apenas pelo ADM. */
export async function PATCH(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;

  const corpo = await parseCorpo(perfilSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { apelido, foto } = corpo.data;

  await getDb()
    .update(usuarios)
    .set({
      ...(apelido !== undefined ? { apelido: normalizarApelido(apelido) } : {}),
      ...(foto !== undefined ? { foto: foto ? foto : null } : {}),
      atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(usuarios.id, a.u.id));
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "usuario", entidadeId: a.u.id, resumo: "Perfil atualizado (apelido/foto)" });
  return ok();
}
