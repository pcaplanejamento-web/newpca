import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth";
import { adicionarOpcao, listarOpcoes } from "@/lib/protocolos";

export const dynamic = "force-dynamic";

const podeEditar = (role: string) => role === "admin" || role === "gestor";

export async function GET() {
  const u = await getUsuarioAtual();
  if (!u) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const { rows, agrupado } = await listarOpcoes();
  return NextResponse.json({ ok: true, rows, agrupado, podeEditar: podeEditar(u.role) });
}

export async function POST(req: Request) {
  const u = await getUsuarioAtual();
  if (!u) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  if (!podeEditar(u.role))
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });

  let body: { categoria?: string; valor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const valor = await adicionarOpcao(body.categoria ?? "", body.valor ?? "");
  if (!valor)
    return NextResponse.json({ ok: false, error: "Categoria ou valor inválido." }, { status: 422 });
  return NextResponse.json({ ok: true, valor });
}
