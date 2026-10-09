import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ORIGEM_EXTENSAO_CENTI } from "@/lib/automacao-centi-core";
import { credencialCentiSchema } from "@/lib/automacao-validation";
import { apagarLoginCenti, cofreDisponivel, guardarLoginCenti, lerLoginCenti, situacaoLoginCenti } from "@/lib/centi-login-cofre";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * O LOGIN DA CENTI guardado no sistema (OPCIONAL, cifrado — `centi-login-cofre.ts`). A senha só VAI e VOLTA pela
 * EXTENSÃO: o navegador põe o Origin `chrome-extension://<id fixo>` nos pedidos do serviço dela e nenhuma página consegue
 * imitá-lo. A tela do sistema só vê a SITUAÇÃO (guardado ou não) e pode APAGAR.
 */
const daExtensao = (req: Request) => req.headers.get("origin") === ORIGEM_EXTENSAO_CENTI;
const doProprioSite = (req: Request) => {
  const o = req.headers.get("origin");
  if (!o) return true;
  try {
    return o === new URL(req.url).origin;
  } catch {
    return false;
  }
};
const semCache = { "cache-control": "no-store" };

export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  if (!daExtensao(req)) return ok({ ...(await situacaoLoginCenti(g.u.id)), disponivel: cofreDisponivel() });
  const l = await lerLoginCenti(g.u.id);
  const r = ok(l ? { tem: true, ...l } : { tem: false });
  for (const [k, v] of Object.entries(semCache)) r.headers.set(k, v);
  return r;
}

export async function PUT(req: Request) {
  if (!daExtensao(req)) return erro("Só a extensão guarda o login da Centi.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  if (!cofreDisponivel()) return erro("O sistema está sem a chave mestra (INTEGRACOES_CHAVE) para cifrar o login.", 503);
  const p = credencialCentiSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return erro("Login inválido.", 422);
  await guardarLoginCenti(g.u.id, p.data);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "automacao", origem: "centi", resumo: "Login da Centi guardado no sistema (cifrado) pela extensão" });
  return ok();
}

export async function DELETE(req: Request) {
  if (!daExtensao(req) && !doProprioSite(req)) return erro("Origem não permitida.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  await apagarLoginCenti(g.u.id);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "automacao", origem: "centi", resumo: "Login da Centi removido do sistema" });
  return ok();
}
