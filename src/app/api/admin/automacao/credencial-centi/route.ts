import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ORIGEM_EXTENSAO_CENTI, VERSAO_EXTENSAO_CENTI } from "@/lib/automacao-centi-core";
import { credencialCentiExtensaoSchema, credencialCentiSchema } from "@/lib/automacao-validation";
import { apagarLoginCenti, cofreDisponivel, entregarLoginCenti, guardarLoginCenti, importarLoginCenti, pausarLoginCenti, situacaoLoginCenti } from "@/lib/centi-login-cofre";
import { erro, ok } from "@/lib/http";
import { origemPermitida } from "@/lib/origem";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/**
 * O LOGIN DA CENTI de cada ADM no BANCO (`centi-login-cofre.ts`) — a ÚNICA fonte, valendo em qualquer navegador.
 * - A TELA do sistema (o próprio site, com o `Origin` dele) SALVA e REMOVE e só recebe a SITUAÇÃO — a senha nunca volta.
 * - A EXTENSÃO do navegador em que o ADM está logado pede a ENTREGA (POST) com a chave pública dela: a senha sai SELADA a
 *   essa chave — nunca em claro. Ela também avisa a PAUSA (por código) e, pedido pela pessoa, IMPORTA o login antigo dela.
 */
const daExtensao = (req: Request) => req.headers.get("origin") === ORIGEM_EXTENSAO_CENTI;
/** Escrita pela tela: o `Origin` do próprio site é OBRIGATÓRIO (sem ele, recusa). */
const daTela = (req: Request) => !!req.headers.get("origin") && origemPermitida(req);
const semCache = (r: Response) => {
  r.headers.set("cache-control", "no-store");
  return r;
};
const SEM_CHAVE = "O sistema está sem a chave mestra (INTEGRACOES_CHAVE) para cifrar o login.";
const MSG_ATUALIZE = `Atualize a extensão (${VERSAO_EXTENSAO_CENTI}) para entrar sozinha na Centi.`;

export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  // A entrega é pelo POST (o navegador só põe o `Origin` da extensão em POST/PUT — num GET ele não vem): a extensão antiga
  // que ainda pede aqui recebe o aviso para atualizar, nunca a situação no lugar do pacote.
  if (new URL(req.url).searchParams.has("publica")) return erro(MSG_ATUALIZE, 422);
  return semCache(ok({ ...(await situacaoLoginCenti(g.u)), disponivel: cofreDisponivel() }));
}

/** Salvar pela TELA (`null` mantém o guardado) — e pela extensão antiga (até a 1.38.0, o "Guardar no sistema" do popup
 * dela): escrever o PRÓPRIO login nunca expõe a senha. */
export async function PUT(req: Request) {
  if (!daTela(req) && !daExtensao(req)) return erro("Origem não permitida.", 403);
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
    resumo: p.data.senha === null && p.data.usuario === null ? "Login da Centi: entrar sozinho/retomar" : "Login da Centi salvo no sistema (cifrado)",
  });
  return semCache(ok(await situacaoLoginCenti(g.u)));
}

/**
 * Pela EXTENSÃO (o `Origin` dela — página nenhuma o imita, e o navegador só o põe em POST/PUT): a ENTREGA do login selado à
 * chave pública dela, a pausa (por código) e a importação do login da extensão antiga (nunca sobrescreve).
 */
export async function POST(req: Request) {
  if (!daExtensao(req)) return erro("Só a extensão faz este pedido.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = credencialCentiExtensaoSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return erro("Pedido inválido.", 422);
  if (p.data.acao === "entregar") {
    const esperar = await contarTentativa("loginCentiLeitura", String(g.u.id), true);
    if (esperar > 0) return respostaLimite(esperar);
    const e = await entregarLoginCenti(g.u.id, p.data.publica);
    if (e.estado === "chaveInvalida") return erro("A chave da extensão é inválida — reinstale a extensão.", 422);
    if (e.estado === "semLogin") return semCache(ok({ tem: false }));
    if (e.estado === "pausado") return semCache(ok({ tem: true, pausado: true, motivo: e.motivo ?? "Login pausado." }));
    return semCache(ok({ tem: true, auto: e.auto, selado: e.selado }));
  }
  const esperar = await contarTentativa("loginCentiEscrita", String(g.u.id));
  if (esperar > 0) return respostaLimite(esperar);
  if (p.data.acao === "pausar") {
    await pausarLoginCenti(g.u.id, p.data.motivo);
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "automacao", origem: "centi", resumo: "Login da Centi pausado pela extensão" });
    return ok();
  }
  const r = await importarLoginCenti(g.u.id, { usuario: p.data.usuario, senha: p.data.senha, auto: p.data.auto });
  if (r === "semChave") return erro(SEM_CHAVE, 503);
  if (r === "existe") return erro("Já há um login da Centi guardado no sistema.", 409);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "automacao", origem: "centi", resumo: "Login da Centi levado da extensão ao sistema (cifrado)" });
  return ok();
}

/** Remover: só pela TELA. */
export async function DELETE(req: Request) {
  if (!daTela(req)) return erro("Origem não permitida.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  await apagarLoginCenti(g.u.id);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "automacao", origem: "centi", resumo: "Login da Centi removido do sistema" });
  return ok();
}
