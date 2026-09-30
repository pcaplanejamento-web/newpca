import { eq, sql } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { registrarAuditoria } from "@/lib/auditoria";
import { contarUsuarios, criarSessao, definirCookieSessao, hashSenha } from "@/lib/auth";
import { cadastroSchema } from "@/lib/auth-validation";
import { consumirCodigo } from "@/lib/codigo-email";
import { MENSAGEM_CODIGO } from "@/lib/codigo-email-core";
import { getDb } from "@/lib/db";
import { emailsDosAdmins, enviarEmailDireto } from "@/lib/email";
import { emailCadastroPendente } from "@/lib/email-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { unidadeDeTrabalhoValida } from "@/lib/reparticoes";
import { depoisDaResposta } from "@/lib/segundo-plano";

export const dynamic = "force-dynamic";

/**
 * CADASTRO: nome completo, matrícula, cargo/função, unidade, e-mail institucional e senha — o e-mail é CONFIRMADO pelo código de 6
 * dígitos (enviado por `/api/auth/codigo`, depois do captcha). Só o PRIMEIRO usuário do sistema (vira ADM ativo) entra
 * sem código: ainda não há quem configure o envio de e-mails. Os demais ficam pendentes de aprovação.
 */
export async function POST(req: Request) {
  const corpo = await parseCorpo(cadastroSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, email, matricula, cargo, reparticaoId, senha, codigo } = corpo.data;
  const db = getDb();

  try {
    const primeiro = (await contarUsuarios()) === 0;
    if (!primeiro) {
      if (!codigo) return erro("Informe o código enviado ao seu e-mail.", 422);
      const r = await consumirCodigo(email, "cadastro", codigo);
      if (r !== "ok") return erro(MENSAGEM_CODIGO[r], 422);
    }
    if (!(await unidadeDeTrabalhoValida(reparticaoId))) return erro("Selecione uma unidade válida.", 422);
    const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
    if (existe) return erro("Este e-mail já está cadastrado.", 409);

    const [u] = await db
      .insert(usuarios)
      .values({
        nome,
        email,
        matricula,
        cargo,
        reparticaoId,
        senhaHash: await hashSenha(senha),
        role: primeiro ? "admin" : "membro",
        status: primeiro ? "ativo" : "pendente",
        emailVerificadoEm: primeiro ? null : sql`(CURRENT_TIMESTAMP)`,
      })
      .returning({ id: usuarios.id, role: usuarios.role, status: usuarios.status });

    await registrarAuditoria({
      usuario: { id: u.id, nome, email },
      acao: "cadastro",
      entidade: "usuario",
      entidadeId: u.id,
      resumo: `${nome} criou uma conta (${u.status === "ativo" ? "ativa" : "pendente de aprovação"})`,
      depois: { nome, email, matricula, cargo, reparticaoId, role: u.role, status: u.status },
    });

    if (u.status === "ativo") {
      await definirCookieSessao(await criarSessao(u.id));
      return ok({ autenticado: true });
    }
    // Pendente de aprovação — os ADMs recebem o aviso por e-mail (com o Resend ativo; depois da resposta).
    depoisDaResposta(
      emailsDosAdmins().then((admins) => enviarEmailDireto(admins, (ctx) => emailCadastroPendente({ nome, email }, ctx))),
      "email",
    );
    return ok({ autenticado: false, pendente: true });
  } catch (err) {
    console.error("Falha no cadastro:", err);
    return erro("Erro ao criar a conta. Tente novamente.", 500);
  }
}
