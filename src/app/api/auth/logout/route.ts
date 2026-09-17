import { NextResponse } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { encerrarSessaoAtual, getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const u = await getUsuarioAtual(); // captura o ator ANTES de encerrar a sessão
    await encerrarSessaoAtual();
    if (u) await registrarAuditoria({ usuario: { id: u.id, nome: u.nome, email: u.email }, acao: "logout", entidade: "usuario", entidadeId: u.id, resumo: `${u.nome} saiu do sistema` });
  } catch (err) {
    console.error("Falha no logout:", err);
  }
  return NextResponse.json({ ok: true });
}
