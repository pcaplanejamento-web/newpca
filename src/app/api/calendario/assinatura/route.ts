import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { gerarTokenCalendario, revogarTokenCalendario } from "@/lib/calendario-assinatura";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Gera (ou troca — o anterior deixa de valer) o LINK DE ASSINATURA do calendário da pessoa; o token volta UMA vez. */
export async function POST() {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const token = await gerarTokenCalendario(a.u.id);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "usuario", entidadeId: a.u.id, resumo: "Link de assinatura do calendário gerado" });
  return ok({ token });
}

/** Desliga o link (os aplicativos que assinavam param de receber). */
export async function DELETE() {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  await revogarTokenCalendario(a.u.id);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "usuario", entidadeId: a.u.id, resumo: "Link de assinatura do calendário desligado" });
  return ok();
}
