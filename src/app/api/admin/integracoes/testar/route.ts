import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { getMetricasWorker } from "@/lib/cf-analytics";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getIntegracoes, gravarIntegracoes, lerBlobConfiguracoes } from "@/lib/integracoes";
import { contextoEmail } from "@/lib/email";
import { conferirCredenciaisGoogle, googleDaConfig } from "@/lib/google-oauth";
import { mensagemFalhaGoogle, redirectUri } from "@/lib/google-oauth-core";
import { emailTeste } from "@/lib/email-core";
import { coerceIntegracoes, dominioDoRemetente } from "@/lib/integracoes-core";
import { ErroResend } from "@/lib/resend-api";
import { resendDaConfig } from "@/lib/resend-config";
import { trelloDaConfig } from "@/lib/trello-config";
import { testarTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const testarSchema = z.object({ alvo: z.enum(["turnstile", "monitoramento", "trello", "resend", "google"]) });

/** Testa a conexão de uma integração (usa os segredos JÁ configurados); no Trello, confirma e guarda a conta; no Resend, confere o domínio e envia um e-mail de teste. */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(testarSchema, req);
  if ("resp" in corpo) return corpo.resp;

  if (corpo.data.alvo === "trello") {
    // Confirma a CONTA do token e a guarda (a sincronização ignora o eco das ações dela).
    const t = await trelloDaConfig();
    if ("erro" in t) return erro(t.erro, 422);
    try {
      const eu = await t.cliente.eu();
      const integ = coerceIntegracoes((await lerBlobConfiguracoes()).integracoes);
      if (integ.trello) await gravarIntegracoes({ ...integ, trello: { ...integ.trello, membroId: eu.id, usuario: eu.username, nome: eu.fullName } }, g.u.id);
      return ok({ detalhe: `Conectado como ${eu.fullName} (@${eu.username}).${t.segredo ? "" : " Falta o segredo da aplicação para receber os avisos do Trello."}` });
    } catch (e) {
      return erro((e as Error).message, 422);
    }
  }
  if (corpo.data.alvo === "resend") {
    // Confere o DOMÍNIO do remetente no Resend (a chave "só envio" não lista domínios — aí vale o envio) e manda um
    // e-mail de TESTE a quem testou. Enviou = domínio verificado (o Resend recusa remetente de domínio não verificado).
    const r = await resendDaConfig();
    if ("erro" in r) return erro(r.erro, 422);
    const dominio = dominioDoRemetente(r.remetente);
    let situacao = "";
    try {
      const d = (await r.cliente.dominios()).find((x) => x.name.toLowerCase() === dominio);
      if (!d) return erro(`O domínio ${dominio} não está cadastrado no Resend (resend.com → Domínios).`, 422);
      if (d.status !== "verified")
        return erro(`O domínio ${dominio} ainda não está verificado no Resend (situação: ${d.status}). Confira os registros DNS e clique em "reiniciar verificação".`, 422);
      situacao = " Domínio verificado.";
    } catch (e) {
      // 401 da chave restrita ao envio: segue para o teste de envio.
      if (!(e instanceof ErroResend) || e.status !== 401) return erro((e as Error).message, 422);
    }
    const integ = coerceIntegracoes((await lerBlobConfiguracoes()).integracoes);
    try {
      const c = emailTeste(await contextoEmail(r.urlSistema));
      await r.cliente.enviar({ from: r.remetente, to: [g.u.email], subject: c.assunto, html: c.html, text: c.texto });
    } catch (e) {
      if (integ.resend) await gravarIntegracoes({ ...integ, resend: { ...integ.resend, dominio, verificado: false } }, g.u.id);
      return erro((e as Error).message, 422);
    }
    if (integ.resend) await gravarIntegracoes({ ...integ, resend: { ...integ.resend, dominio, verificado: true } }, g.u.id);
    return ok({ detalhe: `E-mail de teste enviado para ${g.u.email}.${situacao}` });
  }
  if (corpo.data.alvo === "google") {
    // Confere o Client ID + Client secret JUNTO AO GOOGLE (troca um código inventado: "invalid_grant" = credenciais certas)
    // com a URI de redirecionamento deste endereço.
    const cfg = await googleDaConfig();
    if ("erro" in cfg) return erro(cfg.erro, 422);
    const uri = redirectUri(new URL(req.url).origin);
    const r = await conferirCredenciaisGoogle({ ...cfg, redirectUri: uri });
    if (!r.ok) return erro(mensagemFalhaGoogle("O Google recusou a configuração.", r.codigo), 422);
    return ok({ detalhe: `Client ID e Client secret aceitos pelo Google. Confira que a URI ${uri} está cadastrada no cliente OAuth e teste o "Entrar com Google".` });
  }
  if (corpo.data.alvo === "turnstile") {
    const integ = await getIntegracoes({ fresco: true });
    const r = await testarTurnstile(integ);
    return r.ok ? ok({ detalhe: r.detalhe }) : erro(r.detalhe, 422);
  }
  // Monitoramento: usa os Worker Secrets CF_ANALYTICS_TOKEN/CF_ACCOUNT_ID.
  const r = await getMetricasWorker();
  return r.disponivel ? ok({ detalhe: "Conexão OK — métricas recebidas." }) : erro(r.motivo, 422);
}
