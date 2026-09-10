import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { protocolos } from "@/db/schema";
import { getUsuarioAtual } from "@/lib/auth";
import { protocoloPatchSchema } from "@/lib/protocolos";

export const dynamic = "force-dynamic";

const podeEditar = (role: string) => role === "admin" || role === "gestor";

async function editor() {
  const u = await getUsuarioAtual();
  if (!u) return { erro: NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 }) };
  if (!podeEditar(u.role))
    return { erro: NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 }) };
  return { u };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { erro } = await editor();
  if (erro) return erro;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id))
    return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const parsed = protocoloPatchSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );

  await getDb()
    .update(protocolos)
    .set({ ...parsed.data, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(protocolos.id, id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { erro } = await editor();
  if (erro) return erro;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id))
    return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });

  await getDb().delete(protocolos).where(eq(protocolos.id, id));
  return NextResponse.json({ ok: true });
}
