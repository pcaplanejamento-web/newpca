import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { perfilSchema } from "@/lib/auth-validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;

  const parsed = perfilSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );

  const { nome, email, matricula, foto } = parsed.data;
  const db = getDb();

  // E-mail é único: rejeita se já pertence a outro usuário.
  const [dono] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.email, email), ne(usuarios.id, a.u.id)))
    .limit(1);
  if (dono)
    return NextResponse.json(
      { ok: false, error: "Este e-mail já está em uso." },
      { status: 409 },
    );

  const set = {
    nome,
    email,
    matricula: matricula ? matricula : null,
    ...(foto !== undefined ? { foto: foto ? foto : null } : {}),
    atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
  };
  await db.update(usuarios).set(set).where(eq(usuarios.id, a.u.id));
  return NextResponse.json({ ok: true });
}
