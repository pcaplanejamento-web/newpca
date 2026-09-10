import { NextResponse } from "next/server";
import { exigirEditor, exigirUsuario } from "@/lib/api-auth";
import {
  criarProtocolo,
  getResumoProtocolos,
  listarOpcoes,
  listarProtocolos,
  protocoloSchema,
} from "@/lib/protocolos";

export const dynamic = "force-dynamic";

const int = (v: string | null) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
};

export async function GET(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const sp = new URL(req.url).searchParams;
  const [lista, resumo, opcoes] = await Promise.all([
    listarProtocolos({
      q: sp.get("q") ?? undefined,
      situacao: sp.get("situacao") ?? undefined,
      natureza: sp.get("natureza") ?? undefined,
      responsavel: sp.get("responsavel") ?? undefined,
      page: int(sp.get("page")),
      pageSize: int(sp.get("pageSize")),
    }),
    getResumoProtocolos(),
    listarOpcoes(),
  ]);
  return NextResponse.json({
    ok: true,
    ...lista,
    resumo,
    opcoes,
    podeEditar: a.u.role !== "membro",
  });
}

export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const parsed = protocoloSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );
  const id = await criarProtocolo(parsed.data, a.u.id);
  return NextResponse.json({ ok: true, id });
}
