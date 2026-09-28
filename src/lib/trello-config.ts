import { getIntegracoes } from "./integracoes";
import { trelloConfigurado } from "./integracoes-core";
import { decifrarSegredo } from "./integracoes-segredos";
import { type ClienteTrello, clienteTrello } from "./trello-api";

/**
 * O cliente do Trello da CONTA INSTITUCIONAL (server-only): a configuração de Integrações com o token DECIFRADO. `erro` =
 * por que não dá para falar com o Trello agora (desligado, incompleto, sem a chave mestra).
 */
export async function trelloDaConfig(): Promise<{ cliente: ClienteTrello; membroId: string; segredo: string | null } | { erro: string }> {
  const integ = await getIntegracoes({ fresco: true });
  if (!trelloConfigurado(integ) || !integ.trello) return { erro: "A integração com o Trello não está ativa (Administração → Integrações)." };
  const token = await decifrarSegredo(integ.trello.token);
  if (!token) return { erro: "Não foi possível ler o token do Trello — confira a chave mestra (INTEGRACOES_CHAVE) e salve o token de novo." };
  const segredo = integ.trello.segredo ? await decifrarSegredo(integ.trello.segredo) : null;
  return { cliente: clienteTrello({ apiKey: integ.trello.apiKey, token }), membroId: integ.trello.membroId, segredo };
}
