import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth";
import { removerOpcao } from "@/lib/protocolos";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await getUsuarioAtual();
  if (!u) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  if (u.role !== "admin" && u.role !== "gestor")
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id))
    return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });

  await removerOpcao(id);
  return NextResponse.json({ ok: true });
}
