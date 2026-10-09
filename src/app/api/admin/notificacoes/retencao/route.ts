import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { getRetencao, gravarRetencao } from "@/lib/notificacoes-config";
import { retencaoSchema } from "@/lib/notificacoes-validation";

export const dynamic = "force-dynamic";

/** Quanto tempo os avisos ficam disponíveis e se o sistema os limpa sozinho (o cron dos e-mails). */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ retencao: await getRetencao() });
}

export async function PUT(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(retencaoSchema, req);
  if ("resp" in p) return p.resp;
  const r = await gravarRetencao(p.data, g.u.id);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "configuracao",
    entidadeId: 1,
    resumo: `Notificações: limpeza automática ${r.auto ? "ligada" : "desligada"} — lidas ${r.lidasDias} dias, não lidas ${r.naoLidasDias} dias, até ${r.teto} por pessoa`,
  });
  return ok({ retencao: r });
}
