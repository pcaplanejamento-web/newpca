import { NextResponse } from "next/server";
import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import {
  excluirTabela,
  getTabelaDetalhe,
  nomeSchema,
  renomearTabela,
} from "@/lib/tabelas";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  const det = await getTabelaDetalhe(id);
  if (!det) return NextResponse.json({ ok: false, error: "Tabela não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, ...det, podeEditar: a.u.role !== "membro" });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  const parsed = nomeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: "Nome inválido." }, { status: 422 });
  await renomearTabela(id, parsed.data.nome);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  await excluirTabela(id);
  return NextResponse.json({ ok: true });
}
