import { exigirAdmin, intId } from "@/lib/api-auth";
import { sessaoAtual } from "@/lib/auth";
import { ORIGEM_EXTENSAO_CENTI } from "@/lib/automacao-centi-core";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizarNavegadorSchema } from "@/lib/automacao-validation";
import { autorizarNavegador, tirarNavegador } from "@/lib/centi-login-cofre";
import { erro, ok } from "@/lib/http";
import { notificar } from "@/lib/notificacoes";
import { origemPermitida } from "@/lib/origem";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";
import { resumoNavegador } from "@/lib/seguranca-core";

export const dynamic = "force-dynamic";

/**
 * Os NAVEGADORES autorizados a receber o login da Centi (selado à chave da extensão de cada um). AUTORIZAR exige a SENHA
 * DO SISTEMA — ou uma sessão RECÉM-CRIADA (a pessoa acabou de entrar no sistema neste navegador): quem só tem um cookie
 * antigo não autoriza a própria chave. A pessoa é avisada (sino e e-mail) a cada navegador autorizado. Remover: só a tela.
 */
const daTela = (req: Request) => !!req.headers.get("origin") && origemPermitida(req);

/** Pela TELA (com a senha do sistema) ou pela EXTENSÃO (sem a senha — só numa sessão recém-criada: `podeAutorizarSemSenha`).
 * O que decide é a sessão, nunca a origem; outro site não chega aqui com o cookie (SameSite=Lax). */
export async function POST(req: Request) {
  if (!daTela(req) && req.headers.get("origin") !== ORIGEM_EXTENSAO_CENTI) return erro("Origem não permitida.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = autorizarNavegadorSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return erro("Pedido inválido.", 422);
  const esperar = await contarTentativa("autorizarNavegador", String(g.u.id), true);
  if (esperar > 0) return respostaLimite(esperar);
  const navegador = p.data.navegador || resumoNavegador(req.headers.get("user-agent"));
  const r = await autorizarNavegador(g.u.id, p.data.publica, navegador, p.data.senha, await sessaoAtual());
  if (r.motivo) return erro(r.motivo, 422);
  if (r.jaAutorizado) return ok();
  const ip = req.headers.get("cf-connecting-ip") ?? "desconhecido";
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "automacao", origem: "centi", resumo: `Navegador autorizado a usar o login da Centi: ${navegador}` });
  await notificar([
    {
      usuarioId: g.u.id,
      tipo: "seguranca",
      titulo: "Navegador autorizado a usar o seu login da Centi",
      texto: `${navegador} (IP ${ip}). Se não foi você, remova em Automação → Ajustes → Login da Centi e troque a senha do sistema.`,
      link: "/painel/automacao?ajustes=login",
      chave: `centi-navegador:${g.u.id}:${Date.now()}`,
    },
  ]).catch(() => null);
  return ok();
}

export async function DELETE(req: Request) {
  if (!daTela(req)) return erro("Origem não permitida.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId(new URL(req.url).searchParams.get("id") ?? "");
  if (!id) return erro("Navegador inválido.", 422);
  if (!(await tirarNavegador(g.u.id, id))) return erro("Navegador não encontrado.", 404);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "automacao", origem: "centi", resumo: "Navegador removido do login da Centi" });
  return ok();
}
