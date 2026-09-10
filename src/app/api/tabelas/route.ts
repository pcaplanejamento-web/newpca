import { NextResponse } from "next/server";
import { exigirEditor, exigirUsuario } from "@/lib/api-auth";
import { criarTabela, listarTabelas, nomeSchema } from "@/lib/tabelas";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const tabelas = await listarTabelas();
  return NextResponse.json({ ok: true, tabelas, podeEditar: a.u.role !== "membro" });
}

export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const json = await req.json().catch(() => null);
  const parsed = nomeSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );
  const id = await criarTabela(parsed.data.nome, a.u.id);
  return NextResponse.json({ ok: true, id });
}
