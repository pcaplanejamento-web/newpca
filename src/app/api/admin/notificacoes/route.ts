import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { getConfigNotificacoes, gravarConfigNotificacoes } from "@/lib/notificacoes-config";
import { CATALOGO_AVISOS, resolverNotificacoes } from "@/lib/notificacoes-config-core";
import { configNotificacoesSchema } from "@/lib/notificacoes-validation";

export const dynamic = "force-dynamic";

// Configurações → Notificações (ADM): por aviso do catálogo, se existe no SINO, se vai por E-MAIL e se a pessoa pode
// desligar o e-mail. Mesma linha `configuracoes` id=1 (chave `notificacoes`) — as chaves irmãs ficam.

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ avisos: await getConfigNotificacoes({ fresco: true }) });
}

/** O texto do que mudou (para o histórico): "Menção: e-mail ligado; Lembrete: sino desligado". */
function diffTexto(antes: ReturnType<typeof resolverNotificacoes>, depois: ReturnType<typeof resolverNotificacoes>): string {
  const ROT = { sino: "sino", email: "e-mail", desligavel: "a pessoa pode desligar" } as const;
  const partes: string[] = [];
  for (const i of CATALOGO_AVISOS)
    for (const k of ["sino", "email", "desligavel"] as const)
      if (antes[i.chave][k] !== depois[i.chave][k]) partes.push(`${i.rotulo}: ${ROT[k]} ${depois[i.chave][k] ? "ligado" : "desligado"}`);
  return partes.join("; ").slice(0, 900) || "sem mudança";
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(configNotificacoesSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getConfigNotificacoes({ fresco: true });
  const avisos = await gravarConfigNotificacoes(resolverNotificacoes(p.data.avisos), g.u.id);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: `Notificações (ADM): ${diffTexto(antes, avisos)}` });
  return ok({ avisos });
}

/** Volta aos PADRÕES do catálogo (o e-mail mínimo). */
export async function DELETE() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const avisos = await gravarConfigNotificacoes(resolverNotificacoes(undefined), g.u.id);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: "Notificações (ADM) restauradas ao padrão" });
  return ok({ avisos });
}
