import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { usuarios } from "@/db/schema";
import { getUsuarioAtual } from "@/lib/auth";
import { solicitarCodigoSchema } from "@/lib/auth-validation";
import { DOMINIO_INSTITUCIONAL, emailInstitucional } from "@/lib/cadastro-core";
import { descartarCodigo, emitirCodigo } from "@/lib/codigo-email";
import { REENVIO_CODIGO_S, VALIDADE_CODIGO_MIN } from "@/lib/codigo-email-core";
import { getDb } from "@/lib/db";
import { enviarEmailDireto } from "@/lib/email";
import { emailCodigo } from "@/lib/email-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getIntegracoes } from "@/lib/integracoes";
import { resendConfigurado, turnstileConfigurado } from "@/lib/integracoes-core";
import { verificarTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

/**
 * Envia o CÓDIGO de 6 dígitos ao e-mail — ANTES, o captcha (quando o ADM o ativou). `cadastro` = o e-mail institucional
 * ainda não cadastrado; `senha` = o e-mail da conta (logado: sempre o da sessão; sem sessão, a resposta é a MESMA exista
 * ou não a conta — ninguém descobre e-mails cadastrados por aqui). Reenviar só depois do cronômetro.
 */
export async function POST(req: Request) {
  const corpo = await parseCorpo(solicitarCodigoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { finalidade, token } = corpo.data;

  const integ = await getIntegracoes();
  if (turnstileConfigurado(integ)) {
    const cap = await verificarTurnstile(integ, token, req.headers.get("cf-connecting-ip"));
    if (!cap.ok) return erro(cap.motivo ?? "Falha na verificação anti-robô.", 400);
  }
  if (!resendConfigurado(integ)) return erro("O envio de e-mails não está configurado. Fale com o administrador.", 503);

  const sessao = finalidade === "senha" ? await getUsuarioAtual() : null;
  const email = sessao ? sessao.email : corpo.data.email;
  const pronto = ok({ reenviarS: REENVIO_CODIGO_S, validadeMin: VALIDADE_CODIGO_MIN });

  try {
    const [conta] = await getDb().select({ status: usuarios.status }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
    if (finalidade === "cadastro") {
      if (!emailInstitucional(email)) return erro(`Use o seu e-mail institucional (@${DOMINIO_INSTITUCIONAL}).`, 422);
      if (conta) return erro("Este e-mail já está cadastrado. Entre ou use “Esqueci a senha”.", 409);
    } else if (!conta || conta.status === "inativo") return pronto; // sem revelar: nada é enviado

    const r = await emitirCodigo(email, finalidade);
    if ("esperarS" in r) return NextResponse.json({ ok: false, error: `Aguarde ${r.esperarS} s para pedir outro código.`, esperarS: r.esperarS }, { status: 429 });
    const enviado = await enviarEmailDireto([email], (ctx) => emailCodigo({ codigo: r.codigo, finalidade, validadeMin: VALIDADE_CODIGO_MIN }, ctx));
    if (!enviado) {
      await descartarCodigo(email, finalidade);
      return erro("Não foi possível enviar o código agora. Tente de novo em instantes.", 502);
    }
    return pronto;
  } catch (e) {
    console.error("[codigo] falha:", (e as Error).message);
    return erro("Erro ao enviar o código. Tente novamente.", 500);
  }
}
