import { getIntegracoes } from "./integracoes";
import { resendConfigurado, URL_SISTEMA_PADRAO } from "./integracoes-core";
import { decifrarSegredo } from "./integracoes-segredos";
import { type ClienteResend, clienteResend } from "./resend-api";

/**
 * O cliente do Resend (server-only): a configuração de Integrações com a chave DECIFRADA + o remetente e o endereço do
 * sistema (para os links). `erro` = por que não dá para enviar agora (desligado, incompleto, sem a chave mestra).
 */
export async function resendDaConfig(): Promise<
  { cliente: ClienteResend; remetente: string; urlSistema: string; verificado: boolean } | { erro: string }
> {
  const integ = await getIntegracoes({ fresco: true });
  if (!resendConfigurado(integ) || !integ.resend) return { erro: "O envio de e-mails (Resend) não está ativo (Administração → Integrações)." };
  const apiKey = await decifrarSegredo(integ.resend.apiKey);
  if (!apiKey) return { erro: "Não foi possível ler a chave do Resend — confira a chave mestra (INTEGRACOES_CHAVE) e salve a chave de novo." };
  return {
    cliente: clienteResend({ apiKey }),
    remetente: integ.resend.remetente,
    urlSistema: (integ.resend.urlSistema || URL_SISTEMA_PADRAO).replace(/\/+$/, ""),
    verificado: integ.resend.verificado,
  };
}
