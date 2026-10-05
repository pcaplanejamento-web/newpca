import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { comandoEncerrarEmailsVelhos } from "@/lib/email-sql";
import { ok } from "@/lib/http";
import { getRetencao } from "@/lib/notificacoes-config";
import { comandosRetencaoNotificacoes } from "@/lib/notificacoes-sql";

export const dynamic = "force-dynamic";

/** LIMPAR AGORA (o ADM): roda a retenção já — mesmo com a limpeza automática desligada. Devolve quantos avisos saíram. */
export async function POST() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const db = getDb();
  const r = await getRetencao();
  const [lidas, naoLidas, teto] = (await db.batch([...comandosRetencaoNotificacoes(db, r), comandoEncerrarEmailsVelhos(db)])) as unknown as unknown[][];
  const removidas = lidas.length + naoLidas.length + teto.length;
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "configuracao", entidadeId: 1, resumo: `Notificações: limpeza manual — ${removidas} aviso(s) removido(s)` });
  return ok({ removidas });
}
