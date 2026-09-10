import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { protocolos } from "@/db/schema";
import { getUsuarioAtual } from "@/lib/auth";
import {
  listarProtocolos,
  opcoesProtocolos,
  protocoloSchema,
  resumoProtocolos,
} from "@/lib/protocolos";

export const dynamic = "force-dynamic";

const int = (v: string | null) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
};
const podeEditar = (role: string) => role === "admin" || role === "gestor";

export async function GET(req: Request) {
  const u = await getUsuarioAtual();
  if (!u) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const [r, resumo, opcoes] = await Promise.all([
    listarProtocolos({
      situacao: sp.get("situacao") ?? undefined,
      responsavel: sp.get("responsavel") ?? undefined,
      natureza: sp.get("natureza") ?? undefined,
      q: sp.get("q") ?? undefined,
      page: int(sp.get("page")),
      pageSize: int(sp.get("pageSize")),
    }),
    resumoProtocolos(),
    opcoesProtocolos(),
  ]);
  return NextResponse.json({ ok: true, ...r, resumo, opcoes, podeEditar: podeEditar(u.role) });
}

export async function POST(req: Request) {
  const u = await getUsuarioAtual();
  if (!u) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  if (!podeEditar(u.role))
    return NextResponse.json(
      { ok: false, error: "Apenas administradores e gestores podem criar protocolos." },
      { status: 403 },
    );

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const parsed = protocoloSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );

  const [p] = await getDb()
    .insert(protocolos)
    .values({ ...parsed.data, criadoPor: u.id, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .returning({ id: protocolos.id });

  return NextResponse.json({ ok: true, id: p.id });
}
