import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { getConfigSeguranca, gravarConfigSeguranca } from "@/lib/seguranca";
import { rotuloInatividade } from "@/lib/seguranca-core";
import { configSegurancaSchema } from "@/lib/seguranca-validation";

export const dynamic = "force-dynamic";

// Configurações → Segurança (ADM): encerrar sessões inativas e os alertas de login suspeito. Blob `configuracoes` id=1,
// chave `seguranca` — as chaves irmãs ficam.

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ seguranca: await getConfigSeguranca({ fresco: true }) });
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(configSegurancaSchema, req);
  if ("resp" in p) return p.resp;
  const seguranca = await gravarConfigSeguranca(p.data, g.u.id);
  const sim = (b: boolean) => (b ? "ligado" : "desligado");
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "configuracao",
    entidadeId: 1,
    resumo: `Segurança (ADM): sessão inativa — ${rotuloInatividade(seguranca.inatividadeMin)}; alerta de aparelho novo ${sim(seguranca.alertaAparelho)}; alerta de conta bloqueada ${sim(seguranca.alertaFalhas)}`,
  });
  return ok({ seguranca });
}
