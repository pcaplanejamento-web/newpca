import { eq } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { registrarAuditoria } from "@/lib/auditoria";
import { contarUsuarios, criarSessao, definirCookieSessao, hashSenha } from "@/lib/auth";
import { cadastroSchema } from "@/lib/auth-validation";
import { cargoCadastrado, listarCargos } from "@/lib/cargos";
import { consumirCodigo } from "@/lib/codigo-email";
import { MENSAGEM_CODIGO } from "@/lib/codigo-email-core";
import { getDb } from "@/lib/db";
import { emailsDosAdmins, enviarEmailDireto } from "@/lib/email";
import { emailCadastroPendente } from "@/lib/email-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { comandoCadastroPendente, comandoCadastroPrimeiro } from "@/lib/papeis-sql";
import { unidadeDeTrabalhoValida } from "@/lib/reparticoes";
import { depoisDaResposta } from "@/lib/segundo-plano";
import { contarTentativa, ipDe, respostaLimite, verificarCaptcha } from "@/lib/seguranca-acesso";
import { matriculaEmUso, MSG_MATRICULA_EM_USO, violouMatriculaUnica } from "@/lib/usuarios-unicos";

export const dynamic = "force-dynamic";

/**
 * CADASTRO: nome completo, matrícula, telefone de contato (+ WhatsApp), cargo/função, unidade, e-mail institucional e senha — o e-mail é CONFIRMADO pelo código de 6
 * dígitos (enviado por `/api/auth/codigo`, depois do captcha). Só o PRIMEIRO usuário do sistema (vira ADM ativo) entra
 * sem código (com o captcha aqui: ainda não há quem configure o envio de e-mails). Os demais ficam pendentes de aprovação.
 * E-mail e matrícula são ÚNICOS (conferidos antes de gastar o código; a matrícula também por gatilho no banco).
 */
export async function POST(req: Request) {
  const corpo = await parseCorpo(cadastroSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, email, matricula, reparticaoId, telefone, telefoneWhatsapp, senha, codigo, token } = corpo.data;
  const db = getDb();
  const espera = await contarTentativa("cadastroIp", ipDe(req));
  if (espera) return respostaLimite(espera);

  try {
    // Os dados ANTES do código (um erro aqui não gasta o código): a unidade e o cargo/função da lista do ADM — exigido
    // quando há cargos cadastrados (sem nenhum ainda, o campo não aparece).
    if (!(await unidadeDeTrabalhoValida(reparticaoId))) return erro("Selecione uma unidade válida.", 422);
    const [lista, total] = await Promise.all([listarCargos(), contarUsuarios()]);
    const cargo = corpo.data.cargo ? await cargoCadastrado(corpo.data.cargo) : null;
    if (lista.length > 0 && !cargo) return erro("Selecione o seu cargo ou função.", 422);
    const primeiro = total === 0;
    const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
    if (existe) return erro("Este e-mail já está cadastrado. Entre ou use “Esqueci a senha”.", 409);
    if (await matriculaEmUso(matricula)) return erro(MSG_MATRICULA_EM_USO, 409);
    if (primeiro) {
      // Sem o código (ainda não há envio de e-mails): o captcha é conferido AQUI.
      const cap = await verificarCaptcha(req, token);
      if (!cap.ok) return erro(cap.motivo, 400);
    } else {
      if (!codigo) return erro("Informe o código enviado ao seu e-mail.", 422);
      const r = await consumirCodigo(email, "cadastro", codigo);
      if (r !== "ok") return erro(MENSAGEM_CODIGO[r], 422);
    }

    const dados = { nome, email, matricula, cargo, reparticaoId, telefone, telefoneWhatsapp, senhaHash: await hashSenha(senha) };
    // O 1º vira Administrador SÓ se a tabela ainda estiver vazia (no próprio INSERT — dois "primeiros" ao mesmo tempo
    // nunca viram dois ADMs); os demais entram com o papel PADRÃO, pendentes de aprovação.
    const [u] = primeiro ? await comandoCadastroPrimeiro(db, dados) : await comandoCadastroPendente(db, dados);
    if (!u) return erro("Outra pessoa acabou de criar a primeira conta. Recarregue a página e confirme o seu e-mail com o código.", 409);

    await registrarAuditoria({
      usuario: { id: u.id, nome, email },
      acao: "cadastro",
      entidade: "usuario",
      entidadeId: u.id,
      resumo: `${nome} criou uma conta (${u.status === "ativo" ? "ativa" : "pendente de aprovação"})`,
      depois: { nome, email, matricula, cargo, reparticaoId, telefone, telefoneWhatsapp, status: u.status },
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
    // Outra pessoa gravou o mesmo e-mail/matrícula entre a conferência e a gravação (o índice/gatilho recusa).
    if (violouMatriculaUnica(err)) return erro(MSG_MATRICULA_EM_USO, 409);
    console.error("Falha no cadastro:", err);
    return erro("Erro ao criar a conta. Tente novamente.", 500);
  }
}
