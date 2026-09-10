import { NextResponse } from "next/server";
import { exigirEditor, intId } from "@/lib/api-auth";
import { adicionarColuna, colunaSchema } from "@/lib/tabelas";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const tabelaId = intId((await ctx.params).id);
  if (!tabelaId) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  const parsed = colunaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );
  const id = await adicionarColuna(tabelaId, parsed.data.nome, parsed.data.tipo);
  return NextResponse.json({ ok: true, id });
}
