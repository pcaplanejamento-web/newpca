import { NextResponse } from "next/server";
import { getUsuarioAtual, type UsuarioSessao } from "./auth";

/** Exige usuário autenticado. Retorna { u } ou { erro } (resposta 401). */
export async function exigirUsuario(): Promise<
  { u: UsuarioSessao } | { erro: NextResponse }
> {
  const u = await getUsuarioAtual();
  if (!u)
    return { erro: NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 }) };
  return { u };
}

/** Exige admin ou gestor (membros só leem). */
export async function exigirEditor(): Promise<
  { u: UsuarioSessao } | { erro: NextResponse }
> {
  const r = await exigirUsuario();
  if ("erro" in r) return r;
  if (r.u.role === "membro")
    return { erro: NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 }) };
  return r;
}

export const intId = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
