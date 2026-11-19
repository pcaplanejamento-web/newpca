import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ORIGEM_EXTENSAO_CENTI } from "@/lib/automacao-centi-core";
import { credencialCentiExtensaoSchema, credencialCentiSchema } from "@/lib/automacao-validation";
import { apagarLoginCenti, cofreDisponivel, guardarLoginCenti, lerLoginCenti, pausarLoginCenti, situacaoLoginCenti } from "@/lib/centi-login-cofre";
import { erro, ok } from "@/lib/http";
import { origemPermitida } from "@/lib/origem";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/**
 * O LOGIN DA CENTI de cada ADM no BANCO (`centi-login-cofre.ts`) — a ÚNICA fonte, valendo em qualquer navegador.
 * - A TELA do sistema (o próprio site, com o `Origin` dele) SALVA e REMOVE e só recebe a SITUAÇÃO — a senha nunca volta.
 * - A EXTENSÃO (o `Origin` `chrome-extension://<id fixo>`, que nenhuma página imita) LÊ a senha para entrar na Centi,
 *   avisa a PAUSA (a Centi recusou a senha) e, uma vez, IMPORTA o login que guardava antes da 1.39.0.
 */
const daExtensao = (req: Request) => req.headers.get("origin") === ORIGEM_EXTENSAO_CENTI;
/** Escrita de senha pela tela: o `Origin` do próprio site é OBRIGATÓRIO (sem ele, recusa). */
const daTela = (req: Request) => !!req.headers.get("origin") && origemPermitida(req);
const semCache = (r: Response) => {
  r.headers.set("cache-control", "no-store");
  return r;
};
const SEM_CHAVE = "O sistema está sem a chave mestra (INTEGRACOES_CHAVE) para cifrar o login.";

export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const situacao = new URL(req.url).searchParams.get("situacao") === "1";
  if (!daExtensao(req) || situacao) return semCache(ok({ ...(await situacaoLoginCenti(g.u.id)), disponivel: cofreDisponivel() }));
  const esperar = await contarTentativa("loginCentiLeitura", String(g.u.id));
  if (esperar > 0) return respostaLimite(esperar);
  const l = await lerLoginCenti(g.u.id);
  if (l.pausadoEm) return semCache(ok({ tem: true, pausado: true, motivo: l.motivo ?? "Login pausado." }));
  return semCache(ok(l.login ? { tem: true, ...l.login } : { tem: false }));
}

/** Salvar pela TELA: `null` mantém o guardado. */
export async function PUT(req: Request) {
  if (!daTela(req)) return erro("O login da Centi é salvo só pela tela do sistema.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  if (!cofreDisponivel()) return erro(SEM_CHAVE, 503);
  const p = credencialCentiSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return erro("Login inválido.", 422);
  const esperar = await contarTentativa("loginCentiEscrita", String(g.u.id));
  if (esperar > 0) return respostaLimite(esperar);
  const motivo = await guardarLoginCenti(g.u.id, p.data);
  if (motivo) return erro(motivo, 422);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "automacao",
    origem: "centi",
    resumo: p.data.senha === null && p.data.usuario === null ? "Login da Centi: entrar sozinho alterado" : "Login da Centi salvo no sistema (cifrado)",
  });
  return semCache(ok(await situacaoLoginCenti(g.u.id)));
}

/** Pela EXTENSÃO: a pausa (senha recusada) ou a importação única do login que ela guardava. */
export async function POST(req: Request) {
  if (!daExtensao(req)) return erro("Só a extensão faz este pedido.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = credencialCentiExtensaoSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return erro("Pedido inválido.", 422);
  const esperar = await contarTentativa("loginCentiEscrita", String(g.u.id));
  if (esperar > 0) return respostaLimite(esperar);
  if (p.data.acao === "pausar") {
    await pausarLoginCenti(g.u.id, p.data.motivo);
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "automacao", origem: "centi", resumo: "Login da Centi pausado: a Centi recusou a senha" });
    return ok();
  }
  if (!cofreDisponivel()) return erro(SEM_CHAVE, 503);
  // Importar só quando não há login no banco: o do banco sempre vale mais que o que a extensão tinha.
  if ((await situacaoLoginCenti(g.u.id)).tem) return erro("Já há um login da Centi guardado no sistema.", 409);
  const motivo = await guardarLoginCenti(g.u.id, p.data);
  if (motivo) return erro(motivo, 422);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "automacao", origem: "centi", resumo: "Login da Centi levado da extensão ao sistema (cifrado)" });
  return ok();
}

export async function DELETE(req: Request) {
  if (!daExtensao(req) && !daTela(req)) return erro("Origem não permitida.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  await apagarLoginCenti(g.u.id);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "automacao", origem: "centi", resumo: "Login da Centi removido do sistema" });
  return ok();
}
