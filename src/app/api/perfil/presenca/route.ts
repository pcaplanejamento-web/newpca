import { exigirUsuario } from "@/lib/api-auth";
import { erro, ok, parseCorpo } from "@/lib/http";
import { salvarPreferenciaTabela } from "@/lib/preferencias-tabela";
import { getConfigPresenca, prefsPresencaDe } from "@/lib/presenca";
import { CHAVE_PREF_PRESENCA, lerPrefsPresenca } from "@/lib/presenca-core";
import { prefsPresencaSchema } from "@/lib/presenca-validation";

export const dynamic = "force-dynamic";

/** As escolhas da pessoa na PRESENÇA do grupo: aparecer INVISÍVEL (só quando o ADM permite — vale na próxima conexão; a
 * tela reconecta) e o STATUS (Disponível · Ocupado · Em reunião · Não perturbe + recado + "até" — a tela também o manda
 * pelo socket, na hora). O que não vier fica como está. */
export async function PUT(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(prefsPresencaSchema, req);
  if ("resp" in p) return p.resp;
  const cfg = await getConfigPresenca({ fresco: true });
  if (!cfg.ativo) return erro("A presença está desligada pelo administrador.", 409);
  if (p.data.invisivel && !cfg.invisivel) return erro("O administrador não permite aparecer invisível.", 409);
  const atual = await prefsPresencaDe(a.u.id);
  const nova = lerPrefsPresenca({ ...atual, ...p.data });
  await salvarPreferenciaTabela(a.u.id, CHAVE_PREF_PRESENCA, nova);
  return ok({ prefs: nova });
}
