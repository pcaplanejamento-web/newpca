import { desc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { urlFoto } from "@/lib/pessoa";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;

  const lista = await getDb()
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      apelido: usuarios.apelido,
      email: usuarios.email,
      matricula: usuarios.matricula,
      // A foto vai como URL (rota com cache), não o data-URL — a lista não pesa com muitos usuários.
      temFoto: sql<number>`(${usuarios.foto} IS NOT NULL AND ${usuarios.foto} <> '')`,
      versao: usuarios.atualizadoEm,
      role: usuarios.role,
      status: usuarios.status,
      criadoEm: usuarios.criadoEm,
    })
    .from(usuarios)
    .orderBy(desc(usuarios.criadoEm));

  return ok({ usuarios: lista.map(({ temFoto, versao, ...u }) => ({ ...u, foto: urlFoto(u.id, !!temFoto, versao) })), meuId: guard.u.id });
}
