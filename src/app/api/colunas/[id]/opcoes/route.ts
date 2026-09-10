import { NextResponse } from "next/server";
import { exigirEditor, intId } from "@/lib/api-auth";
import { adicionarOpcao, opcaoSchema, removerOpcao } from "@/lib/tabelas";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const colunaId = intId((await ctx.params).id);
  if (!colunaId) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  const parsed = opcaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: "Valor inválido." }, { status: 422 });
  const valor = await adicionarOpcao(colunaId, parsed.data.valor);
  return NextResponse.json({ ok: true, valor });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const colunaId = intId((await ctx.params).id);
  if (!colunaId) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  const parsed = opcaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: "Valor inválido." }, { status: 422 });
  await removerOpcao(colunaId, parsed.data.valor);
  return NextResponse.json({ ok: true });
}
