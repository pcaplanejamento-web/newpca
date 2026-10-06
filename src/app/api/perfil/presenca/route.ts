import { exigirUsuario } from "@/lib/api-auth";
import { erro, ok, parseCorpo } from "@/lib/http";
import { salvarPreferenciaTabela } from "@/lib/preferencias-tabela";
import { getConfigPresenca } from "@/lib/presenca";
import { CHAVE_PREF_PRESENCA } from "@/lib/presenca-core";
import { prefsPresencaSchema } from "@/lib/presenca-validation";

export const dynamic = "force-dynamic";

/** Perfil → aparecer INVISÍVEL na presença do grupo (só quando o ADM permite). Vale na próxima conexão (a tela reconecta). */
export async function PUT(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(prefsPresencaSchema, req);
  if ("resp" in p) return p.resp;
  const cfg = await getConfigPresenca({ fresco: true });
  if (p.data.invisivel && !(cfg.ativo && cfg.invisivel)) return erro("O administrador não permite aparecer invisível.", 409);
  await salvarPreferenciaTabela(a.u.id, CHAVE_PREF_PRESENCA, { invisivel: p.data.invisivel });
  return ok({ invisivel: p.data.invisivel });
}
