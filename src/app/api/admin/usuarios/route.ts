import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const atual = await getUsuarioAtual();
  if (!atual || atual.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }

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

  return NextResponse.json({ ok: true, usuarios: lista, meuId: atual.id });
}
