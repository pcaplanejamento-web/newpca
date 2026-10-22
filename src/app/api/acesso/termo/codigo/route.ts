import { exigirUsuarioLivre } from "@/lib/api-auth";
import { descartarCodigo, emitirCodigo } from "@/lib/codigo-email";
import { REENVIO_CODIGO_S, VALIDADE_CODIGO_MIN } from "@/lib/codigo-email-core";
import { enviarEmailDireto } from "@/lib/email";
import { emailCodigo } from "@/lib/email-core";
import { erro, ok } from "@/lib/http";
import { getIntegracoes } from "@/lib/integracoes";
import { resendConfigurado } from "@/lib/integracoes-core";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** O CÓDIGO para assinar o Termo de Uso — sempre ao e-mail da própria conta (a sessão já prova quem pede). */
export async function POST() {
  const g = await exigirUsuarioLivre();
  if ("erro" in g) return g.erro;
  if (!resendConfigurado(await getIntegracoes())) return erro("O envio de e-mails não está configurado.", 503);
  const espera = await contarTentativa("codigoEmail", g.u.email);
  if (espera) return respostaLimite(espera);
  const r = await emitirCodigo(g.u.email, "termo");
  if ("esperarS" in r) return NextResponse.json({ ok: false, error: `Aguarde ${r.esperarS} s para pedir outro código.`, esperarS: r.esperarS }, { status: 429 });
  const enviado = await enviarEmailDireto([g.u.email], (ctx) => emailCodigo({ codigo: r.codigo, finalidade: "termo", validadeMin: VALIDADE_CODIGO_MIN }, ctx));
  if (!enviado) {
    await descartarCodigo(g.u.email, "termo");
    return erro("Não foi possível enviar o código agora. Tente de novo em instantes.", 502);
  }
  return ok({ reenviarS: REENVIO_CODIGO_S, validadeMin: VALIDADE_CODIGO_MIN, email: g.u.email });
}
