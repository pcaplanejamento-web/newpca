import { NextResponse } from "next/server";
import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { criarLinha, linhaSchema, listarLinhas } from "@/lib/tabelas";

export const dynamic = "force-dynamic";

const int = (v: string | null) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const tabelaId = intId((await ctx.params).id);
  if (!tabelaId) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  const sp = new URL(req.url).searchParams;
  const r = await listarLinhas(tabelaId, {
    q: sp.get("q") ?? undefined,
    page: int(sp.get("page")),
    pageSize: int(sp.get("pageSize")),
  });
  return NextResponse.json({ ok: true, ...r, podeEditar: a.u.role !== "membro" });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const tabelaId = intId((await ctx.params).id);
  if (!tabelaId) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  const parsed = linhaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 422 });
  const id = await criarLinha(tabelaId, parsed.data.dados, a.u.id);
  return NextResponse.json({ ok: true, id });
}
