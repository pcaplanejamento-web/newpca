import { exigirAdmin, intId } from "@/lib/api-auth";
import { motivoNaoEscrever, textoAlvoAnexo, VALIDADE_AUTORIZACAO_S } from "@/lib/automacao-core";
import { criarAutorizacao, escritaRegistrada, getConfigAutomacao, getExecucao, passoDaExecucao } from "@/lib/automacao-plataforma";
import { autorizarSchema } from "@/lib/automacao-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { sha256Hex } from "@/lib/password";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";
import { hashToken, novoToken } from "@/lib/trello-sync-core";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A permissão de USO ÚNICO para UMA escrita na Centi (o token volta UMA vez; o banco guarda só o hash). Confere: o freio,
 * a receita ligada e com a capacidade, a execução RODANDO (não ensaio) de quem pede, o passo pendente, a escrita ainda
 * não feita e o limite de ritmo. A extensão CONSOME o token no servidor antes de gravar.
 */
export async function POST(req: Request, ctx: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  const p = await parseCorpo(autorizarSchema, req);
  if ("resp" in p) return p.resp;
  const x = id ? await getExecucao(id) : null;
  if (!id || !x) return erro("Execução não encontrada.", 404);
  const e = x.execucao;
  if (e.usuarioId !== g.u.id) return erro("Só quem iniciou a execução escreve por ela.", 403);
  if (e.ensaio) return erro("Ensaio não grava nada na Centi.", 409);
  if (e.estado !== "rodando") return erro(`A execução está “${e.estado}”.`, 409);
  const motivo = motivoNaoEscrever(await getConfigAutomacao(), e.receita, p.data.capacidade);
  if (motivo) return erro(motivo, 423);
  const passo = await passoDaExecucao(id, p.data.chave);
  if (!passo || passo.capacidade !== p.data.capacidade) return erro("Passo desconhecido nesta execução.", 422);
  if (passo.estado === "ok") return erro("Este passo já foi feito.", 409);
  const descricao = textoAlvoAnexo(p.data.alvo).split("|")[4];
  const feito = await escritaRegistrada(p.data.capacidade, p.data.alvo.id, descricao);
  if (feito) return ok({ jaFeito: true, centiDocumento: feito.centiDocumento });
  const esperar = await contarTentativa("automacaoEscrita", String(g.u.id));
  if (esperar > 0) return respostaLimite(esperar);
  const token = novoToken();
  const expiraEm = Math.floor(Date.now() / 1000) + VALIDADE_AUTORIZACAO_S;
  await criarAutorizacao({
    idHash: await hashToken(token),
    execucaoId: id,
    passoChave: p.data.chave,
    capacidade: p.data.capacidade,
    alvoHash: await sha256Hex(textoAlvoAnexo(p.data.alvo)),
    usuarioId: g.u.id,
    expiraEm,
  });
  return ok({ token, expiraEm });
}
