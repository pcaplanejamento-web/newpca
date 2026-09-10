import { NextResponse } from "next/server";
import { exigirEditor, intId } from "@/lib/api-auth";
import {
  atualizarProtocolo,
  excluirProtocolo,
  protocoloPatchSchema,
} from "@/lib/protocolos";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  const parsed = protocoloPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );
  await atualizarProtocolo(id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  await excluirProtocolo(id);
  return NextResponse.json({ ok: true });
}
