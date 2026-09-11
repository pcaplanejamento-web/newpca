import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;

  const lista = await getDb()
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      matricula: usuarios.matricula,
      foto: usuarios.foto,
      role: usuarios.role,
      status: usuarios.status,
      criadoEm: usuarios.criadoEm,
    })
    .from(usuarios)
    .orderBy(desc(usuarios.criadoEm));

  return ok({ usuarios: lista, meuId: guard.u.id });
}
