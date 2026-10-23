import { NextResponse } from "next/server";
import { destinoBloqueio } from "@/lib/acesso-conta-core";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await getUsuarioAtual();
  // Bloqueado (termo/aparelho pendente): só o nome e o motivo — nenhum dado da conta antes de concluir.
  const bloqueio = usuario ? destinoBloqueio(usuario.pendencia) : null;
  if (usuario && bloqueio) return NextResponse.json({ usuario: { id: usuario.id, nome: usuario.nome, bloqueio } });
  return NextResponse.json({ usuario });
}
