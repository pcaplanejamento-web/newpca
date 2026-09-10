import { NextResponse } from "next/server";
import { exigirEditor, intId } from "@/lib/api-auth";
import { atualizarColuna, colunaPatchSchema, excluirColuna } from "@/lib/tabelas";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  const parsed = colunaPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 422 });
  await atualizarColuna(id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  await excluirColuna(id);
  return NextResponse.json({ ok: true });
}
