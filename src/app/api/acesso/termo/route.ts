import { eq } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { exigirUsuarioLivre } from "@/lib/api-auth";
import { aceitarTermoSchema } from "@/lib/acesso-validation";
import { getAcessoConta } from "@/lib/acesso-conta";
import { regrasValemPara } from "@/lib/acesso-conta-core";
import { registrarAuditoria } from "@/lib/auditoria";
import { verificarSenha } from "@/lib/auth";
import { consumirCodigo } from "@/lib/codigo-email";
import { MENSAGEM_CODIGO } from "@/lib/codigo-email-core";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { contarTentativa, ipDe, respostaLimite } from "@/lib/seguranca-acesso";
import { fraseConfere } from "@/lib/termo-uso-core";
import { aceitarTermo, termoPorId } from "@/lib/termo-uso";
import { aparelhos } from "@/db/schema";
import { getIntegracoes } from "@/lib/integracoes";
import { resendConfigurado } from "@/lib/integracoes-core";
import { SENHA_INUTILIZAVEL } from "@/lib/google-oauth-core";

export const dynamic = "force-dynamic";

/**
 * ASSINAR o termo: a versão e o hash LIDOS têm de ser os vigentes e a identidade é confirmada pela senha, pelo código do
 * e-mail ou — sem nenhum dos dois disponível — pela declaração digitada. O registro guarda o retrato + o selo.
 */
export async function POST(req: Request) {
  const g = await exigirUsuarioLivre();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(aceitarTermoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const d = corpo.data;
  const cfg = await getAcessoConta();
  if (!regrasValemPara(cfg, g.u)) return erro("O Termo de Uso ainda não está em vigor para a sua conta.", 409);
  const t = await termoPorId(d.termoId);
  if (t?.estado !== "publicado") return erro("Esta versão do termo não está mais disponível.", 404);
  if (!t || t.hash !== d.hash) return erro("O termo foi atualizado enquanto você lia — leia de novo a versão atual.", 409);
  const espera = await contarTentativa("aceiteTermo", String(g.u.id));
  if (espera) return respostaLimite(espera);

  const [conta] = await getDb().select({ senhaHash: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, g.u.id)).limit(1);
  const temSenha = !!conta?.senhaHash && conta.senhaHash !== SENHA_INUTILIZAVEL;
  const temCodigo = resendConfigurado(await getIntegracoes());
  if (d.metodo === "senha") {
    if (!temSenha || !d.senha || !(await verificarSenha(d.senha, conta.senhaHash))) return erro("Senha incorreta.", 422);
  } else if (d.metodo === "codigo") {
    if (!d.codigo) return erro("Informe o código enviado ao seu e-mail.", 422);
    const r = await consumirCodigo(g.u.email, "termo", d.codigo);
    if (r !== "ok") return erro(MENSAGEM_CODIGO[r], 422);
  } else {
    // A declaração digitada só vale quando não há senha nem envio de e-mail.
    if (temSenha || temCodigo) return erro("Confirme com a senha ou com o código do e-mail.", 422);
    if (!fraseConfere(d.frase ?? "")) return erro('Digite "LI E CONCORDO" para confirmar.', 422);
  }

  const aparelhoId = g.u.pendencia.aparelhoId;
  const [ap] = aparelhoId ? await getDb().select({ nome: aparelhos.nome }).from(aparelhos).where(eq(aparelhos.id, aparelhoId)).limit(1) : [];
  const r = await aceitarTermo(t, { usuarioId: g.u.id, ip: ipDe(req), userAgent: req.headers.get("user-agent"), aparelhoId, aparelhoNome: ap?.nome ?? "", metodo: d.metodo }, cfg);
  if (!r) return erro("Este termo já foi aceito por você.", 409);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "termo_uso", entidadeId: t.id, resumo: `Termo de Uso versão ${t.versao} aceito (${d.metodo}) — código ${r.codigo}` });
  return ok({ aceiteId: r.id, codigo: r.codigo });
}
