import { NextResponse } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { encerrarSessaoAtual, getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const u = await getUsuarioAtual(); // captura o ator ANTES de encerrar a sessão
    const proxima = await encerrarSessaoAtual();
    if (u) await registrarAuditoria({ usuario: { id: u.id, nome: u.nome, email: u.email }, acao: "logout", entidade: "usuario", entidadeId: u.id, resumo: `${u.nome} saiu do sistema` });
    // Havia outra conta guardada neste navegador: ela segue entrada (a tela vai ao painel, não ao login).
    if (proxima) return NextResponse.json({ ok: true, proxima: true });
  } catch (err) {
    console.error("Falha no logout:", err);
  }
  return NextResponse.json({ ok: true });
}
