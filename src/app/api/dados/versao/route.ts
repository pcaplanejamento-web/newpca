import { exigirUsuario } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { versaoDados } from "@/lib/versao-dados";
import { VERSAO_ATUAL } from "@/lib/versoes";

export const dynamic = "force-dynamic";

/**
 * A VERSÃO DOS DADOS (`versaoDados`): `versao` = a completa e `dados` = sem tarefas/agenda — o `SincronizarDados` só
 * recarrega a tela quando a versão da área dela muda. `app` = a versão PUBLICADA do sistema (a página aberta numa
 * anterior avisa "Recarregar").
 */
export async function GET() {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const v = await versaoDados();
  const r = ok({ versao: v.completa, dados: v.dados, tarefas: v.tarefas, agenda: v.agenda, execucao: v.execucao, app: VERSAO_ATUAL });
  r.headers.set("Cache-Control", "no-store");
  return r;
}
