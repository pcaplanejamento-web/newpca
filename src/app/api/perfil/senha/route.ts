import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/api-auth";
import { atualizarSenha } from "@/lib/auth";
import { trocarSenhaSchema } from "@/lib/auth-validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;

  const parsed = trocarSenhaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );

  const ok = await atualizarSenha(
    a.u.id,
    parsed.data.senhaAtual,
    parsed.data.novaSenha,
  );
  if (!ok)
    return NextResponse.json(
      { ok: false, error: "Senha atual incorreta." },
      { status: 400 },
    );
  return NextResponse.json({ ok: true });
}
